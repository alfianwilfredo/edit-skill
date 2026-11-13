import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { body, fileUrl, json, klipDir, type Route } from './http.ts'
import { CONTOH_DIR } from './paths.ts'

const VIDEO_EXT = /\.(mp4|mov|m4v)$/i
const FF = '/opt/homebrew/opt/ffmpeg-full/bin'
const env = { ...process.env, PATH: `${existsSync(FF) ? FF + ':' : ''}${process.env.PATH}` }

function jalan(cmd: string, args: string[], timeout = 60_000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { env, timeout, maxBuffer: 4 << 20 }, (err, stdout) => resolve(err ? null : stdout))
  })
}

// Durasi klip via ffprobe, di-cache per path + mtime.
const cacheDurasi = new Map<string, number | null>()
async function durasi(p: string) {
  const key = `${p}:${statSync(p).mtimeMs}`
  if (!cacheDurasi.has(key)) {
    const out = await jalan('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], 15_000)
    const d = Number(out?.trim())
    cacheDurasi.set(key, out && Number.isFinite(d) && d > 0 ? Math.round(d * 100) / 100 : null)
  }
  return cacheDurasi.get(key)!
}

// Thumbnail sekali buat di <folder>/_thumb/<nama>.jpg (lebar 320, frame ~1 detik atau 10% durasi).
async function thumb(folder: string, name: string, d: number | null) {
  const out = path.join(folder, '_thumb', `${name}.jpg`)
  if (existsSync(out)) return out
  mkdirSync(path.dirname(out), { recursive: true })
  const ss = d ? Math.min(1, d * 0.1) : 0
  const r = await jalan('ffmpeg', ['-v', 'error', '-y', '-ss', ss.toFixed(2), '-i', path.join(folder, name),
    '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', out], 30_000)
  return r !== null && existsSync(out) ? out : null
}

// Jalankan fn untuk tiap item, paling banyak `batas` sekaligus.
async function paralel<T, R>(items: T[], batas: number, fn: (x: T) => Promise<R>) {
  const hasil: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(batas, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      hasil[k] = await fn(items[k])
    }
  }))
  return hasil
}

// Klip mentah = video di level atas folder (tanpa subfolder hasil/_edit), urut nama.
const daftarKlip = (folder: string) => readdirSync(folder).filter((f) => VIDEO_EXT.test(f) && !f.startsWith('.')).sort()

const peranFile = (folder: string) => path.join(folder, '_edit', 'klip.json')

function bacaPeran(folder: string) {
  const f = peranFile(folder)
  const kosong = { pembuka: null, penutup: null, jangan: [] as string[] }
  if (!existsSync(f)) return kosong
  try {
    const d = JSON.parse(readFileSync(f, 'utf8'))
    return {
      pembuka: typeof d.pembuka === 'string' ? d.pembuka : null,
      penutup: typeof d.penutup === 'string' ? d.penutup : null,
      jangan: Array.isArray(d.jangan) ? d.jangan.filter((x: unknown) => typeof x === 'string') : [],
    }
  } catch {
    return kosong
  }
}

export const klipRoutes: Record<string, Route> = {
  'GET /klip': async (_req, res, url) => {
    const folder = klipDir(url.searchParams.get('folder'))
    if (!folder || !statSync(folder).isDirectory()) return json(res, 200, { jumlah: 0, klip: [] })
    const names = daftarKlip(folder)
    const klip = await paralel(names, 4, async (name) => {
      const p = path.join(folder, name)
      const d = await durasi(p).catch(() => null)
      const t = await thumb(folder, name, d).catch(() => null)
      return { name, durasi: d, thumb: t ? fileUrl(t) : null, video: fileUrl(p) }
    })
    json(res, 200, { jumlah: names.length, klip })
  },

  // Pilihan klien: klip pembuka, penutup, dan yang tidak boleh dipakai. render.py menegakkan ini.
  'GET /klip/peran': async (_req, res, url) => {
    const folder = klipDir(url.searchParams.get('folder'))
    if (!folder) return json(res, 400, { error: 'Folder klip tidak ditemukan.' })
    json(res, 200, bacaPeran(folder))
  },

  'PUT /klip/peran': async (req, res) => {
    const { folder: raw, pembuka = null, penutup = null, jangan = [] } = JSON.parse((await body(req, 64 << 10)).toString('utf8'))
    const folder = klipDir(raw)
    if (!folder) return json(res, 400, { error: 'Folder klip tidak ditemukan.' })
    const ada = new Set(daftarKlip(folder))
    const nama = (x: unknown) => x === null || (typeof x === 'string' && ada.has(x))
    if (!nama(pembuka) || !nama(penutup)) return json(res, 400, { error: 'Klip pembuka/penutup tidak ada di folder.' })
    if (!Array.isArray(jangan) || !jangan.every((x) => typeof x === 'string' && ada.has(x)))
      return json(res, 400, { error: 'Daftar klip "jangan dipakai" berisi klip yang tidak ada di folder.' })
    if (pembuka !== null && pembuka === penutup) return json(res, 400, { error: 'Klip pembuka dan penutup tidak boleh sama.' })
    if ((pembuka && jangan.includes(pembuka)) || (penutup && jangan.includes(penutup)))
      return json(res, 400, { error: 'Klip pembuka/penutup tidak boleh masuk daftar "jangan dipakai".' })
    mkdirSync(path.join(folder, '_edit'), { recursive: true })
    writeFileSync(peranFile(folder), JSON.stringify({ pembuka, penutup, jangan: [...new Set(jangan)] }, null, 2))
    json(res, 200, { ok: true, hasPlan: existsSync(path.join(folder, '_edit', 'plan.json')) })
  },
}

/** Salin video sumber pattern ke contoh-video/<nama>.mp4. h264 = salin/remux (cepat), selain itu transcode (lambat).
 *  Mengembalikan { cepat, selesai }: selesai resolve true kalau file siap. Tidak pernah throw, sumber tidak dihapus. */
export async function salinVideoContoh(name: string, src: string) {
  const out = path.join(CONTOH_DIR, `${name}.mp4`)
  const codec = (await jalan('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name',
    '-of', 'csv=p=0', src], 15_000))?.trim()
  const h264 = codec === 'h264'
  const kerja = (async () => {
    try {
      mkdirSync(CONTOH_DIR, { recursive: true })
      if (h264 && path.extname(src).toLowerCase() === '.mp4') {
        copyFileSync(src, out)
        return true
      }
      const args = h264
        ? ['-i', src, '-c', 'copy', '-movflags', '+faststart']
        : ['-i', src, '-vf', 'scale=-2:720', '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart']
      const r = await jalan('ffmpeg', ['-v', 'error', '-y', ...args, out], 15 * 60_000)
      if (r !== null && existsSync(out)) return true
      console.error(`[video_contoh] ffmpeg gagal untuk ${src}`)
      rmSync(out, { force: true })
      return false
    } catch (e) {
      console.error(`[video_contoh] gagal menyalin ${src}:`, e)
      return false
    }
  })()
  return { cepat: h264, selesai: kerja }
}

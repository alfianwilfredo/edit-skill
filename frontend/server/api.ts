/* eslint-disable @typescript-eslint/no-explicit-any -- bentuk JSON Anthropic API dan request body dinamis */
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { spawnSync, execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import { MODELS, listVideos, runScript, runTurn, skillPrompt, type Session } from './agent.ts'
import { cliAvailable, runTurnCli } from './cli.ts'
import { CONTOH_DIR, getApiKey, getEngine, setApiKey, SKILL_DIR } from './paths.ts'
import { body, editDir, fileUrl, json, type Route } from './http.ts'
import { klipRoutes, salinVideoContoh } from './klip.ts'
import { trainingRoutes } from './training.ts'
import { batalJob, jobBerjalan, startJob, viewJob, type Jenis, type Tab } from './job.ts'

const sessions = new Map<string, Session>()
const BRAND = path.join(SKILL_DIR, 'brand.json')
const LOGO = path.join(SKILL_DIR, 'brand', 'logo.png')
const LOGO_PUTIH = path.join(SKILL_DIR, 'brand', 'logo-putih.png')
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const refDir = (n: string) => path.join(SKILL_DIR, '_ref', n)
const patFile = (n: string) => path.join(SKILL_DIR, 'patterns', `${n}.json`)
const FONTS = path.join(SKILL_DIR, 'fonts')
const MUSIK = path.join(SKILL_DIR, 'brand', 'musik')
const AUDIO_EXT = /\.(mp3|m4a|wav|aac)$/i
const skillFile = (rel: unknown) => (typeof rel === 'string' && rel && existsSync(path.join(SKILL_DIR, rel)) ? rel : null)

function hasTool(cmd: string, arg = '-version') {
  const ff = '/opt/homebrew/opt/ffmpeg-full/bin'
  const env = { ...process.env, PATH: `${existsSync(ff) ? ff + ':' : ''}${process.env.PATH}` }
  return spawnSync(cmd, [arg], { env }).status === 0
}

// Teks dan logo di video contoh: slot (indeks segmen), gaya, contoh isi. Dipakai mode "Ikuti referensi" di GUI.
function referensi(d: { alur?: { slot?: string }[]; teks?: { slot?: string; gaya?: string; contoh_isi?: unknown }[]; logo_slot?: string }) {
  const slots = (d.alur ?? []).map((a) => a.slot)
  const idx = (s?: string) => (s && slots.includes(s) ? slots.indexOf(s) : 0)
  const contoh = (c: unknown) => String(Array.isArray(c) ? c[0] ?? '' : c ?? '')
  return {
    teks: (d.teks ?? []).map((t) => ({ slot: idx(t.slot), gaya: t.gaya ?? 'judul', contoh: contoh(t.contoh_isi) })),
    logoSlot: d.logo_slot && slots.includes(d.logo_slot) ? slots.indexOf(d.logo_slot) : null,
  }
}

const videoContoh = (f: unknown) => {
  const p = typeof f === 'string' && f ? path.join(CONTOH_DIR, path.basename(f)) : ''
  return p && existsSync(p) ? fileUrl(p) : null
}

function patterns() {
  return readdirSync(path.join(SKILL_DIR, 'patterns'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const d = JSON.parse(readFileSync(path.join(SKILL_DIR, 'patterns', f), 'utf8'))
      return { id: f.replace(/\.json$/, ''), name: d.name ?? f, deskripsi: d.deskripsi ?? '', durasi: d.durasi_total ?? null, slot: (d.alur ?? []).length,
        minKlip: typeof d.min_klip === 'number' ? d.min_klip : null, idealKlip: Array.isArray(d.ideal_klip) ? d.ideal_klip : null,
        audioPanduan: skillFile(d.audio_panduan), audioUrl: skillFile(d.audio_panduan) ? fileUrl(path.join(SKILL_DIR, d.audio_panduan)) : null,
        sinkron: d.sinkron === '2beat' ? '2beat' : 'beat', video: videoContoh(d.video_contoh), ...referensi(d) }
    })
}

const routes: Record<string, Route> = {
  ...klipRoutes,
  ...trainingRoutes,

  'GET /status': async (_req, res) => {
    json(res, 200, {
      ffmpeg: hasTool('ffmpeg'),
      python: hasTool('python3', '--version'),
      engine: getEngine(),
      key: getEngine() === 'cli' ? cliAvailable() : !!getApiKey(),
      logo: existsSync(LOGO) ? fileUrl(LOGO) : null,
      logoPutih: existsSync(LOGO_PUTIH) ? fileUrl(LOGO_PUTIH) : null,
      models: MODELS,
      patterns: patterns(),
    })
  },

  // Data studio tetap (read-only di GUI).
  'GET /brand': async (_req, res) => json(res, 200, JSON.parse(readFileSync(BRAND, 'utf8'))),

  'POST /key': async (req, res) => {
    const { key } = JSON.parse((await body(req, 4 << 10)).toString('utf8'))
    if (typeof key !== 'string' || !key.startsWith('sk-ant-')) return json(res, 400, { error: 'Key harus diawali sk-ant-' })
    setApiKey(key.trim())
    json(res, 200, { ok: true })
  },

  'POST /pick-folder': async (_req, res) => {
    const script = 'POSIX path of (choose folder with prompt "Pilih folder klip mentah")'
    execFile('osascript', ['-e', script], (err, stdout) => {
      if (err) return json(res, 200, { path: null })
      json(res, 200, { path: stdout.trim().replace(/\/$/, '') })
    })
  },

  'GET /videos': async (_req, res, url) => {
    const folder = url.searchParams.get('folder') ?? ''
    json(res, 200, listVideos(folder).map((v) => ({ name: v.name, path: v.path, mtime: v.mtime })))
  },

  'GET /file': async (req, res, url) => {
    const p = path.resolve(url.searchParams.get('p') ?? '')
    const ext = path.extname(p).toLowerCase()
    const types: Record<string, string> = {
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.otf': 'font/otf',
      '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac',
    }
    if (!types[ext] || !existsSync(p) || !p.startsWith(process.env.HOME ?? '/')) return json(res, 404, { error: 'tidak ada' })
    const size = statSync(p).size
    res.setHeader('content-type', types[ext])
    res.setHeader('accept-ranges', 'bytes')
    // Range dibutuhkan <audio>/<video> untuk seek.
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
      const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
      if (start > end || start >= size) {
        res.statusCode = 416
        res.setHeader('content-range', `bytes */${size}`)
        res.end()
        return
      }
      res.statusCode = 206
      res.setHeader('content-range', `bytes ${start}-${end}/${size}`)
      res.setHeader('content-length', end - start + 1)
      createReadStream(p, { start, end }).pipe(res)
      return
    }
    res.setHeader('content-length', size)
    createReadStream(p).pipe(res)
  },

  // Library musik studio (brand/musik/). file = path relatif folder skill, dipakai di overlay.json.
  'GET /musik': async (_req, res) => {
    if (!existsSync(MUSIK)) return json(res, 200, [])
    json(res, 200, readdirSync(MUSIK).filter((f) => AUDIO_EXT.test(f) && !f.startsWith('.')).sort()
      .map((f) => ({ file: `brand/musik/${f}`, name: f.replace(AUDIO_EXT, '').replace(/[-_]+/g, ' '), url: fileUrl(path.join(MUSIK, f)) })))
  },

  'POST /musik/upload': async (req, res, url) => {
    const raw = path.basename(url.searchParams.get('name') ?? '')
    const ext = path.extname(raw).toLowerCase()
    if (!AUDIO_EXT.test(ext)) return json(res, 400, { error: 'Format audio harus mp3, m4a, wav, atau aac.' })
    const stem = raw.slice(0, -ext.length).normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'musik'
    const data = await body(req, 40 << 20)
    if (!data.length) return json(res, 400, { error: 'File kosong.' })
    mkdirSync(MUSIK, { recursive: true })
    let f = `${stem}${ext}`
    for (let i = 2; existsSync(path.join(MUSIK, f)); i++) f = `${stem}-${i}${ext}`
    writeFileSync(path.join(MUSIK, f), data)
    json(res, 200, { file: `brand/musik/${f}`, name: f.replace(AUDIO_EXT, '').replace(/[-_]+/g, ' '), url: fileUrl(path.join(MUSIK, f)) })
  },

  'POST /pick-file': async (_req, res) => {
    const script = 'POSIX path of (choose file with prompt "Pilih video contoh" of type {"public.movie"})'
    execFile('osascript', ['-e', script], (err, stdout) => {
      if (err) return json(res, 200, { path: null })
      json(res, 200, { path: stdout.trim() })
    })
  },

  'POST /ref/analyze': async (req, res) => {
    const { video, name } = JSON.parse((await body(req, 4 << 10)).toString('utf8'))
    if (!SLUG.test(name)) return json(res, 400, { error: 'Nama hanya huruf kecil, angka, dan tanda - (contoh: rumah-tropis).' })
    if (typeof video !== 'string' || !video.startsWith(process.env.HOME ?? '/') || !existsSync(video))
      return json(res, 400, { error: 'Video contoh tidak ditemukan.' })
    if (existsSync(patFile(name))) return json(res, 409, { error: 'Nama pattern sudah dipakai. Pilih nama lain.' })
    const r = await runScript('analyze_ref.py', [video, '--name', name, '--out', refDir(name)])
    if (!r.startsWith('exit 0')) return json(res, 422, { error: 'Analisis video gagal. Coba video lain.', log: r })
    // Path video sumber, disalin ke contoh-video/ saat pattern disimpan.
    writeFileSync(path.join(refDir(name), 'video.txt'), video)
    json(res, 200, { dir: refDir(name), log: r })
  },

  'GET /ref/draft': async (_req, res, url) => {
    const name = url.searchParams.get('name') ?? ''
    if (!SLUG.test(name)) return json(res, 400, { error: 'nama tidak valid' })
    const dir = refDir(name)
    const draft = path.join(dir, 'draft.json')
    if (!existsSync(draft)) return json(res, 404, { error: 'Draft belum ada. Analisis video dulu.' })
    const shots = path.join(dir, 'shots.jpg')
    const cuts = path.join(dir, 'cuts.jpg')
    json(res, 200, {
      dir,
      draft: readFileSync(draft, 'utf8'),
      shots: existsSync(shots) ? fileUrl(shots) : null,
      cuts: existsSync(cuts) ? fileUrl(cuts) : null,
    })
  },

  'PUT /pattern': async (req, res) => {
    const { name, content } = JSON.parse((await body(req, 1 << 20)).toString('utf8'))
    if (!SLUG.test(name)) return json(res, 400, { error: 'Nama tidak valid.' })
    if (existsSync(patFile(name))) return json(res, 409, { error: 'Nama pattern sudah dipakai.' })
    if (!content || typeof content !== 'object') return json(res, 400, { error: 'Isi pattern tidak valid.' })
    const { min_klip_saran_otomatis: _saran, ...bersih } = content // eslint-disable-line @typescript-eslint/no-unused-vars
    // Audio panduan dari analisis video contoh (_ref/<nama>/audio.m4a) disalin ke patterns/audio/.
    const audioRef = path.join(refDir(name), 'audio.m4a')
    if (existsSync(audioRef)) {
      mkdirSync(path.join(SKILL_DIR, 'patterns', 'audio'), { recursive: true })
      copyFileSync(audioRef, path.join(SKILL_DIR, 'patterns', 'audio', `${name}.m4a`))
      bersih.audio_panduan = `patterns/audio/${name}.m4a`
    }
    delete bersih.video_contoh
    writeFileSync(patFile(name), JSON.stringify({ ...bersih, name }, null, 2))
    // Video contoh disalin ke contoh-video/<nama>.mp4. Gagal salin tidak menggagalkan simpan pattern.
    const vt = path.join(refDir(name), 'video.txt')
    const src = existsSync(vt) ? readFileSync(vt, 'utf8').trim() : ''
    if (!src || !existsSync(src)) return json(res, 200, { ok: true, videoContoh: null })
    const { cepat, selesai } = await salinVideoContoh(name, src)
    // Field video_contoh ditulis setelah file siap. Transcode (bukan h264) jalan di background.
    const tulis = selesai.then((ok) => {
      if (!ok || !existsSync(patFile(name))) return false
      const d = JSON.parse(readFileSync(patFile(name), 'utf8'))
      writeFileSync(patFile(name), JSON.stringify({ ...d, video_contoh: `${name}.mp4` }, null, 2))
      return true
    }).catch((e) => (console.error('[video_contoh]', e), false))
    json(res, 200, { ok: true, videoContoh: cepat ? ((await tulis) ? 'siap' : null) : 'diproses' })
  },

  // Teks dan logo statis dari GUI. render.py membaca <folder>/_edit/overlay.json dan menimpa teks/logo plan.
  'GET /overlay': async (_req, res, url) => {
    const dir = editDir(url.searchParams.get('folder'))
    if (!dir) return json(res, 400, { error: 'Folder klip tidak ditemukan.' })
    const f = path.join(dir, 'overlay.json')
    json(res, 200, {
      overlay: existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null,
      hasPlan: existsSync(path.join(dir, 'plan.json')),
    })
  },

  'PUT /overlay': async (req, res) => {
    const { folder, overlay } = JSON.parse((await body(req, 1 << 20)).toString('utf8'))
    const dir = editDir(folder)
    if (!dir) return json(res, 400, { error: 'Folder klip tidak ditemukan.' })
    if (!overlay || typeof overlay !== 'object' || !Array.isArray(overlay.teks))
      return json(res, 400, { error: 'Isi overlay tidak valid.' })
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'overlay.json'), JSON.stringify(overlay, null, 2))
    json(res, 200, { ok: true })
  },

  // Font di fonts/ + keterangan dari fonts/fonts.json (urutan dan kategori). Font tanpa keterangan masuk "Lainnya".
  'GET /fonts': async (_req, res) => {
    const files = existsSync(FONTS) ? readdirSync(FONTS).filter((f) => /\.(ttf|otf)$/i.test(f)) : []
    const metaPath = path.join(FONTS, 'fonts.json')
    const meta: { file: string; nama: string; kategori: string; ciri: string; cocok: string }[] =
      existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : []
    const byFile = new Map(meta.map((m) => [m.file, m]))
    const ordered = [...meta.map((m) => m.file).filter((f) => files.includes(f)), ...files.filter((f) => !byFile.has(f)).sort()]
    json(res, 200, ordered.map((f) => {
      const m = byFile.get(f)
      return {
        file: f,
        name: m?.nama ?? f.replace(/\.(ttf|otf)$/i, '').replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'),
        kategori: m?.kategori ?? 'Lainnya',
        ciri: m?.ciri ?? '',
        cocok: m?.cocok ?? '',
        url: fileUrl(path.join(FONTS, f)),
      }
    }))
  },

  // Render ulang plan terakhir tanpa asisten: preview dulu, lalu final. Jalan di background (job 'render').
  'POST /render-overlay': async (req, res) => {
    const { folder } = JSON.parse((await body(req, 4 << 10)).toString('utf8'))
    const dir = editDir(folder)
    if (!dir) return json(res, 400, { error: 'Folder klip tidak ditemukan.' })
    const plan = path.join(dir, 'plan.json')
    if (!existsSync(plan)) return json(res, 404, { error: 'Belum ada plan. Tekan Mulai edit dulu.' })
    const jobId = startJob('render', 'edit', async (ctx) => {
      const gagal = { ok: false, error: 'Pembuatan video gagal. Buka Detail untuk melihat catatan teknis.' }
      if (!(await runScript('render.py', [plan, '--preview'], ctx)).startsWith('exit 0')) return gagal
      if (!(await runScript('render.py', [plan], ctx)).startsWith('exit 0')) return gagal
      return { ok: true }
    })
    if (!jobId) return json(res, 409, { error: 'Masih ada proses berjalan.' })
    json(res, 202, { jobId })
  },

  // Satu giliran asisten di background. Kemajuan dibaca lewat GET /api/progres.
  'POST /chat': async (req, res) => {
    const { sessionId, message, folder, model, tab, jenis } = JSON.parse((await body(req, 1 << 20)).toString('utf8'))
    if (!MODELS.includes(model)) return json(res, 400, { error: 'model tidak dikenal' })
    if (folder && !existsSync(folder)) return json(res, 400, { error: 'Folder klip tidak ditemukan.' })
    if (jobBerjalan()) return json(res, 409, { error: 'Masih ada proses berjalan.' })
    if (!sessions.has(sessionId)) sessions.set(sessionId, { messages: [], folder: folder || '' })
    const session = sessions.get(sessionId)!
    session.folder = folder || ''
    const j: Jenis = jenis === 'edit' || jenis === 'render' ? jenis : 'chat'
    const t: Tab = tab === 'ref' || tab === 'training' ? tab : 'edit'
    // Pesan chat biasa setelah hasil ada = revisi: asisten wajib tanya dulu lewat kartu pilihan (SKILL.md "Alur: revisi").
    const revisi = t === 'edit' && j === 'chat' && !!session.folder && existsSync(path.join(session.folder, '_edit', 'plan.json'))
    // Tab Training gaya: uji ulang pattern terhadap video contohnya (SKILL.md "Alur: training gaya").
    const msg = revisi ? `${String(message)}\n\n[mode revisi: ikuti "Alur: revisi setelah hasil" di SKILL.md]`
      : t === 'training' ? `${String(message)}\n\n[mode training: ikuti "Alur: training gaya" di SKILL.md]` : String(message)
    const jobId = startJob(j, t, (ctx) => getEngine() === 'cli'
      ? runTurnCli(session, sessionId, model, msg, skillPrompt(session.folder, true), ctx)
      : runTurn(session, model, msg, ctx))
    if (!jobId) return json(res, 409, { error: 'Masih ada proses berjalan.' })
    json(res, 202, { jobId })
  },

  // Job terakhir (berjalan atau sudah selesai). sejak = jumlah event yang sudah diterima GUI.
  'GET /progres': async (_req, res, url) => json(res, 200, { job: viewJob(Number(url.searchParams.get('sejak') ?? 0)) }),

  'POST /batal': async (_req, res) => json(res, 200, { ok: batalJob() }),
}

export function skillApi(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://local')
    if (!url.pathname.startsWith('/api/')) return next()
    const route = routes[`${req.method} ${url.pathname.slice(4)}`]
    if (!route) return json(res, 404, { error: 'rute tidak ada' })
    try {
      await route(req, res, url)
    } catch (e: any) {
      json(res, 500, { error: String(e?.message ?? e) })
    }
  }
  return {
    name: 'skill-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Event } from './agent.ts'

// Satu proses berjalan per server: chat asisten, atau render ulang tanpa asisten.
// Script Python menulis kemajuan ke PROGRES_FILE (JSON), server membacanya dan menghitung persen total.

type TahapStatus = 'belum' | 'jalan' | 'selesai' | 'cache' | 'gagal'
type Tahap = { id: string; nama: string; bobot: number; status: TahapStatus }
type JobStatus = 'jalan' | 'selesai' | 'gagal' | 'batal'
export type Jenis = 'edit' | 'render' | 'chat'
export type Tab = 'edit' | 'ref'

// Dioper ke runScript / runTurn / runTurnCli: env berisi PROGRES_FILE, signal untuk batal.
export type JobCtx = {
  env: Record<string, string>
  signal: AbortSignal
  event(e: Event): void
  log(s: string): void
  track(c: ChildProcess): void
}

type Progres = { tahap?: string; persen?: number; pesan?: string; cache?: boolean; gagal?: boolean; saran?: string | null; ts?: number }

const NAMA: Record<string, string> = {
  scan: 'Melihat semua klip', review: 'Meninjau kualitas klip', plan: 'Menyusun urutan cerita',
  stabil: 'Menstabilkan video goyang', preview: 'Membuat preview', cek: 'Memeriksa hasil',
  final: 'Membuat video final', analisis: 'Menganalisis video contoh',
}
const TEMPLATE: Record<Jenis, [string, number][]> = {
  edit: [['scan', 10], ['review', 15], ['plan', 10], ['stabil', 20], ['preview', 15], ['cek', 5], ['final', 25]],
  render: [['stabil', 20], ['preview', 30], ['final', 50]],
  chat: [],
}
// Tahap milik asisten (bukan script): tidak pernah dilaporkan lewat PROGRES_FILE.
const AGENT_TAHAP = new Set(['plan', 'cek'])
const LOG_MAX = 4000

type Job = {
  id: string; jenis: Jenis; tab: Tab; status: JobStatus
  tahap: Tahap[]; events: Event[]; log: string
  error: string | null; saran: string | null; mulai: number; selesai: number | null
  file: string; cur: Progres | null; lastTs: number | null
  aktivitas: string; gambar: number
  abort: AbortController; kids: Set<ChildProcess>; berjalan: boolean; timer: ReturnType<typeof setInterval> | null
}

let job: Job | null = null

// Bunuh seluruh process group (child di-spawn dengan detached: true, jadi pid = pgid).
export function killGroup(c: ChildProcess, sig: NodeJS.Signals = 'SIGTERM') {
  if (!c.pid) return
  try { process.kill(-c.pid, sig) } catch { /* sudah mati */ }
}

export const jobBerjalan = () => !!job?.berjalan

// Mulai job baru di background. Return null bila masih ada job berjalan.
export function startJob(jenis: Jenis, tab: Tab, run: (ctx: JobCtx) => Promise<{ ok: boolean; error?: string }>) {
  if (job?.berjalan) return null
  if (job) rmSync(job.file, { force: true })
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const file = path.join(os.tmpdir(), `reel-progres-${id}.json`)
  rmSync(file, { force: true })
  const j: Job = {
    id, jenis, tab, status: 'jalan',
    tahap: TEMPLATE[jenis].map(([tid, bobot]) => ({ id: tid, nama: NAMA[tid], bobot, status: 'belum' })),
    events: [], log: '', error: null, saran: null, mulai: Date.now(), selesai: null,
    file, cur: null, lastTs: null, aktivitas: 'Asisten sedang berpikir…', gambar: 0,
    abort: new AbortController(), kids: new Set(), berjalan: true, timer: null,
  }
  job = j
  j.timer = setInterval(() => bacaProgres(j), 500)
  const ctx: JobCtx = {
    env: { PROGRES_FILE: file },
    signal: j.abort.signal,
    event: (e) => {
      if (j.status !== 'jalan') return
      j.events.push(e)
      j.aktivitas = aktivitasDari(j, e)
    },
    log: (s) => {
      j.log = (j.log + s).slice(-LOG_MAX)
    },
    track: (c) => {
      j.kids.add(c)
      c.on('close', () => j.kids.delete(c))
    },
  }
  run(ctx)
    .catch((e) => ({ ok: false, error: String(e?.message ?? e) }))
    .then((r) => akhiri(j, r))
  return id
}

function akhiri(j: Job, r: { ok: boolean; error?: string }) {
  j.berjalan = false
  if (j.timer) clearInterval(j.timer)
  if (j.status !== 'jalan') return // sudah dibatalkan
  bacaProgres(j)
  const gagalTahap = j.tahap.find((t) => t.status === 'gagal')
  if (!r.ok || gagalTahap) {
    j.status = 'gagal'
    j.error ??= r.error || 'Proses berhenti karena ada masalah. Buka Detail untuk melihat catatan teknis.'
    j.tahap.forEach((t) => { if (t.status === 'jalan') t.status = 'gagal' })
  } else {
    j.status = 'selesai'
    // Tahap 'belum' dibiarkan: asisten mungkin berhenti untuk bertanya ke klien.
    j.tahap.forEach((t) => { if (t.status === 'jalan') t.status = 'selesai' })
  }
  j.selesai = Date.now()
}

export function batalJob() {
  const j = job
  if (!j || j.status !== 'jalan') return false
  j.status = 'batal'
  j.selesai = Date.now()
  j.events.push({ kind: 'text', text: 'Dibatalkan oleh pengguna.' })
  j.tahap.forEach((t) => { if (t.status === 'jalan') t.status = 'belum' })
  j.abort.abort()
  const kids = [...j.kids]
  kids.forEach((c) => killGroup(c, 'SIGTERM'))
  setTimeout(() => kids.forEach((c) => killGroup(c, 'SIGKILL')), 3000)
  return true
}

function aktivitasDari(j: Job, e: Event) {
  if (e.kind === 'text') return 'Asisten sedang berpikir…'
  const t = e.text
  if (/\.(jpe?g|png)\b/i.test(t)) return `Asisten melihat gambar ke-${++j.gambar}`
  if (/plan\.json/.test(t) && /^(write_file|Write|Edit)\b/.test(t)) return 'Asisten menulis rencana edit'
  if (/\.py\b/.test(t)) return 'Asisten menjalankan proses'
  if (/^(read_file|Read|list_dir|Glob|Grep)\b/.test(t)) return 'Asisten membaca catatan'
  return 'Asisten sedang bekerja…'
}

// Baca PROGRES_FILE dan perbarui status tahap. Hanya diproses bila ts berubah.
function bacaProgres(j: Job) {
  if (!existsSync(j.file)) return
  let p: Progres
  try { p = JSON.parse(readFileSync(j.file, 'utf8')) } catch { return } // file sedang ditulis
  if (!p.tahap || p.ts === j.lastTs) return
  j.lastTs = p.ts ?? null
  j.cur = p
  let idx = j.tahap.findIndex((t) => t.id === p.tahap)
  if (idx < 0) {
    if (j.jenis !== 'chat') return // tahap di luar template: pesan tetap tampil, checklist tidak berubah
    j.tahap.push({ id: p.tahap, nama: NAMA[p.tahap] ?? p.tahap, bobot: 1, status: 'belum' })
    idx = j.tahap.length - 1
  }
  const t = j.tahap[idx]
  // render.py final menjalankan fase stabil lagi (dari cache) setelah preview selesai: itu langkah awal
  // tahap berikutnya, bukan stabil ulang. Status jangan diubah, supaya bobot dan persen tidak melompat.
  if (p.tahap === 'stabil' && !p.gagal && j.tahap.slice(idx + 1).some((x) => x.status === 'selesai')) return
  // Tahap mulai: tahap sebelumnya yang masih 'belum' dilewati (cache), tahap asisten dianggap selesai.
  j.tahap.forEach((x, i) => {
    if (i < idx && x.status === 'jalan') x.status = 'selesai'
    if (i < idx && x.status === 'belum') x.status = AGENT_TAHAP.has(x.id) ? 'selesai' : 'cache'
    if (i > idx && x.status === 'jalan') x.status = 'belum' // tahap diulang (mis. render preview lagi)
  })
  if (p.gagal) {
    t.status = 'gagal'
    j.error = p.pesan || 'Proses gagal.'
    j.saran = p.saran ?? null
    return
  }
  // Asisten memperbaiki lalu menjalankan lagi: gagal sebelumnya dihapus.
  j.error = null
  j.saran = null
  j.tahap.forEach((x) => { if (x.status === 'gagal') x.status = 'belum' })
  const persen = Number(p.persen ?? 0)
  if (p.cache) t.status = 'cache'
  else if (persen >= 100) t.status = 'selesai'
  else t.status = 'jalan'
  // Script selesai: tahap asisten berikutnya (plan / cek) mulai jalan.
  const next = j.tahap[idx + 1]
  if (t.status !== 'jalan' && next && AGENT_TAHAP.has(next.id) && next.status === 'belum') next.status = 'jalan'
}

function totalPersen(j: Job): number | null {
  const jalan = j.tahap.find((t) => t.status === 'jalan')
  const curPersen = (t: Tahap | undefined) => (t && j.cur?.tahap === t.id ? Math.min(100, Number(j.cur.persen ?? 0)) : 0)
  if (j.jenis === 'chat') {
    if (!j.tahap.length) return null
    return Math.round(jalan ? curPersen(jalan) : j.tahap.at(-1)!.status === 'belum' ? 0 : 100)
  }
  if (j.tahap.every((t) => t.status === 'belum')) return null
  const isi = j.tahap.filter((t) => t.status !== 'cache')
  const total = isi.reduce((s, t) => s + t.bobot, 0)
  if (!total) return 100
  const selesai = isi.filter((t) => t.status === 'selesai').reduce((s, t) => s + t.bobot, 0)
  const aktif = jalan ? (jalan.bobot * curPersen(jalan)) / 100 : 0
  return Math.min(100, Math.round(((selesai + aktif) / total) * 100))
}

function pesanSekarang(j: Job, scriptJalan: boolean) {
  if (j.status === 'selesai') return 'Selesai'
  if (j.status === 'batal') return 'Dibatalkan'
  if (j.status === 'gagal') return j.error ?? 'Proses gagal.'
  if (j.error) return j.error
  if (scriptJalan && j.cur?.pesan) return j.cur.pesan
  const jalan = j.tahap.find((t) => t.status === 'jalan')
  if (jalan) return jalan.nama
  return j.aktivitas
}

export function viewJob(sejak: number) {
  const j = job
  if (!j) return null
  if (j.status === 'jalan') bacaProgres(j)
  const persen = totalPersen(j)
  const curT = j.tahap.find((t) => t.id === j.cur?.tahap)
  const scriptJalan = j.status === 'jalan' && (curT ? curT.status === 'jalan' : !!j.cur && Number(j.cur.persen ?? 0) < 100)
  const now = j.selesai ?? Date.now()
  const elapsed = (now - j.mulai) / 1000
  const n = Math.max(0, Math.floor(sejak) || 0)
  return {
    id: j.id,
    jenis: j.jenis,
    tab: j.tab,
    status: j.status,
    persen,
    pesan: pesanSekarang(j, scriptJalan),
    aktivitas: j.status === 'jalan' && !scriptJalan ? j.aktivitas : null,
    eta_detik: j.status === 'jalan' && persen !== null && persen >= 10 && persen < 100 ? Math.round((elapsed * (100 - persen)) / persen) : null,
    tahap: j.tahap.map((t) => ({ ...t })),
    events: j.events.slice(n),
    n_events: j.events.length,
    log: j.log,
    error: j.status === 'gagal' ? j.error : null,
    saran: j.status === 'gagal' ? j.saran : null,
    mulai: j.mulai,
    selesai: j.selesai,
  }
}

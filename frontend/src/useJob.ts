import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Tab } from './Header'

export type TahapStatus = 'belum' | 'jalan' | 'selesai' | 'cache' | 'gagal'
export type Tahap = { id: string; nama: string; bobot: number; status: TahapStatus }
export type JobStatus = 'jalan' | 'selesai' | 'gagal' | 'batal'
export type JobEvent = { kind: 'text' | 'tool'; text: string }
export type JobView = {
  id: string
  jenis: 'edit' | 'render' | 'chat'
  tab: Tab
  status: JobStatus
  persen: number | null
  pesan: string
  aktivitas: string | null
  eta_detik: number | null
  tahap: Tahap[]
  events: JobEvent[]
  n_events: number
  log: string
  error: string | null
  saran: string | null
  mulai: number
  selesai: number | null
}

type Opsi = { onEvents: (tab: Tab, ev: JobEvent[]) => void; onEnd: (job: JobView) => void }

const JEDA = 1000
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

// Pantau proses latar (edit/render/chat) lewat GET /api/progres. Event baru diteruskan ke chat tab job.
export function useJob({ onEvents, onEnd }: Opsi) {
  const [job, setJob] = useState<JobView | null>(null)
  const sejakRef = useRef(0)
  const idRef = useRef<string | null>(null)
  const statusRef = useRef<JobStatus | null>(null)
  const cb = useRef({ onEvents, onEnd })
  useEffect(() => { cb.current = { onEvents, onEnd } })

  const ambil = useCallback(async (signal: AbortSignal, awal = false): Promise<void> => {
    const tanya = () => api<{ job: JobView | null }>(`/api/progres?sejak=${sejakRef.current}`, { signal }).then((r) => r.job)
    let j = await tanya()
    // Job lain dari yang dikira (mis. dimulai dari tab lain): baca ulang semua event-nya.
    if (j && j.id !== idRef.current && sejakRef.current) { sejakRef.current = 0; j = await tanya() }
    if (!j) { if (!awal) { statusRef.current = null; setJob(null) } return }
    idRef.current = j.id
    sejakRef.current = j.n_events
    if (j.events.length) cb.current.onEvents(j.tab, j.events)
    const tadi = statusRef.current
    statusRef.current = j.status
    setJob(j)
    if (!awal && tadi === 'jalan' && j.status !== 'jalan') cb.current.onEnd(j)
  }, [])

  // Saat halaman dibuka/di-refresh: tampilkan job yang sedang/terakhir berjalan.
  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => { ambil(ac.signal, true).catch(() => {}) }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [ambil])

  // Poll tiap detik selama job jalan; tiap respons memicu jadwal berikutnya.
  useEffect(() => {
    if (job?.status !== 'jalan') return
    const ac = new AbortController()
    const t = setTimeout(() => {
      ambil(ac.signal).catch((e) => { if (!isAbort(e)) setJob((j) => (j ? { ...j } : j)) }) // gagal jaringan: coba lagi
    }, JEDA)
    return () => { clearTimeout(t); ac.abort() }
  }, [job, ambil])

  // Placeholder sampai poll pertama, supaya tombol langsung terkunci.
  const start = useCallback((jobId: string, tab: Tab, jenis: JobView['jenis']) => {
    idRef.current = jobId
    sejakRef.current = 0
    statusRef.current = 'jalan'
    setJob({
      id: jobId, jenis, tab, status: 'jalan', persen: null, pesan: 'Memulai…', aktivitas: null, eta_detik: null,
      tahap: [], events: [], n_events: 0, log: '', error: null, saran: null, mulai: Date.now(), selesai: null,
    })
  }, [])

  const batal = useCallback(async () => {
    await api('/api/batal', { method: 'POST' })
    setJob((j) => (j ? { ...j } : j)) // poll segera
  }, [])

  useJudul(job)
  return { job, start, batal }
}

// Judul tab browser: persen saat jalan, "✓ Selesai" sebentar setelah job selesai.
function useJudul(job: JobView | null) {
  const asli = useRef(document.title)
  const status = job?.status
  const persen = job?.persen
  const lalu = useRef(status)
  useEffect(() => {
    const sebelum = lalu.current
    lalu.current = status
    if (status === 'jalan') {
      document.title = persen == null ? 'Mengedit…' : `${persen}% · Mengedit…`
      return
    }
    if (sebelum !== 'jalan') { document.title = asli.current; return }
    document.title = `${status === 'selesai' ? '✓ Selesai' : status === 'gagal' ? '✕ Gagal' : 'Dibatalkan'} · ${asli.current}`
    const pulih = () => { document.title = asli.current }
    const t = setTimeout(pulih, 10000)
    window.addEventListener('pointerdown', pulih, { once: true })
    window.addEventListener('keydown', pulih, { once: true })
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', pulih); window.removeEventListener('keydown', pulih) }
  }, [status, persen])
}

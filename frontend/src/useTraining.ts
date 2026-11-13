import { useEffect, useState } from 'react'
import { api } from './api'
import type { Mode } from './useReferensi'
import { load, msgOf, save } from './util'

export type Cek = { nama: string; contoh: string; hasil: string; lolos: boolean | null; catatan: string }
export type Laporan = { pattern: string; mode: Mode; putaran: number; lolos: boolean; cek: Cek[]; ringkasan: string }
export type TrainingData = { ref: string | null; laporan: Laporan | null; video: string | null; banding: string | null }
type Pola = { id: string; name: string }

// Cache-buster: render baru menimpa file yang sama, jadi URL harus berubah tiap muat ulang.
const segar = (u: string | null, v: number) => (u ? `${u}${u.includes('?') ? '&' : '?'}v=${v}` : null)

// State tab Training gaya: pattern & mode pilihan, plus hasil GET /api/training (dibatalkan saat folder/pattern berganti).
export function useTraining<P extends Pola>(folder: string, patterns: P[], patternId: string) {
  const [pilih, setPilih] = useState(load('ir_train_pattern', ''))
  const [mode, setModeRaw] = useState<Mode>(load('ir_train_mode', 'ikuti') === 'custom' ? 'custom' : 'ikuti')
  const [data, setData] = useState<TrainingData | null>(null)
  const [error, setError] = useState('')
  const [n, setN] = useState(0)
  const pattern = patterns.find((p) => p.id === pilih) ?? patterns.find((p) => p.id === patternId) ?? patterns[0]
  const pid = pattern?.id ?? ''

  useEffect(() => {
    if (!folder || !pid) return
    const ac = new AbortController()
    api<TrainingData>(`/api/training?folder=${encodeURIComponent(folder)}&pattern=${encodeURIComponent(pid)}`, { signal: ac.signal })
      .then((d) => { const v = Date.now(); setError(''); setData({ ...d, video: segar(d.video, v), banding: segar(d.banding, v) }) })
      .catch((e) => { if (!ac.signal.aborted) { setData(null); setError(msgOf(e)) } })
    return () => ac.abort()
  }, [folder, pid, n])

  const setPattern = (id: string) => { setPilih(id); save('ir_train_pattern', id) }
  const setMode = (m: Mode) => { setModeRaw(m); save('ir_train_mode', m) }
  const kosong = !folder || !pid
  return { pattern, setPattern, mode, setMode, data: kosong ? null : data, error: kosong ? '' : error, reload: () => setN((x) => x + 1) }
}

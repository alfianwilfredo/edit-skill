import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { Audio } from './overlay'

export type AudioPattern = { audioPanduan?: string | null; audioUrl?: string | null; sinkron?: 'beat' | '2beat' }
export type Musik = { file: string; name: string; url: string }

// Default dari pattern: audio referensi untuk preview saja (tidak ikut final).
export const audioReferensi = (p: AudioPattern): Audio => ({
  sumber: 'referensi', file: p.audioPanduan ?? '', volume: 1, mulai: 0, final: false, sinkron: true, ketukan: p.sinkron ?? 'beat',
})

// Selaraskan audio overlay dengan pattern terpilih. Hasil sama dengan input bila tidak ada yang perlu diubah.
export function normAudio(a: Audio | null | undefined, p: AudioPattern | undefined): Audio | null | undefined {
  if (a === undefined) return p?.audioPanduan ? audioReferensi(p) : undefined
  if (a && a.sumber === 'referensi') {
    if (!p?.audioPanduan) return null
    if (a.file !== p.audioPanduan) return { ...a, file: p.audioPanduan, mulai: 0, ketukan: p.sinkron ?? 'beat' }
  }
  return a
}

// Library musik studio (brand/musik/).
export function useMusik() {
  const [list, setList] = useState<Musik[]>([])
  const refresh = useCallback(() => api<Musik[]>('/api/musik').then(setList).catch(() => setList([])), [])
  useEffect(() => { refresh() }, [refresh])
  const upload = async (f: File) => {
    const r = await api<Musik>(`/api/musik/upload?name=${encodeURIComponent(f.name)}`, {
      method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f,
    })
    await refresh()
    return r
  }
  return { list, upload }
}

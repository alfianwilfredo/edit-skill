import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { msgOf } from './util'

export type Klip = { name: string; durasi: number | null; thumb: string | null; video: string }
export type Peran = { pembuka: string | null; penutup: string | null; jangan: string[] }
export type Role = '' | 'pembuka' | 'penutup' | 'jangan'

export const ROLE_LABEL: Record<Exclude<Role, ''>, string> = { pembuka: 'Pembuka', penutup: 'Penutup', jangan: 'Jangan dipakai' }
const KOSONG: Peran = { pembuka: null, penutup: null, jangan: [] }

type State = {
  folder: string
  jumlah: number | null
  klip: Klip[] | null
  peran: Peran
  error: string
  saving: boolean
  perluTerapkan: boolean // plan ada & peran berubah sejak terakhir diterapkan
}
const awal = (folder: string): State => ({ folder, jumlah: null, klip: null, peran: KOSONG, error: '', saving: false, perluTerapkan: false })

type Patch = Partial<State> | ((s: State) => Partial<State>)
// Update hanya bila masih folder yang sama (respons folder lama tidak menimpa).
const merge = (f: string, p: Patch) => (s: State): State => {
  if (s.folder !== f) s = awal(f)
  return { ...s, ...(typeof p === 'function' ? p(s) : p) }
}

export const roleOf = (p: Peran, name: string): Role =>
  p.pembuka === name ? 'pembuka' : p.penutup === name ? 'penutup' : p.jangan.includes(name) ? 'jangan' : ''

// Satu pembuka & satu penutup: memilih yang baru mengosongkan pemegang lama.
function applyRole(p: Peran, name: string, role: Role): Peran {
  const n: Peran = {
    pembuka: p.pembuka === name ? null : p.pembuka,
    penutup: p.penutup === name ? null : p.penutup,
    jangan: p.jangan.filter((x) => x !== name),
  }
  if (role === 'pembuka') n.pembuka = name
  if (role === 'penutup') n.penutup = name
  if (role === 'jangan') n.jangan.push(name)
  return n
}

export const teksTerapkan = (p: Peran) =>
  `Pilihan klip diubah di GUI (_edit/klip.json): Pembuka: ${p.pembuka ?? 'tidak ada'}, Penutup: ${p.penutup ?? 'tidak ada'}, Jangan dipakai: ${p.jangan.join(', ') || 'tidak ada'}. Terapkan ke hasil.`

export function useKlip(folder: string) {
  const [raw, setRaw] = useState<State>(() => awal(folder))
  const st = raw.folder === folder ? raw : awal(folder) // ganti folder = state baru
  const savingRef = useRef(false)
  const patch = (f: string, p: Patch) => setRaw(merge(f, p))

  useEffect(() => {
    if (!folder) return
    const ac = new AbortController()
    const q = encodeURIComponent(folder)
    api<{ jumlah: number; klip?: Klip[] }>(`/api/klip?folder=${q}`, { signal: ac.signal })
      .then((r) => setRaw(merge(folder, { jumlah: r.jumlah, klip: r.klip ?? [] })))
      .catch((e) => { if (!ac.signal.aborted) setRaw(merge(folder, { klip: [], error: msgOf(e) })) })
    api<Peran>(`/api/klip/peran?folder=${q}`, { signal: ac.signal })
      .then((r) => setRaw(merge(folder, { peran: { pembuka: r.pembuka ?? null, penutup: r.penutup ?? null, jangan: r.jangan ?? [] } })))
      // Server mengirim peran kosong bila klip.json belum ada, jadi gagal di sini = error asli.
      // Kunci pilihan (saving) supaya klip.json yang ada tidak tertimpa peran kosong.
      .catch((e) => { if (!ac.signal.aborted) setRaw(merge(folder, { saving: true, error: `Peran klip gagal dimuat: ${msgOf(e)}` })) })
    return () => ac.abort()
  }, [folder])

  async function setRole(name: string, role: Role) {
    if (savingRef.current || !folder) return
    const f = folder
    const prev = st.peran
    const next = applyRole(prev, name, role)
    savingRef.current = true
    patch(f, { peran: next, error: '', saving: true })
    try {
      const r = await api<{ ok: boolean; hasPlan: boolean }>('/api/klip/peran', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder: f, ...next }),
      })
      patch(f, (s) => ({ perluTerapkan: r.hasPlan || s.perluTerapkan }))
    } catch (e) {
      patch(f, { peran: prev, error: `Peran klip gagal disimpan: ${msgOf(e)}` })
    } finally {
      savingRef.current = false
      patch(f, { saving: false })
    }
  }

  return { ...st, setRole, selesaiTerapkan: () => patch(folder, { perluTerapkan: false }) }
}
export type KlipState = ReturnType<typeof useKlip>

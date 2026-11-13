import { useEffect, useRef, useState } from 'react'
import type { Tanya } from './components/ui/Modal'
import { LOGO_REF, kekurangan, susunReferensi, type Overlay, type RefTeks, type Referensi } from './overlay'
import { load, save } from './util'

export type Mode = 'ikuti' | 'custom'
type Pola = { id: string; slot?: number; teks?: RefTeks[]; logoSlot?: number | null }
type Ov = { overlay: Overlay; loaded: boolean; update: (o: Overlay) => void }
type Args = { folder: string; pattern?: Pola; ov: Ov; tanya: (t: Tanya) => Promise<boolean>; fokus: (teks: number | null) => void }

const modeKey = (f: string) => `ir_mode:${f}`
const yakinKey = (f: string, p: string) => `ir_yakin:${f}:${p}`

// Mode edit "Ikuti referensi" vs "Custom". Ikuti: teks & logo disusun dari pattern, yang kosong diingatkan lewat modal.
export function useReferensi({ folder, pattern, ov, tanya, fokus }: Args) {
  const [mode, setModeRaw] = useState<Mode>(() => (load(modeKey(folder), 'ikuti') === 'custom' ? 'custom' : 'ikuti'))
  const [modeFolder, setModeFolder] = useState(folder)
  if (modeFolder !== folder) { // ganti folder: muat mode folder itu
    setModeFolder(folder)
    setModeRaw(load(modeKey(folder), 'ikuti') === 'custom' ? 'custom' : 'ikuti')
  }
  const setMode = (m: Mode) => { setModeRaw(m); save(modeKey(folder), m) }

  const ref: Referensi | null = mode === 'ikuti' && pattern
    ? { slot: pattern.slot ?? 0, teks: pattern.teks ?? [], logoSlot: pattern.logoSlot ?? null }
    : null
  const pid = pattern?.id ?? ''
  const yakin = (): string[] => { try { return JSON.parse(load(yakinKey(folder, pid), '[]')) } catch { return [] } }
  const tambahYakin = (ids: string[]) => save(yakinKey(folder, pid), JSON.stringify([...new Set([...yakin(), ...ids])]))

  // Susun ulang sekali tiap kombinasi folder + pattern saat mode Ikuti (bukan tiap ketikan).
  const sudah = useRef('')
  const ovRef = useRef(ov)
  useEffect(() => { ovRef.current = ov })
  useEffect(() => {
    if (!ref) { sudah.current = ''; return }
    if (!ov.loaded) return
    const key = `${folder}|${pid}`
    if (sudah.current === key) return
    sudah.current = key
    ;(async () => {
      const { overlay: next, hilang } = susunReferensi(ovRef.current.overlay, ref)
      if (hilang && !(await tanya({
        id: 'ref-modal-hapus', judul: 'Teks lebih banyak dari referensi',
        isi: <p>Gaya ini hanya punya {ref.teks.length} teks. {hilang} teks yang sudah diisi akan dihapus. Pilih Custom untuk menyimpan semua teks.</p>,
        ok: 'Hapus & ikuti referensi', batal: 'Pakai Custom',
      }))) { setMode('custom'); return }
      let o = next
      if (ref.logoSlot !== null && !o.logo && !yakin().includes('logo')) o = { ...o, logo: LOGO_REF }
      if (JSON.stringify(o) !== JSON.stringify(ovRef.current.overlay)) ovRef.current.update({ ...o, audio: ovRef.current.overlay.audio })
    })()
  }, [ov.loaded, folder, pid, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dipanggil sebelum Mulai edit / Terapkan. false = user memilih kembali mengisi.
  async function cekSebelum() {
    if (!ref) return true
    const kurang = kekurangan(ov.overlay, ref).filter((k) => !yakin().includes(k.id))
    if (!kurang.length) return true
    const ok = await tanya({
      id: 'ref-modal-kurang', judul: 'Belum sesuai referensi',
      isi: <><p>Video contoh gaya ini memakai:</p><ul>{kurang.map((k) => <li key={k.id}>{k.label}</li>)}</ul><p>Tetap lanjut tanpa itu?</p></>,
      ok: 'Lanjut tanpa itu', batal: 'Kembali isi',
    })
    if (ok) tambahYakin(kurang.map((k) => k.id))
    else fokus(kurang[0].teks ?? null)
    return ok
  }

  // Konfirmasi saat logo dimatikan padahal referensi memakai logo.
  const konfirmTanpaLogo = ref && ref.logoSlot !== null ? async () => {
    if (yakin().includes('logo')) return true
    const ok = await tanya({
      id: 'ref-modal-logo', judul: 'Tanpa logo?',
      isi: <p>Video contoh gaya ini menampilkan logo di shot {ref.logoSlot! + 1}. Yakin tidak memakai logo?</p>,
      ok: 'Ya, tanpa logo', batal: 'Tetap pakai logo',
    })
    if (ok) tambahYakin(['logo'])
    return ok
  } : undefined

  return { mode, setMode, ref, cekSebelum, konfirmTanpaLogo }
}

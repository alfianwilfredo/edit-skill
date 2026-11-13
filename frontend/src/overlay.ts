import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

export type Pos = 'atas-kiri' | 'atas' | 'atas-kanan' | 'tengah-kiri' | 'tengah' | 'tengah-kanan' | 'bawah-kiri' | 'bawah' | 'bawah-kanan'
export type Ukuran = 'S' | 'M' | 'L' | 'XL'
export type Kapan = 'pembuka' | 'penutup' | 'semua' | number
// per_baris[k]: font/ukuran khusus baris ke-k; null atau field kosong = ikut utama.
export type GayaBaris = { font?: string; ukuran?: Ukuran } | null
export type Teks = { isi: string; font: string; posisi: Pos; kapan: Kapan; ukuran: Ukuran; warna: 'putih' | 'hitam'; per_baris?: GayaBaris[] }
// Teks yang menempel pada logo (di atas atau di bawahnya), tampil bersama logo di shot terakhir.
export type LogoTeks = { isi: string; font: string; letak: 'atas' | 'bawah'; ukuran: Ukuran; warna: 'putih' | 'hitam' }
export type Logo = { warna: 'hitam' | 'putih'; posisi: Pos; ukuran: Ukuran; teks?: LogoTeks[] }
// audio: undefined = belum pernah diatur (default dari pattern), null = Tanpa.
export type Audio = { sumber: 'referensi' | 'library' | 'tanpa'; file: string; volume: number; mulai: number; final: boolean; sinkron: boolean; ketukan: 'beat' | '2beat' }
export type Overlay = { logo: Logo | null; teks: Teks[]; audio?: Audio | null }
export type Font = { file: string; name: string; url: string; kategori: string; ciri: string; cocok: string }

export const POSISI: Pos[] = ['atas-kiri', 'atas', 'atas-kanan', 'tengah-kiri', 'tengah', 'tengah-kanan', 'bawah-kiri', 'bawah', 'bawah-kanan']
export const UKURAN: Ukuran[] = ['S', 'M', 'L', 'XL']
// Batas karakter per baris sebelum teks berisiko keluar layar.
// Saat isi diedit: pengaturan per_baris ikut pindah bersama barisnya bila baris disisipkan/dihapus.
// Baris yang sama di awal dan akhir dipertahankan; baris yang berubah di tengah memakai pengaturan lama sesuai urutan.
export function geserPerBaris(lama: string, baru: string, pb?: GayaBaris[]): GayaBaris[] | undefined {
  if (!pb?.some(Boolean)) return pb
  const a = lama.split('\n'), b = baru.split('\n')
  if (a.length === b.length) return pb
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let q = 0
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++
  const g = (k: number) => pb[k] ?? null
  const tengahLama = a.slice(p, a.length - q).map((_, k) => g(p + k))
  const tengahBaru = b.slice(p, b.length - q).map((_, k) => tengahLama[k] ?? null)
  const out = [...a.slice(0, p).map((_, k) => g(k)), ...tengahBaru, ...a.slice(a.length - q).map((_, k) => g(a.length - q + k))]
  return out.some(Boolean) ? out : undefined
}

// Tinggi huruf relatif tinggi layar, sama dengan OV_UKURAN_TEKS di render.py.
export const TINGGI: Record<Ukuran, number> = { S: 0.026, M: 0.036, L: 0.052, XL: 0.075 }

let kanvas: CanvasRenderingContext2D | null = null
// Lebar teks relatif lebar layar 9:16, diukur dengan font aslinya. > 0.84 = keluar margin aman.
export function lebarLayar(isi: string, font: string, ukuran: Ukuran) {
  kanvas ??= document.createElement('canvas').getContext('2d')
  if (!kanvas) return 0
  kanvas.font = `100px "${fontFamily(font)}"`
  return (kanvas.measureText(isi).width / 100) * TINGGI[ukuran] * (16 / 9)
}

// Font & ukuran efektif tiap baris (utama ditimpa per_baris).
export const barisEfektif = (t: Teks) => t.isi.split('\n').map((isi, k) => {
  const g = t.per_baris?.[k] ?? null
  return { isi, font: g?.font || t.font, ukuran: g?.ukuran || t.ukuran }
})

export const newLogoTeks = (): LogoTeks => ({ isi: '', font: 'Poppins-Light.ttf', letak: 'bawah', ukuran: 'S', warna: 'putih' })
export const newTeks = (): Teks => ({ isi: '', font: 'Poppins-Medium.ttf', posisi: 'tengah', kapan: 'pembuka', ukuran: 'M', warna: 'putih' })

export function defaultOverlay(): Overlay {
  let proyek = ''
  try { proyek = localStorage.getItem('ir_proyek') ?? '' } catch { /* private window */ }
  return {
    logo: { warna: 'hitam', posisi: 'bawah', ukuran: 'M' },
    teks: [
      { isi: proyek || 'Nama Proyek', font: 'DMSerifDisplay-Regular.ttf', posisi: 'tengah', kapan: 'pembuka', ukuran: 'L', warna: 'putih' },
    ],
  }
}

export const fontFamily = (file: string) => `ov-${file.replace(/[^a-zA-Z0-9]/g, '-')}`

// Daftar font dari folder fonts/ skill, didaftarkan ke browser supaya preview memakai font aslinya.
export function useFonts() {
  const [fonts, setFonts] = useState<Font[]>([])
  useEffect(() => {
    api<Font[]>('/api/fonts').then((list) => {
      setFonts(list)
      // Setelah semua font termuat, render ulang supaya ukuran lebar teks memakai font asli.
      Promise.allSettled(list.map((f) => new FontFace(fontFamily(f.file), `url(${f.url})`).load().then((x) => document.fonts.add(x))))
        .then(() => setFonts([...list]))
    }).catch(() => setFonts([]))
  }, [])
  return fonts
}

const put = (folder: string, overlay: Overlay) =>
  api('/api/overlay', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder, overlay }) })

// overlay.json per folder klip. Edit lokal disimpan otomatis (debounce 600ms).
export function useOverlay(folder: string) {
  const [overlay, setOverlay] = useState<Overlay>(() => defaultOverlay())
  const [hasPlan, setHasPlan] = useState(false)
  const [loadedFor, setLoadedFor] = useState('') // folder yang overlay-nya sudah dimuat dari server
  const pending = useRef<{ folder: string; overlay: Overlay } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const p = pending.current
    pending.current = null
    if (p) await put(p.folder, p.overlay)
  }, [])

  const reload = useCallback((f = folder) => {
    if (!f || pending.current) return
    api<{ overlay: Overlay | null; hasPlan: boolean }>(`/api/overlay?folder=${encodeURIComponent(f)}`)
      .then((r) => {
        if (pending.current) return // ada edit lokal yang belum tersimpan: jangan ditimpa
        setOverlay(r.overlay ?? defaultOverlay())
        setHasPlan(r.hasPlan)
        setLoadedFor(f)
      })
      .catch(() => setHasPlan(false))
  }, [folder])

  useEffect(() => {
    reload(folder)
    return () => { flush().catch(() => {}) } // simpan edit folder lama sebelum ganti folder
  }, [folder]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (o: Overlay) => {
    setOverlay(o)
    if (!folder) return
    pending.current = { folder, overlay: o }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { flush().catch(() => {}) }, 600)
  }

  // Simpan nilai sekarang walau belum diedit (default belum pernah ditulis ke file).
  const saveNow = async () => {
    if (!folder) return
    pending.current = pending.current ?? { folder, overlay }
    await flush()
  }

  return { overlay, hasPlan, update, reload, saveNow, loaded: !!folder && loadedFor === folder }
}

export const kapanLabel = (k: Kapan) => (k === 'pembuka' ? 'Pembuka' : k === 'penutup' ? 'Penutup' : k === 'semua' ? 'Seluruh video' : `Shot ke-${k}`)
export const posLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1).replace('-', ' ')
// Pilihan "Lihat" di preview: pembuka, shot tengah (bila pattern dipilih), penutup.
export const viewOptions = (slot: number): Kapan[] => ['pembuka', ...Array.from({ length: Math.max(0, slot - 2) }, (_, k) => k + 2), 'penutup']

export function kapanOptions(slot: number, extra?: Kapan): Kapan[] {
  const mid = Array.from({ length: Math.max(0, slot - 2) }, (_, k) => k + 2)
  const opts: Kapan[] = ['pembuka', ...mid, 'penutup', 'semua']
  if (extra !== undefined && !opts.includes(extra)) opts.push(extra)
  return opts
}

// Mode "Ikuti referensi": teks dan logo mengikuti video contoh pattern.
export type RefTeks = { slot: number; gaya: string; contoh: string }
export type Referensi = { slot: number; teks: RefTeks[]; logoSlot: number | null }
export type Kurang = { id: string; label: string; teks?: number }
export const LOGO_REF: Logo = { warna: 'putih', posisi: 'tengah', ukuran: 'L' }
const UKURAN_GAYA: Record<string, Ukuran> = { judul: 'L', label: 'M', cta: 'M' }
// Slot pattern (indeks 0) -> kapan overlay. Nomor shot = indeks + 1.
export const kapanSlot = (s: number, n: number): Kapan => (s === 0 ? 'pembuka' : n > 1 && s === n - 1 ? 'penutup' : s + 1)

// Susun teks sesuai referensi: isi lama dipertahankan berurutan. hilang = teks berisi yang terbuang.
export function susunReferensi(o: Overlay, r: Referensi) {
  const teks = r.teks.map((rt, j): Teks => ({
    ...(o.teks[j] ?? { ...newTeks(), ukuran: UKURAN_GAYA[rt.gaya] ?? 'M' }),
    kapan: kapanSlot(rt.slot, r.slot),
  }))
  const hilang = o.teks.slice(r.teks.length).filter((t) => t.isi.trim()).length
  return { overlay: { ...o, teks }, hilang }
}

export function kekurangan(o: Overlay, r: Referensi): Kurang[] {
  const out: Kurang[] = r.teks.flatMap((rt, j) => (o.teks[j]?.isi.trim() ? [] : [{
    id: `teks-${j}`, teks: j, label: `Teks ${j + 1} (${kapanLabel(kapanSlot(rt.slot, r.slot))}) masih kosong`,
  }]))
  if (r.logoSlot !== null && !o.logo) out.push({ id: 'logo', label: `Logo dimatikan, padahal referensi memakai logo di shot ${r.logoSlot + 1}` })
  return out
}

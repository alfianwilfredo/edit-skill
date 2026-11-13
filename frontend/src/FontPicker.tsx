import { useEffect, useRef, useState } from 'react'
import { fontFamily, type Font } from './overlay'

// utama: bila diisi, value '' berarti "Ikut utama" dan daftar punya opsi untuk kembali ke font utama.
type Props = { id: string; value: string; fonts: Font[]; sample: string; onChange: (file: string) => void; utama?: string }

const SEMUA = 'Semua'

// Pemilih font dengan contoh tulisan + keterangan, supaya user tahu bentuk dan kegunaan tiap font.
// Dipakai di dalam grid 2 kolom: tombol mengisi satu sel, daftar membentang selebar grid.
export default function FontPicker({ id, value, fonts, sample, onChange, utama }: Props) {
  const [open, setOpen] = useState(false)
  const [kat, setKat] = useState(SEMUA)
  const listRef = useRef<HTMLDivElement>(null)
  const ikut = utama !== undefined && !value
  const efektif = ikut ? utama : value
  const cur = fonts.find((f) => f.file === efektif)
  const kategori = [SEMUA, ...Array.from(new Set(fonts.map((f) => f.kategori)))]
  const shown = kat === SEMUA ? fonts : fonts.filter((f) => f.kategori === kat)
  const contoh = sample.split('\n')[0].trim() || 'Rumah Tropis Bintaro'

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('.fp-item.on')?.scrollIntoView({ block: 'nearest' })
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])

  return (
    <>
      <button id={`${id}-btn-open`} type="button" className={`fp-trigger ${open ? 'on' : ''}`} aria-expanded={open}
        aria-haspopup="listbox" onClick={() => setOpen(!open)} title={cur?.ciri}>
        <span className="fp-name" style={{ fontFamily: fontFamily(efektif) }}>{cur?.name ?? efektif}</span>
        <small>{ikut ? 'Ikut utama' : cur?.kategori ?? 'Font'}</small>
      </button>
      {open && (
        <div className="fp-panel" id={`${id}-panel`}>
          <div className="fp-kat" role="tablist" aria-label="Kategori font">
            {kategori.map((k) => (
              <button key={k} id={`${id}-btn-kat-${k.toLowerCase().replace(/\s+/g, '-')}`} type="button" role="tab"
                aria-selected={kat === k} className={kat === k ? 'on' : ''} onClick={() => setKat(k)}>{k}</button>
            ))}
          </div>
          <div className="fp-list" role="listbox" ref={listRef} aria-label="Pilih font">
            {utama !== undefined && (
              <button id={`${id}-opt-utama`} type="button" role="option" aria-selected={ikut}
                className={`fp-item ${ikut ? 'on' : ''}`} onClick={() => { onChange(''); setOpen(false) }}>
                <span className="fp-sample" style={{ fontFamily: fontFamily(utama) }}>{contoh}</span>
                <span className="fp-meta"><strong>Ikut utama</strong> · sama dengan font teks ini</span>
              </button>
            )}
            {shown.map((f) => (
              <button key={f.file} id={`${id}-opt-${f.file.replace(/\W+/g, '-')}`} type="button" role="option"
                aria-selected={!ikut && f.file === value} className={`fp-item ${!ikut && f.file === value ? 'on' : ''}`}
                onClick={() => { onChange(f.file); setOpen(false) }}>
                <span className="fp-sample" style={{ fontFamily: fontFamily(f.file) }}>{contoh}</span>
                <span className="fp-meta"><strong>{f.name}</strong>{f.ciri && <> · {f.ciri}</>}</span>
                {f.cocok && <span className="fp-cocok">Cocok untuk: {f.cocok}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

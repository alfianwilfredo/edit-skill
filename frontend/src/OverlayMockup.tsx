import { POSISI, TINGGI, barisEfektif, fontFamily, type Kapan, type Overlay, type Pos } from './overlay'

type Props = {
  overlay: Overlay
  view: Kapan
  logoSrc: { hitam: string | null; putih: string | null }
  selected: number | null
  onSelect: (i: number) => void
  logoKapan?: Kapan // shot tempat logo tampil (default penutup)
}

// Ukuran huruf relatif tinggi layar (cqh), sama dengan render.py.
const LOGO_W = { S: 16, M: 22, L: 30, XL: 40 }

// Perkiraan posisi teks & logo, mengisi penuh kotak phone.
export default function OverlayMockup({ overlay, view, logoSrc, selected, onSelect, logoKapan = 'penutup' }: Props) {
  const visible = overlay.teks.map((t, i) => ({ t, i })).filter(({ t }) => t.kapan === 'semua' || t.kapan === view)
  const logo = view === logoKapan ? overlay.logo : null
  const src = logo ? logoSrc[logo.warna] : null

  const stack = (p: Pos) => {
    const own = visible.filter(({ t }) => t.posisi === p).map(({ t, i }) => (
      <button key={i} id={`overlay-mockup-btn-teks-${i}`} type="button" onClick={() => onSelect(i)}
        className={`mk-teks ${t.warna} ${selected === i ? 'sel' : ''}`}
        style={{ fontFamily: fontFamily(t.font), fontSize: `${TINGGI[t.ukuran] * 100}cqh` }}>
        {barisEfektif(t).map((b, k) => (
          <span key={k} className="mk-baris" style={{ fontFamily: fontFamily(b.font), fontSize: `${TINGGI[b.ukuran] * 100}cqh` }}>{b.isi || ' '}</span>
        ))}
      </button>
    ))
    if (!logo || !src || p !== logo.posisi) return own
    const lt = (letak: 'atas' | 'bawah') => (logo.teks ?? []).filter((x) => x.letak === letak && x.isi.trim()).map((x, k) => (
      <span key={`${letak}-${k}`} className={`mk-teks ${x.warna}`} style={{ fontFamily: fontFamily(x.font), fontSize: `${TINGGI[x.ukuran] * 100}cqh` }}>{x.isi}</span>
    ))
    const grup = (
      <div key="logo" className="mk-grup">
        {lt('atas')}
        <img className="mk-logo" src={src} alt="" style={{ width: `${LOGO_W[logo.ukuran]}cqw` }} />
        {lt('bawah')}
      </div>
    )
    // Logo di baris bawah berada paling bawah, mendorong teks bawah ke atasnya.
    return p.startsWith('atas') ? [grup, ...own] : [...own, grup]
  }

  return (
    <div className="mockup" id="overlay-mockup" aria-label="Perkiraan posisi teks dan logo">
      <div className="mk-safe top" />
      <div className="mk-safe bottom" />
      {POSISI.map((p) => <div key={p} className={`mk-slot ${p}`}>{stack(p)}</div>)}
    </div>
  )
}

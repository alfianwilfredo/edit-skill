import { Icon } from './icons'
import TeksRow from './TeksRow'
import AudioPanel from './AudioPanel'
import type { AudioPattern } from './audio'
import LogoPanel from './LogoPanel'
import { newTeks, type Font, type Overlay, type Referensi } from './overlay'

type Props = {
  overlay: Overlay
  onChange: (o: Overlay) => void
  fonts: Font[]
  slot: number
  logoSrc: { hitam: string | null; putih: string | null }
  open: number | null
  setOpen: (i: number | null) => void
  pattern?: AudioPattern
  aturan?: { ref: Referensi; konfirmTanpaLogo?: () => Promise<boolean> }
}

export default function OverlayPanel({ overlay, onChange, fonts, slot, logoSrc, open, setOpen, pattern, aturan }: Props) {
  const setTeks = (teks: Overlay['teks']) => onChange({ ...overlay, teks })
  const add = () => { setTeks([...overlay.teks, newTeks()]); setOpen(overlay.teks.length) }
  const remove = (i: number) => {
    setTeks(overlay.teks.filter((_, k) => k !== i))
    if (open !== null) setOpen(open === i ? null : open > i ? open - 1 : open)
  }

  return (
    <div id="overlay-panel" className="ov">
      <LogoPanel logo={overlay.logo} onChange={(l) => onChange({ ...overlay, logo: l })} fonts={fonts} logoSrc={logoSrc}
        logoSlot={aturan?.ref.logoSlot ?? null} konfirmTanpa={aturan?.konfirmTanpaLogo} />

      <div className="sec-head">
        <h2>Teks</h2>
        {!aturan && <button id="overlay-btn-add" className="btn ghost" onClick={add}><Icon name="plus" size={14} />Tambah</button>}
      </div>
      <div className="ov-list" id="overlay-teks-list">
        {overlay.teks.map((t, i) => (
          <TeksRow key={i} i={i} t={t} fonts={fonts} slot={slot} open={open === i} contoh={aturan?.ref.teks[i]?.contoh}
            onToggle={() => setOpen(open === i ? null : i)}
            onChange={(n) => setTeks(overlay.teks.map((x, k) => (k === i ? n : x)))}
            onRemove={() => remove(i)} />
        ))}
        {overlay.teks.length === 0 && <p className="hint">{aturan ? 'Video contoh gaya ini tanpa teks.' : 'Tanpa teks. Video dirender tanpa tulisan.'}</p>}
        {aturan && overlay.teks.length > 0 && <p className="hint" id="overlay-hint-ref">Jumlah dan waktu teks mengikuti video contoh. Pilih Custom untuk menambah atau memindah teks.</p>}
      </div>

      <AudioPanel audio={overlay.audio} pattern={pattern} onChange={(a) => onChange({ ...overlay, audio: a })} />
    </div>
  )
}

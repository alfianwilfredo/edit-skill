import { Icon } from './icons'
import FontPicker from './FontPicker'
import PosGrid from './PosGrid'
import { UKURAN, fontFamily, lebarLayar, newLogoTeks, type Font, type Logo, type LogoTeks } from './overlay'

type Props = {
  logo: Logo | null
  onChange: (l: Logo | null) => void
  fonts: Font[]
  logoSrc: { hitam: string | null; putih: string | null }
  logoSlot?: number | null // mode Ikuti referensi: shot logo di video contoh
  konfirmTanpa?: () => Promise<boolean>
}

const LOGO_DEFAULT: Logo = { warna: 'hitam', posisi: 'bawah', ukuran: 'M' }

// Logo + teks opsional yang menempel di atas/bawah logo (shot terakhir).
export default function LogoPanel({ logo, onChange, fonts, logoSrc, logoSlot = null, konfirmTanpa }: Props) {
  const patch = (p: Partial<Logo>) => onChange({ ...(logo ?? LOGO_DEFAULT), ...p })
  const teks = logo?.teks ?? []
  const setTeks = (t: LogoTeks[]) => patch({ teks: t })
  const setOne = (i: number, p: Partial<LogoTeks>) => setTeks(teks.map((x, k) => (k === i ? { ...x, ...p } : x)))

  return (
    <>
      <div className="sec-head"><h2>Logo</h2><small className="muted">{logoSlot !== null ? `shot ${logoSlot + 1} (referensi)` : 'shot terakhir'}</small></div>
      <div className="seg" role="radiogroup" aria-label="Warna logo" id="overlay-logo-pick">
        {([['hitam', 'Hitam', logoSrc.hitam], ['putih', 'Putih', logoSrc.putih]] as const).map(([v, label, src]) => (
          <button key={v} id={`overlay-logo-btn-${v}`} role="radio" aria-checked={logo?.warna === v}
            className={logo?.warna === v ? 'on' : ''} onClick={() => patch({ warna: v })}>
            <span className={`logo-swatch ${v}`}>{src && <img src={src} alt="" />}</span>{label}
          </button>
        ))}
        <button id="overlay-logo-btn-tanpa" role="radio" aria-checked={!logo} className={!logo ? 'on' : ''}
          onClick={async () => { if (!logo || (konfirmTanpa && !(await konfirmTanpa()))) return; onChange(null) }}>Tanpa</button>
      </div>
      {logo && (
        <>
          <div className="ov-3">
            <PosGrid id="overlay-logo-pos" value={logo.posisi} onChange={(p) => patch({ posisi: p })} label="Posisi logo" />
            <div className="ov-col">
              <div className="seg" role="radiogroup" aria-label="Ukuran logo">
                {UKURAN.map((u) => (
                  <button key={u} id={`overlay-logo-btn-ukuran-${u}`} className={logo.ukuran === u ? 'on' : ''} onClick={() => patch({ ukuran: u })}>{u}</button>
                ))}
              </div>
              <label className="check" htmlFor="overlay-logo-check-teks">
                <input id="overlay-logo-check-teks" type="checkbox" checked={teks.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) return setTeks([newLogoTeks()])
                    if (teks.some((x) => x.isi.trim()) && !window.confirm('Hapus semua teks logo?')) return
                    setTeks([])
                  }} />
                Tambah teks bersama logo
              </label>
            </div>
          </div>

          {teks.map((t, i) => (
            <div key={i} className="ov-teks open" id={`overlay-logo-teks-card-${i}`}>
              <div className="ov-edit lt">
                <div className="lt-head">
                  <input id={`overlay-logo-teks-input-isi-${i}`} value={t.isi} placeholder="Teks logo, mis. @keziakarin.studio"
                    style={{ fontFamily: fontFamily(t.font) }} onChange={(e) => setOne(i, { isi: e.target.value })} />
                  <button id={`overlay-logo-teks-btn-remove-${i}`} className="btn ghost icon" aria-label={`Hapus teks logo ${i + 1}`}
                    onClick={() => setTeks(teks.filter((_, k) => k !== i))}><Icon name="trash" size={14} /></button>
                </div>
                {lebarLayar(t.isi, t.font, t.ukuran) > 0.84 && <p className="hint warn">Terlalu lebar, bisa terpotong. Perkecil ukuran atau pecah jadi 2 teks logo.</p>}
                <div className="ov-2">
                  <FontPicker id={`overlay-logo-teks-font-${i}`} value={t.font} fonts={fonts} sample={t.isi || '@keziakarin.studio'} onChange={(f) => setOne(i, { font: f })} />
                  <div className="seg" role="radiogroup" aria-label="Letak terhadap logo">
                    {(['atas', 'bawah'] as const).map((l) => (
                      <button key={l} id={`overlay-logo-teks-btn-letak-${i}-${l}`} className={t.letak === l ? 'on' : ''}
                        onClick={() => setOne(i, { letak: l })}>{l === 'atas' ? 'Di atas' : 'Di bawah'}</button>
                    ))}
                  </div>
                </div>
                <div className="ov-2">
                  <div className="seg" role="radiogroup" aria-label="Ukuran">
                    {UKURAN.map((u) => (
                      <button key={u} id={`overlay-logo-teks-btn-ukuran-${i}-${u}`} className={t.ukuran === u ? 'on' : ''} onClick={() => setOne(i, { ukuran: u })}>{u}</button>
                    ))}
                  </div>
                  <div className="seg" role="radiogroup" aria-label="Warna">
                    {(['putih', 'hitam'] as const).map((w) => (
                      <button key={w} id={`overlay-logo-teks-btn-warna-${i}-${w}`} className={t.warna === w ? 'on' : ''} onClick={() => setOne(i, { warna: w })}>
                        <span className={`dot ${w}`} />{w === 'putih' ? 'Putih' : 'Hitam'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {teks.length > 0 && (
            <button id="overlay-logo-btn-add-teks" className="btn ghost" onClick={() => setTeks([...teks, newLogoTeks()])}>
              <Icon name="plus" size={14} />Tambah teks logo
            </button>
          )}
        </>
      )}
    </>
  )
}

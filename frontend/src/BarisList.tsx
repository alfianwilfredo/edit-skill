import FontPicker from './FontPicker'
import { UKURAN, type Font, type GayaBaris, type Teks, type Ukuran } from './overlay'

type Props = { i: number; t: Teks; fonts: Font[]; onChange: (pb: GayaBaris[] | undefined) => void }

// Font & ukuran per baris. Muncul bila teks punya 2 baris atau lebih; default "Ikut utama".
export default function BarisList({ i, t, fonts, onChange }: Props) {
  const lines = t.isi.split('\n')
  if (lines.length < 2) return null
  const pb = lines.map((_, k) => t.per_baris?.[k] ?? null)
  const set = (k: number, p: Partial<NonNullable<GayaBaris>>) => {
    const next = pb.map((g, j) => {
      if (j !== k) return g
      const m = { ...(g ?? {}), ...p }
      if (!m.font) delete m.font
      if (!m.ukuran) delete m.ukuran
      return Object.keys(m).length ? m : null
    })
    onChange(next.some(Boolean) ? next : undefined)
  }

  return (
    <div className="ov-baris" id={`overlay-teks-baris-${i}`}>
      <small className="muted">Font & ukuran per baris</small>
      {lines.map((isi, k) => (
        <div key={k} className="ov-baris-row" id={`overlay-teks-baris-${i}-${k}`}>
          <span className="ov-baris-label">{k + 1}. {isi.trim() || '(baris kosong)'}</span>
          <div className="ov-2">
            <FontPicker id={`overlay-teks-baris-font-${i}-${k}`} value={pb[k]?.font ?? ''} utama={t.font} fonts={fonts}
              sample={isi} onChange={(f) => set(k, { font: f })} />
            <select id={`overlay-teks-baris-select-ukuran-${i}-${k}`} aria-label={`Ukuran baris ${k + 1}`} value={pb[k]?.ukuran ?? ''}
              onChange={(e) => set(k, { ukuran: (e.target.value || undefined) as Ukuran | undefined })}>
              <option value="">Ikut utama ({t.ukuran})</option>
              {UKURAN.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
      ))}
    </div>
  )
}

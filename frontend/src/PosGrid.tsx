import { POSISI, posLabel, type Pos } from './overlay'

type Props = { id: string; value: Pos; onChange: (p: Pos) => void; label: string }

// Pemilih posisi 3x3 (dipakai teks dan logo).
export default function PosGrid({ id, value, onChange, label }: Props) {
  return (
    <div className="pos-grid" role="radiogroup" aria-label={label} id={id}>
      {POSISI.map((p) => (
        <button key={p} id={`${id}-${p}`} role="radio" aria-checked={value === p} title={posLabel(p)}
          className={`pos-cell ${value === p ? 'on' : ''}`} onClick={() => onChange(p)}><i /></button>
      ))}
    </div>
  )
}

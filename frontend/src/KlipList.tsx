import { useState } from 'react'
import { Icon } from './icons'
import './klip.css'
import { VideoDialog } from './components/ui/Dialog'
import { ROLE_LABEL, roleOf, teksTerapkan, type Klip, type KlipState, type Role } from './useKlip'

type Props = {
  k: KlipState
  onApplyKlip: (text: string) => void
  applyDisabled: boolean
}

const mss = (s: number) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }

export default function KlipList({ k, onApplyKlip, applyDisabled }: Props) {
  const [open, setOpen] = useState(true)
  const [preview, setPreview] = useState<Klip | null>(null)
  const n = k.jumlah ?? k.klip?.length ?? 0
  return (
    <div className="klip" id="klip-section">
      <button id="klip-btn-toggle" className="klip-head" aria-expanded={open} aria-controls="klip-grid" onClick={() => setOpen((o) => !o)}>
        <span>Klip ({k.klip ? n : '…'})</span>
        <span className={`klip-chev${open ? ' open' : ''}`}><Icon name="chevron" size={14} /></span>
      </button>
      {open && (
        !k.klip ? <p className="hint" id="klip-hint-loading">Memuat klip…</p>
          : !k.klip.length ? <p className="hint" id="klip-hint-empty">{k.error ? 'Daftar klip gagal dimuat.' : 'Tidak ada klip di folder ini.'}</p>
            : (
              <ul className="klip-grid" id="klip-grid">
                {k.klip.map((c, i) => {
                  const r = roleOf(k.peran, c.name)
                  return (
                    <li key={c.name} className={`klip-item${r ? ` r-${r}` : ''}`} id={`klip-item-${i}`}>
                      <button id={`klip-btn-preview-${i}`} className="klip-thumb" aria-label={`Putar ${c.name}`} onClick={() => setPreview(c)}>
                        {c.thumb ? <img src={c.thumb} alt="" loading="lazy" /> : <Icon name="film" size={22} />}
                        {c.durasi != null && <span className="klip-dur">{mss(c.durasi)}</span>}
                        {r && <span className="klip-badge">{ROLE_LABEL[r]}</span>}
                      </button>
                      <span className="klip-name" title={c.name}>{c.name}</span>
                      <select id={`klip-select-role-${i}`} aria-label={`Peran klip ${c.name}`} value={r} disabled={k.saving}
                        onChange={(e) => k.setRole(c.name, e.target.value as Role)}>
                        <option value="">—</option>
                        <option value="pembuka">Pembuka</option>
                        <option value="penutup">Penutup</option>
                        <option value="jangan">Jangan dipakai</option>
                      </select>
                    </li>
                  )
                })}
              </ul>
            )
      )}
      {k.error && k.klip?.length ? <p className="hint warn" id="klip-hint-error" role="alert">{k.error}</p> : null}
      {k.perluTerapkan && (
        <button id="klip-btn-apply" className="btn block" disabled={applyDisabled}
          onClick={() => { onApplyKlip(teksTerapkan(k.peran)); k.selesaiTerapkan() }}>
          <Icon name="check" size={14} />Terapkan pilihan klip
        </button>
      )}
      {preview && <VideoDialog id="klip-modal-preview" title={preview.name} src={preview.video} onClose={() => setPreview(null)} />}
    </div>
  )
}

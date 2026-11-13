import { useState } from 'react'
import { Icon } from './icons'
import KlipList from './KlipList'
import { VideoDialog } from './components/ui/Dialog'
import { useKlip } from './useKlip'
import { pretty } from './util'
import type { Mode } from './useReferensi'

type Pattern = { id: string; name: string; deskripsi: string; durasi: number | null; minKlip?: number | null; idealKlip?: [number, number] | null; video?: string | null }
type Props = {
  folder: string
  onPick: () => void
  patterns: Pattern[]
  patternId: string
  setPatternId: (id: string) => void
  onNewPattern: () => void
  model: string
  setModel: (m: string) => void
  mode: Mode
  setMode: (m: Mode) => void
  onApplyKlip: (text: string) => void
  applyDisabled: boolean
}

export default function BahanPanel({ folder, onPick, patterns, patternId, setPatternId, onNewPattern, model, setModel, mode, setMode, onApplyKlip, applyDisabled }: Props) {
  const folderName = folder.split('/').filter(Boolean).pop() ?? ''
  const sel = patterns.find((p) => p.id === patternId)
  const k = useKlip(folder)
  const [preview, setPreview] = useState<Pattern | null>(null)
  const n = folder ? k.jumlah : null
  const kurang = sel?.minKlip && n !== null && n < sel.minKlip
  return (
    <section className="card bahan" id="setup-section">
      <h2>Folder klip</h2>
      <button id="folder-btn-pick" className={`picker ${folder ? 'set' : ''}`} onClick={onPick} title={folder}>
        <Icon name="folder" size={16} />
        <span className="picker-text">
          <strong>{folderName || 'Pilih folder'}{n !== null && <span className="muted"> · {n} klip</span>}</strong>
          <small>{folder || 'Folder berisi klip mentah proyek'}</small>
        </span>
      </button>
      {folder && <KlipList key={folder} k={k} onApplyKlip={onApplyKlip} applyDisabled={applyDisabled} />}

      <div className="sec-head">
        <h2>Gaya edit</h2>
        <button id="pattern-btn-new" className="btn ghost" onClick={onNewPattern}><Icon name="plus" size={14} />Baru</button>
      </div>
      <div className="patterns" id="pattern-list" role="radiogroup">
        {patterns.map((p) => (
          <div key={p.id} className="pat-row">
            <button id={`pattern-btn-${p.id}`} role="radio" aria-checked={patternId === p.id}
              className={`pat ${patternId === p.id ? 'on' : ''}`} title={p.deskripsi}
              onClick={() => setPatternId(patternId === p.id ? '' : p.id)}>
              <strong>{pretty(p.name)}</strong>
              <em title={p.idealKlip ? `Ideal ${p.idealKlip[0]}–${p.idealKlip[1]} klip` : undefined}
                className={p.minKlip && n !== null && n < p.minKlip ? 'kurang' : ''}>
                {p.minKlip ? `min ${p.minKlip} klip` : ''}{p.minKlip && p.durasi ? ' · ' : ''}{p.durasi ? `${Math.round(p.durasi)} dtk` : ''}
              </em>
            </button>
            {p.video && (
              <button id={`pattern-btn-preview-${p.id}`} className="btn ghost icon pat-play" aria-label="Lihat video contoh"
                title="Lihat video contoh" onClick={(e) => { e.stopPropagation(); setPreview(p) }}>
                <Icon name="play" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {kurang && (
        <p className="hint warn" id="pattern-hint-kurang">Folder hanya {n} klip, gaya ini butuh minimal {sel.minKlip}. Tambah klip atau pilih gaya lain.</p>
      )}
      <p className="hint">
        {sel ? <>{sel.minKlip ? <strong>Minimal {sel.minKlip} klip{sel.idealKlip ? ` (ideal ${sel.idealKlip[0]}–${sel.idealKlip[1]})` : ''}. </strong> : null}{sel.deskripsi}</> : 'Tidak memilih? Asisten memilih yang paling cocok.'}
      </p>

      {sel && (
        <div className="mode-edit" id="mode-edit">
          <div className="seg" role="radiogroup" aria-label="Mode edit">
            {([['ikuti', 'Ikuti referensi'], ['custom', 'Custom']] as const).map(([m, label]) => (
              <button key={m} id={`mode-edit-btn-${m}`} role="radio" aria-checked={mode === m}
                className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
            ))}
          </div>
          <p className="hint" id="mode-edit-hint">{mode === 'ikuti'
            ? 'Struktur, teks, dan logo mengikuti video contoh. Yang kosong diingatkan sebelum edit.'
            : 'Gaya dari pattern, durasi dan teks bebas diatur. Tanpa pengingat.'}</p>
        </div>
      )}

      <label className="field">Kualitas asisten
        <select id="model-select" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="claude-sonnet-5-5">Standar (cepat, hemat)</option>
          <option value="claude-opus-5-5">Teliti (lebih lambat)</option>
        </select>
      </label>
      {preview?.video && <VideoDialog id="pattern-modal-preview" title={pretty(preview.name)} src={preview.video} onClose={() => setPreview(null)} />}
    </section>
  )
}

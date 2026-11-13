import { useState } from 'react'
import { Icon } from './icons'
import { VideoDialog } from './components/ui/Dialog'
import { pretty } from './util'
import type { Mode } from './useReferensi'
import './training.css'

type Pattern = { id: string; name: string; deskripsi: string; video?: string | null }
type Props = {
  folder: string
  onPick: () => void
  patterns: Pattern[]
  patternId: string
  setPatternId: (id: string) => void
  mode: Mode
  setMode: (m: Mode) => void
  model: string
  setModel: (m: string) => void
  onStart: () => void
  disabled: boolean
}

const MODE_HINT: Record<Mode, string> = {
  ikuti: 'Dinilai: jumlah shot, waktu cut (selisih maks ±0.15 dtk), dan efek tiap shot harus sama dengan video contoh.',
  custom: 'Dinilai hanya gayanya: grade warna, transisi, efek, dan bingkai. Durasi dan jumlah shot bebas.',
}

// Panel kiri tab Training gaya: pilih gaya, mode penilaian, folder klip uji, lalu Mulai training.
export default function TrainingPanel({ folder, onPick, patterns, patternId, setPatternId, mode, setMode, model, setModel, onStart, disabled }: Props) {
  const [preview, setPreview] = useState<Pattern | null>(null)
  const folderName = folder.split('/').filter(Boolean).pop() ?? ''
  return (
    <section className="card bahan training-panel" id="training-panel">
      <h2>Training gaya</h2>
      <p className="hint training-intro">Claude merender uji dengan klipmu, membandingkan dengan video contoh, lalu mengusulkan perbaikan gaya.</p>

      <h2 className="training-sub">Gaya yang dilatih</h2>
      <div className="patterns" id="training-pattern-list" role="radiogroup" aria-label="Gaya yang dilatih">
        {patterns.map((p) => (
          <div key={p.id} className="pat-row">
            <button id={`training-pattern-btn-${p.id}`} role="radio" aria-checked={patternId === p.id}
              className={`pat ${patternId === p.id ? 'on' : ''}`} title={p.deskripsi} onClick={() => setPatternId(p.id)}>
              <strong>{pretty(p.name)}</strong>
            </button>
            {p.video ? (
              <button id={`training-pattern-btn-preview-${p.id}`} className="btn ghost icon pat-play" aria-label="Lihat video contoh"
                title="Lihat video contoh" onClick={() => setPreview(p)}>
                <Icon name="play" size={14} />
              </button>
            ) : <span className="btn ghost icon pat-play pat-play-kosong" aria-hidden="true" />}
          </div>
        ))}
        {!patterns.length && <p className="hint">Belum ada gaya. Buat dulu di tab Gaya baru.</p>}
      </div>

      <h2 className="training-sub">Cara menilai</h2>
      <div className="seg" id="training-mode" role="radiogroup" aria-label="Cara menilai">
        {([['ikuti', 'Ikuti referensi'], ['custom', 'Custom']] as const).map(([m, label]) => (
          <button key={m} id={`training-mode-btn-${m}`} role="radio" aria-checked={mode === m}
            className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
        ))}
      </div>
      <p className="hint" id="training-mode-hint">{MODE_HINT[mode]}</p>

      <h2 className="training-sub">Klip uji</h2>
      <button id="training-btn-pick-folder" className={`picker ${folder ? 'set' : ''}`} onClick={onPick} title={folder}>
        <Icon name="folder" size={16} />
        <span className="picker-text">
          <strong>{folderName || 'Pilih folder'}</strong>
          <small>{folder || 'Folder klip yang dipakai untuk uji render'}</small>
        </span>
      </button>

      <label className="field">Kualitas asisten
        <select id="training-select-model" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="claude-sonnet-5-5">Standar (cepat, hemat)</option>
          <option value="claude-opus-5-5">Teliti (lebih lambat)</option>
        </select>
      </label>

      <button id="training-btn-start" className="btn primary block training-start" disabled={disabled} onClick={onStart}>
        <Icon name="play" size={14} />Mulai training
      </button>
      {!folder && <p className="hint" id="training-hint-folder">Pilih folder klip dulu.</p>}
      {preview?.video && <VideoDialog id="training-modal-preview" title={pretty(preview.name)} src={preview.video} onClose={() => setPreview(null)} />}
    </section>
  )
}

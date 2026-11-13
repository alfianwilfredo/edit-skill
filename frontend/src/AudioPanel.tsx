import { useRef, useState } from 'react'
import { useMusik, type AudioPattern } from './audio'
import { Icon } from './icons'
import type { Audio } from './overlay'

type Props = {
  audio: Audio | null | undefined
  onChange: (a: Audio | null) => void
  pattern: AudioPattern | undefined
}

const BASE = { volume: 1, mulai: 0, sinkron: true }

// Sumber audio, volume, titik mulai, ikut final atau tidak, dan sinkron cut ke ketukan.
export default function AudioPanel({ audio, onChange, pattern }: Props) {
  const musik = useMusik()
  const player = useRef<HTMLAudioElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const a = audio ?? null
  const sumber = a?.sumber ?? 'tanpa'
  const ketukanDefault = pattern?.sinkron ?? 'beat'
  const adaRef = !!pattern?.audioPanduan
  const set = (p: Partial<Audio>) => a && onChange({ ...a, ...p })

  const pilih = (s: Audio['sumber']) => {
    if (s === 'tanpa') return onChange(null)
    if (s === 'referensi') {
      if (!pattern?.audioPanduan) return
      return onChange({ ...BASE, sumber: 'referensi', file: pattern.audioPanduan, final: false, ketukan: ketukanDefault })
    }
    const file = a?.sumber === 'library' ? a.file : musik.list[0]?.file ?? ''
    onChange({ ...BASE, sumber: 'library', file, final: true, ketukan: ketukanDefault })
  }

  async function upload(f: File | undefined) {
    if (!f || !a) return
    setErr('')
    setUploading(true)
    try {
      const r = await musik.upload(f)
      set({ file: r.file, mulai: 0 })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const url = !a ? null : a.sumber === 'referensi' ? pattern?.audioUrl ?? null : musik.list.find((m) => m.file === a.file)?.url ?? null
  const keMulai = () => { const p = player.current; if (p && a && Math.abs(p.currentTime - a.mulai) > 0.3 && p.currentTime < a.mulai) p.currentTime = a.mulai }

  return (
    <>
      <div className="sec-head"><h2>Audio</h2><small className="muted">preview & sinkron</small></div>
      <div className="seg" role="radiogroup" aria-label="Sumber audio" id="overlay-audio-sumber">
        <button id="overlay-audio-btn-referensi" role="radio" aria-checked={sumber === 'referensi'} disabled={!adaRef}
          className={sumber === 'referensi' ? 'on' : ''} onClick={() => pilih('referensi')}
          title={adaRef ? 'Audio dari video contoh gaya ini' : 'Gaya ini tidak punya audio referensi'}>Referensi</button>
        <button id="overlay-audio-btn-library" role="radio" aria-checked={sumber === 'library'}
          className={sumber === 'library' ? 'on' : ''} onClick={() => pilih('library')}>Library</button>
        <button id="overlay-audio-btn-tanpa" role="radio" aria-checked={sumber === 'tanpa'}
          className={sumber === 'tanpa' ? 'on' : ''} onClick={() => pilih('tanpa')}>Tanpa</button>
      </div>
      {!adaRef && <p className="hint">{pattern ? 'Gaya ini tidak punya audio referensi.' : 'Pilih gaya untuk memakai audio referensinya.'}</p>}

      {a && a.sumber === 'library' && (
        <div className="lt-head">
          <select id="overlay-audio-select-file" aria-label="Musik" value={a.file} onChange={(e) => set({ file: e.target.value, mulai: 0 })}>
            {!musik.list.some((m) => m.file === a.file) && <option value={a.file}>{a.file ? a.file.split('/').pop() : 'Belum ada musik'}</option>}
            {musik.list.map((m) => <option key={m.file} value={m.file}>{m.name}</option>)}
          </select>
          <button id="overlay-audio-btn-upload" className="btn" disabled={uploading} onClick={() => fileInput.current?.click()}>
            <Icon name="plus" size={14} />{uploading ? 'Mengunggah…' : 'Upload'}
          </button>
          <input ref={fileInput} id="overlay-audio-input-file" type="file" accept="audio/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      )}
      {err && <p className="hint warn">{err}</p>}

      {a && (
        <>
          {url
            ? <audio id="overlay-audio-player" ref={player} className="au-player" controls preload="metadata" src={url}
                onLoadedMetadata={(e) => { e.currentTarget.currentTime = a.mulai }} onPlay={keMulai} />
            : <p className="hint">{a.sumber === 'library' ? 'Pilih atau upload musik.' : 'File audio referensi belum tersedia.'}</p>}
          <div className="ov-2">
            <label className="au-field">Mulai dari (detik)
              <input id="overlay-audio-input-mulai" className="no-spin" type="number" min={0} step={0.5} value={a.mulai}
                onChange={(e) => set({ mulai: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <button id="overlay-audio-btn-posisi" className="btn" disabled={!url}
              onClick={() => player.current && set({ mulai: Math.round(player.current.currentTime * 2) / 2 })}>Pakai posisi sekarang</button>
          </div>
          <label className="au-field">Volume {Math.round(a.volume * 100)}%
            <input id="overlay-audio-input-volume" type="range" min={0} max={1.5} step={0.05} value={a.volume}
              onChange={(e) => set({ volume: Number(e.target.value) })} />
          </label>
          <label className="check" htmlFor="overlay-audio-check-final">
            <input id="overlay-audio-check-final" type="checkbox" checked={a.final} onChange={(e) => set({ final: e.target.checked })} />
            Sertakan di video final
          </label>
          {a.final && a.sumber === 'referensi' && (
            <p className="hint warn">Audio referensi milik orang lain. Instagram bisa membisukan atau memblokir video ini.</p>
          )}
          {!a.final && <p className="hint">Final tanpa audio, tambahkan musik di Instagram. Ketukan tetap dipakai untuk sinkron cut.</p>}
          <div className="au-sync">
            <label className="check" htmlFor="overlay-audio-check-sinkron">
              <input id="overlay-audio-check-sinkron" type="checkbox" checked={a.sinkron} onChange={(e) => set({ sinkron: e.target.checked })} />
              Sinkron ke ketukan
            </label>
            {a.sinkron && (
              <div className="seg" role="radiogroup" aria-label="Ketukan">
                {(['beat', '2beat'] as const).map((k) => (
                  <button key={k} id={`overlay-audio-btn-ketukan-${k}`} className={a.ketukan === k ? 'on' : ''}
                    onClick={() => set({ ketukan: k })}>{k === 'beat' ? 'Beat' : '2 beat'}</button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

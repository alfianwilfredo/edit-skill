import { useState } from 'react'
import { api } from './api'
import { Icon } from './icons'
import './panels.css'

type Props = {
  folder: string
  busy: boolean
  ready: boolean
  onChat: (text: string) => void
  onSaved: (id: string) => void
}
type Note = { ok: boolean; text: string } | null
type AlurSlot = { slot: string; jenis_shot: string; durasi: number }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export default function RefPanel({ folder, busy, ready, onChat, onSaved }: Props) {
  const [video, setVideo] = useState('')
  const [name, setName] = useState('')
  const [draft, setDraft] = useState('')
  const [shots, setShots] = useState<string | null>(null)
  const [cuts, setCuts] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [note, setNote] = useState<Note>(null)

  const nameOk = SLUG.test(name)
  const hasDraft = draft !== ''
  const unfilled = (draft.match(/"\?"/g) ?? []).length
  const klip = (() => {
    try {
      const d = JSON.parse(draft)
      return { min: typeof d.min_klip === 'number' ? d.min_klip : null, saran: d.min_klip_saran_otomatis ?? null,
        ideal: Array.isArray(d.ideal_klip) ? d.ideal_klip as number[] : null }
    } catch { return null }
  })()
  const alur = (() => {
    try {
      const d = JSON.parse(draft)
      return Array.isArray(d.alur) ? (d.alur as AlurSlot[]) : []
    } catch { return [] }
  })()
  const videoName = video.split('/').pop() ?? ''

  function reset() {
    setVideo(''); setName(''); setDraft(''); setShots(null); setCuts(null); setSaved(false); setNote(null)
  }

  async function pick() {
    const r = await api<{ path: string | null }>('/api/pick-file', { method: 'POST' })
    if (r.path) setVideo(r.path)
  }

  async function loadDraft() {
    try {
      const r = await api<{ draft: string; shots: string | null; cuts: string | null }>(`/api/ref/draft?name=${encodeURIComponent(name)}`)
      setDraft(r.draft)
      setShots(r.shots)
      setCuts(r.cuts)
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message })
    }
  }

  async function analyze() {
    setNote(null)
    setSaved(false)
    setAnalyzing(true)
    try {
      const r = await api<{ dir: string }>('/api/ref/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video, name }),
      })
      await loadDraft()
      if (ready) {
        onChat(
          `Lengkapi draft pattern "${name}" dari video contoh. Lihat ${r.dir}/shots.jpg dan ${r.dir}/cuts.jpg. ` +
            `Isi semua field "?" di ${r.dir}/draft.json, termasuk min_klip dan ideal_klip (rekomendasi jumlah klip bahan, lihat SKILL.md), lalu tulis ulang file itu. ` +
            `Jangan simpan ke folder patterns, klien yang menyimpan lewat GUI. Kalau ada yang tidak yakin, tanya klien.`,
        )
      }
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message })
    } finally {
      setAnalyzing(false)
    }
  }

  async function save() {
    if (unfilled) return setNote({ ok: false, text: `Masih ada ${unfilled} isian "?". Minta asisten melengkapi, atau isi manual.` })
    let content: unknown
    try { content = JSON.parse(draft) } catch { return setNote({ ok: false, text: 'Format draft belum valid. Cek tanda kutip dan koma.' }) }
    try {
      await api('/api/pattern', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, content }),
      })
      setSaved(true)
      setNote({ ok: true, text: `Gaya "${name}" tersimpan dan sudah muncul di menu Edit reel.` })
      onSaved(name)
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message })
    }
  }

  return (
    <section className="card ref" id="ref-section">
      <div className="ref-head">
        <div>
          <h2 className="plain">Gaya baru dari video contoh</h2>
          <p className="hint">Punya reel yang disukai? Jadikan gaya edit yang bisa dipakai ulang.</p>
        </div>
        {(video || hasDraft) && <button id="ref-btn-reset" className="btn ghost" onClick={reset} disabled={busy || analyzing}><Icon name="refresh" size={16} />Mulai ulang</button>}
      </div>

      <div className="step">
        <span className="step-no">1</span>
        <div className="step-main">
          <h2>Video contoh</h2>
          <button id="ref-btn-pick" className={`picker ${video ? 'set' : ''}`} onClick={pick} title={video} disabled={analyzing}>
            <Icon name="film" />
            <span className="picker-text">
              <strong>{videoName || 'Pilih video'}</strong>
              <small>{video || 'File .mp4 atau .mov dari reel yang ingin ditiru'}</small>
            </span>
          </button>
        </div>
      </div>

      <div className="step">
        <span className="step-no">2</span>
        <div className="step-main">
          <h2>Nama gaya</h2>
          <input id="ref-input-name" value={name} placeholder="minimalis-hangat" disabled={analyzing}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
          <p className="hint">Huruf kecil, angka, dan tanda - saja. Tidak boleh sama dengan gaya yang sudah ada.</p>
          <button id="ref-btn-analyze" className="btn primary block" disabled={!video || !nameOk || analyzing || busy} onClick={analyze}>
            <Icon name="sparkle" size={16} />{analyzing ? 'Menganalisis video…' : 'Analisis video'}
          </button>
        </div>
      </div>

      {(shots || hasDraft) && (
        <div className="step">
          <span className="step-no">3</span>
          <div className="step-main">
            <h2>Hasil analisis</h2>
            <div className="ref-imgs">
              {shots && <figure><img id="ref-img-shots" src={shots} alt="Frame tiap shot" /><figcaption>Tiap shot</figcaption></figure>}
              {cuts && <figure><img id="ref-img-cuts" src={cuts} alt="Frame di titik transisi" /><figcaption>Titik transisi</figcaption></figure>}
            </div>
            {alur.length > 0 && (
              <table className="ref-alur" id="ref-alur-table">
                <thead><tr><th>#</th><th>Slot</th><th>Durasi</th><th>Deskripsi shot</th></tr></thead>
                <tbody>
                  {alur.map((s, i) => (
                    <tr key={i}>
                      <td className="muted">{i + 1}</td>
                      <td><code>{s.slot}</code></td>
                      <td className="muted">{s.durasi?.toFixed(2)}s</td>
                      <td>{s.jenis_shot}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="hint">{ready ? 'Asisten melengkapi draft di chat sebelah. Setelah selesai, tekan Muat ulang draft.' : 'Asisten belum aktif. Isi draft secara manual di bawah.'}</p>
          </div>
        </div>
      )}

      {hasDraft && (
        <div className="step">
          <span className="step-no">4</span>
          <div className="step-main">
            <div className="chat-head">
              <h2 className="plain">Periksa dan simpan</h2>
              <button id="ref-btn-reload" className="btn ghost" disabled={busy} onClick={loadDraft}><Icon name="refresh" size={16} />Muat ulang draft</button>
            </div>
            <span className={`badge ${unfilled ? 'warn' : 'ok'}`}>{unfilled ? `${unfilled} isian "?" belum diisi` : 'Semua isian lengkap'}</span>
            {klip && (klip.min !== null || klip.saran !== null) && (
              <p className="hint" id="ref-hint-klip">
                {klip.min !== null
                  ? <>Rekomendasi bahan: <strong>minimal {klip.min} klip</strong>{klip.ideal ? ` (ideal ${klip.ideal[0]}–${klip.ideal[1]})` : ''}.</>
                  : <>Saran otomatis: minimal {klip.saran} klip. Asisten mengoreksinya setelah melihat tiap shot.</>}
              </p>
            )}
            <textarea id="ref-input-draft" className="mono draft" rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
            <div className="row">
              <button id="ref-btn-save" className="btn primary" disabled={saved || busy} onClick={save}>{saved ? 'Tersimpan' : 'Simpan sebagai gaya'}</button>
              <button id="ref-btn-test" className="btn" disabled={!saved || !folder || busy}
                onClick={() => onChat(`Render uji pattern "${name}" di folder klip ${folder}. Buat preview, periksa hasilnya, lalu laporkan path videonya.`)}>
                <Icon name="play" size={16} />Render uji
              </button>
            </div>
            {saved && !folder && <p className="hint">Untuk render uji, pilih folder klip dulu di menu Edit reel.</p>}
          </div>
        </div>
      )}

      {note && <div id="ref-notice" className={`notice ${note.ok ? 'ok' : 'err'}`} role="status"><Icon name={note.ok ? 'sparkle' : 'alert'} /><div className="notice-body">{note.text}</div></div>}
    </section>
  )
}

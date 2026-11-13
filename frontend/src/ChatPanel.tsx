import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './icons'
import GrillCard from './GrillCard'
import { parseGrill, type GrillJawaban } from './grill'
import './panels.css'

export type Msg = { role: 'user' | 'assistant' | 'tool' | 'error'; text: string }

type Props = {
  id: string
  msgs: Msg[]
  busy: boolean
  ready: boolean
  input: string
  setInput: (v: string) => void
  onSend: (text: string) => void
  onNew: () => void
  empty: ReactNode
  quick?: ReactNode
  placeholder: string
  progress?: ReactNode // kartu progres job tab ini (jalan, atau hasil terakhir)
  // Kartu pertanyaan asisten; tanpa ini blok ```pertanyaan tampil sebagai teks biasa.
  grill?: { jawaban: Record<number, GrillJawaban>; onAnswer: (i: number, j: GrillJawaban, text: string) => void }
}

export default function ChatPanel({ id, msgs, busy, ready, input, setInput, onSend, onNew, empty, quick, placeholder, progress, grill }: Props) {
  const thread = useRef<HTMLDivElement>(null)
  const adaKartu = !!progress
  // Gulir hanya area chat, bukan seluruh halaman.
  useEffect(() => {
    const t = thread.current
    if (t) t.scrollTo({ top: t.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy, adaKartu])

  return (
    <section className="chat card" id={`${id}-chat-section`}>
      <div className="chat-head">
        <div className="who">
          <span className="avatar"><Icon name="sparkle" size={16} /></span>
          <div>
            <strong>Asisten</strong>
            <small className={busy ? 'live' : ''}>{busy ? 'Sedang bekerja…' : ready ? 'Siap' : 'Belum aktif'}</small>
          </div>
        </div>
        <button id={`${id}-chat-btn-new`} className="btn ghost" onClick={onNew} disabled={busy}><Icon name="plus" size={16} />Chat baru</button>
      </div>

      <div className="thread" id={`${id}-chat-thread`} ref={thread}>
        {msgs.length === 0 && <div className="empty">{empty}</div>}
        {msgs.map((m, i) => {
          if (m.role === 'tool') return <div key={i} className="msg tool"><i />{m.text}</div>
          const g = grill && m.role === 'assistant' ? parseGrill(m.text) : null
          if (!g || !grill) return <div key={i} className={`msg ${m.role}`}>{m.text}</div>
          return (
            <Fragment key={i}>
              {g.before && <div className="msg assistant">{g.before}</div>}
              <GrillCard chatId={id} msgIndex={i} data={g.data} saved={grill.jawaban[i]} disabled={busy || !ready}
                answered={msgs.some((x, k) => k > i && x.role === 'user')} onAnswer={(j, text) => grill.onAnswer(i, j, text)} />
              {g.after && <div className="msg assistant">{g.after}</div>}
            </Fragment>
          )
        })}
        {progress ?? (busy && <div className="msg assistant typing" aria-label="Asisten sedang bekerja"><span /><span /><span /></div>)}
      </div>

      <div className="dock">
        {quick && <div className="quick">{quick}</div>}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); onSend(input) }}>
          <textarea id={`${id}-chat-input-message`} rows={1} value={input} placeholder={placeholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input) } }} />
          <button id={`${id}-chat-btn-send`} className="send" aria-label="Kirim" disabled={busy || !input.trim() || !ready}><Icon name="send" /></button>
        </form>
      </div>
    </section>
  )
}

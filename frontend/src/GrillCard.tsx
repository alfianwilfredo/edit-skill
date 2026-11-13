import { useState } from 'react'
import { TEKS_KERJAKAN, TEKS_LANGSUNG, teksJawaban, terjawab, type GrillData, type GrillJawaban, type GrillPertanyaan } from './grill'
import './grill.css'

type Props = {
  chatId: string
  msgIndex: number
  data: GrillData
  saved?: GrillJawaban // jawaban yang pernah dikirim lewat kartu ini
  answered: boolean // sudah ada pesan user setelah kartu
  disabled: boolean // busy / belum siap
  onAnswer: (j: GrillJawaban, text: string) => void
}

const disarankan = (qs: GrillPertanyaan[]) =>
  Object.fromEntries(qs.map((q) => [q.id, q.opsi.flatMap((o, n) => (o.disarankan ? [n] : []))]))

export default function GrillCard({ chatId, msgIndex, data, saved, answered, disabled, onAnswer }: Props) {
  const [pilih, setPilih] = useState<Record<string, number[]>>(saved?.pilih ?? {})
  const [lainnya, setLainnya] = useState<Record<string, string>>(saved?.lainnya ?? {})
  const [buka, setBuka] = useState<Record<string, boolean>>({})
  const p = `grill-card-${msgIndex}`
  const kunci = answered || disabled
  // Read-only: tampilkan jawaban tersimpan; tanpa jawaban tersimpan berarti dijawab lewat chat.
  const tampil = answered ? saved : { cara: 'kirim' as const, pilih, lainnya }
  const status = answered && (!saved ? 'Dijawab lewat chat'
    : saved.cara === 'langsung' ? 'Dijawab: pakai opsi yang disarankan'
      : saved.cara === 'kerjakan' ? 'Disetujui' : 'Terjawab')

  if (data.jenis === 'ringkasan') {
    return (
      <div className={`grill${answered ? ' done' : ''}`} id={p}>
        <strong className="grill-judul">Yang akan saya ubah:</strong>
        <ul className="grill-ringkas">{data.ringkasan.map((r, i) => <li key={i}>{r}</li>)}</ul>
        {status && <small className="grill-status">{status}</small>}
        {!answered && (
          <div className="grill-aksi">
            <button id={`${p}-btn-kerjakan`} className="btn primary" disabled={kunci}
              onClick={() => onAnswer({ cara: 'kerjakan', pilih: {}, lainnya: {} }, TEKS_KERJAKAN)}>Kerjakan</button>
            <button id={`${p}-btn-ubah`} className="btn" disabled={kunci}
              onClick={() => document.getElementById(`${chatId}-chat-input-message`)?.focus()}>Ubah lagi</button>
          </div>
        )}
      </div>
    )
  }

  const qs = data.pertanyaan
  const semua = qs.every((q) => terjawab(q, { pilih, lainnya }))
  const toggle = (q: GrillPertanyaan, n: number) => setPilih((s) => {
    const cur = s[q.id] ?? []
    const on = cur.includes(n)
    return { ...s, [q.id]: q.multi ? (on ? cur.filter((x) => x !== n) : [...cur, n]) : (on ? [] : [n]) }
  })

  return (
    <div className={`grill${answered ? ' done' : ''}`} id={p}>
      {qs.map((q) => {
        const qp = `${p}-q-${q.id}`
        const lain = tampil?.lainnya[q.id] ?? ''
        const lainBuka = answered ? !!lain.trim() : !!buka[q.id] || !!lain
        return (
          <fieldset key={q.id} className="grill-q" id={qp} disabled={kunci}>
            <legend>{q.judul}{q.multi && <small> (boleh pilih lebih dari satu)</small>}</legend>
            <div className="grill-opsi" role={q.multi ? 'group' : 'radiogroup'} aria-label={q.judul}>
              {q.opsi.map((o, n) => {
                const on = !!tampil?.pilih[q.id]?.includes(n)
                return (
                  <button key={n} type="button" id={`${qp}-opt-${n}`} aria-pressed={on}
                    className={`grill-opt${on ? ' on' : ''}${q.multi ? ' multi' : ''}`} onClick={() => toggle(q, n)}>
                    <i aria-hidden="true" />
                    <span>{o.label}</span>
                    {o.disarankan && <em>Disarankan</em>}
                  </button>
                )
              })}
              <button type="button" id={`${qp}-btn-lainnya`} aria-pressed={lainBuka} aria-expanded={lainBuka}
                className={`grill-opt lain${lainBuka ? ' on' : ''}`}
                onClick={() => setBuka((b) => ({ ...b, [q.id]: !lainBuka }))}>Lainnya…</button>
            </div>
            {lainBuka && (
              <input id={`${qp}-input-lainnya`} type="text" className="grill-lain" placeholder="Tulis jawaban Anda"
                value={lain} aria-label={`${q.judul}: jawaban lain`}
                onChange={(e) => setLainnya((s) => ({ ...s, [q.id]: e.target.value }))} />
            )}
          </fieldset>
        )
      })}
      {status && <small className="grill-status">{status}</small>}
      {!answered && (
        <div className="grill-aksi">
          <button id={`${p}-btn-submit`} className="btn primary" disabled={kunci || !semua}
            onClick={() => onAnswer({ cara: 'kirim', pilih, lainnya }, teksJawaban(qs, { pilih, lainnya }))}>Kirim jawaban</button>
          <button id={`${p}-btn-langsung`} className="btn" disabled={kunci}
            onClick={() => onAnswer({ cara: 'langsung', pilih: disarankan(qs), lainnya: {} }, TEKS_LANGSUNG)}>Langsung kerjakan</button>
        </div>
      )}
    </div>
  )
}

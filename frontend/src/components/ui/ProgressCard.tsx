import { useRef, useState } from 'react'
import type { JobView, TahapStatus } from '../../useJob'

type Props = { job: JobView; onBatal: () => Promise<void>; onPerbaiki: (text: string) => void }

const TANDA: Record<TahapStatus, string> = { selesai: '✓', jalan: '●', belum: '○', cache: '✓', gagal: '✕' }
const tanpaTitik = (s: string) => s.trim().replace(/[.\s]+$/, '')

function sisaWaktu(detik: number | null): string | null {
  if (detik == null) return null
  return detik >= 60 ? `± ${Math.round(detik / 60)} menit lagi` : `± ${Math.max(5, Math.round(detik / 5) * 5)} detik lagi`
}

// Kartu progres proses latar: bar, persen, tahap, batal, dan detail teknis.
export default function ProgressCard({ job, onBatal, onPerbaiki }: Props) {
  const [detail, setDetail] = useState(false)
  const [membatalkan, setMembatalkan] = useState(false)
  const isSubmittingRef = useRef(false)
  const jalan = job.status === 'jalan'
  const persen = job.status === 'selesai' ? 100 : job.persen
  const eta = jalan && job.persen != null && job.persen >= 10 ? sisaWaktu(job.eta_detik) : null

  async function batal() {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setMembatalkan(true)
    try { await onBatal() } catch { /* status tetap dari poll berikutnya */ } finally {
      isSubmittingRef.current = false
      setMembatalkan(false)
    }
  }

  const perbaiki = () => {
    const saran = job.saran ? ` ${tanpaTitik(job.saran)}.` : ''
    onPerbaiki(`Proses gagal: ${tanpaTitik(job.error || job.pesan || 'terjadi kesalahan')}.${saran} Perbaiki lalu jalankan lagi.`)
  }

  const judul = { jalan: job.pesan || 'Sedang bekerja…', selesai: 'Selesai', gagal: 'Proses gagal', batal: 'Dibatalkan' }[job.status]

  return (
    <div className={`progress-card ${job.status}`} id="progress-card" role="status" aria-live="polite">
      <div className="pc-head">
        <div className="pc-text">
          <strong>{judul}</strong>
          {jalan && job.aktivitas && <small>{job.aktivitas}</small>}
          {eta && <small>{eta}</small>}
        </div>
        {persen != null && job.status !== 'batal' && <span className="pc-persen">{persen}%</span>}
      </div>

      <div className={`pc-bar ${persen == null && jalan ? 'tak-tentu' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={persen ?? undefined}>
        <i style={{ width: `${persen ?? (jalan ? 30 : 0)}%` }} />
      </div>

      {job.status === 'gagal' && (
        <div className="pc-gagal">
          {job.error && <p>{job.error}</p>}
          {job.saran && <p className="pc-saran">Saran: {job.saran}</p>}
        </div>
      )}

      {job.tahap.length > 0 && (
        <ul className="pc-tahap">
          {job.tahap.map((t) => (
            <li key={t.id} id={`progress-tahap-${t.id}`} className={t.status}>
              <span className="pc-tanda" aria-hidden>{TANDA[t.status]}</span>
              <span className="pc-nama">{t.nama}</span>
              {t.status === 'cache' && <small>sudah ada</small>}
            </li>
          ))}
        </ul>
      )}

      <div className="pc-aksi">
        {jalan && (
          <button id="progress-btn-cancel" className="btn" disabled={membatalkan} onClick={batal}>
            {membatalkan ? 'Membatalkan…' : 'Batalkan'}
          </button>
        )}
        {job.status === 'gagal' && (
          <button id="progress-btn-fix" className="btn primary" onClick={perbaiki}>Minta asisten perbaiki</button>
        )}
        {job.log && (
          <button id="progress-btn-detail" className="btn ghost" aria-expanded={detail} onClick={() => setDetail((d) => !d)}>
            {detail ? 'Sembunyikan detail' : 'Detail'}
          </button>
        )}
      </div>
      {detail && job.log && <pre className="pc-log">{job.log}</pre>}
    </div>
  )
}

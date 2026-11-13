import { useRef, useState } from 'react'
import { Icon } from './icons'
import { Dialog } from './components/ui/Dialog'
import type { Cek, TrainingData } from './useTraining'
import './training.css'

type Props = { data: TrainingData | null; error: string; folder: string; onReload: () => void }

const status = (c: Cek) => (c.lolos === true ? '✓ Sesuai' : c.lolos === false ? '✗ Beda' : 'Tidak dinilai')

// Panel kanan tab Training gaya: video contoh vs hasil uji, lalu laporan penilaian.
export default function TrainingCompare({ data, error, folder, onReload }: Props) {
  const refV = useRef<HTMLVideoElement>(null)
  const ujiV = useRef<HTMLVideoElement>(null)
  const [main, setMain] = useState<Record<string, boolean>>({}) // video yang sedang diputar
  const [besar, setBesar] = useState(false)
  const lap = data?.laporan

  // Putar keduanya dari detik 0 bersamaan; bila salah satu sedang jalan, jeda keduanya.
  function bersamaan() {
    const vs = [refV.current, ujiV.current].filter((v): v is HTMLVideoElement => !!v)
    if (vs.some((v) => !v.paused)) return vs.forEach((v) => v.pause())
    vs.forEach((v) => { v.currentTime = 0 })
    vs.forEach((v) => { v.play().catch(() => {}) })
  }
  const vid = (id: string, label: string, src: string | null | undefined, ref: typeof refV, kosong: string) => (
    <figure className="tr-vid" id={`training-compare-${id}`}>
      <figcaption>{label}</figcaption>
      {src ? (
        <video id={`training-video-${id}`} ref={ref} src={src} controls playsInline muted preload="metadata"
          onPlay={() => setMain((m) => ({ ...m, [id]: true }))} onPause={() => setMain((m) => ({ ...m, [id]: false }))}
          onEmptied={() => setMain((m) => ({ ...m, [id]: false }))} />
      ) : <div className="tr-vid-kosong">{kosong}</div>}
    </figure>
  )

  return (
    <section className="card training-compare" id="training-compare">
      <div className="sec-head training-compare-head">
        <h2>Bandingkan</h2>
        <span className="training-compare-aksi">
          <button id="training-btn-play-both" className="btn" disabled={!data?.ref || !data?.video} onClick={bersamaan}>
            <Icon name="play" size={14} />{Object.values(main).some(Boolean) ? 'Jeda keduanya' : 'Putar bersamaan'}
          </button>
          {/* Hasil bisa selesai saat GUI tidak memantau (mis. server di-restart di tengah training). */}
          <button id="training-btn-refresh" className="btn ghost icon" onClick={onReload} aria-label="Muat ulang hasil" title="Muat ulang hasil">
            <Icon name="refresh" size={16} />
          </button>
        </span>
      </div>
      <div className="tr-vids">
        {vid('ref', 'Video contoh', data?.ref, refV, 'Gaya ini belum punya video contoh.')}
        {vid('uji', 'Hasil uji', data?.video, ujiV, 'Belum ada hasil uji.')}
      </div>

      <h2 className="training-sub">Hasil penilaian</h2>
      {error && <p className="hint warn" id="training-hint-error">Gagal memuat hasil training: {error}</p>}
      {!lap ? (
        <p className="hint tr-empty" id="training-empty">{folder ? 'Belum ada hasil training. Tekan Mulai training.' : 'Pilih folder klip dulu, lalu tekan Mulai training.'}</p>
      ) : (
        <div className="tr-lap" id="training-laporan">
          <div className="tr-meta">
            <span className={`tr-badge ${lap.lolos ? 'ok' : 'bad'}`} id="training-badge">{lap.lolos ? '✓ Lolos' : '✗ Belum lolos'}</span>
            <span className="muted">{lap.mode === 'ikuti' ? 'Ikuti referensi' : 'Custom'} · Putaran {lap.putaran}</span>
          </div>
          {lap.ringkasan && <p className="tr-ringkas">{lap.ringkasan}</p>}
          {lap.cek.length > 0 && (
            <div className="tr-table-wrap">
              <table className="tr-table" id="training-table-cek">
                <thead><tr><th>Aspek</th><th>Contoh</th><th>Hasil</th><th>Status</th></tr></thead>
                <tbody>
                  {lap.cek.map((c, i) => (
                    <tr key={i} id={`training-cek-${i}`} className={c.lolos === false ? 'beda' : ''}>
                      <td><strong>{c.nama}</strong>{c.catatan && <small>{c.catatan}</small>}</td>
                      <td>{c.contoh}</td>
                      <td>{c.hasil}</td>
                      <td className={`tr-st ${c.lolos === true ? 'ok' : c.lolos === false ? 'bad' : ''}`}>{status(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {data?.banding && (
        <>
          <h2 className="training-sub">Gambar perbandingan</h2>
          <button id="training-btn-banding" className="tr-banding" onClick={() => setBesar(true)} aria-label="Perbesar gambar perbandingan">
            <img src={data.banding} alt="Perbandingan frame video contoh dan hasil uji" />
          </button>
        </>
      )}
      {besar && data?.banding && (
        <Dialog id="training-modal-banding" title="Gambar perbandingan" onClose={() => setBesar(false)} wide>
          <img className="tr-banding-full" src={data.banding} alt="Perbandingan frame video contoh dan hasil uji" />
        </Dialog>
      )}
    </section>
  )
}

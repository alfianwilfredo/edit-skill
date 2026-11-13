import { useEffect, useState } from 'react'
import { Icon } from './icons'
import type { AudioPattern } from './audio'
import OverlayMockup from './OverlayMockup'
import OverlayPanel from './OverlayPanel'
import { kapanLabel, kapanSlot, viewOptions, type Font, type Kapan, type Overlay, type Referensi } from './overlay'
import { fileSrc, videoLabel } from './util'
import { formatDateTimeDisplay } from './utils/dateUtils'

type Video = { name: string; path: string; mtime: number }
type Props = {
  videos: Video[]
  tick: number // naik tiap render/chat selesai: pindah ke Hasil + muat ulang video
  onRefresh: () => void
  overlay: Overlay
  onOverlay: (o: Overlay) => void
  fonts: Font[]
  slot: number
  logoSrc: { hitam: string | null; putih: string | null }
  pattern?: AudioPattern
  aturan?: { ref: Referensi; konfirmTanpaLogo?: () => Promise<boolean> }
  fokus?: { teks: number | null; n: number } | null // naik n = arahkan ke isian yang kosong
}

export default function PhonePanel({ videos, tick, onRefresh, overlay, onOverlay, fonts, slot, logoSrc, pattern, aturan, fokus }: Props) {
  const [mode, setMode] = useState<'hasil' | 'atur'>('hasil')
  const [open, setOpenRaw] = useState<number | null>(null)
  const [view, setView] = useState<Kapan>('pembuka')
  const [pick, setPick] = useState('')
  const [seenTick, setSeenTick] = useState(tick)
  if (tick !== seenTick) { // render selesai: tampilkan hasil terbaru
    setSeenTick(tick)
    setPick('')
    if (videos.length) setMode('hasil')
  }

  const views = viewOptions(slot)
  const v = views.includes(view) ? view : 'pembuka'
  const current = videos.find((x) => x.path === pick) ?? videos[0] ?? null
  const setOpen = (i: number | null) => {
    setOpenRaw(i)
    if (i === null) return
    setMode('atur')
    const k = overlay.teks[i]?.kapan
    if (k !== undefined && k !== 'semua') setView(views.includes(k) ? k : 'penutup')
  }
  const edit = (o: Overlay) => { setMode('atur'); onOverlay(o) }
  const [seenFokus, setSeenFokus] = useState(fokus?.n ?? 0)
  const [fokusId, setFokusId] = useState('')
  if (fokus && fokus.n !== seenFokus) { // dari modal "Kembali isi"
    setSeenFokus(fokus.n)
    if (fokus.teks !== null) { setOpen(fokus.teks); setFokusId(`overlay-teks-input-isi-${fokus.teks}`) } else setFokusId('overlay-logo-pick')
  }
  useEffect(() => {
    if (!fokusId) return
    const r = requestAnimationFrame(() => {
      const el = document.getElementById(fokusId)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      ;(el?.matches('textarea') ? el : el?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true })
      setFokusId('')
    })
    return () => cancelAnimationFrame(r)
  }, [fokusId])

  return (
    <section className="card hasil" id="results-section">
      <div className="ph-bar">
        <div className="seg" role="tablist" aria-label="Tampilan phone">
          <button id="results-btn-mode-hasil" role="tab" aria-selected={mode === 'hasil'} className={mode === 'hasil' ? 'on' : ''} onClick={() => setMode('hasil')}>Hasil</button>
          <button id="results-btn-mode-atur" role="tab" aria-selected={mode === 'atur'} className={mode === 'atur' ? 'on' : ''} onClick={() => setMode('atur')}>Atur teks</button>
        </div>
        {mode === 'atur' ? (
          <select id="overlay-mockup-select-view" aria-label="Lihat shot" value={String(v)} onChange={(e) => {
            const x = e.target.value
            setView(/^\d+$/.test(x) ? Number(x) : (x as Kapan))
          }}>
            {views.map((k) => <option key={String(k)} value={String(k)}>{kapanLabel(k)}</option>)}
          </select>
        ) : (
          <button id="results-btn-refresh" className="btn ghost icon" onClick={onRefresh} aria-label="Muat ulang"><Icon name="refresh" size={16} /></button>
        )}
      </div>

      <div className="phone">
        {mode === 'atur'
          ? <OverlayMockup overlay={overlay} view={v} logoSrc={logoSrc} selected={open} onSelect={setOpen}
            logoKapan={aturan?.ref.logoSlot != null ? kapanSlot(aturan.ref.logoSlot, slot) : 'penutup'} />
          : current
            ? <video id="results-video-player" key={`${current.path}-${tick}`} controls playsInline src={`${fileSrc(current.path)}&v=${tick}`} />
            : <div className="phone-empty"><Icon name="film" size={24} /><span>Video hasil tampil di sini</span></div>}
      </div>
      {mode === 'atur' && <p className="hint center">Perkiraan posisi. Area bergaris tertutup UI Reels.</p>}

      {videos.length > 0 ? (
        <div className="ver-row">
          <select id="results-select-version" aria-label="Versi video" value={current?.path ?? ''}
            onChange={(e) => { setPick(e.target.value); setMode('hasil') }}>
            {videos.map((x) => (
              <option key={x.path} value={x.path}>{videoLabel(x.name)} · {x.name.includes('_preview') ? 'Preview' : 'Final'} · {formatDateTimeDisplay(x.mtime)}</option>
            ))}
          </select>
          {current && <a id="results-link-download" className="btn icon" href={fileSrc(current.path)} download aria-label="Unduh"><Icon name="download" size={16} /></a>}
        </div>
      ) : <p className="hint">Hasil tersimpan di folder <code>hasil</code> dalam folder klip.</p>}

      <OverlayPanel overlay={overlay} onChange={edit} fonts={fonts} slot={slot} logoSrc={logoSrc} open={open} setOpen={setOpen} pattern={pattern} aturan={aturan} />
    </section>
  )
}

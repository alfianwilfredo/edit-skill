import { useEffect, useRef, useState } from 'react'
import './App.css'
import { api } from './api'
import BahanPanel from './BahanPanel'
import ChatPanel, { type Msg } from './ChatPanel'
import Header from './Header'
import { tabAwal, tabHash, type Tab } from './tabs'
import { Icon } from './icons'
import Notices from './Notices'
import PhonePanel from './PhonePanel'
import RefPanel from './RefPanel'
import TrainingPanel from './TrainingPanel'
import TrainingCompare from './TrainingCompare'
import { useTraining } from './useTraining'
import { normAudio, type AudioPattern } from './audio'
import { useFonts, useOverlay, type RefTeks } from './overlay'
import { useKonfirmasi } from './components/ui/useKonfirmasi'
import { useReferensi } from './useReferensi'
import { useBreakpoint } from './useBreakpoint'
import { useJob, type JobView } from './useJob'
import ProgressCard from './components/ui/ProgressCard'
import { load, msgOf, save } from './util'
import type { GrillJawaban } from './grill'

type Pattern = { id: string; name: string; deskripsi: string; durasi: number | null; slot?: number; minKlip?: number | null; idealKlip?: [number, number] | null; teks?: RefTeks[]; logoSlot?: number | null; video?: string | null } & AudioPattern
type Status = { engine: 'cli' | 'api'; ffmpeg: boolean; python: boolean; key: boolean; logo: string | null; logoPutih: string | null; models: string[]; patterns: Pattern[] }
type Video = { name: string; path: string; mtime: number }
type Brand = { nama_studio: string; instagram: string; cta_default: string; catatan_gaya: string }
type Chats = Record<Tab, { id: string; msgs: Msg[] }>
type Pane = 'atur' | 'chat' | 'hasil'

const SUGGESTIONS = [
  'Pilih gaya yang paling cocok untuk klip saya',
  'Buat versi yang lebih cepat dan ritmis',
  'Ganti teks penutup jadi ajakan DM',
]
const newChat = () => ({ id: crypto.randomUUID(), msgs: [] as Msg[] })
const newChats = (): Chats => ({ edit: newChat(), ref: newChat(), training: newChat() })

export default function App() {
  const [tab, setTab] = useState<Tab>(tabAwal)
  const [pane, setPane] = useState<Pane>('atur')
  const [status, setStatus] = useState<Status | null>(null)
  const [folder, setFolder] = useState(load('ir_folder', ''))
  const [patternId, setPatternId] = useState(load('ir_pattern', ''))
  const [model, setModel] = useState(load('ir_model', 'claude-sonnet-5-5'))
  const [chats, setChats] = useState<Chats>(newChats)
  const [inputs, setInputs] = useState<Record<Tab, string>>({ edit: '', ref: '', training: '' })
  const [sending, setSending] = useState(false) // jeda antara POST dan job terdaftar
  const [kartuTutup, setKartuTutup] = useState<string | null>(null) // id job yang kartunya disembunyikan
  const [error, setError] = useState('')
  const [grillJawab, setGrillJawab] = useState<Record<string, Record<number, GrillJawaban>>>({}) // chatId -> msgIndex -> jawaban
  const [videos, setVideos] = useState<Video[]>([])
  const [tick, setTick] = useState(0)
  const [brand, setBrand] = useState<Brand | null>(null)
  const ov = useOverlay(folder)
  const fonts = useFonts()
  const bp = useBreakpoint()
  const isSubmittingRef = useRef(false)

  const refresh = () => api<Status>('/api/status').then(setStatus).catch((e) => setError(msgOf(e)))
  const loadVideos = (f = folder): Promise<Video[]> => f
    ? api<Video[]>(`/api/videos?folder=${encodeURIComponent(f)}`).catch(() => []).then((v) => { setVideos(v); return v })
    : Promise.resolve([])
  // Pindah ke Hasil + muat ulang video hanya bila ada video baru/berubah (chat tanya-jawab tidak memindah layar).
  const jejakRef = useRef('')
  const jejak = (v: Video[]) => v.map((x) => `${x.path}:${x.mtime}`).join('|')
  const done = () => { loadVideos().then((v) => { if (jejak(v) !== jejakRef.current) { jejakRef.current = jejak(v); setTick((n) => n + 1) } }) }

  useEffect(() => { refresh(); api<Brand>('/api/brand').then(setBrand).catch(() => {}) }, [])
  useEffect(() => { save('ir_folder', folder); loadVideos().then((v) => { jejakRef.current = jejak(v) }) }, [folder]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { save('ir_pattern', patternId) }, [patternId])
  useEffect(() => { save('ir_model', model) }, [model])
  useEffect(() => { save('ir_tab', tab); history.replaceState(null, '', tabHash(tab)) }, [tab])

  const pattern = status?.patterns.find((p) => p.id === patternId)
  const tr = useTraining(folder, status?.patterns ?? [], patternId)
  const konfirmasi = useKonfirmasi()
  const [fokus, setFokus] = useState<{ teks: number | null; n: number } | null>(null)
  const rf = useReferensi({
    folder, pattern, ov, tanya: konfirmasi.tanya,
    fokus: (teks) => { if (bp !== 'desk') setPane('hasil'); setFokus((f) => ({ teks, n: (f?.n ?? 0) + 1 })) },
  })

  // Selaraskan audio overlay dengan pattern (default audio referensi, ganti saat pattern berganti).
  // Hanya setelah overlay folder ini dimuat dan status siap, supaya tidak menimpa file dengan default.
  useEffect(() => {
    if (!ov.loaded || !status) return
    const next = normAudio(ov.overlay.audio, pattern)
    if (JSON.stringify(next) !== JSON.stringify(ov.overlay.audio)) ov.update({ ...ov.overlay, audio: next })
  }, [ov.loaded, ov.overlay, status, pattern]) // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !!(status?.ffmpeg && status?.python && status?.key)
  const switchTab = (t: Tab) => {
    setTab(t)
    setPane('atur')
    setError('')
  }
  const push = (t: Tab, m: Msg[]) => setChats((c) => ({ ...c, [t]: { ...c[t], msgs: [...c[t].msgs, ...m] } }))
  const job = useJob({
    onEvents: (t, ev) => push(t, ev.map((e) => ({ role: e.kind === 'tool' ? 'tool' : 'assistant', text: e.text }))),
    onEnd: (j) => {
      done()
      ov.reload() // asisten bisa mengubah overlay.json lewat chat
      if (j.tab === 'training') tr.reload() // render uji & laporan baru
      if (j.status === 'selesai' && j.jenis === 'render' && bp !== 'desk') setPane('hasil')
    },
  })
  const busy = sending || job.job?.status === 'jalan'

  // Mulai job di server (POST balas 202 {jobId}); progres & event datang dari polling useJob.
  async function mulaiJob(url: string, body: object, t: Tab, jenis: JobView['jenis']) {
    setSending(true)
    setKartuTutup(job.job?.id ?? null) // kartu hasil lama hilang saat kirim berikutnya
    try {
      const r = await api<{ jobId: string }>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      setKartuTutup(null)
      job.start(r.jobId, t, jenis)
    } finally {
      setSending(false)
    }
  }

  async function pickFolder() {
    const r = await api<{ path: string | null }>('/api/pick-folder', { method: 'POST' })
    if (r.path) setFolder(r.path)
  }

  // t ditentukan pemanggil supaya pesan dari menu Gaya baru tidak masuk ke chat Edit reel.
  async function send(text: string, t: Tab, jenis: JobView['jenis'] = 'chat') {
    if (!text.trim() || busy || isSubmittingRef.current) return
    if (t !== 'ref' && !folder) return setError('Pilih folder klip dulu.')
    isSubmittingRef.current = true
    setError('')
    if (bp === 'mob') setPane('chat')
    push(t, [{ role: 'user', text }])
    setInputs((i) => ({ ...i, [t]: '' }))
    try {
      await mulaiJob('/api/chat', { sessionId: chats[t].id, message: text, folder, model, tab: t, jenis }, t, jenis)
    } catch (e) {
      push(t, [{ role: 'error', text: msgOf(e) }])
    } finally {
      isSubmittingRef.current = false
    }
  }

  async function startEdit() {
    if (busy || !(await rf.cekSebelum())) return
    try { await ov.saveNow() } catch (e) { return setError(msgOf(e)) }
    const mode = !pattern ? '' : rf.mode === 'ikuti'
      ? ' Mode: ikuti referensi. Salin alur pattern persis (jumlah dan urutan slot, durasi, transisi, efek, bingkai, akhir, logo_segmen, pembuka_segmen); jangan buang atau tukar slot, karena teks overlay memakai nomor shot pattern.'
      : ' Mode: custom. Pattern hanya titik awal gaya (grade, transisi, efek, bingkai); durasi dan jumlah segmen boleh disesuaikan dengan klip. Tulis "mode": "custom" di plan.'
    send(`Edit klip di folder klip ${pattern ? `pakai pattern "${pattern.name}"` : 'pilih pattern yang paling cocok'}.${mode} Teks dan logo sudah diatur di _edit/overlay.json dari GUI, jangan isi teks/logo di plan dan jangan tanya isi teks. Peran klip (pembuka, penutup, jangan dipakai) ada di _edit/klip.json, wajib diikuti.`, 'edit', 'edit')
  }

  // Render ulang teks & logo dari plan terakhir, tanpa asisten.
  async function applyOverlay() {
    if (isSubmittingRef.current || busy || !folder) return
    isSubmittingRef.current = true
    if (!(await rf.cekSebelum())) { isSubmittingRef.current = false; return }
    setError('')
    try {
      await ov.saveNow()
      await mulaiJob('/api/render-overlay', { folder }, 'edit', 'render') // sukses -> pane Hasil (onEnd)
    } catch (e) {
      setError(msgOf(e))
    } finally {
      isSubmittingRef.current = false
    }
  }

  const chatProps = (t: Tab) => ({
    id: t, msgs: chats[t].msgs, busy, ready, input: inputs[t],
    setInput: (v: string) => setInputs((i) => ({ ...i, [t]: v })),
    onNew: () => { setChats((c) => ({ ...c, [t]: { id: crypto.randomUUID(), msgs: [] } })); setKartuTutup(job.job?.id ?? null) },
    progress: kartu(t),
  })
  // Kartu pertanyaan asisten (```pertanyaan) untuk tab Edit reel & Training gaya.
  function jawabGrill(t: Tab, i: number, j: GrillJawaban, text: string) {
    if (busy || !folder) return send(text, t) // send menampilkan error, jawaban tidak disimpan
    const cid = chats[t].id
    setGrillJawab((g) => ({ ...g, [cid]: { ...g[cid], [i]: j } }))
    send(text, t)
  }
  const startTraining = () => tr.pattern && send(`Training gaya "${tr.pattern.name}" mode ${tr.mode === 'ikuti' ? 'ikuti referensi' : 'custom'}. Klip uji dari folder klip. Ikuti "Alur: training gaya".`, 'training')
  // Kartu tampil saat job tab ini jalan; hasil terakhir (gagal/batal, atau selesai bila ada tahap) tetap sampai kirim berikutnya.
  function kartu(t: Tab) {
    const j = job.job
    if (!j || j.tab !== t || j.id === kartuTutup) return undefined
    if (j.status === 'selesai' && !j.tahap.length) return undefined
    return <ProgressCard job={j} onBatal={job.batal} onPerbaiki={(text) => send(text, t)} />
  }
  // desk: semua pane tampil. tab: atur selalu, kanan chat/hasil bergantian. mob: satu pane.
  const show = (p: Pane) => bp === 'desk' || (bp === 'tab' ? p === 'atur' || (p === 'hasil') === (pane === 'hasil') : pane === p)
  const panes: [Pane, string, string][] = tab === 'ref'
    ? [['atur', 'Contoh', 'layers'], ['chat', 'Chat', 'chat']]
    : [['atur', 'Atur', 'sliders'], ['chat', 'Chat', 'chat'], ['hasil', 'Hasil', 'film']]
  const title = brand?.nama_studio && !brand.nama_studio.startsWith('ISI') ? brand.nama_studio : 'Studio Reel'

  return (
    <div className={`app bp-${bp}`}>
      <Header title={title} logo={status?.logo ?? null} tab={tab} onTab={switchTab} loaded={!!status}
        checks={[['FFmpeg', status?.ffmpeg], ['Python', status?.python], ['Asisten', status?.key]]} />
      {busy && job.job && bp !== 'desk' && (tab === 'ref' ? bp === 'mob' && pane !== 'chat' : !show('chat')) && (
        <div className="progress-mini" id="progress-mini-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.job.persen ?? undefined}>
          <div className="pm-bar"><i style={{ width: `${job.job.persen ?? 0}%` }} /></div>
          <span>{job.job.persen == null ? 'Memulai…' : `${job.job.persen}%`}</span>
        </div>
      )}
      <Notices status={status} error={error} onError={setError} onKeySaved={refresh} />

      {tab === 'ref' ? (
        <main className={`layout ref bp-${bp}`}>
          <div className="pane-atur" hidden={bp === 'mob' && pane !== 'atur'}>
            <RefPanel folder={folder} busy={busy} ready={ready} onChat={(text) => send(text, 'ref')}
              onSaved={(id) => { setPatternId(id); refresh() }} />
          </div>
          <div className="pane-chat" hidden={bp === 'mob' && pane !== 'chat'}>
            <ChatPanel {...chatProps('ref')} onSend={(text) => send(text, 'ref')} placeholder="Tanya atau koreksi draft, mis: transisi ketiga itu fade"
              empty={<>
                <span className="empty-icon"><Icon name="layers" size={24} /></span>
                <h3>Tiru gaya dari reel favorit</h3>
                <p>Pilih video contoh dan beri nama, lalu tekan <strong>Analisis video</strong>. Asisten mengisi draft gayanya di sini.</p>
              </>} />
          </div>
        </main>
      ) : (
        <main className={`layout bp-${bp}`}>
          <div className="pane-atur" hidden={!show('atur')}>
            {tab === 'training' ? (
              <TrainingPanel folder={folder} onPick={pickFolder} patterns={status?.patterns ?? []} patternId={tr.pattern?.id ?? ''}
                setPatternId={tr.setPattern} mode={tr.mode} setMode={tr.setMode} model={model} setModel={setModel}
                onStart={startTraining} disabled={busy || !ready || !folder || !tr.pattern} />
            ) : <BahanPanel folder={folder} onPick={pickFolder} patterns={status?.patterns ?? []} patternId={patternId}
              setPatternId={setPatternId} onNewPattern={() => switchTab('ref')} model={model} setModel={setModel}
              mode={rf.mode} setMode={rf.setMode} onApplyKlip={(text) => send(text, 'edit')} applyDisabled={busy || !ready} />}
          </div>
          {bp === 'tab' && (
            <div className="pane-tabs seg" role="tablist">
              {(['chat', 'hasil'] as const).map((p) => (
                <button key={p} id={`pane-tab-${p}`} role="tab" aria-selected={show(p)} className={show(p) ? 'on' : ''}
                  onClick={() => setPane(p)}>{p === 'chat' ? 'Chat' : tab === 'training' ? 'Hasil uji' : 'Hasil & teks'}</button>
              ))}
            </div>
          )}
          <div className="pane-chat" hidden={!show('chat')}>
            {tab === 'training' ? (
              <ChatPanel {...chatProps('training')} onSend={(text) => send(text, 'training')} grill={{ jawaban: grillJawab[chats.training.id] ?? {}, onAnswer: (i, j, text) => jawabGrill('training', i, j, text) }}
                placeholder="Tanya atau koreksi, mis: transisi shot 3 harusnya fade"
                empty={<>
                  <span className="empty-icon"><Icon name="check" size={24} /></span>
                  <h3>Latih gaya sampai mirip contoh</h3>
                  <p>Pilih gaya dan cara menilai, lalu tekan <strong>Mulai training</strong>. Asisten merender uji, membandingkan dengan video contoh, dan mengusulkan perbaikan di sini.</p>
                </>} />
            ) : <ChatPanel {...chatProps('edit')} onSend={(text) => send(text, 'edit')}
              grill={{ jawaban: grillJawab[chats.edit.id] ?? {}, onAnswer: (i, j, text) => jawabGrill('edit', i, j, text) }} placeholder="Tulis pesan, mis: shot kedua kurang bagus, ganti dengan klip dapur"
              empty={<>
                <span className="empty-icon"><Icon name="film" size={24} /></span>
                <h3>Siap mengedit reel</h3>
                <p>Pilih folder dan gaya, lalu tekan <strong>Mulai edit</strong>. Teks dan logo diatur di panel Hasil.</p>
                <div className="suggest">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={s} id={`chat-btn-suggest-${i}`} className="sug" onClick={() => setInputs((v) => ({ ...v, edit: s }))}>{s}</button>
                  ))}
                </div>
              </>}
              quick={<>
                <button id="chat-btn-start" className="btn primary" disabled={busy || !ready || !folder} onClick={startEdit}>
                  <Icon name="play" size={14} />Mulai edit
                </button>
                <button id="chat-btn-rerender" className="btn" disabled={busy || !ready || !folder} onClick={() => send('Render ulang versi final dari plan terakhir, lalu kirim path videonya.', 'edit', 'render')}>
                  <Icon name="refresh" size={14} />Render ulang
                </button>
                <button id="chat-btn-apply-overlay" className="btn" disabled={busy || !ready || !folder || !ov.hasPlan} onClick={applyOverlay}
                  title={ov.hasPlan ? 'Render ulang hanya teks, logo & audio' : 'Mulai edit dulu sampai ada plan'}>
                  <Icon name="check" size={14} />Terapkan teks, logo & audio
                </button>
              </>} />}
          </div>
          <div className="pane-hasil" hidden={!show('hasil')}>
            {tab === 'training' ? <TrainingCompare data={tr.data} error={tr.error} folder={folder} onReload={tr.reload} /> : <PhonePanel videos={videos} tick={tick} onRefresh={() => loadVideos()} overlay={ov.overlay} onOverlay={ov.update}
              fonts={fonts} slot={pattern?.slot ?? 0} logoSrc={{ hitam: status?.logo ?? null, putih: status?.logoPutih ?? null }} pattern={pattern}
              aturan={rf.ref ? { ref: rf.ref, konfirmTanpaLogo: rf.konfirmTanpaLogo } : undefined} fokus={fokus} />}
          </div>
        </main>
      )}

      {bp === 'mob' && (
        <nav className="bnav" id="app-bottom-nav" role="tablist">
          {panes.map(([p, label, icon]) => (
            <button key={p} id={`bnav-btn-${p}`} role="tab" aria-selected={pane === p} className={pane === p ? 'on' : ''} onClick={() => setPane(p)}>
              <Icon name={icon} size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      {konfirmasi.elemen}
    </div>
  )
}

import { Icon } from './icons'

export type Tab = 'edit' | 'ref'
type Check = readonly [string, boolean | undefined]
type Props = { title: string; logo: string | null; tab: Tab; onTab: (t: Tab) => void; checks: Check[]; loaded: boolean }

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'edit', label: 'Edit reel', icon: 'film' },
  { id: 'ref', label: 'Gaya baru', icon: 'layers' },
]

export default function Header({ title, logo, tab, onTab, checks, loaded }: Props) {
  const allOk = loaded && checks.every(([, ok]) => ok)
  const chips = checks.map(([label, ok]) => (
    <span key={label} className={`chip ${ok ? 'ok' : loaded ? 'bad' : ''}`}><i />{label}</span>
  ))
  return (
    <header className="top">
      <div className="brand">
        <div className={`brand-mark ${logo ? 'has-logo' : ''}`}>
          {logo ? <img src={logo} alt="" /> : <Icon name="film" size={18} />}
        </div>
        <div className="brand-text">
          <h1 id="app-title">{title}</h1>
          <p className="tagline">Klip interior jadi Reels 9:16</p>
        </div>
      </div>
      <nav className="tabs" id="app-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} id={`app-tab-${t.id}`} role="tab" aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => onTab(t.id)}>
            <Icon name={t.icon} size={15} /><span>{t.label}</span>
          </button>
        ))}
      </nav>
      {allOk || !loaded ? (
        <details className="status" id="app-status">
          <summary id="app-status-btn" aria-label="Status alat" className={`status-dot ${allOk ? 'ok' : ''}`}><i /></summary>
          <div className="status-pop">{chips}</div>
        </details>
      ) : (
        <div className="chips" id="app-status">{chips}</div>
      )}
    </header>
  )
}

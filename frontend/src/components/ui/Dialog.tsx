import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../icons'

type Props = { id: string; title: string; onClose: () => void; children: ReactNode; wide?: boolean }

// Dialog umum (mis. pratinjau video). Esc / klik latar = tutup, fokus awal di tombol tutup, scroll body dikunci.
export function Dialog({ id, title, onClose, children, wide }: Props) {
  const tutupRef = useRef<HTMLButtonElement>(null)
  const tutup = useEffectEvent(() => onClose())
  useEffect(() => {
    const asal = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    tutupRef.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') tutup() }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = overflow; asal?.focus?.() }
  }, [])
  // Portal ke body: di dalam panel, modal terkunci di stacking context panel dan tertutup panel lain.
  return createPortal(
    <div className="modal-bg" id={`${id}-backdrop`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${wide ? ' wide' : ''}`} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="modal-head">
          <h3 id={`${id}-title`}>{title}</h3>
          <button ref={tutupRef} id={`${id}-btn-close`} className="btn ghost icon" aria-label="Tutup" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

// Pratinjau satu video dalam Dialog.
export function VideoDialog({ id, title, src, onClose }: { id: string; title: string; src: string; onClose: () => void }) {
  return (
    <Dialog id={id} title={title} onClose={onClose} wide>
      <video id={`${id}-video`} className="modal-video" src={src} controls autoPlay playsInline />
    </Dialog>
  )
}

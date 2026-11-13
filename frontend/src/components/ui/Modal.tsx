import { useEffect, useRef, type ReactNode } from 'react'

export type Tanya = { id: string; judul: string; isi: ReactNode; ok: string; batal: string; utama?: 'ok' | 'batal' }

type Props = Tanya & { onJawab: (ok: boolean) => void }

// Dialog konfirmasi. Esc / klik latar = batal. Tombol utama mendapat fokus pertama.
export function Modal({ id, judul, isi, ok, batal, utama = 'batal', onJawab }: Props) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const asal = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('[data-utama]')?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onJawab(false)
      if (e.key !== 'Tab' || !box.current) return
      const b = Array.from(box.current.querySelectorAll<HTMLElement>('button'))
      const i = b.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey ? i <= 0 : i === b.length - 1) { e.preventDefault(); b[e.shiftKey ? b.length - 1 : 0].focus() }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); asal?.focus?.() }
  }, [onJawab])
  return (
    <div className="modal-bg" id={`${id}-backdrop`} onMouseDown={(e) => { if (e.target === e.currentTarget) onJawab(false) }}>
      <div className="modal" id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} ref={box}>
        <h3 id={`${id}-title`}>{judul}</h3>
        <div className="modal-isi">{isi}</div>
        <div className="modal-aksi">
          <button id={`${id}-btn-ok`} className={`btn ${utama === 'ok' ? 'primary' : ''}`} data-utama={utama === 'ok' || undefined} onClick={() => onJawab(true)}>{ok}</button>
          <button id={`${id}-btn-batal`} className={`btn ${utama === 'batal' ? 'primary' : ''}`} data-utama={utama === 'batal' || undefined} onClick={() => onJawab(false)}>{batal}</button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'

// desk >= 1180px (3 kolom), tab 768-1179px (2 kolom), mob < 768px (tab bawah).
export type Bp = 'desk' | 'tab' | 'mob'
const Q = ['(min-width: 1180px)', '(min-width: 768px)']
const get = (): Bp => (matchMedia(Q[0]).matches ? 'desk' : matchMedia(Q[1]).matches ? 'tab' : 'mob')

export function useBreakpoint() {
  const [bp, setBp] = useState<Bp>(get)
  useEffect(() => {
    const mqs = Q.map((q) => matchMedia(q))
    const on = () => setBp(get())
    mqs.forEach((m) => m.addEventListener('change', on))
    return () => mqs.forEach((m) => m.removeEventListener('change', on))
  }, [])
  return bp
}

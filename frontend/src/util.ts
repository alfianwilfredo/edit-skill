export const load = (k: string, d: string) => {
  try { return localStorage.getItem(k) ?? d } catch { return d }
}
export const save = (k: string, v: string) => {
  try { localStorage.setItem(k, v) } catch { /* private window: abaikan */ }
}
export const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
export const pretty = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
// reel_x_preview_v2.mp4 -> "X v2". Akhiran _vN dari render.py (hasil tidak pernah ditimpa).
export const videoLabel = (n: string) => {
  const base = n.replace(/\.mp4$/i, '').replace(/^reel_/, '')
  const v = base.match(/_v(\d+)$/)?.[1]
  return pretty(base.replace(/_v\d+$/, '').replace(/_preview$/, '')) + (v ? ` v${v}` : '')
}
export const fileSrc = (p: string) => `/api/file?p=${encodeURIComponent(p)}`

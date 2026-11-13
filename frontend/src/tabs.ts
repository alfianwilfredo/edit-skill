// Tab atas: id, label, ikon, dan hash URL.
import { load } from './util'

export type Tab = 'edit' | 'ref' | 'training'
export const TABS: { id: Tab; label: string; short: string; icon: string; hash: string }[] = [
  { id: 'edit', label: 'Edit reel', short: 'Edit', icon: 'film', hash: '' },
  { id: 'ref', label: 'Gaya baru', short: 'Gaya', icon: 'layers', hash: '#gaya-baru' },
  { id: 'training', label: 'Training gaya', short: 'Training', icon: 'check', hash: '#training' },
]
// Tab awal dari hash URL, lalu tab terakhir (ir_tab).
export const tabAwal = (): Tab => {
  const t = TABS.find((x) => x.hash && x.hash === location.hash)?.id ?? load('ir_tab', 'edit')
  return TABS.some((x) => x.id === t) ? (t as Tab) : 'edit'
}
export const tabHash = (t: Tab) => TABS.find((x) => x.id === t)?.hash || location.pathname

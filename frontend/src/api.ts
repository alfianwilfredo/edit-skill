// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON respons dinamis
export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Gagal (${res.status})`)
  return data
}

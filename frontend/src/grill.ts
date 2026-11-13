// Kartu pertanyaan ("grill card"): asisten menyisipkan satu blok ```pertanyaan {json}``` di pesannya.

export type GrillOpsi = { label: string; disarankan?: boolean }
export type GrillPertanyaan = { id: string; judul: string; multi?: boolean; opsi: GrillOpsi[] }
export type GrillData =
  | { jenis: 'tanya'; pertanyaan: GrillPertanyaan[] }
  | { jenis: 'ringkasan'; ringkasan: string[] }

// Jawaban yang dikirim dari kartu; disimpan per pesan supaya tetap tampil setelah dijawab.
export type GrillJawaban = {
  cara: 'kirim' | 'langsung' | 'kerjakan'
  pilih: Record<string, number[]> // id pertanyaan -> indeks opsi
  lainnya: Record<string, string>
}

const BLOK = /```pertanyaan[^\n]*\n([\s\S]*?)```/

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

function validasi(raw: unknown): GrillData | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.jenis === 'ringkasan') {
    if (!Array.isArray(o.ringkasan) || !o.ringkasan.length || !o.ringkasan.every(isStr)) return null
    return { jenis: 'ringkasan', ringkasan: o.ringkasan }
  }
  if (o.jenis !== 'tanya' || !Array.isArray(o.pertanyaan) || !o.pertanyaan.length) return null
  const pertanyaan: GrillPertanyaan[] = []
  const ids = new Set<string>()
  for (const q of o.pertanyaan as Record<string, unknown>[]) {
    if (!q || !isStr(q.id) || !isStr(q.judul) || ids.has(q.id) || !Array.isArray(q.opsi) || !q.opsi.length) return null
    const opsi: GrillOpsi[] = []
    for (const p of q.opsi as Record<string, unknown>[]) {
      if (!p || !isStr(p.label)) return null
      opsi.push({ label: p.label, disarankan: p.disarankan === true })
    }
    ids.add(q.id)
    pertanyaan.push({ id: q.id, judul: q.judul, multi: q.multi === true, opsi })
  }
  return { jenis: 'tanya', pertanyaan }
}

export function parseGrill(text: string): { before: string; after: string; data: GrillData } | null {
  const m = BLOK.exec(text)
  if (!m) return null
  let data: GrillData | null
  try { data = validasi(JSON.parse(m[1])) } catch { return null }
  if (!data) return null
  return { before: text.slice(0, m.index).trim(), after: text.slice(m.index + m[0].length).trim(), data }
}

export const TEKS_LANGSUNG = 'Langsung kerjakan: pakai semua opsi yang disarankan.'
export const TEKS_KERJAKAN = 'Kerjakan sesuai ringkasan.'

export const terjawab = (q: GrillPertanyaan, j: Pick<GrillJawaban, 'pilih' | 'lainnya'>) =>
  (j.pilih[q.id]?.length ?? 0) > 0 || !!j.lainnya[q.id]?.trim()

export function teksJawaban(qs: GrillPertanyaan[], j: Pick<GrillJawaban, 'pilih' | 'lainnya'>): string {
  const baris = qs.map((q) => {
    const label = (j.pilih[q.id] ?? []).map((n) => q.opsi[n]?.label).filter(Boolean).join(', ')
    const lain = j.lainnya[q.id]?.trim()
    return `- ${q.judul}: ${[label, lain && `Lainnya: ${lain}`].filter(Boolean).join('; ')}`
  })
  return `Jawaban:\n${baris.join('\n')}`
}

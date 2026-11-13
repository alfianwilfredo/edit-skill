const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const dua = (n: number) => String(n).padStart(2, '0')

// "Sen, 12 Agu 2026"
export function formatDateDisplay(t: number | string | Date) {
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return '-'
  return `${HARI[d.getDay()]}, ${dua(d.getDate())} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
}

// "14:30 Sen, 12 Agu 2026"
export function formatDateTimeDisplay(t: number | string | Date) {
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return '-'
  return `${dua(d.getHours())}:${dua(d.getMinutes())} ${formatDateDisplay(d)}`
}

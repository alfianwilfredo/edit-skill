import { Icon } from './icons'
import BarisList from './BarisList'
import FontPicker from './FontPicker'
import PosGrid from './PosGrid'
import { UKURAN, barisEfektif, geserPerBaris, lebarLayar, fontFamily, kapanLabel, kapanOptions, posLabel, type Font, type Kapan, type Teks } from './overlay'

type Props = {
  i: number; t: Teks; fonts: Font[]; slot: number; open: boolean
  contoh?: string // diisi = mode Ikuti referensi: waktu terkunci, tidak bisa dihapus, isi wajib
  onToggle: () => void; onChange: (t: Teks) => void; onRemove: () => void
}

export default function TeksRow({ i, t, fonts, slot, open, contoh, onToggle, onChange, onRemove }: Props) {
  const kunci = contoh !== undefined
  const kosong = !t.isi.trim()
  const set = <K extends keyof Teks>(k: K, v: Teks[K]) => onChange({ ...t, [k]: v })
  const panjang = barisEfektif(t).filter((b) => lebarLayar(b.isi, b.font, b.ukuran) > 0.84).map((b) => b.isi.trim().slice(0, 18))
  const first = t.isi.split('\n')[0] || (kunci ? `Isi teks ${i + 1}` : 'Teks kosong')

  return (
    <div className={`ov-teks ${open ? 'open' : ''} ${kunci && kosong ? 'wajib' : ''}`} id={`overlay-teks-card-${i}`}>
      <div className="ov-sum">
        <button id={`overlay-teks-btn-toggle-${i}`} className="ov-sum-btn" onClick={onToggle} aria-expanded={open}>
          <span className="ov-sum-isi" style={{ fontFamily: fontFamily(barisEfektif(t)[0].font) }}>{first}</span>
          <span className="ov-sum-meta">{posLabel(t.posisi)} · {kapanLabel(t.kapan)} · {t.ukuran}
            {kunci && <span id={`overlay-teks-badge-ref-${i}`} className={`badge-ref ${kosong ? 'wajib' : ''}`}>{kosong ? 'Referensi: wajib' : 'Referensi'}</span>}</span>
        </button>
        {!kunci && <button id={`overlay-teks-btn-remove-${i}`} className="btn ghost icon" onClick={onRemove} aria-label={`Hapus teks ${i + 1}`}>
          <Icon name="trash" size={14} />
        </button>}
      </div>
      {open && (
        <div className="ov-edit">
          <textarea id={`overlay-teks-input-isi-${i}`} rows={Math.min(5, Math.max(2, t.isi.split('\n').length))} value={t.isi} placeholder={kunci && contoh ? `Contoh di referensi: ${contoh.replace(/\n/g, ' / ')}` : 'Isi teks (Enter = baris baru)'}
            onChange={(e) => onChange({ ...t, isi: e.target.value, per_baris: geserPerBaris(t.isi, e.target.value, t.per_baris) })} />
          {panjang.length > 0 && <p className="hint warn">Terlalu lebar, bisa terpotong: “{panjang.join('”, “')}”. Pecah dengan Enter atau perkecil ukuran.</p>}
          <div className="ov-2">
            <FontPicker id={`overlay-teks-font-${i}`} value={t.font} fonts={fonts} sample={t.isi} onChange={(f) => set('font', f)} />
            <select id={`overlay-teks-select-kapan-${i}`} aria-label="Kapan muncul" value={String(t.kapan)} disabled={kunci}
              title={kunci ? 'Waktu mengikuti video contoh' : undefined}
              onChange={(e) => { const v = e.target.value; set('kapan', /^\d+$/.test(v) ? Number(v) : (v as Kapan)) }}>
              {kapanOptions(slot, t.kapan).map((k) => <option key={String(k)} value={String(k)}>{kapanLabel(k)}</option>)}
            </select>
          </div>
          <BarisList i={i} t={t} fonts={fonts} onChange={(pb) => set('per_baris', pb)} />
          <div className="ov-3">
            <PosGrid id={`overlay-teks-pos-${i}`} value={t.posisi} onChange={(p) => set('posisi', p)} label="Posisi teks" />
            <div className="ov-col">
              <div className="seg" role="radiogroup" aria-label="Ukuran">
                {UKURAN.map((u) => (
                  <button key={u} id={`overlay-teks-btn-ukuran-${i}-${u}`} className={t.ukuran === u ? 'on' : ''} onClick={() => set('ukuran', u)}>{u}</button>
                ))}
              </div>
              <div className="seg" role="radiogroup" aria-label="Warna">
                {(['putih', 'hitam'] as const).map((w) => (
                  <button key={w} id={`overlay-teks-btn-warna-${i}-${w}`} className={t.warna === w ? 'on' : ''} onClick={() => set('warna', w)}>
                    <span className={`dot ${w}`} />{w === 'putih' ? 'Putih' : 'Hitam'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

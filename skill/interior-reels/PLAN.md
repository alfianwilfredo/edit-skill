# Format plan.json (input `render.py`)

Path relatif dihitung dari folder plan.json. Paling aman pakai path absolut.

```json
{
  "output": "/path/hasil/reel_rumah-tropis.mp4",
  "grade": {"kontras": 1.04, "saturasi": 0.92, "terang": 0.01, "hangat": 0.12},
  "font": "Poppins-Light.ttf",
  "segmen": [
    {"file": "/path/klip/IMG_2201.MOV", "mulai": 3.2, "durasi": 2.8, "gerak": "zoom-in"},
    {"file": "/path/klip/IMG_2205.MOV", "mulai": 0.5, "durasi": 2.2,
     "transisi": {"jenis": "fade", "durasi": 0.6}},
    {"file": "/path/klip/IMG_2210.MOV", "mulai": 1.0, "durasi": 1.6, "isi": "blur",
     "kecepatan": 1.5, "transisi": {"jenis": "cut"}}
  ],
  "teks": [
    {"isi": "Rumah Tropis\nBintaro", "gaya": "judul", "segmen": 0, "mulai": 0.4, "animasi": "fade-naik"},
    {"isi": "Kayu jati solid", "gaya": "label", "segmen": 2, "latar": true}
  ],
  "logo": {"file": "/path/logo.png", "posisi": "bawah", "segmen": -1, "ukuran": 0.22},
  "musik": {"file": "/path/musik.mp3", "volume": 0.8}
}
```

Teks dan logo untuk reel klien tidak ditulis di sini. Keduanya diambil dari `overlay.json` (lihat bagian di bawah). Field `teks` dan `logo` di plan hanya dipakai kalau `overlay.json` tidak ada (format lama).

## overlay.json (teks dan logo dari GUI)

Lokasi: `<folder klip>/_edit/overlay.json`, satu folder dengan `plan.json`. GUI menulis file ini dari bagian Detail. Asisten boleh mengeditnya kalau klien meminta lewat chat. Kalau file ini ada, `render.py` mengabaikan `teks` dan `logo` di plan dan memakai isi file ini.

```json
{
  "logo": {"warna": "putih", "posisi": "bawah", "ukuran": "M",
           "teks": [{"isi": "@keziakarin.studio", "font": "Poppins-Light.ttf",
                     "letak": "bawah", "ukuran": "S", "warna": "putih"}]},
  "teks": [
    {"isi": "Rumah Tropis\nBintaro", "font": "DMSerifDisplay-Regular.ttf",
     "posisi": "tengah", "kapan": "pembuka", "ukuran": "L", "warna": "putih"}
  ]
}
```

| field | nilai |
|---|---|
| `logo` | `null` berarti tanpa logo. Logo selalu muncul di shot terakhir. |
| `logo.warna` | `hitam` (`brand/logo.png`) atau `putih` (`brand/logo-putih.png`) |
| `logo.posisi` | grid 3×3 sama seperti `teks[].posisi` (`atas-kiri` … `bawah-kanan`) |
| `logo.ukuran` | `S`, `M`, `L`, `XL` = lebar 16%, 22%, 30%, 40% layar |
| `logo.teks[]` | opsional. Teks yang menempel pada logo dan tampil bersamanya. Field: `isi`, `font` (boleh beda per teks), `letak` (`atas` atau `bawah` logo), `ukuran`, `warna`. Rata mengikuti kolom logo. |
| `teks[].isi` | teksnya. `\n` untuk baris baru |
| `teks[].font` | nama file di `fonts/` (daftar + keterangan di `fonts/fonts.json`) |
| `teks[].posisi` | `atas-kiri`, `atas`, `atas-kanan`, `tengah-kiri`, `tengah`, `tengah-kanan`, `bawah-kiri`, `bawah`, `bawah-kanan` |
| `teks[].kapan` | `pembuka` (shot 1), `penutup` (shot terakhir), `semua` (sepanjang video), atau angka shot mulai dari 1. Angka yang melebihi jumlah shot dipindah ke penutup dengan peringatan. |
| `teks[].ukuran` | `S`, `M`, `L`, `XL` = tinggi huruf 2.6%, 3.6%, 5.2%, 7.5% layar |
| `teks[].per_baris` | opsional. Daftar sejajar dengan baris `isi` (urutan baris, mulai dari baris pertama). Tiap item `null` (ikut utama) atau `{"font": "...ttf", "ukuran": "XL"}`; field yang tidak diisi ikut `font`/`ukuran` utama. Contoh: `"isi": "ALL THINGS\nNOBA", "per_baris": [null, {"font": "DMSerifDisplay-Regular.ttf", "ukuran": "XL"}]`. Pengaturan untuk baris yang tidak ada diabaikan. |
| `teks[].warna` | `putih` (dengan bayangan) atau `hitam` |

Lebar teks diukur dari file font (`scripts/ukur_font.py`). Render mencetak peringatan `! teks '...' lebar N% layar` bila satu baris melebihi 84% lebar layar; pecah baris atau perkecil ukuran lalu render ulang.

Posisi baris: atas mulai di 15% tinggi layar, tengah di 50%, bawah berakhir di 76%. Semuanya di dalam zona aman Reels. Kolom kiri dan kanan memakai margin 8%. Teks yang tampil bersamaan di baris yang sama dan saling menimpa ditumpuk otomatis sesuai urutan daftar. Logo mendorong teks di baris yang sama: logo `bawah` mendorong teks bawah ke atas logo, logo `atas` dan `tengah` mendorong teks ke bawah logo. Animasi selalu `fade-naik`, tanpa kotak latar.

### audio di overlay.json

```json
"audio": {"sumber": "referensi", "file": "patterns/audio/montase-proses.m4a",
          "volume": 0.8, "mulai": 12.5, "final": false, "sinkron": true, "ketukan": "beat"}
```

| field | nilai |
|---|---|
| `audio` | `null` = tanpa musik |
| `sumber` | `referensi` (audio panduan pattern), `library` (`brand/musik/`), `tanpa` |
| `file` | path relatif folder skill (`patterns/audio/...`, `brand/musik/...`) atau path absolut. Kosong = tanpa musik |
| `volume` | default 1.0 |
| `mulai` | detik di dalam lagu tempat musik mulai (mis. reff di 45) |
| `final` | `true` = musik ikut di video final. `false` = final tanpa audio (musik ditambah di Instagram). Preview **selalu** memakai musik |
| `sinkron` | `true` = cut digeser ke ketukan musik saat render (`scripts/beat.py`), walau `final` false |
| `ketukan` | `beat` (tiap ketukan) atau `2beat` (tiap 2 ketukan, untuk gaya pelan; dari field `sinkron` pattern) |

Sinkron ketukan: tiap cut digeser ke ketukan terdekat maksimal ±0.25 detik, shot minimal 0.5 detik, total durasi tetap (shot terakhir menyesuaikan). Pergeseran hanya di memori saat render, `plan.json` tidak berubah. Kalau ketukan kurang jelas (musik ambient), cut tidak digeser dan render mencetak peringatan. Narasi (`suara` di plan) tetap berjalan seperti biasa. Hak cipta: audio referensi milik pembuat video contoh. Pakai di final hanya atas keputusan klien.

## field tingkat plan (bingkai dan efek)

| field | arti | default |
|---|---|---|
| `bingkai` | `{"jenis": "letterbox", "rasio": 1.78}` = gambar dalam pita selebar layar dengan rasio lebar/tinggi `rasio`, di tengah, bar hitam di atas dan bawah. Klip landscape tampil hampir utuh; klip portrait dipotong di tengah. Teks dan logo tetap memakai seluruh layar | `null` (layar penuh 9:16) |
| `akhir` | `{"fade": 0.8}` = video memudar ke hitam selama N detik terakhir | tanpa |
| `mode` | `"custom"` bila durasi/jumlah segmen tidak lagi sama dengan pattern. Audio referensi lalu disinkronkan ke ketukan (default: dilewati, karena cut pattern sudah pas) | `"ikuti"` |
| `pembuka_segmen` | indeks segmen tempat teks overlay `kapan: "pembuka"` muncul. Diisi dari slot teks pertama pattern | 0 |
| `pembuka_durasi_teks` | detik teks pembuka tampil (melintasi beberapa shot). Diisi dari `pattern.teks[0].durasi` | sampai akhir shot |
| `pembuka_teks` | timing teks pembuka hasil ukur referensi: `{"mulai": 0.07, "sampai_segmen": 3, "animasi": "fade", "fade": 0.13, "keluar": "cut"}`. `sampai_segmen` = indeks segmen terakhir yang ditutup teks (indeks slot `teks[0].sampai_slot`), `keluar: "cut"` = teks hilang tepat di cut berikutnya tanpa fade-out. Menimpa `pembuka_durasi_teks` | tanpa |
| `logo_segmen` | indeks segmen tempat logo dari `overlay.json` muncul (boleh negatif, -1 = terakhir). Kalau bukan segmen terakhir, logo hilang di akhir segmen itu | -1 |

Pattern memakai field yang sama: `bingkai` dan `akhir` di tingkat pattern, `efek_masuk`/`efek_keluar`/`redup` di slot `alur`, dan `logo_slot` (nama slot) yang diubah agent menjadi `logo_segmen`. Efek video contoh yang belum didukung render dicatat di pattern sebagai `belum_didukung`.

## segmen (urut sesuai tayang)

| field | arti | default |
|---|---|---|
| `file` | klip sumber | wajib |
| `mulai` | detik awal yang diambil dari klip | 0 |
| `durasi` | lama TERLIHAT di reel (sama dengan `durasi` slot pattern). Overlap transisi dihitung otomatis | wajib |
| `transisi` | transisi MASUK ke segmen ini. Diabaikan di segmen pertama | cut |
| `gerak` | `diam`, `zoom-in`, `zoom-out` | diam |
| `isi` | `crop` (penuhi layar 9:16) atau `blur` (klip landscape utuh di atas latar blur) | crop |
| `kecepatan` | 1.5 = 1.5x lebih cepat (klip sumber terpakai `durasi × kecepatan`) | 1.0 |
| `stabil` | `"auto"` = render mengukur goyang lalu memutuskan sendiri (lihat `scripts/stabil.py`): jitter ≤5px tanpa stabil; lebih dari itu vidstab di frame penuh sebelum crop dengan smoothing 30 atau 60 (dipilih yang sisa jitternya terkecil); terlalu goyang/blur → `mulai` digeser maks ±1 detik (tetap di `rentang_layak`, di luar zona `goyang` review), masih gagal → render berhenti. `true` = selalu stabil, `false` = tidak pernah. Keputusan dicache di `_stabil/` dan dicetak sebagai tabel saat render | `"auto"` |
| `efek_masuk` | efek di awal segmen: `{"jenis": "potong-vertikal"\|"kotak-membesar"\|"kilat-putih", "durasi": detik}`. `potong-vertikal` = gambar muncul per potongan vertikal; `kotak-membesar` = gambar mulai dari kotak kecil di tengah lalu membesar; `kilat-putih` = mulai dari putih lalu memudar ke gambar | tanpa |
| `efek_keluar` | efek di akhir segmen: `{"jenis": "kotak-mengecil", "durasi": detik}` = gambar mengecil menjadi kotak di tengah | tanpa |
| `redup` | 0-1, menggelapkan seluruh segmen (0.85 = hampir hitam). Untuk slot "logo di layar gelap" | 0 |

**Pakai ulang klip:** satu file boleh dipakai di beberapa segmen kalau rentang `mulai` dalam file itu berjarak minimal 1 detik dan segmennya tidak berurutan. Render memberi peringatan kalau aturan ini dilanggar.

Klip sumber harus punya minimal `mulai + durasi × kecepatan + 0.5` detik. Kalau kurang, render menggeser `mulai` lalu membekukan frame terakhir (muncul peringatan).

Jenis transisi: `cut fade fadeblack fadewhite dissolve slideleft slideright slideup slidedown smoothleft smoothright smoothup smoothdown wipeleft wiperight wipeup wipedown circleopen circleclose zoomin hblur radial squeezev squeezeh`. Durasi transisi dibatasi otomatis maksimal 45% dari shot terpendek di sampingnya.

## teks

| field | arti | default |
|---|---|---|
| `isi` | teksnya. `\n` untuk baris baru. Semua karakter aman (% ' : &) | wajib |
| `gaya` | `judul`, `sub`, `label`, `cta` | judul |
| `segmen` | indeks segmen tempat teks muncul (0 = pertama, -1 = terakhir) | 0 |
| `mulai` | detik setelah segmen itu mulai terlihat | 0.2 |
| `durasi` | lama tampil | sampai sebelum transisi berikutnya |
| `animasi` | `fade-naik`, `fade`, `muncul` (tanpa animasi) | fade-naik |
| `latar` | `true` = kotak gelap transparan di belakang teks (untuk dinding terang) | false |
| `y` | posisi vertikal 0-1, menimpa posisi gaya | dari gaya |
| `skala` | pengali ukuran huruf | 1.0 |
| `warna` | nama warna ffmpeg atau `#RRGGBB` | white |
| `font` | nama file di `fonts/` atau path | dari gaya |

Gaya bawaan: `judul` DM Serif Display besar di 40% tinggi layar; `sub` Poppins Light kecil di bawah judul; `label` Poppins Light kiri-bawah (76%); `cta` Poppins Medium di tengah.

Zona aman Instagram: hindari 12% teratas dan 20% terbawah untuk teks penting, karena tertutup UI Reels (nama akun, caption, tombol). Label (76%) dan logo (berakhir di 80%) sudah berada di dalam zona aman.

## cek kualitas otomatis

Sebelum render, `render.py` menganalisis tiap klip (cache di `<folder plan>/_kualitas/`) dengan `analyze_clip.py`. Bagian dengan `gelap` (terang rata-rata < 35), `kosong` (kontras rendah atau tepi sedikit), atau `blur` (tajam < 35% median klip) dianggap buruk. Segmen dengan lebih dari 0.3 detik bagian buruk membuat render berhenti dan memberi saran `mulai`. Lewati dengan `--abaikan-kualitas`, tapi jangan dipakai tanpa izin.

Analisis mandiri: `python3 scripts/analyze_clip.py <video>` menulis tabel per detik dan rentang bagus.

## logo, musik

`logo.segmen`: segmen tempat logo muncul (fade-in 0.3 detik setelah segmen mulai, tampil sampai akhir). `posisi`: `bawah`, `atas`, atau `tengah` (tengah layar, dipakai pattern contoh3). `ukuran`: lebar relatif layar.

`musik`: dipotong sesuai durasi reel dan di-fade-out 1.5 detik terakhir. Field opsional `mulai` (detik di dalam lagu). Tanpa `musik`, video diberi audio senyap. Kalau `overlay.json` ada, `musik` di plan diabaikan dan diganti `audio` dari overlay (lihat bagian `overlay.json`).

`suara`: voice over / narasi dari file audio (mp3, m4a, wav) yang disediakan pengguna. Field: `file` (wajib), `mulai` (detik di reel saat suara mulai, default 0), `volume` (default 1.0). Suara dipotong sesuai durasi reel. Kalau `musik` dan `suara` sama-sama ada, musik otomatis mengecil selama suara berbunyi (sidechain). Tanpa `suara`, tidak ada narasi.
```json
"suara": {"file": "/path/narasi.m4a", "mulai": 0.5, "volume": 1.0}
```

### Teks multi-baris (beda font per baris)

Pakai `baris` (daftar, urut dari ATAS ke BAWAH) bila tiap baris beda font atau ukuran.
Field di tiap baris: `isi` (wajib), `font` (nama di `fonts/` atau path lengkap), `skala` (pengali terhadap gaya), `warna`.
Field di level teks: `jarak` (jarak antar baris, pecahan tinggi layar, default 0.012), `y` (pusat seluruh blok), dan field lain seperti biasa.
Contoh:
```json
{"baris": [{"isi": "ALL THINGS", "font": "...ttf", "skala": 0.55},
           {"isi": "NOBA", "font": "DMSerifDisplay-Regular.ttf", "skala": 1.0}], "y": 0.18}
```
Teks satu baris tetap pakai `isi`.

## bandingkan.py (uji pattern terhadap video contoh)

```
python3 scripts/bandingkan.py <video-contoh.mp4> <hasil.mp4> [--out banding.jpg]
```

Mendeteksi cut di kedua video (bar hitam dipotong otomatis), lalu membuat lembar gambar: per blok, baris atas = frame video contoh di tengah tiap shot, baris bawah = frame hasil di waktu yang sama (waktu diskalakan kalau durasi beda > 2%). Tabel teks mencantumkan tiap cut contoh, cut hasil terdekat, dan selisihnya; selisih > 0.15 detik ditandai `<-- meleset`. Default lembar: `<hasil>_banding.jpg`. Wajib dijalankan sebelum pattern baru disimpan.

---
name: interior-reels
description: Use when the user wants raw interior design, architecture, or property video clips edited into an Instagram Reel / TikTok (9:16) with transitions and text, or wants to turn an example reel into a reusable editing pattern. Triggers include "edit video", "bikin reels", "edit klip ini", "jadikan pattern", "tambah pattern", "video proyek", "konten interior".
---

# Interior Reels

Ubah klip mentah proyek interior menjadi reel 9:16 siap upload. Script hanya alat. Keputusan editorial (shot mana, bagian mana, urutan apa) adalah tugas Claude dan harus didasarkan pada **melihat gambar setiap klip**, bukan menebak dari nama file.

`SKILL` = folder skill ini. Semua script: `python3 SKILL/scripts/<nama>.py`.

## Sebelum mulai (sekali per sesi)

Jalankan `bash SKILL/setup.sh`. Kalau ada GAGAL, bereskan dulu. Baca `SKILL/brand.json` untuk nama studio, CTA, logo, pattern default, dan selera klien.

## Aturan mutlak (tidak boleh dilanggar)

1. **Teks dan logo bukan tugas asisten.** Teks dan logo diatur klien di GUI dan disimpan di `<folder>/_edit/overlay.json`. `render.py` membaca file ini dan menimpa seluruh `teks` dan `logo` di plan. Jangan menulis `teks` atau `logo` di `plan.json`, jangan bertanya isi teks ke klien, dan jangan menambah teks sendiri ke `overlay.json` (termasuk CTA dari `brand.json`) kecuali klien memintanya.
2. **Pattern hanya mengatur potongan dan tampilan.** Yang diambil dari pattern: urutan slot, durasi, gerak, transisi, dan grade. `teks`, `contoh_isi`, dan `logo` di pattern hanya catatan dari video referensi, tidak dirender.
3. **Ubah teks atau logo lewat chat = edit `overlay.json`.** Kalau klien minta ganti isi teks, font, posisi, waktu muncul, ukuran, warna, atau logo, edit `<folder>/_edit/overlay.json` (format di `PLAN.md` bagian `overlay.json`), lalu render ulang. GUI memuat ulang file ini setelah balasanmu. Font hanya dari `SKILL/fonts/`. Daftar font, kategori, ciri, dan kegunaannya ada di `fonts/fonts.json`; pilih dari situ sesuai suasana yang diminta klien. Font atau ukuran beda per baris (mis. "baris kedua pakai Great Vibes") diatur lewat `teks[].per_baris`. Logo hanya `hitam` (`brand/logo.png`) atau `putih` (`brand/logo-putih.png`). Data studio (nama, website `keziakarin.com`, Instagram `@keziakarin.studio`) tetap dari `brand.json`.
4. **Audio juga dari `overlay.json` (`audio`).** Jangan memilih atau mengganti musik sendiri, dan jangan menulis `musik` di plan. Kalau klien minta lewat chat (ganti lagu, volume, titik mulai, final dengan/tanpa musik, sinkron ketukan), edit `audio` di `overlay.json` (format di `PLAN.md`). Musik hanya dari audio panduan pattern (`patterns/audio/`) atau library studio (`brand/musik/`). Ingatkan klien bahwa audio referensi milik orang lain kalau mereka ingin memakainya di final.
5. **Kalau `overlay.json` belum ada**, render tetap jalan tanpa teks dan logo dari pattern. Sebutkan ke klien bahwa teks dan logo bisa diisi di GUI bagian Detail.
6. **Jangan menghapus atau mengganti `overlay.json` tanpa diminta.** File ini adalah pilihan klien.
7. **Goyang ditangani otomatis.** `render.py` mengukur goyang tiap segmen dan menstabilkan sendiri (`"stabil": "auto"`, default). Jangan isi `stabil` kecuali ada alasan: `true` memaksa stabil, `false` mematikan (misalnya gerak tangan disengaja). Baca tabel "Stabil" di log render: `! sisa goyang terlihat` = cek hasilnya; `! GAGAL` = render berhenti, pilih rentang atau klip lain untuk segmen itu. Saat review, tetap isi `goyang` di `_review/*.json` untuk bagian yang jelas goyang/kehilangan fokus: rentang itu tidak akan dipakai saat render menggeser `mulai`.
8. **Pilih bagian yang layak, jangan pakai semua detik klip.** Saat render, `render.py` otomatis menganalisis klip (`_kualitas/`) dan menandai bagian gelap, kosong (tidak ada objek), atau blur. Segmen yang memuat lebih dari 0.3 detik bagian buruk ditolak dan diberi saran `mulai`. Wajib: geser `mulai` ke saran, atau kurangi `durasi`, atau ganti klip. Tidak boleh memakai `--abaikan-kualitas` tanpa izin pengguna.
9. **Durasi mengikuti footage, bukan pattern.** Kalau rentang bagus klip lebih pendek dari slot pattern, pendekkan slot itu. Total reel boleh lebih pendek dari `durasi_total` pattern. Jangan mengisi slot dengan bagian buruk.
10. **Lihat frame sebelum final.** Saran dari analisis harus dicek dengan melihat frame di rentang itu (grid atau preview). Analisis tidak tahu apakah objek utamanya bagus atau apakah bagian tersebut adalah pembuka yang tepat.
11. **Review semua klip bahan dulu.** Jalankan `scripts/review_bahan.py <folder-bahan>`, lihat SETIAP lembar di `_review/` sampai habis, lalu isi JSON tiap klip (`sudah_dilihat`, `goyang`, `rentang_layak`, `keputusan`). `render.py` menolak render kalau klip belum direview atau segmen di luar `rentang_layak` (kecuali `--abaikan-kualitas`).
12. **Cek teks setelah render.** Posisi teks dipilih klien (grid 3x3). Setelah render, lihat `*_teks<N>_cek.jpg` (kotak merah = perkiraan area teks). Kalau teks menutupi wajah atau objek utama, beri tahu klien dan sarankan posisi lain. Jangan mengubah posisi sendiri tanpa persetujuan.
13. **Klip pilihan klien dari `<folder>/_edit/klip.json`.** Baca file ini sebelum membuat plan (format di `PLAN.md` bagian `klip.json`). `pembuka` = klip segmen pertama, `penutup` = klip segmen terakhir, `jangan` = tidak boleh dipakai di segmen mana pun. Pilihan klien menang atas `jenis_shot` pattern; kalau jenis shot klip itu beda dari slot pattern, beri tahu klien. Detik terbaik di dalam klip pilihan tetap dipilih asisten. `render.py` menolak plan yang melanggar file ini (tidak bisa dilewati `--abaikan-kualitas`). Jangan mengubah atau menghapus `klip.json`; file ini ditulis GUI.

## Alur: edit klip menjadi reel

1. **Kumpulkan info.** Yang wajib: folder klip. Yang opsional: pattern dan file suara (narasi/voice over, mp3/m4a/wav). Teks dan logo sudah ada di `_edit/overlay.json`, jangan ditanyakan. Tanya hanya yang benar-benar kosong, maksimal 1 pertanyaan. Kalau ada file suara, isi `suara` di plan (lihat `PLAN.md`). Suara tidak direkam oleh skill: pengguna harus menyediakan file audionya.
   Bandingkan jumlah klip di folder dengan `min_klip` pattern. Kalau kurang, beri tahu klien dan sarankan pattern dengan `min_klip` lebih kecil atau tambah klip. Tetap boleh lanjut kalau klien setuju.
2. **Scan.** Jalankan `scan_clips.py <folder>` untuk membuat `<folder>/_scan/`.
3. **Lihat SETIAP grid** `_scan/<klip>.jpg` dengan tool view. Untuk tiap klip catat dalam tabel: jenis shot (wide / medium / detail / walk-through / pan), ruangan, kualitas (goyang, gelap, terlalu terang, ada orang atau barang berantakan), detik terbaik (`detik_frame` di `manifest.json` memetakan kotak grid ke detik), dan arah gerak kamera. Jangan lanjut sebelum semua grid dilihat.
4. **Pilih pattern** dari `SKILL/patterns/*.json`, sesuai permintaan atau default. Kalau pemilihan otomatis, pilih yang `cocok_untuk`-nya paling sesuai dengan jumlah dan isi klip.
5. **Isi slot.** Untuk setiap slot di `alur`, pilih klip dan detik `mulai` yang cocok dengan `jenis_shot`, ikuti aturan cerita di bawah. Salin `durasi`, `gerak`, `transisi_masuk`, `efek_masuk`, `efek_keluar`, `redup`, dan grade dari pattern. Salin juga `bingkai` dan `akhir` ke plan, ubah `logo_slot` menjadi `logo_segmen` (indeks segmen slot itu), dan isi `pembuka_segmen` dengan indeks segmen slot teks pertama pattern (`teks[0].slot`), supaya teks pembuka dari GUI muncul di slot itu. Kalau pattern punya `teks[0].durasi`, tulis juga `pembuka_durasi_teks` (nilai number, detik) ke plan — ini memastikan teks pembuka tampil cukup lama agar terbaca. Kalau pattern punya `teks[0].sampai_slot`, tulis juga `pembuka_teks` ke plan: `mulai`, `animasi`, `fade`, `keluar` disalin dari `teks[0]`, dan `sampai_segmen` = indeks segmen slot `sampai_slot`. Jangan salin teks dan logo. Tulis `<folder>/_edit/plan.json` sesuai `SKILL/PLAN.md`, memakai path absolut.
   - **Pattern dengan `bingkai` letterbox:** utamakan klip landscape. Klip portrait dipotong di tengah menjadi pita 16:9; kalau terpaksa dipakai, beri tahu klien.
   - **Pakai ulang klip** boleh bila klip kurang dari jumlah slot: rentang `mulai` dalam klip yang sama berjarak minimal 1 detik, dan tidak di dua segmen berurutan. Render memberi peringatan kalau aturan ini dilanggar.
   - Kalau pattern punya `belum_didukung`, sebutkan efek itu ke klien sebelum render.
   - **Mode edit dari GUI** (disebut di pesan "Mulai edit"):
     - `ikuti referensi` (default): salin alur pattern persis, jangan buang, tukar, atau gabung slot. Teks overlay sudah diberi nomor shot sesuai slot pattern (`kapan`), dan logo memakai `logo_segmen`, jadi urutan segmen harus sama dengan `alur`. Kalau klip kurang, pakai ulang klip (aturan di atas), jangan buang slot.
     - `custom`: pattern hanya titik awal gaya (grade, transisi, efek, bingkai). Durasi dan jumlah segmen boleh disesuaikan dengan klip. Tulis `"mode": "custom"` di plan, supaya audio referensi disinkronkan ke ketukan.
6. **Preview.** Jalankan `render.py <plan> --preview`, lalu lihat `*_preview_cek.jpg`. Periksa: urutan masuk akal, tidak ada shot buruk, teks dari overlay terbaca dan tidak menutupi objek utama, tidak ada frame beku yang aneh. Perbaiki plan lalu ulangi kalau perlu.
7. **Final.** Jalankan `render.py <plan>`, lihat `*_cek.jpg` sekali lagi, lalu laporkan path video beserta ringkasan urutan shot dalam 1-2 kalimat.

## Aturan cerita interior

- **3 detik pertama menentukan orang berhenti scroll.** Pembuka harus shot terkuat: terang, lurus, ruang terlihat utuh.
- **Ikuti denah.** Urutan ruang dari pintu masuk ke area publik (ruang tamu, makan, dapur) lalu ke area privat (kamar, kamar mandi). Jangan melompat bolak-balik antar ruangan.
- **Selang-seling skala.** Wide, lalu detail, lalu wide. Dua wide dari ruangan berbeda berturut-turut sebaiknya disambung transisi, bukan cut.
- **Arah gerak menyambung.** Pan ke kiri disambung shot yang bergerak ke kiri atau transisi `slideleft`/`smoothleft`. Hindari arah gerak berlawanan di satu sambungan.
- **Ambil bagian stabil.** Pilih detik di tengah gerakan, bukan saat kamera mulai atau berhenti. Lewati bagian goyang, blur, atau ada orang.
- **Penutup** pakai shot paling cantik yang punya area polos untuk CTA dan logo.
- **Teks**: diatur klien lewat `overlay.json`. Kalau diminta saran, sarankan maksimal 6 kata per teks.
- **Klip kurang dari slot**: buang slot `detail` dulu. **Klip berlebih**: pakai yang terbaik saja, tidak perlu semua klip dipakai.
- **Klip landscape**: pakai `"isi": "blur"` kalau komposisinya penting. Kalau objek utama ada di tengah, `crop` sudah cukup.

## Alur: revisi setelah hasil

Berlaku bila pesan klien diakhiri `[mode revisi: ...]` (GUI menambahkannya saat `_edit/plan.json` sudah ada). Tujuannya: pahami maksud revisi sebelum mengubah apa pun, karena render ulang lama. Klien hanya mengklik tombol, jadi semua pertanyaan WAJIB dikirim lewat blok `pertanyaan`, bukan teks bebas.

1. **Pesan revisi baru** (bukan jawaban, bukan "Kerjakan"):
   - Baca `plan.json` dan lihat `*_cek.jpg` hasil terakhir. Jangan ubah file apa pun.
   - Kirim satu ronde: maksimal 4 pertanyaan. Isinya pertanyaan maksud (shot mana, seberapa banyak, gaya apa) dan maksimal 2 **temuan** dari hasil (mis. shot gelap, teks menutupi objek), masing-masing dengan opsi seperti "Perbaiki" / "Biarkan".
   - Tiap pertanyaan 2-4 opsi pendek (≤ 6 kata), tepat satu opsi `"disarankan": true`. `"multi": true` hanya untuk pilihan yang boleh lebih dari satu (mis. shot mana saja yang diganti). Jangan tambah opsi "Lainnya"; GUI sudah menyediakan.
   - Tulis maksimal 1 kalimat pengantar, lalu blok, lalu berhenti dan tunggu.
2. **Pesan berawal `Jawaban:`** = jawaban ronde. Kalau masih ada yang belum jelas dan ini baru ronde pertama, kirim ronde kedua (aturan sama). Setelah itu (atau kalau sudah jelas), kirim blok `ringkasan`: daftar perubahan yang akan dibuat, 1 poin per perubahan. Berhenti dan tunggu.
3. **`Langsung kerjakan: ...`** = pakai opsi `disarankan` untuk semua pertanyaan terakhir, lalu kerjakan tanpa ringkasan.
4. **`Kerjakan sesuai ringkasan.`** = kerjakan persis isi ringkasan terakhir (edit plan/overlay, preview, final), lalu laporkan seperti biasa.
5. Pesan teks bebas saat kartu terbuka = jawaban bebas. Perlakukan seperti `Jawaban:`.
6. Maksimal 2 ronde pertanyaan per revisi. Permintaan yang sudah sangat jelas (mis. "ganti font jadi Great Vibes") tetap lewat 1 ronde singkat (cukup temuan, atau 1 pertanyaan konfirmasi), lalu ringkasan.
7. **Pesan "klip pilihan berubah"** (dikirim GUI setelah klien mengubah klip pembuka, penutup, atau jangan dipakai) = revisi biasa: baca `_edit/klip.json` terbaru dan terapkan ke plan lewat langkah 1-4 di atas (aturan mutlak 13).

Format blok (JSON valid, satu blok per balasan):

````
```pertanyaan
{"jenis": "tanya", "pertanyaan": [
  {"id": "q1", "judul": "Shot mana yang mau diganti?", "multi": true,
   "opsi": [{"label": "Shot 2 (dapur)", "disarankan": true}, {"label": "Shot 4 (kamar)"}]},
  {"id": "q2", "judul": "Temuan: shot 3 agak gelap", "multi": false,
   "opsi": [{"label": "Perbaiki", "disarankan": true}, {"label": "Biarkan"}]}
]}
```
````

````
```pertanyaan
{"jenis": "ringkasan", "ringkasan": ["Shot 2 diganti klip dapur detik 4", "Shot 3 dicerahkan"]}
```
````

## Aturan ekstraksi referensi (wajib)

Tujuannya: reel hasil pattern punya struktur yang sama dengan video contoh (waktu tiap cut, transisi, bingkai, efek, grade). Isi gambar tetap dari klip klien.

1. **Cut dideteksi di area gambar saja.** `analyze_ref.py` otomatis memotong bar hitam (letterbox/pillarbox). Tanpa itu, cut di video berbingkai banyak yang terlewat.
2. **Lihat `filmstrip.jpg` (4 fps) DAN `shots.jpg` (3 frame per shot: awal, tengah, akhir).** Jangan menilai shot dari satu frame. Cari cut yang tersembunyi (awal dan akhir shot beda isi), animasi (gambar membesar dari kotak kecil, muncul per potongan, kilat putih, memudar), dan teks atau logo yang muncul sebentar.
3. **Inventaris semua efek** di `efek_cek` draft: `bingkai`, `pembuka`, `penutup`, `kilat`, `kotak`, `teks`, `logo`, `grade`. Petakan tiap efek ke field render (`bingkai`, `akhir`, `logo_slot`, `efek_masuk`, `efek_keluar`, `redup`, `transisi_masuk`; lihat `PLAN.md`). Tidak boleh ada `"?"` yang tersisa.
4. **Uji wajib sebelum pattern disimpan.** Render pattern dengan klip apa saja (preview cukup), lalu jalankan `scripts/bandingkan.py <video-contoh> <hasil.mp4>`. Lihat lembar bandingnya (pasangan baris: atas contoh, bawah hasil) dan tabel cut. Perbaiki pattern sampai jumlah shot sama, cut meleset ≤ 0.15 detik, dan efek di tiap shot cocok. Sebutkan hasil uji ini ke pengguna.
5. **Efek yang belum didukung render** tetap dicatat di pattern sebagai `"belum_didukung": ["..."]` dan WAJIB disebutkan ke pengguna. Jangan diam-diam dilewati atau diganti efek lain.

6. **Bagian cepat dicek per frame (30 fps).** Untuk tiap bagian yang shotnya < 0.4 detik atau ada efek (kotak, kilat, pembuka, logo), ambil strip per frame (`ffmpeg -ss <a> -t <d> -i <video> -vf "fps=30,crop=iw:ih*0.4:0:ih*0.3,scale=90:-2,tile=27x1"`). Filmstrip 4 fps melewatkan urutan klip 0.1-0.2 detik (contoh: urutan kotak bertingkat contoh4 di 11.6-12.77 detik berisi 6-7 klip).
7. **Kilat/flash dibuktikan dengan angka.** Sebelum menulis `kilat-putih`, ukur `signalstats` YMAX/YAVG per frame di sekitarnya. Kilat putih = lonjakan YAVG jelas dan YMAX ≥ 235. Tanpa lonjakan, jangan tulis efek kilat.
8. **Bandingkan tiap shot di lembar banding dengan nomor shot yang benar.** Hitung kolom dari awal baris; salah hitung kolom membuat efek dipasang di slot yang salah.

## Alur: video contoh menjadi pattern baru

Ikuti **Aturan ekstraksi referensi** di atas.

1. Jalankan `analyze_ref.py <video> --name <nama-pattern>`, hasilnya di `_ref/<nama>/`.
2. Lihat `filmstrip.jpg` (seluruh video 4 fps, 1 baris = 4 detik), `shots.jpg` (3 frame per shot, 1 baris per shot), dan `cuts.jpg` (frame di titik transisi). `petunjuk_transisi` hanya perkiraan. Tentukan jenisnya dari gambar: setengah gelap berarti `fadeblack`, garis batas tegas berarti `slide*`, tepi lembut berarti `smooth*`, gambar tumpang tindih berarti `fade`/`dissolve`, berganti mendadak berarti `cut`. Durasi transisi yang lazim 0.3-0.6 detik.
3. **Font teks.** Untuk tiap baris teks di video contoh: ambil crop satu baris dari frame (`ffmpeg -ss <detik> -i <video> -frames:v 1` lalu crop), jalankan `scripts/font_match.py <gambar> --box x,y,w,h --teks "<baris>" --lembar <out.png>`, lalu LIHAT lembar perbandingannya. Skor hanya petunjuk (mask teks bisa tercampur latar terang). Tentukan kemiripan dari mata: ciri serif/sans, kontras tebal-tipis, kondensed/lebar, kapital. Catat di `draft.json` sebagai `"font": {"ciri": "...", "terdekat": "nama font", "file": "path"}` dan tulis sebagai `"nama font tidak pasti"` kalau tidak yakin.
   Isi semua `"?"` di `draft.json`. Langsung isi `cocok_untuk` (jenis proyek, jumlah klip, jenis shot yang dibutuhkan) dari hasil melihat video, jangan dibiarkan `"?"`. Kalau mirip pattern bawaan, sebut nama pattern itu di jawaban. Lalu isi: nama slot, `jenis_shot` sebagai deskripsi yang bisa dicocokkan dengan klip lain (bukan "shot dapur proyek X"), gerak, transisi, teks beserta gayanya, dan grade (bandingkan warna dengan aslinya: lebih hangat, pudar, atau kontras).
   **Jumlah klip.** Isi `min_klip` (angka) dan `ideal_klip` (`[min, maks]`). Mulai dari `min_klip_saran_otomatis` (jumlah shot ≥ 0.3 detik), lalu koreksi dari gambar: kurangi untuk shot yang bukan footage (kartu hitam/putih, logo, kolase grafis), kilasan blur transisi, dan shot berurutan yang bisa diambil dari klip yang sama (sudut lain, detik lain). Jangan kurangi untuk ruang, stasiun kerja, atau subjek yang berbeda. `ideal_klip` biasanya dari `min_klip` sampai jumlah slot. Sebutkan angka ini di `cocok_untuk` juga. Hapus `min_klip_saran_otomatis` sebelum disimpan.
   **Audio panduan.** `analyze_ref.py` menyimpan audio video contoh ke `_ref/<nama>/audio.m4a`. Saat pattern disimpan lewat GUI, file ini disalin ke `patterns/audio/<nama>.m4a` dan field `audio_panduan` diisi otomatis. Kalau gaya pelan (cut jarang, musik tenang), isi `"sinkron": "2beat"`.
4. Simpan sebagai `SKILL/patterns/<nama>.json` hanya setelah uji `bandingkan.py` lolos (aturan 4). Hapus `efek_cek` setelah semua efek dipetakan; `belum_didukung` tetap disimpan. Saat disimpan lewat GUI, video contoh otomatis disalin ke `skill/contoh-video/<nama>.mp4` (h264 disalin, format lain dikonversi ke h264 720p di background) dan field `video_contoh` diisi. Video asli tidak dihapus.

Kalau `durasi_shot` terlihat salah (ada cut terlewat, atau gerakan kamera terbaca sebagai cut), ulangi dengan `--thr 30` atau `--thr 55`.

## Kesalahan umum

| Kesalahan | Akibat | Benar |
|---|---|---|
| Memilih klip dari nama file atau urutan folder | Urutan acak, shot buruk ikut masuk | Lihat semua grid dulu |
| `mulai` dekat akhir klip | Frame dibekukan (ada peringatan) | `mulai + durasi × kecepatan + 0.5 ≤ durasi klip` |
| Teks panjang di shot 1.5 detik | Tidak sempat terbaca | Teks pendek, atau taruh di shot ≥ 2 detik |
| Langsung render final | Lambat kalau ternyata salah | Selalu preview dulu |
| Menilai shot video contoh dari satu frame | Cut tersembunyi dan animasi terlewat, hasil tidak mirip contoh | Lihat `filmstrip.jpg` + `shots.jpg` 3 frame, lalu uji `bandingkan.py` |
| Mengubah pattern bawaan untuk satu video | Pattern rusak untuk video berikutnya | Ubah di `plan.json`, pattern tetap utuh |

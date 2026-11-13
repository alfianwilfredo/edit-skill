# Interior Reels Skill

Skill Claude untuk mengedit klip mentah proyek interior menjadi Instagram Reel 9:16, lengkap dengan transisi, teks beranimasi, color grade, dan logo. Gaya edit diatur oleh **pattern** yang bisa ditambah dari video contoh.

## Isi folder

```
edit-skill/
├── README.md                ← dokumen ini
└── interior-reels/          ← folder skill (ini yang dipasang)
    ├── SKILL.md             ← instruksi untuk Claude: alur kerja + aturan bercerita interior
    ├── PLAN.md              ← referensi format plan.json
    ├── setup.sh             ← cek alat + unduh font
    ├── brand.json           ← data tetap klien: nama studio, CTA, logo, pattern default
    ├── brand/               ← logo.png (hitam) dan logo-putih.png (putih)
    ├── fonts/               ← diisi otomatis oleh setup.sh dari fonts.json (26 font Google, lisensi OFL)
    ├── patterns/            ← library gaya edit, 1 file JSON per pattern
    │   ├── reveal-tenang.json   (14 detik, pelan, crossfade panjang)
    │   └── tur-ritmis.json      (12 detik, cepat, tur ruang per ruang)
    └── scripts/
        ├── scan_clips.py    ← klip → grid 8 frame per klip, supaya Claude bisa "melihat"
        ├── analyze_ref.py   ← video contoh → draft pattern (deteksi cut + transisi bertahap)
        ├── render.py        ← plan.json → video 1080×1920 30fps H.264 + grid cek
        └── _common.py
```

Tidak ada dependensi Python tambahan, cukup Python 3 dan ffmpeg.

## Cara kerja (untuk presentasi)

1. **Scan**: setiap klip dipecah menjadi 8 frame. Claude melihat semuanya lalu mencatat jenis shot, ruangan, kualitas, dan detik terbaik.
2. **Pattern**: gaya edit disimpan sebagai daftar slot. Tiap slot punya jenis shot yang dicari, durasi, gerak kamera, transisi, dan teks.
3. **Menyusun cerita**: Claude mengisi slot dengan klip yang paling cocok, mengikuti aturan cerita interior (pembuka terkuat, alur sesuai denah, wide dan detail berselang-seling, arah gerak menyambung).
4. **Render dan cek ulang**: preview cepat, lalu Claude melihat hasilnya sendiri, memperbaiki, dan merender final.
5. **Pattern baru dari contoh**: video contoh dianalisis otomatis (titik cut dan ritme), lalu Claude melihat frame-nya untuk mengenali transisi, teks, dan warna. Hasilnya tersimpan sebagai pattern yang bisa dipakai ulang.

## Pasang di Mac (sekali saja)

```bash
mkdir -p ~/.claude/skills
ln -s /Users/tad-01/Desktop/amantana/KK/edit-skill/interior-reels ~/.claude/skills/interior-reels
bash ~/.claude/skills/interior-reels/setup.sh
```

`ln -s` membuat shortcut, jadi perubahan di folder Desktop langsung terpakai. Setup harus diakhiri dengan `SIAP`.

`brand.json` sudah berisi data tetap KEZIAKARIN studio (keziakarin.com, @keziakarin.studio). Logo ada dua: `brand/logo.png` (hitam) dan `brand/logo-putih.png` (putih). Tidak perlu diubah.

## Tes di Claude Code

```bash
mkdir -p ~/Desktop/reel-tes/klip    # isi dengan 5-10 klip mentah
cd ~/Desktop/reel-tes
claude
```

Contoh perintah di Claude Code:

- `Edit klip di folder klip jadi reel pakai pattern reveal-tenang. Proyeknya "Rumah Tropis, Bintaro".`
- `Edit klip di folder klip, pilih pattern yang paling cocok.`
- `Jadikan video contoh.mp4 pattern baru bernama minimalis-hangat.`
- `Shot kedua kurang bagus, ganti dengan klip dapur, lalu render ulang.`

Hasilnya ada di `klip/hasil/`: `*_preview.mp4` (cepat, 540×960), video final, dan `*_cek.jpg` (grid 12 frame).

Kecepatan di komputer uji (tanpa GPU): preview 14 detik selesai dalam ±12 detik, final 1080p dalam ±70 detik. Mac seri M biasanya lebih cepat.

## Naskah demo besok (±5 menit)

1. Tunjukkan folder klip mentah yang berantakan.
2. Ketik: `Edit klip di folder klip pakai pattern reveal-tenang, proyek "<nama>"`.
3. Biarkan audiens melihat Claude membuka grid tiap klip dan menjelaskan pilihannya. Ini bagian yang paling meyakinkan.
4. Putar hasil video.
5. Ketik: `Sekarang versi tur-ritmis dari klip yang sama.` Ini menunjukkan satu footage bisa menghasilkan banyak gaya.
6. (Opsional) `Jadikan video contoh.mp4 pattern baru` untuk menunjukkan library pattern bisa terus bertambah.

Tips: siapkan klip yang sudah dites malam ini, dan render sekali sebelum presentasi supaya ada hasil cadangan.

## Pasang di laptop klien

1. Pasang Homebrew, lalu jalankan `brew install ffmpeg python`.
2. Salin folder `interior-reels` (sudah berisi `brand.json` dan logo) ke `~/.claude/skills/` milik klien.
3. Jalankan `bash ~/.claude/skills/interior-reels/setup.sh`.
4. Pastikan skill terbaca di aplikasi Claude yang dipakai klien. Cara pasang skill di Claude Desktop / Cowork perlu dicek ulang sebelum serah terima.

## Menambah pattern

Cara termudah: berikan video contoh ke Claude dan minta "jadikan pattern". Bisa juga dengan menyalin file pattern yang ada lalu mengubah slotnya secara manual. Field-nya dijelaskan di dalam file pattern itu sendiri dan di `PLAN.md`.

## Batasan yang perlu diketahui

- Claude "melihat" klip lewat 8 frame per klip, bukan menonton penuh. Gerakan sangat cepat di antara frame bisa terlewat.
- Deteksi transisi pada video contoh akurat untuk posisi, tapi jenis dan durasi transisi ditentukan Claude dari gambar, jadi bisa sedikit berbeda dari aslinya.
- Efek yang tidak didukung: animasi teks per huruf, efek 3D, masking objek, speed ramp. Semua bisa ditambahkan nanti.
- Audio diatur di GUI: audio panduan dari video contoh (default hanya untuk preview), library studio `brand/musik/`, atau tanpa. Cut otomatis disinkronkan ke ketukan. Lagu trending tetap ditambahkan di aplikasi Instagram.
- Font: 26 font Google (OFL, bebas dipakai komersial) dalam 4 kategori: Serif elegan, Sans modern, Tegas, Script. Daftar, ciri, dan kegunaan tiap font ada di `fonts/fonts.json`; GUI menampilkan contoh tulisan tiap font saat memilih. Tambah font: taruh .ttf di `fonts/` lalu tambah entri di `fonts/fonts.json` (font tanpa entri tetap muncul di kategori "Lainnya").

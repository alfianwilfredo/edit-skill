# Interior Reels Skill

Skill Claude untuk mengedit klip mentah proyek interior menjadi Instagram Reel 9:16, lengkap dengan transisi, teks beranimasi, color grade, logo, dan musik. Gaya edit diatur oleh **pattern** yang dibuat dari video contoh.

Skill ini dipakai oleh aplikasi GUI di `../frontend`. Cara instalasi dan pemakaian untuk klien ada di [README utama](../README.md). Dokumen ini menjelaskan isi skill-nya.

## Isi folder

```
skill/
├── README.md                ← dokumen ini
├── contoh-video/            ← video contoh tiap pattern (preview GUI + bahan training)
│   └── contoh2.mp4          ← contoh untuk montase-proses
└── interior-reels/          ← folder skill
    ├── SKILL.md             ← instruksi untuk Claude: aturan mutlak, alur edit, revisi, training, ekstraksi referensi
    ├── PLAN.md              ← format plan.json, overlay.json, klip.json
    ├── setup.sh             ← cek python/ffmpeg-full + unduh font
    ├── brand.json           ← data studio: nama, website, Instagram, CTA, pattern default
    ├── brand/               ← logo.png (hitam), logo-putih.png (putih), musik/ (library musik studio)
    ├── fonts/               ← diisi setup.sh dari fonts.json (font Google, lisensi OFL)
    ├── patterns/            ← library gaya edit, 1 file JSON per pattern
    │   ├── montase-proses.json
    │   ├── audio/           ← audio panduan dari video contoh
    │   └── _backup/         ← versi lama pattern, dibuat otomatis saat training menyimpan perubahan
    ├── _ref/                ← hasil analisis video contoh (draft, lembar shot)
    └── scripts/
        ├── scan_clips.py      ← klip → grid frame, supaya Claude bisa "melihat" isinya
        ├── review_bahan.py    ← lembar review semua klip; render menolak klip yang belum direview
        ├── analyze_clip.py    ← tandai bagian klip yang gelap, kosong, atau blur
        ├── stabil.py          ← ukur goyang dan siapkan stabilisasi (vidstab)
        ├── render.py          ← plan.json → video 1080×1920 30 fps H.264 + gambar cek
        ├── beat.py            ← deteksi ketukan musik, geser cut ke ketukan
        ├── analyze_ref.py     ← video contoh → draft pattern (cut, transisi, audio)
        ├── bandingkan.py      ← bandingkan video contoh vs hasil render, shot per shot
        ├── font_match.py      ← cari font yang paling mirip teks di video contoh
        ├── ukur_font.py       ← ukur lebar teks per font
        ├── simpan_pattern.py  ← simpan perubahan pattern dengan backup
        └── _common.py
```

Tidak ada dependensi Python tambahan. Cukup Python 3 dan `ffmpeg-full` (Homebrew), karena render butuh filter `drawtext` dan `vidstab`.

## Gaya yang tersedia

| Pattern | Video contoh | Ciri |
|---|---|---|
| `montase-proses` | `contoh-video/contoh2.mp4` | 14 shot, ±13 detik, hard cut tanpa transisi, teks judul di awal, fade ke hitam di akhir |

Gaya baru ditambah lewat tab **Gaya baru** di GUI. Video contohnya otomatis disalin ke `contoh-video/<nama>.mp4` dan ditulis di field `video_contoh` pattern.

## Cara kerja

1. **Review klip**: setiap klip dipecah jadi lembar frame. Claude melihat semuanya, lalu mencatat jenis shot, ruangan, kualitas, dan rentang detik yang layak dipakai.
2. **Pattern**: gaya edit disimpan sebagai daftar slot. Tiap slot punya jenis shot yang dicari, durasi, gerak kamera, transisi, efek, dan grade.
3. **Menyusun cerita**: Claude mengisi slot dengan klip yang paling cocok, mengikuti aturan cerita interior: pembuka terkuat, alur sesuai denah, wide dan detail berselang-seling, arah gerak menyambung.
   - **Ikuti referensi**: alur pattern disalin persis (jumlah slot, urutan, durasi).
   - **Custom**: pattern hanya titik awal gaya. Durasi dan jumlah segmen menyesuaikan klip.
4. **Pilihan klien selalu menang**: teks, logo, dan audio dari `_edit/overlay.json`. Klip pembuka, penutup, dan "jangan dipakai" dari `_edit/klip.json`. `render.py` menolak plan yang melanggar `klip.json`.
5. **Render dan cek ulang**: preview cepat, lalu Claude melihat gambar cek, memperbaiki plan, dan merender final ke `<folder klip>/hasil/`.
6. **Revisi**: pesan setelah hasil ada diproses lewat tanya-jawab. Claude mengirim pertanyaan dan temuannya sebagai kartu pilihan di GUI, lalu ringkasan perubahan, dan baru mengerjakan setelah klien menekan **Kerjakan**.
7. **Training**: Claude merender uji pattern dengan klip klien, membandingkan dengan video contoh (`bandingkan.py`), lalu mengusulkan perbaikan pattern. Hasil training ada di `<folder klip>/_training/<pattern>/`. Pelajarannya disimpan di field `catatan_training` dan dibaca lagi saat edit berikutnya.

## Pakai tanpa GUI (Claude Code)

Skill juga bisa dipakai langsung dari Claude Code di Terminal:

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/interior-reels" ~/.claude/skills/interior-reels   # jalankan dari folder skill/
bash ~/.claude/skills/interior-reels/setup.sh
```

Lalu buka `claude` di folder yang berisi klip, misalnya:

- `Edit klip di folder ini jadi reel pakai pattern montase-proses.`
- `Shot kedua kurang bagus, ganti dengan klip dapur, lalu render ulang.`

## Menambah atau mengubah pattern

- **Pattern baru**: pakai tab Gaya baru di GUI. Pattern disimpan hanya setelah uji `bandingkan.py` lolos.
- **Memperbaiki pattern**: pakai tab Training gaya. Jangan menyunting `patterns/*.json` langsung. Perubahan harus lewat `scripts/simpan_pattern.py` supaya versi lama tercadang di `patterns/_backup/`.
- Field pattern dijelaskan di `PLAN.md` dan di dalam file pattern itu sendiri.

## Batasan

- Claude "melihat" klip lewat potongan frame, bukan menonton penuh. Gerakan sangat cepat di antara frame bisa terlewat.
- Posisi cut dari video contoh terdeteksi akurat, tetapi jenis dan durasi transisi ditentukan Claude dari gambar, jadi bisa sedikit berbeda dari aslinya.
- `bandingkan.py` bisa melewatkan cut di antara dua klip yang sama-sama gelap atau mirip. Laporan training mencatat bila selisih jumlah shot disebabkan footage, bukan pattern.
- Efek yang belum didukung: animasi teks per huruf, efek 3D, masking objek, speed ramp. Pattern mencatatnya di `belum_didukung`.
- Audio diatur di GUI: audio panduan dari video contoh, library studio `brand/musik/`, atau tanpa musik. Audio referensi milik orang lain, jadi lagu untuk unggahan sebaiknya dipilih di aplikasi Instagram.
- Font: daftar, kategori, dan kegunaan tiap font ada di `fonts/fonts.json`. Untuk menambah font, taruh file `.ttf` di `fonts/` lalu tambah entrinya di `fonts.json`.

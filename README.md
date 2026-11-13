# Edit Reel Interior

Aplikasi di Mac untuk mengubah klip mentah proyek interior menjadi Instagram Reel 9:16. Klien cukup memilih folder klip, memilih gaya, lalu menekan **Mulai edit**. Claude melihat setiap klip, menyusun urutan cerita, lalu merender video final ke `<folder klip>/hasil/`.

Aplikasi berjalan di browser (`http://localhost:5173`), tetapi semua proses terjadi di Mac itu sendiri. Klip tidak diunggah ke mana pun. Yang dikirim ke Claude hanya potongan gambar dari klip supaya Claude bisa "melihat" isinya.

## Isi proyek

```
edit-skill/
├── README.md              ← dokumen ini
├── frontend/              ← aplikasi GUI (React + server lokal Vite)
│   ├── server/            ← API lokal: chat Claude, render, daftar klip, training
│   ├── src/               ← tampilan
│   └── .env               ← pengaturan mesin Claude (tidak ikut git, dibuat sendiri)
└── skill/
    ├── interior-reels/    ← "otak" editor: SKILL.md (aturan untuk Claude), scripts Python, pattern gaya, font, logo
    └── contoh-video/      ← video contoh tiap gaya (preview di GUI dan bahan training)
```

## Kebutuhan

- Mac dengan Apple Silicon (M1 atau lebih baru) dan macOS 14 atau lebih baru.
- Ruang kosong sekitar 2 GB, ditambah ruang untuk klip dan hasil render.
- Koneksi internet (untuk Claude dan untuk unduh font saat instalasi).
- Akun Claude berlangganan (Pro atau Max) untuk login Claude Code. Alternatifnya API key Anthropic, lihat bagian [Memakai API key](#memakai-api-key-opsional).

## Instalasi di Mac klien (sekali saja)

Semua perintah di bawah dijalankan di aplikasi **Terminal** (cari "Terminal" di Spotlight). Salin satu blok, tempel, tekan Enter, tunggu sampai selesai, lalu lanjut ke blok berikutnya.

### 1. Pasang Homebrew

Lewati langkah ini kalau `brew --version` sudah menampilkan nomor versi.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Ikuti petunjuk di akhir instalasi. Biasanya Homebrew meminta menjalankan dua baris `echo ... >> ~/.zprofile` dan `eval ...`. Setelah itu tutup Terminal dan buka lagi.

### 2. Pasang alat yang dibutuhkan

```bash
brew install python ffmpeg-full oven-sh/bun/bun
```

`ffmpeg-full` wajib, bukan `ffmpeg` biasa. Versi full punya filter teks (`drawtext`) dan stabilisasi video (`vidstab`) yang dipakai render.

### 3. Pasang dan login Claude Code

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Tutup Terminal, buka lagi, lalu jalankan:

```bash
claude
```

Pilih login dengan akun Claude (langganan). Setelah berhasil masuk, ketik `/exit`. Langkah ini cukup sekali. Aplikasi memakai login yang sama setiap kali Claude bekerja.

### 4. Salin proyek ke Mac klien

Pilih salah satu cara.

**A. Dari GitHub** (kalau Mac klien punya akses ke repo):

```bash
cd ~/Desktop
git clone https://github.com/alfianwilfredo/edit-skill.git
```

**B. Dari flashdisk atau AirDrop**: salin folder `edit-skill` ke `~/Desktop` di Mac klien. Jangan ikut menyalin folder-folder berikut karena besar atau berisi data pribadi:

- `frontend/node_modules/` (dibuat ulang di langkah 5)
- `frontend/.env` (berisi key, buat baru di Mac klien kalau perlu)
- `skill/bahan/` dan `skill/result/` (klip dan hasil uji)

Folder proyek boleh di mana saja, asal masih di dalam folder pengguna (`/Users/<nama>/...`). Contoh di README ini memakai `~/Desktop/edit-skill`.

### 5. Siapkan aplikasi

```bash
cd ~/Desktop/edit-skill/frontend
bun install
bash ../skill/interior-reels/setup.sh
```

`setup.sh` memeriksa Python dan ffmpeg, lalu mengunduh font. Hasil akhirnya harus tertulis:

```
SIAP. Skill interior-reels bisa dipakai.
```

Kalau ada baris `GAGAL`, pasang alat yang disebut di baris itu, lalu jalankan `setup.sh` lagi.

## Menjalankan aplikasi (setiap kali dipakai)

```bash
cd ~/Desktop/edit-skill/frontend
bun run dev
```

Buka **http://localhost:5173** di Chrome atau Safari.

Jangan tutup jendela Terminal itu selama aplikasi dipakai. Terminal adalah "mesin" aplikasinya. Kalau Terminal ditutup, tombol di GUI akan memunculkan error `Failed to fetch`. Untuk mematikan aplikasi, tekan `Ctrl + C` di Terminal.

Jangan me-restart Terminal saat edit atau training sedang berjalan. Prosesnya tetap selesai di belakang, tetapi GUI berhenti memantaunya dan balasan Claude tidak muncul di chat.

Pertama kali memilih folder, macOS bisa menanyakan izin Terminal untuk mengakses Desktop atau Documents. Pilih **Allow**.

## Cara memakai

Bagian atas aplikasi punya tiga tab.

### Edit reel

1. **Folder klip**: tekan tombol folder, pilih folder berisi klip mentah (`.mp4`, `.mov`).
2. **Daftar klip**: klik thumbnail untuk memutar klip. Pada menu di bawah tiap klip, bisa dipilih:
   - **Pembuka**: klip yang wajib jadi shot pertama.
   - **Penutup**: klip yang wajib jadi shot terakhir.
   - **Jangan dipakai**: klip yang tidak boleh masuk video.

   Kalau tidak dipilih, Claude yang menentukan.
3. **Gaya edit**: pilih gaya. Tombol ▶ memutar video contoh gaya itu.
   - **Ikuti referensi**: susunan shot, durasi, dan transisi mengikuti video contoh.
   - **Custom**: hanya tampilan gaya (warna, transisi, efek) yang diambil. Durasi dan jumlah shot menyesuaikan klip.
4. **Hasil & teks** (panel kanan): atur teks, logo, dan musik.
5. Tekan **Mulai edit**. Proses beberapa menit. Video final tersimpan di `<folder klip>/hasil/`.

**Revisi**: setelah hasil ada, ketik permintaan di chat, misalnya "shot kedua kurang bagus". Claude memeriksa hasil, lalu bertanya lewat kartu berisi tombol pilihan. Pilih jawaban, tekan **Kirim jawaban**, lalu **Kerjakan** pada kartu ringkasan. Tombol **Langsung kerjakan** melewati tanya-jawab dan memakai pilihan yang disarankan.

Mengubah peran klip setelah hasil ada akan memunculkan tombol **Terapkan pilihan klip**.

### Gaya baru

Membuat gaya baru dari video reel favorit. Pilih video contoh, beri nama, lalu tekan **Analisis video**. Claude mengisi draft gayanya. Setelah disimpan, video contoh otomatis disalin ke `skill/contoh-video/` supaya bisa diputar sebagai preview.

### Training gaya

Memeriksa apakah sebuah gaya sudah benar-benar mirip video contohnya.

1. Pilih gaya, pilih cara menilai (**Ikuti referensi** atau **Custom**), dan pastikan folder klip sudah dipilih.
2. Tekan **Mulai training**. Claude merender reel uji dengan klip itu, lalu membandingkannya dengan video contoh.
3. Panel kanan menampilkan video contoh dan hasil uji berdampingan, ditambah tabel penilaian. Tombol ⟳ memuat ulang hasil.
4. Kalau belum mirip, Claude mengusulkan perbaikan gaya lewat kartu ringkasan. Perbaikan baru disimpan setelah **Kerjakan** ditekan. Versi lama gaya otomatis dicadangkan ke `skill/interior-reels/patterns/_backup/`.

File training tersimpan di `<folder klip>/_training/`, terpisah dari hasil edit.

## Memakai API key (opsional)

Secara default aplikasi memakai login Claude Code (langganan, tanpa saldo API). Untuk memakai API key Anthropic, buat file `frontend/.env` berisi:

```
ENGINE=api
CLAUDE=sk-ant-...
```

Perubahan langsung berlaku tanpa restart. Key hanya dibaca server lokal dan tidak pernah dikirim ke browser. Jangan bagikan file `.env`.

## Mengganti data studio

- **Logo**: `skill/interior-reels/brand/logo.png` (hitam) dan `logo-putih.png` (putih), PNG transparan.
- **Nama, website, Instagram, CTA, gaya default**: `skill/interior-reels/brand.json`.
- **Musik studio**: taruh file musik di `skill/interior-reels/brand/musik/`.

## Memperbarui aplikasi

Kalau dipasang dari GitHub:

```bash
cd ~/Desktop/edit-skill
git pull
cd frontend && bun install
```

Kalau dipasang dari salinan folder, timpa folder `frontend/server`, `frontend/src`, dan `skill/interior-reels` dengan versi baru. Folder `patterns/` dan `brand/` jangan ditimpa kalau klien sudah membuat gaya atau mengganti logo sendiri.

## Masalah umum

| Gejala | Penyebab | Solusi |
|---|---|---|
| `Failed to fetch` saat menekan tombol | Terminal `bun run dev` tertutup atau mati | Jalankan lagi `bun run dev`, lalu refresh browser |
| Muncul label status merah di pojok kanan atas (bukan titik hijau) | Ada alat yang belum terpasang | Label merah menyebut alat yang kurang. Ulangi langkah instalasi 2 atau 3 |
| Asisten "Belum aktif" | Claude Code belum login | Jalankan `claude` di Terminal, login, lalu `/exit` |
| `command not found: bun` / `claude` | Terminal belum dibuka ulang setelah instalasi | Tutup Terminal, buka lagi |
| `Port 5173 is in use` | Aplikasi sudah jalan di jendela Terminal lain | Pakai jendela yang sudah ada, atau tutup dengan `Ctrl + C` |
| Render gagal karena filter `drawtext` atau `vidstab` | Yang terpasang `ffmpeg` biasa | `brew install ffmpeg-full`, lalu `bash ../skill/interior-reels/setup.sh` |
| Folder tidak bisa dipilih atau klip tidak muncul | Folder di luar folder pengguna, atau izin macOS ditolak | Pindahkan klip ke Desktop/Documents. Izinkan di System Settings → Privacy & Security → Files and Folders → Terminal |
| Video tidak bisa diputar di preview | Format kamera (HEVC) di browser lama | Pakai Chrome atau Safari versi terbaru |

## Untuk developer

```bash
cd frontend
bun run build   # typecheck + build, wajib lolos sebelum commit
bun run lint
```

Detail teknis GUI ada di `frontend/README.md`. Aturan kerja Claude ada di `skill/interior-reels/SKILL.md`, dan format `plan.json` ada di `skill/interior-reels/PLAN.md`.

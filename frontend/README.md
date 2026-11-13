# Edit Reel Interior (GUI)

GUI untuk skill `../skill/interior-reels`. Klien cukup pilih folder klip, pilih gaya, lalu tekan **Mulai edit**. Asisten (Claude) melihat klip, bertanya isi teks bila perlu, dan merender video ke `<folder klip>/hasil/`.

## Jalankan

```bash
bun install          # sekali saja
bun run dev          # buka http://localhost:5173
```

Syarat: `ffmpeg-full` dan `python3` (`brew install ffmpeg-full python`).

## Mesin asisten

Default: Claude Code CLI (`claude -p`), memakai login langganan Claude, tanpa saldo API. Syarat: `claude` terpasang dan sudah login sekali di Terminal.

Untuk memakai API langsung, tambahkan `ENGINE=api` di `frontend/.env` (berlaku tanpa restart).

## API key (hanya untuk ENGINE=api)

Isi key di `frontend/.env` sebagai `CLAUDE=sk-ant-...`. Untuk laptop klien, cukup ganti nilai `CLAUDE` di file itu. Bisa juga diisi lewat kotak kuning di GUI, yang menulis ke file yang sama. Key tidak pernah dikirim ke browser; server lokal yang memanggil API.

## Struktur

- `server/api.ts`: rute `/api/*` (status, pilih folder, logo, data studio, chat, file hasil). Dipasang sebagai plugin Vite.
- `server/agent.ts`: loop agent (Claude + tool: run_script, view_image, read_file, write_file, list_dir). Membaca `SKILL.md` sebagai instruksi.
- `src/App.tsx`: layar utama.

Riwayat chat disimpan di memori server. Restart server = chat baru.

#!/usr/bin/env python3
"""Simpan perubahan pattern hasil training dengan backup.

Pakai:
  python3 simpan_pattern.py <nama> <file.json>

- <file.json> harus objek JSON (isi pattern baru).
- patterns/<nama>.json lama disalin ke patterns/_backup/<nama>-<YYYYmmdd-HHMMSS>.json.
- `name` dipaksa = <nama>. `audio_panduan` dan `video_contoh` lama dipertahankan bila tidak ada di file baru.
Jangan edit patterns/*.json langsung; selalu lewat script ini (lihat SKILL.md "Alur: training gaya").
"""
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

PATTERNS = Path(__file__).resolve().parent.parent / "patterns"
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def main():
    if len(sys.argv) != 3:
        sys.exit("Pakai: python3 simpan_pattern.py <nama> <file.json>")
    nama, src = sys.argv[1], Path(sys.argv[2]).expanduser()
    if not SLUG.match(nama):
        sys.exit(f"ERROR: nama pattern tidak valid: {nama} (huruf kecil, angka, tanda -)")
    try:
        baru = json.loads(src.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        sys.exit(f"ERROR: gagal membaca {src}: {e}")
    if not isinstance(baru, dict):
        sys.exit("ERROR: isi pattern harus objek JSON")

    tujuan = PATTERNS / f"{nama}.json"
    if tujuan.exists():
        try:
            lama = json.loads(tujuan.read_text(encoding="utf-8"))
        except ValueError:
            lama = {}
        cadangan = PATTERNS / "_backup" / f"{nama}-{datetime.now():%Y%m%d-%H%M%S}.json"
        k = 2
        while cadangan.exists():  # dua simpan dalam detik yang sama
            cadangan = cadangan.with_name(f"{nama}-{datetime.now():%Y%m%d-%H%M%S}-{k}.json")
            k += 1
        cadangan.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tujuan, cadangan)
        print(f"Backup: {cadangan}")
        if isinstance(lama, dict):
            for k in ("audio_panduan", "video_contoh"):
                if k not in baru and k in lama:
                    baru[k] = lama[k]
    baru["name"] = nama
    tujuan.write_text(json.dumps(baru, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Disimpan: {tujuan}")


if __name__ == "__main__":
    main()

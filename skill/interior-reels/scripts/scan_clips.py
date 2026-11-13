#!/usr/bin/env python3
"""Pindai semua klip di satu folder supaya Claude bisa "melihat" isinya.

Untuk tiap klip dibuat 1 gambar grid (default 8 frame, 4x2) + data teknis.
Hasil: <out>/<nama-klip>.jpg dan <out>/manifest.json

Pakai:
  python3 scan_clips.py <folder-klip> [--out <folder>] [--frames 8]
"""
import argparse
import json
from pathlib import Path

from _common import VIDEO_EXT, need_ffmpeg, probe, progres, progres_gagal, run


def contact_sheet(src, dst, dur, n):
    cols = 4
    rows = (n + cols - 1) // cols
    # fps=n/dur mengambil n frame yang tersebar rata sepanjang klip
    vf = f"fps={n}/{max(dur, 0.1):.3f},scale=360:-2,tile={cols}x{rows}:padding=6:color=white"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", vf,
         "-frames:v", "1", "-q:v", "4", str(dst)])
    # perkiraan detik tiap frame (urut kiri-atas ke kanan-bawah)
    return [round((i + 0.5) * dur / n, 1) for i in range(n)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--out", default=None, help="default: <folder>/_scan")
    ap.add_argument("--frames", type=int, default=8)
    a = ap.parse_args()
    need_ffmpeg()

    folder = Path(a.folder).expanduser().resolve()
    out = Path(a.out).expanduser().resolve() if a.out else folder / "_scan"
    out.mkdir(parents=True, exist_ok=True)

    clips = sorted(p for p in folder.iterdir()
                   if p.suffix.lower() in VIDEO_EXT and not p.name.startswith("."))
    if not clips:
        progres_gagal("scan", "Tidak ada video di folder bahan.", "Pastikan folder yang dipilih berisi video.")
        raise SystemExit(f"Tidak ada video di {folder}")

    manifest = []
    for i, c in enumerate(clips):
        progres("scan", 100 * i / len(clips), f"Melihat klip {i + 1} dari {len(clips)}")
        info = probe(c)
        sheet = out / f"{c.stem}.jpg"
        info["detik_frame"] = contact_sheet(c, sheet, info["durasi"], a.frames)
        manifest.append({"file": str(c), "grid": str(sheet), **info})
        print(f"OK  {c.name:30s} {info['durasi']:6.1f}s  {info['orientasi']}")

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    progres("scan", 100, "Selesai")
    print(f"\n{len(manifest)} klip. Grid + manifest di: {out}")


if __name__ == "__main__":
    main()

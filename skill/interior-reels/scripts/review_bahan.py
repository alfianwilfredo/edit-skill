#!/usr/bin/env python3
"""Siapkan lembar review untuk SEMUA klip di satu folder bahan, supaya Claude bisa melihat tiap klip sampai habis.

Tiap klip dipecah jadi frame berjarak tetap (langkah), tiap 16 frame jadi satu lembar 4x4
dengan stempel waktu (detik) di tiap kotak. Untuk tiap klip juga dibuat berkas keputusan
<folder>/_review/<nama>.json yang HARUS diisi setelah lembar dilihat.

Pakai:
  python3 review_bahan.py <folder-bahan> [--out <folder>/_review] [--maks-frame 48]

Aturan (lihat SKILL.md): sebelum membuat plan, semua klip di folder bahan wajib:
  1. lembarnya dilihat satu per satu sampai lembar terakhir,
  2. berkas JSON-nya diisi (sudah_dilihat, catatan per lembar, rentang_layak, goyang, keputusan).
(Belum ditegakkan otomatis oleh render.py; cek manual sebelum membuat plan.)
"""
import argparse
import json
import math
from pathlib import Path

from _common import VIDEO_EXT, need_ffmpeg, probe, progres, progres_gagal, run

CELL = 320          # sisi tiap kotak lembar (px)
PER_SHEET = 16      # 4x4
FONT = Path(__file__).resolve().parent.parent / "fonts" / "Poppins-Light.ttf"


def sheets_for(src, out, dur, maks):
    step = max(0.5, dur / maks)
    n_frame = max(1, math.ceil(dur / step))
    stem = src.stem
    vf = (f"fps=1/{step:.4f},"
          f"scale={CELL}:{CELL}:force_original_aspect_ratio=decrease,"
          f"pad={CELL}:{CELL}:(ow-iw)/2:(oh-ih)/2:color=black,"
          f"drawtext=fontfile={FONT}:text='%{{pts\\:hms}}':x=8:y=8:fontsize=26:"
          f"fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6,"
          f"tile=4x4:padding=4:color=gray")
    pattern = out / f"{stem}_lembar_%02d.jpg"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-an", "-vf", vf,
         "-frames:v", str(math.ceil(n_frame / PER_SHEET)), str(pattern)])
    files = sorted(out.glob(f"{stem}_lembar_*.jpg"))
    return step, n_frame, [f.name for f in files]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--out", default=None)
    ap.add_argument("--maks-frame", type=int, default=48)
    a = ap.parse_args()
    need_ffmpeg()
    folder = Path(a.folder).expanduser().resolve()
    out = Path(a.out).expanduser().resolve() if a.out else folder / "_review"
    out.mkdir(parents=True, exist_ok=True)

    clips = sorted(p for p in folder.iterdir()
                   if p.suffix.lower() in VIDEO_EXT and not p.name.startswith("."))
    if not clips:
        progres_gagal("review", "Tidak ada video di folder bahan.", "Pastikan folder yang dipilih berisi video.")
        raise SystemExit(f"Tidak ada video di {folder}")

    for i, c in enumerate(clips):
        progres("review", 100 * i / len(clips), f"Menyiapkan lembar review klip {i + 1} dari {len(clips)}")
        info = probe(c)
        step, n_frame, lembar = sheets_for(c, out, info["durasi"], a.maks_frame)
        js = out / f"{c.stem}.json"
        if js.exists():
            data = json.loads(js.read_text())   # jangan timpa keputusan yang sudah diisi
            data.update({"lembar": lembar, "langkah_detik": round(step, 2), "durasi": info["durasi"]})
        else:
            data = {
                "file": str(c), "durasi": info["durasi"], "langkah_detik": round(step, 2),
                "lembar": lembar,
                "sudah_dilihat": False,
                "catatan_lembar": {Path(x).stem: "" for x in lembar},
                "goyang": [],          # [{"dari": 0, "sampai": 3}] detik yang goyang
                "rentang_layak": [],   # [{"dari": 0, "sampai": 3, "alasan": "..."}]
                "keputusan": "",       # "pakai" | "pakai sebagian" | "buang"
                "catatan_umum": "",
            }
        js.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        print(f"{c.name}: {info['durasi']}s, {n_frame} frame, {len(lembar)} lembar -> {js}")
    progres("review", 100, "Selesai")
    print(f"\nLihat setiap lembar di {out} (urut dari _lembar_01), lalu isi JSON tiap klip.")


if __name__ == "__main__":
    main()

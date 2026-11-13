#!/usr/bin/env python3
"""Bandingkan video referensi dengan hasil render, shot per shot.

Pakai:
  python3 bandingkan.py <referensi.mp4> <hasil.mp4> [--out banding.jpg]

Hasil:
  - lembar gambar: per blok, baris atas = frame referensi di tengah tiap shot,
    baris bawah = frame hasil di waktu yang sama (diskalakan bila durasi beda > 2%).
  - tabel teks: tiap cut referensi vs cut hasil terdekat, selisih > 0.15 detik ditandai.
Wajib dipakai sebelum pattern baru disimpan (lihat SKILL.md, aturan ekstraksi referensi).
"""
import argparse
import shutil
import tempfile
from pathlib import Path

from _common import need_ffmpeg, probe, run
from analyze_ref import detect_cuts

PER_BARIS = 10
LEBAR = 120
TINGGI = 214


def frame(src, t, dst):
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0.0, t):.3f}", "-i", str(src), "-frames:v", "1",
         "-vf", f"scale={LEBAR}:{TINGGI}:force_original_aspect_ratio=decrease:force_divisible_by=2,"
                f"pad={LEBAR}:{TINGGI}:(ow-iw)/2:(oh-ih)/2:color=black", str(dst)])


def kosong(dst):
    run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=white:s={LEBAR}x{TINGGI}",
         "-frames:v", "1", str(dst)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("referensi")
    ap.add_argument("hasil")
    ap.add_argument("--out", default=None, help="default: <hasil>_banding.jpg")
    ap.add_argument("--thr", type=float, default=40)
    a = ap.parse_args()
    need_ffmpeg()

    ref, hasil = Path(a.referensi).expanduser().resolve(), Path(a.hasil).expanduser().resolve()
    out = Path(a.out).expanduser().resolve() if a.out else hasil.with_name(hasil.stem + "_banding.jpg")
    dr, dh = probe(ref)["durasi"], probe(hasil)["durasi"]
    skala = dh / dr if dr and abs(dh - dr) / dr > 0.02 else 1.0

    cr = [t for t, _ in detect_cuts(ref, a.thr) if 0.25 < t < dr - 0.25]
    ch = [t for t, _ in detect_cuts(hasil, a.thr) if 0.25 < t < dh - 0.25]
    b = [0.0] + cr + [dr]
    mids = [(b[i] + b[i + 1]) / 2 for i in range(len(b) - 1)]

    print(f"Referensi: {ref.name}  {dr:.2f}s  {len(cr) + 1} shot")
    print(f"Hasil    : {hasil.name}  {dh:.2f}s  {len(ch) + 1} shot")
    if skala != 1.0:
        print(f"  ! durasi beda {abs(dh - dr) / dr:.0%}; waktu referensi diskalakan x{skala:.3f} untuk dibandingkan")
    if len(cr) != len(ch):
        print(f"  ! jumlah shot beda: referensi {len(cr) + 1}, hasil {len(ch) + 1}")
    print("\n  cut ref   cut hasil  selisih")
    meleset = 0
    for t in cr:
        ts = t * skala
        near = min(ch, key=lambda x: abs(x - ts)) if ch else None
        if near is None:
            print(f"  {t:7.2f}   {'-':>9}  tidak ada")
            meleset += 1
            continue
        d = near - ts
        flag = "  <-- meleset" if abs(d) > 0.15 else ""
        meleset += bool(flag)
        print(f"  {t:7.2f}   {near:9.2f}  {d:+.2f}{flag}")
    lebih = [x for x in ch if not cr or min(abs(x - t * skala) for t in cr) > 0.3]
    if lebih:
        print(f"  ! cut di hasil yang tidak ada di referensi: {', '.join(f'{x:.2f}' for x in lebih)}")
    print(f"\n{meleset} dari {len(cr)} cut referensi meleset > 0.15s")

    tmp = Path(tempfile.mkdtemp(prefix="banding_"))
    try:
        k = 0
        for s in range(0, len(mids), PER_BARIS):
            blok = mids[s:s + PER_BARIS]
            pad = PER_BARIS - len(blok)
            for src, sk in ((ref, 1.0), (hasil, skala)):
                for t in blok:
                    frame(src, min(t * sk, (dh if src == hasil else dr) - 0.05), tmp / f"{k:04d}.jpg")
                    k += 1
                for _ in range(pad):
                    kosong(tmp / f"{k:04d}.jpg")
                    k += 1
        rows = k // PER_BARIS
        run(["ffmpeg", "-v", "error", "-y", "-framerate", "1", "-i", str(tmp / "%04d.jpg"),
             "-vf", f"tile={PER_BARIS}x{rows}:padding=3:margin=3:color=white",
             "-frames:v", "1", "-q:v", "3", str(out)])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\nLembar banding: {out}")
    print("Baca per pasangan baris: atas = referensi, bawah = hasil, di tengah tiap shot referensi.")


if __name__ == "__main__":
    main()

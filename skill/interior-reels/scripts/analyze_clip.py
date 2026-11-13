#!/usr/bin/env python3
"""Nilai kualitas tiap bagian klip supaya Claude tahu detik mana yang layak masuk reel.

Tiap sampel (default 10 fps) dinilai: terang rata-rata, kontras, ketajaman (variansi Laplacian),
kepadatan tepi (ada objek atau tidak), dan gerak antar sampel. Sampel yang gelap, kosong,
blur, atau gerak terlalu besar ditandai. Bagian bersih yang berurutan diubah jadi "rentang".

Hasil: <out>/<nama>_kualitas.json (per sampel + rentang bagus) dan <out>/<nama>_kualitas.txt.
Keputusan akhir tetap harus dicek dengan melihat frame di rentang yang disarankan.

Pakai:
  python3 analyze_clip.py <video> [--out <folder>] [--fps 10] [--min-rentang 1.0]
"""
import argparse
import json
from pathlib import Path

import numpy as np

from _common import need_ffmpeg, probe, run

W, H = 270, 480  # resolusi analisis (cukup untuk ketajaman dan tepi)


def load_frames(src, fps):
    raw = run(["ffmpeg", "-v", "error", "-i", str(src), "-an", "-vf",
               f"fps={fps},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},format=gray",
               "-f", "rawvideo", "-"], binary=True).stdout
    n = len(raw) // (W * H)
    return np.frombuffer(raw[:n * W * H], dtype=np.uint8).reshape(n, H, W).astype(np.float32)


def sharpness(f):
    # variansi Laplacian pada tengah frame (buang tepi gelap/vignette)
    c = f[H // 4:3 * H // 4, W // 4:3 * W // 4]
    lap = -4 * c[1:-1, 1:-1] + c[:-2, 1:-1] + c[2:, 1:-1] + c[1:-1, :-2] + c[1:-1, 2:]
    return float(lap.var())


def edge_density(f):
    gx = np.abs(np.diff(f, axis=1))[:-1, :]
    gy = np.abs(np.diff(f, axis=0))[:, :-1]
    g = gx + gy
    return float((g > 18).mean())


def shift(a, b):
    # phase correlation pada jendela tengah: geser (dx, dy) antar sampel
    y0, x0 = H // 2 - 64, W // 2 - 64
    A = a[y0:y0 + 128, x0:x0 + 128]; B = b[y0:y0 + 128, x0:x0 + 128]
    A = A - A.mean(); B = B - B.mean()
    R = np.fft.fft2(A) * np.conj(np.fft.fft2(B)); R /= np.abs(R) + 1e-9
    r = np.fft.ifft2(R).real
    dy, dx = np.unravel_index(np.argmax(r), r.shape)
    return (dx - 128 if dx > 64 else dx), (dy - 128 if dy > 64 else dy)


def analyze(src, fps):
    F = load_frames(src, fps)
    n = len(F)
    rows = []
    for i in range(n):
        f = F[i]
        rows.append({
            "t": round(i / fps, 2),
            "terang": round(float(f.mean()), 1),
            "kontras": round(float(f.std()), 1),
            "tajam": round(sharpness(f), 1),
            "tepi": round(edge_density(f), 4),
            "gerak": 0.0,
        })
    for i in range(1, n):
        dx, dy = shift(F[i - 1], F[i])
        rows[i]["gerak"] = round(float(np.hypot(dx, dy)), 2)
    return rows


def flag_rows(rows):
    """Tandai sampel buruk. Ambang gelap absolut, ketajaman dan tepi relatif ke median klip."""
    tajam_med = np.median([r["tajam"] for r in rows]) or 1.0
    tepi_med = np.median([r["tepi"] for r in rows]) or 1.0
    gerak_p90 = np.percentile([r["gerak"] for r in rows], 90) if len(rows) > 5 else 99
    for r in rows:
        f = []
        if r["terang"] < 35:
            f.append("gelap")
        if r["kontras"] < 14 or r["tepi"] < 0.25 * tepi_med:
            f.append("kosong")
        if r["tajam"] < 0.35 * tajam_med:
            f.append("blur")
        if r["gerak"] > max(gerak_p90 * 1.5, 12):
            f.append("gerak-tiba")
        r["flag"] = f
        r["skor"] = round((r["tajam"] / tajam_med) * (r["tepi"] / tepi_med), 2) if not f else 0.0
    return rows


def ranges(rows, min_len):
    """Rentang berurutan tanpa flag, minimal min_len detik."""
    out, cur = [], []
    for r in rows + [None]:
        if r is not None and not r["flag"]:
            cur.append(r)
            continue
        if cur:
            a, b = cur[0]["t"], cur[-1]["t"] + 0.1
            if b - a >= min_len:
                skor = round(float(np.mean([c["skor"] for c in cur])), 2)
                out.append({"mulai": round(a, 2), "selesai": round(b, 2),
                            "durasi": round(b - a, 2), "skor_rata": skor})
            cur = []
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", default=None)
    ap.add_argument("--fps", type=float, default=10)
    ap.add_argument("--min-rentang", type=float, default=1.0)
    a = ap.parse_args()
    need_ffmpeg()
    src = Path(a.video).expanduser().resolve()
    out = Path(a.out).expanduser().resolve() if a.out else src.parent / "_kualitas"
    out.mkdir(parents=True, exist_ok=True)

    info = probe(src)
    rows = flag_rows(analyze(src, a.fps))
    rng = ranges(rows, a.min_rentang)
    data = {"file": str(src), "durasi": info["durasi"], "fps_analisis": a.fps,
            "rentang_bagus": rng, "sampel": rows}
    (out / f"{src.stem}_kualitas.json").write_text(json.dumps(data, indent=2, ensure_ascii=False))

    # ringkasan teks per detik (1 baris per detik)
    lines = [f"{src.name}  durasi {info['durasi']}s", "detik  terang  kontras  tajam  tepi    gerak  flag"]
    for s in range(int(info["durasi"]) + 1):
        seg = [r for r in rows if int(r["t"]) == s]
        if not seg:
            continue
        m = lambda k: np.mean([r[k] for r in seg])
        fl = sorted({x for r in seg for x in r["flag"]})
        lines.append(f"{s:5d}  {m('terang'):6.1f}  {m('kontras'):7.1f}  {m('tajam'):7.1f}  "
                     f"{m('tepi'):.3f}  {m('gerak'):5.1f}  {','.join(fl) or '-'}")
    lines.append("")
    lines.append("rentang bagus (tanpa flag):")
    lines += [f"  {x['mulai']:6.2f} - {x['selesai']:6.2f}  ({x['durasi']}s, skor {x['skor_rata']})" for x in rng] or ["  (tidak ada)"]
    (out / f"{src.stem}_kualitas.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nSimpan: {out}")


if __name__ == "__main__":
    main()

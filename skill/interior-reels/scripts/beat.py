#!/usr/bin/env python3
"""Deteksi ketukan (beat) musik dan geser titik cut ke ketukan terdekat.

Python murni + ffmpeg (tanpa numpy/librosa). Cukup untuk musik ber-beat jelas;
untuk musik ambient keyakinannya rendah dan cut tidak digeser.

Pakai mandiri (cek BPM):
  python3 beat.py <audio> [--mulai 0] [--durasi 30]
"""
import argparse
import math
import subprocess
import sys
from array import array

SR = 11025
HOP = 256            # ~23 ms
FPS = SR / HOP
MIN_YAKIN = 1.25     # rasio puncak autokorelasi / rata-rata; di bawah ini dianggap tidak yakin


def decode(path, mulai=0.0, durasi=None):
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{max(0.0, mulai):.3f}"]
    if durasi:
        cmd += ["-t", f"{durasi:.3f}"]
    cmd += ["-i", str(path), "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"]
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        return array("h")
    a = array("h")
    a.frombytes(p.stdout[: len(p.stdout) // 2 * 2])
    if sys.byteorder == "big":
        a.byteswap()
    return a


def onset(samples):
    """Kurva onset: kenaikan energi log per hop, dikurangi rata-rata lokal (~0.5 s)."""
    n = len(samples) // HOP
    e = []
    for i in range(n):
        s = 0
        for x in samples[i * HOP:(i + 1) * HOP]:
            s += x * x
        e.append(math.log1p(s / HOP))
    flux = [0.0] + [max(0.0, e[i] - e[i - 1]) for i in range(1, n)]
    w = int(FPS * 0.25)
    pre = [0.0]
    for v in flux:
        pre.append(pre[-1] + v)
    out = []
    for i in range(n):
        lo, hi = max(0, i - w), min(n, i + w + 1)
        out.append(max(0.0, flux[i] - (pre[hi] - pre[lo]) / (hi - lo)))
    return out


def tempo(o, bpm_min=60, bpm_max=180):
    """(periode dalam frame, bpm, yakin) dari autokorelasi kurva onset."""
    n = len(o)
    lo, hi = int(math.ceil(60 * FPS / bpm_max)), int(60 * FPS / bpm_min)
    if n < hi * 4:
        return None, 0.0, 0.0
    # haluskan supaya periode pecahan (mis. 21.5 frame) tidak kalah dari kelipatannya
    k = (0.25, 0.5, 1.0, 0.5, 0.25)
    sm = [sum(k[j] * o[i + j - 2] for j in range(5) if 0 <= i + j - 2 < n) for i in range(n)]
    ac = {}
    for lag in range(lo, hi + 1):
        s = 0.0
        for i in range(n - lag):
            s += sm[i] * sm[i + lag]
        ac[lag] = s / (n - lag)
    rata = sum(ac.values()) / len(ac)

    def bobot(lag):
        # bobot ringan di sekitar 120 BPM supaya tidak memilih setengah/dua kali tempo
        return ac[lag] * math.exp(-0.5 * math.log2(60 * FPS / lag / 120) ** 2)
    best = max(ac, key=bobot)
    yakin = ac[best] / rata if rata > 0 else 0.0
    per = float(best)
    if lo < best < hi:
        a, b, c = ac[best - 1], ac[best], ac[best + 1]
        d = a - 2 * b + c
        if d < 0:
            per = best + 0.5 * (a - c) / d
    return per, 60 * FPS / per, yakin


def ketukan(path, mulai=0.0, durasi=None):
    """(bpm, yakin, [detik ketukan relatif terhadap mulai])."""
    o = onset(decode(path, mulai, durasi))
    per, bpm, yakin = tempo(o)
    if not per:
        return 0.0, 0.0, []
    # fase: geser grid yang menangkap onset terbanyak
    best_p, best_s = 0, -1.0
    for p in range(int(per) + 1):
        s, t = 0.0, float(p)
        while t < len(o):
            s += o[int(round(t))] if int(round(t)) < len(o) else 0.0
            t += per
        if s > best_s:
            best_p, best_s = p, s
    beats, t = [], float(best_p)
    while t < len(o):
        beats.append(t / FPS)
        t += per
    return bpm, yakin, beats


def sinkron(vis, beats, langkah=1, maks=0.25, min_shot=0.5):
    """Geser batas antar shot ke ketukan terdekat. Total durasi tetap (shot terakhir menyerap).
    langkah=2: hanya ketukan genap/ganjil (dipilih yang paling dekat dengan cut)."""
    if len(vis) < 2 or not beats:
        return list(vis), 0
    batas = []
    acc = 0.0
    for d in vis[:-1]:
        acc += d
        batas.append(acc)
    total = sum(vis)
    grid = beats
    if langkah == 2:
        def jarak(g):
            return sum(min(abs(b - x) for x in g) for b in batas)
        grid = min((beats[0::2], beats[1::2]), key=jarak)
    baru, geser, prev = [], 0, 0.0
    for i, b in enumerate(batas):
        t = min(grid, key=lambda x: abs(x - b))
        nxt = batas[i + 1] if i + 1 < len(batas) else total
        if abs(t - b) <= maks and t - prev >= min_shot and nxt - t >= min_shot and abs(t - b) > 0.005:
            b, geser = t, geser + 1
        baru.append(b)
        prev = b
    edges = [0.0] + baru + [total]
    return [round(edges[i + 1] - edges[i], 3) for i in range(len(vis))], geser


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--mulai", type=float, default=0.0)
    ap.add_argument("--durasi", type=float, default=None)
    x = ap.parse_args()
    bpm, yakin, beats = ketukan(x.audio, x.mulai, x.durasi)
    print(f"BPM {bpm:.1f}  yakin {yakin:.2f}  ({'cukup' if yakin >= MIN_YAKIN else 'RENDAH'})  {len(beats)} ketukan")
    print("ketukan pertama:", [round(b, 2) for b in beats[:8]])

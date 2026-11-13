#!/usr/bin/env python3
"""Cari font yang paling mirip dengan teks di frame video referensi.

Pakai: python3 font_match.py <gambar.png> --box x,y,w,h --teks "NOBA" [--top 8] [--gelap]

- --box: kotak HANYA satu baris teks (lihat frame di _ref/ atau crop manual). Satu baris per panggilan.
- --teks: isi baris itu, huruf besar/kecil harus sama dengan di frame.
- --gelap: teks gelap di latar terang (default: teks putih di latar gelap).
Kandidat: semua font di fc-list (sistem + Homebrew) dan interior-reels/fonts/.
Skor: IoU bentuk huruf (setelah dibentangkan ke kotak yang sama) dikurangi penalti rasio lebar/tinggi.
Hasil = KANDIDAT TERDEKAT, bukan kepastian nama font. Cek visual sebelum dipakai.
"""
import argparse
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from _common import need_ffmpeg, probe, run

FONTS_LOKAL = Path(__file__).resolve().parent.parent / "fonts"
GRID_W, GRID_H = 160, 40          # kanvas perbandingan (px)
FONT_PX = 160                     # ukuran render kandidat (px), hanya untuk bentuk


NON_LATIN = re.compile(r"Armenian|Georgian|Hebrew|Arabic|Devanagari|Thai|Bengali|Gujarati|Gurmukhi|"
                       r"Kannada|Tamil|Telugu|Khmer|Lao|Myanmar|Sinhala|Tibetan|Ethiopic|Symbol|"
                       r"Ornament|Emoji|Wingding|Webding|Dingbat|Math|Kufi|Naskh|Nastaliq|Mongolian|Cherokee", re.I)


def daftar_font():
    out = subprocess.run(["fc-list", ":", "file", "family", "style"], capture_output=True, text=True).stdout
    paths = set()
    for baris in out.splitlines():
        p = baris.split(":")[0].strip()
        if p.lower().endswith((".ttf", ".otf")) and Path(p).exists():
            paths.add(p)
    paths.update(str(p) for p in FONTS_LOKAL.glob("*.ttf"))
    return sorted(p for p in paths if not NON_LATIN.search(Path(p).name))


def gray_dari_gambar(img, box):
    """Ambil kotak dari gambar, kembalikan array 2D grayscale."""
    x, y, w, h = box
    info = probe(img)
    raw = run(["ffmpeg", "-v", "error", "-i", str(img), "-vf", f"crop={w}:{h}:{x}:{y}",
               "-f", "rawvideo", "-pix_fmt", "gray", "-"], binary=True).stdout
    return np.frombuffer(raw, np.uint8)[: w * h].reshape(h, w)


def _sliding(a, k, fn):
    """Min/max filter ukuran k x k pakai numpy (tanpa scipy/cv2), tepi dipad."""
    pad = k // 2
    pa = np.pad(a, pad, mode="edge")
    win = np.lib.stride_tricks.sliding_window_view(pa, (k, k))
    return fn(win, axis=(2, 3))


def mask_tophat(g, k=15, selisih=40):
    """Teks = piksel yang lebih terang dari sekitarnya (white top-hat).
    Latar terang luas ikut terbuang, huruf tipis tetap tinggal."""
    a = g.astype(np.int16)
    buka = _sliding(_sliding(a, k, np.min), k, np.max)   # opening = dilate(erode)
    return (a - buka) > selisih



def bbox(mask):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return mask[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def tampil_ke_kotak(mask, h=GRID_H, w=GRID_W):
    """Skala ke tinggi h dengan rasio asli (lebar ikut), lalu rata kiri di kanvas w. Bool."""
    mh, mw = mask.shape
    nw = max(1, min(w, round(mw * h / mh)))
    yi = (np.arange(h) * mh / h).astype(int)
    xi = (np.arange(nw) * mw / nw).astype(int)
    out = np.zeros((h, w), bool)
    out[:, :nw] = mask[np.ix_(yi, xi)]
    return out


def render_kandidat(font, teks, tmp_teks, tmpdir, gelap):
    """Render teks dengan font, kembalikan mask (True = huruf) dari ffmpeg rawvideo gray."""
    fg, bg = ("black", "white") if gelap else ("white", "black")
    W = max(200, int(len(teks) * FONT_PX * 0.9))
    H = int(FONT_PX * 2)
    vf = (f"drawtext=fontfile='{font}':textfile='{tmp_teks}':expansion=none:"
          f"fontsize={FONT_PX}:fontcolor={fg}:x=(w-text_w)/2:y=(h-text_h)/2")
    cmd = ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c={bg}:s={W}x{H}:d=1",
           "-vf", vf, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0 or not p.stdout:
        return None
    arr = np.frombuffer(p.stdout, np.uint8).reshape(H, W)
    return arr > 128


def gambar_baris(gray, tinggi=120, lebar=640):
    """Skala gray (2D uint8) ke tinggi tetap, tempel rata kiri di kanvas hitam lebar tetap."""
    h, w = gray.shape
    nw = min(lebar, max(1, round(w * tinggi / h)))
    yi = (np.arange(tinggi) * h / tinggi).astype(int)
    xi = (np.arange(nw) * w / nw).astype(int)
    out = np.zeros((tinggi, lebar), np.uint8)
    out[:, :nw] = gray[np.ix_(yi, xi)]
    return out


def tulis_lembar(path, baris_gambar, label_teks, tmpdir):
    """Susun baris-baris (urut atas ke bawah) jadi satu PNG dengan label nama font."""
    lebar = baris_gambar[0].shape[1]
    tinggi = sum(b.shape[0] + 8 for b in baris_gambar)
    kanvas = np.zeros((tinggi, lebar), np.uint8)
    y = 0
    for b in baris_gambar:
        kanvas[y:y + b.shape[0]] = b
        y += b.shape[0] + 8
    raw = tmpdir / "lembar.raw"
    raw.write_bytes(kanvas.tobytes())
    # label: satu drawtext per baris, teks dari file agar aman dari karakter khusus
    filt = []
    y = 0
    for i, (b, lab) in enumerate(zip(baris_gambar, label_teks)):
        tf = tmpdir / f"label_{i}.txt"
        tf.write_text(lab)
        filt.append(f"drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:textfile='{tf}':"
                    f"expansion=none:fontsize=16:fontcolor=yellow:x=8:y={y + 4}")
        y += b.shape[0] + 8
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray",
           "-s", f"{lebar}x{tinggi}", "-i", str(raw), "-vf", ",".join(filt) or "null",
           "-frames:v", "1", str(path)]
    run(cmd)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gambar")
    ap.add_argument("--box", required=True, help="x,y,w,h satu baris teks")
    ap.add_argument("--teks", required=True)
    ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--gelap", action="store_true")
    ap.add_argument("--lembar", help="simpan PNG: referensi di atas, kandidat di bawahnya untuk dibandingkan mata")
    ap.add_argument("--mask", choices=["tophat", "ambang"], default="tophat")
    ap.add_argument("--kernel", type=int, default=15, help="lebar (px) struktur yang dianggap latar")
    ap.add_argument("--ambang", type=int, default=180, help="ambang terang untuk teks putih")
    a = ap.parse_args()
    need_ffmpeg()

    box = [int(v) for v in a.box.split(",")]
    g = gray_dari_gambar(Path(a.gambar).expanduser().resolve(), box)
    if a.mask == "tophat":
        ref_mask = mask_tophat(255 - g if a.gelap else g, a.kernel)
    else:
        ref_mask = (g < a.ambang) if a.gelap else (g > a.ambang)
    ref = bbox(ref_mask)
    if ref is None:
        raise SystemExit("Tidak ada piksel teks di kotak. Cek --box dan --ambang.")
    rh, rw = ref.shape
    ys, xs = np.where(ref_mask)
    ref_gray = g[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
    ref_k = tampil_ke_kotak(ref)
    ref_ar = rw / rh

    fonts = daftar_font()
    print(f"Kandidat font: {len(fonts)}")
    tmpdir = Path(tempfile.mkdtemp())
    tmp_teks = tmpdir / "teks.txt"
    tmp_teks.write_text(a.teks)

    def skor(font):
        m = render_kandidat(font, a.teks, tmp_teks, tmpdir, a.gelap)
        if m is None:
            return None
        cb = bbox(m)
        if cb is None:
            return None
        ch, cw = cb.shape
        k = tampil_ke_kotak(cb)
        inter = np.logical_and(k, ref_k).sum()
        union = np.logical_or(k, ref_k).sum()
        iou = inter / union if union else 0.0
        return iou, iou, cw / ch, font

    with ThreadPoolExecutor(max_workers=8) as ex:
        hasil = [r for r in ex.map(skor, fonts) if r]
    hasil.sort(key=lambda r: r[0], reverse=True)
    print(f"Rasio lebar/tinggi referensi: {ref_ar:.2f}")
    print(f"{'skor':>6} {'iou':>5} {'rasio':>6}  font")
    for s, iou, ar, font in hasil[: a.top]:
        print(f"{s:6.3f} {iou:5.3f} {ar:6.2f}  {font}")
    if a.lembar:
        # referensi: grayscale area teks asli
        baris = [gambar_baris(ref_gray)]
        labels = ["REFERENSI"]
        for s, iou, ar, font in hasil[: a.top]:
            m = render_kandidat(font, a.teks, tmp_teks, tmpdir, a.gelap)
            cb = bbox(m)
            baris.append(gambar_baris((cb * 255).astype(np.uint8)))
            labels.append(f"{Path(font).name}  skor {s:.3f}")
        tulis_lembar(Path(a.lembar).expanduser().resolve(), baris, labels, tmpdir)
        print(f"Lembar perbandingan: {a.lembar}")


if __name__ == "__main__":
    main()

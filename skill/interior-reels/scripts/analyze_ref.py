#!/usr/bin/env python3
"""Ubah video contoh (reel referensi) menjadi DRAFT pattern.

Yang diukur otomatis: titik cut dan durasi tiap shot.
Yang harus diisi Claude setelah melihat gambar (semua field "?"): nama slot dan
jenis shot, gerak kamera, jenis transisi, teks, color grade, dan min_klip/ideal_klip.

Hasil di <out>/:
  shots.jpg    1 frame dari tengah tiap shot (urut)  -> isi shot + teks
  cuts.jpg     frame tepat di tiap titik cut          -> jenis transisi
  draft.json   draft pattern, field bertanda "?" wajib diisi
  audio.m4a    audio video contoh (audio panduan), bila ada

Pakai:
  python3 analyze_ref.py <video> --name <nama-pattern> [--out <folder>] [--thr 40]
"""
import argparse
import json
import shutil
import statistics
import tempfile
from pathlib import Path

from _common import need_ffmpeg, probe, progres, progres_gagal, run


def area_aktif(src):
    """Area gambar tanpa bar hitam (cropdetect sepanjang video). None bila tidak ada bar."""
    import collections
    import re
    log = run(["ffmpeg", "-v", "info", "-i", str(src), "-an", "-vf", "fps=2,cropdetect=24:2:0", "-f", "null", "-"]).stderr
    hit = collections.Counter(re.findall(r"crop=(\d+:\d+:\d+:\d+)", log))
    if not hit:
        return None
    w, h, _, _ = map(int, hit.most_common(1)[0][0].split(":"))
    full = probe(src)
    if w >= full["lebar"] * 0.95 and h >= full["tinggi"] * 0.95:
        return None
    return hit.most_common(1)[0][0]


def detect_cuts(src, min_thr):
    """Deteksi cut DAN transisi bertahap (crossfade, slide, fade ke hitam).

    Tiap frame (thumbnail abu-abu 32x56) dibandingkan dengan frame 0.5 detik
    sebelumnya. Crossfade yang per-frame nyaris tak berubah tetap muncul sebagai
    puncak. Hasil: list (detik, jenis) dengan jenis "cut" atau "bertahap ~X s".
    """
    W, H, fps, k = 32, 56, 30, 15
    # Letterbox/pillarbox: bandingkan hanya area gambar, kalau tidak perubahan "terencerkan" bar hitam.
    crop = area_aktif(src)
    pre = f"crop={crop}," if crop else ""
    raw = run(["ffmpeg", "-v", "error", "-i", str(src), "-an", "-vf",
               f"{pre}fps={fps},scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
              binary=True).stdout
    n = W * H
    F = [raw[i:i + n] for i in range(0, len(raw) - n + 1, n)]

    def diff(a, b):
        return sum(abs(x - y) for x, y in zip(a, b)) / n

    d1 = [0.0] + [diff(F[i], F[i - 1]) for i in range(1, len(F))]
    dk = [0.0] * k + [diff(F[i], F[i - k]) for i in range(k, len(F))]
    thr = max(min_thr, 3.5 * statistics.median(dk[k:] or [0]))

    events, i = [], 0
    while i < len(dk):
        if dk[i] <= thr:
            i += 1
            continue
        j = i
        while j + 1 < len(dk) and dk[j + 1] > thr:
            j += 1
        center = (i + j) / 2 - k / 2           # geser balik setengah jendela
        width = (j - i + 1 - k) / fps           # perkiraan lama transisi
        spike = max(d1[i:j + 1]) > 0.6 * max(dk[i:j + 1])
        jenis = "cut" if spike and width < 0.2 else f"bertahap ~{max(width, 0.2):.1f}s"
        events.append((round(max(center, 0) / fps, 2), jenis))
        i = j + 1

    # Hard cut per frame: puncak lokal d1 yang jauh di atas gerak normal. Menangkap montase cepat
    # yang selisih 0.5 detiknya selalu tinggi sehingga ambang adaptif dk tidak pernah terlewati.
    t1 = max(10.0, 10 * statistics.median(d1[1:] or [0]))
    for i in range(1, len(d1)):
        if d1[i] > t1 and d1[i] == max(d1[max(1, i - 5):i + 6]):
            t = round(i / fps, 2)
            if all(abs(t - e[0]) > 0.3 for e in events):
                events.append((t, "cut"))
    return sorted(events)


def filmstrip(src, dst, crop):
    """Seluruh video 4 fps, 16 kolom (1 baris = 4 detik), dipotong ke area gambar bila ada bar."""
    pre = f"crop={crop}," if crop else ""
    dur = probe(src)["durasi"]
    rows = max(1, int(dur // 4) + 1)
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-an", "-vf",
         f"{pre}fps=4,scale=96:-2,tile=16x{rows}:padding=2:color=white",
         "-frames:v", "1", "-q:v", "4", str(dst)])


def grid_shot(src, bounds, dst, crop):
    """3 frame per shot (awal, tengah, akhir), satu baris per shot."""
    pre = f"crop={crop}," if crop else ""
    tmp = Path(tempfile.mkdtemp())
    try:
        k = 0
        for a, b in zip(bounds, bounds[1:]):
            m = min(0.08, (b - a) / 4)
            for t in (a + m, (a + b) / 2, min(b - m, bounds[-1] - 0.2)):  # frame terakhir file kadang tak terbaca
                run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, t):.3f}", "-i", str(src),
                     "-frames:v", "1", "-vf", f"{pre}scale=240:136:force_original_aspect_ratio=decrease:force_divisible_by=2,"
                     "pad=240:136:(ow-iw)/2:(oh-ih)/2:color=black", str(tmp / f"{k:03d}.jpg")])
                k += 1
        rows = len(bounds) - 1
        run(["ffmpeg", "-v", "error", "-y", "-framerate", "1", "-i", str(tmp / "%03d.jpg"),
             "-vf", f"tile=3x{rows}:padding=4:color=white", "-frames:v", "1", "-q:v", "4", str(dst)])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def grid(src, times, dst):
    tmp = Path(tempfile.mkdtemp())
    try:
        for i, t in enumerate(times):
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(src),
                 "-frames:v", "1", "-vf", "scale=300:-2", str(tmp / f"{i:03d}.jpg")])
        cols = min(len(times), 5)
        rows = (len(times) + cols - 1) // cols
        run(["ffmpeg", "-v", "error", "-y", "-framerate", "1", "-i", str(tmp / "%03d.jpg"),
             "-vf", f"tile={cols}x{rows}:padding=6:color=white",
             "-frames:v", "1", "-q:v", "4", str(dst)])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", default=None, help="default: ./_ref/<name>")
    ap.add_argument("--thr", type=float, default=40,
                    help="ambang minimum (0-255). Turunkan (30) kalau transisi terlewat, "
                         "naikkan (55) kalau gerakan kamera ikut terdeteksi sebagai cut")
    a = ap.parse_args()
    need_ffmpeg()

    src = Path(a.video).expanduser().resolve()
    if not src.exists():
        progres_gagal("analisis", "Video contoh tidak ditemukan.", "Pilih ulang video contoh lalu coba lagi.")
        raise SystemExit(f"ERROR: video tidak ada: {src}")
    out = Path(a.out).expanduser().resolve() if a.out else Path("_ref") / a.name
    out.mkdir(parents=True, exist_ok=True)
    info = probe(src)
    dur = info["durasi"]

    progres("analisis", 0, "Menganalisis video contoh: mencari titik potong")
    events = [(t, j) for t, j in detect_cuts(src, a.thr) if 0.25 < t < dur - 0.25]
    cuts = [t for t, _ in events]
    bounds = [0.0] + cuts + [dur]
    shots = [round(bounds[i + 1] - bounds[i], 2) for i in range(len(bounds) - 1)]

    progres("analisis", 50, "Menganalisis video contoh: membuat gambar tiap potongan")
    crop = area_aktif(src)
    grid_shot(src, bounds, out / "shots.jpg", crop)
    progres("analisis", 75, "Menganalisis video contoh: membuat gambar seluruh video")
    filmstrip(src, out / "filmstrip.jpg", crop)
    progres("analisis", 90, "Menganalisis video contoh: menyimpan musik dan titik transisi")
    # Audio panduan: disalin ke patterns/audio/<nama>.m4a saat pattern disimpan lewat GUI.
    if info.get("audio"):
        run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-c:a", "aac", "-b:a", "160k", str(out / "audio.m4a")])
    if cuts:
        grid(src, cuts, out / "cuts.jpg")

    slots = []
    for i, d in enumerate(shots):
        if i == 0:
            masuk = None
        elif events[i - 1][1] == "cut":
            masuk = {"jenis": "cut"}
        else:
            masuk = {"jenis": "?", "durasi": "?", "petunjuk": events[i - 1][1]}
        slots.append({"slot": "?", "jenis_shot": "?", "durasi": d,
                      "gerak": "?", "transisi_masuk": masuk, "efek_masuk": None})
    saran_min = max(1, sum(1 for d in shots if d >= 0.3))
    draft = {
        "name": a.name,
        "sumber": src.name,
        "deskripsi": "?",
        "cocok_untuk": "?",
        "durasi_total": dur,
        # Saran kasar: shot < 0.3 detik biasanya kilasan/blur transisi dari klip sebelahnya.
        "min_klip": "?",
        "ideal_klip": "?",
        "min_klip_saran_otomatis": saran_min,
        "alur": slots,
        "teks": [{"slot": "?", "gaya": "?", "animasi": "?", "contoh_isi": "?"}],
        "grade": {"kontras": 1.0, "saturasi": 1.0, "terang": 0.0, "hangat": 0.0},
        # Wajib diisi dari filmstrip.jpg + shots.jpg: tiap efek dipetakan ke field plan, atau ke belum_didukung.
        "efek_cek": {k: "?" for k in ("bingkai", "pembuka", "penutup", "kilat", "kotak", "teks", "logo", "grade")},
        "belum_didukung": [],
    }
    if crop:
        w, h = map(int, crop.split(":")[:2])
        draft["bingkai"] = {"jenis": "letterbox", "rasio": round(w / h, 2)}
    (out / "draft.json").write_text(json.dumps(draft, indent=2, ensure_ascii=False))
    progres("analisis", 100, "Selesai")
    print(f"{len(shots)} shot terdeteksi, durasi {dur}s")
    print("durasi_shot:", shots)
    for t, j in events:
        print(f"  transisi di {t:5.2f}s : {j}")
    print(f"Saran min_klip otomatis: {saran_min} (shot >= 0.3 detik). Koreksi setelah melihat shots.jpg.")
    if crop:
        print(f"Bingkai terdeteksi: area gambar {crop} (letterbox/pillarbox), cut dideteksi di area itu saja")
    print(f"WAJIB lihat {out/'filmstrip.jpg'} (4 fps) dan {out/'shots.jpg'} (3 frame per shot)"
          + (f", juga {out/'cuts.jpg'}" if cuts else ""))
    if info.get("audio"):
        print(f"Audio panduan: {out/'audio.m4a'}")
    print(f"Lengkapi {out/'draft.json'} lalu simpan ke patterns/{a.name}.json")


if __name__ == "__main__":
    main()

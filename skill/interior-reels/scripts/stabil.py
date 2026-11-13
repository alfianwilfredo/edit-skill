"""Stabilizer otomatis: ukur goyang tiap segmen, putuskan stabil atau tidak, pilih smoothing terbaik,
geser `mulai` bila rentang terlalu goyang/blur, dan siapkan filter vidstab untuk render.

Alur per segmen (mode "auto", default):
  1. Potong rentang segmen + pre/post-roll PRE detik dari sumber, skala "cover" ke resolusi analisis.
  2. Ukur jitter (getaran sisa setelah gerak disengaja dibuang) di area crop yang terlihat, dalam px
     output selebar 1080, dan blur (blurdetect).
  3. Jitter <= JIT_DIAM: tanpa stabil. Selain itu coba smoothing 30 dan 60 di frame penuh (sebelum crop),
     ukur ulang, pilih sisa jitter terkecil.
  4. Sisa <= JIT_OK: pakai. <= JIT_MAX: pakai + peringatan. Lebih / blur > BLUR_MAX: geser mulai
     (maks +-GESER_MAX detik, tetap di rentang_layak dan di luar zona goyang review). Tetap gagal: berhenti.
Flag manual di plan menang: "stabil": true = selalu stabil (pilih smoothing terbaik), false = tidak pernah.
Hasil keputusan dicache di <folder plan>/_stabil/, jadi preview dan final memakai keputusan yang sama.
"""
import hashlib
import json
import math
import shutil
import subprocess
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from _common import probe, progres, run

VERSI = 1          # naikkan bila cara ukur berubah, supaya cache lama tidak dipakai
FPS = 30
PRE = 1.5          # detik konteks sebelum/sesudah segmen; vidstab butuh ini agar awal/akhir shot tidak "menyusul"
AW = 540           # lebar analisis (px); jitter dilaporkan dalam px output 1080
JIT_DIAM = 5.0     # jitter asli <= ini: tidak perlu stabil
JIT_OK = 6.0       # sisa jitter <= ini: bersih
JIT_MAX = 10.0     # sisa jitter <= ini: dipakai dengan peringatan; lebih = gagal
BLUR_MAX = 10.0    # blurdetect mean > ini: frame blur karena goyang, stabil tidak menolong
SMOOTHING = (30, 60)
GESER = (0.5, -0.5, 1.0, -1.0)
DETECT = "vidstabdetect=shakiness=8:accuracy=12:stepsize=6:mincontrast=0.2"
_lock = threading.Lock()
_diukur = 0        # jumlah analisis yang benar-benar diukur (bukan dari cache), untuk progres


def transform(trf, smoothing):
    return f"vidstabtransform=input={trf}:smoothing={smoothing}:optzoom=1:interpol=bicubic"


def punya_vidstab():
    p = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True)
    return "vidstabdetect" in p.stdout


def _ff(*args, cwd=None):
    return run(["ffmpeg", "-v", "error", "-y", *map(str, args)]) if cwd is None else \
        subprocess.run(["ffmpeg", "-v", "error", "-y", *map(str, args)], cwd=cwd, check=True,
                       capture_output=True)


def _jitter(video, n0, n1, tmp, crop=None):
    """Sisa getaran (px output 1080, sumbu terburuk) di frame n0..n1 video analisis."""
    vf = (crop + "," if crop else "")
    trf = tmp / f"j_{video.stem}.trf"
    _ff("-i", video, "-vf", f"{vf}{DETECT}:result={trf}", "-f", "null", "-")
    d = Path(tempfile.mkdtemp(dir=tmp))
    _ff("-i", video, "-vf", f"{vf}vidstabtransform=input={trf}:debug=1", "-f", "null", "-", cwd=d)
    rows = [ln.split() for ln in (d / "global_motions.trf").read_text().splitlines() if ln[:1].isdigit()]
    hasil = []
    for kol in (1, 2):
        tr = [0.0]
        for r in rows:
            tr.append(tr[-1] + float(r[kol]))
        w = 7  # +-0.23 detik: gerak lebih lambat dari ini dianggap disengaja
        sm = [sum(tr[max(0, i - w):i + w + 1]) / len(tr[max(0, i - w):i + w + 1]) for i in range(len(tr))]
        r = [tr[i] - sm[i] for i in range(max(0, n0), min(n1, len(tr)))]
        hasil.append(math.sqrt(sum(x * x for x in r) / max(1, len(r))) * 1080 / AW)
    return round(max(hasil), 1)


def _blur(video, t0, dur, crop):
    p = subprocess.run(["ffmpeg", "-i", str(video), "-vf",
                        f"trim=start={t0:.3f}:duration={dur:.3f},{crop},blurdetect=block_pct=80",
                        "-f", "null", "-"], capture_output=True, text=True)
    vals = [ln.rsplit(":", 1)[-1] for ln in p.stderr.splitlines() if "blur mean" in ln]
    return round(float(vals[-1]), 1) if vals else 0.0


def analisis(src, mulai, need, k, ah, mode, durasi_klip, cache_dir, paksa=None):
    """Ukur satu rentang. paksa: None (auto) / True (selalu stabil). Hasil dicache."""
    key = json.dumps([VERSI, str(src), src.stat().st_mtime, round(mulai, 3), round(need, 3), k, ah, mode, paksa])
    js = cache_dir / f"{src.stem}_{hashlib.sha1(key.encode()).hexdigest()[:12]}.json"
    if js.exists():
        return json.loads(js.read_text())
    a = max(0.0, mulai - PRE)
    pre = mulai - a
    t = min(durasi_klip - a, pre + need + PRE)
    n0, n1 = int(pre / k * FPS), int((pre + need) / k * FPS)
    crop = f"crop={AW}:{ah}" if mode == "increase" else "null"  # mode decrease (isi blur): tanpa crop
    tmp = Path(tempfile.mkdtemp(prefix="stabil_"))
    try:
        cover = tmp / "cover.mp4"
        _ff("-ss", f"{a:.3f}", "-t", f"{t:.3f}", "-i", src, "-vf",
            f"setpts=(PTS-STARTPTS)/{k},fps={FPS},scale={AW}:{ah}:force_original_aspect_ratio={mode}"
            ":force_divisible_by=2", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", cover)
        hasil = {"mulai": mulai, "jitter": _jitter(cover, n0, n1, tmp, crop),
                 "blur": _blur(cover, pre / k, need / k, crop), "smoothing": None, "sisa": None}
        if paksa or hasil["jitter"] > JIT_DIAM:
            full = tmp / "full.trf"
            _ff("-i", cover, "-vf", f"{DETECT}:result={full}", "-f", "null", "-")
            for sm in SMOOTHING:
                c = tmp / f"s{sm}.mp4"
                _ff("-i", cover, "-vf", f"{transform(full, sm)},{crop}", "-an", "-c:v", "libx264",
                    "-preset", "ultrafast", "-crf", "12", c)
                sisa = _jitter(c, n0, n1, tmp)
                if hasil["sisa"] is None or sisa < hasil["sisa"]:
                    hasil["smoothing"], hasil["sisa"] = sm, sisa
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    js.write_text(json.dumps(hasil))
    global _diukur
    with _lock:
        _diukur += 1
    return hasil


def nilai(h, paksa):
    """Status dari hasil ukur: lewati / ok / peringatan / gagal."""
    if paksa is None and h["jitter"] <= JIT_DIAM:
        return "lewati"  # blur di klip tenang = fokus/bokeh, bukan urusan stabilizer
    if h["blur"] > BLUR_MAX and h["jitter"] > JIT_MAX:
        # blur hanya dianggap motion blur bila goyangnya berat; blur di klip agak goyang = bokeh/fokus
        return "gagal" if paksa is None else "peringatan"
    if h["sisa"] >= h["jitter"]:
        return "gagal" if paksa is None else "peringatan"  # stabil justru memperburuk
    if h["sisa"] <= JIT_OK:
        return "ok"
    if h["sisa"] <= JIT_MAX or paksa:
        return "peringatan"
    return "gagal"


def _review(src):
    js = src.parent / "_review" / f"{src.stem}.json"
    return json.loads(js.read_text()) if js.exists() else {}


def _boleh(mulai, need, durasi_klip, rev):
    if mulai < 0 or mulai + need > durasi_klip:
        return False
    akhir = mulai + need
    layak = rev.get("rentang_layak")
    if layak and not any(r["dari"] - 0.05 <= mulai and akhir <= r["sampai"] + 0.05 for r in layak):
        return False
    return not any(z["dari"] < akhir and mulai < z["sampai"] for z in rev.get("goyang", []))


def putuskan(i, sg, need_detik, ah, mode, base):
    """Keputusan stabil untuk satu segmen. need_detik = durasi render (sudah termasuk transisi)."""
    flag = sg.get("stabil", "auto")
    if flag is False:
        return {"aksi": "mati (manual)", "status": "lewati", "mulai": float(sg.get("mulai", 0)), "smoothing": None}
    paksa = True if flag is True else None
    src = Path(sg["file"]).expanduser().resolve()
    k = float(sg.get("kecepatan", 1.0))
    need = need_detik * k
    dur = probe(src)["durasi"]
    mulai = min(float(sg.get("mulai", 0)), max(0.0, dur - need))
    cache = base / "_stabil"
    h = analisis(src, mulai, need, k, ah, mode, dur, cache, paksa)
    st = nilai(h, paksa)
    coba = [(0.0, h, st)]
    if st == "gagal":
        rev = _review(src)
        for g in GESER:
            m2 = round(mulai + g, 2)
            if not _boleh(m2, need, dur, rev):
                continue
            h2 = analisis(src, m2, need, k, ah, mode, dur, cache, paksa)
            s2 = nilai(h2, paksa)
            coba.append((g, h2, s2))
            if s2 != "gagal":
                h, st = h2, s2
                break
    geser = round(h["mulai"] - float(sg.get("mulai", 0)), 2)
    aksi = "tanpa stabil" if st == "lewati" else (f"stabil s{h['smoothing']}" if h["smoothing"] else "-")
    if geser:
        aksi += f", mulai {geser:+.1f}s"
    return {"aksi": aksi, "status": st, "mulai": h["mulai"], "smoothing": h["smoothing"] if st != "lewati" else None,
            "jitter": h["jitter"], "sisa": h["sisa"], "blur": h["blur"], "coba": len(coba), "file": src.name}


def putuskan_semua(segs, rlen, ah_fn, base):
    """ah_fn(seg) -> (tinggi analisis, mode scale). Jalan paralel, cetak tabel, kembalikan list keputusan."""
    print("\nStabil: mengukur goyang tiap segmen (dicache di _stabil/) ...")
    n = len(segs)
    selesai = [0]
    awal = _diukur
    progres("stabil", 0, f"Mengukur goyang klip 1 dari {n}")

    def satu(a):
        r = putuskan(a[0], a[1], rlen[a[0]], *ah_fn(a[1]), base)
        with _lock:  # dipanggil dari thread worker: hitung + tulis di bawah lock
            selesai[0] += 1
            k = selesai[0]
            if k < n:
                progres("stabil", 100 * k / n, f"Mengukur goyang klip {k + 1} dari {n}")
        return r

    with ThreadPoolExecutor(3) as ex:
        out = list(ex.map(satu, enumerate(segs)))
    if _diukur == awal:
        progres("stabil", 100, "Goyang semua klip sudah diukur sebelumnya", cache=True)
    else:
        progres("stabil", 100, "Selesai mengukur goyang semua klip")
    print(f"  {'seg':>3} {'klip':<14} {'goyang':>7} {'sisa':>6} {'blur':>5}  aksi")
    for i, r in enumerate(out):
        j = f"{r['jitter']:.1f}px" if "jitter" in r else "-"
        s = f"{r['sisa']:.1f}" if r.get("sisa") is not None else "-"
        b = f"{r['blur']:.1f}" if "blur" in r else "-"
        tanda = {"peringatan": "  ! sisa goyang terlihat", "gagal": "  ! GAGAL"}.get(r["status"], "")
        print(f"  {i + 1:>3} {r.get('file', ''):<14} {j:>7} {s:>6} {b:>5}  {r['aksi']}{tanda}")
    return out

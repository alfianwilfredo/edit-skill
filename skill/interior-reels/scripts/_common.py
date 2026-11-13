"""Helper bersama. Hanya pakai standard library + ffmpeg/ffprobe."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time

# ffmpeg-full (Homebrew) punya vidstab dan drawtext; pakai bila terpasang.
FFMPEG_FULL = "/opt/homebrew/opt/ffmpeg-full/bin"
if os.path.isdir(FFMPEG_FULL):
    os.environ["PATH"] = FFMPEG_FULL + os.pathsep + os.environ.get("PATH", "")

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".hevc"}


def need_ffmpeg():
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"ERROR: {tool} tidak ditemukan. Pasang dengan: brew install ffmpeg")


def run(cmd, binary=False):
    """Jalankan perintah; kalau gagal, tampilkan 30 baris terakhir stderr.
    binary=True: stdout dikembalikan sebagai bytes (untuk data frame mentah)."""
    p = subprocess.run(cmd, capture_output=True, text=not binary)
    if p.returncode != 0:
        err = p.stderr if isinstance(p.stderr, str) else p.stderr.decode("utf-8", "replace")
        tail = "\n".join(err.strip().splitlines()[-30:])
        sys.exit(f"ERROR menjalankan: {' '.join(cmd[:6])} ...\n{tail}")
    return p


# --- progres untuk GUI ---
# Path dari env PROGRES_FILE. Tanpa env ini semua helper diam (script tetap jalan normal dari terminal).
_progres_lock = threading.Lock()
_progres_akhir = {}  # tahap -> persen terakhir, dipakai progres_gagal


def _tulis_progres(data):
    path = os.environ.get("PROGRES_FILE")
    if not path:
        return
    data.update(script=os.path.basename(sys.argv[0]), ts=time.time())
    # lock: progres dipanggil juga dari thread worker (stabil.py)
    with _progres_lock:
        _progres_akhir[data["tahap"]] = data["persen"]
        tmp = f"{path}.{os.getpid()}.tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            os.replace(tmp, path)  # atomik: server tidak pernah membaca file setengah jadi
        except OSError:
            pass  # gagal tulis progres tidak boleh menggagalkan render


def progres(tahap, persen, pesan, cache=False):
    """Laporkan progres tahap ini (persen 0-100 di dalam tahap) ke PROGRES_FILE."""
    _tulis_progres({"tahap": tahap, "persen": max(0, min(100, int(persen))), "pesan": pesan,
                    "cache": cache, "gagal": False, "saran": None})


def progres_gagal(tahap, pesan, saran=None):
    """Panggil tepat sebelum sys.exit pada kegagalan yang perlu dilihat pengguna."""
    _tulis_progres({"tahap": tahap, "persen": _progres_akhir.get(tahap, 0), "pesan": pesan,
                    "cache": False, "gagal": True, "saran": saran})


def run_progres(cmd, total_detik, cb):
    """Seperti run() untuk ffmpeg, tapi memanggil cb(fraksi 0..1) dari -progress (maks ~4x per detik)."""
    asli = cmd
    cmd = [cmd[0], "-progress", "pipe:1", "-nostats", *cmd[1:]]
    total_us = max(total_detik, 0.001) * 1e6
    with tempfile.TemporaryFile() as err:  # stderr ke file supaya pipe tidak macet
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=err, text=True)
        akhir = 0.0
        for ln in p.stdout:
            if ln.startswith(("out_time_us=", "out_time_ms=")):  # keduanya mikrodetik
                v = ln.split("=", 1)[1].strip()
                if v.lstrip("-").isdigit() and time.monotonic() - akhir >= 0.25:
                    akhir = time.monotonic()
                    cb(max(0.0, min(1.0, int(v) / total_us)))
        p.wait()
        if p.returncode != 0:
            err.seek(0)
            tail = "\n".join(err.read().decode("utf-8", "replace").strip().splitlines()[-30:])
            sys.exit(f"ERROR menjalankan: {' '.join(asli[:6])} ...\n{tail}")
    cb(1.0)
    return p


def probe(path):
    """Durasi, ukuran tampilan (sudah memperhitungkan rotasi HP), fps, ada audio."""
    out = run([
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ]).stdout
    info = json.loads(out)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    if v is None:
        raise ValueError(f"{path} tidak punya stream video")
    w, h = int(v["width"]), int(v["height"])
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"]))
    rot = int(float(v.get("tags", {}).get("rotate", rot)))
    if abs(rot) % 180 == 90:
        w, h = h, w
    num, den = (v.get("avg_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den) if float(den) else 30.0
    dur = float(info["format"].get("duration") or v.get("duration") or 0)
    return {
        "durasi": round(dur, 2),
        "lebar": w,
        "tinggi": h,
        "orientasi": "portrait" if h > w else ("landscape" if w > h else "square"),
        "fps": round(fps, 2),
        "audio": any(s["codec_type"] == "audio" for s in info["streams"]),
    }

#!/usr/bin/env python3
"""Render edit plan (JSON) menjadi reel 9:16 siap upload Instagram.

Pakai:
  python3 render.py plan.json            # hasil final 1080x1920
  python3 render.py plan.json --preview  # cepat, 540x960, untuk cek
Setiap render juga membuat <output>_cek.jpg (grid 12 frame) untuk verifikasi.

Format plan: lihat PLAN.md di folder skill.
"""
import argparse
import hashlib
import json
import shutil
import struct
import sys
import tempfile
from pathlib import Path

from _common import need_ffmpeg, probe, progres, progres_gagal, run, run_progres
import beat
import stabil
import ukur_font

SKILL_DIR = Path(__file__).resolve().parent.parent
FPS = 30
TRANSISI_OK = {
    "cut", "fade", "fadeblack", "fadewhite", "dissolve", "slideleft", "slideright",
    "slideup", "slidedown", "smoothleft", "smoothright", "smoothup", "smoothdown",
    "wipeleft", "wiperight", "wipeup", "wipedown", "circleopen", "circleclose",
    "zoomin", "hblur", "radial", "squeezev", "squeezeh",
}
FONT_FALLBACK = [
    "/System/Library/Fonts/Avenir Next.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
# ukuran relatif tinggi video; posisi y relatif tinggi; x: "tengah" atau rasio kiri
GAYA = {
    "judul": {"size": 0.056, "y": 0.40, "x": "tengah", "font": "DMSerifDisplay-Regular.ttf"},
    "sub":   {"size": 0.026, "y": 0.47, "x": "tengah", "font": "Poppins-Light.ttf"},
    "label": {"size": 0.024, "y": 0.76, "x": 0.08,    "font": "Poppins-Light.ttf"},
    "cta":   {"size": 0.034, "y": 0.50, "x": "tengah", "font": "Poppins-Medium.ttf"},
}
# overlay.json (dari GUI): teks dan logo statis, menimpa teks/logo di plan.
OV_UKURAN_TEKS = {"S": 0.026, "M": 0.036, "L": 0.052, "XL": 0.075}
OV_UKURAN_LOGO = {"S": 0.16, "M": 0.22, "L": 0.30, "XL": 0.40}
OV_BARIS_Y = {"atas": 0.15, "tengah": 0.50, "bawah": 0.76}
OV_LOGO = {"hitam": "brand/logo.png", "putih": "brand/logo-putih.png"}
OV_WARNA = {"putih": "white", "hitam": "black"}
OV_JARAK = 0.015  # jarak antar blok yang ditumpuk, pecahan tinggi layar


def q(s):
    """Quote nilai untuk filtergraph ffmpeg."""
    return "'" + str(s).replace("\\", "\\\\").replace("'", r"'\''") + "'"


def font_opt(spec, default_name, base):
    """Opsi drawtext 'fontfile=...'. spec: nama file di fonts/ atau path.
    Urutan: spec -> font default gaya di fonts/ -> file apa pun di fonts/ -> font sistem."""
    fdir = SKILL_DIR / "fonts"
    cands = []
    if spec:
        cands += [resolve(spec, base), fdir / spec]
    cands.append(fdir / default_name)
    if fdir.is_dir():
        cands += sorted(p for p in fdir.iterdir() if p.suffix.lower() in {".ttf", ".otf", ".ttc"})
    cands += [Path(p) for p in FONT_FALLBACK]
    for c in cands:
        if c.is_file():
            if spec and c.name != Path(spec).name:
                print(f"  ! font '{spec}' tidak ditemukan, pakai {c.name}")
            return f"fontfile={q(c)}", c.name
    sys.exit("ERROR: tidak ada font. Jalankan setup.sh atau taruh .ttf di folder fonts/.")


def resolve(p, base):
    p = Path(p).expanduser()
    return (p if p.is_absolute() else base / p).resolve()


def ukuran_gambar(W, H, bingkai):
    """Ukuran area gambar (lebar, tinggi). Letterbox: pita rasio lebar/tinggi di tengah, sisanya hitam."""
    if bingkai and bingkai.get("jenis") == "letterbox":
        fh = int(W / float(bingkai.get("rasio", 1.78))) // 2 * 2
        return W, min(H, max(2, fh))
    return W, H


def efek_segmen(seg, d, off, fw, fh, W, H):
    """Filter efek pada area gambar [pic] -> kanvas penuh [v0]. off = detik awal yang terlihat."""
    f = []
    redup = float(seg.get("redup", 0) or 0)
    if redup > 0:
        m = max(0.0, 1 - min(redup, 1))
        f.append(f"colorlevels=romax={m:.3f}:gomax={m:.3f}:bomax={m:.3f}")
    em = seg.get("efek_masuk") or {}
    ek = seg.get("efek_keluar") or {}
    jm, dm = em.get("jenis"), max(0.05, float(em.get("durasi", 0.6)))
    jk, dk = ek.get("jenis"), max(0.05, float(ek.get("durasi", 0.6)))
    if jm == "kilat-putih":
        f.append(f"fade=in:st={off:.3f}:d={dm:.3f}:color=white")
    if jm == "potong-vertikal":
        n = 4
        for k in range(1, n):  # pita ke-k tertutup hitam sampai gilirannya
            x0 = fw * k // n
            tk = off + dm * k / n
            f.append(f"drawbox=x={x0}:y=0:w={fw - x0 if k == n - 1 else fw // n + 2}:h={fh}:color=black:t=fill"
                     f":enable='lt(t,{tk:.3f})'")
        f.append(f"drawbox=x=0:y=0:w={fw}:h={fh}:color=black:t=fill:enable='lt(t,{off:.3f})'")
    chain = ",".join(f)
    pre = f"[pic]{chain}[pe];[pe]" if chain else "[pic]"
    if jm == "kotak-membesar" or jk == "kotak-mengecil":
        akhir = off + d
        skala = "1"
        if jm == "kotak-membesar":
            a0 = min(0.95, max(0.05, float(em.get("dari", 0.15))))  # skala awal kotak
            skala = f"min(1,{a0:.3f}+{1 - a0:.3f}*max(0,t-{off:.3f})/{dm:.3f})"
        if jk == "kotak-mengecil":
            keluar = f"max(0.15,1-0.85*max(0,t-{akhir - dk:.3f})/{dk:.3f})"
            skala = keluar if skala == "1" else f"min({skala},{keluar})"
        # kanvas hitam dibuat dari stream yang sama supaya format & rentang warnanya identik dengan pad
        return (f"{pre}split[k1][k2];[k1]scale={W}:{H},drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill[bg];"
                f"[k2]scale=w='max(2,trunc(iw*{skala}/2)*2)':h='max(2,trunc(ih*{skala}/2)*2)':eval=frame[kt];"
                f"[bg][kt]overlay=x='(W-w)/2':y='(H-h)/2':eval=frame[v0]")
    if (fw, fh) != (W, H):
        return f"{pre}pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black[v0]"
    return f"{pre}null[v0]"


def render_segment(i, seg, d, W, H, grade, tmp, base, fast, bingkai=None, off=0.0, smoothing=None, cb=None):
    """cb(fraksi 0..1): progres encode segmen ini (opsional)."""
    src = resolve(seg["file"], base)
    if not src.exists():
        sys.exit(f"ERROR: segmen {i + 1}: file tidak ada: {src}")
    info = probe(src)
    k = float(seg.get("kecepatan", 1.0))
    start = float(seg.get("mulai", 0))
    if start + d * k > info["durasi"] + 0.05:
        start = max(0.0, info["durasi"] - d * k)
        print(f"  ! segmen {i + 1}: klip lebih pendek dari durasi diminta; mulai digeser ke {start:.2f}s, sisa frame dibekukan")

    pre = f"setpts=(PTS-STARTPTS)/{k},fps={FPS}"
    gerak = seg.get("gerak", "diam")
    zoom = 0.08 if gerak in ("zoom-in", "zoom-out") else 0
    fw, fh = ukuran_gambar(W, H, bingkai)
    if (fw, fh) != (W, H) and info["orientasi"] == "portrait":
        print(f"  ! segmen {i + 1}: klip portrait di bingkai letterbox, dipotong banyak di tengah. Pakai klip landscape.")
    # render sedikit lebih besar bila ada zoom supaya gerakannya halus
    sW, sH = (int(fw * 1.5) // 2 * 2, int(fh * 1.5) // 2 * 2) if zoom else (fw, fh)

    if seg.get("isi", "crop") == "blur" and info["orientasi"] != "portrait":
        frame = (f"split[a][b];[a]scale={sW}:{sH}:force_original_aspect_ratio=increase,"
                 f"crop={sW}:{sH},boxblur=30:2,eq=brightness=-0.06[bg];"
                 f"[b]scale={sW}:{sH}:force_original_aspect_ratio=decrease[fg];"
                 f"[bg][fg]overlay=(W-w)/2:(H-h)/2")
    else:
        frame = f"scale={sW}:{sH}:force_original_aspect_ratio=increase,crop={sW}:{sH}"
    a_in, t_in = start, d * k + 0.5
    if smoothing:
        # vidstab di frame penuh SEBELUM crop (ruang geser lebih besar), dengan pre/post-roll
        # stabil.PRE detik supaya awal/akhir shot tidak "menyusul". Keputusan dari stabil.putuskan_semua.
        a_in = max(0.0, start - stabil.PRE)
        roll = (start - a_in) / k
        t_in = (start - a_in) + d * k + stabil.PRE
        mode = "decrease" if seg.get("isi", "crop") == "blur" and info["orientasi"] != "portrait" else "increase"
        cover = f"{pre},scale={sW}:{sH}:force_original_aspect_ratio={mode}:force_divisible_by=2"
        key = hashlib.sha1(json.dumps([str(src), src.stat().st_mtime, round(a_in, 3), round(t_in, 3),
                                       k, sW, sH, mode, stabil.VERSI]).encode()).hexdigest()[:12]
        trf = base / "_stabil" / f"{src.stem}_{key}.trf"
        if not trf.exists():
            trf.parent.mkdir(parents=True, exist_ok=True)
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a_in:.3f}", "-t", f"{t_in:.3f}", "-i", str(src),
                 "-vf", f"{cover},{stabil.DETECT}:result={trf}", "-an", "-f", "null", "-"])
        pre = (f"{cover},{stabil.transform(trf, smoothing)},"
               f"trim=start={roll:.3f},setpts=PTS-STARTPTS")

    if zoom:
        n = max(1, int(d * FPS))
        z = f"1+{zoom}*on/{n}" if gerak == "zoom-in" else f"{1 + zoom}-{zoom}*on/{n}"
        move = (f",zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                f":d=1:s={fw}x{fh}:fps={FPS}")
    else:
        move = ""

    g = grade or {}
    look = (f",eq=contrast={g.get('kontras', 1)}:saturation={g.get('saturasi', 1)}"
            f":brightness={g.get('terang', 0)}")
    h = float(g.get("hangat", 0))
    if h:
        look += f",colorbalance=rm={0.25 * h:.3f}:bm={-0.25 * h:.3f}:rh={0.15 * h:.3f}:bh={-0.15 * h:.3f}"

    # samakan rentang warna ke tv: klip full-range (pc) membuat hitam drawbox (Y16) tampak abu-abu
    vf = (f"[0:v]{pre},{frame}{move},scale=out_range=tv{look},setsar=1[pic];"
          + efek_segmen(seg, d, off, fw, fh, W, H)
          + ";[v0]setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=2[v]")
    out = tmp / f"seg_{i:02d}.mp4"
    cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{a_in:.3f}", "-t", f"{t_in:.3f}",
           "-i", str(src), "-filter_complex", vf, "-map", "[v]", "-t", f"{d:.3f}", "-an",
           "-c:v", "libx264", "-preset", "ultrafast" if fast else "veryfast", "-crf", "16",
           "-r", str(FPS), str(out)]
    run_progres(cmd, d, cb) if cb else run(cmd)
    return out


def alpha_expr(s, e, f, anim, f_out=None):
    """f = fade masuk; f_out = fade keluar (default sama dengan f, 0 = hilang tepat di e/cut)."""
    if anim == "muncul":
        return "1"
    f_out = f if f_out is None else f_out
    keluar = f"if(lt(t,{e - f_out}),1,if(lt(t,{e}),({e}-t)/{f_out},0))" if f_out > 0 else f"if(lt(t,{e}),1,0)"
    return f"if(lt(t,{s}),0,if(lt(t,{s + f}),(t-{s})/{f},{keluar}))"


def png_rasio(p):
    """Rasio tinggi/lebar PNG dibaca dari header (tanpa dependensi)."""
    try:
        w, h = struct.unpack(">II", Path(p).read_bytes()[16:24])
        return h / w if w else 0.2
    except (OSError, struct.error):
        return 0.2


def ukur(isi, font, size):
    """Lebar teks (px) dari metrik font; jatuh ke perkiraan jumlah huruf bila font tidak terbaca."""
    p = SKILL_DIR / "fonts" / (font or "Poppins-Medium.ttf")
    w = ukur_font.lebar(isi, p, size) if p.is_file() else None
    return w if w is not None else len(isi) * size * 0.55


def cek_lebar(isi, w, W):
    if w > W * 0.84:
        print(f"  ! teks '{isi[:24]}' lebar {w / W:.0%} layar, bisa terpotong. Pecah jadi beberapa baris atau perkecil ukuran.")


def logo_grup(logo, W, H):
    """Tata letak logo + teks logo (overlay.json). posisi logo: grid 3x3 seperti teks.
    Teks logo ditumpuk tepat di atas/bawah logo, rata sesuai kolom logo.
    Hasil: dict top/bottom grup, x0/x1, posisi logo (lx, ly, lw), dan daftar teks (isi, size, yc, ...)."""
    lw = int(W * float(logo.get("ukuran", 0.22)))
    lh = lw * png_rasio(logo["file"])
    baris, _, kolom = str(logo.get("posisi", "bawah")).partition("-")
    gap = H * 0.012
    teks = []
    for t in logo.get("teks") or []:
        isi = [x for x in str(t.get("isi", "")).split("\n")]
        if not "".join(isi).strip():
            continue
        size = int(H * OV_UKURAN_TEKS.get(t.get("ukuran", "S"), OV_UKURAN_TEKS["S"]))
        teks.append({"t": t, "isi": isi, "size": size, "h": size * 1.3 * len(isi),
                     "letak": "atas" if t.get("letak") == "atas" else "bawah"})
    atas = [x for x in teks if x["letak"] == "atas"]
    bawah = [x for x in teks if x["letak"] == "bawah"]
    h_atas = sum(x["h"] + gap for x in atas)
    h_bawah = sum(x["h"] + gap for x in bawah)
    gh = h_atas + lh + h_bawah
    top = {"atas": H * 0.13, "tengah": (H - gh) / 2}.get(baris, H * 0.80 - gh)
    lx = {"kiri": W * 0.08, "kanan": W * 0.92 - lw}.get(kolom, (W - lw) / 2)
    ly = top + h_atas
    cur = top
    for x in atas:
        x["top"] = cur
        cur += x["h"] + gap
    cur = ly + lh + gap
    for x in bawah:
        x["top"] = cur
        cur += x["h"] + gap
    lebar = lw
    for x in teks:
        for l in x["isi"]:
            w = ukur(l, x["t"].get("font"), x["size"])
            cek_lebar(l, w, W)
            lebar = max(lebar, w)
    x0 = {"kiri": W * 0.08, "kanan": W * 0.92 - lebar}.get(kolom, (W - lebar) / 2)
    return {"top": top, "bottom": top + gh, "x0": x0, "x1": x0 + lebar, "baris": baris if baris in OV_BARIS_Y else "bawah",
            "kolom": kolom, "lx": lx, "ly": ly, "lw": lw, "teks": teks}


def blok_logo_teks(g, s, e):
    """Blok teks yang menempel pada logo, tampil bersama logo."""
    out = []
    for x in g["teks"]:
        t = x["t"]
        warna = OV_WARNA.get(t.get("warna", "putih"), "white")
        step = x["size"] * 1.3
        lines = [{"isi": l, "size": x["size"], "font": t.get("font"), "warna": warna, "yc": x["top"] + step * (k + 0.5)}
                 for k, l in enumerate(x["isi"])]
        out.append({"lines": lines, "s": s, "e": e, "top": x["top"], "h": x["h"],
                    "x": {"kiri": 0.08, "kanan": "kanan"}.get(g["kolom"], "tengah"),
                    "font_default": "Poppins-Medium.ttf", "animasi": "fade-naik", "latar": False,
                    "bayangan": warna == "white"})
    return out


def jendela(si, starts, td, total, mulai=0.2):
    """Rentang tampil default teks di segmen si: mulai detik setelah segmen terlihat, sampai sebelum transisi."""
    seg_end = (starts[si + 1] - td[si + 1] / 2) if si + 1 < len(starts) else total
    return starts[si] + mulai, seg_end - 0.05


def blok_plan(t, n, starts, td, total, H, plan):
    """Teks dari plan.json (format lama: gaya, segmen, y, baris)."""
    st = GAYA.get(t.get("gaya", "judul"), GAYA["judul"])
    s, e = jendela(int(t.get("segmen", 0)) % n, starts, td, total, float(t.get("mulai", 0.2)))
    if "durasi" in t:
        e = min(total, s + float(t["durasi"]))
    lines = []
    for ln in t.get("baris") or [{"isi": t["isi"]}]:
        sz = int(H * st["size"] * float(t.get("skala", 1.0)) * float(ln.get("skala", 1.0)))
        lines.append({"isi": str(ln["isi"]), "size": sz,
                      "font": ln.get("font") or t.get("font") or plan.get("font"),
                      "warna": ln.get("warna", t.get("warna", "white"))})
    gap = H * float(t.get("jarak", 0.012))
    tot = sum(ln["size"] * 1.25 for ln in lines) + gap * (len(lines) - 1)
    top = H * float(t.get("y", st["y"])) - tot / 2
    cur = top
    for ln in lines:
        hk = ln["size"] * 1.25
        ln["yc"] = cur + hk / 2
        cur += hk + gap
    return {"lines": lines, "s": s, "e": e, "top": top, "h": tot, "x": st["x"], "font_default": st["font"],
            "animasi": t.get("animasi", "fade-naik"), "latar": t.get("latar"), "bayangan": True}


def cek_pakai_ulang(segs):
    """Satu klip boleh dipakai di beberapa segmen asal momennya beda >= 1 detik dan tidak berurutan."""
    for i, a in enumerate(segs):
        for j in range(i + 1, len(segs)):
            b = segs[j]
            if a["file"] != b["file"] or a.get("redup") or b.get("redup"):
                continue
            a0, b0 = float(a.get("mulai", 0)), float(b.get("mulai", 0))
            a1, b1 = a0 + float(a["durasi"]), b0 + float(b["durasi"])
            jarak = max(b0 - a1, a0 - b1)
            if j == i + 1 and not (b.get("transisi") or {}).get("jenis", "cut") in ("hblur", "fadeblack"):
                print(f"  ! segmen {i + 1} dan {j + 1} memakai klip sama berurutan ({Path(a['file']).name})")
            elif jarak < 1.0:
                print(f"  ! segmen {i + 1} dan {j + 1} memakai momen klip yang hampir sama ({Path(a['file']).name}), jarak {jarak:.1f}s")


def jendela_logo(logo, starts, total):
    """(mulai, akhir) logo: dari segmen logo (default terakhir) sampai akhir segmen itu / akhir video."""
    n = len(starts)
    k = int(logo.get("segmen", -1)) % n
    ls = starts[k] + (0.15 if k < n - 1 else 0.3)
    le = starts[k + 1] if k < n - 1 else total - 0.05
    return ls, max(ls + 0.3, le)


def blok_overlay(teks, logo, n, starts, td, total, W, H, pembuka=0, pembuka_durasi_teks=None, pembuka_teks=None):
    """Teks dari overlay.json: posisi grid 3x3, ditumpuk bila waktu dan areanya bertabrakan.
    Logo (selalu di segmen terakhir) mendorong teks di baris yang sama."""
    lg = logo_grup(logo, W, H) if logo else None
    lk = (lg["top"], lg["bottom"]) if lg else None
    ls, le = jendela_logo(logo, starts, total) if logo else (total, total)
    gap = H * OV_JARAK
    placed, out = [], []  # placed: (baris, s, e, top, h, x0, x1)
    for t in teks:
        isi = str(t.get("isi", "")).split("\n")
        anim, f_in, keluar = "fade-naik", 0.4, "fade"
        if not "".join(isi).strip():
            continue
        kapan = t.get("kapan", "pembuka")
        if kapan == "semua":
            s, e = 0.2, total - 0.05
        else:
            if kapan == "penutup":
                si = n - 1
            elif kapan == "pembuka":
                si = max(0, min(n - 1, pembuka))  # plan.pembuka_segmen: slot judul dari pattern
            else:
                try:
                    si = max(0, int(kapan) - 1)
                except (TypeError, ValueError):
                    si = 0
                if si >= n:
                    print(f"  ! teks '{isi[0][:20]}': shot ke-{kapan} tidak ada (hanya {n} shot), dipindah ke penutup")
                    si = n - 1
            s, e = jendela(si, starts, td, total)
            # pembuka_durasi_teks (dari plan.pembuka_durasi_teks, diisi agent dari pattern.teks[0].durasi)
            # memperpanjang durasi teks pembuka agar melintasi beberapa shot awal sampai cukup waktu dibaca.
            if (kapan == "pembuka" or si == pembuka) and pembuka_durasi_teks is not None:
                e = min(total - 0.05, s + float(pembuka_durasi_teks))
            # pembuka_teks (dari pattern.teks[0]): timing hasil ukur referensi frame by frame.
            # sampai_segmen = indeks segmen terakhir yang ditutup teks; keluar "cut" = hilang tepat di cut berikutnya.
            pt = pembuka_teks or {}
            if pt and (kapan == "pembuka" or si == pembuka):
                s = starts[si] + float(pt.get("mulai", 0.2))
                if pt.get("sampai_segmen") is not None:
                    k = int(pt["sampai_segmen"]) + 1
                    e = starts[k] - 0.02 if k < n else total - 0.05  # -0.02: cegah bocor 1 frame ke shot berikutnya
                anim = pt.get("animasi", anim)
                f_in = float(pt.get("fade", f_in))
                keluar = pt.get("keluar", keluar)
        # per_baris[k] (opsional) menimpa font/ukuran utama untuk baris ke-k
        pb = t.get("per_baris") or []
        gaya = [(pb[k] if k < len(pb) and isinstance(pb[k], dict) else {}) for k in range(len(isi))]
        u_utama = t.get("ukuran", "M")
        sizes = [int(H * OV_UKURAN_TEKS.get(g.get("ukuran") or u_utama, OV_UKURAN_TEKS["M"])) for g in gaya]
        h = sum(z * 1.3 for z in sizes)
        baris, _, kolom = str(t.get("posisi", "tengah")).partition("-")
        if baris not in OV_BARIS_Y:
            baris = "tengah"
        # perkiraan rentang horizontal: teks di baris yang sama ditumpuk hanya bila saling menimpa
        lebar_baris = [ukur(x, g.get("font") or t.get("font"), z) for x, z, g in zip(isi, sizes, gaya)]
        for x, w in zip(isi, lebar_baris):
            cek_lebar(x, w, W)
        bw = max(lebar_baris)
        x0 = {"kiri": W * 0.08, "kanan": W * 0.92 - bw}.get(kolom, (W - bw) / 2)
        lain = [p for p in placed if p[0] == baris and p[1] < e and s < p[2] and p[5] < x0 + bw and x0 < p[6]]
        kena_logo = lg and lg["baris"] == baris and e > ls and s < le and lg["x0"] < x0 + bw and x0 < lg["x1"]
        if baris == "bawah":
            bottom = min([H * OV_BARIS_Y["bawah"]] + [p[3] - gap for p in lain] + ([lk[0] - gap] if kena_logo else []))
            top = bottom - h
        else:
            awal = H * OV_BARIS_Y["atas"] if baris == "atas" else (H - h) / 2
            top = max([awal] + [p[3] + p[4] + gap for p in lain] + ([lk[1] + gap] if kena_logo else []))
        placed.append((baris, s, e, top, h, x0, x0 + bw))
        warna = OV_WARNA.get(t.get("warna", "putih"), "white")
        lines, cur = [], top
        for x, z, g in zip(isi, sizes, gaya):
            lines.append({"isi": x, "size": z, "font": g.get("font") or t.get("font"), "warna": warna, "yc": cur + z * 0.65})
            cur += z * 1.3
        out.append({"lines": lines, "s": s, "e": e, "top": top, "h": h,
                    "x": {"kiri": 0.08, "kanan": "kanan"}.get(kolom, "tengah"),
                    "font_default": "Poppins-Medium.ttf", "animasi": anim, "latar": False,
                    "fade": f_in, "keluar": keluar, "bayangan": warna == "white"})
    if lg:
        out += blok_logo_teks(lg, ls, le)
    return out



BURUK = {"gelap", "kosong", "blur"}


def cek_kualitas(segs, base, cache_dir):
    """Cek tiap segmen terhadap analisis kualitas klip. Kembalikan daftar masalah + saran mulai."""
    from analyze_clip import analyze, flag_rows, ranges
    cache = {}
    masalah = []
    for i, sg in enumerate(segs):
        src = resolve(sg["file"], base)
        if not src.exists():
            continue
        key = str(src)
        if key not in cache:
            js = cache_dir / f"{src.stem}_kualitas.json"
            if js.exists() and js.stat().st_mtime >= src.stat().st_mtime:
                data = json.loads(js.read_text())
            else:
                print(f"  analisis kualitas {src.name} ...")
                rows = flag_rows(analyze(src, 10))
                data = {"sampel": rows, "rentang_bagus": ranges(rows, 1.0)}
                cache_dir.mkdir(parents=True, exist_ok=True)
                js.write_text(json.dumps(data, ensure_ascii=False))
            cache[key] = data
        data = cache[key]
        k = float(sg.get("kecepatan", 1.0))
        d = float(sg["durasi"])
        mulai = float(sg.get("mulai", 0))
        need = d * k
        buruk = [r for r in data["sampel"] if mulai <= r["t"] < mulai + need and BURUK & set(r["flag"])]
        buruk_detik = len(buruk) / 10.0
        if buruk_detik <= 0.3:
            continue
        ok = [r for r in data["rentang_bagus"] if r["durasi"] >= need + 0.5]
        saran = min(ok, key=lambda r: abs(r["mulai"] - mulai)) if ok else None
        masalah.append({"segmen": i + 1, "file": src.name, "mulai": mulai,
                        "buruk_detik": round(buruk_detik, 1),
                        "flag": sorted({x for r in buruk for x in r["flag"]}),
                        "saran": saran})
    return masalah



def cek_review(segs, abaikan):
    """Tolak render kalau klip belum dilihat lewat review_bahan.py, atau segmen di luar rentang_layak."""
    masalah = []
    for i, sg in enumerate(segs):
        src = Path(sg["file"])
        js = src.parent / "_review" / f"{src.stem}.json"
        if not js.exists():
            masalah.append(f"segmen {i}: {src.name} belum direview (jalankan review_bahan.py, lalu isi {js.name})")
            continue
        rev = json.loads(js.read_text())
        if not rev.get("sudah_dilihat"):
            masalah.append(f"segmen {i}: {src.name} sudah_dilihat belum true")
            continue
        awal, akhir = sg["mulai"], sg["mulai"] + sg["durasi"]
        ok = any(r["dari"] - 0.05 <= awal and akhir <= r["sampai"] + 0.05 for r in rev.get("rentang_layak", []))
        if not ok:
            masalah.append(f"segmen {i}: {src.name} {awal:.2f}-{akhir:.2f}s di luar rentang_layak {rev.get('rentang_layak')}")
    if masalah:
        print("PERINGATAN review:")
        for m in masalah:
            print("  - " + m)
        if not abaikan:
            progres_gagal("stabil", "Ada klip yang belum ditinjau, atau bagian yang dipakai di luar bagian yang layak.",
                          "Minta asisten meninjau klip tersebut atau memilih bagian lain.")
            sys.exit("BERHENTI: perbaiki segmen atau isi review. (--abaikan-kualitas juga melewati ini)")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plan")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--abaikan-kualitas", action="store_true",
                    help="render walau ada bagian gelap/kosong/blur (tidak disarankan)")
    a = ap.parse_args()
    need_ffmpeg()

    plan_path = Path(a.plan).expanduser().resolve()
    base = plan_path.parent
    plan = json.loads(plan_path.read_text())
    W, H = (540, 960) if a.preview else (1080, 1920)
    segs = plan["segmen"]
    if not segs:
        sys.exit("ERROR: plan tidak punya segmen")

    cek_review(segs, a.abaikan_kualitas)
    cek_pakai_ulang(segs)
    # overlay.json dari GUI menimpa seluruh teks dan logo di plan.
    ov_path = base / "overlay.json"
    ov = json.loads(ov_path.read_text()) if ov_path.exists() else None
    if ov is not None:
        print(f"Overlay: {ov_path}")
        lg = ov.get("logo")
        plan["logo"] = {"file": str(SKILL_DIR / OV_LOGO.get(lg.get("warna"), OV_LOGO["hitam"])),
                        "posisi": lg.get("posisi", "bawah"), "segmen": int(plan.get("logo_segmen", -1)),
                        "ukuran": OV_UKURAN_LOGO.get(lg.get("ukuran", "M"), 0.22),
                        "teks": lg.get("teks") or []} if lg else None
    # audio overlay menimpa plan["musik"] (narasi plan["suara"] tetap).
    ketuk = None  # (path, mulai, langkah) untuk sinkron cut
    if ov is not None:
        au = ov.get("audio")
        plan["musik"] = None
        if au and au.get("sumber") != "tanpa" and au.get("file"):
            ap_ = Path(au["file"]).expanduser()
            if not ap_.is_absolute():
                ap_ = SKILL_DIR / ap_ if (SKILL_DIR / ap_).exists() else base / ap_
            if not ap_.exists():
                print(f"  ! audio tidak ditemukan: {ap_} (dilewati)")
            else:
                mulai = float(au.get("mulai", 0) or 0)
                if a.preview or au.get("final"):
                    plan["musik"] = {"file": str(ap_), "volume": float(au.get("volume", 1.0)), "mulai": mulai}
                else:
                    print("Audio: final tanpa musik (ditambah di Instagram); ketukan tetap dipakai untuk sinkron.")
                # Audio referensi (patterns/audio/): waktu cut di pattern sudah diambil dari video
                # aslinya, jadi sudah pas dengan audio ini. Menggeser ke ketukan justru merusak.
                referensi = (SKILL_DIR / "patterns" / "audio") in ap_.resolve().parents
                # mode custom: durasi diubah agent, jadi cut perlu disinkronkan ke ketukan lagi
                if au.get("sinkron", True) and referensi and mulai == 0 and plan.get("mode") != "custom":
                    print("Sinkron ketukan dilewati: audio referensi, waktu cut sudah mengikuti video contoh.")
                elif au.get("sinkron", True):
                    ketuk = (ap_, mulai, 2 if au.get("ketukan") == "2beat" else 1)
    logo = plan.get("logo")
    if logo:
        # Pattern menulis "brand/logo.png" relatif ke folder skill, bukan ke folder plan.
        lp = resolve(logo["file"], base)
        if not lp.exists():
            lp = resolve(logo["file"], SKILL_DIR)
        if not lp.exists():
            progres_gagal("stabil", "File logo tidak ditemukan.", "Pilih logo lain di pengaturan logo, lalu coba lagi.")
            sys.exit(f"ERROR: logo tidak ditemukan: {logo['file']}. Pakai brand/logo.png atau brand/logo-putih.png.")
        logo["file"] = str(lp)
    output = resolve(plan.get("output", "hasil/reel.mp4"), base)
    if a.preview:
        output = output.with_name(output.stem + "_preview.mp4")
    # Jangan pernah menimpa hasil lama: nama yang sudah ada diberi akhiran _v2, _v3, ...
    if output.exists():
        k = 2
        while output.with_name(f"{output.stem}_v{k}.mp4").exists():
            k += 1
        output = output.with_name(f"{output.stem}_v{k}.mp4")
        print(f"File sudah ada, hasil disimpan sebagai versi baru: {output.name}")
    output.parent.mkdir(parents=True, exist_ok=True)

    # durasi di plan = durasi TERLIHAT (tengah transisi ke tengah transisi).
    # Tiap segmen dirender lebih panjang setengah transisi di kiri & kanan.
    vis = [float(sg["durasi"]) for sg in segs]
    if ketuk:
        bpm, yakin, beats = beat.ketukan(ketuk[0], ketuk[1], sum(vis) + 2)
        if yakin < beat.MIN_YAKIN:
            print(f"  ! Sinkron ketukan dilewati: ketukan kurang jelas (BPM {bpm:.0f}, yakin {yakin:.2f})")
        else:
            vis, n_geser = beat.sinkron(vis, beats, ketuk[2])
            for sg, d in zip(segs, vis):
                sg["durasi"] = d
            print(f"Sinkron ketukan: {bpm:.0f} BPM{' (per 2 ketukan)' if ketuk[2] == 2 else ''}, {n_geser} cut digeser")
    jenis, td = ["cut"], [0.0]
    for i in range(1, len(segs)):
        tr = segs[i].get("transisi") or {"jenis": "cut"}
        j = tr.get("jenis", "cut")
        if j not in TRANSISI_OK:
            print(f"  ! transisi '{j}' tidak dikenal, diganti fade")
            j = "fade"
        jenis.append(j)
        td.append(0.0 if j == "cut" else
                  min(float(tr.get("durasi", 0.4)), 0.45 * min(vis[i - 1], vis[i])))
    td.append(0.0)
    rlen = [vis[i] + td[i] / 2 + td[i + 1] / 2 for i in range(len(segs))]
    starts = [sum(vis[:i]) for i in range(len(segs))]   # awal terlihat tiap segmen
    total = sum(vis)

    masalah = cek_kualitas(segs, base, base / "_kualitas")
    if masalah:
        print("\nCEK KUALITAS: ada segmen memuat bagian gelap, kosong, atau blur:")
        for m in masalah:
            print(f"  ! segmen {m['segmen']} ({m['file']}) mulai {m['mulai']}s: "
                  f"{m['buruk_detik']}s buruk ({', '.join(m['flag'])})")
            if m["saran"]:
                print(f"    saran: mulai {m['saran']['mulai']}s (rentang bagus {m['saran']['durasi']}s)")
            else:
                print("    saran: tidak ada rentang bagus cukup panjang, ganti klip atau kurangi durasi")
        if not a.abaikan_kualitas:
            progres_gagal("stabil", "Ada klip yang memuat bagian gelap, kosong, atau buram.",
                          "Minta asisten menggeser bagian klip yang dipakai, atau mengganti klipnya.")
            sys.exit("\nBERHENTI: perbaiki mulai segmen (lihat saran) atau pakai --abaikan-kualitas.")

    # --- stabil otomatis (lihat stabil.py) ---
    if not stabil.punya_vidstab():
        sys.exit("ERROR: ffmpeg tanpa vidstab. Pasang: brew install ffmpeg-full")
    fw, fh = ukuran_gambar(W, H, plan.get("bingkai"))
    ah = int(stabil.AW * fh / fw) // 2 * 2

    def ah_fn(sg):
        src = resolve(sg["file"], base)
        blur = sg.get("isi", "crop") == "blur" and probe(src)["orientasi"] != "portrait"
        return ah, "decrease" if blur else "increase"

    for i, sg in enumerate(segs):
        sg["file"] = str(resolve(sg["file"], base))
        if not Path(sg["file"]).exists():
            progres_gagal("stabil", f"File video untuk klip {i + 1} tidak ditemukan.",
                          "Pastikan videonya masih ada di folder bahan, atau minta asisten mengganti klipnya.")
            sys.exit(f"ERROR: segmen {i + 1}: file tidak ada: {sg['file']}")
    stab = stabil.putuskan_semua(segs, rlen, ah_fn, base)
    gagal = [i + 1 for i, r in enumerate(stab) if r["status"] == "gagal"]
    for sg, r in zip(segs, stab):
        sg["mulai"] = r["mulai"]  # hanya di memori, plan.json tidak berubah
    if gagal:
        print(f"\nSTABIL GAGAL di segmen {gagal}: terlalu goyang/blur, dan rentang +-{max(stabil.GESER)}s "
              "di sekitarnya juga gagal (atau di luar rentang_layak). Pilih rentang lain atau klip lain.")
        if not a.abaikan_kualitas:
            progres_gagal("stabil", f"Klip {', '.join(map(str, gagal))} terlalu goyang dan tidak bisa distabilkan.",
                          "Minta asisten memilih bagian lain dari klip itu, atau mengganti klipnya.")
            sys.exit("BERHENTI: ganti mulai/klip segmen di atas, atau pakai --abaikan-kualitas "
                     "(segmen gagal tetap distabilkan sebisanya).")

    tahap = "preview" if a.preview else "final"
    n = len(segs)
    tmp = Path(tempfile.mkdtemp(prefix="reel_"))
    try:
        files = []
        for i, sg in enumerate(segs):
            # proses segmen = 0-60% tahap ini
            pesan = f"Memproses klip {i + 1} dari {n}"
            progres(tahap, 60 * i / n, pesan)
            f = render_segment(i, sg, rlen[i], W, H, plan.get("grade"), tmp, base, a.preview,
                               plan.get("bingkai"), td[i] / 2, stab[i]["smoothing"],
                               cb=lambda x, i=i, pesan=pesan: progres(tahap, 60 * (i + x) / n, pesan))
            files.append(f)
            print(f"  segmen {i + 1}/{len(segs)} siap ({vis[i]:.1f}s)")

        parts = [f"[{i}:v]setpts=PTS-STARTPTS,fps={FPS},settb=AVTB[s{i}]" for i in range(len(files))]
        cur, L = "[s0]", rlen[0]
        for i in range(1, len(segs)):
            nxt = f"[s{i}]"
            if jenis[i] == "cut":
                parts.append(f"{cur}{nxt}concat=n=2:v=1:a=0,settb=AVTB[x{i}]")
                L += rlen[i]
            else:
                off = L - td[i]
                parts.append(f"{cur}{nxt}xfade=transition={jenis[i]}:duration={td[i]:.3f}"
                             f":offset={off:.3f}[x{i}]")
                L = off + rlen[i]
            cur = f"[x{i}]"

        # --- teks ---
        n_in = len(files)
        vchain = cur
        fonts_used = set()
        teks_info = []  # (waktu tengah, blok) untuk kotak cek posisi
        if ov is not None:
            bloks = blok_overlay(ov.get("teks") or [], plan.get("logo"), len(segs), starts, td, total, W, H,
                                 int(plan.get("pembuka_segmen", 0)),
                                 plan.get("pembuka_durasi_teks"), plan.get("pembuka_teks"))
        else:
            bloks = [blok_plan(t, len(segs), starts, td, total, H, plan) for t in plan.get("teks", [])]
        for j, b in enumerate(bloks):
            s, e = b["s"], b["e"]
            fade = float(b.get("fade", 0.4))
            f_out = 0 if b.get("keluar") == "cut" else fade
            if e - s < 0.6:
                print(f"  ! teks '{b['lines'][0]['isi'][:20]}' tampil < 0.6s, terlalu cepat dibaca")
            for k, ln in enumerate(b["lines"]):
                if not ln["isi"].strip():
                    continue  # baris kosong hanya memberi jarak
                size, yc = ln["size"], ln["yc"]
                txt = tmp / f"teks_{j}_{k}.txt"
                txt.write_text(ln["isi"])
                if b["animasi"] == "fade-naik":
                    y = f"{yc:.0f}-text_h/2+{H * 0.02:.0f}*pow(1-min(1,max(0,(t-{s:.3f})/{fade * 1.5})),2)"
                else:
                    y = f"{yc:.0f}-text_h/2"
                if b["x"] == "tengah":
                    x, align = "(w-text_w)/2", ":text_align=C"
                elif b["x"] == "kanan":
                    x, align = f"{W * 0.92:.0f}-text_w", ":text_align=R"
                else:
                    x, align = f"{W * b['x']:.0f}", ""
                fopt, fname = font_opt(ln["font"], b["font_default"], base)
                fonts_used.add(fname)
                dt = (f"drawtext={fopt}:textfile={q(txt)}:expansion=none"
                      f":fontsize={size}:fontcolor={ln['warna']}"
                      f":line_spacing={int(size * 0.02)}{align}"
                      + (f":shadowcolor=black@0.6:shadowx=0:shadowy={max(1, H // 480)}" if b["bayangan"] else "")
                      + (f":box=1:boxcolor=black@0.35:boxborderw={int(size * 0.45)}" if b["latar"] else "")
                      + f":x={x}:y='{y}':alpha='{alpha_expr(round(s, 3), round(e, 3), fade, b['animasi'], f_out)}'"
                      f":enable='between(t,{s:.3f},{e:.3f})'")
                parts.append(f"{vchain}{dt}[t{j}_{k}]")
                vchain = f"[t{j}_{k}]"
            teks_info.append(((s + e) / 2, b))

        # --- logo ---
        extra_in = []
        logo = plan.get("logo")
        if logo:
            lp = resolve(logo["file"], base)
            if lp.exists():
                extra_in += ["-loop", "1", "-i", str(lp)]
                li = n_in
                n_in += 1
                ls, le = jendela_logo(logo, starts, total)
                lw = int(W * float(logo.get("ukuran", 0.22)))
                if ov is not None:
                    g = logo_grup(logo, W, H)
                    lx, ly = f"{g['lx']:.0f}", f"{g['ly']:.0f}"
                else:
                    posisi = logo.get("posisi", "bawah")
                    lx = "(W-w)/2"
                    ly = {"atas": f"{H * 0.13:.0f}", "tengah": "(H-h)/2"}.get(posisi, f"{H * 0.80:.0f}-h")
                parts.append(f"[{li}:v]scale={lw}:-1,format=rgba,"
                             f"fade=in:st={ls:.2f}:d=0.4:alpha=1[lg]")
                parts.append(f"{vchain}[lg]overlay={lx}:{ly}:shortest=1"
                             f":enable='between(t,{ls:.2f},{le:.2f})'[lo]")
                vchain = "[lo]"
            else:
                print(f"  ! logo tidak ditemukan: {lp} (dilewati)")

        fa = float((plan.get("akhir") or {}).get("fade", 0) or 0)
        akhir = f",fade=out:st={max(0, total - fa):.3f}:d={fa:.3f}" if fa > 0 else ""
        parts.append(f"{vchain}trim=duration={total:.3f}{akhir},setsar=1,format=yuv420p[vout]")

        # --- audio ---
        # suara (narasi/voice over) + musik. Musik otomatis mengecil saat ada suara (sidechain).
        musik = plan.get("musik")
        suara = plan.get("suara")
        m_path = resolve(musik["file"], base) if musik else None
        s_path = resolve(suara["file"], base) if suara else None
        if m_path and not m_path.exists():
            m_path = None
        if s_path and not s_path.exists():
            print(f"  ! suara tidak ditemukan: {s_path} (dilewati)")
            s_path = None
        a_chain = []
        if m_path:
            extra_in += ["-ss", f"{float(musik.get('mulai', 0) or 0):.3f}", "-i", str(m_path)]
            vol = float(musik.get("volume", 1.0))
            a_chain.append(f"[{n_in}:a]atrim=duration={total:.3f},volume={vol},"
                           f"afade=t=out:st={max(0, total - 1.5):.3f}:d=1.5[mus]")
            n_in += 1
        if s_path:
            extra_in += ["-i", str(s_path)]
            sm = float(suara.get("mulai", 0))
            sv = float(suara.get("volume", 1.0))
            a_chain.append(f"[{n_in}:a]adelay={int(sm * 1000)}:all=1,apad,"
                           f"atrim=duration={total:.3f},volume={sv}[sua]")
            n_in += 1
        if m_path and s_path:
            a_chain += ["[sua]asplit=2[sua1][sua2]",
                        "[mus][sua1]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=400[musd]",
                        "[musd][sua2]amix=inputs=2:duration=first:normalize=0[aout]"]
        elif m_path:
            a_chain.append("[mus]anull[aout]")
        elif s_path:
            a_chain.append("[sua]anull[aout]")
        else:
            extra_in += ["-f", "lavfi", "-t", f"{total:.3f}", "-i",
                         "anullsrc=channel_layout=stereo:sample_rate=48000"]
            a_chain.append(f"[{n_in}:a]anull[aout]")
        parts += a_chain

        cmd = ["ffmpeg", "-v", "error", "-y"]
        for f in files:
            cmd += ["-i", str(f)]
        cmd += extra_in + [
            "-filter_complex", ";".join(parts), "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "ultrafast" if a.preview else "medium",
            "-crf", "20" if a.preview else "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
            "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}",
            "-movflags", "+faststart", str(output)]
        # penggabungan akhir = 60-98%, gambar cek = 2% terakhir
        pesan = "Menggabungkan semua klip dan teks"
        progres(tahap, 60, pesan)
        run_progres(cmd, total, lambda x: progres(tahap, 60 + 38 * x, pesan))
        progres(tahap, 98, "Membuat gambar cek")

        cek = output.with_name(output.stem + "_cek.jpg")
        run(["ffmpeg", "-v", "error", "-y", "-i", str(output), "-vf",
             f"fps=12/{total:.3f},scale=240:-2,tile=6x2:padding=4:color=white",
             "-frames:v", "1", "-q:v", "4", str(cek)])
        print(f"\nSELESAI: {output}  ({total:.1f}s, {W}x{H})")
        for k, (tm, b) in enumerate(teks_info):
            # perkiraan lebar teks (px) dari baris terpanjang
            bw = max(ukur(x, ln["font"] or b.get("font_default"), ln["size"]) for ln in b["lines"] for x in ln["isi"].split("\n"))
            bh = b["h"]
            bx = {"tengah": (W - bw) / 2, "kanan": W * 0.92 - bw}.get(b["x"]) if isinstance(b["x"], str) else W * b["x"]
            by = b["top"]
            tc = output.with_name(f"{output.stem}_teks{k + 1}_cek.jpg")
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{tm:.3f}", "-i", str(output), "-vf",
                 f"drawbox=x={bx:.0f}:y={by:.0f}:w={bw:.0f}:h={bh:.0f}:color=red@0.9:t=3,scale=540:-2",
                 "-frames:v", "1", "-q:v", "3", str(tc)])
            print(f"Cek posisi teks: {tc}  (kotak merah = perkiraan area teks)")
        print(f"Grid cek: {cek}")
        print(f"Font: {', '.join(sorted(fonts_used)) or '-'}")
        progres(tahap, 100, "Selesai")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()

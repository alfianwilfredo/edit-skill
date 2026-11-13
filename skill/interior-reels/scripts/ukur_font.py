"""Ukur lebar teks dari file TTF/OTF tanpa dependensi (baca tabel cmap, hmtx, hhea, head).

Kerning diabaikan, jadi hasilnya perkiraan dekat (biasanya meleset < 3%).
Dipakai render.py untuk menumpuk teks, meratakan grup logo, dan memperingatkan teks yang keluar layar.
"""
import struct
from functools import lru_cache
from pathlib import Path


def _tabel(data):
    n = struct.unpack(">H", data[4:6])[0]
    out = {}
    for k in range(n):
        tag, _, off, ln = struct.unpack(">4sIII", data[12 + 16 * k: 28 + 16 * k])
        out[tag.decode("latin-1")] = (off, ln)
    return out


def _cmap(data, off):
    """Peta kode karakter -> glyph id. Mendukung subtable format 4 dan 12 (Unicode)."""
    n = struct.unpack(">H", data[off + 2: off + 4])[0]
    subs = []
    for k in range(n):
        pid, eid, so = struct.unpack(">HHI", data[off + 4 + 8 * k: off + 12 + 8 * k])
        fmt = struct.unpack(">H", data[off + so: off + so + 2])[0]
        if (pid, eid) in {(3, 10), (0, 4), (0, 6)} and fmt == 12:
            subs.insert(0, (fmt, off + so))
        elif (pid, eid) in {(3, 1), (0, 3), (0, 1), (0, 2)} and fmt == 4:
            subs.append((fmt, off + so))
    if not subs:
        return {}
    fmt, s = subs[0]
    m = {}
    if fmt == 12:
        ng = struct.unpack(">I", data[s + 12: s + 16])[0]
        for k in range(ng):
            a, b, g = struct.unpack(">III", data[s + 16 + 12 * k: s + 28 + 12 * k])
            if a <= 0x2FFFF:
                for c in range(a, min(b, 0x2FFFF) + 1):
                    m[c] = g + c - a
        return m
    seg = struct.unpack(">H", data[s + 6: s + 8])[0] // 2
    ends = struct.unpack(f">{seg}H", data[s + 14: s + 14 + 2 * seg])
    p = s + 16 + 2 * seg
    starts = struct.unpack(f">{seg}H", data[p: p + 2 * seg])
    deltas = struct.unpack(f">{seg}h", data[p + 2 * seg: p + 4 * seg])
    ro_off = p + 4 * seg
    ros = struct.unpack(f">{seg}H", data[ro_off: ro_off + 2 * seg])
    for k in range(seg):
        for c in range(starts[k], ends[k] + 1):
            if c == 0xFFFF:
                continue
            if ros[k] == 0:
                g = (c + deltas[k]) & 0xFFFF
            else:
                gp = ro_off + 2 * k + ros[k] + 2 * (c - starts[k])
                g = struct.unpack(">H", data[gp: gp + 2])[0]
                if g:
                    g = (g + deltas[k]) & 0xFFFF
            if g:
                m[c] = g
    return m


@lru_cache(maxsize=64)
def _metrik(path):
    data = Path(path).read_bytes()
    if data[:4] == b"ttcf":  # koleksi font (.ttc) tidak didukung
        return None
    t = _tabel(data)
    upem = struct.unpack(">H", data[t["head"][0] + 18: t["head"][0] + 20])[0]
    nh = struct.unpack(">H", data[t["hhea"][0] + 34: t["hhea"][0] + 36])[0]
    ho = t["hmtx"][0]
    adv = [struct.unpack(">H", data[ho + 4 * k: ho + 4 * k + 2])[0] for k in range(nh)]
    return upem, adv, _cmap(data, t["cmap"][0])


def lebar(teks, path, size):
    """Lebar teks (px) untuk font di path dengan tinggi huruf size px. None bila font tidak terbaca."""
    try:
        m = _metrik(str(path))
    except Exception:
        return None
    if not m:
        return None
    upem, adv, cmap = m
    tot = 0
    for ch in teks:
        g = cmap.get(ord(ch), 0)
        tot += adv[min(g, len(adv) - 1)]
    return tot * size / upem


if __name__ == "__main__":
    import sys
    print(lebar(sys.argv[2], sys.argv[1], float(sys.argv[3]) if len(sys.argv) > 3 else 100))

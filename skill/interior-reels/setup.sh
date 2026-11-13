#!/bin/bash
# Cek kesiapan skill interior-reels dan unduh font (lisensi OFL, bebas dipakai komersial).
# Aman dijalankan berulang kali.
cd "$(dirname "$0")" || exit 1
# ffmpeg-full (Homebrew) punya drawtext dan vidstab. Pakai bila terpasang.
[ -d /opt/homebrew/opt/ffmpeg-full/bin ] && export PATH="/opt/homebrew/opt/ffmpeg-full/bin:$PATH"
ok=1

check() { if command -v "$1" >/dev/null 2>&1; then echo "OK   $1"; else echo "GAGAL $1 belum terpasang -> $2"; ok=0; fi; }
check python3 "brew install python"
check ffmpeg  "brew install ffmpeg"
check ffprobe "brew install ffmpeg"

if command -v ffmpeg >/dev/null 2>&1; then
  for f in drawtext xfade zoompan vidstabdetect vidstabtransform; do
    if ffmpeg -hide_banner -filters 2>/dev/null | grep -q " $f "; then echo "OK   filter $f"
    else echo "GAGAL ffmpeg tanpa filter $f -> brew install ffmpeg-full"; ok=0; fi
  done
fi

mkdir -p fonts
# Daftar font + keterangan ada di fonts/fonts.json (dipakai juga oleh GUI). Semua lisensi OFL.
python3 - <<'PY'
import json, subprocess
from pathlib import Path
d = Path("fonts")
for f in json.loads((d / "fonts.json").read_text()):
    out = d / f["file"]
    if out.exists() and out.stat().st_size > 0:
        print(f"OK   font {f['file']}"); continue
    if subprocess.run(["curl", "-fsSL", "-o", str(out), f["url"]]).returncode == 0:
        print(f"OK   font {f['file']} (diunduh)")
    else:
        out.unlink(missing_ok=True)
        print(f"GAGAL unduh font {f['file']} (cek internet). Render tetap jalan dengan font lain.")
    lic = d / f["lisensi"]
    fam = f["lisensi"][4:-4]
    if not lic.exists():
        subprocess.run(["curl", "-fsSL", "-o", str(lic), f"https://raw.githubusercontent.com/google/fonts/main/ofl/{fam}/OFL.txt"])
PY

if [ $ok = 1 ]; then echo; echo "SIAP. Skill interior-reels bisa dipakai."; else echo; echo "Ada yang perlu dipasang (lihat GAGAL di atas)."; exit 1; fi

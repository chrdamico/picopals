import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "public/js/levels-data.js").read_text()
worlds = json.loads(src[src.index("["): src.rindex("]") + 1])
want = sys.argv[2:] or [w["id"] for w in worlds]
out = sys.argv[1]
T, COLS = 96, 8
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)


def rgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


rows = []
for w in worlds:
    if w["id"] not in want:
        continue
    rows.append(("title", w["name"]))
    lv = w["levels"]
    for i in range(0, len(lv), COLS):
        rows.append(("figs", lv[i : i + COLS]))
H = sum(24 if r[0] == "title" else T + 16 for r in rows)
sheet = Image.new("RGB", (COLS * T, H), (252, 248, 242))
d = ImageDraw.Draw(sheet)
y = 0
for kind, data in rows:
    if kind == "title":
        d.text((6, y + 4), data, fill=(20, 20, 30), font=bold)
        y += 24
        continue
    for k, f in enumerate(data):
        w_, h_ = f["w"], f["h"]
        ps = max(1, min((T - 8) // w_, (T - 8) // h_))
        ox = k * T + (T - w_ * ps) // 2
        oy = y + (T - h_ * ps) // 2
        for yy in range(h_):
            for xx in range(w_):
                ch = f["art"][yy * w_ + xx]
                if ch != ".":
                    d.rectangle([ox + xx * ps, oy + yy * ps, ox + xx * ps + ps - 1, oy + yy * ps + ps - 1], fill=rgb(f["pal"][ch]))
        d.text((k * T + 3, y + T), f["name"][:16], fill=(60, 60, 70), font=font)
    y += T + 16
sheet.save(out)

import json
import sys

from PIL import Image, ImageDraw, ImageFont


def font(px):
    for f in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(f, px)
        except Exception:
            pass
    return ImageFont.load_default()


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


TILE_W = 420
ART = 200
MASK = 160


def draw_fig(fig):
    w, h = fig["w"], fig["h"]
    tile = Image.new("RGB", (TILE_W, ART + 56), (250, 247, 240))
    d = ImageDraw.Draw(tile)
    ps = max(1, min(ART // w, ART // h))
    ox, oy = 10, 36
    d.rectangle([ox - 1, oy - 1, ox + w * ps, oy + h * ps], fill=(222, 232, 244))
    for y in range(h):
        for x in range(w):
            ch = fig["art"][y][x]
            if ch == ".":
                if (x + y) % 2 == 0:
                    d.rectangle([ox + x * ps, oy + y * ps, ox + x * ps + ps - 1, oy + y * ps + ps - 1], fill=(210, 222, 238))
                continue
            d.rectangle([ox + x * ps, oy + y * ps, ox + x * ps + ps - 1, oy + y * ps + ps - 1], fill=hexrgb(fig["pal"][ch]))
    ms = max(2, min(MASK // w, MASK // h))
    mx, my = ox + ART + 20, oy
    givens = set(fig["givens"])
    for y in range(h):
        for x in range(w):
            i = y * w + x
            v = fig["sol"][i]
            if v == 0:
                col = (255, 255, 255)
            elif fig["mode"] == "color":
                col = hexrgb(fig["pal"][fig["chars"][v - 1]])
            else:
                col = (40, 36, 52)
            d.rectangle([mx + x * ms, my + y * ms, mx + x * ms + ms - 1, my + y * ms + ms - 1], fill=col, outline=(200, 200, 200))
            if i in givens:
                r = max(2, ms // 3)
                cx, cy = mx + x * ms + ms // 2, my + y * ms + ms // 2
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(230, 40, 60))
    t = fig.get("tile")
    if t:
        for k in range(t, w, t):
            d.line([ox + k * ps - 1, oy, ox + k * ps - 1, oy + h * ps], fill=(255, 60, 120), width=2)
            d.line([mx + k * ms, my, mx + k * ms, my + h * ms], fill=(255, 60, 120), width=2)
        for k in range(t, h, t):
            d.line([ox, oy + k * ps - 1, ox + w * ps, oy + k * ps - 1], fill=(255, 60, 120), width=2)
            d.line([mx, my + k * ms, mx + w * ms, my + k * ms], fill=(255, 60, 120), width=2)
    label = f"#{fig['i']} {fig['name']}  {w}x{h}  givens {len(givens)}"
    d.text((10, 8), label, fill=(30, 30, 40), font=font(17))
    return tile


def main():
    global TILE_W, ART, MASK
    rep = json.load(open(sys.argv[1]))
    figs = rep["figures"]
    if any(f.get("tile") for f in figs):
        TILE_W, ART, MASK = 620, 300, 270
    tiles = [draw_fig(f) for f in figs]
    cols = 2 if TILE_W > 500 else 3
    rows = (len(tiles) + cols - 1) // cols
    th = max(t.height for t in tiles) if tiles else 10
    sheet = Image.new("RGB", (cols * TILE_W, rows * th + 40), (255, 255, 255))
    ImageDraw.Draw(sheet).text((10, 8), rep["name"], fill=(0, 0, 0), font=font(22))
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % cols) * TILE_W, 40 + (k // cols) * th))
    sheet.save(sys.argv[2])


if __name__ == "__main__":
    main()

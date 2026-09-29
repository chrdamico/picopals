from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "public"
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

BG_TOP = (255, 214, 226)
BG_BOT = (255, 170, 190)
PAL = {
    "g": "#5BC06C", "s": "#3F9A50", "o": "#D9577E", "b": "#FFB3C7", "e": "#2B2233",
    "h": "#FFFFFF", "p": "#FF7FA0", "k": "#2B2233",
}
ART = [
    "...gg..gg...",
    "....gggg....",
    ".....ss.....",
    "...oooooo...",
    "..obbbbbbo..",
    ".obbbbbbbbo.",
    "obbhebbhebbo",
    "obbeebbeebbo",
    "obppbkkbppbo",
    "obbbbbbbbbbo",
    ".obbbbbbbbo.",
    "..oooooooo..",
]


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def sprite(px):
    w, h = len(ART[0]), len(ART)
    o = max(1, round(px * 0.35))
    img = Image.new("RGBA", (w * px + 2 * o, h * px + 2 * o + o), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(h):
        for x in range(w):
            if ART[y][x] == ".":
                continue
            X, Y = x * px + o, y * px + o
            d.rounded_rectangle([X - o, Y - o + o, X + px + o - 1, Y + px + o - 1 + o], radius=o, fill=(150, 40, 80, 60))
    for y in range(h):
        for x in range(w):
            if ART[y][x] == ".":
                continue
            X, Y = x * px + o, y * px + o
            d.rounded_rectangle([X - o, Y - o, X + px + o - 1, Y + px + o - 1], radius=o, fill=(255, 255, 255, 255))
    for y in range(h):
        for x in range(w):
            ch = ART[y][x]
            if ch == ".":
                continue
            X, Y = x * px + o, y * px + o
            d.rectangle([X, Y, X + px - 1, Y + px - 1], fill=rgb(PAL[ch]))
    return img


def bg(size, rounded, transparent):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    grad = Image.new("RGBA", (size, size))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / max(1, size - 1)
        c = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3))
        gd.line([(0, y), (size, y)], fill=c + (255,))
    if transparent:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * rounded), fill=255)
        img.paste(grad, (0, 0), mask)
    else:
        img = grad
    return img


def render(size, frac, rounded=0.22, transparent=True):
    img = bg(size, rounded, transparent)
    px = max(1, int(size * frac / 12))
    sp = sprite(px)
    img.alpha_composite(sp, ((size - sp.width) // 2, (size - sp.height) // 2 + px // 3))
    return img


def main():
    render(512, 0.66).save(OUT / "icon-512.png")
    render(192, 0.66).save(OUT / "icon-192.png")
    render(512, 0.5, transparent=False).save(OUT / "maskable-512.png")
    render(180, 0.62, transparent=False).convert("RGB").save(OUT / "apple-touch-icon.png")
    render(32, 0.8, 0.2).save(OUT / "favicon-32.png")
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">']
    for y, row in enumerate(ART):
        for x, ch in enumerate(row):
            if ch != ".":
                svg.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{PAL[ch]}"/>')
    svg.append("</svg>")
    (OUT / "favicon.svg").write_text("".join(svg))
    print("icons written to", OUT)


if __name__ == "__main__":
    main()

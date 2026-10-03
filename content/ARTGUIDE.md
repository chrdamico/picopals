# Picopals art guide

Picopals is a nonogram (picross) phone game. Every puzzle is a cute pixel-art figure. When the
player solves the grid, the picture flips into full colour, comes alive with an animation, and a
card announces "It's a ___!" with a short blurb. The art is the whole game, so it must be
**adorable, readable, and a good puzzle**.

## File format

One JSON file per world in `content/packs/NN-id.json`:

```json
{
  "id": "pets",
  "name": "Pet Shop",
  "tagline": "Furry friends looking for a home",
  "mode": "mono",
  "color": "#FF9F43",
  "figures": [
    {
      "id": "kitten",
      "name": "Kitten",
      "blurb": "Sits in any box. Especially yours.",
      "motion": "hop",
      "fx": "hearts",
      "pal": { "k": "#7A4A2A", "o": "#FFB25B", "e": "#2B2233", "h": "#FFFFFF", "p": "#FF8FB1" },
      "holes": "",
      "art": ["....", "...."]
    }
  ]
}
```

- `mode`: `"mono"` = classic black-and-white nonogram. `"color"` = coloured clues; the player
  paints with each colour.
- `color`: the world's accent colour for the UI (hex).
- `art`: rows of equal length. `.` = background (transparent, empty in the puzzle). Every other
  character is a palette key. Width and height 5..20 (height may go to 25). Width ≤ 20 always
  (phone screens).
- `pal`: one character → `#RRGGBB`. Any letters you like, but these are special:
  - `e` = **eye**. Eye pixels blink during the alive animation. Use `e` for pupils.
  - `h` = **eye highlight** (the tiny white shine in an eye). Blinks together with `e`.
    One `h` pixel at the top-left of each eye makes figures dramatically cuter at 12×12 and up.
- `holes`: characters that are coloured in the final picture but are **empty in the puzzle**.
  - Mono mode default: every non-`.` pixel is a filled cell (a silhouette puzzle).
  - Put fill colours in `holes` to turn the puzzle into line art (outline + details filled,
    body interior empty). Put eyes/highlights in `holes` to punch them out of a silhouette.
  - Colour mode: every non-hole, non-`.` character is one puzzle colour. 2..6 colours. The
    colours must be easy to tell apart on a phone (no two similar shades). Use `holes` to drop
    minor colours (e.g. a white highlight) from the puzzle.
- `name`: what the figure *is*, as a noun that reads well in "It's a ___!" — `Kitten`,
  `Baby Dragon`, `Hot Air Balloon`. Title Case, ≤ 18 characters.
- `article` (optional): only when "a"/"an" chosen by first letter is wrong, e.g. `"a"` for
  `Unicorn` or `UFO`, `"some"` for plurals like `Cherries`.
- `blurb`: one witty, warm line of personality, ≤ 90 characters, like a collectible card.
  "Naps 16 hours a day. Busy the other 8." No emoji.
- `motion` (the idle loop after the reveal), one of:
  `hop` (jumps with squash — bunnies, frogs, chicks, cats), `bounce` (gentle bounce — objects,
  food), `wiggle` (happy side-to-side rock), `float` (slow drift — ghosts, balloons, clouds,
  jellyfish), `swim` (body waves — fish, whales), `sway` (bends from the base — plants, trees,
  candles), `spin` (turns around — stars, coins, gems), `pulse` (heartbeat — hearts, lamps),
  `jelly` (squishy — slimes, puddings, mushrooms), `flap` (wing flap — birds, bats, butterflies),
  `buzz` (fast jitter — bees, robots), `roll` (rolls — balls, wheels), `glow` (shines — sun,
  crystals, fireflies), `march` (waddle — penguins, ducks, crabs, robots).
- `fx` (particles around it), one of: `hearts`, `sparkles`, `stars`, `notes`, `bubbles`, `zzz`,
  `petals`, `snow`, `leaves`, `confetti`, `steam`, `embers`.

## What makes it cute

- Chibi proportions: big head, small body, stubby limbs. Faces are the focus.
- Eyes: dark `e` pupils, set low and wide on the face, with an `h` shine pixel from 10×10 up.
  Add pink blush cheeks under/beside the eyes. Tiny mouths (1–3 pixels) or none.
- Outlines: a darker shade of the body colour (e.g. body `#FFB25B`, outline `#B8642B`), not
  pure black. Outline most figures from 10×10 up.
- Palette: soft, saturated, warm. Pastels for bodies, one or two strong accents. 3–7 colours
  per figure in mono packs.
- Silhouette first: the figure must be recognisable as its black-and-white puzzle mask too, and
  must read at a glance in colour. Recognisable beats detailed.
- Use the whole canvas: the figure touches or nearly touches most edges; no big empty margins.

## Colour packs: no white paint

Empty cells in the game are drawn white (#FFFFFF, dark grey in dark mode). A white or near-white
puzzle colour looks like an empty cell. Make white and very pale parts `holes` (they still show
in the reveal), or use a clearly tinted cream/pastel instead.

## Do not repeat figures

`content/NAMES.md` lists every figure already in the game. Do not draw any of them again, not
even under another name.

## What makes a good puzzle

Check every pack with the tool (from the repo root):

```bash
node tools/check-pack.mjs content/packs/NN-id.json
```

It prints one line per figure and writes a preview sheet to `.preview/NN-id.png`. Look at the
image (open it with your Read tool). Each tile shows the colour art (left) and the puzzle mask
(right). Red dots on the mask are **givens**: cells the game must pre-reveal because the clues
alone do not pin the picture down with line-by-line logic.

Targets:
- `givens`: 0 is ideal. ≤ 2% of cells is acceptable. `MANY-GIVENS` (> 4%) must be fixed.
  Ambiguity comes from checkerboard-like pixel pairs, isolated single pixels, and symmetric
  wiggles. Merging stray pixels, thickening a line, or adding/removing one pixel usually fixes
  it. Re-run the check after every edit.
- `fill` (filled share of the mask): 0.30..0.70 is the sweet spot. `SPARSE`/`DENSE` flags mean
  the puzzle is boring (almost empty or an almost solid blob). A big solid silhouette is dull;
  use `holes` to open the body (line-art style) or punch out eyes, belly, patterns.
- Mix styles within a pack: some silhouettes with punched details, some line-art, some mixed.
- The tool sorts nothing; order figures from easiest to hardest within the pack (roughly by size
  and `rounds`).

## Process

1. Draft all figures, run the check, look at the preview image.
2. Fix art that is not instantly recognisable or not cute enough, and fix every
   `MANY-GIVENS`, `SPARSE`, `DENSE`, error and warning.
3. Repeat until the pack is clean. Two to four review rounds is normal.
4. Only edit your own pack files. Do not touch anything else in the repo.

## Mosaic packs

A mosaic pack has `"mosaic": true` and `"tile": 10` at pack level. Each figure is one BIG
picture (30×30, or 30×20 / 20×30, or 40×30 at most; every side a multiple of the tile size). The game cuts it into
10×10 tiles; each tile is its own small puzzle. When the player solves all tiles, the whole
picture comes alive with the reveal animation.

- Every tile must be a decent puzzle on its own: no empty tiles, tile fill 0.25–0.75. Design
  the picture to fill the whole canvas: a big character plus a ground band, a frame, a
  background pattern, clouds, grass, bubbles… Corners are the usual problem.
- `name`, `blurb`, `motion`, `fx`, `pal`, `holes` work as for normal figures (one set for the
  whole picture).
- The checker prints one line per mosaic with the tile fill range, total givens and rounds,
  and flags the tile ids that are SPARSE / DENSE / MANY-GIVENS. Tile ids are `figure-RC`
  (row, column).

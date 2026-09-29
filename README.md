# Picopals

A nonogram (picross) game for the phone. Every solved grid flips into colour, the pixel pal comes alive, and a card tells you what you found: "It's a Kitten!". Installable as a PWA, works offline, no build step.

## Content

- **Journey:** 15 themed worlds, 228 hand-drawn pals, from 5×5 tutorials to 20×20 showpieces. Two worlds are colour nonograms. Solve half of a world to open the next.
- **Hatchery:** endless generated puzzles. Each one hatches a unique critter with a name, a blurb and a rarity (common to legendary).
- **Daily:** one generated pal per day, the same for everyone, with a theme per weekday and a streak.
- **Album:** every pal you met, animated again on tap.
- **Play aids:** mistake checking (can be turned off), auto-cross for finished lines, hints that name a solvable line, undo/redo, drag lock to a row or column, pinch zoom with sticky clues, a live preview, light/dark theme, sound and haptics.

Every puzzle is solvable by line logic alone. When the clues of a picture do not pin it down, the build pre-reveals a few "given" cells (shown with a gold corner).

## Develop

```bash
npm run serve                      # http://localhost:8080
npm test                           # line solver vs brute force, all levels, critters, dailies
npm run levels                     # rebuild public/js/levels-data.js from content/packs/*.json
node tools/check-pack.mjs content/packs/04-garden.json   # stats + preview PNG in .preview/
npm run icons                      # regenerate icons (Python + Pillow)
```

- `content/packs/NN-id.json` — one world per file; format and art rules in `content/ARTGUIDE.md`.
- `public/js/nonogram.js` — exact line solver (multi-colour DP), propagation, givens search.
- `public/js/game.js` — the board. `figure.js` — sprite rendering, idle motions and particles. `reveal.js` — the win animation. `critters.js` — the procedural pal generator.

## Deploy

Static hosting of `public/`. Both pipelines run the tests, stamp the service worker with the commit SHA (so installed apps update), and publish:

- **GitHub Pages:** `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions).
- **GitLab Pages:** `.gitlab-ci.yml`.

## Install on a phone

Open the site. Android/Chrome: **Install app** on the home screen (or browser menu → Install app). iPhone/Safari: Share → Add to Home Screen.

Nunito font: SIL Open Font License.

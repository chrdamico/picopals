import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, checkPack, analyzeFigure, tilesOf } from './packlib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'content', 'packs');
const lenient = process.argv.includes('--lenient');
const files = readdirSync(dir).filter((f) => /^\d+-.*\.json$/.test(f)).sort().map((f) => join(dir, f));
if (process.env.EXTRA_PACKS) files.push(...readdirSync(process.env.EXTRA_PACKS).filter((f) => f.endsWith('.json')).map((f) => join(process.env.EXTRA_PACKS, f)));

const worlds = [];
let total = 0;
let failed = false;
for (const f of files) {
  let pack;
  try {
    pack = loadPack(f);
  } catch (e) {
    console.error(`${f}: ${e.message}`);
    failed = !lenient;
    continue;
  }
  const { errors } = checkPack(pack);
  if (errors.length) {
    console.error(`${f}:\n  ${errors.slice(0, 5).join('\n  ')}`);
    failed = !lenient;
    continue;
  }
  const mosaics = [];
  const figs = [];
  if (pack.mosaic) {
    for (const fig of pack.figures) {
      const tiles = tilesOf(fig, pack.tile || 10);
      mosaics.push({
        id: `${pack.id}-${fig.id}`,
        name: fig.name,
        blurb: fig.blurb,
        motion: fig.motion || 'bounce',
        fx: fig.fx || 'sparkles',
        w: fig.art[0].length,
        h: fig.art.length,
        pal: fig.pal,
        art: fig.art.join(''),
        ...(fig.holes ? { holes: fig.holes } : {}),
        ...(fig.article != null ? { article: fig.article } : {}),
        tile: pack.tile || 10,
        tiles: tiles.map((t) => `${pack.id}-${t.id}`),
      });
      for (const t of tiles) figs.push({ ...t, name: `${fig.name} ${t.ty + 1}-${t.tx + 1}`, mosaic: `${pack.id}-${fig.id}`, tx: t.tx, ty: t.ty });
    }
  } else figs.push(...pack.figures);
  const levels = figs.map((fig) => {
    const a = analyzeFigure(fig, pack.mode);
    const lv = {
      id: `${pack.id}-${fig.id}`,
      name: fig.name,
      blurb: fig.blurb,
      motion: fig.motion || 'bounce',
      fx: fig.fx || 'sparkles',
      w: a.w,
      h: a.h,
      pal: fig.pal,
      art: fig.art.join(''),
      givens: a.givens,
      score: a.score,
    };
    if (fig.holes) lv.holes = fig.holes;
    if (fig.mosaic) Object.assign(lv, { mosaic: fig.mosaic, tx: fig.tx, ty: fig.ty });
    if (fig.article != null) lv.article = fig.article;
    return lv;
  });
  total += levels.length;
  const givens = levels.reduce((s, l) => s + l.givens.length, 0);
  console.log(`${pack.id.padEnd(9)} ${pack.mode.padEnd(5)} ${String(levels.length).padStart(3)} levels, ${givens} givens`);
  const world = { id: pack.id, name: pack.name, tagline: pack.tagline, mode: pack.mode, color: pack.color || '#888888', levels };
  if (pack.mosaic) world.mosaics = mosaics;
  worlds.push(world);
}
if (failed) process.exit(1);

const out = join(root, 'public', 'js', 'levels-data.js');
writeFileSync(out, `export const WORLDS = ${JSON.stringify(worlds)};\n`);
console.log(`${worlds.length} worlds, ${total} levels -> ${out}`);

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, checkPack, analyzeFigure } from './packlib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'content', 'packs');
const files = readdirSync(dir).filter((f) => /^\d+-.*\.json$/.test(f)).sort();

const worlds = [];
let total = 0;
let failed = false;
for (const f of files) {
  const pack = loadPack(join(dir, f));
  const { errors } = checkPack(pack);
  if (errors.length) {
    console.error(`${f}:\n  ${errors.join('\n  ')}`);
    failed = true;
    continue;
  }
  const levels = pack.figures.map((fig) => {
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
    if (fig.article != null) lv.article = fig.article;
    return lv;
  });
  total += levels.length;
  const givens = levels.reduce((s, l) => s + l.givens.length, 0);
  console.log(`${pack.id.padEnd(9)} ${pack.mode.padEnd(5)} ${String(levels.length).padStart(3)} levels, ${givens} givens`);
  worlds.push({ id: pack.id, name: pack.name, tagline: pack.tagline, mode: pack.mode, color: pack.color || '#888888', levels });
}
if (failed) process.exit(1);

const out = join(root, 'public', 'js', 'levels-data.js');
writeFileSync(out, `export const WORLDS = ${JSON.stringify(worlds)};\n`);
console.log(`${worlds.length} worlds, ${total} levels -> ${out}`);

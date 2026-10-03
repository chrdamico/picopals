import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, checkPack, analyzeFigure, tilesOf } from './packlib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args.splice(outIdx, 2)[1] : join(here, '..', '.preview');
mkdirSync(outDir, { recursive: true });

let bad = false;
for (const path of args) {
  const pack = loadPack(path);
  const { errors, warnings } = checkPack(pack);
  console.log(`\n== ${pack.name} (${pack.id}, ${pack.mode}) — ${pack.figures.length} figures`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  for (const w of warnings) console.log(`  warn  ${w}`);
  if (errors.length) {
    bad = true;
    continue;
  }
  const report = [];
  if (!pack.mosaic) console.log('  #  id                    size   col fill  givens  rounds score');
  if (pack.mosaic) {
    const tile = pack.tile || 10;
    console.log('  #  mosaic                size   tiles  fill(min-max)  givens  rounds(min-max)');
    pack.figures.forEach((fig, i) => {
      const ts = tilesOf(fig, tile).map((t) => ({ t, a: analyzeFigure(t, pack.mode) }));
      const fills = ts.map((x) => x.a.fill);
      const rounds = ts.map((x) => x.a.rounds);
      const giv = ts.reduce((s2, x) => s2 + x.a.givens.length, 0);
      const flags = [];
      if (ts.some((x) => x.a.givenPct > 0.04)) flags.push('MANY-GIVENS ' + ts.filter((x) => x.a.givenPct > 0.04).map((x) => x.t.id).join(','));
      if (ts.some((x) => x.a.fill < 0.2)) flags.push('SPARSE ' + ts.filter((x) => x.a.fill < 0.2).map((x) => x.t.id).join(','));
      if (ts.some((x) => x.a.fill > 0.8)) flags.push('DENSE ' + ts.filter((x) => x.a.fill > 0.8).map((x) => x.t.id).join(','));
      console.log(`  ${String(i + 1).padStart(2)} ${fig.id.padEnd(21)} ${`${fig.art[0].length}x${fig.art.length}`.padEnd(6)} ${String(ts.length).padStart(5)}  ${Math.min(...fills).toFixed(2)}-${Math.max(...fills).toFixed(2)}     ${String(giv).padStart(6)}  ${Math.min(...rounds)}-${Math.max(...rounds)} ${flags.join(' ')}`);
      const w = fig.art[0].length;
      const sol = new Array(w * fig.art.length).fill(0);
      const givens = [];
      let chars = [];
      for (const { t, a } of ts) {
        chars = a.chars;
        a.sol.forEach((v, k) => {
          const x = t.tx * tile + (k % tile);
          const y = t.ty * tile + Math.floor(k / tile);
          sol[y * w + x] = v;
        });
        for (const g of a.givens) givens.push((t.ty * tile + Math.floor(g / tile)) * w + t.tx * tile + (g % tile));
      }
      report.push({ i: i + 1, id: fig.id, name: fig.name, art: fig.art, pal: fig.pal, holes: fig.holes || '', w, h: fig.art.length, sol, givens, chars, mode: pack.mode, tile });
    });
  } else pack.figures.forEach((fig, i) => {
    const a = analyzeFigure(fig, pack.mode);
    const flags = [];
    if (a.givenPct > 0.04) flags.push('MANY-GIVENS');
    if (a.fill < 0.25) flags.push('SPARSE');
    if (a.fill > 0.78) flags.push('DENSE');
    console.log(
      `  ${String(i + 1).padStart(2)} ${fig.id.padEnd(21)} ${`${a.w}x${a.h}`.padEnd(6)} ${String(a.ncolors).padStart(3)} ${a.fill.toFixed(2)}  ${String(a.givens.length).padStart(6)}  ${String(a.rounds).padStart(6)} ${String(a.score).padStart(5)} ${flags.join(' ')}`,
    );
    report.push({ i: i + 1, id: fig.id, name: fig.name, art: fig.art, pal: fig.pal, holes: fig.holes || '', w: a.w, h: a.h, sol: a.sol, givens: a.givens, chars: a.chars, mode: pack.mode });
  });
  const json = join(outDir, `${basename(path, '.json')}.report.json`);
  const png = join(outDir, `${basename(path, '.json')}.png`);
  writeFileSync(json, JSON.stringify({ name: pack.name, figures: report }));
  try {
    execFileSync('python3', [join(here, 'preview.py'), json, png], { stdio: 'inherit' });
    console.log(`  preview: ${png}`);
  } catch {
    console.log('  preview failed (needs python3 + Pillow)');
  }
}
process.exit(bad ? 1 : 0);

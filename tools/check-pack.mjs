import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, checkPack, analyzeFigure } from './packlib.mjs';

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
  console.log('  #  id                    size   col fill  givens  rounds score');
  pack.figures.forEach((fig, i) => {
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

import { Nonogram } from './nonogram.js';
import { hashString } from './rng.js';

export const INK = '#2E2A3B';

export function artRows(fig) {
  if (Array.isArray(fig.art)) return fig.art;
  const rows = [];
  for (let y = 0; y < fig.h; y++) rows.push(fig.art.slice(y * fig.w, (y + 1) * fig.w));
  return rows;
}

export function buildPuzzle(fig, mode) {
  const rows = artRows(fig);
  const h = rows.length;
  const w = rows[0].length;
  const holes = fig.holes || '';
  const chars = [];
  const sol = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || holes.includes(ch)) continue;
      if (mode === 'color') {
        const hex = fig.pal[ch].toUpperCase();
        let k = chars.indexOf(hex);
        if (k < 0) k = chars.push(hex) - 1;
        sol[y * w + x] = k + 1;
      } else sol[y * w + x] = 1;
    }
  }
  const ncolors = mode === 'color' ? chars.length : 1;
  const colors = mode === 'color' ? chars : [INK];
  const ng = new Nonogram({ w, h, sol, ncolors });
  return { ng, w, h, sol, ncolors, colors, rows, mode };
}

export function signature(fig, mode, givens) {
  return hashString(`${mode}|${fig.w}|${Array.isArray(fig.art) ? fig.art.join('') : fig.art}|${fig.holes || ''}|${(givens || []).join(',')}`).toString(36);
}

export function article(fig) {
  if (fig.article != null) return fig.article;
  return /^[aeiou]/i.test(fig.name) ? 'an' : 'a';
}

import { readFileSync } from 'node:fs';
import { Nonogram } from '../public/js/nonogram.js';
import { MOTIONS, EFFECTS } from '../public/js/figure-kinds.js';

export function loadPack(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function figurePuzzle(fig, mode) {
  const h = fig.art.length;
  const w = fig.art[0].length;
  const holes = fig.holes || '';
  const chars = [];
  const sol = new Array(w * h).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = fig.art[y][x];
      if (ch === '.' || holes.includes(ch)) continue;
      if (mode === 'color') {
        const hex = fig.pal[ch].toUpperCase();
        let k = chars.findIndex((c) => fig.pal[c].toUpperCase() === hex);
        if (k < 0) k = chars.push(ch) - 1;
        sol[y * w + x] = k + 1;
      } else sol[y * w + x] = 1;
    }
  }
  return { w, h, sol, chars, ncolors: mode === 'color' ? chars.length : 1 };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function validateFigure(fig, mode, errors, warnings) {
  const tag = fig.id || '?';
  const err = (m) => errors.push(`${tag}: ${m}`);
  const warn = (m) => warnings.push(`${tag}: ${m}`);
  if (!/^[a-z0-9-]+$/.test(fig.id || '')) err('id must be lowercase letters, digits, dashes');
  if (!fig.name) err('missing name');
  if (!fig.blurb) err('missing blurb');
  else if (fig.blurb.length > 90) warn(`blurb is ${fig.blurb.length} chars (max 90)`);
  if (!Array.isArray(fig.art) || !fig.art.length) return err('missing art');
  const w = fig.art[0].length;
  const h = fig.art.length;
  if (fig.art.some((r) => r.length !== w)) err(`rows have different lengths: ${fig.art.map((r) => r.length).join(',')}`);
  if (w < 4 || h < 4 || w > 30 || h > 30) err(`size ${w}x${h} out of range 4..30`);
  const pal = fig.pal || {};
  for (const [k, v] of Object.entries(pal)) {
    if (k.length !== 1 || k === '.') err(`bad palette key "${k}"`);
    if (!HEX.test(v)) err(`bad colour ${k}: ${v}`);
  }
  const used = new Set(fig.art.join('').replace(/\./g, ''));
  for (const ch of used) if (!pal[ch]) err(`char "${ch}" not in palette`);
  for (const k of Object.keys(pal)) if (!used.has(k)) warn(`palette key "${k}" unused`);
  for (const ch of fig.holes || '') if (!used.has(ch)) warn(`hole char "${ch}" unused`);
  if (fig.motion && !MOTIONS.includes(fig.motion)) err(`motion "${fig.motion}" not one of ${MOTIONS.join(', ')}`);
  if (fig.fx && !EFFECTS.includes(fig.fx)) err(`fx "${fig.fx}" not one of ${EFFECTS.join(', ')}`);
  if (errors.some((e) => e.startsWith(`${tag}:`))) return;
  const P = figurePuzzle(fig, mode);
  if (mode === 'color' && P.ncolors > 6) err(`colour puzzle uses ${P.ncolors} colours (max 6)`);
  if (mode === 'color' && P.ncolors < 2) err('colour puzzle needs at least 2 colours');
}

export function analyzeFigure(fig, mode) {
  const P = figurePuzzle(fig, mode);
  const ng = new Nonogram(P);
  const { givens, rounds, steps } = ng.findGivens();
  const filled = P.sol.filter((v) => v > 0).length;
  const cells = P.w * P.h;
  return {
    ...P,
    givens,
    rounds,
    steps,
    fill: filled / cells,
    givenPct: givens.length / cells,
    score: Math.round(cells * (1 + rounds / 12) + givens.length * 3),
  };
}

export function tilesOf(fig, tile) {
  const h = fig.art.length;
  const w = fig.art[0].length;
  const out = [];
  for (let ty = 0; ty * tile < h; ty++) {
    for (let tx = 0; tx * tile < w; tx++) {
      const art = fig.art.slice(ty * tile, (ty + 1) * tile).map((r) => r.slice(tx * tile, (tx + 1) * tile));
      out.push({ ...fig, id: `${fig.id}-${ty}${tx}`, art, tx, ty });
    }
  }
  return out;
}

export function checkPack(pack) {
  const errors = [];
  const warnings = [];
  const mode = pack.mode;
  if (!['mono', 'color'].includes(mode)) errors.push(`pack: mode must be "mono" or "color"`);
  for (const k of ['id', 'name', 'tagline']) if (!pack[k]) errors.push(`pack: missing ${k}`);
  const ids = new Set();
  const tile = pack.tile || 10;
  if (pack.mosaic && ![5, 10, 15].includes(tile)) errors.push('pack: tile must be 5, 10 or 15');
  for (const fig of pack.figures || []) {
    if (ids.has(fig.id)) errors.push(`${fig.id}: duplicate id`);
    ids.add(fig.id);
    if (!pack.mosaic) {
      validateFigure(fig, mode, errors, warnings);
      continue;
    }
    const n = errors.length;
    const h = fig.art?.length || 0;
    const w = fig.art?.[0]?.length || 0;
    if (w % tile || h % tile) errors.push(`${fig.id}: mosaic size ${w}x${h} must be a multiple of ${tile}`);
    if (w > 40 || h > 40) errors.push(`${fig.id}: mosaic size ${w}x${h} too big (max 40)`);
    if (fig.blurb && fig.blurb.length > 90) warnings.push(`${fig.id}: blurb is ${fig.blurb.length} chars (max 90)`);
    if (!fig.name || !fig.blurb) errors.push(`${fig.id}: needs name and blurb`);
    if (errors.length > n) continue;
    for (const t of tilesOf(fig, tile)) {
      const e2 = [];
      validateFigure({ ...t, name: fig.name, blurb: 'x' }, mode, e2, []);
      if (e2.length) errors.push(...e2);
      else {
        const P = figurePuzzle(t, mode);
        const f = P.sol.filter((v) => v > 0).length / P.sol.length;
        if (f === 0) errors.push(`${t.id}: tile is empty`);
        else if (f < 0.15) warnings.push(`${t.id}: tile fill ${f.toFixed(2)} is very low`);
      }
    }
  }
  return { errors, warnings };
}

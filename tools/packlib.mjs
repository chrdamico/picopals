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

export function checkPack(pack) {
  const errors = [];
  const warnings = [];
  const mode = pack.mode;
  if (!['mono', 'color'].includes(mode)) errors.push(`pack: mode must be "mono" or "color"`);
  for (const k of ['id', 'name', 'tagline']) if (!pack[k]) errors.push(`pack: missing ${k}`);
  const ids = new Set();
  for (const fig of pack.figures || []) {
    if (ids.has(fig.id)) errors.push(`${fig.id}: duplicate id`);
    ids.add(fig.id);
    validateFigure(fig, mode, errors, warnings);
  }
  return { errors, warnings };
}

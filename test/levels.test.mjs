import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLDS } from '../public/js/levels-data.js';
import { buildPuzzle } from '../public/js/puzzle.js';
import { critterPuzzle, makeCritter } from '../public/js/critters.js';
import { dailyParams, lastDays } from '../public/js/daily.js';
import { MOTIONS, EFFECTS } from '../public/js/figure-kinds.js';

function solvable(fig, mode, givens) {
  const P = buildPuzzle(fig, mode);
  const s = P.ng.initialState(givens);
  if (P.ng.propagate(s) !== 1) return false;
  for (let i = 0; i < s.length; i++) if (s[i] !== 1 << P.sol[i]) return false;
  return true;
}

test('every journey level solves with line logic from its givens', () => {
  const ids = new Set();
  let n = 0;
  for (const w of WORLDS) {
    assert.ok(w.levels.length > 0, `${w.id} has levels`);
    for (const lv of w.levels) {
      assert.ok(!ids.has(lv.id), `duplicate id ${lv.id}`);
      ids.add(lv.id);
      assert.equal(lv.art.length, lv.w * lv.h, `${lv.id} art size`);
      assert.ok(lv.w <= 20, `${lv.id} width ${lv.w} fits a phone`);
      assert.ok(MOTIONS.includes(lv.motion), `${lv.id} motion`);
      assert.ok(EFFECTS.includes(lv.fx), `${lv.id} fx`);
      const P = buildPuzzle(lv, w.mode);
      assert.ok(P.sol.some((v) => v > 0), `${lv.id} has filled cells`);
      if (w.mode === 'color') assert.ok(P.ncolors >= 2 && P.ncolors <= 6, `${lv.id} colours ${P.ncolors}`);
      assert.ok(solvable(lv, w.mode, lv.givens), `${lv.id} solvable`);
      n++;
    }
  }
  assert.ok(n >= 12);
});

test('mosaic tiles exist and match their big picture', () => {
  const byId = new Map();
  for (const w of WORLDS) for (const lv of w.levels) byId.set(lv.id, lv);
  for (const w of WORLDS) {
    for (const m of w.mosaics || []) {
      assert.equal(m.tiles.length, (m.w / m.tile) * (m.h / m.tile), `${m.id} tile count`);
      for (const id of m.tiles) {
        const lv = byId.get(id);
        assert.ok(lv, `${id} exists`);
        assert.equal(lv.mosaic, m.id);
        for (let y = 0; y < lv.h; y++) {
          const row = m.art.slice((lv.ty * m.tile + y) * m.w + lv.tx * m.tile, (lv.ty * m.tile + y) * m.w + lv.tx * m.tile + lv.w);
          assert.equal(lv.art.slice(y * lv.w, (y + 1) * lv.w), row, `${id} row ${y}`);
        }
      }
    }
  }
});

test('critter puzzles are line solvable for every size and style', () => {
  for (const size of [10, 15, 20]) {
    for (const mode of ['mono', 'color']) {
      for (let k = 0; k < 12; k++) {
        const seed = 777 + k * 1013 + size;
        const { fig, givens } = critterPuzzle(seed, size, mode);
        assert.equal(fig.art.length, size);
        assert.ok(fig.art.every((r) => r.length === size));
        assert.ok(solvable(fig, mode, givens), `critter ${seed} ${size} ${mode}`);
        assert.ok(givens.length <= size * size * 0.06, `critter ${seed} ${size} ${mode} has ${givens.length} givens`);
        assert.ok(fig.name && fig.blurb);
      }
    }
  }
});

test('critters are deterministic', () => {
  const a = makeCritter(4242, 15);
  const b = makeCritter(4242, 15);
  assert.deepEqual(a, b);
  const p = critterPuzzle(99, 15, 'mono');
  const q = critterPuzzle(99, 15, 'mono');
  assert.deepEqual(p.givens, q.givens);
  assert.equal(p.fig.id, q.fig.id);
});

test('a week of dailies generates', () => {
  for (const key of lastDays(7, new Date(2026, 8, 29))) {
    const d = dailyParams(key);
    const { fig, givens } = critterPuzzle(d.seed, d.size, d.mode);
    assert.ok(solvable(fig, d.mode, givens), key);
  }
});

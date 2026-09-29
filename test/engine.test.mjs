import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineSolve, lineClue, Nonogram, clueDone } from '../public/js/nonogram.js';
import { mulberry32, randInt } from '../public/js/rng.js';

function brute(masks, clue, K) {
  const n = masks.length;
  const union = new Array(n).fill(0);
  let any = false;
  const vals = new Array(n);
  const rec = (i) => {
    if (i === n) {
      const c = lineClue(vals);
      if (c.length !== clue.length || c.some((b, k) => b[0] !== clue[k][0] || b[1] !== clue[k][1])) return;
      any = true;
      for (let t = 0; t < n; t++) union[t] |= 1 << vals[t];
      return;
    }
    for (let v = 0; v <= K; v++) {
      if (!(masks[i] & (1 << v))) continue;
      vals[i] = v;
      rec(i + 1);
    }
  };
  rec(0);
  return any ? union : null;
}

test('line solver matches brute force', () => {
  const rng = mulberry32(7);
  for (let iter = 0; iter < 6000; iter++) {
    const K = 1 + randInt(rng, 3);
    const n = 1 + randInt(rng, K === 1 ? 12 : K === 2 ? 8 : 6);
    const sol = Array.from({ length: n }, () => (rng() < 0.45 ? 0 : 1 + randInt(rng, K)));
    const clue = lineClue(sol);
    const full = (1 << (K + 1)) - 1;
    const consistent = rng() < 0.8;
    const masks = sol.map((v) => {
      let m = rng() < 0.5 ? full : (1 << v) | (randInt(rng, full + 1) & full);
      if (!consistent && rng() < 0.3) m = randInt(rng, full) + 1;
      return m;
    });
    const want = brute(masks, clue, K);
    const out = new Uint8Array(n);
    const ok = lineSolve(Uint8Array.from(masks), clue, out);
    if (!want) {
      assert.equal(ok, false, `expected contradiction n=${n} K=${K} masks=${masks} clue=${JSON.stringify(clue)}`);
    } else {
      assert.equal(ok, true, `unexpected contradiction masks=${masks} clue=${JSON.stringify(clue)}`);
      assert.deepEqual(Array.from(out), want, `masks=${masks} clue=${JSON.stringify(clue)}`);
    }
  }
});

test('givens make any random grid line solvable', () => {
  const rng = mulberry32(11);
  for (let iter = 0; iter < 60; iter++) {
    const K = 1 + randInt(rng, 3);
    const w = 5 + randInt(rng, 12);
    const h = 5 + randInt(rng, 12);
    const sol = Array.from({ length: w * h }, () => (rng() < 0.45 ? 0 : 1 + randInt(rng, K)));
    const p = new Nonogram({ w, h, sol, ncolors: K });
    const { givens } = p.findGivens();
    const s = p.initialState(givens);
    assert.equal(p.propagate(s), 1);
    for (let i = 0; i < s.length; i++) assert.equal(s[i], 1 << sol[i]);
  }
});

test('clueDone marks finished blocks', () => {
  assert.deepEqual(clueDone([1, 1, 0, -1, -1, -1, 0, 1], [[2, 1], [1, 1], [1, 1]]), [true, false, true]);
  assert.deepEqual(clueDone([1, 1, -1, 1, -1], [[2, 1], [1, 1]]), [true, true]);
  assert.deepEqual(clueDone([-1, 1, 1, 0, -1], [[2, 1], [1, 1]]), [false, false]);
  assert.deepEqual(clueDone([1, 2, 2, -1, -1], [[1, 1], [2, 2], [1, 1]]), [true, false, false]);
});

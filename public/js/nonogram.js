const MAXN = 64;
const MAXM = 40;
const W1 = MAXN + 2;
const F = new Uint8Array((MAXM + 1) * W1);
const G = new Uint8Array((MAXM + 1) * W1);
const RUN = new Uint8Array(10 * (MAXN + 1));
const COV = new Int16Array(10 * (MAXN + 2));
const EMP = new Uint8Array(MAXN);

export const EMPTY_BIT = 1;

export function single(m) {
  return m !== 0 && (m & (m - 1)) === 0;
}

export function valueOf(m) {
  return 31 - Math.clz32(m);
}

export function lineClue(vals) {
  const out = [];
  let run = 0;
  let col = 0;
  for (const v of vals) {
    if (v > 0 && v === col) {
      run++;
      continue;
    }
    if (col > 0) out.push([run, col]);
    col = v;
    run = v > 0 ? 1 : 0;
  }
  if (col > 0) out.push([run, col]);
  return out;
}

export function makeClues(sol, w, h) {
  const rows = [];
  const cols = [];
  for (let y = 0; y < h; y++) rows.push(lineClue(Array.from({ length: w }, (_, x) => sol[y * w + x])));
  for (let x = 0; x < w; x++) cols.push(lineClue(Array.from({ length: h }, (_, y) => sol[y * w + x])));
  return { rows, cols };
}

export function lineSolve(line, clue, out) {
  const n = line.length;
  const m = clue.length;
  const W = n + 2;
  let used = 0;
  for (let j = 0; j < m; j++) used |= 1 << clue[j][1];
  for (let c = 1; c < 10; c++) {
    if (!(used & (1 << c))) continue;
    const rb = c * (n + 1);
    RUN[rb + n] = 0;
    for (let i = n - 1; i >= 0; i--) RUN[rb + i] = (line[i] >> c) & 1 ? RUN[rb + i + 1] + 1 : 0;
  }
  F[0] = 1;
  for (let i = 1; i <= n; i++) F[i] = F[i - 1] && line[i - 1] & 1 ? 1 : 0;
  for (let j = 1; j <= m; j++) {
    const L = clue[j - 1][0];
    const c = clue[j - 1][1];
    const gap = j > 1 && clue[j - 2][1] === c;
    const row = j * W;
    const prev = (j - 1) * W;
    const rb = c * (n + 1);
    for (let i = 0; i <= n; i++) {
      let v = i > 0 && F[row + i - 1] && line[i - 1] & 1;
      if (!v) {
        const s = i - L;
        if (s >= 0 && RUN[rb + s] >= L) v = gap ? s >= 1 && line[s - 1] & 1 && F[prev + s - 1] : F[prev + s];
      }
      F[row + i] = v ? 1 : 0;
    }
  }
  if (!F[m * W + n]) return false;
  const last = m * W;
  G[last + n] = 1;
  for (let i = n - 1; i >= 0; i--) G[last + i] = G[last + i + 1] && line[i] & 1 ? 1 : 0;
  for (let j = m - 1; j >= 0; j--) {
    const L = clue[j][0];
    const c = clue[j][1];
    const gap = j + 1 < m && clue[j + 1][1] === c;
    const row = j * W;
    const next = (j + 1) * W;
    const rb = c * (n + 1);
    for (let i = n; i >= 0; i--) {
      let v = i < n && G[row + i + 1] && line[i] & 1;
      if (!v) {
        const e = i + L;
        if (e <= n && RUN[rb + i] >= L) v = gap ? e < n && line[e] & 1 && G[next + e + 1] : G[next + e];
      }
      G[row + i] = v ? 1 : 0;
    }
  }
  for (let c = 1; c < 10; c++) {
    if (!(used & (1 << c))) continue;
    COV.fill(0, c * (n + 2), c * (n + 2) + n + 1);
  }
  for (let j = 0; j < m; j++) {
    const L = clue[j][0];
    const c = clue[j][1];
    const gapL = j > 0 && clue[j - 1][1] === c;
    const gapR = j + 1 < m && clue[j + 1][1] === c;
    const rb = c * (n + 1);
    const cb = c * (n + 2);
    const fr = j * W;
    const gr = (j + 1) * W;
    for (let s = 0; s + L <= n; s++) {
      if (RUN[rb + s] < L) continue;
      if (!(gapL ? s >= 1 && line[s - 1] & 1 && F[fr + s - 1] : F[fr + s])) continue;
      const e = s + L;
      if (!(gapR ? e < n && line[e] & 1 && G[gr + e + 1] : G[gr + e])) continue;
      COV[cb + s]++;
      COV[cb + e]--;
    }
  }
  for (let i = 0; i < n; i++) {
    let e = 0;
    if (line[i] & 1) {
      for (let j = 0; j <= m; j++) {
        if (F[j * W + i] && G[j * W + i + 1]) {
          e = 1;
          break;
        }
      }
    }
    EMP[i] = e;
    out[i] = e;
  }
  for (let c = 1; c < 10; c++) {
    if (!(used & (1 << c))) continue;
    const cb = c * (n + 2);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += COV[cb + i];
      if (acc > 0) out[i] |= 1 << c;
    }
  }
  for (let i = 0; i < n; i++) {
    out[i] &= line[i];
    if (!out[i]) return false;
  }
  return true;
}

export function fullMask(ncolors) {
  return (1 << (ncolors + 1)) - 1;
}

export class Nonogram {
  constructor({ w, h, sol, ncolors = 1 }) {
    this.w = w;
    this.h = h;
    this.sol = Uint8Array.from(sol);
    this.ncolors = ncolors;
    const { rows, cols } = makeClues(this.sol, w, h);
    this.rows = rows;
    this.cols = cols;
    this.bufA = new Uint8Array(Math.max(w, h));
    this.bufB = new Uint8Array(Math.max(w, h));
  }

  initialState(givens = []) {
    const s = new Uint8Array(this.w * this.h).fill(fullMask(this.ncolors));
    for (const i of givens) s[i] = 1 << this.sol[i];
    return s;
  }

  lineCells(k) {
    const { w, h } = this;
    if (k < h) return Array.from({ length: w }, (_, x) => k * w + x);
    const x = k - h;
    return Array.from({ length: h }, (_, y) => y * w + x);
  }

  lineClue(k) {
    return k < this.h ? this.rows[k] : this.cols[k - this.h];
  }

  deduceLine(state, k, out) {
    const { w, h } = this;
    const row = k < h;
    const n = row ? w : h;
    const line = this.bufA.subarray(0, n);
    const res = out || new Uint8Array(n);
    if (row) for (let x = 0; x < w; x++) line[x] = state[k * w + x];
    else for (let y = 0; y < h; y++) line[y] = state[y * w + (k - h)];
    return lineSolve(line, row ? this.rows[k] : this.cols[k - h], res) ? res : null;
  }

  propagate(state, lines = null, stats = null) {
    const { w, h } = this;
    const L = w + h;
    const inQ = new Uint8Array(L);
    let cur = [];
    if (lines) for (const k of lines) (inQ[k] = 1), cur.push(k);
    else for (let k = 0; k < L; k++) (inQ[k] = 1), cur.push(k);
    const out = this.bufB;
    let rounds = 0;
    let steps = 0;
    while (cur.length) {
      const next = [];
      let changedRound = false;
      for (const k of cur) {
        inQ[k] = 0;
        const row = k < h;
        const n = row ? w : h;
        const res = this.deduceLine(state, k, out.subarray(0, n));
        if (!res) return -1;
        let changed = false;
        for (let t = 0; t < n; t++) {
          const idx = row ? k * w + t : t * w + (k - h);
          if (res[t] === state[idx]) continue;
          state[idx] = res[t];
          changed = true;
          const other = row ? h + t : t;
          if (!inQ[other]) {
            inQ[other] = 1;
            next.push(other);
          }
        }
        if (changed) {
          steps++;
          changedRound = true;
        }
      }
      if (changedRound) rounds++;
      cur = next;
    }
    if (stats) {
      stats.rounds = (stats.rounds || 0) + rounds;
      stats.steps = (stats.steps || 0) + steps;
    }
    for (let i = 0; i < state.length; i++) if (!single(state[i])) return 0;
    return 1;
  }

  countKnown(state) {
    let n = 0;
    for (let i = 0; i < state.length; i++) if (single(state[i])) n++;
    return n;
  }

  findGivens({ maxCandidates = 120 } = {}) {
    const { w, h } = this;
    const state = this.initialState();
    const stats = {};
    let r = this.propagate(state, null, stats);
    if (r < 0) throw new Error('clues contradict');
    const givens = [];
    while (r === 0) {
      const open = [];
      for (let i = 0; i < state.length; i++) if (!single(state[i])) open.push(i);
      let pick = open;
      if (open.length > maxCandidates) {
        pick = [];
        const step = open.length / maxCandidates;
        for (let t = 0; t < maxCandidates; t++) pick.push(open[Math.floor(t * step)]);
      }
      let best = -1;
      let bestScore = -1;
      for (const i of pick) {
        const s = state.slice();
        s[i] = 1 << this.sol[i];
        this.propagate(s, [Math.floor(i / w), h + (i % w)]);
        const score = this.countKnown(s) + (this.sol[i] === 0 ? 0.5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      state[best] = 1 << this.sol[best];
      givens.push(best);
      r = this.propagate(state, [Math.floor(best / w), h + (best % w)], stats);
    }
    givens.sort((a, b) => a - b);
    return { givens, rounds: stats.rounds || 0, steps: stats.steps || 0 };
  }

  isLineSolvable(givens = []) {
    return this.propagate(this.initialState(givens)) === 1;
  }
}

export function lineMatches(vals, clue) {
  const got = lineClue(vals);
  if (got.length !== clue.length) return false;
  for (let i = 0; i < got.length; i++) if (got[i][0] !== clue[i][0] || got[i][1] !== clue[i][1]) return false;
  return true;
}

export function clueDone(vals, clue) {
  const n = vals.length;
  const m = clue.length;
  const done = new Array(m).fill(false);
  if (lineMatches(vals.map((v) => (v > 0 ? v : 0)), clue)) {
    done.fill(true);
    return done;
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (vals[i] === 0) {
      i++;
      continue;
    }
    if (vals[i] < 0) break;
    const c = vals[i];
    let e = i;
    while (e < n && vals[e] === c) e++;
    const closedLeft = i === 0 || vals[i - 1] === 0 || (vals[i - 1] > 0 && vals[i - 1] !== c);
    const closedRight = e === n || vals[e] === 0 || (vals[e] > 0 && vals[e] !== c);
    if (!closedLeft || !closedRight || e - i !== clue[j][0] || c !== clue[j][1]) break;
    done[j] = true;
    j++;
    i = e;
  }
  let a = n - 1;
  let b = m - 1;
  while (a >= 0 && b >= 0 && !done[b]) {
    if (vals[a] === 0) {
      a--;
      continue;
    }
    if (vals[a] < 0) break;
    const c = vals[a];
    let s = a;
    while (s >= 0 && vals[s] === c) s--;
    const closedR = a === n - 1 || vals[a + 1] === 0 || (vals[a + 1] > 0 && vals[a + 1] !== c);
    const closedL = s < 0 || vals[s] === 0 || (vals[s] > 0 && vals[s] !== c);
    if (!closedL || !closedR || a - s !== clue[b][0] || c !== clue[b][1]) break;
    done[b] = true;
    b--;
    a = s;
  }
  return done;
}

const KEY = 'picopals:v1';
const BAK = 'picopals:v1:bak';
const GONE_TTL = 30 * 24 * 3600 * 1000;

const DEFAULT_SETTINGS = {
  theme: 'auto',
  instantCheck: false,
  autocross: true,
  sound: true,
  vibrate: true,
  lefty: false,
};

function fresh() {
  return {
    epoch: 0,
    settings: { ...DEFAULT_SETTINGS },
    settingsAt: 0,
    done: {},
    saves: {},
    gone: {},
    seen: {},
    hatch: { opts: { size: 15, mode: 'mono' }, optsAt: 0, current: null, currentAt: 0, dex: [], next: 1 },
    daily: { history: {} },
    stats: { solved: 0, time: 0 },
    last: null,
    lastAt: 0,
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function normalize(d) {
  const base = fresh();
  if (!isObj(d)) return base;
  return {
    ...base,
    ...d,
    epoch: +d.epoch || 0,
    settings: { ...base.settings, ...(isObj(d.settings) ? d.settings : {}) },
    done: isObj(d.done) ? d.done : {},
    saves: isObj(d.saves) ? d.saves : {},
    gone: isObj(d.gone) ? d.gone : {},
    seen: isObj(d.seen) ? d.seen : {},
    hatch: { ...base.hatch, ...(isObj(d.hatch) ? d.hatch : {}), dex: Array.isArray(d.hatch?.dex) ? d.hatch.dex : [] },
    daily: { history: isObj(d.daily?.history) ? d.daily.history : {} },
    stats: { ...base.stats, ...(isObj(d.stats) ? d.stats : {}) },
  };
}

const dexKey = (e) => `${e.seed}|${e.size}|${e.mode}`;

function bestOf(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a, ...b };
  if (a.t != null || b.t != null) out.t = Math.min(a.t ?? Infinity, b.t ?? Infinity);
  if (a.stars != null || b.stars != null) out.stars = Math.max(a.stars || 0, b.stars || 0);
  out.at = Math.max(a.at || 0, b.at || 0);
  if (a.n != null || b.n != null) out.n = Math.max(a.n || 0, b.n || 0);
  return out;
}

export function merge(a, b) {
  a = normalize(a);
  b = normalize(b);
  const settings = (b.settingsAt || 0) > (a.settingsAt || 0) ? b.settings : a.settings;
  const settingsAt = Math.max(a.settingsAt || 0, b.settingsAt || 0);
  if (a.epoch !== b.epoch) {
    const win = a.epoch > b.epoch ? a : b;
    return { ...win, settings: { ...settings }, settingsAt };
  }
  const done = { ...a.done };
  for (const [k, v] of Object.entries(b.done)) done[k] = bestOf(done[k], v);
  const history = { ...a.daily.history };
  for (const [k, v] of Object.entries(b.daily.history)) history[k] = bestOf(history[k], v);
  const now = Date.now();
  const gone = {};
  for (const src of [a.gone, b.gone]) {
    for (const [k, at] of Object.entries(src)) if (now - at < GONE_TTL) gone[k] = Math.max(gone[k] || 0, at);
  }
  const saves = {};
  for (const src of [a.saves, b.saves]) {
    for (const [k, v] of Object.entries(src)) {
      if (!isObj(v)) continue;
      if (!saves[k] || (v.at || 0) > (saves[k].at || 0)) saves[k] = v;
    }
  }
  for (const k of Object.keys(saves)) if (gone[k] && gone[k] >= (saves[k].at || 0)) delete saves[k];
  const dexMap = new Map();
  for (const e of [...a.hatch.dex, ...b.hatch.dex]) {
    if (!e) continue;
    const k = dexKey(e);
    const prev = dexMap.get(k);
    dexMap.set(k, prev ? { ...bestOf(prev, e), at: Math.min(prev.at || 0, e.at || 0) || prev.at || e.at } : e);
  }
  const dex = [...dexMap.values()].sort((x, y) => (x.at || 0) - (y.at || 0));
  const curSide = (b.hatch.currentAt || 0) > (a.hatch.currentAt || 0) ? b : a;
  let current = curSide.hatch.current;
  if (current && dexMap.has(dexKey(current))) current = null;
  const optsSide = (b.hatch.optsAt || 0) > (a.hatch.optsAt || 0) ? b : a;
  const lastSide = (b.lastAt || 0) > (a.lastAt || 0) ? b : a;
  return {
    ...a,
    epoch: a.epoch,
    settings: { ...settings },
    settingsAt,
    done,
    saves,
    gone,
    seen: { ...b.seen, ...a.seen },
    hatch: {
      opts: { ...optsSide.hatch.opts },
      optsAt: Math.max(a.hatch.optsAt || 0, b.hatch.optsAt || 0),
      current,
      currentAt: Math.max(a.hatch.currentAt || 0, b.hatch.currentAt || 0),
      dex,
      next: Math.max(a.hatch.next || 1, b.hatch.next || 1),
    },
    daily: { history },
    stats: { solved: Math.max(a.stats.solved || 0, b.stats.solved || 0), time: Math.max(a.stats.time || 0, b.stats.time || 0) },
    last: lastSide.last,
    lastAt: Math.max(a.lastAt || 0, b.lastAt || 0),
  };
}

function readKey(k) {
  try {
    const raw = localStorage.getItem(k);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function readStored() {
  const a = readKey(KEY);
  const b = readKey(BAK);
  if (a && b) return merge(a, b);
  return a || b;
}

function writeAll() {
  const json = JSON.stringify(db);
  for (const k of [KEY, BAK]) {
    try {
      localStorage.setItem(k, json);
    } catch {}
  }
}

export const db = readStored() || fresh();

let snap = null;

function snapshot() {
  snap = {
    settings: JSON.stringify(db.settings),
    opts: JSON.stringify(db.hatch.opts),
    current: JSON.stringify(db.hatch.current),
    last: JSON.stringify(db.last),
    saves: new Set(Object.keys(db.saves)),
  };
}
snapshot();

function stamp() {
  const now = Date.now();
  if (JSON.stringify(db.settings) !== snap.settings) db.settingsAt = now;
  if (JSON.stringify(db.hatch.opts) !== snap.opts) db.hatch.optsAt = now;
  if (JSON.stringify(db.hatch.current) !== snap.current) db.hatch.currentAt = now;
  if (JSON.stringify(db.last) !== snap.last) db.lastAt = now;
  for (const k of snap.saves) if (!db.saves[k]) db.gone[k] = now;
}

function adopt(m) {
  for (const k of Object.keys(db)) if (!(k in m)) delete db[k];
  for (const [k, v] of Object.entries(m)) {
    if (isObj(v) && isObj(db[k]) && k !== 'last') {
      for (const kk of Object.keys(db[k])) if (!(kk in v)) delete db[k][kk];
      Object.assign(db[k], v);
    } else db[k] = v;
  }
  snapshot();
}

const listeners = new Set();

export function onExternalChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function sync({ write = true } = {}) {
  stamp();
  const stored = readStored();
  const before = JSON.stringify(db);
  const merged = stored ? merge(db, stored) : normalize(db);
  adopt(merged);
  if (write) writeAll();
  return JSON.stringify(db) !== before;
}

let timer = 0;

export function persist(now = false) {
  clearTimeout(timer);
  if (now) sync();
  else timer = setTimeout(() => sync(), 250);
}

export function resetAll() {
  const keep = db.settings;
  const f = fresh();
  f.epoch = Date.now();
  f.settings = keep;
  f.settingsAt = Date.now();
  adopt(f);
  writeAll();
}

export function exportCode() {
  stamp();
  const json = JSON.stringify(db);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `PICOPALS1:${btoa(bin)}.`;
}

export function importCode(code) {
  const m = String(code || '').match(/PICOPALS1:([A-Za-z0-9+/=\s]+?)(?:\.|\s*$)/);
  if (!m) throw new Error('Not a Picopals backup code');
  const bin = atob(m[1].replace(/\s+/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const data = normalize(JSON.parse(new TextDecoder().decode(bytes)));
  stamp();
  const keepEpoch = db.epoch;
  data.epoch = keepEpoch;
  const merged = merge(db, data);
  adopt(merged);
  writeAll();
  return merged;
}

window.addEventListener('pagehide', () => persist(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist(true);
  else if (sync()) listeners.forEach((fn) => fn());
});
window.addEventListener('storage', (e) => {
  if (e.key !== KEY && e.key !== BAK && e.key !== null) return;
  if (sync({ write: false })) listeners.forEach((fn) => fn());
});

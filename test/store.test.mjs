import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
const handlers = {};
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.window = { addEventListener: (t, f) => ((handlers[t] ||= []).push(f)) };
globalThis.document = { visibilityState: 'visible', addEventListener: (t, f) => ((handlers['doc:' + t] ||= []).push(f)) };

const KEY = 'picopals:v1';
const old = { settings: { theme: 'dark' }, done: { 'a-1': { t: 5000, stars: 2, at: 1 } }, hatch: { dex: [{ seed: 1, size: 10, mode: 'mono', at: 1 }] }, daily: { history: {} } };
mem.set(KEY, JSON.stringify(old));
const { db, persist, sync, merge, resetAll, exportCode, importCode } = await import('../public/js/store.js');
const stored = () => JSON.parse(mem.get(KEY));

test('loads old-format saves without losing anything', () => {
  assert.equal(db.settings.theme, 'dark');
  assert.ok(db.done['a-1']);
  assert.equal(db.hatch.dex.length, 1);
  assert.equal(db.settings.instantCheck, false);
});

test('a stale window cannot erase progress written by another window', () => {
  const newer = stored();
  newer.done['a-2'] = { t: 9000, stars: 3, at: 2 };
  newer.done['a-1'] = { t: 4000, stars: 3, at: 2 };
  newer.hatch.dex.push({ seed: 2, size: 15, mode: 'color', at: 2 });
  newer.daily.history['2026-10-01'] = { t: 1000, stars: 3, at: 2 };
  mem.set(KEY, JSON.stringify(newer));
  db.done['a-3'] = { t: 7000, stars: 1, at: 3 };
  persist(true);
  const s = stored();
  assert.deepEqual(Object.keys(s.done).sort(), ['a-1', 'a-2', 'a-3']);
  assert.equal(s.done['a-1'].t, 4000);
  assert.equal(s.done['a-1'].stars, 3);
  assert.equal(s.hatch.dex.length, 2);
  assert.ok(s.daily.history['2026-10-01']);
  assert.ok(db.done['a-2'], 'memory picks up the other window');
});

test('a finished board stays deleted even if a stale window still has it', () => {
  db.saves['lv:x'] = { sig: 's', v: '..', at: Date.now() };
  persist(true);
  const staleCopy = stored();
  delete db.saves['lv:x'];
  persist(true);
  mem.set(KEY, JSON.stringify(staleCopy));
  sync();
  assert.equal(db.saves['lv:x'], undefined);
  assert.equal(stored().saves['lv:x'], undefined);
});

test('settings use the newest change', () => {
  db.settings.sound = false;
  persist(true);
  const other = stored();
  other.settings.sound = true;
  other.settingsAt = Date.now() + 1000;
  mem.set(KEY, JSON.stringify(other));
  sync();
  assert.equal(db.settings.sound, true);
});

test('an old app version overwriting the main key is recovered from the backup', () => {
  const before = Object.keys(db.done).length;
  mem.set(KEY, JSON.stringify({ settings: {}, done: {} }));
  sync();
  assert.equal(Object.keys(db.done).length, before);
  assert.equal(Object.keys(stored().done).length, before);
});

test('reset wins over stale windows, but later progress counts again', () => {
  const stale = stored();
  resetAll();
  assert.equal(Object.keys(db.done).length, 0);
  const m = merge(db, stale);
  assert.equal(Object.keys(m.done).length, 0);
  mem.set(KEY, JSON.stringify(stale));
  mem.set('picopals:v1:bak', JSON.stringify(stale));
  db.done['b-1'] = { t: 1, stars: 3, at: Date.now() };
  persist(true);
  assert.deepEqual(Object.keys(stored().done), ['b-1']);
});

test('backup code import only adds progress', () => {
  db.done['c-1'] = { t: 100, stars: 3, at: Date.now() };
  persist(true);
  const code = exportCode();
  assert.match(code, /^PICOPALS1:/);
  resetAll();
  db.done['c-2'] = { t: 100, stars: 1, at: Date.now() };
  persist(true);
  importCode(`some text ${code} more`);
  assert.ok(db.done['c-1'] && db.done['c-2']);
  assert.throws(() => importCode('nope'));
});

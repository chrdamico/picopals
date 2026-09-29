import { hashString } from './rng.js';

const SCHEDULE = [
  { name: 'Sunday Showpiece', size: 20, mode: 'mono' },
  { name: 'Monday Mini', size: 10, mode: 'mono' },
  { name: 'Tuesday Tint', size: 10, mode: 'color' },
  { name: 'Wednesday Classic', size: 15, mode: 'mono' },
  { name: 'Thursday Colours', size: 15, mode: 'color' },
  { name: 'Friday Fun', size: 15, mode: 'mono' },
  { name: 'Saturday Special', size: 20, mode: 'color' },
];

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dailyParams(key = dateKey()) {
  const day = parseKey(key).getDay();
  const s = SCHEDULE[day];
  return { ...s, key, seed: hashString(`picopals-daily-${key}`) };
}

export function lastDays(n, from = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - i);
    out.push(dateKey(d));
  }
  return out;
}

export function streak(history, today = dateKey()) {
  let n = 0;
  const d = parseKey(today);
  if (!history[today]) d.setDate(d.getDate() - 1);
  while (history[dateKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

const KEY = 'picopals:v1';

const DEFAULT_SETTINGS = {
  theme: 'auto',
  assist: true,
  autocross: true,
  sound: true,
  vibrate: true,
  lefty: false,
};

function fresh() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    done: {},
    saves: {},
    seen: {},
    hatch: { opts: { size: 15, mode: 'mono' }, current: null, dex: [], next: 1 },
    daily: { history: {} },
    stats: { solved: 0, time: 0 },
    last: null,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const base = fresh();
    return {
      ...base,
      ...d,
      settings: { ...base.settings, ...(d.settings || {}) },
      hatch: { ...base.hatch, ...(d.hatch || {}) },
      daily: { ...base.daily, ...(d.daily || {}) },
      stats: { ...base.stats, ...(d.stats || {}) },
    };
  } catch {
    return fresh();
  }
}

export const db = load();

let timer = 0;

export function persist(now = false) {
  clearTimeout(timer);
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
  };
  if (now) write();
  else timer = setTimeout(write, 250);
}

export function resetAll() {
  const keep = db.settings;
  const f = fresh();
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, f, { settings: keep });
  persist(true);
}

window.addEventListener('pagehide', () => persist(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist(true);
});

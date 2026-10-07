import { db, persist, resetAll, onExternalChange, exportCode, importCode } from './store.js';
import { WORLDS } from './levels-data.js';
import { Game } from './game.js';
import { icon } from './icons.js';
import { initPWA, isStandalone, isIOS, canPrompt, promptInstall } from './pwa.js';
import { critterAsync } from './gen-client.js';
import { dailyParams, dateKey, streak, lastDays, parseKey } from './daily.js';
import { thumbURL, FigureStage, figureCells } from './figure.js';
import { showReveal, closeReveal, fmtTime, starsHtml } from './reveal.js';
import { sfx } from './sound.js';
import { article, buildPuzzle } from './puzzle.js';
import { RARITY } from './critters.js';
import { VERSION } from './version.js';

const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');
const toastEl = document.getElementById('toast');
let game = null;
let cleanupFns = [];
let rendered = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const MASCOT = {
  id: 'pico',
  name: 'Pico',
  article: '',
  blurb: 'Hatched from the very first puzzle. Says hi to everyone.',
  motion: 'jelly',
  fx: 'hearts',
  pal: { g: '#5BC06C', s: '#3F9A50', o: '#D9577E', b: '#FFB3C7', e: '#2B2233', h: '#FFFFFF', p: '#FF7FA0', k: '#2B2233' },
  art: [
    '...gg..gg...',
    '....gggg....',
    '.....ss.....',
    '...oooooo...',
    '..obbbbbbo..',
    '.obbbbbbbbo.',
    'obbhebbhebbo',
    'obbeebbeebbo',
    'obppbkkbppbo',
    'obbbbbbbbbbo',
    '.obbbbbbbbo.',
    '..oooooooo..',
  ],
};
MASCOT.w = 12;
MASCOT.h = 12;

const LEVELS = new Map();
let serial = 0;
WORLDS.forEach((w, wi) => {
  w.index = wi;
  w.levels.forEach((lv, li) => {
    serial++;
    lv.world = w;
    lv.index = li;
    lv.no = serial;
    LEVELS.set(lv.id, lv);
  });
});
const TOTAL = serial;
const MOSAICS = new Map();
for (const w of WORLDS) for (const m of w.mosaics || []) {
  m.world = w;
  MOSAICS.set(m.id, m);
}

function mosaicDone(m) {
  return m.tiles.filter((id) => db.done[id]).length;
}

function drawMosaic(cv, m, glow = null) {
  const cells = figureCells(m);
  const box = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.max(1, Math.floor((box.width * dpr) / m.w));
  cv.width = m.w * px;
  cv.height = m.h * px;
  const ctx = cv.getContext('2d');
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const t = m.tile;
  for (const id of m.tiles) {
    const lv = LEVELS.get(id);
    const solved = !!db.done[id];
    for (let y = 0; y < t; y++) {
      for (let x = 0; x < t; x++) {
        const gx = lv.tx * t + x;
        const gy = lv.ty * t + y;
        const c = cells.col[gy * m.w + gx];
        if (solved) ctx.fillStyle = c || (dark ? '#262335' : '#FFFFFF');
        else ctx.fillStyle = (x + y) % 2 ? (dark ? '#2C2839' : '#EFE5DA') : dark ? '#302B3F' : '#F5ECE2';
        ctx.fillRect(gx * px, gy * px, px, px);
      }
    }
    if (glow === id) {
      ctx.strokeStyle = '#FFB938';
      ctx.lineWidth = Math.max(2, px * 0.6);
      ctx.strokeRect(lv.tx * t * px + 1, lv.ty * t * px + 1, t * px - 2, t * px - 2);
    }
  }
}

const TIPS = [
  'Each number is a run of filled squares. A <b>5</b> in a row of 5 fills the whole row. <em>Tap or drag to fill.</em>',
  'Numbers come in order, with at least one empty square between runs. Mark empty squares with <b>✕</b> to keep track.',
  'Big numbers overlap: in a row of 5, a <b>4</b> must cover the middle 3 squares, wherever it starts.',
  'Done numbers fade out. A fully faded row or column gets crossed off for you.',
  'Stuck? Tap <b>Hint</b>. It points at a row or column you can work out right now.',
];

const COLOR_TIPS = [
  'Colour puzzle! Each number’s colour is the paint for that run. <em>Pick a colour below, then fill.</em>',
  'Runs of <b>different</b> colours may touch. Runs of the same colour need a gap.',
];

function no(n) {
  return `No. ${String(n).padStart(3, '0')}`;
}

function applyTheme() {
  const t = db.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    if (!m.dataset.media) m.dataset.media = m.media || '';
    if (t === 'auto') {
      m.media = m.dataset.media;
      m.content = m.dataset.media.includes('dark') ? '#16141F' : '#FFF6EE';
    } else {
      m.media = '';
      m.content = bg;
    }
  }
}

function go(path, replace = false) {
  const url = `#/${path}`;
  if (replace) history.replaceState({ app: !!history.state?.app }, '', url);
  else history.pushState({ app: true }, '', url);
  route();
}

function back(parent) {
  if (history.state?.app) history.back();
  else go(parent, true);
}

function cleanup() {
  closeSheet();
  closeReveal();
  if (game) {
    game.save();
    game.destroy();
    game = null;
  }
  cleanupFns.forEach((f) => f());
  cleanupFns = [];
}

const ROUTES = [
  [/^$/, homeScreen],
  [/^journey$/, journeyScreen],
  [/^world\/([\w-]+)$/, worldScreen],
  [/^play\/([\w-]+)$/, playLevel],
  [/^hatch$/, hatchScreen],
  [/^hatch\/play$/, playHatch],
  [/^daily$/, dailyScreen],
  [/^daily\/play\/([\d-]+)$/, playDaily],
  [/^album$/, () => albumScreen('journey')],
  [/^album\/pals$/, () => albumScreen('pals')],
  [/^howto$/, howtoScreen],
  [/^settings$/, settingsScreen],
];

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h === rendered) return;
  rendered = h;
  cleanup();
  window.scrollTo(0, 0);
  for (const [re, fn] of ROUTES) {
    const m = h.match(re);
    if (m) {
      fn(...m.slice(1));
      return;
    }
  }
  homeScreen();
}

function screen(cls, { title = '', parent = null, right = '' }, body) {
  app.innerHTML = `<section class="screen scr-${cls}">
    <header class="topbar">
      ${parent != null ? `<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>` : '<span class="icon-btn ghost"></span>'}
      <h1 class="tb-title">${title}</h1>
      ${right || '<span class="icon-btn ghost"></span>'}
    </header>
    <div class="content">${body}</div>
  </section>`;
  const el = app.firstElementChild;
  el.querySelector('[data-back]')?.addEventListener('click', () => back(parent));
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go]');
    if (t && !t.disabled) {
      sfx.tap();
      go(t.dataset.go);
    }
  });
  return el;
}

let sheetClose = null;

function closeSheet() {
  if (sheetClose) sheetClose();
}

function sheet({ title = '', html = '', actions = [], dismissable = true, cls = '', onClose = null }) {
  closeSheet();
  sheetRoot.innerHTML = `<div class="sheet-backdrop"></div>
    <div class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"></div>
      ${title ? `<h2 class="sheet-title">${title}</h2>` : ''}
      <div class="sheet-body">${html}</div>
      ${actions.length ? `<div class="sheet-actions">${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}" data-i="${i}">${a.label}</button>`).join('')}</div>` : ''}
    </div>`;
  requestAnimationFrame(() => sheetRoot.classList.add('open'));
  const close = () => {
    sheetRoot.classList.remove('open');
    sheetClose = null;
    onClose?.();
    setTimeout(() => {
      if (!sheetRoot.classList.contains('open')) sheetRoot.innerHTML = '';
    }, 300);
  };
  sheetClose = close;
  if (dismissable) sheetRoot.querySelector('.sheet-backdrop').addEventListener('click', close);
  sheetRoot.querySelectorAll('.sheet-actions .btn').forEach((b) =>
    b.addEventListener('click', () => {
      const a = actions[+b.dataset.i];
      sfx.tap();
      if (a.keep) a.onClick?.();
      else {
        close();
        a.onClick?.();
      }
    }),
  );
  return sheetRoot.querySelector('.sheet');
}

let toastTimer = 0;

function toast(msg, { action, onAction, ms = 2800 } = {}) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${msg}</span>${action ? `<button class="toast-btn">${action}</button>` : ''}`;
  toastEl.classList.add('show');
  toastEl.querySelector('.toast-btn')?.addEventListener('click', () => {
    toastEl.classList.remove('show');
    onAction?.();
  });
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function solvedIn(w) {
  return w.levels.filter((l) => db.done[l.id]).length;
}

const GATE = 4;

function unlockNeed(w) {
  return Math.min(GATE, w.levels.length);
}

function openList() {
  const solved = WORLDS.map(solvedIn);
  let furthest = -1;
  solved.forEach((n, i) => {
    if (n > 0) furthest = i;
  });
  const out = [];
  WORLDS.forEach((w, i) => {
    out[i] = i === 0 || !!db.settings.unlockAll || i <= furthest || (out[i - 1] && solved[i - 1] >= unlockNeed(WORLDS[i - 1]));
  });
  return out;
}

function worldOpen(wi) {
  return openList()[wi];
}

function gateLevel(w) {
  if (w.mosaics) return LEVELS.get(w.mosaics[0].tiles[0]);
  const sorted = [...w.levels].sort((a, b) => a.score - b.score);
  return sorted[Math.floor(sorted.length / 2)];
}

const SCORES = [...LEVELS.values()].map((l) => l.score).sort((a, b) => a - b);
const CUTS = [0.2, 0.4, 0.6, 0.8].map((q) => SCORES[Math.floor(q * (SCORES.length - 1))]);

function difficulty(lv) {
  return 1 + CUTS.filter((c) => lv.score > c).length;
}

function pips(lv) {
  const d = difficulty(lv);
  return `<span class="pips" aria-label="Difficulty ${d} of 5">${'<i class="on"></i>'.repeat(d)}${'<i></i>'.repeat(5 - d)}</span>`;
}

const SIZE_CLASSES = [5, 8, 10, 12, 15, 20];

function sizeClass(lv) {
  const m = Math.max(lv.w, lv.h);
  return m <= 6 ? 5 : m <= 9 ? 8 : m <= 11 ? 10 : m <= 13 ? 12 : m <= 16 ? 15 : 20;
}

const ORDER = [...LEVELS.values()].filter((l) => !l.mosaic);

function nextOfSize(cls, after = null) {
  const open = openList();
  const start = after ? ORDER.indexOf(after) + 1 : 0;
  const pool = [...ORDER.slice(start), ...ORDER.slice(0, start)].filter((l) => l !== after && !db.done[l.id] && open[l.world.index] && sizeClass(l) === cls);
  if (!after) return pool[0] || null;
  return pool.find((l) => l.world.mode === after.world.mode) || pool[0] || null;
}

function sizeLeft(cls) {
  const open = openList();
  return ORDER.filter((l) => !db.done[l.id] && open[l.world.index] && sizeClass(l) === cls).length;
}

function nextLevel() {
  for (let wi = 0; wi < WORLDS.length; wi++) {
    if (!worldOpen(wi)) break;
    const lv = WORLDS[wi].levels.find((l) => !db.done[l.id]);
    if (lv) return lv;
  }
  return null;
}

function totalSolved() {
  let n = 0;
  for (const id of Object.keys(db.done)) if (LEVELS.has(id)) n++;
  return n;
}

function mascotCanvas(el, fig = MASCOT, opts = {}) {
  const cv = el.querySelector('canvas');
  if (!cv) return;
  const st = new FigureStage(cv, fig, { fitW: 0.8, fitH: 0.8, fxScale: 0.5, anchorY: 0.52, ...opts });
  st.start();
  cleanupFns.push(() => st.stop());
  return st;
}

function installButtonHtml() {
  if (isStandalone()) return '';
  return `<button class="btn ghost" data-install>${icon('download')} Install app</button>`;
}

function wireInstall(el) {
  el.querySelector('[data-install]')?.addEventListener('click', async () => {
    sfx.tap();
    if (canPrompt()) {
      const ok = await promptInstall();
      if (ok) toast('Installed! Find Picopals on your home screen.');
      return;
    }
    const ios = isIOS();
    sheet({
      title: 'Install Picopals',
      html: ios
        ? `<ol class="steps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button ${icon('share', 'inline')}.</li><li>Choose <b>Add to Home Screen</b>.</li></ol><p>It then runs full-screen and works offline.</p>`
        : `<ol class="steps"><li>Open the browser menu (⋮).</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li></ol><p>It then runs full-screen and works offline.</p>`,
      actions: [{ label: 'Got it', primary: true }],
    });
  });
}

function lastPlay() {
  const l = db.last;
  if (!l) return null;
  if (l.kind === 'level') {
    const lv = LEVELS.get(l.id);
    if (lv && !db.done[lv.id] && db.saves[`lv:${lv.id}`]) return { go: `play/${lv.id}`, label: `${lv.world.name} · ${lv.index + 1}` };
  } else if (l.kind === 'hatch' && db.hatch.current) {
    return { go: 'hatch/play', label: 'Hatchery egg' };
  } else if (l.kind === 'daily' && l.id === dateKey() && !db.daily.history[l.id]) {
    return { go: `daily/play/${l.id}`, label: 'Today’s puzzle' };
  }
  return null;
}

function homeScreen() {
  const cont = lastPlay();
  const nx = nextLevel();
  const solved = totalSolved();
  const dexN = db.hatch.dex.length;
  const today = dateKey();
  const st = streak(db.daily.history, today);
  const playLabel = cont ? `Continue<small>${esc(cont.label)}</small>` : nx ? `${solved ? 'Play' : 'Start playing'}<small>${esc(nx.world.name)} · ${nx.index + 1}</small>` : 'Hatch a pal<small>Every puzzle solved!</small>';
  const playGo = cont ? cont.go : nx ? `play/${nx.id}` : 'hatch';
  const el = screen('home', { right: `<button class="icon-btn" data-go="settings" aria-label="Settings">${icon('settings')}</button>` }, `
    <div class="hero">
      <div class="mascot"><canvas></canvas></div>
      <div class="wordmark">Pico<span>pals</span></div>
      <p class="tagline">Solve the picture. Meet a pal.</p>
    </div>
    <button class="btn primary big play-btn" data-go="${playGo}">${icon('play')}<span>${playLabel}</span></button>
    <div class="modes">
      <button class="mode" data-go="journey" style="--mc:#FF8F5C">${icon('map')}<b>Journey</b><span>${WORLDS.length} worlds · ${solved}/${TOTAL}</span></button>
      <button class="mode" data-go="hatch" style="--mc:#9B7BFF">${icon('egg')}<b>Hatchery</b><span>${dexN ? `${dexN} hatched` : 'Endless new pals'}</span></button>
      <button class="mode" data-go="daily" style="--mc:#3FA7F5">${icon('calendar')}<b>Daily</b><span>${db.daily.history[today] ? 'Done today ✓' : st ? `${st}-day streak` : 'A new pal every day'}</span></button>
      <button class="mode" data-go="album" style="--mc:#FF5C8A">${icon('book')}<b>Album</b><span>${solved + dexN} pals met</span></button>
    </div>
    <div class="home-foot">
      <button class="btn ghost" data-go="howto">${icon('help')} How to play</button>
      ${installButtonHtml()}
    </div>`);
  const m = mascotCanvas(el);
  el.querySelector('.mascot').addEventListener('click', () => {
    sfx.chirp();
    m?.burst();
  });
  wireInstall(el);
}

function thumbsRow(w, n = 5) {
  const solved = w.mosaics ? w.mosaics.filter((m) => mosaicDone(m) === m.tiles.length) : w.levels.filter((l) => db.done[l.id]);
  let out = '';
  for (let i = 0; i < n; i++) {
    const l = solved[i];
    out += l ? `<img src="${thumbURL(l, 48)}" alt="">` : '<i></i>';
  }
  return out;
}

function journeyScreen() {
  const quick = SIZE_CLASSES.map((c) => ({ c, n: sizeLeft(c) })).filter((x) => x.n > 0);
  const el = screen('journey', { title: 'Journey', parent: '' }, `
    ${quick.length ? `<div class="quick"><span>Quick play by size</span><div class="quick-row">${quick.map((x) => `<button class="qp" data-size="${x.c}"><b>${x.c}×${x.c}</b><small>${x.n} left</small></button>`).join('')}</div></div>` : ''}
    <div class="worlds">${WORLDS.map((w, wi) => {
      const open = worldOpen(wi);
      const n = solvedIn(w);
      const pct = Math.round((n / w.levels.length) * 100);
      const sizes = [...new Set(w.levels.map((l) => Math.max(l.w, l.h)))].sort((a, b) => a - b);
      const sz = sizes.length > 1 ? `${sizes[0]}×${sizes[0]} – ${sizes[sizes.length - 1]}×${sizes[sizes.length - 1]}` : `${sizes[0]}×${sizes[0]}`;
      const prev = WORLDS[wi - 1];
      const lockMsg = !open && prev ? (worldOpen(wi - 1) ? `Solve ${Math.max(1, unlockNeed(prev) - solvedIn(prev))} more in ${esc(prev.name)}, or jump ahead` : 'Locked · tap to jump ahead') : '';
      return `<button class="world-card ${open ? '' : 'locked'}" ${open ? `data-go="world/${w.id}"` : `data-locked="${wi}"`} style="--wc:${w.color}">
        <span class="w-num">${open ? wi + 1 : icon('lock')}</span>
        <span class="w-body">
          <b>${esc(w.name)}${w.mode === 'color' ? ' <em class="col-badge">colour</em>' : ''}${n === w.levels.length ? ` <em class="done-badge">${icon('check', 'inline')}</em>` : ''}</b>
          <small>${open ? esc(w.tagline) : lockMsg}</small>
          <span class="w-meta"><span class="bar"><i style="width:${pct}%"></i></span><span class="w-count">${n}/${w.levels.length}</span></span>
          <span class="w-thumbs">${open ? thumbsRow(w) : ''}<em>${sz}</em></span>
        </span>
      </button>`;
    }).join('')}</div>
    ${db.settings.unlockAll ? '' : '<p class="small muted center">Too easy? Tap a locked world and beat its challenge puzzle to jump straight there. Or open everything in Settings.</p>'}`);
  const cur = nextLevel();
  if (cur) el.querySelector(`[data-go="world/${cur.world.id}"]`)?.scrollIntoView({ block: 'center' });
  el.querySelectorAll('[data-size]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.tap();
      const lv = nextOfSize(+b.dataset.size);
      if (lv) go(`play/${lv.id}`);
    }),
  );
  el.querySelectorAll('[data-locked]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.tap();
      const w = WORLDS[+b.dataset.locked];
      const g = gateLevel(w);
      sheet({
        title: `Jump to ${esc(w.name)}?`,
        html: `<p class="center">Beat its challenge puzzle (${g.w}×${g.h}${w.mode === 'color' ? ', colour' : ''}) and ${esc(w.name)} opens, with every world before it.</p>`,
        actions: [
          { label: 'Not now' },
          { label: 'Try the challenge', primary: true, onClick: () => go(`play/${g.id}`) },
          { label: 'Unlock all worlds', onClick: () => { db.settings.unlockAll = true; persist(true); rendered = null; route(); toast('All worlds are open'); } },
        ],
      });
    }),
  );
}

function levelTile(lv) {
  const d = db.done[lv.id];
  const inProgress = !d && db.saves[`lv:${lv.id}`];
  if (d) {
    return `<button class="lvl done" data-go="play/${lv.id}" aria-label="${esc(lv.name)}">
      <img src="${thumbURL(lv, 72)}" alt="">
      <span class="lvl-stars">${starsHtml(d.stars)}</span>
    </button>`;
  }
  return `<button class="lvl ${inProgress ? 'wip' : ''}" data-go="play/${lv.id}" aria-label="Puzzle ${lv.index + 1}">
    <b>${lv.index + 1}</b><small>${lv.w}×${lv.h}</small>${pips(lv)}${inProgress ? '<span class="wip-dot"></span>' : ''}
  </button>`;
}

function worldScreen(id) {
  const w = WORLDS.find((x) => x.id === id);
  if (!w || !worldOpen(w.index)) return go('journey', true);
  const n = solvedIn(w);
  const nextW = WORLDS[w.index + 1];
  const need = unlockNeed(w) - n;
  screen('world', { title: esc(w.name), parent: 'journey' }, `
    <div class="world-head" style="--wc:${w.color}">
      <p class="lead">${esc(w.tagline)}${w.mode === 'color' ? '. <b>Colour puzzles:</b> each number has a colour, and runs of different colours may touch.' : ''}</p>
      <div class="w-meta"><span class="bar"><i style="width:${(n / w.levels.length) * 100}%"></i></span><span class="w-count">${n}/${w.levels.length}</span></div>
      ${nextW && need > 0 && !worldOpen(w.index + 1) ? `<p class="small muted">Solve ${need} more to open <b>${esc(nextW.name)}</b>.</p>` : ''}
    </div>
    ${w.mosaics ? mosaicsHtml(w) : `<div class="levels" style="--wc:${w.color}">${w.levels.map(levelTile).join('')}</div>`}`);
  if (w.mosaics) wireMosaics(app);
}

function mosaicsHtml(w) {
  return `<div class="mosaics">${w.mosaics.map((m, i) => {
    const n = mosaicDone(m);
    const full = n === m.tiles.length;
    const cols = m.w / m.tile;
    return `<div class="mosaic-card ${full ? 'full' : ''}" style="--wc:${w.color}">
      <div class="mosaic-map" data-m="${m.id}" style="aspect-ratio:${m.w}/${m.h}">
        <canvas></canvas>
        ${full ? `<button class="mosaic-all" data-pal="${m.id}" aria-label="${esc(m.name)}"></button>` : `<div class="mosaic-hit" style="grid-template-columns:repeat(${cols},1fr)">${m.tiles.map((id, k) => `<button data-go="play/${id}" class="${db.done[id] ? 'ok' : ''}${db.saves[`lv:${id}`] ? ' wip' : ''}" aria-label="Piece ${k + 1}">${db.done[id] ? '' : k + 1}</button>`).join('')}</div>`}
      </div>
      <div class="mosaic-info"><b>${full ? esc(m.name) : `Mosaic ${i + 1}`}</b><small>${full ? 'Complete' : `${n}/${m.tiles.length} pieces`}</small></div>
    </div>`;
  }).join('')}</div>`;
}

function wireMosaics(root) {
  root.querySelectorAll('.mosaic-map').forEach((el) => drawMosaic(el.querySelector('canvas'), MOSAICS.get(el.dataset.m)));
  root.querySelectorAll('[data-pal]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.tap();
      const m = MOSAICS.get(b.dataset.pal);
      palSheet(m, { tag: [m.world.name, `${m.w}×${m.h} mosaic`] });
    }),
  );
}

function pieceSheet(m, lv, res) {
  const n = mosaicDone(m);
  const next = m.tiles.find((id) => !db.done[id]);
  const s = sheet({
    title: `Piece ${n} of ${m.tiles.length}!`,
    html: `<div class="piece-map" style="aspect-ratio:${m.w}/${m.h}"><canvas></canvas></div>
      <p class="center">Solved in ${fmtTime(res.time)} ${starsHtml(res.stars)}. ${m.tiles.length - n} more to finish the picture.</p>`,
    actions: [
      { label: 'Mosaic', onClick: () => back(`world/${m.world.id}`) },
      ...(next ? [{ label: 'Next piece', primary: true, onClick: () => go(`play/${next}`, true) }] : []),
    ],
  });
  requestAnimationFrame(() => drawMosaic(s.querySelector('canvas'), m, lv.id));
}

function playScreenShell(title, parent, menu) {
  const el = screen('play', { title, parent, right: `<button class="icon-btn" data-menu aria-label="Menu">${icon('settings')}</button>` }, '<div class="game-host"></div>');
  el.querySelector('[data-menu]').addEventListener('click', () => {
    sfx.tap();
    menu();
  });
  return el;
}

function gameMenu(extra = []) {
  const g = game;
  if (!g) return;
  const sw = (key, label, desc) => `<label class="toggle"><span><b>${label}</b><small>${desc}</small></span><input type="checkbox" data-set="${key}" ${db.settings[key] ? 'checked' : ''}><i></i></label>`;
  const s = sheet({
    title: 'Puzzle',
    html: `<div class="settings-list compact">
      ${sw('instantCheck', 'Instant mistake check', 'Wrong squares are corrected at once and cost a star. Off: you only find out at the end.')}
      ${sw('autocross', 'Auto-cross', 'Fill the rest of a finished line with crosses.')}
    </div>`,
    actions: [
      ...extra,
      { label: `${icon('restart')} Restart`, danger: true, onClick: () => confirmRestart() },
      { label: 'Close', primary: true },
    ],
  });
  s.querySelectorAll('[data-set]').forEach((inp) =>
    inp.addEventListener('change', () => {
      db.settings[inp.dataset.set] = inp.checked;
      persist();
      g.refreshAll();
    }),
  );
}

function confirmRestart() {
  sheet({
    title: 'Restart puzzle?',
    html: '<p class="center">Your progress on this grid will be cleared.</p>',
    actions: [
      { label: 'Cancel' },
      { label: 'Restart', danger: true, onClick: () => game?.restart() },
    ],
  });
}

function mountGame(el, opts) {
  const host = el.querySelector('.game-host');
  game = new Game(host, opts);
  return game;
}

function solvedMsg(g, html) {
  g.setMsg(`<span class="done-msg">${icon('check', 'inline')} ${html}</span>`, 'done');
}

function recordStats(res) {
  db.stats.solved = (db.stats.solved || 0) + 1;
  db.stats.time = (db.stats.time || 0) + Math.round(res.time);
}

function playLevel(id) {
  const lv = LEVELS.get(id);
  if (!lv) return go('journey', true);
  const challenge = !worldOpen(lv.world.index);
  if (challenge && gateLevel(lv.world) !== lv) return go('journey', true);
  const w = lv.world;
  db.last = { kind: 'level', id };
  persist();
  const m = lv.mosaic ? MOSAICS.get(lv.mosaic) : null;
  const title = challenge ? `Challenge <span>${esc(w.name)}</span>` : m ? `${esc(w.name)} <span>piece ${m.tiles.indexOf(lv.id) + 1}/${m.tiles.length}</span>` : `${esc(w.name)} <span>${lv.index + 1}/${w.levels.length}</span>`;
  const el = playScreenShell(title, challenge ? 'journey' : `world/${w.id}`, () => gameMenu());
  const firstColor = WORLDS.find((x) => x.mode === 'color');
  const tip = w.index === 0 && lv.index < TIPS.length ? TIPS[lv.index] : w === firstColor && lv.index < COLOR_TIPS.length ? COLOR_TIPS[lv.index] : '';
  const g = mountGame(el, {
    fig: lv,
    mode: w.mode,
    givens: lv.givens,
    saveKey: `lv:${lv.id}`,
    tip,
    onWin: (res, gm) => {
      const prev = db.done[lv.id];
      const openBefore = WORLDS.map((_, i) => worldOpen(i));
      const best = !prev || res.time < prev.t;
      db.done[lv.id] = { t: best ? Math.round(res.time) : prev.t, stars: Math.max(res.stars, prev?.stars || 0), at: Date.now(), n: (prev?.n || 0) + 1 };
      recordStats(res);
      persist(true);
      const unlocked = challenge ? w : WORLDS.find((x, i) => !openBefore[i] && worldOpen(i));
      if (m) {
        solvedMsg(gm, `Solved in ${fmtTime(res.time)}`);
        if (unlocked) setTimeout(() => toast(`New world unlocked: <b>${esc(unlocked.name)}</b>`), 900);
        if (mosaicDone(m) < m.tiles.length) {
          setTimeout(() => pieceSheet(m, lv, res), 500);
          return;
        }
        if (prev) {
          setTimeout(() => pieceSheet(m, lv, res), 500);
          return;
        }
        const nextM = w.mosaics.find((x) => mosaicDone(x) < x.tiles.length);
        showReveal({
          fig: m,
          puzzle: buildPuzzle(m, w.mode),
          from: null,
          color: w.color,
          tag: [w.name, `${m.w}×${m.h} mosaic`],
          stats: res,
          note: 'Mosaic complete!',
          actions: [nextM ? { label: 'Next mosaic', icon: 'play', primary: true, onClick: () => go(`play/${nextM.tiles.find((id) => !db.done[id])}`, true) } : { label: w.name, primary: true, onClick: () => back(`world/${w.id}`) }],
        });
        return;
      }
      const nxt = w.levels.slice(lv.index + 1).find((l) => !db.done[l.id]) || w.levels.find((l) => !db.done[l.id]) || nextLevel();
      const actions = [];
      if (unlocked) actions.push({ label: `Open ${unlocked.name}`, primary: true, onClick: () => go(`world/${unlocked.id}`, true) });
      const cls = sizeClass(lv);
      const same = nextOfSize(cls, lv);
      if (nxt && nxt.id !== lv.id) actions.push({ label: same === nxt ? `Next ${cls}×${cls}` : 'Next', icon: 'play', primary: !unlocked, onClick: () => go(`play/${nxt.id}`, true) });
      else actions.push({ label: w.name, primary: !unlocked, onClick: () => back(`world/${w.id}`) });
      if (same && same !== nxt) actions.push({ label: `Next ${cls}×${cls}`, onClick: () => go(`play/${same.id}`, true) });
      solvedMsg(gm, `Solved in ${fmtTime(res.time)}`);
      showReveal({
        fig: lv,
        puzzle: gm.P,
        from: res.gridRect,
        color: w.color,
        tag: [no(lv.no), w.name],
        stats: { ...res, best: !!prev && best },
        note: unlocked ? `New world unlocked: ${unlocked.name}!` : !prev && solvedIn(w) === w.levels.length ? `${w.name} complete! All ${w.levels.length} pals found.` : '',
        actions,
      });
      if (unlocked) setTimeout(() => toast(`New world unlocked: <b>${esc(unlocked.name)}</b>`), 2600);
    },
  });
  if (db.done[lv.id] && !db.saves[`lv:${lv.id}`]) g.setMsg(`Solved before in ${fmtTime(db.done[lv.id].t)}. Play it again for a better time!`);
}

const SIZES = [
  { id: 10, label: 'Small', sub: '10×10' },
  { id: 15, label: 'Medium', sub: '15×15' },
  { id: 20, label: 'Large', sub: '20×20' },
];

function seg(name, options, value) {
  return `<div class="seg" data-seg="${name}">${options.map((o) => `<button class="${String(o.id) === String(value) ? 'on' : ''}" data-v="${o.id}"><b>${o.label}</b>${o.sub ? `<small>${o.sub}</small>` : ''}</button>`).join('')}</div>`;
}

function dexFigure(entry) {
  return critterAsync(entry.seed, entry.size, entry.mode);
}

function hatchScreen() {
  const opts = db.hatch.opts;
  const cur = db.hatch.current;
  const recent = db.hatch.dex.slice(-8).reverse();
  const el = screen('hatch', { title: 'Hatchery', parent: '' }, `
    <div class="card egg-card">
      <div class="egg-wrap"><div class="egg"><i></i></div></div>
      <p class="lead center">Every puzzle here is brand new. Solve it and a one-of-a-kind pal hatches. Some are <b class="txt-rare">rare</b>…</p>
    </div>
    ${cur ? `<button class="btn primary big" data-go="hatch/play">${icon('play')}<span>Continue egg<small>${cur.size}×${cur.size} · ${cur.mode === 'color' ? 'colour' : 'classic'}</small></span></button>` : ''}
    <div class="card">
      <h3>Size</h3>
      ${seg('size', SIZES, opts.size)}
      <h3 class="mt">Style</h3>
      ${seg('mode', [{ id: 'mono', label: 'Classic', sub: 'black & white' }, { id: 'color', label: 'Colour', sub: 'coloured clues' }], opts.mode)}
    </div>
    <button class="btn ${cur ? '' : 'primary'} big" data-hatch>${icon('egg')}<span>${cur ? 'New egg' : 'Hatch an egg'}<small>${opts.size}×${opts.size} · ${opts.mode === 'color' ? 'colour' : 'classic'}</small></span></button>
    ${recent.length ? `<h3 class="section">Recent pals <button class="link" data-go="album/pals">See all ${db.hatch.dex.length}</button></h3><div class="recent">${recent.map((e, i) => `<button class="recent-pal" data-dex="${db.hatch.dex.length - 1 - i}"><img alt=""></button>`).join('')}</div>` : ''}
  `);
  el.querySelectorAll('.seg').forEach((sg) =>
    sg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      sfx.tap();
      const k = sg.dataset.seg;
      opts[k] = k === 'size' ? +b.dataset.v : b.dataset.v;
      persist();
      rendered = null;
      route();
    }),
  );
  el.querySelector('[data-hatch]').addEventListener('click', () => {
    sfx.tap();
    const start = () => {
      db.hatch.current = { seed: (Math.random() * 2 ** 31) >>> 0, size: opts.size, mode: opts.mode };
      persist(true);
      go('hatch/play');
    };
    if (cur && db.saves['hatch']) {
      sheet({ title: 'Start a new egg?', html: '<p class="center">Your current egg will be lost.</p>', actions: [{ label: 'Keep it' }, { label: 'New egg', danger: true, onClick: start }] });
    } else start();
  });
  el.querySelectorAll('[data-dex]').forEach((b) => {
    const e = db.hatch.dex[+b.dataset.dex];
    dexFigure(e).then(({ fig }) => {
      b.querySelector('img').src = thumbURL(fig, 64, fig.id);
      b.classList.add(`rar-${fig.rarity}`);
    });
    b.addEventListener('click', () => {
      sfx.tap();
      dexFigure(e).then(({ fig }) => palSheet(fig, { tag: [RARITY.find((r) => r.id === fig.rarity)?.label || '', `${fig.size}×${fig.size}`], sub: `Hatched ${new Date(e.at).toLocaleDateString()}` }));
    });
  });
}

function loadingHtml(msg) {
  return `<div class="loading"><div class="egg wobble"><i></i></div><p>${msg}</p></div>`;
}

async function playHatch() {
  const cur = db.hatch.current;
  if (!cur) return go('hatch', true);
  db.last = { kind: 'hatch' };
  persist();
  const el = playScreenShell(`Hatchery <span>${cur.size}×${cur.size}</span>`, 'hatch', () => gameMenu());
  const host = el.querySelector('.game-host');
  host.innerHTML = loadingHtml('Warming the egg…');
  const token = rendered;
  const { fig, givens } = await critterAsync(cur.seed, cur.size, cur.mode);
  if (rendered !== token) return;
  mountGame(el, {
    fig,
    mode: cur.mode,
    givens,
    saveKey: 'hatch',
    onWin: (res, gm) => {
      const entry = { seed: cur.seed, size: cur.size, mode: cur.mode, at: Date.now(), t: Math.round(res.time), stars: res.stars, rarity: fig.rarity };
      db.hatch.dex.push(entry);
      db.hatch.current = null;
      recordStats(res);
      persist(true);
      const rar = RARITY.find((r) => r.id === fig.rarity);
      solvedMsg(gm, `Hatched in ${fmtTime(res.time)}`);
      showReveal({
        fig,
        puzzle: gm.P,
        from: res.gridRect,
        color: rarityColor(fig.rarity),
        tag: [`Pal #${db.hatch.dex.length}`, `${cur.size}×${cur.size}`],
        rarity: rar,
        stats: res,
        actions: [
          { label: 'Album', onClick: () => go('album/pals', true) },
          {
            label: 'Hatch another',
            icon: 'egg',
            primary: true,
            onClick: () => {
              db.hatch.current = { seed: (Math.random() * 2 ** 31) >>> 0, size: cur.size, mode: cur.mode };
              persist(true);
              rendered = null;
              go('hatch/play', true);
            },
          },
        ],
      });
    },
  });
}

function rarityColor(r) {
  return { common: '#8FD19E', uncommon: '#6FB7FF', rare: '#B98CFF', legendary: '#FFC940' }[r] || '#8FD19E';
}

function dailyScreen() {
  const today = dateKey();
  const p = dailyParams(today);
  const doneToday = db.daily.history[today];
  const days = lastDays(7);
  const st = streak(db.daily.history, today);
  const el = screen('daily', { title: 'Daily', parent: '' }, `
    <div class="card daily-card">
      <div class="daily-top">
        <div class="daily-date"><b>${parseKey(today).toLocaleDateString(undefined, { weekday: 'long' })}</b><span>${parseKey(today).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</span></div>
        <div class="streak ${st ? 'on' : ''}">${icon('flame')}<b>${st}</b><small>day${st === 1 ? '' : 's'}</small></div>
      </div>
      <h3>${esc(p.name)}</h3>
      <p class="lead">${p.size}×${p.size} · ${p.mode === 'color' ? 'colour' : 'classic'}. Same pal for everyone today.</p>
      <div class="daily-pal">${doneToday ? '<img alt="">' : '<div class="egg"><i></i></div>'}</div>
      <button class="btn primary big" data-go="daily/play/${today}">${icon('play')}<span>${doneToday ? 'Play again' : db.saves[`daily:${today}`] ? 'Continue' : 'Play today’s puzzle'}${doneToday ? `<small>Solved in ${fmtTime(doneToday.t)}</small>` : ''}</span></button>
    </div>
    <h3 class="section">This week</h3>
    <div class="week">${days.map((k) => {
      const d = parseKey(k);
      const h = db.daily.history[k];
      return `<div class="day ${h ? 'done' : ''} ${k === today ? 'today' : ''}" data-day="${k}"><small>${d.toLocaleDateString(undefined, { weekday: 'narrow' })}</small>${h ? '<img alt="">' : `<b>${d.getDate()}</b>`}</div>`;
    }).join('')}</div>
    <p class="small muted center">Missed a day? Past puzzles stay playable here. A streak counts days in a row.</p>
  `);
  if (doneToday) {
    critterAsync(p.seed, p.size, p.mode).then(({ fig }) => {
      const img = el.querySelector('.daily-pal img');
      if (img) img.src = thumbURL(fig, 120, fig.id);
    });
  }
  el.querySelectorAll('.day').forEach((d) => {
    const k = d.dataset.day;
    const pp = dailyParams(k);
    if (db.daily.history[k]) {
      critterAsync(pp.seed, pp.size, pp.mode).then(({ fig }) => {
        const img = d.querySelector('img');
        if (img) img.src = thumbURL(fig, 40, fig.id);
      });
    }
    d.addEventListener('click', () => {
      sfx.tap();
      go(`daily/play/${k}`);
    });
  });
}

async function playDaily(key) {
  const p = dailyParams(key);
  if (key > dateKey()) return go('daily', true);
  db.last = { kind: 'daily', id: key };
  persist();
  const el = playScreenShell(`${esc(p.name)}`, 'daily', () => gameMenu());
  const host = el.querySelector('.game-host');
  host.innerHTML = loadingHtml('Fetching today’s egg…');
  const token = rendered;
  const { fig, givens } = await critterAsync(p.seed, p.size, p.mode);
  if (rendered !== token) return;
  mountGame(el, {
    fig,
    mode: p.mode,
    givens,
    saveKey: `daily:${key}`,
    onWin: (res, gm) => {
      const prev = db.daily.history[key];
      if (!prev || res.time < prev.t) db.daily.history[key] = { t: Math.round(res.time), stars: res.stars, at: Date.now() };
      recordStats(res);
      persist(true);
      const st = streak(db.daily.history);
      solvedMsg(gm, `Solved in ${fmtTime(res.time)}`);
      showReveal({
        fig,
        puzzle: gm.P,
        from: res.gridRect,
        color: '#6FB7FF',
        tag: [parseKey(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), `${st}-day streak`],
        rarity: RARITY.find((r) => r.id === fig.rarity),
        stats: res,
        actions: [
          { label: 'Share', icon: 'share', onClick: () => shareDaily(key, res, fig) },
          { label: 'Done', primary: true, onClick: () => back('daily') },
        ],
      });
    },
  });
}

async function shareDaily(key, res, fig) {
  const text = `Picopals daily ${key}: I met ${article(fig)} ${fig.name} in ${fmtTime(res.time)} ${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)}\n${location.origin}${location.pathname}`;
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Could not share');
  }
}

function palSheet(fig, { tag = [], sub = '', play = null } = {}) {
  const s = sheet({
    cls: 'pal-sheet',
    html: `<div class="pal-stage"><canvas></canvas></div>
      <h2 class="pal-name">${esc(fig.name)}</h2>
      <div class="rv-tags">${tag.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <p class="pal-blurb">${esc(fig.blurb || '')}</p>
      ${sub ? `<p class="small muted center">${sub}</p>` : ''}`,
    actions: [...(play ? [{ label: 'Play again', onClick: play }] : []), { label: 'Close', primary: true }],
    onClose: () => st?.stop(),
  });
  const cv = s.querySelector('canvas');
  let st = null;
  requestAnimationFrame(() => {
    st = new FigureStage(cv, fig, { fitW: 0.6, fitH: 0.7, maxCell: 18, fxScale: 0.7, anchorY: 0.5 });
    st.start();
    cv.addEventListener('click', () => {
      sfx.chirp();
      st.burst();
    });
  });
}

function albumScreen(tab) {
  const solved = totalSolved();
  const dex = db.hatch.dex;
  const body =
    tab === 'journey'
      ? WORLDS.map((w, wi) => {
          const n = solvedIn(w);
          if (w.mosaics) {
            const full = w.mosaics.filter((m) => mosaicDone(m) === m.tiles.length).length;
            return `<div class="album-world"><h3 class="section" style="--wc:${w.color}"><span class="dot"></span>${esc(w.name)} <small>${full}/${w.mosaics.length}</small></h3>
            <div class="album-grid">${w.mosaics.map((m) => (mosaicDone(m) === m.tiles.length ? `<button class="al" data-mo="${m.id}"><img src="${thumbURL(m, 72)}" alt="${esc(m.name)}"></button>` : `<span class="al unk">${worldOpen(wi) ? `${mosaicDone(m)}/${m.tiles.length}` : icon('lock')}</span>`)).join('')}</div></div>`;
          }
          return `<div class="album-world"><h3 class="section" style="--wc:${w.color}"><span class="dot"></span>${esc(w.name)} <small>${n}/${w.levels.length}</small></h3>
          <div class="album-grid">${w.levels.map((l) => (db.done[l.id] ? `<button class="al" data-lv="${l.id}"><img src="${thumbURL(l, 56)}" alt="${esc(l.name)}"></button>` : `<span class="al unk">${worldOpen(wi) ? '?' : icon('lock')}</span>`)).join('')}</div></div>`;
        }).join('')
      : dex.length
        ? `<div class="rar-counts">${RARITY.map((r) => `<span class="rar rar-${r.id}" data-rc="${r.id}">${r.label} <b>${dex.filter((e) => e.rarity === r.id).length}</b></span>`).join('')}</div><div class="album-grid pals">${dex
            .map((e, i) => `<button class="al" data-dex="${i}"><img alt=""></button>`)
            .reverse()
            .join('')}</div>`
        : `<div class="card center empty"><p>No hatchlings yet.</p><button class="btn primary" data-go="hatch">${icon('egg')} Go to the Hatchery</button></div>`;
  const el = screen('album', { title: 'Album', parent: '' }, `
    <div class="tabs"><button class="${tab === 'journey' ? 'on' : ''}" data-tab="album">Journey <small>${solved}/${TOTAL}</small></button><button class="${tab === 'pals' ? 'on' : ''}" data-tab="album/pals">Hatchery <small>${dex.length}</small></button></div>
    ${body}`);
  el.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.tap();
      go(b.dataset.tab, true);
    }),
  );
  el.querySelectorAll('[data-lv]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.tap();
      const lv = LEVELS.get(b.dataset.lv);
      const d = db.done[lv.id];
      palSheet(lv, { tag: [no(lv.no), lv.world.name], sub: `${starsHtml(d.stars)} Best ${fmtTime(d.t)}`, play: () => go(`play/${lv.id}`) });
    }),
  );
  el.querySelectorAll('[data-mo]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.tap();
      const m = MOSAICS.get(b.dataset.mo);
      palSheet(m, { tag: [m.world.name, `${m.w}×${m.h} mosaic`] });
    }),
  );
  const counts = {};
  el.querySelectorAll('[data-dex]').forEach((b) => {
    const e = dex[+b.dataset.dex];
    dexFigure(e).then(({ fig }) => {
      b.querySelector('img').src = thumbURL(fig, 56, fig.id);
      b.classList.add(`rar-${fig.rarity}`);
      if (!e.rarity) {
        e.rarity = fig.rarity;
        persist();
      }
      counts[fig.rarity] = (counts[fig.rarity] || 0) + 1;
      for (const r of RARITY) {
        const c = el.querySelector(`[data-rc="${r.id}"] b`);
        if (c) c.textContent = dex.filter((x) => x.rarity === r.id).length;
      }
    });
    b.addEventListener('click', () => {
      sfx.tap();
      dexFigure(e).then(({ fig }) => palSheet(fig, { tag: [RARITY.find((r) => r.id === fig.rarity)?.label || '', `${fig.size}×${fig.size}`], sub: `Hatched ${new Date(e.at).toLocaleDateString()} in ${fmtTime(e.t)}` }));
    });
  });
}

function demoGrid(rows, clueRows, clueCols, opts = {}) {
  const w = rows[0].length;
  const cells = rows.join('').split('').map((c) => `<b class="${c === '#' ? 'f' : c === 'x' ? 'x' : ''}"></b>`).join('');
  return `<div class="demo" style="--w:${w}">
    <span></span>
    <div class="d-cols">${clueCols.map((c) => `<div>${c.map((n) => `<i>${n}</i>`).join('')}</div>`).join('')}</div>
    <div class="d-rows">${clueRows.map((c) => `<div>${c.map((n) => `<i>${n}</i>`).join('')}</div>`).join('')}</div>
    <div class="d-grid">${cells}</div>
  </div>`;
}

function howtoScreen() {
  screen('howto', { title: 'How to play', parent: '' }, `
    <div class="card howto-card">
      ${demoGrid(['.###.', '#####', '..#..'], [[3], [5], [1]], [[1], [2], [3], [2], [1]])}
      <div><h3>Numbers are runs</h3><p>Each number is a run of filled squares in that row or column, in order. Runs of the same colour need at least one empty square between them.</p></div>
    </div>
    <div class="card howto-card">
      ${demoGrid(['x##x#'], [[2, 1]], [[], [1], [1], [], [1]])}
      <div><h3>Cross what stays empty</h3><p>Mark squares you know are empty with a cross. Crosses are only notes, but they make the logic much easier.</p></div>
    </div>
    <div class="card">
      <h3>Controls</h3>
      <ul class="bullets">
        <li><b>Tap or drag</b> to fill. A drag locks to one row or column.</li>
        <li><b>Pick ✕</b> at the bottom to cross instead. On a computer, right-click crosses.</li>
        <li><b>Start a drag on a filled square</b> to clear squares.</li>
        <li><b>Pinch</b> or tap <b>Zoom</b> on big grids. Drag the numbers to scroll.</li>
        <li><b>Hint</b> points at a line you can solve. Tap it again to apply it.</li>
        <li><b>Mistakes</b> are not shown while you play. If the grid looks finished but something is off, a small note says so; tap <b>Show me</b> to see where.</li>
        <li><b>Stars:</b> 3 for no hints (and no mistakes, if you turn on instant checking).</li>
      </ul>
    </div>
    <div class="card">
      <h3>Colour puzzles</h3>
      <p>In colour worlds each number has a colour. Paint with that colour. Runs of <b>different</b> colours may touch with no gap.</p>
    </div>
    <div class="card">
      <h3>Modes</h3>
      <ul class="bullets">
        <li><b>Journey:</b> ${WORLDS.length} themed worlds, ${TOTAL} hand-drawn pals. Solve half of a world to open the next.</li>
        <li><b>Hatchery:</b> endless new puzzles. Each one hatches a unique pal, some of them rare.</li>
        <li><b>Daily:</b> one pal a day, the same for everyone. Keep your streak going.</li>
        <li><b>Album:</b> every pal you met. Tap one to watch it again.</li>
      </ul>
    </div>
  `);
}

function settingsScreen() {
  const s = db.settings;
  const sw = (key, label, desc) => `<label class="toggle"><span><b>${label}</b><small>${desc}</small></span><input type="checkbox" data-set="${key}" ${s[key] ? 'checked' : ''}><i></i></label>`;
  const el = screen('settings', { title: 'Settings', parent: '' }, `
    <div class="card">
      <h3>Theme</h3>
      ${seg('theme', [{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }], s.theme)}
    </div>
    <div class="card settings-list">
      ${sw('instantCheck', 'Instant mistake check', 'Wrong squares are corrected at once and cost a star. Off (classic): the game only tells you at the end if something is off.')}
      ${sw('autocross', 'Auto-cross', 'Fill the rest of a finished line with crosses.')}
      ${sw('lefty', 'Left-handed', 'Put the paint buttons on the right.')}
      ${sw('sound', 'Sound', 'Soft clicks and a happy jingle.')}
      ${sw('vibrate', 'Vibration', 'Tiny taps on supported phones.')}
    </div>
    <div class="card">
      <h3>Progress</h3>
      <p>${totalSolved()} of ${TOTAL} journey pals, ${db.hatch.dex.length} hatched, ${Object.keys(db.daily.history).length} dailies. Total play time ${fmtTime(db.stats.time || 0)}.</p>
      <div class="row wrap">
        <button class="btn" data-unlock>${db.settings.unlockAll ? 'Lock worlds again' : 'Unlock all worlds'}</button>
        <button class="btn danger" data-reset>Reset progress</button>
      </div>
    </div>
    <div class="card">
      <h3>Backup</h3>
      <p>Progress lives in this browser. Windows and tabs share it safely, and nothing is ever overwritten with older progress. To move it to another device, or before clearing browser data, keep a backup code. Restoring only adds progress.</p>
      <div class="row wrap">
        <button class="btn" data-export>${icon('share')} Copy code</button>
        <button class="btn" data-file>${icon('download')} Save file</button>
        <button class="btn" data-import>${icon('refresh')} Restore</button>
      </div>
    </div>
    <p class="small muted center">Picopals · works offline · no ads, no tracking<br>Version ${VERSION}</p>
  `);
  el.querySelectorAll('[data-set]').forEach((inp) =>
    inp.addEventListener('change', () => {
      s[inp.dataset.set] = inp.checked;
      persist();
      sfx.tap();
    }),
  );
  el.querySelector('[data-seg="theme"]').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    s.theme = b.dataset.v;
    persist();
    applyTheme();
    el.querySelectorAll('[data-seg="theme"] button').forEach((x) => x.classList.toggle('on', x === b));
  });
  el.querySelector('[data-export]').addEventListener('click', async () => {
    const code = exportCode();
    try {
      await navigator.clipboard.writeText(code);
      toast('Backup code copied. Paste it somewhere safe.');
    } catch {
      sheet({ title: 'Backup code', html: `<textarea class="code" readonly>${esc(code)}</textarea><p class="small center">Select all and copy it somewhere safe.</p>`, actions: [{ label: 'Done', primary: true }] });
    }
  });
  el.querySelector('[data-file]').addEventListener('click', () => {
    const blob = new Blob([exportCode()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `picopals-backup-${dateKey()}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  });
  el.querySelector('[data-import]').addEventListener('click', () => {
    const sh = sheet({
      title: 'Restore progress',
      html: `<textarea class="code" placeholder="Paste a backup code (PICOPALS1:…)"></textarea>
        <label class="btn ghost file-pick">${icon('download')} Or choose a backup file<input type="file" accept=".txt,text/plain" hidden></label>
        <p class="small center">Restoring merges the backup with what you have. Nothing gets lost.</p>`,
      actions: [{ label: 'Cancel' }, { label: 'Restore', primary: true, keep: true, onClick: () => doImport(sh.querySelector('textarea').value) }],
    });
    sh.querySelector('input[type=file]').addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (f) doImport(await f.text());
    });
  });
  function doImport(text) {
    try {
      importCode(text);
      closeSheet();
      toast('Progress restored');
      rendered = null;
      route();
    } catch {
      toast('That does not look like a Picopals backup');
    }
  }
  el.querySelector('[data-unlock]').addEventListener('click', () => {
    s.unlockAll = !s.unlockAll;
    persist();
    rendered = null;
    route();
    toast(s.unlockAll ? 'All worlds are open' : 'Worlds unlock step by step again');
  });
  el.querySelector('[data-reset]').addEventListener('click', () => {
    sheet({
      title: 'Reset all progress?',
      html: '<p class="center">Solved pals, hatchlings, streaks and saved grids will be deleted. Settings stay.</p>',
      actions: [{ label: 'Cancel' }, { label: 'Reset', danger: true, onClick: () => { resetAll(); toast('Progress reset'); rendered = null; route(); } }],
    });
  });
}

onExternalChange(() => {
  applyTheme();
  if (!/^(play|hatch\/play|daily\/play)/.test(rendered || '') && !sheetClose) {
    rendered = null;
    route();
  }
});
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
if (isStandalone()) navigator.storage?.persist?.().catch(() => {});
initPWA({
  onUpdate: () => toast('Picopals was updated', { action: 'Reload', onAction: () => location.reload(), ms: 12000 }),
});
window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);
route();

window.__picopals = { db, get game() { return game; }, VERSION, WORLDS, LEVELS };

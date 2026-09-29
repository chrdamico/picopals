import { lineMatches, clueDone, lineSolve, single, valueOf, fullMask } from './nonogram.js';
import { buildPuzzle, signature } from './puzzle.js';
import { db, persist } from './store.js';
import { sfx, buzz } from './sound.js';
import { icon } from './icons.js';
import { figureCells } from './figure.js';

function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? '#1F1D2B' : '#FFFFFF';
}

const ENC = '.x123456789';
const enc = (v) => ENC[v + 1];
const dec = (c) => ENC.indexOf(c) - 1;

export class Game {
  constructor(host, opts) {
    this.host = host;
    this.opts = opts;
    this.fig = opts.fig;
    this.mode = opts.mode;
    this.P = buildPuzzle(opts.fig, opts.mode);
    const { w, h } = this.P;
    this.w = w;
    this.h = h;
    this.N = w * h;
    this.givens = opts.givens || [];
    this.sig = signature(opts.fig, opts.mode, this.givens);
    this.v = new Int8Array(this.N).fill(-1);
    this.lock = new Uint8Array(this.N);
    for (const i of this.givens) {
      this.v[i] = this.P.sol[i];
      this.lock[i] = 1;
    }
    this.hist = [];
    this.fut = [];
    this.tool = 'fill';
    this.color = 1;
    this.mistakes = 0;
    this.hints = 0;
    this.elapsed = 0;
    this.runningSince = 0;
    this.solved = false;
    this.dead = false;
    this.zoom = 1;
    this.pointers = new Map();
    this.stroke = null;
    this.pinch = null;
    this.pendingHint = null;
    this.msgDefault = opts.tip || '';
    this.lineState = new Array(w + h).fill(null);
    this.load();
    this.render();
    this.refreshAll();
    this.resume();
  }

  get assist() {
    return !!db.settings.assist;
  }

  load() {
    const s = this.opts.saveKey && db.saves[this.opts.saveKey];
    if (!s || s.sig !== this.sig || !s.v || s.v.length !== this.N) return;
    for (let i = 0; i < this.N; i++) {
      if (this.lock[i] === 1) continue;
      this.v[i] = dec(s.v[i]);
      if (s.l && s.l[i] === '2') this.lock[i] = 2;
    }
    this.elapsed = s.t || 0;
    this.mistakes = s.m || 0;
    this.hints = s.h || 0;
  }

  save() {
    if (!this.opts.saveKey || this.solved || this.dead) return;
    const touched = this.v.some((x, i) => x !== -1 && !this.lock[i]) || this.lock.some((x) => x === 2);
    if (!touched) {
      delete db.saves[this.opts.saveKey];
      persist();
      return;
    }
    db.saves[this.opts.saveKey] = {
      sig: this.sig,
      v: Array.from(this.v, enc).join(''),
      l: Array.from(this.lock, (x) => String(x)).join(''),
      t: Math.round(this.time()),
      m: this.mistakes,
      h: this.hints,
      at: Date.now(),
    };
    persist();
  }

  time() {
    return this.elapsed + (this.runningSince ? performance.now() - this.runningSince : 0);
  }

  resume() {
    if (this.solved || this.runningSince) return;
    this.runningSince = performance.now();
    this.tick = setInterval(() => this.updateHud(), 1000);
    this.updateHud();
  }

  pause() {
    if (this.runningSince) this.elapsed += performance.now() - this.runningSince;
    this.runningSince = 0;
    clearInterval(this.tick);
  }

  destroy() {
    this.dead = true;
    this.pause();
    this.ro?.disconnect();
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVis);
  }

  render() {
    const { w, h, P } = this;
    const color = this.mode === 'color';
    const vars = P.colors.map((c, k) => `--k${k + 1}:${c};--kt${k + 1}:${textOn(c)}`).join(';');
    const clue = (b) => (color ? `<i style="--cb:${P.colors[b[1] - 1]};--ct:${textOn(P.colors[b[1] - 1])}">${b[0]}</i>` : `<i>${b[0]}</i>`);
    const cols = P.ng.cols.map((c, x) => `<div class="cc${x % 5 === 4 && x < w - 1 ? ' g5' : ''}">${c.length ? c.map(clue).join('') : '<i class="zero">0</i>'}</div>`).join('');
    const rows = P.ng.rows.map((c, y) => `<div class="rc${y % 5 === 4 && y < h - 1 ? ' g5' : ''}">${c.length ? c.map(clue).join('') : '<i class="zero">0</i>'}</div>`).join('');
    let cells = '';
    for (let i = 0; i < this.N; i++) cells += '<b></b>';
    let lines = '';
    for (let x = 5; x < w; x += 5) lines += `<s class="gl gv" style="--p:${x}"></s>`;
    for (let y = 5; y < h; y += 5) lines += `<s class="gl gh" style="--p:${y}"></s>`;
    const swatches = color
      ? P.colors.map((c, k) => `<button class="sw-btn" data-color="${k + 1}" style="--c:${c}" aria-label="Colour ${k + 1}"><kbd>${k + 1}</kbd></button>`).join('')
      : `<button class="sw-btn mono" data-color="1" aria-label="Fill">${icon('square')}</button>`;
    this.host.innerHTML = `<div class="game ${color ? 'is-color' : 'is-mono'}${db.settings.lefty ? ' lefty' : ''}" style="${vars}">
      <div class="hud">
        <span class="hud-i hud-time">${icon('clock', 'inline')} <b>0:00</b></span>
        <span class="hud-i hud-mist" title="Mistakes">${icon('cross', 'inline')} <b>0</b></span>
        <span class="hud-i hud-prog"><i><u></u></i><b>0%</b></span>
      </div>
      <div class="board-wrap">
        <div class="board-scroll">
          <div class="nono">
            <div class="corner"><canvas class="pv"></canvas></div>
            <div class="colclues">${cols}</div>
            <div class="rowclues">${rows}</div>
            <div class="grid">${cells}${lines}<s class="hl hl-r"></s><s class="hl hl-c"></s></div>
          </div>
        </div>
      </div>
      <div class="msg"></div>
      <div class="controls">
        <div class="palette">${swatches}<button class="sw-btn cross" data-tool="cross" aria-label="Cross">${icon('cross')}</button></div>
        <div class="toolbar">
          <button class="tb" data-act="undo" aria-label="Undo">${icon('undo')}<span>Undo</span></button>
          <button class="tb" data-act="redo" aria-label="Redo">${icon('redo')}<span>Redo</span></button>
          <button class="tb" data-act="hint" aria-label="Hint">${icon('bulb')}<span>Hint</span></button>
          <button class="tb" data-act="zoom" aria-label="Zoom">${icon('zoomIn')}<span>Zoom</span></button>
        </div>
      </div>
    </div>`;
    const el = this.host.firstElementChild;
    this.el = el;
    this.wrap = el.querySelector('.board-wrap');
    this.scroll = el.querySelector('.board-scroll');
    this.nono = el.querySelector('.nono');
    this.grid = el.querySelector('.grid');
    this.cellEls = Array.from(this.grid.querySelectorAll('b'));
    this.colEls = Array.from(el.querySelectorAll('.cc'));
    this.rowEls = Array.from(el.querySelectorAll('.rc'));
    this.hlR = el.querySelector('.hl-r');
    this.hlC = el.querySelector('.hl-c');
    this.msgEl = el.querySelector('.msg');
    this.pv = el.querySelector('.pv');
    this.timeEl = el.querySelector('.hud-time b');
    this.mistEl = el.querySelector('.hud-mist');
    this.progEl = el.querySelector('.hud-prog');
    el.querySelector('.palette').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tool === 'cross') this.setTool('cross');
      else this.setTool('fill', +b.dataset.color);
      sfx.tap();
    });
    el.querySelector('.toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const a = b.dataset.act;
      if (a === 'undo') this.undo();
      else if (a === 'redo') this.redo();
      else if (a === 'hint') this.hint();
      else if (a === 'zoom') this.toggleZoom();
    });
    this.bindPointer();
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey);
    this.onVis = () => {
      if (document.visibilityState === 'hidden') {
        this.pause();
        this.save();
      } else if (!this.solved) this.resume();
    };
    document.addEventListener('visibilitychange', this.onVis);
    this.layout();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.wrap);
    this.setTool('fill', 1);
    this.setMsg(this.msgDefault);
  }

  get msgDefault() {
    return this._tip ? `${icon('sparkle', 'msg-i')}<span>${this._tip}</span>` : '';
  }

  set msgDefault(t) {
    this._tip = t;
  }

  measure(cs) {
    const { P } = this;
    const color = this.mode === 'color';
    const fs = Math.max(9, Math.min(18, Math.round(cs * 0.6)));
    const unit = (n) => (n >= 10 ? fs * 1.25 : fs * 0.72) + (color ? 6 : 3);
    let rowW = 0;
    for (const c of P.ng.rows) rowW = Math.max(rowW, c.reduce((s, b) => s + unit(b[0]) + (color ? 2 : 0), 0));
    let colN = 1;
    for (const c of P.ng.cols) colN = Math.max(colN, c.length);
    const colH = colN * (fs * 1.18 + (color ? 2 : 0));
    return { fs, rowW: Math.ceil(rowW + 8), colH: Math.ceil(colH + 6) };
  }

  layout() {
    if (!this.wrap.isConnected) return;
    const avW = this.wrap.clientWidth;
    const avH = this.wrap.clientHeight;
    if (!avW || !avH) return;
    const { w, h } = this;
    let base = 8;
    for (let cs = 46; cs >= 8; cs--) {
      const m = this.measure(cs);
      const tw = m.rowW + w * (cs + 1) + 3;
      const th = m.colH + h * (cs + 1) + 3;
      if (tw <= avW && th <= avH) {
        base = cs;
        break;
      }
    }
    const z = this.zoom;
    for (let k = 0; k < 12 && base > 8; k++) {
      this.baseCs = base;
      this.applyZoom(1, false);
      if (this.nono.offsetWidth <= avW && this.nono.offsetHeight <= avH) break;
      base--;
    }
    this.baseCs = base;
    this.applyZoom(z, false);
  }

  maxZoom() {
    return Math.max(1, 34 / this.baseCs);
  }

  applyZoom(z, keep = true, focus = null) {
    const zmax = this.maxZoom();
    z = Math.max(1, Math.min(zmax, z));
    const oldCs = this.cs || this.baseCs;
    const cs = Math.round(this.baseCs * z);
    this.zoom = z;
    const m = this.measure(cs);
    const sc = this.scroll;
    let fx = 0;
    let fy = 0;
    let anchorX = 0;
    let anchorY = 0;
    if (keep && focus) {
      const r = sc.getBoundingClientRect();
      fx = focus.x - r.left;
      fy = focus.y - r.top;
      anchorX = (sc.scrollLeft + fx - this.rowW) / (oldCs + 1);
      anchorY = (sc.scrollTop + fy - this.colH) / (oldCs + 1);
    }
    this.cs = cs;
    this.nono.style.cssText = `--cs:${cs}px;--fs:${m.fs}px;--w:${this.w};--h:${this.h}`;
    this.rowW = this.nono.querySelector('.rowclues').offsetWidth;
    this.colH = this.nono.querySelector('.colclues').offsetHeight;
    const zb = this.el.querySelector('[data-act="zoom"]');
    zb.hidden = zmax <= 1.05;
    zb.innerHTML = `${icon(z > 1.01 ? 'zoomOut' : 'zoomIn')}<span>${z > 1.01 ? 'Fit' : 'Zoom'}</span>`;
    this.el.classList.toggle('zoomed', z > 1.01);
    if (keep && focus) {
      sc.scrollLeft = anchorX * (cs + 1) + this.rowW - fx;
      sc.scrollTop = anchorY * (cs + 1) + this.colH - fy;
    }
    this.drawPreview();
  }

  toggleZoom() {
    sfx.tap();
    const r = this.grid.getBoundingClientRect();
    const target = this.zoom > 1.01 ? 1 : Math.min(this.maxZoom(), 30 / this.baseCs);
    this.applyZoom(target, true, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  setTool(tool, color = this.color) {
    this.tool = tool;
    if (tool === 'fill') this.color = color;
    for (const b of this.el.querySelectorAll('.sw-btn')) {
      const on = tool === 'cross' ? b.dataset.tool === 'cross' : +b.dataset.color === this.color && !b.dataset.tool;
      b.classList.toggle('sel', on);
    }
  }

  setMsg(html, cls = '') {
    if (!cls && html && html === this.msgDefault) cls = 'tip';
    else if (html && !html.startsWith('<')) html = `<span>${html}</span>`;
    this.msgEl.className = `msg ${cls}`;
    this.msgEl.innerHTML = html || '';
  }

  cellAt(clientX, clientY, clamp = false) {
    const r = this.grid.getBoundingClientRect();
    const step = this.cs + 1;
    let x = Math.floor((clientX - r.left - 1) / step);
    let y = Math.floor((clientY - r.top - 1) / step);
    if (clamp) {
      x = Math.max(0, Math.min(this.w - 1, x));
      y = Math.max(0, Math.min(this.h - 1, y));
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return { x, y };
  }

  bindPointer() {
    const g = this.grid;
    g.addEventListener('contextmenu', (e) => e.preventDefault());
    const nono = this.nono;
    nono.addEventListener('pointerdown', (e) => {
      if (this.solved) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        this.dropPending();
        this.cancelStroke();
        this.startPinch();
        return;
      }
      if (this.pointers.size > 2 || this.pinch) return;
      if (!g.contains(e.target) && e.target !== g) return;
      const c = this.cellAt(e.clientX, e.clientY);
      if (!c) return;
      e.preventDefault();
      try {
        nono.setPointerCapture(e.pointerId);
      } catch {}
      let mode = this.tool === 'cross' ? 'cross' : 'fill';
      if (e.pointerType === 'mouse' && e.button === 2) mode = 'cross';
      if (e.pointerType === 'mouse' && e.button === 1) return;
      if (e.pointerType === 'touch') {
        this.pending = { x: c.x, y: c.y, mode, id: e.pointerId, timer: setTimeout(() => this.flushPending(), 70) };
        this.highlight(c);
        return;
      }
      this.beginStroke(c.x, c.y, mode, e.pointerId);
    });
    nono.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (p) {
        p.x = e.clientX;
        p.y = e.clientY;
      }
      if (this.pinch) {
        this.movePinch();
        return;
      }
      if (this.pending && this.pending.id === e.pointerId) {
        const c = this.cellAt(e.clientX, e.clientY, true);
        if (c.x !== this.pending.x || c.y !== this.pending.y) this.flushPending();
      }
      if (this.stroke && this.stroke.id === e.pointerId) {
        const c = this.cellAt(e.clientX, e.clientY, true);
        this.extendStroke(c.x, c.y);
      } else if (e.pointerType === 'mouse' && !this.solved) {
        const c = this.cellAt(e.clientX, e.clientY);
        this.highlight(c);
      }
    });
    const up = (e) => {
      if (this.pending && this.pending.id === e.pointerId && e.type === 'pointerup') this.flushPending();
      else if (this.pending && this.pending.id === e.pointerId) this.dropPending();
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        if (this.pointers.size < 2) this.pinch = this.pointers.size ? { ended: true } : null;
        return;
      }
      if (this.stroke && this.stroke.id === e.pointerId) this.endStroke();
      if (!this.pointers.size) this.pinch = null;
    };
    nono.addEventListener('pointerup', up);
    nono.addEventListener('pointercancel', (e) => {
      if (this.stroke && this.stroke.id === e.pointerId && !this.pinch) this.endStroke();
      up(e);
    });
    nono.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.stroke) this.highlight(null);
    });
    this.scroll.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        this.applyZoom(this.zoom * (e.deltaY < 0 ? 1.12 : 0.89), true, { x: e.clientX, y: e.clientY });
      },
      { passive: false },
    );
  }

  flushPending() {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.pending = null;
    if (this.pinch || this.solved) return;
    this.beginStroke(p.x, p.y, p.mode, p.id);
  }

  dropPending() {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending = null;
  }

  startPinch() {
    const [a, b] = [...this.pointers.values()];
    const sc = this.scroll;
    this.pinch = {
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      z0: this.zoom,
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
      sl: sc.scrollLeft,
      st: sc.scrollTop,
    };
    this.highlight(null);
  }

  movePinch() {
    const p = this.pinch;
    if (!p || p.ended || this.pointers.size < 2) return;
    const [a, b] = [...this.pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const z = p.z0 * (d / p.d0);
    if (Math.abs(z - this.zoom) > 0.02) this.applyZoom(z, true, { x: mx, y: my });
    this.scroll.scrollLeft -= mx - (p.lx ?? p.mx);
    this.scroll.scrollTop -= my - (p.ly ?? p.my);
    p.lx = mx;
    p.ly = my;
  }

  eligible(i) {
    const s = this.stroke;
    if (this.lock[i]) return false;
    const cur = this.v[i];
    if (s.target === -1) return cur === s.from;
    return cur === -1 || cur === s.from;
  }

  beginStroke(x, y, mode, id) {
    this.clearHint();
    const i = y * this.w + x;
    const k = mode === 'fill' ? this.color : 0;
    const cur = this.v[i];
    if (this.lock[i]) {
      this.highlight({ x, y });
      this.stroke = { id, x, y, target: null, from: null, axis: null, applied: new Map(), stopped: true, dead: true };
      return;
    }
    const target = cur === k ? -1 : k;
    this.stroke = { id, x, y, target, from: cur, axis: null, applied: new Map(), stopped: false };
    this.highlight({ x, y });
    this.applyCell(i);
    this.sound(target);
  }

  sound(target) {
    if (target === -1) sfx.erase();
    else if (target === 0) sfx.cross();
    else sfx.fill(this.stroke.applied.size);
    buzz(4);
  }

  applyCell(i) {
    const s = this.stroke;
    if (s.stopped || !this.eligible(i)) return;
    const t = s.target;
    if (this.assist && t !== -1) {
      const want = this.P.sol[i];
      if ((t > 0 && want !== t) || (t === 0 && want > 0)) {
        this.v[i] = want;
        this.lock[i] = 2;
        this.mistakes++;
        s.stopped = true;
        (s.mist ||= []).push(i);
        this._keepWarn = true;
        this.paintCell(i, true);
        sfx.error();
        buzz([30, 40, 30]);
        this.el.classList.remove('oops');
        void this.el.offsetWidth;
        this.el.classList.add('oops');
        this.setMsg(t > 0 ? 'Oops, that square is empty. It is marked for you now.' : 'Oops, that square is filled. It is filled in for you now.', 'warn');
        this.dirtyLines(i);
        return;
      }
    }
    s.applied.set(i, this.v[i]);
    this.v[i] = t;
    this.paintCell(i, true);
  }

  extendStroke(x, y) {
    const s = this.stroke;
    if (!s || s.dead) return;
    if (!s.axis) {
      if (x === s.x && y === s.y) return;
      s.axis = Math.abs(x - s.x) >= Math.abs(y - s.y) ? 'row' : 'col';
    }
    if (s.axis === 'row') y = s.y;
    else x = s.x;
    this.highlight({ x, y });
    const want = new Set();
    const n = s.axis === 'row' ? x - s.x : y - s.y;
    const step = Math.sign(n) || 1;
    for (let t = 0; t !== n + step; t += step) {
      const cx = s.axis === 'row' ? s.x + t : s.x;
      const cy = s.axis === 'row' ? s.y : s.y + t;
      want.add(cy * this.w + cx);
    }
    const start = s.y * this.w + s.x;
    for (const [i, prev] of [...s.applied]) {
      if (want.has(i) || i === start) continue;
      this.v[i] = prev;
      s.applied.delete(i);
      this.paintCell(i);
    }
    let added = false;
    const order = [...want];
    for (const i of order) {
      if (s.applied.has(i) || i === start) continue;
      if (s.stopped) break;
      const before = s.applied.size;
      this.applyCell(i);
      if (s.applied.size > before) added = true;
    }
    if (added) this.sound(s.target);
    this.drawPreview();
  }

  cancelStroke() {
    const s = this.stroke;
    if (!s) return;
    for (const [i, prev] of s.applied) {
      this.v[i] = prev;
      this.paintCell(i);
    }
    this.stroke = null;
  }

  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (!s || s.dead) return;
    const changes = [];
    for (const [i, prev] of s.applied) if (prev !== this.v[i]) changes.push([i, prev, this.v[i]]);
    const lines = new Set();
    for (const [i] of changes) {
      lines.add(Math.floor(i / this.w));
      lines.add(this.h + (i % this.w));
    }
    for (const i of s.mist || []) {
      lines.add(Math.floor(i / this.w));
      lines.add(this.h + (i % this.w));
    }
    if (db.settings.autocross && changes.some((c) => c[2] > 0 || c[1] > 0)) this.autoCross(lines, changes);
    this.commit(changes, lines);
  }

  autoCross(lines, changes) {
    for (const k of [...lines]) {
      const cells = this.P.ng.lineCells(k);
      const vals = cells.map((i) => (this.v[i] > 0 ? this.v[i] : 0));
      if (!lineMatches(vals, this.P.ng.lineClue(k))) continue;
      for (const i of cells) {
        if (this.v[i] !== -1 || this.lock[i]) continue;
        changes.push([i, -1, 0]);
        this.v[i] = 0;
        this.paintCell(i, false, true);
        lines.add(Math.floor(i / this.w));
        lines.add(this.h + (i % this.w));
      }
    }
  }

  commit(changes, lines) {
    if (changes.length) {
      this.hist.push(changes);
      if (this.hist.length > 500) this.hist.shift();
      this.fut = [];
    }
    this.afterChange(lines);
  }

  dirtyLines(i) {
    this.refreshLine(Math.floor(i / this.w));
    this.refreshLine(this.h + (i % this.w));
  }

  undo() {
    if (this.solved) return;
    this.clearHint();
    const ch = this.hist.pop();
    if (!ch) return;
    const lines = new Set();
    for (let t = ch.length - 1; t >= 0; t--) {
      const [i, prev] = ch[t];
      if (this.lock[i]) continue;
      this.v[i] = prev;
      this.paintCell(i);
      lines.add(Math.floor(i / this.w));
      lines.add(this.h + (i % this.w));
    }
    this.fut.push(ch);
    sfx.tap();
    this.afterChange(lines);
  }

  redo() {
    if (this.solved) return;
    this.clearHint();
    const ch = this.fut.pop();
    if (!ch) return;
    const lines = new Set();
    for (const [i, , next] of ch) {
      if (this.lock[i]) continue;
      this.v[i] = next;
      this.paintCell(i);
      lines.add(Math.floor(i / this.w));
      lines.add(this.h + (i % this.w));
    }
    this.hist.push(ch);
    sfx.tap();
    this.afterChange(lines);
  }

  restart() {
    this.clearHint();
    for (let i = 0; i < this.N; i++) {
      if (this.lock[i] === 1) continue;
      this.v[i] = -1;
      this.lock[i] = 0;
    }
    this.hist = [];
    this.fut = [];
    this.mistakes = 0;
    this.hints = 0;
    this.elapsed = 0;
    if (this.runningSince) this.runningSince = performance.now();
    this.refreshAll();
    this.setMsg(this.msgDefault);
    this.save();
  }

  paintCell(i, pop = false, soft = false) {
    const el = this.cellEls[i];
    const v = this.v[i];
    let cls = v > 0 ? 'f' : v === 0 ? 'x' : '';
    if (this.lock[i] === 1) cls += ' gv';
    else if (this.lock[i] === 2) cls += ' mk';
    if (pop && v !== -1) cls += ' pop';
    if (soft) cls += ' soft';
    el.className = cls;
    if (v > 0) el.dataset.k = v;
    else delete el.dataset.k;
  }

  lineVals(k) {
    return this.P.ng.lineCells(k).map((i) => this.v[i]);
  }

  refreshLine(k) {
    const clue = this.P.ng.lineClue(k);
    const vals = this.lineVals(k);
    const el = k < this.h ? this.rowEls[k] : this.colEls[k - this.h];
    const nums = el.querySelectorAll('i');
    const filledVals = vals.map((v) => (v > 0 ? v : 0));
    const complete = lineMatches(filledVals, clue);
    let bad = false;
    if (!complete && !this.assist) {
      const full = fullMask(this.P.ncolors);
      const masks = Uint8Array.from(vals, (v) => (v === -1 ? full : 1 << v));
      bad = !lineSolve(masks, clue, new Uint8Array(vals.length));
    }
    const done = clue.length ? clueDone(vals, clue) : [];
    if (!clue.length) nums[0]?.classList.toggle('done', vals.every((v) => v <= 0));
    nums.forEach((n, j) => {
      if (!clue.length) return;
      n.classList.toggle('done', complete || !!done[j]);
    });
    el.classList.toggle('bad', bad);
    const was = this.lineState[k];
    this.lineState[k] = complete;
    return complete && was === false;
  }

  refreshAll() {
    for (let i = 0; i < this.N; i++) this.paintCell(i);
    for (let k = 0; k < this.w + this.h; k++) this.refreshLine(k);
    this.updateTools();
    this.updateHud();
    this.drawPreview();
  }

  afterChange(lines) {
    let chime = false;
    for (const k of lines) if (this.refreshLine(k)) chime = true;
    if (chime) {
      sfx.line();
      for (const k of lines) {
        if (!this.lineState[k]) continue;
        const el = k < this.h ? this.rowEls[k] : this.colEls[k - this.h];
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
      }
    }
    this.updateTools();
    this.updateHud();
    this.drawPreview();
    if (this.msgEl.classList.contains('warn') || this.msgEl.classList.contains('hint')) {
      if (!this.pendingHint && !this._keepWarn) this.setMsg(this.msgDefault);
    }
    this._keepWarn = false;
    if (this.isSolved()) this.win();
    else this.save();
  }

  isSolved() {
    const { sol } = this.P;
    for (let i = 0; i < this.N; i++) {
      const v = this.v[i] > 0 ? this.v[i] : 0;
      if (v !== sol[i]) return false;
    }
    return true;
  }

  progress() {
    const { sol } = this.P;
    let need = 0;
    let got = 0;
    for (let i = 0; i < this.N; i++) {
      if (!sol[i]) continue;
      need++;
      if (this.v[i] === sol[i]) got++;
    }
    return need ? got / need : 1;
  }

  updateHud() {
    const s = Math.floor(this.time() / 1000);
    const m = Math.floor(s / 60);
    this.timeEl.textContent = m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
    this.mistEl.querySelector('b').textContent = this.mistakes;
    this.mistEl.classList.toggle('some', this.mistakes > 0);
    this.mistEl.hidden = !this.assist && !this.mistakes;
    const p = this.progress();
    this.progEl.querySelector('b').textContent = `${Math.round(p * 100)}%`;
    this.progEl.querySelector('u').style.width = `${p * 100}%`;
  }

  updateTools() {
    const q = (a) => this.el.querySelector(`[data-act="${a}"]`);
    q('undo').disabled = !this.hist.length || this.solved;
    q('redo').disabled = !this.fut.length || this.solved;
    q('hint').disabled = this.solved;
  }

  highlight(c) {
    this.rowEls.forEach((e) => e.classList.remove('on'));
    this.colEls.forEach((e) => e.classList.remove('on'));
    if (!c) {
      this.hlR.style.display = 'none';
      this.hlC.style.display = 'none';
      return;
    }
    this.rowEls[c.y]?.classList.add('on');
    this.colEls[c.x]?.classList.add('on');
    this.hlR.style.cssText = `display:block;--p:${c.y}`;
    this.hlC.style.cssText = `display:block;--p:${c.x}`;
  }

  drawPreview() {
    const cv = this.pv;
    if (!cv || !this.rowW) return;
    const { w, h } = this;
    const box = Math.max(10, Math.min(this.rowW, this.colH) - 10);
    const px = Math.max(1, Math.floor(box / Math.max(w, h)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * px * dpr;
    cv.height = h * px * dpr;
    cv.style.width = `${w * px}px`;
    cv.style.height = `${h * px}px`;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w * px, h * px);
    for (let i = 0; i < this.N; i++) {
      const v = this.v[i];
      if (v <= 0) continue;
      ctx.fillStyle = this.P.colors[v - 1];
      ctx.fillRect((i % w) * px, Math.floor(i / w) * px, px, px);
    }
  }

  clearHint() {
    if (!this.pendingHint) return;
    for (const i of this.pendingHint.cells) this.cellEls[i].classList.remove('ht', 'hw');
    this.pendingHint.lineEl?.classList.remove('hl-hint');
    this.pendingHint = null;
    this.highlight(null);
    this.setMsg(this.msgDefault);
  }

  hint() {
    if (this.solved) return;
    if (this.pendingHint) {
      this.applyHint();
      return;
    }
    const { sol } = this.P;
    const wrong = [];
    for (let i = 0; i < this.N; i++) {
      const v = this.v[i];
      if (v === -1 || this.lock[i]) continue;
      if ((v > 0 && v !== sol[i]) || (v === 0 && sol[i] > 0)) wrong.push(i);
    }
    this.hints++;
    sfx.hint();
    if (wrong.length) {
      this.pendingHint = { type: 'wrong', cells: wrong };
      for (const i of wrong) this.cellEls[i].classList.add('hw');
      this.setMsg(`${icon('bulb', 'msg-i')}<span>${wrong.length === 1 ? 'This square is' : `These ${wrong.length} squares are`} wrong. <em>Tap Hint again to clear ${wrong.length === 1 ? 'it' : 'them'}.</em></span>`, 'hint');
      this.updateHud();
      return;
    }
    const full = fullMask(this.P.ncolors);
    const state = Uint8Array.from(this.v, (v) => (v === -1 ? full : 1 << v));
    let best = null;
    for (let k = 0; k < this.w + this.h; k++) {
      const res = this.P.ng.deduceLine(state, k);
      if (!res) continue;
      const cells = this.P.ng.lineCells(k);
      const found = [];
      cells.forEach((i, t) => {
        if (!single(state[i]) && single(res[t])) found.push([i, valueOf(res[t])]);
      });
      if (!found.length) continue;
      const open = cells.filter((i) => this.v[i] === -1).length;
      const score = found.filter((f) => f[1] > 0).length * 2 + found.length - open * 0.05;
      if (!best || score > best.score) best = { k, found, score };
    }
    if (!best) {
      const open = [];
      for (let i = 0; i < this.N; i++) if (this.v[i] === -1) open.push(i);
      if (!open.length) return;
      const i = open[Math.floor(Math.random() * open.length)];
      best = { k: Math.floor(i / this.w), found: [[i, sol[i]]], score: 0 };
    }
    const { k, found } = best;
    const row = k < this.h;
    const idx = row ? k : k - this.h;
    const lineEl = row ? this.rowEls[idx] : this.colEls[idx];
    lineEl.classList.add('hl-hint');
    const cells = found.map((f) => f[0]);
    for (const i of cells) this.cellEls[i].classList.add('ht');
    this.pendingHint = { type: 'line', cells, found, lineEl };
    const nf = found.filter((f) => f[1] > 0).length;
    const nx = found.length - nf;
    const parts = [];
    if (nf) parts.push(`${nf} to fill`);
    if (nx) parts.push(`${nx} to cross`);
    const clue = this.P.ng.lineClue(k).map((b) => b[0]).join(' ') || '0';
    this.setMsg(`${icon('bulb', 'msg-i')}<span>Look at <b>${row ? 'row' : 'column'} ${idx + 1}</b> (clue <span class="hn">${clue}</span>): ${parts.join(' and ')}. <em>Tap Hint again to do it.</em></span>`, 'hint');
    if (row) this.hlR.style.cssText = `display:block;--p:${idx}`;
    else this.hlC.style.cssText = `display:block;--p:${idx}`;
    this.scrollIntoView(cells[0]);
    this.updateHud();
  }

  scrollIntoView(i) {
    if (this.zoom <= 1.01) return;
    const el = this.cellEls[i];
    const r = el.getBoundingClientRect();
    const s = this.scroll.getBoundingClientRect();
    if (r.left < s.left + this.rowW || r.right > s.right) this.scroll.scrollLeft += r.left - (s.left + this.rowW + (s.width - this.rowW) / 2);
    if (r.top < s.top + this.colH || r.bottom > s.bottom) this.scroll.scrollTop += r.top - (s.top + this.colH + (s.height - this.colH) / 2);
  }

  applyHint() {
    const h = this.pendingHint;
    if (!h) return;
    const changes = [];
    const lines = new Set();
    if (h.type === 'wrong') {
      for (const i of h.cells) {
        changes.push([i, this.v[i], -1]);
        this.v[i] = -1;
      }
    } else {
      for (const [i, val] of h.found) {
        if (this.lock[i]) continue;
        changes.push([i, this.v[i], val]);
        this.v[i] = val;
      }
    }
    this.clearHint();
    for (const [i] of changes) {
      this.paintCell(i, true);
      lines.add(Math.floor(i / this.w));
      lines.add(this.h + (i % this.w));
    }
    sfx.fill(3);
    if (db.settings.autocross) this.autoCross(lines, changes);
    this.commit(changes, lines);
  }

  key(e) {
    if (this.solved || e.metaKey || e.altKey) return;
    if (document.querySelector('#sheet-root.open, .reveal')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      this.redo();
    } else if (k === 'h' && !e.ctrlKey) this.hint();
    else if (k === 'x' && !e.ctrlKey) this.setTool('cross');
    else if (k === 'f' && !e.ctrlKey) this.setTool('fill', this.color);
    else if (/^[1-9]$/.test(k) && +k <= this.P.ncolors) this.setTool('fill', +k);
    else if (k === ' ' && !e.ctrlKey) {
      e.preventDefault();
      this.setTool(this.tool === 'cross' ? 'fill' : 'cross');
    }
  }

  paintArt() {
    if (this.dead) return;
    const { col } = figureCells(this.fig);
    this.cellEls.forEach((el, i) => {
      el.className = 'art';
      el.style.background = col[i] || '';
    });
    this.el.classList.add('art-on');
  }

  win() {
    this.solved = true;
    this.pause();
    this.clearHint();
    this.highlight(null);
    this.updateTools();
    if (this.opts.saveKey) {
      delete db.saves[this.opts.saveKey];
      persist();
    }
    const stars = 3 - (this.mistakes > 0 ? 1 : 0) - (this.hints > 0 ? 1 : 0);
    const gridRect = this.grid.getBoundingClientRect();
    const res = { time: this.time(), mistakes: this.mistakes, hints: this.hints, stars, gridRect, cs: this.cs };
    sfx.solved();
    buzz([20, 40, 20]);
    this.el.classList.add('solved');
    setTimeout(() => this.paintArt(), 700);
    setTimeout(() => {
      if (!this.dead) this.opts.onWin?.(res, this);
    }, 380);
  }
}

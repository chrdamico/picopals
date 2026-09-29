import { artRows } from './puzzle.js';

const EYE = 'eh';
const TAU = Math.PI * 2;

export function figureCells(fig) {
  const rows = artRows(fig);
  const h = rows.length;
  const w = rows[0].length;
  const col = new Array(w * h).fill(null);
  const eye = new Uint8Array(w * h);
  const lid = new Array(w * h).fill(null);
  const line = new Uint8Array(w * h);
  const counts = {};
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      col[y * w + x] = fig.pal[ch] || '#FF00FF';
      if (EYE.includes(ch)) eye[y * w + x] = 1;
      else counts[ch] = (counts[ch] || 0) + 1;
    }
  }
  const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const fallback = common ? fig.pal[common[0]] : '#888888';
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : rows[y][x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!eye[i]) continue;
      let c = null;
      for (let yy = y - 1; yy >= 0 && !c; yy--) {
        const ch = at(x, yy);
        if (ch === '.') break;
        if (!EYE.includes(ch)) c = fig.pal[ch];
      }
      for (let d = 1; d < w && !c; d++) {
        for (const xx of [x - d, x + d]) {
          const ch = at(xx, y);
          if (ch !== '.' && !EYE.includes(ch)) {
            c = fig.pal[ch];
            break;
          }
        }
      }
      lid[i] = c || fallback;
      line[i] = !EYE.includes(at(x, y + 1)) || at(x, y + 1) === '.' ? 1 : 0;
    }
  }
  const dark = fig.pal.e || '#2B2233';
  return { w, h, col, eye, lid, line, dark };
}

function rr(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  } else ctx.fillRect(x, y, w, h);
}

export function renderSprite(cells, sd, { closed = false, outline = true, outlineColor = '#FFFFFF', shadow = true } = {}) {
  const { w, h, col, eye, lid, line, dark } = cells;
  const o = outline ? Math.max(2, Math.round(sd * 0.32)) : 0;
  const pad = o + (shadow ? Math.ceil(o * 0.8) : 0) + 1;
  const cv = document.createElement('canvas');
  cv.width = w * sd + pad * 2;
  cv.height = h * sd + pad * 2;
  const ctx = cv.getContext('2d');
  if (outline) {
    if (shadow) {
      ctx.fillStyle = 'rgba(40, 20, 60, 0.18)';
      for (let i = 0; i < col.length; i++) {
        if (!col[i]) continue;
        const x = (i % w) * sd + pad;
        const y = Math.floor(i / w) * sd + pad;
        rr(ctx, x - o, y - o + o * 0.7, sd + 2 * o, sd + 2 * o, o);
      }
    }
    ctx.fillStyle = outlineColor;
    for (let i = 0; i < col.length; i++) {
      if (!col[i]) continue;
      const x = (i % w) * sd + pad;
      const y = Math.floor(i / w) * sd + pad;
      rr(ctx, x - o, y - o, sd + 2 * o, sd + 2 * o, o);
    }
  }
  for (let i = 0; i < col.length; i++) {
    if (!col[i]) continue;
    const x = (i % w) * sd + pad;
    const y = Math.floor(i / w) * sd + pad;
    ctx.fillStyle = closed && eye[i] ? lid[i] : col[i];
    ctx.fillRect(x, y, sd, sd);
    if (closed && eye[i] && line[i]) {
      ctx.fillStyle = dark;
      ctx.fillRect(x, y + Math.round(sd * 0.45), sd, Math.max(1, Math.round(sd * 0.32)));
    }
  }
  return { canvas: cv, pad, sd };
}

const thumbCache = new Map();

export function thumbURL(fig, px = 96, key = fig.id) {
  const k = `${key}@${px}`;
  if (thumbCache.has(k)) return thumbCache.get(k);
  const cells = figureCells(fig);
  const sd = Math.max(2, Math.floor(px / Math.max(cells.w, cells.h)));
  const { canvas } = renderSprite(cells, sd, { outline: true, shadow: false });
  const url = canvas.toDataURL('image/png');
  thumbCache.set(k, url);
  return url;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function sat(hex) {
  const [r, g, b] = hexToRgb(hex);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx ? (mx - mn) / mx : 0;
}

export function accentColors(fig) {
  const cols = [...new Set(Object.values(fig.pal))].filter((c) => lum(c) > 0.3);
  cols.sort((a, b) => sat(b) - sat(a));
  return cols.length ? cols.slice(0, 4) : ['#FFD23F', '#FF7FA0'];
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

function motionAt(kind, t, W, H) {
  const m = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, origin: 'bottom', lift: 0, row: null, glow: 0 };
  switch (kind) {
    case 'hop': {
      const P = 1.3;
      const u = (t % P) / P;
      if (u < 0.15) {
        const q = Math.sin((u / 0.15) * Math.PI);
        m.sy = 1 - 0.12 * q;
        m.sx = 1 + 0.1 * q;
      } else if (u < 0.65) {
        const a = (u - 0.15) / 0.5;
        const ht = Math.sin(a * Math.PI);
        m.dy = -0.13 * H * ht;
        m.sy = 1 + 0.08 * (1 - ht);
        m.sx = 1 - 0.06 * (1 - ht);
        m.lift = ht;
      } else if (u < 0.8) {
        const q = Math.sin(((u - 0.65) / 0.15) * Math.PI);
        m.sy = 1 - 0.15 * q;
        m.sx = 1 + 0.12 * q;
      }
      break;
    }
    case 'bounce': {
      const a = (t % 0.9) / 0.9;
      const b = Math.abs(Math.sin(a * Math.PI));
      m.dy = -0.06 * H * b;
      const sq = Math.max(0, 1 - b * 4);
      m.sy = 1 - 0.06 * sq;
      m.sx = 1 + 0.05 * sq;
      m.lift = b * 0.4;
      break;
    }
    case 'wiggle':
      m.rot = Math.sin((TAU * t) / 1.0) * 0.14;
      m.dy = -Math.abs(Math.sin((TAU * t) / 1.0)) * 0.02 * H;
      break;
    case 'float':
      m.origin = 'center';
      m.dy = Math.sin((TAU * t) / 2.6) * 0.06 * H - 0.05 * H;
      m.rot = Math.sin((TAU * t) / 3.3) * 0.05;
      m.lift = 0.6 + 0.25 * Math.sin((TAU * t) / 2.6 + Math.PI);
      break;
    case 'swim':
      m.origin = 'center';
      m.dx = Math.sin((TAU * t) / 3.2) * 0.06 * W;
      m.dy = Math.sin((TAU * t) / 1.6) * 0.03 * H - 0.04 * H;
      m.row = (yn) => Math.sin((TAU * t) / 1.1 - yn * 5) * 0.035 * W;
      m.lift = 0.5;
      break;
    case 'sway': {
      const s = Math.sin((TAU * t) / 2.2);
      m.row = (yn) => s * Math.pow(1 - yn, 1.6) * 0.07 * W;
      break;
    }
    case 'spin': {
      m.origin = 'center';
      const u = (t % 3) / 3;
      const ang = u < 0.55 ? 0 : easeInOut((u - 0.55) / 0.45) * TAU;
      m.sx = Math.cos(ang);
      m.dy = Math.sin((TAU * t) / 3) * 0.03 * H - 0.03 * H;
      m.lift = 0.3;
      m.glow = u > 0.55 ? Math.sin(((u - 0.55) / 0.45) * Math.PI) : 0;
      break;
    }
    case 'pulse': {
      m.origin = 'center';
      const u = (t % 1.1) / 1.1;
      const s = 1 + 0.09 * Math.exp(-(((u - 0.1) / 0.05) ** 2)) + 0.06 * Math.exp(-(((u - 0.3) / 0.05) ** 2));
      m.sx = s;
      m.sy = s;
      m.glow = s - 1;
      break;
    }
    case 'jelly': {
      const a = Math.sin((TAU * t) / 0.9);
      m.sx = 1 + 0.07 * a;
      m.sy = 1 - 0.07 * a;
      break;
    }
    case 'flap': {
      m.origin = 'center';
      const a = 0.5 + 0.5 * Math.sin((TAU * t) / 0.42);
      m.sx = 1 - 0.1 * a;
      m.sy = 1 + 0.03 * a;
      m.dy = Math.sin((TAU * t) / 1.8) * 0.05 * H - 0.06 * H;
      m.lift = 0.6;
      break;
    }
    case 'buzz': {
      m.origin = 'center';
      const k = Math.floor(t * 30);
      const r1 = Math.sin(k * 12.9898) * 43758.5453;
      const r2 = Math.sin(k * 78.233) * 12345.6789;
      m.dx = (r1 - Math.floor(r1) - 0.5) * 0.025 * W + Math.sin((TAU * t) / 2.8) * 0.05 * W;
      m.dy = (r2 - Math.floor(r2) - 0.5) * 0.025 * H + Math.sin((TAU * t) / 1.4) * 0.04 * H - 0.04 * H;
      m.lift = 0.4;
      break;
    }
    case 'roll':
      m.origin = 'center';
      m.rot = ((t % 2.4) / 2.4) * TAU;
      m.dx = Math.sin((TAU * t) / 4.8) * 0.04 * W;
      break;
    case 'glow': {
      m.origin = 'center';
      const s = 1 + 0.03 * Math.sin((TAU * t) / 1.6);
      m.sx = s;
      m.sy = s;
      m.dy = Math.sin((TAU * t) / 3.2) * 0.02 * H;
      m.glow = 0.5 + 0.5 * Math.sin((TAU * t) / 1.6);
      break;
    }
    case 'march': {
      const ph = t / 0.5;
      const side = Math.floor(ph) % 2 ? 1 : -1;
      m.rot = Math.abs(Math.sin(Math.PI * ph)) * 0.09 * side;
      m.dy = -Math.abs(Math.sin(Math.PI * ph)) * 0.03 * H;
      const u = (t % 6) / 6;
      m.dx = (u < 0.5 ? -1 + 4 * u : 3 - 4 * u) * 0.1 * W;
      m.sx = u < 0.5 ? 1 : -1;
      break;
    }
    default:
      break;
  }
  return m;
}

function heartPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 0.9, -s * 0.25, -s * 0.45, -s * 0.95, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.45, -s * 0.95, s * 0.9, -s * 0.25, 0, s * 0.35);
  ctx.closePath();
}

function starPath(ctx, s, n = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? s * inner : s;
    const a = (i / (n * 2)) * TAU - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function sparklePath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(0, 0, s, 0);
  ctx.quadraticCurveTo(0, 0, 0, s);
  ctx.quadraticCurveTo(0, 0, -s, 0);
  ctx.quadraticCurveTo(0, 0, 0, -s);
  ctx.closePath();
}

function leafPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.8, 0, 0, s);
  ctx.quadraticCurveTo(-s * 0.8, 0, 0, -s);
  ctx.closePath();
}

const FX_COLORS = {
  hearts: ['#FF5C8A', '#FF8FB1', '#FF3D6E'],
  sparkles: ['#FFFFFF', '#FFE37A', '#FFF4C2'],
  stars: ['#FFD23F', '#FFE37A', '#FFB938'],
  notes: ['#7B61FF', '#FF6FA5', '#3FA7F5', '#35C98A'],
  bubbles: ['#BDE8FF', '#E6F7FF'],
  zzz: ['#8FA2FF', '#B7C3FF'],
  petals: ['#FFB7D0', '#FF8FB1', '#FFD6E5'],
  snow: ['#FFFFFF', '#E8F4FF'],
  leaves: ['#6CC070', '#A7D65A', '#F4A93B', '#E0703A'],
  confetti: ['#FF5C7A', '#FFD23F', '#35C98A', '#4DA3FF', '#9B7BFF', '#FF9F43'],
  steam: ['#FFFFFF'],
  embers: ['#FF9F43', '#FFD23F', '#FF6B3D'],
};

const FX_RATE = { hearts: 1.8, sparkles: 3.2, stars: 1.6, notes: 1.4, bubbles: 2.6, zzz: 0.8, petals: 2.2, snow: 4, leaves: 1.6, confetti: 5, steam: 3, embers: 6 };

export class FigureStage {
  constructor(canvas, fig, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fig = fig;
    this.cells = figureCells(fig);
    this.motion = opts.motion || fig.motion || 'bounce';
    this.fx = opts.fx || fig.fx || 'sparkles';
    this.fxScale = opts.fxScale ?? 1;
    this.intro = opts.intro || null;
    this.fitW = opts.fitW ?? opts.fit ?? 0.72;
    this.fitH = opts.fitH ?? opts.fit ?? 0.72;
    this.maxCell = opts.maxCell ?? 40;
    this.anchorY = opts.anchorY ?? 0.5;
    this.onPop = opts.onPop || null;
    this.onFlipTick = opts.onFlipTick || null;
    this.parts = [];
    this.acc = 0;
    this.t0 = performance.now();
    this.last = this.t0;
    this.nextBlink = 1.6 + Math.random() * 1.5;
    this.blinkUntil = 0;
    this.accents = accentColors(fig);
    this.popped = !this.intro;
    this.popAt = this.intro ? this.intro.flipEnd : -10;
    this.raf = 0;
    this.running = false;
    this.flipTicks = 0;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cw = Math.max(1, r.width);
    this.ch = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cw * dpr);
    this.canvas.height = Math.round(this.ch * dpr);
    this.rect = r;
    const { w, h } = this.cells;
    const maxW = this.cw * this.fitW;
    const maxH = this.ch * this.fitH;
    const s = Math.min(maxW / w, maxH / h, this.maxCell);
    this.sd = Math.max(2, Math.floor(s * dpr));
    this.s = this.sd / dpr;
    this.W = w * this.s;
    this.H = h * this.s;
    this.cx = this.cw / 2;
    this.cy = this.ch * this.anchorY;
    this.open = renderSprite(this.cells, this.sd);
    this.shut = renderSprite(this.cells, this.sd, { closed: true });
    this.shineCv = document.createElement('canvas');
    this.shineCv.width = this.open.canvas.width;
    this.shineCv.height = this.open.canvas.height;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  skip() {
    if (!this.intro) return;
    const t = (performance.now() - this.t0) / 1000;
    if (t < this.intro.flipEnd) this.t0 = performance.now() - this.intro.flipEnd * 1000;
  }

  time() {
    return (performance.now() - this.t0) / 1000;
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    if (this.intro && t < this.intro.flipEnd) {
      this.drawIntro(t);
    } else {
      if (!this.popped) {
        this.popped = true;
        this.popAt = t;
        this.burst();
        this.onPop?.();
      }
      this.drawAlive(t);
      this.spawn(dt, t);
    }
    this.drawParts(dt);
  }

  drawIntro(t) {
    const { ctx, cells, intro } = this;
    const { w, h } = cells;
    const from = intro.from;
    const flyEnd = intro.flyEnd;
    const k = from ? easeInOut(clamp01(t / flyEnd)) : 1;
    const tx = this.cx - this.W / 2;
    const ty = this.cy - this.H / 2;
    let x0 = tx;
    let y0 = ty;
    let s = this.s;
    if (from) {
      const fx = from.left - this.rect.left;
      const fy = from.top - this.rect.top;
      const fs = from.width / w;
      x0 = fx + (tx - fx) * k;
      y0 = fy + (ty - fy) * k;
      s = fs + (this.s - fs) * k;
    }
    const sol = intro.sol;
    const monoCols = intro.colors;
    const flipStart = flyEnd;
    const span = intro.flipEnd - flipStart - 0.32;
    const gapK = 1 - clamp01((t - flipStart) / 0.4);
    const gap = Math.max(0, s * 0.1 * gapK);
    let ticks = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const art = cells.col[i];
        const v = sol[i];
        if (!art && !v) continue;
        const d = ((x + y) / Math.max(1, w + h - 2)) * span;
        const p = clamp01((t - flipStart - d) / 0.32);
        if (p > 0.5) ticks++;
        let color;
        let scaleX;
        let scaleY = 1;
        if (p <= 0) {
          if (!v) continue;
          color = monoCols[v - 1];
          scaleX = 1;
        } else if (v) {
          scaleX = Math.abs(Math.cos(p * Math.PI));
          color = p < 0.5 ? monoCols[v - 1] : art;
        } else {
          if (p < 0.5) continue;
          const q = easeOut((p - 0.5) * 2);
          scaleX = q;
          scaleY = q;
          color = art;
        }
        if (!color) continue;
        const cxp = x0 + x * s + s / 2;
        const cyp = y0 + y * s + s / 2;
        const cw = (s - gap) * scaleX;
        const chh = (s - gap) * scaleY;
        ctx.fillStyle = color;
        if (gap > 0.6) rr(ctx, cxp - cw / 2, cyp - chh / 2, cw + 0.4, chh + 0.4, gap * 0.9);
        else ctx.fillRect(cxp - cw / 2, cyp - chh / 2, cw + 0.4, chh + 0.4);
      }
    }
    if (ticks > this.flipTicks) {
      this.flipTicks = ticks;
      this.onFlipTick?.(ticks);
    }
  }

  drawAlive(t) {
    const { ctx } = this;
    const since = t - this.popAt;
    const m = motionAt(this.motion, t, this.W, this.H);
    let pop = 1;
    if (since < 0.5) {
      const q = since / 0.5;
      pop = 1 + Math.sin(q * Math.PI) * 0.16 * (1 - q) - (q < 0.15 ? 0.1 * Math.sin((q / 0.15) * Math.PI) : 0);
    }
    if (t > this.nextBlink) {
      this.blinkUntil = t + 0.13;
      this.nextBlink = t + (Math.random() < 0.25 ? 0.25 : 2.2 + Math.random() * 2.6);
    }
    const sprite = t < this.blinkUntil ? this.shut : this.open;
    const { canvas: cv, pad } = sprite;
    const scale = 1 / this.dpr;
    const baseY = this.cy + this.H / 2;
    const shW = this.W * 0.42 * (1 - m.lift * 0.35);
    ctx.save();
    ctx.fillStyle = `rgba(30, 20, 50, ${0.16 * (1 - m.lift * 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(this.cx + m.dx, baseY + this.s * 0.9, shW, Math.max(3, this.s * 0.55) * (1 - m.lift * 0.3), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (m.glow > 0 || this.motion === 'glow') {
      const g = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(this.W, this.H) * 0.8);
      g.addColorStop(0, `rgba(255, 250, 220, ${0.45 * m.glow})`);
      g.addColorStop(1, 'rgba(255, 250, 220, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
    ctx.save();
    const ox = this.cx + m.dx;
    const oy = m.origin === 'bottom' ? baseY + m.dy : this.cy + m.dy;
    ctx.translate(ox, oy);
    ctx.rotate(m.rot);
    ctx.scale(m.sx * pop, m.sy * pop);
    const left = -cv.width * scale / 2;
    const top = m.origin === 'bottom' ? -(cv.height - pad) * scale : -cv.height * scale / 2;
    let src = cv;
    const shineT = (t % 2.6) / 2.6;
    const shine = ['glow', 'spin'].includes(this.motion) || since < 0.9;
    if (shine) {
      const sc = this.shineCv;
      const sx = sc.getContext('2d');
      sx.globalCompositeOperation = 'source-over';
      sx.clearRect(0, 0, sc.width, sc.height);
      sx.drawImage(cv, 0, 0);
      const p = since < 0.9 ? since / 0.9 : shineT;
      const bx = -sc.width * 0.6 + p * sc.width * 2.2;
      sx.globalCompositeOperation = 'source-atop';
      const g = sx.createLinearGradient(bx - sc.width * 0.25, 0, bx + sc.width * 0.25, sc.height * 0.4);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      sx.fillStyle = g;
      sx.fillRect(0, 0, sc.width, sc.height);
      src = sc;
    }
    if (m.row) {
      const { h } = this.cells;
      const sd = sprite.sd;
      for (let y = 0; y < h; y++) {
        const sy0 = y === 0 ? 0 : pad + y * sd;
        const sy1 = y === h - 1 ? cv.height : pad + (y + 1) * sd;
        const off = m.row(h > 1 ? y / (h - 1) : 0);
        ctx.drawImage(src, 0, sy0, cv.width, sy1 - sy0, left + off, top + sy0 * scale, cv.width * scale, (sy1 - sy0) * scale + 0.5);
      }
    } else {
      ctx.drawImage(src, left, top, cv.width * scale, cv.height * scale);
    }
    ctx.restore();
  }

  bounds() {
    return { x: this.cx - this.W / 2, y: this.cy - this.H / 2, w: this.W, h: this.H };
  }

  add(p) {
    if (this.parts.length < 160) this.parts.push(p);
  }

  burst() {
    const b = this.bounds();
    const cols = [...FX_COLORS.confetti, ...this.accents];
    const n = Math.round(34 * this.fxScale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 160 + Math.random() * 260;
      this.add({
        type: 'confetti', x: b.x + b.w / 2, y: b.y + b.h / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
        g: 420, drag: 1.6, life: 1.6 + Math.random() * 0.8, age: 0, size: 5 + Math.random() * 5,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, color: cols[i % cols.length],
      });
    }
    for (let i = 0; i < Math.round(8 * this.fxScale); i++) this.emit(true);
  }

  spawn(dt, t) {
    this.acc += dt * (FX_RATE[this.fx] || 2) * this.fxScale;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.emit(false);
    }
  }

  emit(burst) {
    const b = this.bounds();
    const R = Math.random;
    const cols = FX_COLORS[this.fx] || FX_COLORS.sparkles;
    const color = cols[Math.floor(R() * cols.length)];
    const u = Math.max(this.W, this.H);
    const p = { type: this.fx, age: 0, rot: 0, vr: 0, g: 0, drag: 0, color, seed: R() * 10 };
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    switch (this.fx) {
      case 'hearts':
      case 'notes':
        Object.assign(p, { x: cx + (R() - 0.5) * b.w * 1.1, y: b.y + b.h * (0.1 + R() * 0.5), vx: (R() - 0.5) * 20, vy: -40 - R() * 40, life: 2 + R(), size: u * (0.06 + R() * 0.04) + 6 });
        if (burst) Object.assign(p, { vx: (R() - 0.5) * 220, vy: -80 - R() * 160, drag: 1.2 });
        break;
      case 'sparkles':
        Object.assign(p, { x: cx + (R() - 0.5) * b.w * 1.4, y: cy + (R() - 0.5) * b.h * 1.4, vx: 0, vy: 0, life: 0.9 + R() * 0.5, size: u * (0.03 + R() * 0.04) + 4 });
        break;
      case 'stars': {
        const a = R() * TAU;
        const sp = burst ? 200 + R() * 120 : 60 + R() * 70;
        Object.assign(p, { x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 1.4, life: 1.4 + R() * 0.6, size: u * (0.04 + R() * 0.035) + 5, vr: (R() - 0.5) * 4 });
        break;
      }
      case 'bubbles':
        Object.assign(p, { x: cx + (R() - 0.5) * b.w * 1.3, y: b.y + b.h * (0.5 + R() * 0.6), vx: 0, vy: -50 - R() * 50, life: 2.4 + R(), size: u * (0.025 + R() * 0.035) + 3 });
        break;
      case 'zzz':
        Object.assign(p, { x: b.x + b.w * 0.75, y: b.y + b.h * 0.2, vx: 18 + R() * 12, vy: -34 - R() * 14, life: 2.6, size: u * 0.07 + 8 });
        break;
      case 'petals':
      case 'leaves':
      case 'confetti':
      case 'snow':
        Object.assign(p, { x: R() * this.cw, y: -20, vx: (R() - 0.5) * 30, vy: 40 + R() * 50, life: (this.ch + 40) / 60, size: (this.fx === 'snow' ? 3 + R() * 4 : 6 + R() * 6) * (u > 200 ? 1.3 : 1), vr: (R() - 0.5) * 5, rot: R() * TAU });
        if (this.fx === 'confetti') p.color = [...cols, ...this.accents][Math.floor(R() * (cols.length + this.accents.length))];
        if (burst) Object.assign(p, { x: cx + (R() - 0.5) * b.w, y: cy, vx: (R() - 0.5) * 300, vy: -200 - R() * 200, g: 300, drag: 0.8, life: 3 });
        break;
      case 'steam':
        Object.assign(p, { x: cx + (R() - 0.5) * b.w * 0.5, y: b.y + b.h * 0.05, vx: (R() - 0.5) * 10, vy: -30 - R() * 20, life: 1.8 + R() * 0.6, size: u * 0.05 + 4 });
        break;
      case 'embers':
        Object.assign(p, { x: cx + (R() - 0.5) * b.w, y: b.y + b.h * (0.3 + R() * 0.7), vx: (R() - 0.5) * 30, vy: -60 - R() * 60, life: 1.2 + R() * 0.8, size: 2 + R() * 3 });
        break;
      default:
        Object.assign(p, { x: cx, y: cy, vx: 0, vy: 0, life: 1, size: 6 });
    }
    this.add(p);
  }

  drawParts(dt) {
    const { ctx } = this;
    const keep = [];
    for (const p of this.parts) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy += p.g * dt;
      if (p.drag) {
        p.vx *= 1 - Math.min(1, p.drag * dt);
        p.vy *= 1 - Math.min(1, p.drag * dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      keep.push(p);
      const k = p.age / p.life;
      const fade = k < 0.12 ? k / 0.12 : k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, fade));
      const sway = Math.sin(p.age * 3 + p.seed) * 8;
      switch (p.type) {
        case 'hearts':
          ctx.translate(p.x + sway, p.y);
          ctx.rotate(Math.sin(p.age * 2 + p.seed) * 0.25);
          ctx.fillStyle = p.color;
          heartPath(ctx, p.size);
          ctx.fill();
          break;
        case 'notes': {
          ctx.translate(p.x + sway, p.y);
          ctx.rotate(Math.sin(p.age * 2 + p.seed) * 0.2);
          const s = p.size * 0.5;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(-s * 0.4, s * 0.8, s * 0.55, s * 0.4, -0.4, 0, TAU);
          ctx.fill();
          ctx.fillRect(s * 0.05, -s * 1.1, s * 0.22, s * 1.95);
          ctx.beginPath();
          ctx.moveTo(s * 0.27, -s * 1.1);
          ctx.quadraticCurveTo(s * 1.1, -s * 0.7, s * 0.8, -s * 0.1);
          ctx.quadraticCurveTo(s * 0.8, -s * 0.6, s * 0.27, -s * 0.6);
          ctx.fill();
          break;
        }
        case 'sparkles': {
          ctx.translate(p.x, p.y);
          const q = Math.sin(k * Math.PI);
          ctx.scale(q, q);
          ctx.fillStyle = p.color;
          ctx.shadowColor = 'rgba(255, 240, 180, 0.9)';
          ctx.shadowBlur = 6;
          sparklePath(ctx, p.size);
          ctx.fill();
          break;
        }
        case 'stars':
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          starPath(ctx, p.size);
          ctx.fill();
          break;
        case 'bubbles':
          ctx.translate(p.x + sway * 0.8, p.y);
          ctx.strokeStyle = 'rgba(160, 220, 255, 0.95)';
          ctx.lineWidth = Math.max(1.5, p.size * 0.14);
          ctx.fillStyle = 'rgba(220, 245, 255, 0.25)';
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.beginPath();
          ctx.arc(-p.size * 0.35, -p.size * 0.35, p.size * 0.22, 0, TAU);
          ctx.fill();
          break;
        case 'zzz':
          ctx.translate(p.x + sway * 0.5, p.y);
          ctx.rotate(-0.2);
          ctx.fillStyle = p.color;
          ctx.font = `900 ${Math.round(p.size * (0.6 + k * 0.6))}px Nunito, system-ui, sans-serif`;
          ctx.fillText('z', 0, 0);
          break;
        case 'petals':
          ctx.translate(p.x + sway * 2, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 0.9, p.size * 0.5, 0, 0, TAU);
          ctx.fill();
          break;
        case 'leaves':
          ctx.translate(p.x + sway * 2.5, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          leafPath(ctx, p.size);
          ctx.fill();
          break;
        case 'confetti':
          ctx.translate(p.x + (p.g ? 0 : sway), p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.age * 6 + p.seed));
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
          break;
        case 'snow':
          ctx.translate(p.x + sway * 1.5, p.y);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, TAU);
          ctx.fill();
          break;
        case 'steam': {
          ctx.translate(p.x + sway, p.y);
          const r = p.size * (0.6 + k * 1.2);
          ctx.globalAlpha *= 0.45;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, TAU);
          ctx.fill();
          break;
        }
        case 'embers':
          ctx.translate(p.x + sway * 0.6, p.y);
          ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(p.age * 20 + p.seed);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, TAU);
          ctx.fill();
          break;
        default:
          break;
      }
      ctx.restore();
    }
    this.parts = keep;
  }
}

import { mulberry32 } from './rng.js';
import { Nonogram } from './nonogram.js';
import { buildPuzzle } from './puzzle.js';

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hx = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hx(f(0))}${hx(f(8))}${hx(f(4))}`.toUpperCase();
}

const TYPES = [
  ['blob', 10], ['slime', 9], ['cat', 10], ['bear', 9], ['bunny', 9], ['bird', 8], ['ghost', 7],
  ['octo', 6], ['bug', 6], ['cloud', 5], ['robot', 5], ['sprout', 6], ['shroom', 5], ['fox', 6],
];

const NOUNS = {
  blob: ['Mochi', 'Puffball', 'Dumpling', 'Blobby'],
  slime: ['Slime', 'Goo', 'Jellyblob', 'Gloop'],
  cat: ['Kitling', 'Mewmew', 'Catbun', 'Purrlet'],
  bear: ['Cubby', 'Bearlet', 'Teddling'],
  bunny: ['Bunbun', 'Hopper', 'Floppet'],
  bird: ['Chirplet', 'Tweetle', 'Peep'],
  ghost: ['Ghostie', 'Wisp', 'Boolet'],
  octo: ['Octopup', 'Squidlet', 'Inkling'],
  bug: ['Beetlebop', 'Buzzlet', 'Bugsy'],
  cloud: ['Cloudlet', 'Puff', 'Drizzle'],
  robot: ['Beepbot', 'Bolt', 'Gizmo'],
  sprout: ['Sproutling', 'Seedling', 'Budlet'],
  shroom: ['Shroomie', 'Capling', 'Sporelet'],
  fox: ['Foxlet', 'Kitsu', 'Fluffytail'],
};

const MOTION = {
  blob: ['jelly', 'bounce'], slime: ['jelly'], cat: ['wiggle', 'hop'], bear: ['march', 'wiggle'], bunny: ['hop'],
  bird: ['flap'], ghost: ['float'], octo: ['swim', 'float'], bug: ['buzz'], cloud: ['float'], robot: ['march', 'buzz'],
  sprout: ['sway'], shroom: ['jelly', 'sway'], fox: ['hop', 'wiggle'],
};

const FX = {
  blob: ['hearts', 'sparkles'], slime: ['bubbles', 'sparkles'], cat: ['hearts', 'notes'], bear: ['hearts', 'notes'],
  bunny: ['hearts', 'petals'], bird: ['notes', 'leaves'], ghost: ['sparkles', 'stars'], octo: ['bubbles'], bug: ['leaves', 'sparkles'],
  cloud: ['snow', 'sparkles'], robot: ['stars', 'sparkles'], sprout: ['leaves', 'petals'], shroom: ['sparkles', 'leaves'], fox: ['leaves', 'hearts'],
};

const HUE_ADJ = [
  [0, ['Strawberry', 'Cherry', 'Rosy']], [20, ['Peachy', 'Apricot', 'Tangerine']], [45, ['Lemon', 'Honey', 'Sunny']],
  [70, ['Minty', 'Matcha', 'Pistachio']], [160, ['Seafoam', 'Aqua', 'Lagoon']], [200, ['Blueberry', 'Sky', 'Denim']],
  [250, ['Grape', 'Lavender', 'Plum']], [290, ['Bubblegum', 'Taffy', 'Orchid']], [340, ['Strawberry', 'Cherry', 'Rosy']],
];

const LIKES = ['warm socks', 'bubble baths', 'rainy days', 'tiny hats', 'belly rubs', 'puddles', 'humming', 'soft blankets', 'stargazing', 'naps in sunbeams', 'the smell of toast', 'hide and seek', 'your playlist'];
const FEARS = ['vacuum cleaners', 'Mondays', 'cucumbers', 'loud sneezes', 'the dark (a little)', 'empty snack bowls', 'alarm clocks', 'bath time', 'goodbyes'];
const WHEN = ['at dawn', 'during a thunderstorm', 'on a Tuesday', 'under a rainbow', 'in a teacup', 'in your pocket', 'at exactly midnight', 'in a sock drawer'];
const DONE = ['ate three cookies', 'made four friends', 'lost one sock', 'learned to wink', 'fallen asleep twice', 'named a cloud', 'hidden a snack'];
const SNACK = ['blueberries', 'toast crusts', 'honey drops', 'moon cheese', 'seaweed chips', 'jelly beans', 'clover leaves', 'warm milk'];
const SPOT = ['your keyboard', 'the laundry basket', 'a flower pot', 'the fruit bowl', 'a warm teapot', 'your hood', 'the top shelf'];
const SKILL = ['whistle', 'juggle peas', 'sing in harmony', 'count to ten', 'float a little', 'do a backflip', 'moonwalk'];
const WHILE = ['on Sundays', 'when nobody looks', 'after snacks', 'in the rain', 'with its eyes closed', 'on tiptoes'];
const COLLECT = ['shiny pebbles', 'buttons', 'four-leaf clovers', 'bottle caps', 'feathers', 'raindrops', 'tiny spoons'];

export const RARITY = [
  { id: 'common', label: 'Common', p: 0.6 },
  { id: 'uncommon', label: 'Uncommon', p: 0.28 },
  { id: 'rare', label: 'Rare', p: 0.1 },
  { id: 'legendary', label: 'Legendary', p: 0.02 },
];

function blurbFor(pick) {
  const n = 2 + Math.floor(pick([0, 1, 2, 3, 4, 5, 6, 7]));
  const t = [
    () => `Loves ${pick(LIKES)}. Afraid of ${pick(FEARS)}.`,
    () => `Hatched ${pick(WHEN)}. Has already ${pick(DONE)}.`,
    () => `Favourite snack: ${pick(SNACK)}. Naps on ${pick(SPOT)}.`,
    () => `Can ${pick(SKILL)}, but only ${pick(WHILE)}.`,
    () => `Collects ${pick(COLLECT)}. Has ${n} so far.`,
  ];
  return pick(t)();
}

export function makeCritter(seed, size = 15, opts = {}) {
  const rng = mulberry32(seed);
  const R = () => rng();
  const pick = (a) => a[Math.floor(R() * a.length)];
  const W = size;
  const H = size;
  const roll = R();
  let acc = 0;
  let rarity = RARITY[0];
  for (const r of RARITY) {
    acc += r.p;
    if (roll < acc) {
      rarity = r;
      break;
    }
  }
  if (opts.rarity) rarity = RARITY.find((r) => r.id === opts.rarity) || rarity;
  const total = TYPES.reduce((s, t) => s + t[1], 0);
  let tr = R() * total;
  let type = TYPES[0][0];
  for (const [t, wgt] of TYPES) {
    tr -= wgt;
    if (tr <= 0) {
      type = t;
      break;
    }
  }
  if (opts.type) type = opts.type;

  const M = Array.from({ length: H }, () => new Array(W).fill(0));
  const C = Array.from({ length: H }, () => new Array(W).fill('.'));
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const mid = W / 2;
  const mirror = (x) => W - 1 - x;
  const markS = (x, y, v = 1) => {
    if (!inb(x, y)) return;
    M[y][x] = v;
    M[y][mirror(x)] = v;
  };
  const paint = (x, y, ch) => {
    if (inb(x, y)) C[y][x] = ch;
  };
  const paintS = (x, y, ch) => {
    paint(x, y, ch);
    paint(mirror(x), y, ch);
  };
  const ellipse = (cx, cy, rx, ry, fn) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) fn(x, y);
      }
    }
  };
  const tri = (ax, ay, bx0, bx1, by, fn) => {
    for (let y = Math.floor(ay); y <= Math.ceil(by); y++) {
      if (y < 0 || y >= H) continue;
      const t = (y + 0.5 - ay) / Math.max(0.5, by - ay);
      if (t < 0 || t > 1) continue;
      const l = ax + (bx0 - ax) * t;
      const r = ax + (bx1 - ax) * t;
      for (let x = 0; x < W; x++) if (x + 0.5 >= l - 0.2 && x + 0.5 <= r + 0.2) fn(x, y);
    }
  };

  const small = W <= 11;
  const big = W >= 18;
  const earH = { cat: 0.2, fox: 0.24, bear: 0.12, bunny: 0.34, bird: 0.08, robot: 0.2, sprout: 0.22, bug: 0.2, shroom: 0, cloud: 0.1 }[type] ?? 0;
  const feet = !['ghost', 'octo', 'slime', 'cloud', 'shroom'].includes(type) && !small && R() < 0.75;
  const topPad = Math.round(H * earH);
  const y0 = 1 + topPad;
  const y1 = H - 2 - (feet ? 1 : 0) - (type === 'octo' ? Math.round(H * 0.16) : 0);
  const bh = y1 - y0 + 1;
  const flat = ['slime', 'robot', 'cloud', 'ghost'].includes(type);
  const hwMax = (W / 2 - 1 - (['bird', 'bear'].includes(type) && !small ? 0.6 : 0)) * (type === 'robot' || type === 'cloud' ? 1 : 0.86 + R() * 0.14);
  const bodyCy = y0 + bh / 2;
  const hwAt = (y) => {
    const v = (y + 0.5 - bodyCy) / (bh / 2);
    if (v < -1 || v > 1) return 0;
    if (type === 'robot') return v < -0.8 || v > 0.85 ? hwMax - 1 : hwMax;
    if (type === 'cloud') {
      if (v > 0) return v > 0.8 ? hwMax - 0.6 : hwMax;
      return hwMax * Math.sqrt(Math.max(0, 1 - v * v)) * 1.05;
    }
    if (flat && v > 0) return hwMax * (type === 'ghost' ? 1 : v > 0.75 ? 0.97 : 1);
    if (type === 'shroom') return v < 0.1 ? hwMax * Math.sqrt(Math.max(0, 1 - ((v + 0.1) / 1.1) ** 2)) * 1.02 : hwMax * 0.62;
    const base = Math.sqrt(Math.max(0, 1 - v * v));
    return hwMax * Math.min(1, base * 1.08);
  };
  for (let y = y0; y <= y1; y++) {
    const hw = hwAt(y);
    for (let x = 0; x < W; x++) if (Math.abs(x + 0.5 - mid) < hw) M[y][x] = 1;
  }
  if (type === 'cloud') {
    const r = Math.max(1.4, W * 0.17);
    for (const [fx, fy] of [[-0.45, 0.05], [0, -0.12], [0.45, 0.05]]) {
      ellipse(mid + fx * hwMax * 1.1, y0 + bh * 0.3 + fy * bh, r, r * 0.95, (x, y) => {
        if (y >= 1 && x >= 1 && x <= W - 2) M[y][x] = 1;
      });
    }
    for (let y = y0; y < y0 + bh * 0.35; y++) for (let x = 0; x < W; x++) if (M[y][x] && Math.abs(x + 0.5 - mid) > hwMax * 0.98) M[y][x] = 0;
  }
  if (type === 'ghost') {
    for (let x = 0; x < W; x++) if (M[y1][x] && ((x < mid ? x : mirror(x)) % 2 === 0)) M[y1][x] = 0;
  }
  if (type === 'octo') {
    const legs = small ? 3 : W >= 18 ? 5 : 4;
    const len = Math.round(H * 0.16) + 1;
    const span = hwMax * 1.7;
    for (let k = 0; k < legs; k++) {
      const cx = mid - span / 2 + (span * (k + 0.5)) / legs;
      const lw = Math.max(1, Math.round((span / legs) * 0.55));
      for (let d = 0; d < len; d++) {
        const wob = d === len - 1 ? (cx < mid ? -1 : 1) : 0;
        for (let t = 0; t < lw; t++) {
          const x = Math.round(cx - lw / 2 + t) + wob;
          if (x >= 1 && x <= W - 2) M[y1 + d][x] = 1, (M[y1 + d][mirror(x)] = 1);
        }
      }
    }
  }
  const earCells = [];
  const markEar = (x, y) => {
    if (y < 1 || x < 1 || x > W - 2) return;
    markS(x, y);
    earCells.push([x, y]);
  };
  const exBase = mid - hwMax * 0.55;
  if (type === 'cat' || type === 'fox') {
    const bw = Math.max(1.4, W * (type === 'fox' ? 0.17 : 0.16));
    const ax = mid - hwMax * 0.72;
    tri(ax, 1, ax - bw * 0.35, ax + bw * 1.25, y0 + 1.5, markEar);
  } else if (type === 'bear') {
    ellipse(exBase - 0.3, y0 + 0.3, Math.max(1.3, W * 0.12), Math.max(1.3, H * 0.12), markEar);
  } else if (type === 'bunny') {
    ellipse(mid - hwMax * 0.42, 1 + topPad / 2 + 0.6, Math.max(1.05, W * 0.075), topPad / 2 + 1.2, markEar);
  } else if (type === 'robot' || type === 'bug') {
    const ax = Math.round(exBase + (type === 'robot' ? 1 : 0));
    for (let y = 2; y < y0 + 1; y++) markS(ax, y);
    const bs = small ? 1 : 2;
    for (let dy = 0; dy < bs; dy++) for (let dx = 0; dx < bs; dx++) markS(ax - (bs > 1 ? dx : 0), 1 + dy, 2);
  } else if (type === 'sprout') {
    const cx = Math.floor(mid);
    for (let y = y0 - 1; y <= y0; y++) {
      M[y][cx] = 3;
      if (W % 2 === 0) M[y][cx - 1] = 3;
    }
    ellipse(mid - W * 0.14, 1 + topPad * 0.45, Math.max(1.2, W * 0.13), Math.max(1, topPad * 0.4), (x, y) => {
      if (M[y][x] === 0 && x < mid) M[y][x] = 4;
    });
    ellipse(mid + W * 0.14, 1 + topPad * 0.45, Math.max(1.2, W * 0.13), Math.max(1, topPad * 0.4), (x, y) => {
      if (M[y][x] === 0 && x >= mid) M[y][x] = 4;
    });
  } else if (type === 'bird' && !small) {
    const cx = Math.floor(mid);
    M[y0 - 1][cx] = 1;
    if (W % 2 === 0) M[y0 - 1][cx - 1] = 1;
  }
  if (type === 'bird' || (type === 'bear' && !small && R() < 0.5)) {
    const wy = Math.round(bodyCy + bh * 0.1);
    for (let y = wy - 1; y <= wy + 1; y++) markS(1, y);
  }
  if (feet) {
    const fx = Math.round(mid - hwMax * 0.5);
    const fw = big ? 3 : 2;
    for (let t = 0; t < fw; t++) markS(fx - t + 1, y1 + 1, 5);
  }

  const inMask = (x, y) => inb(x, y) && M[y][x] > 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (M[y][x]) continue;
      if (inMask(x - 1, y) || inMask(x + 1, y) || inMask(x, y - 1) || inMask(x, y + 1)) C[y][x] = 'o';
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = M[y][x];
      if (!v) continue;
      C[y][x] = v === 2 ? 'x' : v === 3 ? 'g' : v === 4 ? 'g' : v === 5 ? 'a' : 'b';
    }
  }
  if (!small) {
    const rim = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (C[y][x] !== 'b') continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inb(x + dx, y + dy) || C[y + dy][x + dx] === 'o' || C[y + dy][x + dx] === '.');
        if (edge) rim.push([x, y]);
      }
    }
    for (const [x, y] of rim) C[y][x] = 'r';
  }
  if (earCells.length && ['cat', 'fox', 'bear', 'bunny'].includes(type)) {
    for (const [x, y] of earCells) {
      const interior = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => inMask(x + dx, y + dy));
      if (interior && y < y0 + (type === 'bear' ? 1 : 0) && y > (type === 'bunny' ? 1 : 0)) paintS(x, y, 'a');
    }
  }
  if (type === 'shroom') {
    const capEnd = Math.round(bodyCy + bh * 0.05);
    for (let y = y0; y <= capEnd; y++) for (let x = 0; x < W; x++) if (M[y][x]) C[y][x] = 'a';
    const dots = small ? [[0.35, 0.3]] : [[0.3, 0.35], [0.62, 0.15]];
    for (const [fxr, fyr] of dots) {
      const dx = Math.round(mid - hwMax * fxr - 1);
      const dy = Math.round(y0 + (capEnd - y0) * fyr) + 1;
      const ds = big ? 2 : 1;
      for (let a = 0; a < ds; a++) for (let b = 0; b < ds; b++) if (M[dy + a]?.[dx + b]) paintS(dx + b, dy + a, 'l');
    }
  }

  const pattern = type === 'shroom' || type === 'robot' ? 'none' : pick(['none', 'none', 'belly', 'belly', 'spots', 'stripes', 'band']);
  const faceTop = type === 'shroom' ? Math.round(bodyCy + bh * 0.08) : y0;
  const faceH = y1 - faceTop + 1;
  let eyeY = faceTop + Math.round(faceH * (type === 'shroom' ? 0.3 : type === 'robot' ? 0.35 : 0.42));
  if (type === 'octo') eyeY = y0 + Math.round(bh * 0.45);
  const eyeStyle = rarity.id === 'common' && R() < 0.22 ? pick(['happy', 'sleepy']) : 'big';
  const ew = big ? (R() < 0.5 ? 3 : 2) : small ? 1 : 2;
  const eh = big ? 3 : small ? 2 : 2;
  const spread = hwAt(eyeY + 1) * (type === 'robot' ? 0.5 : 0.46);
  const lx = Math.round(mid - spread - ew / 2 - 0.3);

  if (pattern === 'belly' && !small) {
    ellipse(mid, y1 - bh * 0.18, hwMax * 0.5, bh * 0.26, (x, y) => {
      if (C[y][x] === 'b' && y > eyeY + eh) C[y][x] = 'l';
    });
  } else if (pattern === 'spots') {
    const n = big ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const sx = Math.round(mid - hwMax * (0.5 + R() * 0.35));
      const sy = Math.round(y0 + bh * (0.15 + R() * 0.7));
      if (Math.abs(sy - eyeY) < eh + 1 && Math.abs(sx - lx) < ew + 2) continue;
      const ss = big ? 2 : 1;
      for (let a = 0; a < ss; a++) for (let b = 0; b < ss; b++) if (C[sy + a]?.[sx + b] === 'b') paintS(sx + b, sy + a, 'a');
    }
  } else if (pattern === 'stripes') {
    const cx = Math.floor(mid);
    const len = Math.max(1, Math.round(bh * 0.18));
    const xs = W % 2 ? [cx, cx - 2] : [cx - 1, cx - 3];
    for (const x of xs) for (let d = 0; d < len; d++) if (C[y0 + d]?.[x] === 'b') paintS(x, y0 + d, 'a');
  } else if (pattern === 'band') {
    const by = Math.min(y1 - 1, eyeY + eh + (big ? 3 : 2));
    for (let x = 0; x < W; x++) if (C[by][x] === 'b') C[by][x] = 'a';
  }

  for (let dy = 0; dy < eh; dy++) {
    for (let dx = 0; dx < ew; dx++) {
      const x = lx + dx;
      const y = eyeY + dy;
      if (eyeStyle === 'big') paintS(x, y, 'e');
    }
  }
  if (eyeStyle === 'big' && !small) {
    paint(lx, eyeY, 'h');
    paint(mirror(lx + ew - 1), eyeY, 'h');
    if (big && ew === 3 && rarity.id !== 'common') {
      paint(lx + 2, eyeY + 2, 'h');
      paint(mirror(lx + ew - 1) + 2, eyeY + 2, 'h');
    }
  } else if (eyeStyle === 'happy') {
    const y = eyeY + (eh > 2 ? 1 : 0);
    if (ew >= 2) {
      paintS(lx, y + 1, 'k');
      for (let dx = 0; dx < ew; dx++) paintS(lx + dx, y, 'k');
      paintS(lx + ew - 1, y + 1, 'k');
      if (ew === 2) paintS(lx + 1, y + 1, 'k'), paintS(lx, y + 1, 'k'), paintS(lx + 1, y, 'b'), paintS(lx, y, 'k');
    } else {
      paintS(lx, y, 'k');
    }
  } else if (eyeStyle === 'sleepy') {
    const y = eyeY + eh - 1;
    for (let dx = -1; dx < ew; dx++) if (C[y][lx + dx] === 'b' || C[y][lx + dx] === 'l') paintS(lx + dx, y, 'k');
  }
  const blushY = eyeY + eh - (big ? 0 : 0);
  const bw = small ? 1 : 2;
  for (let t = 0; t < bw; t++) {
    const x = lx - 1 - t;
    const y = blushY + (small ? 0 : 0);
    if (C[y]?.[x] === 'b' || C[y]?.[x] === 'l') paintS(x, y, 'p');
  }
  const mouthY = eyeY + eh - (small ? 0 : 1) + (big ? 1 : 1);
  const odd = W % 2 === 1;
  const cx = Math.floor(mid);
  const mouthKind = type === 'bird' ? 'beak' : pick(small ? ['dot'] : ['dot', 'smile', 'smile', 'open', 'cat']);
  const put = (x, y, ch) => {
    if (inb(x, y) && C[y][x] !== 'o' && C[y][x] !== '.') C[y][x] = ch;
  };
  const putS = (x, y, ch) => {
    put(x, y, ch);
    put(mirror(x), y, ch);
  };
  if (mouthKind === 'beak') {
    const y = mouthY - (small ? 0 : 1);
    if (odd) put(cx, y, 'x'), put(cx, y + 1, 'x');
    else putS(cx - 1, y, 'x'), big && putS(cx - 1, y + 1, 'x');
  } else if (mouthKind === 'dot') {
    if (odd) put(cx, mouthY, 'k');
    else putS(cx - 1, mouthY, 'k');
  } else if (mouthKind === 'smile' || mouthKind === 'open') {
    if (odd) {
      putS(cx - 1, mouthY, 'k');
      put(cx, mouthY + 1, 'k');
      if (mouthKind === 'open' && big) put(cx, mouthY, 'p');
    } else {
      putS(cx - 2, mouthY, 'k');
      putS(cx - 1, mouthY + 1, 'k');
      if (mouthKind === 'open') putS(cx - 1, mouthY, 'p');
    }
  } else if (mouthKind === 'cat') {
    if (odd) {
      put(cx, mouthY, 'k');
      putS(cx - 1, mouthY + 1, 'k');
    } else {
      putS(cx - 1, mouthY, 'k');
      putS(cx - 2, mouthY + 1, 'k');
    }
  }
  const crown = rarity.id === 'legendary' || (rarity.id === 'rare' && R() < 0.5);
  if (crown && y0 >= 3 && !['bunny', 'robot', 'bug', 'sprout'].includes(type)) {
    const cw = Math.max(2, Math.round(W * 0.16));
    const x0 = Math.round(mid - cw);
    for (let x = x0; x < x0 + cw; x++) {
      if (x < 1) continue;
      paintS(x, y0 - 1, 'c');
      if ((x - x0) % 2 === 0) paintS(x, y0 - 2, 'c');
    }
  } else if (rarity.id !== 'common' && !small && R() < 0.5) {
    const sx = Math.round(mid - hwMax * 0.62);
    const sy = y0 + Math.round(bh * 0.12);
    if (C[sy]?.[sx] === 'b') {
      paint(sx, sy, 'c');
      paint(sx + 1, sy, 'c');
      paint(sx, sy + 1, 'c');
      if (C[sy - 1]?.[sx + 1] === 'b') paint(sx + 1, sy - 1, 'c');
    }
  }

  let hue = Math.floor(R() * 360);
  let sBody = 62 + R() * 22;
  let lBody = 70 + R() * 10;
  if (type === 'ghost' && R() < 0.6) (sBody = 40), (lBody = 90), (hue = 240 + R() * 40);
  if (type === 'cloud' && R() < 0.7) (sBody = 55), (lBody = 92), (hue = 200 + R() * 30);
  if (type === 'fox' && R() < 0.7) (hue = 22 + R() * 10), (sBody = 85), (lBody = 64);
  let pal = {
    o: hsl(hue, Math.min(60, sBody), 30),
    b: hsl(hue, sBody, lBody),
    r: hsl(hue, sBody, lBody),
    l: hsl(hue, sBody * 0.9, Math.min(95, lBody + 13)),
    a: type === 'shroom' ? hsl(pick([355, 8, 280, 200]), 72, 58) : hsl(hue + pick([30, 150, 180, 210, -30]), 70, 66),
    e: '#2B2233',
    k: '#2B2233',
    h: '#FFFFFF',
    p: hsl(345, 90, 76),
    x: hsl(hue + 180, 75, 60),
    g: hsl(115, 55, 48),
    c: '#FFCF33',
  };
  if (type === 'bird') pal.x = '#FF9F43';
  if (['cat', 'bear', 'bunny', 'fox'].includes(type) && R() < 0.7) pal.a = hsl(345, 85, 80);
  if (type === 'shroom') pal.l = '#FFF6EA', (pal.b = hsl(38, 60, 88)), (pal.o = hsl(20, 40, 32));
  pal.r = pal.b;
  if (Math.abs(((hue - 345 + 540) % 360) - 180) < 25) pal.p = hsl(345, 95, 62);
  if (rarity.id === 'legendary') {
    const gold = R() < 0.5;
    pal = { ...pal, o: gold ? '#9A6A12' : hsl(265, 55, 28), b: gold ? '#FFD86B' : hsl(265, 70, 78), l: gold ? '#FFF1B8' : hsl(190, 80, 85), a: gold ? '#FFB23F' : hsl(320, 80, 72) };
    pal.r = pal.b;
  }

  const art = C.map((r) => r.join(''));
  const used = new Set(art.join('').replace(/\./g, ''));
  for (const k of Object.keys(pal)) if (!used.has(k)) delete pal[k];

  const adjs = HUE_ADJ.reduce((best, [h0, list]) => (hue >= h0 ? list : best), HUE_ADJ[0][1]);
  let adj = pick(adjs);
  if (rarity.id === 'legendary') adj = pick(['Golden', 'Cosmic', 'Royal', 'Starry']);
  else if (pattern === 'spots' && R() < 0.5) adj = 'Spotted';
  else if (pattern === 'stripes' && R() < 0.5) adj = 'Stripy';
  else if (eyeStyle === 'sleepy' && R() < 0.6) adj = 'Sleepy';
  else if (eyeStyle === 'happy' && R() < 0.6) adj = 'Giggly';
  const noun = pick(NOUNS[type]);
  const name = `${adj} ${noun}`;
  const motion = rarity.id === 'legendary' ? 'glow' : pick(MOTION[type]);
  const fx = rarity.id === 'legendary' ? 'stars' : eyeStyle === 'sleepy' ? 'zzz' : pick(FX[type]);
  return {
    id: `c${size}-${seed.toString(36)}`,
    seed,
    size,
    type,
    rarity: rarity.id,
    rarityLabel: rarity.label,
    name,
    article: /^[aeiou]/i.test(name) ? 'an' : 'a',
    blurb: blurbFor(pick),
    motion,
    fx,
    pal,
    art,
    w: W,
    h: H,
  };
}

function fill(sol) {
  let n = 0;
  for (const v of sol) if (v) n++;
  return n / sol.length;
}

export function critterPuzzle(seed, size, mode) {
  let best = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const s = (seed + attempt * 7919) >>> 0;
    const fig = makeCritter(s, size);
    const rr = mulberry32(s ^ 0x9e3779b9);
    const optsList = (mode === 'color' ? ['hp', 'hpl', 'hpc', 'hpa'] : ['blhpc', 'blhpc', 'bhp', 'bhpc', 'lhpk', 'ehkpl', 'ehk']).map((h) => [rr(), h]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    for (const holes of optsList) {
      const f = { ...fig, holes, seedUsed: s };
      const P = buildPuzzle(f, mode);
      if (mode === 'color' && (P.ncolors < 2 || P.ncolors > 5)) continue;
      const r = fill(P.sol);
      if (r < 0.26 || r > 0.74) continue;
      const ng = new Nonogram({ w: P.w, h: P.h, sol: P.sol, ncolors: P.ncolors });
      const { givens } = ng.findGivens({ maxCandidates: 60 });
      const score = givens.length / (P.w * P.h) + Math.abs(r - 0.5) * 0.1;
      if (!best || score < best.score) best = { fig: f, givens, score };
      if (givens.length / (P.w * P.h) <= 0.02) return best;
    }
  }
  if (!best) {
    const fig = { ...makeCritter(seed, size), holes: 'hp' };
    const P = buildPuzzle(fig, mode);
    const ng = new Nonogram({ w: P.w, h: P.h, sol: P.sol, ncolors: P.ncolors });
    best = { fig, givens: ng.findGivens().givens };
  }
  return best;
}

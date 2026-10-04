import { db } from './store.js';

let ctx = null;
let last = 0;

function audio() {
  if (!db.settings.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, { at = 0, dur = 0.08, type = 'triangle', gain = 0.07, to = null } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1567.98, 1760];

function throttle(ms = 30) {
  const now = performance.now();
  if (now - last < ms) return false;
  last = now;
  return true;
}

export const sfx = {
  fill(n = 0) {
    if (!throttle()) return;
    tone(SCALE[n % 5] * 0.5, { dur: 0.07, gain: 0.06 });
  },
  cross() {
    if (!throttle()) return;
    tone(330, { dur: 0.04, type: 'sine', gain: 0.04 });
  },
  erase() {
    if (!throttle()) return;
    tone(220, { dur: 0.05, type: 'sine', gain: 0.04 });
  },
  tap() {
    tone(880, { dur: 0.03, type: 'sine', gain: 0.03 });
  },
  line() {
    tone(1046.5, { dur: 0.08, type: 'sine', gain: 0.035 });
    tone(1318.5, { at: 0.05, dur: 0.1, type: 'sine', gain: 0.03 });
  },
  hint() {
    tone(698.46, { dur: 0.09, type: 'sine', gain: 0.05 });
    tone(880, { at: 0.07, dur: 0.12, type: 'sine', gain: 0.05 });
  },
  error() {
    tone(196, { dur: 0.12, type: 'square', gain: 0.03 });
    tone(174.6, { at: 0.1, dur: 0.16, type: 'square', gain: 0.03 });
  },
  nudge() {
    tone(440, { dur: 0.12, type: 'sine', gain: 0.035 });
    tone(370, { at: 0.12, dur: 0.18, type: 'sine', gain: 0.03 });
  },
  solved() {
    [523.25, 659.25, 783.99].forEach((f, n) => tone(f, { at: n * 0.06, dur: 0.14, gain: 0.05 }));
  },
  flip(k) {
    tone(SCALE[k % SCALE.length], { dur: 0.05, type: 'sine', gain: 0.025 });
  },
  pop() {
    tone(260, { dur: 0.22, type: 'sine', gain: 0.09, to: 720 });
    tone(1046.5, { at: 0.12, dur: 0.12, type: 'triangle', gain: 0.04 });
  },
  chirp() {
    tone(900, { dur: 0.09, type: 'triangle', gain: 0.05, to: 1500 });
    tone(1100, { at: 0.11, dur: 0.12, type: 'triangle', gain: 0.05, to: 1900 });
  },
  fanfare() {
    [659.25, 783.99, 1046.5, 1318.5].forEach((f, n) => tone(f, { at: n * 0.09, dur: 0.25, gain: 0.045 }));
  },
};

export function buzz(pattern = 8) {
  if (!db.settings.vibrate) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

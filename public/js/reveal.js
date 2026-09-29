import { FigureStage } from './figure.js';
import { sfx, buzz } from './sound.js';
import { article } from './puzzle.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export function starsHtml(n, total = 3) {
  let out = '';
  for (let i = 0; i < total; i++) out += `<i class="st${i < n ? ' on' : ''}">${icon('star')}</i>`;
  return out;
}

let current = null;

function stageLayout() {
  const land = innerWidth > innerHeight && innerHeight < 560;
  return land ? { fitW: 0.4, fitH: 0.62, maxCell: 26, anchorX: 0.3, anchorY: 0.46 } : { fitW: 0.72, fitH: 0.4, maxCell: 26, anchorY: 0.34 };
}

export function closeReveal() {
  current?.close(true);
}

export function showReveal(o) {
  closeReveal();
  const { fig, puzzle, from, color = '#FF8FB1', tag = [], stats = null, actions = [], rarity = null, onClose } = o;
  const art = article(fig);
  const root = document.createElement('div');
  root.className = 'reveal';
  root.style.setProperty('--wc', color);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `It's ${art} ${fig.name}`);
  const statHtml = stats
    ? `<div class="rv-stats">
        <span class="rv-stars">${starsHtml(stats.stars)}</span>
        <span>${icon('clock', 'inline')} ${fmtTime(stats.time)}</span>
        ${stats.best ? '<span class="rv-best">New best!</span>' : ''}
      </div>
      <div class="rv-sub">${stats.mistakes ? `${stats.mistakes} mistake${stats.mistakes > 1 ? 's' : ''}` : 'No mistakes'} · ${stats.hints ? `${stats.hints} hint${stats.hints > 1 ? 's' : ''}` : 'no hints'}</div>`
    : '';
  root.innerHTML = `<div class="rv-bg"><div class="rv-rays"></div><div class="rv-glow"></div></div>
    <canvas class="rv-stage"></canvas>
    <button class="rv-x icon-btn" aria-label="Close">${icon('close')}</button>
    <div class="rv-hmm">What could it be<b>.</b><b>.</b><b>.</b></div>
    <div class="rv-card">
      <div class="rv-kicker">It's ${art ? esc(art) : ''}</div>
      <h2 class="rv-name">${esc(fig.name)}!</h2>
      <div class="rv-tags">${rarity ? `<span class="rar rar-${rarity.id}">${esc(rarity.label)}</span>` : ''}${tag.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <p class="rv-blurb">${esc(fig.blurb || '')}</p>
      ${o.note ? `<p class="rv-note">${esc(o.note)}</p>` : ''}
      ${statHtml}
      <div class="rv-actions">
        <button class="btn ghost rv-replay" aria-label="Replay animation">${icon('replay')}</button>
        ${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''}" data-a="${i}">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('.rv-stage');
  let stage = null;
  let timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const make = (withIntro, fromRect) => {
    stage?.stop();
    timers.forEach(clearTimeout);
    timers = [];
    root.classList.remove('popped', 'named');
    const span = 0.55 + (puzzle.w + puzzle.h) * 0.018;
    const flyEnd = fromRect ? 0.65 : 0.35;
    const total = puzzle.w * puzzle.h;
    let lastTick = 0;
    stage = new FigureStage(cv, fig, {
      ...stageLayout(),
      intro: withIntro ? { from: fromRect, sol: puzzle.sol, colors: puzzle.colors, flyEnd, flipEnd: flyEnd + span + 0.35 } : null,
      onFlipTick: (n) => {
        const step = Math.max(1, Math.round(total / 14));
        if (n - lastTick >= step) {
          lastTick = n;
          sfx.flip(Math.floor(n / step));
        }
      },
      onPop: () => {
        root.classList.add('popped');
        sfx.pop();
        buzz([15, 30, 25]);
        later(260, () => sfx.chirp());
        later(420, () => {
          root.classList.add('named');
          sfx.fanfare();
        });
      },
    });
    if (!withIntro) {
      root.classList.add('popped', 'named');
    }
    stage.start();
  };
  make(true, from || null);
  const onResize = () => {
    if (!stage) return;
    const popped = root.classList.contains('popped');
    stage.stop();
    stage = null;
    if (popped) {
      stage = new FigureStage(cv, fig, stageLayout());
      stage.start();
    } else make(true, null);
  };
  window.addEventListener('resize', onResize);
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (!root.classList.contains('popped')) stage?.skip();
  });
  root.querySelector('.rv-replay').addEventListener('click', () => {
    sfx.tap();
    make(true, null);
  });
  const api = {
    close(silent = false) {
      stage?.stop();
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', onResize);
      root.classList.add('out');
      setTimeout(() => root.remove(), 220);
      if (current === api) current = null;
      if (!silent) onClose?.();
    },
  };
  root.querySelector('.rv-x').addEventListener('click', () => {
    sfx.tap();
    api.close();
  });
  root.querySelectorAll('[data-a]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.tap();
      const a = actions[+b.dataset.a];
      api.close(true);
      a.onClick?.();
    }),
  );
  current = api;
  return api;
}

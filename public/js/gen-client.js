let worker;
let seq = 0;
const pending = new Map();
const cache = new Map();

async function local(job) {
  const { critterPuzzle } = await import('./critters.js');
  await new Promise((r) => setTimeout(r, 20));
  return critterPuzzle(job.seed, job.size, job.mode);
}

function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./gen-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.error) job.reject(new Error(e.data.error));
      else job.resolve(e.data.result);
    };
    worker.onerror = () => {
      worker = null;
      for (const [id, job] of pending) {
        pending.delete(id);
        local(job).then(job.resolve, job.reject);
      }
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function critterAsync(seed, size, mode) {
  const key = `${seed}|${size}|${mode}`;
  if (cache.has(key)) return cache.get(key);
  const w = getWorker();
  const p = w
    ? new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject, seed, size, mode });
        w.postMessage({ id, seed, size, mode });
      })
    : local({ seed, size, mode });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

import { critterPuzzle } from './critters.js';

self.onmessage = (e) => {
  const { id, seed, size, mode } = e.data;
  try {
    self.postMessage({ id, result: critterPuzzle(seed, size, mode) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

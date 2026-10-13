// Counter-based pseudo-random numbers: a pure function of (seed, tick, cell, salt).
// No hidden state, so the result never depends on how many numbers were drawn
// before or in what order cells were visited. Uses only 32-bit integer ops,
// which are identical in every JS engine.

function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Unsigned 32-bit hash of four integers. */
export function hash32(seed: number, a: number, b: number, c: number): number {
  let h = mix32((seed | 0) ^ 0x9e3779b9);
  h = mix32(h ^ (a | 0));
  h = mix32(h ^ Math.imul(b | 0, 0x85ebca6b));
  h = mix32(h ^ Math.imul(c | 0, 0xc2b2ae35));
  return h;
}

/** Deterministic number in [0, 1). */
export function rand01(seed: number, a: number, b: number, c: number): number {
  return hash32(seed, a, b, c) / 4294967296;
}

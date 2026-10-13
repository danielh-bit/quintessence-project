// Diffusion spread: the energy is stored in matter (it is state, and travels
// with moving cells). Each tick, emitters add their output to their own cell;
// then every pair of touching filled cells that do not block the energy
// exchanges conductivity * difference (double-buffered, so the result does not
// depend on visiting order), and every cell loses a fraction to the
// surroundings. Empty space holds and passes nothing.

import type { World } from "../world";
import type { Scratch } from "./scratch";

export function spreadDiffusion(
  w: World,
  s: Scratch,
  energy: number,
  conductivity: number,
  loss: number,
  sources: number[],
  field: Float64Array,
): void {
  const els = w.rules.elements;
  const elem = w.elem;
  const W = w.width;
  const H = w.height;
  const holds = (c: number) => elem[c] !== 0 && !els[elem[c]].blocks[energy];

  for (const src of sources) if (holds(src)) field[src] += w.output[src];

  const next = s.buf2;
  next.set(field);
  for (let c = 0; c < field.length; c++) {
    if (!holds(c)) continue;
    const x = c % W;
    const y = (c - x) / W;
    if (x < W - 1 && holds(c + 1)) {
      const flux = conductivity * (field[c] - field[c + 1]);
      next[c] -= flux;
      next[c + 1] += flux;
    }
    if (y < H - 1 && holds(c + W)) {
      const flux = conductivity * (field[c] - field[c + W]);
      next[c] -= flux;
      next[c + W] += flux;
    }
  }
  const keep = 1 - loss;
  for (let c = 0; c < field.length; c++) field[c] = holds(c) ? next[c] * keep : 0;
}

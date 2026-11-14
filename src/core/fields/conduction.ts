// Conduction spread: only through touching matter (4 neighbours, filled cells
// that do not block the energy), never across empty space; long range.
// Terrain, loose cells and bodies all conduct when they touch. Each source
// adds A * falloff(path length); the pitch at a cell is the amplitude-weighted
// mean of the pitch of the sources reaching it.

import type { World } from "../world";
import { falloff, type Scratch, type Sources } from "./scratch";

export function spreadConduction(
  w: World,
  s: Scratch,
  energy: number,
  range: number,
  sources: Sources,
  field: Float64Array,
  own: Float64Array,
  pitch: Float64Array,
  outside: Float64Array,
  leaked: Float64Array,
): void {
  const els = w.rules.elements;
  const elem = w.elem;
  const W = w.width;
  const H = w.height;
  const dist = s.dist;
  const q = s.queue;
  const pitchSum = s.buf;
  pitchSum.fill(0);

  for (let k = 0; k < sources.cells.length; k++) {
    const src = sources.cells[k];
    const A = sources.strength[k];
    const p = sources.pitch[k];
    const fromOutside = k >= sources.firstOutside;
    const fromCarried = !fromOutside && k >= sources.firstCarried;
    let head = 0;
    let tail = 0;
    dist[src] = 0;
    q[tail++] = src;
    while (head < tail) {
      const c = q[head++];
      const d = dist[c];
      const val = A * falloff(d, range);
      field[c] += val;
      if (fromOutside) outside[c] += val;
      else if (fromCarried) leaked[c] += val;
      pitchSum[c] += val * p;
      if (c === src) own[c] += val;
      if (d + 1 > range) continue;
      const x = w.xOf(c);
      const y = w.yOf(c);
      const tryN = (nc: number) => {
        if (dist[nc] !== Infinity) return;
        if (elem[nc] === 0 || els[elem[nc]].blocks[energy]) return;
        dist[nc] = d + 1;
        q[tail++] = nc;
      };
      if (y > 0) tryN(c - W);
      if (x > 0) tryN(c - 1);
      if (x < W - 1) tryN(c + 1);
      if (y < H - 1) tryN(c + W);
    }
    for (let j = 0; j < tail; j++) dist[q[j]] = Infinity;
  }
  for (let c = 0; c < field.length; c++) pitch[c] = field[c] > 0 ? pitchSum[c] / field[c] : 0;
}

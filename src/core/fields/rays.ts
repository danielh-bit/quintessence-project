// Ray spread: straight lines of sight. From each source, Bresenham lines run
// to every cell on the edge of its range square, which reaches every cell in
// range. A ray stops after the first cell that blocks the energy; that cell is
// still lit (it is the surface the light lands on). A ray may not slip
// diagonally past the corner of a blocking cell, so a diagonal wall casts a
// full shadow. Each cell takes a source's
// light once (stamped), with linear falloff over Euclidean distance and a
// direction pointing away from the source.

import type { World } from "../world";
import { falloff, type Scratch } from "./scratch";

export function spreadRays(
  w: World,
  s: Scratch,
  energy: number,
  range: number,
  sources: number[],
  field: Float64Array,
  own: Float64Array,
  dirX: Float64Array,
  dirY: Float64Array,
): void {
  const els = w.rules.elements;
  const elem = w.elem;
  const W = w.width;
  const H = w.height;
  const stamp = s.stamp;
  const blocksAt = (x: number, y: number) => {
    const c = y * W + x;
    return elem[c] !== 0 && els[elem[c]].blocks[energy];
  };

  for (const src of sources) {
    const B = w.output[src];
    const sx = w.xOf(src);
    const sy = w.yOf(src);
    const id = s.nextStamp();
    stamp[src] = id;
    field[src] += B;
    own[src] += B;

    const cast = (tx: number, ty: number) => {
      // Bresenham from (sx, sy) towards (tx, ty).
      const adx = Math.abs(tx - sx);
      const ady = Math.abs(ty - sy);
      const stx = tx > sx ? 1 : -1;
      const sty = ty > sy ? 1 : -1;
      let err = adx - ady;
      let x = sx;
      let y = sy;
      for (;;) {
        if (x === tx && y === ty) return;
        const px = x;
        const py = y;
        const e2 = 2 * err;
        if (e2 > -ady) {
          err -= ady;
          x += stx;
        }
        if (e2 < adx) {
          err += adx;
          y += sty;
        }
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        // A diagonal step may not pass the corner of a blocking cell (as for radial spread).
        if (x !== px && y !== py && (blocksAt(x, py) || blocksAt(px, y))) return;
        const dx = x - sx;
        const dy = y - sy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > range) return;
        const c = y * W + x;
        if (stamp[c] !== id) {
          stamp[c] = id;
          const val = B * falloff(d, range);
          field[c] += val;
          dirX[c] += (val * dx) / d;
          dirY[c] += (val * dy) / d;
        }
        if (elem[c] !== 0 && els[elem[c]].blocks[energy]) return;
      }
    };

    const R = range;
    // Edge of the square, in a fixed order: top and bottom rows, then the sides.
    for (let x = sx - R; x <= sx + R; x++) {
      cast(x, sy - R);
      cast(x, sy + R);
    }
    for (let y = sy - R + 1; y <= sy + R - 1; y++) {
      cast(sx - R, y);
      cast(sx + R, y);
    }
  }
}

// Ray spread: straight lines of sight. From each source, Bresenham lines run
// to every cell on the edge of its range square, which reaches every cell in
// range. A ray stops after the first cell that blocks the energy; that cell is
// still lit (it is the surface the light lands on). A ray may not slip
// diagonally past the corner of a blocking cell, so a diagonal wall casts a
// full shadow. Running into a corner, though, is a way of landing on a surface:
// when the step the ray was making would have passed a corner and the cell it
// was heading for blocks the energy, that cell is lit (the ray still ends
// there). Without this, floors and ceilings seen at a shallow angle, the way a
// light standing on a cave floor sees them, would never be lit. Each cell
// takes a source's light once (stamped), with linear falloff over Euclidean
// distance and a direction pointing away from the source.

import type { World } from "../world";
import { falloff, type Scratch, type Sources } from "./scratch";

export function spreadRays(
  w: World,
  s: Scratch,
  energy: number,
  range: number,
  sources: Sources,
  field: Float64Array,
  own: Float64Array,
  dirX: Float64Array,
  dirY: Float64Array,
  outside: Float64Array,
  leaked: Float64Array,
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

  for (let k = 0; k < sources.cells.length; k++) {
    const src = sources.cells[k];
    const B = sources.strength[k];
    const fromOutside = k >= sources.firstOutside;
    const fromCarried = !fromOutside && k >= sources.firstCarried;
    const sx = w.xOf(src);
    const sy = w.yOf(src);
    const id = s.nextStamp();
    stamp[src] = id;
    field[src] += B;
    own[src] += B;
    if (fromOutside) outside[src] += B;
    else if (fromCarried) leaked[src] += B;

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
        const cornered = x !== px && y !== py && (blocksAt(x, py) || blocksAt(px, y));
        // Cornered: the ray ends here, and only a blocking cell (a surface) is lit.
        if (cornered && !blocksAt(x, y)) return;
        const dx = x - sx;
        const dy = y - sy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > range) return;
        const c = y * W + x;
        if (stamp[c] !== id) {
          stamp[c] = id;
          const val = B * falloff(d, range);
          field[c] += val;
          if (fromOutside) outside[c] += val;
          else if (fromCarried) leaked[c] += val;
          dirX[c] += (val * dx) / d;
          dirY[c] += (val * dy) / d;
        }
        if (cornered || (elem[c] !== 0 && els[elem[c]].blocks[energy])) return;
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

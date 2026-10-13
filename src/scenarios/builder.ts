// Geometry helpers for building setups from plain blocks. Nothing here knows
// about any machine; it only places elements.

import type { World } from "../core";

export interface PlaceOpts {
  anchored?: boolean;
}

/** Fill the rectangle [x0..x1] x [y0..y1] (inclusive). */
export function fill(w: World, x0: number, y0: number, x1: number, y1: number, element: string, opts: PlaceOpts = {}): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) w.place(x, y, element, opts);
  }
}

/** Anchored terrain along the bottom rows. */
export function ground(w: World, element = "hard_rock", rows = 1): void {
  fill(w, 0, w.height - rows, w.width - 1, w.height - 1, element, { anchored: true });
}

/** Anchored walls around the whole world. */
export function frame(w: World, element = "hard_rock"): void {
  fill(w, 0, 0, w.width - 1, 0, element, { anchored: true });
  fill(w, 0, w.height - 1, w.width - 1, w.height - 1, element, { anchored: true });
  fill(w, 0, 0, 0, w.height - 1, element, { anchored: true });
  fill(w, w.width - 1, 0, w.width - 1, w.height - 1, element, { anchored: true });
}

/** Bond every loose cell in the rectangle into rigid bodies (touching cells stay together). */
export function bondRect(w: World, x0: number, y0: number, x1: number, y1: number): number[] {
  const cells: Array<[number, number]> = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cells.push([x, y]);
  }
  return w.bond(cells);
}

/** Place loose cells from a picture: one string per row, legend maps characters to elements. */
export function stamp(
  w: World,
  x0: number,
  y0: number,
  rows: string[],
  legend: Record<string, { e: string; anchored?: boolean }>,
): void {
  rows.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const spec = legend[ch];
      if (spec) w.place(x0 + dx, y0 + dy, spec.e, { anchored: spec.anchored });
    });
  });
}

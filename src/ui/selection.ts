// The inspector's selected cell, and following it while its body moves.
//
// Cells have no identity in the core: a loose cell is just an index that
// changes as its body moves. To follow one, the selection keeps the shape of
// its body as offsets from the selected cell. While the body only moves, its
// cell list keeps its order, so the first cell gives the new position. When
// cells were lost or gained (erased, degraded, bonded, split off), every cell
// that survived votes for the body's displacement; the selected cell is where
// that displacement takes it. If that cell is gone, following stops: the
// selection never jumps to another cell.

import type { Body, World } from "../core";

export interface Selection {
  x: number;
  y: number;
  /** Body followed while it moves (0 = a fixed position). */
  bodyId: number;
  /** World tick when the position was last updated. */
  tick: number;
  /** Cell count of the body when last seen. */
  count: number;
  /** Offset of the body's first cell from the selected cell. */
  firstDx: number;
  firstDy: number;
  /** Offsets of all the body's cells from the selected cell. */
  shapeDx: Int32Array;
  shapeDy: Int32Array;
}

/** At most this many cells vote on a body's displacement (keeps big bodies cheap). */
const MAX_VOTERS = 64;

export function selectCell(w: World, x: number, y: number): Selection {
  const s: Selection = {
    x,
    y,
    bodyId: 0,
    tick: w.tick,
    count: 0,
    firstDx: 0,
    firstDy: 0,
    shapeDx: new Int32Array(0),
    shapeDy: new Int32Array(0),
  };
  const b = w.bodyAt(x, y);
  if (b) remember(w, s, b);
  return s;
}

/** Record the body's shape around the selected cell. */
function remember(w: World, s: Selection, b: Body): void {
  s.bodyId = b.id;
  s.count = b.cells.length;
  s.tick = w.tick;
  s.firstDx = w.xOf(b.cells[0]) - s.x;
  s.firstDy = w.yOf(b.cells[0]) - s.y;
  s.shapeDx = new Int32Array(b.cells.length);
  s.shapeDy = new Int32Array(b.cells.length);
  b.cells.forEach((c, k) => {
    s.shapeDx[k] = w.xOf(c) - s.x;
    s.shapeDy[k] = w.yOf(c) - s.y;
  });
}

function stop(w: World, s: Selection): void {
  s.bodyId = 0;
  s.count = 0;
  s.tick = w.tick;
}

/** True if (x, y) holds a cell of the given body. */
function holds(w: World, x: number, y: number, id: number): boolean {
  if (!w.inBounds(x, y)) return false;
  const i = w.idx(x, y);
  return w.elem[i] !== 0 && w.body[i] === id;
}

/** Update a followed selection after the world changed. */
export function follow(w: World, s: Selection): void {
  if (s.bodyId === 0) return;
  const b = w.bodies.get(s.bodyId);

  // Fast path: same cells, maybe moved. A translation keeps the sorted order.
  if (b && b.cells.length === s.count) {
    const x = w.xOf(b.cells[0]) - s.firstDx;
    const y = w.yOf(b.cells[0]) - s.firstDy;
    if (holds(w, x, y, b.id)) {
      s.x = x;
      s.y = y;
      s.tick = w.tick;
      return;
    }
  }

  if (!b) {
    // The body is gone (merged into another by a bond, or crumbled). If a
    // loose cell is still where ours was, it is ours under a new body.
    const nb = w.bodyAt(s.x, s.y);
    if (nb) remember(w, s, nb);
    else stop(w, s);
    return;
  }

  // Vote: each surviving cell, matched to each remembered offset, proposes
  // a displacement; the true one gets a vote from every survivor.
  const votes = new Map<number, number>();
  const n = b.cells.length;
  const stride = Math.max(1, Math.ceil(n / MAX_VOTERS));
  const K = 1 << 16;
  for (let k = 0; k < n; k += stride) {
    const cx = w.xOf(b.cells[k]);
    const cy = w.yOf(b.cells[k]);
    for (let j = 0; j < s.shapeDx.length; j++) {
      const dx = cx - (s.x + s.shapeDx[j]);
      const dy = cy - (s.y + s.shapeDy[j]);
      const key = (dx + K) * 2 * K + (dy + K);
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
  }
  // Most votes wins; a tie goes to the displacement closest to the expected motion.
  const dt = Math.max(0, w.tick - s.tick);
  const ex = b.vx * dt;
  const ey = b.vy * dt;
  let best = -1;
  let bestDist = Infinity;
  let bx = 0;
  let by = 0;
  for (const [key, v] of votes) {
    const dx = Math.floor(key / (2 * K)) - K;
    const dy = (key % (2 * K)) - K;
    const dist = (dx - ex) ** 2 + (dy - ey) ** 2;
    if (v > best || (v === best && dist < bestDist)) {
      best = v;
      bestDist = dist;
      bx = dx;
      by = dy;
    }
  }
  const x = s.x + bx;
  const y = s.y + by;
  const nb = w.bodyAt(x, y);
  if (nb) {
    // Our cell (possibly split off into a part with a new id).
    s.x = x;
    s.y = y;
    remember(w, s, nb);
  } else {
    // The selected cell itself is gone: stay where it was, stop following.
    if (w.inBounds(x, y)) {
      s.x = x;
      s.y = y;
    }
    stop(w, s);
  }
}

// Support and load.
//
// Support: a loose body is *supported* when one of its cells sits directly on
// terrain, on the world floor, or on a body that is itself resting. A
// supported body is *resting* when it is also not moving up and not above its
// contact (offset >= 0); a resting body's weight is held, so gravity does not
// pull it down a fraction of a cell every tick (no fake impacts while at rest).
//
// Load ("weight resting on it"): the static mass of everything resting on a
// cell, in mass units. Going from the top of each pile down, every body passes
// its own mass plus everything it carries, split evenly over the cells it rests
// on. Inside a bonded body a cell also carries the same-body cells stacked
// above it. Load is the resting mass and is not reduced while a push is lifting
// the body (see docs/SIMULATION.md for why).

import type { Body, World } from "./world";

interface Contacts {
  /** Cells directly below this body's cells that hold something else (or -1 for the world floor). */
  cells: number[];
  /** Distinct loose bodies this body rests on. */
  bodies: number[];
  /** Rests on terrain or the world floor. */
  anchored: boolean;
}

function contactsBelow(w: World, b: Body): Contacts {
  const cells: number[] = [];
  const bodies: number[] = [];
  let anchored = false;
  const W = w.width;
  for (const c of b.cells) {
    const y = w.yOf(c);
    if (y === w.height - 1) {
      cells.push(-1);
      anchored = true;
      continue;
    }
    const below = c + W;
    if (w.elem[below] === 0) continue;
    const other = w.body[below];
    if (other === b.id) continue;
    cells.push(below);
    if (other === 0) anchored = true;
    else if (!bodies.includes(other)) bodies.push(other);
  }
  bodies.sort((p, q) => p - q);
  return { cells, bodies, anchored };
}

export function computeSupport(w: World): void {
  const list = w.sortedBodies();
  const contacts = new Map<number, Contacts>();
  for (const b of list) contacts.set(b.id, contactsBelow(w, b));

  // --- support, propagated upward from terrain until nothing changes ---
  for (const b of list) {
    b.supported = contacts.get(b.id)!.anchored;
    b.resting = b.supported && b.vy >= 0 && b.oy >= 0;
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of list) {
      if (b.supported) continue;
      for (const o of contacts.get(b.id)!.bodies) {
        if (w.bodies.get(o)!.resting) {
          b.supported = true;
          b.resting = b.vy >= 0 && b.oy >= 0;
          changed = true;
          break;
        }
      }
    }
  }

  // --- load, top-down in topological order of "rests on" ---
  const load = w.load;
  load.fill(0);
  const received = new Map<number, number>();
  const indegree = new Map<number, number>();
  for (const b of list) {
    received.set(b.id, 0);
    indegree.set(b.id, 0);
  }
  for (const b of list) for (const o of contacts.get(b.id)!.bodies) indegree.set(o, indegree.get(o)! + 1);

  const ready: number[] = list.filter((b) => indegree.get(b.id) === 0).map((b) => b.id);
  const done = new Set<number>();
  const order: number[] = [];
  const takeNext = (): number | undefined => {
    if (ready.length > 0) {
      ready.sort((p, q) => p - q);
      return ready.shift();
    }
    // Only cycles remain (interlocked shapes): break them in id order.
    for (const b of list) if (!done.has(b.id)) return b.id;
    return undefined;
  };
  for (let id = takeNext(); id !== undefined; id = takeNext()) {
    if (done.has(id)) continue;
    done.add(id);
    order.push(id);
    const b = w.bodies.get(id)!;
    const ct = contacts.get(id)!;
    if (ct.cells.length > 0) {
      const share = (b.mass + received.get(id)!) / ct.cells.length;
      for (const c of ct.cells) {
        if (c < 0) continue;
        load[c] += share;
        const o = w.body[c];
        if (o !== 0 && o !== id) received.set(o, received.get(o)! + share);
      }
    }
    for (const o of ct.bodies) {
      const d = indegree.get(o)! - 1;
      indegree.set(o, d);
      if (d === 0 && !done.has(o)) ready.push(o);
    }
  }

  // --- inside bonded bodies: each cell also carries the same-body column above it ---
  const W = w.width;
  const els = w.rules.elements;
  for (const b of list) {
    if (b.cells.length < 2) continue;
    // cells are sorted by index, i.e. top rows first: a cell's upper neighbour is done before it.
    const carry = new Map<number, number>();
    for (const c of b.cells) {
      const above = c - W;
      let k = 0;
      if (above >= 0 && w.body[above] === b.id && w.elem[above] !== 0) {
        // load[] still holds only loads from other bodies here; the column is added below.
        k = (carry.get(above) ?? 0) + els[w.elem[above]].mass + load[above];
      }
      carry.set(c, k);
    }
    for (const c of b.cells) load[c] += carry.get(c)!;
  }
}

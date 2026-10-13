// Support and load.
//
// Support: a loose body is *supported* when one of its cells sits directly on
// terrain, on the world floor, or on a body that is itself resting. A
// supported body is *resting* when it is also not moving up and not above its
// contact (offset >= 0); a resting body's weight is held, so gravity does not
// pull it down a fraction of a cell every tick (no fake impacts while at rest).
// Each body also records what it rests on (terrain and/or which bodies), so
// friction can act relative to its support.
//
// Load ("weight resting on it"): the static mass of everything resting on a
// cell, in mass units. Going from the top of each pile down, every body passes
// its own mass plus everything it carries, split evenly over the cells it rests
// on. Bodies that rest on each other in a loop (interlocked bonded shapes) are
// treated as one group: the group's whole weight goes to the cells it rests on
// outside the group. Inside a bonded body a cell also carries the same-body
// cells stacked above it. Load is the resting mass and is not reduced while a
// push is lifting the body (see docs/SIMULATION.md for why).

import type { Body, World } from "./world";

interface Contacts {
  /** Cells directly below this body's cells that hold something else (-1 = the world floor). */
  cells: number[];
  /** Distinct loose bodies this body rests on, ascending. */
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
  for (const b of list) {
    const ct = contactsBelow(w, b);
    contacts.set(b.id, ct);
    b.restsOnTerrain = ct.anchored;
    b.restsOn = ct.bodies;
  }

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

  computeLoad(w, list, contacts);
}

/**
 * Strongly connected components of the "rests on" graph (Tarjan, iterative),
 * returned top-down: a component comes before every component it rests on.
 */
function componentsTopDown(list: Body[], contacts: Map<number, Contacts>): number[][] {
  const index = new Map<number, number>();
  const low = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  const out: number[][] = [];
  let counter = 0;
  for (const root of list) {
    if (index.has(root.id)) continue;
    const work: Array<{ id: number; next: number }> = [{ id: root.id, next: 0 }];
    index.set(root.id, counter);
    low.set(root.id, counter);
    counter++;
    stack.push(root.id);
    onStack.add(root.id);
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const succ = contacts.get(frame.id)!.bodies;
      if (frame.next < succ.length) {
        const s = succ[frame.next++];
        if (!index.has(s)) {
          index.set(s, counter);
          low.set(s, counter);
          counter++;
          stack.push(s);
          onStack.add(s);
          work.push({ id: s, next: 0 });
        } else if (onStack.has(s)) {
          low.set(frame.id, Math.min(low.get(frame.id)!, index.get(s)!));
        }
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1].id;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.id)!));
      }
      if (low.get(frame.id) === index.get(frame.id)) {
        const comp: number[] = [];
        for (;;) {
          const v = stack.pop()!;
          onStack.delete(v);
          comp.push(v);
          if (v === frame.id) break;
        }
        comp.sort((p, q) => p - q);
        out.push(comp);
      }
    }
  }
  // Tarjan emits a component only after every component it rests on: bottom-up. Reverse it.
  return out.reverse();
}

function computeLoad(w: World, list: Body[], contacts: Map<number, Contacts>): void {
  const load = w.load;
  load.fill(0);
  const received = new Map<number, number>();
  for (const b of list) received.set(b.id, 0);

  for (const comp of componentsTopDown(list, contacts)) {
    const members = new Set(comp);
    let total = 0;
    const outgoing: number[] = [];
    const internal: number[] = [];
    for (const id of comp) {
      total += w.bodies.get(id)!.mass + received.get(id)!;
      for (const c of contacts.get(id)!.cells) {
        if (c >= 0 && members.has(w.body[c])) internal.push(c);
        else outgoing.push(c);
      }
    }
    if (outgoing.length > 0) {
      const share = total / outgoing.length;
      for (const c of outgoing) {
        if (c < 0) continue;
        load[c] += share;
        const o = w.body[c];
        if (o !== 0) received.set(o, received.get(o)! + share);
      }
    }
    // Members of an interlocked group also press on each other.
    if (internal.length > 0) {
      const share = total / (internal.length + outgoing.length);
      for (const c of internal) load[c] += share;
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

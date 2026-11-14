// Carried grids: a grid that rides on a body of another grid.
//
// A carried grid is a whole world of its own, stepped by the same rules. It is
// attached to its parent at one or more opening cells (cells of the parent
// grid, normally cells of the body that carries it). The parent steps its
// carried grids at the end of its own tick, so they always keep step.
//
// What couples the two, the same way for any carried grid:
//   motion    the carried grid's frame moves with its carrier, so everything
//             in it has the carrier's velocity on top of its own; when the
//             carrier's velocity changes, the loose things inside keep going
//             (they get the opposite change, relative to the grid). A carrier
//             in free fall therefore carries weightless contents, and one
//             that stops dead slams them into the wall ahead
//   mass      the carrier weighs its own cells plus everything it carries
//   forces    forces on the loose things inside also act on the carrier
//   energies  what reaches the openings from outside enters through the walls
//             on the side it comes from; what reaches the inside of the walls
//             leaves from the openings. Walls that block an energy keep it in
//             (and out). Stored energies (heat) are exchanged between the
//             openings and the walls.
//   matter    the edges of a carried grid are open: a loose cell that moves
//             out past the edge lands in the parent beside the carrier.

import type { Body, World } from "./world";

/** A source of an energy at a cell, for one tick. */
export interface FieldSource {
  cell: number;
  energy: number;
  strength: number;
  pitch: number;
}

/** What a carried grid lets out of one energy. */
export interface Leak {
  energy: number;
  strength: number;
  pitch: number;
}

export interface Carried {
  world: World;
  /** Opening cells in the parent grid (they travel with the body they belong to). */
  ports: number[];
  /** The carrier's velocity when the carried grid was last stepped. */
  lastVx: number;
  lastVy: number;
  /** What the grid let out when last stepped: sources at the openings next tick. */
  leak: Leak[];
  /** Force its contents felt when last stepped: acts on the carrier next tick. */
  fx: number;
  fy: number;
}

/** How a grid's open edge is handled (set on a grid when it is carried). */
export interface Edge {
  /** Whether a one-cell body at cell `c` could move out past the edge in direction (dx, dy). */
  canLeave(c: number, dx: number, dy: number): boolean;
  /** Move the body out. Only called when `canLeave` said yes. */
  leave(b: Body, dx: number, dy: number): void;
}

/** The body that carries a grid: the loose body its first opening belongs to. */
export function carrierOf(parent: World, c: Carried): Body | undefined {
  const p = c.ports[0];
  if (parent.elem[p] === 0 || parent.body[p] === 0) return undefined;
  return parent.bodies.get(parent.body[p]);
}

/** Mass of everything a body carries in grids attached to it. */
export function carriedMass(parent: World, b: Body): number {
  let m = 0;
  for (const c of parent.carried) {
    const p = c.ports[0];
    if (parent.elem[p] !== 0 && parent.body[p] === b.id) m += c.world.totalMass();
  }
  return m;
}

/** Sources in the parent from what its carried grids let out, shared over each grid's openings. */
export function carriedSources(parent: World): FieldSource[] {
  const out: FieldSource[] = [];
  for (const c of parent.carried) {
    for (const l of c.leak) {
      const share = l.strength / c.ports.length;
      for (const p of c.ports) out.push({ cell: p, energy: l.energy, strength: share, pitch: l.pitch });
    }
  }
  return out;
}

/** Cells on the edge of a grid, in index order. */
function border(w: World): number[] {
  const out: number[] = [];
  for (let i = 0; i < w.size; i++) {
    const x = w.xOf(i);
    const y = w.yOf(i);
    if (x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1) out.push(i);
  }
  return out;
}

function blocks(w: World, c: number, energy: number): boolean {
  return w.elem[c] !== 0 && w.rules.elements[w.elem[c]].blocks[energy];
}

/** Whether an energy can be at a cell at all: not blocked, and for energies that live in matter, filled. */
function passes(w: World, c: number, energy: number): boolean {
  if (blocks(w, c, energy)) return false;
  const spread = w.rules.energies[energy].spread;
  return spread === "conduction" || spread === "diffusion" ? w.elem[c] !== 0 : true;
}

/** What reaches a carried grid from its parent, as sources on its walls. */
function inboundSources(parent: World, c: Carried): FieldSource[] {
  const child = c.world;
  const edge = border(child);
  const out: FieldSource[] = [];
  for (const en of parent.rules.energies) {
    if (en.spread === "diffusion") continue;
    const e = en.index;
    let amount = 0;
    let at = -1;
    for (const p of c.ports) {
      // What carried grids let out themselves is not what reaches them from outside.
      const v = parent.field[e][p] - parent.leakedField[e][p];
      if (v > amount) {
        amount = v;
        at = p;
      }
    }
    if (at < 0) continue;
    let cells = edge.filter((i) => passes(child, i, e));
    if (en.directional) {
      // It comes in through the walls on the side it comes from.
      const dx = parent.dirX[e]![at];
      const dy = parent.dirY[e]![at];
      const ax = dx < 0 ? -dx : dx;
      const ay = dy < 0 ? -dy : dy;
      const m = ax > ay ? ax : ay;
      if (m > 0) {
        const left = dx > 0 && 2 * ax >= m;
        const right = dx < 0 && 2 * ax >= m;
        const top = dy > 0 && 2 * ay >= m;
        const bottom = dy < 0 && 2 * ay >= m;
        cells = cells.filter((i) => {
          const x = child.xOf(i);
          const y = child.yOf(i);
          return (left && x === 0) || (right && x === child.width - 1) || (top && y === 0) || (bottom && y === child.height - 1);
        });
      }
    }
    if (cells.length === 0) continue;
    const pitch = parent.pitch[e] ? parent.pitch[e]![at] : 0;
    const share = amount / cells.length;
    for (const i of cells) out.push({ cell: i, energy: e, strength: share, pitch });
  }
  return out;
}

/** What a carried grid lets out: the strongest of its own fields on its walls. */
function leakOf(child: World): Leak[] {
  const edge = border(child);
  const out: Leak[] = [];
  for (const en of child.rules.energies) {
    if (en.spread === "diffusion") continue;
    const e = en.index;
    let best = 0;
    let pitch = 0;
    for (const i of edge) {
      if (!passes(child, i, e)) continue;
      // Only what comes from inside: what entered from outside is not passed back out.
      const v = child.field[e][i] - child.outsideField[e][i];
      if (v > best) {
        best = v;
        pitch = child.pitch[e] ? child.pitch[e]![i] : 0;
      }
    }
    if (best > 0) out.push({ energy: e, strength: best, pitch });
  }
  return out;
}

/** Stored energies even out between the openings and the carried grid's walls. */
function exchangeStored(parent: World, c: Carried): void {
  const child = c.world;
  const edge = border(child);
  for (const en of parent.rules.energies) {
    if (en.spread !== "diffusion") continue;
    const e = en.index;
    const ports = c.ports.filter((p) => passes(parent, p, e));
    const walls = edge.filter((i) => passes(child, i, e));
    if (ports.length === 0 || walls.length === 0) continue;
    let tp = 0;
    for (const p of ports) tp += parent.field[e][p];
    tp /= ports.length;
    let tw = 0;
    for (const i of walls) tw += child.field[e][i];
    tw /= walls.length;
    const flow = en.conductivity * (tw - tp);
    for (const p of ports) parent.field[e][p] += flow / ports.length;
    for (const i of walls) child.field[e][i] -= flow / walls.length;
  }
}

/**
 * Where in the parent a cell leaving a carried grid in direction (dx, dy)
 * lands: the first empty cell past the carrier from an opening, going the way
 * it left. Something falling out of the bottom that finds the way down shut
 * comes out sideways. Returns -1 if there is nowhere to go.
 */
function landing(parent: World, c: Carried, dx: number, dy: number): number {
  const carrier = carrierOf(parent, c);
  const id = carrier ? carrier.id : -1;
  const from = (p: number, sx: number, sy: number): number => {
    let x = parent.xOf(p);
    let y = parent.yOf(p);
    for (;;) {
      const q = parent.idx(x, y);
      if (!(parent.elem[q] !== 0 && parent.body[q] === id)) return parent.elem[q] === 0 ? q : -1;
      x += sx;
      y += sy;
      if (!parent.inBounds(x, y)) return -1;
    }
  };
  for (const p of c.ports) {
    const q = from(p, dx, dy);
    if (q >= 0) return q;
  }
  if (dy > 0) {
    for (const side of [-1, 1]) {
      for (const p of c.ports) {
        const q = from(p, side, 0);
        if (q >= 0) return q;
      }
    }
  }
  return -1;
}

/** The open edge of a carried grid: cells that leave it land in the parent. */
export function edgeFor(parent: World, c: Carried): Edge {
  return {
    canLeave: (_cell, dx, dy) => landing(parent, c, dx, dy) >= 0,
    leave: (b, dx, dy) => {
      const to = landing(parent, c, dx, dy);
      const child = c.world;
      const from = b.cells[0];
      const el = child.elem[from];
      const carrier = carrierOf(parent, c);
      const vx = b.vx + (carrier ? carrier.vx : 0);
      const vy = b.vy + (carrier ? carrier.vy : 0);
      const nb = parent.takeCell(child, from, to);
      nb.vx = vx;
      nb.vy = vy;
      parent.events.push({ tick: parent.tick, kind: "transfer", x: parent.xOf(to), y: parent.yOf(to), element: el, into: el });
    },
  };
}

/** Step every grid carried in this one. Called at the end of the parent's tick. */
export function stepCarried(parent: World): void {
  for (const c of parent.carried) {
    const child = c.world;
    const carrier = carrierOf(parent, c);
    const vx = carrier ? carrier.vx : 0;
    const vy = carrier ? carrier.vy : 0;
    child.frameVx = parent.frameVx + vx;
    child.frameVy = parent.frameVy + vy;
    // Loose things inside keep their motion when the carrier's changes: seen
    // from the carried grid, they get the opposite change.
    child.frameJx = c.lastVx - vx;
    child.frameJy = c.lastVy - vy;
    c.lastVx = vx;
    c.lastVy = vy;

    child.inbound = inboundSources(parent, c);
    child.step();

    c.leak = leakOf(child);
    c.fx = child.passFx;
    c.fy = child.passFy;
    exchangeStored(parent, c);
    if (carrier && parent.bodies.get(carrier.id) === carrier) parent.recomputeMass(carrier);
  }
}

/** Forces the contents of carried grids felt last tick, applied to their carriers. */
export function applyCarriedForces(parent: World): void {
  for (const c of parent.carried) {
    if (c.fx === 0 && c.fy === 0) continue;
    const carrier = carrierOf(parent, c);
    if (carrier) {
      carrier.fx += c.fx;
      carrier.fy += c.fy;
    }
    c.fx = 0;
    c.fy = 0;
  }
}

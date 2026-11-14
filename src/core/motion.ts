// Motion: gravity, forces, integration, ordered movement and collisions.
//
// Bodies carry a velocity (cells/tick) and a sub-cell offset. Each tick the
// offset accumulates the velocity; whenever it passes half a cell the body
// tries a one-cell step on the axis with the larger offset. A step succeeds
// only if every destination cell is empty or already part of the same body,
// so nothing ever tunnels. A blocked step is a one-dimensional collision on
// that axis: momentum is shared with the bodies in the way (terrain and the
// world's edge have infinite mass), restitution sets how much bounces back,
// and the closing speed is recorded as an impact on both cells in contact.
//
// Order is local: moving bodies are grouped by direction (down, up, right,
// left) and, within a group, leading bodies move first (by position along
// that direction, so shifting a setup does not change its outcome). A body
// struck by another takes its turn right after the one that struck it, so a
// push travels through a row of touching bodies within the tick whichever way
// it points.

import { applyCarriedForces } from "./carried";
import { computeSupport } from "./support";
import type { Body, World } from "./world";

export function applyMotion(w: World): void {
  const world = w.rules.world;

  // Forces from responses and energy effects, gathered per body.
  if (w.carried.length > 0) applyCarriedForces(w);
  for (const b of w.bodies.values()) {
    for (const c of b.cells) {
      b.fx += w.forceX[c];
      b.fy += w.forceY[c];
    }
  }
  // The total, in id order: if this grid is carried, its carrier feels it too.
  w.passFx = 0;
  w.passFy = 0;
  for (const b of w.sortedBodies()) {
    w.passFx += b.fx;
    w.passFy += b.fy;
  }

  // Degradation earlier in the tick can change who rests on what.
  computeSupport(w);

  const list = w.sortedBodies();
  for (const b of list) integrate(w, b, world.gravity, world.friction, world.airDrag, world.maxSpeed);

  const movers = list
    .filter((b) => b.vx !== 0 || b.vy !== 0)
    .map((b) => ({ b, group: directionGroup(b), lead: leadAlong(w, b) }));
  movers.sort((p, q) => p.group - q.group || q.lead - p.lead || p.b.id - q.b.id);
  const moved = new Set<number>();
  const turn = (b: Body): void => {
    if (moved.has(b.id) || w.bodies.get(b.id) !== b) return;
    moved.add(b.id);
    const struck: Body[] = [];
    move(w, b, struck);
    for (const o of struck) turn(o);
  };
  for (const { b } of movers) turn(b);

  for (const b of list) {
    b.fx = 0;
    b.fy = 0;
    b.jx = 0;
    b.jy = 0;
  }
  w.impact.set(w.impactNext);
  w.impactNext.fill(0);
}

function clamp(v: number, m: number): number {
  return v > m ? m : v < -m ? -m : v;
}

function integrate(w: World, b: Body, g: number, mu: number, drag: number, maxSpeed: number): void {
  const m = b.mass;
  const ax = b.fx / m;
  let ay = g + b.fy / m;
  // A grid that is carried: its own change of motion, seen from inside.
  const jx = w.frameJx;
  const jy = w.frameJy;
  if (b.resting) {
    // A support that drops away holds less of the weight (none in free fall).
    if (jy < 0) ay += jy;
    // The support holds the weight (normal force) and friction drags the body
    // towards the velocity of what it rests on (terrain stands still).
    const normal = ay > 0 ? ay : 0;
    if (ay > 0) ay = 0;
    b.vx = applyFriction(w, b, b.vx + ax, mu * normal);
    b.vy += ay;
    // A support that comes up at the body is not held off: they meet.
    if (jy > 0) b.vy += jy;
  } else {
    b.vx += ax;
    b.vy += ay;
    if (jy !== 0) b.vy += jy;
  }
  if (jx !== 0) b.vx += jx;
  if (drag > 0) {
    // Air drag: every cell of a body is slowed by the air alike, so the loss
    // of speed goes with cells per unit mass. Light things are slowed most.
    let keep = 1 - (drag * b.cells.length) / m;
    if (keep < 0) keep = 0;
    b.vx *= keep;
    b.vy *= keep;
  }
  b.vx = clamp(b.vx + b.jx, maxSpeed);
  b.vy = clamp(b.vy + b.jy, maxSpeed);
  // Moving up means no longer held by the support.
  if (b.vy < 0) b.resting = false;
}

/**
 * Coulomb friction against the support. `f` is the most it can change the
 * body's velocity this tick. On terrain the support is immovable; on loose
 * bodies the impulse is shared (equal and opposite), and static friction
 * brings both to a common speed.
 */
function applyFriction(w: World, b: Body, vx: number, f: number): number {
  if (f <= 0) return vx;
  if (b.restsOnTerrain || b.restsOn.length === 0) {
    if (Math.abs(vx) <= f) return 0;
    return vx > 0 ? vx - f : vx + f;
  }
  let mS = 0;
  let pS = 0;
  for (const id of b.restsOn) {
    const s = w.bodies.get(id)!;
    mS += s.mass;
    pS += s.mass * s.vx;
  }
  const vS = pS / mS;
  const rel = vx - vS;
  if (rel === 0) return vx;
  // Impulse that would stop the sliding, and the most friction can give.
  const stop = rel / (1 / b.mass + 1 / mS);
  const most = b.mass * f;
  const j = Math.abs(stop) <= most ? stop : rel > 0 ? most : -most;
  const dvS = j / mS;
  for (const id of b.restsOn) w.bodies.get(id)!.vx += dvS;
  return vx - j / b.mass;
}

/** 0 = down, 1 = up, 2 = right, 3 = left (by the larger velocity component). */
function directionGroup(b: Body): number {
  if (Math.abs(b.vy) >= Math.abs(b.vx)) return b.vy > 0 ? 0 : 1;
  return b.vx > 0 ? 2 : 3;
}

/** How far the body's centre is along its group's direction (larger = leading). */
function leadAlong(w: World, b: Body): number {
  let s = 0;
  const g = directionGroup(b);
  for (const c of b.cells) s += g < 2 ? w.yOf(c) : w.xOf(c);
  const centre = s / b.cells.length;
  return g === 0 || g === 2 ? centre : -centre;
}

interface Blocked {
  /** Pairs of (body cell, blocking cell); blocking cell -1 = the world's edge. */
  pairs: Array<[number, number]>;
}

/** Cells in the way of a one-cell step, or null if the way is clear. */
function blockers(w: World, b: Body, dx: number, dy: number): Blocked | null {
  const pairs: Array<[number, number]> = [];
  for (const c of b.cells) {
    const x = w.xOf(c) + dx;
    const y = w.yOf(c) + dy;
    if (!w.inBounds(x, y)) {
      // An open edge lets a lone cell out if there is somewhere for it to go.
      if (!leaves(w, b, dx, dy)) pairs.push([c, -1]);
      continue;
    }
    const t = c + dy * w.width + dx;
    if (w.elem[t] !== 0 && w.body[t] !== b.id) pairs.push([c, t]);
  }
  return pairs.length === 0 ? null : { pairs };
}

/** Whether a one-cell step takes a lone cell out past an open edge of the grid. */
function leaves(w: World, b: Body, dx: number, dy: number): boolean {
  if (w.edge === null || b.cells.length !== 1) return false;
  const c = b.cells[0];
  if (w.inBounds(w.xOf(c) + dx, w.yOf(c) + dy)) return false;
  return w.edge.canLeave(c, dx, dy);
}

const LEFT = "left";

/** Take a one-cell step: null if it moved, the blockers if not, LEFT if it moved out of the grid. */
function tryStep(w: World, b: Body, dx: number, dy: number): Blocked | null | typeof LEFT {
  const blocked = blockers(w, b, dx, dy);
  if (blocked) return blocked;
  if (leaves(w, b, dx, dy)) {
    w.edge!.leave(b, dx, dy);
    return LEFT;
  }
  w.translateBody(b, dx, dy);
  return null;
}

/** Offsets stay in (-0.5, 0.5]: step when past +0.5, or at -0.5 and below. */
function wantsStep(o: number): boolean {
  return o > 0.5 || o <= -0.5;
}

function move(w: World, b: Body, struck: Body[]): void {
  // Moving into something already touching collides at once, whatever the
  // sub-cell offset: no creeping into contact, no delayed impacts.
  if (b.vy !== 0) {
    const s = b.vy > 0 ? 1 : -1;
    const touching = blockers(w, b, 0, s);
    if (touching) collide(w, b, true, s, touching, struck);
  }
  if (b.vx !== 0) {
    const s = b.vx > 0 ? 1 : -1;
    const touching = blockers(w, b, s, 0);
    if (touching) collide(w, b, false, s, touching, struck);
  }
  b.ox += b.vx;
  b.oy += b.vy;
  let blockedX = false;
  let blockedY = false;
  // Each step brings an offset back towards zero and each axis blocks at most
  // once, so this ends; the bound only guards against a bug.
  const budget = Math.ceil(Math.abs(b.ox) + Math.abs(b.oy)) + 2;
  for (let n = 0; n < budget; n++) {
    const wantY = !blockedY && wantsStep(b.oy);
    const wantX = !blockedX && wantsStep(b.ox);
    if (!wantX && !wantY) break;
    const alongY = wantY && (!wantX || Math.abs(b.oy) >= Math.abs(b.ox));
    const o = alongY ? b.oy : b.ox;
    const s = o > 0 ? 1 : -1;
    const blocked = alongY ? tryStep(w, b, 0, s) : tryStep(w, b, s, 0);
    if (blocked === LEFT) return;
    if (!blocked) {
      if (alongY) b.oy -= s;
      else b.ox -= s;
      continue;
    }
    collide(w, b, alongY, s, blocked, struck);
    if (alongY) blockedY = true;
    else blockedX = true;
  }
}

/** Holding bodies: resting on the ground and not moving up. */
function held(o: Body): boolean {
  return o.resting && o.vy >= 0;
}

function collide(w: World, b: Body, alongY: boolean, s: number, blocked: Blocked, struck: Body[]): void {
  const { restitution: e } = w.rules.world;
  const u = alongY ? b.vy : b.vx;
  let anchored = false;
  const others: Body[] = [];
  for (const [, t] of blocked.pairs) {
    if (t < 0 || w.body[t] === 0) {
      anchored = true;
      continue;
    }
    const o = w.bodies.get(w.body[t])!;
    if (!others.includes(o)) others.push(o);
  }
  others.sort((p, q) => p.id - q.id);
  // Pressing down on bodies that rest on the ground is pressing on the ground:
  // the pile does not give way, and the blow travels down to the bottom.
  const onPile = !anchored && alongY && s > 0 && others.every(held);

  let closing: number;
  if (anchored || onPile) {
    closing = u * s;
    if (closing > 0) setAxis(b, alongY, -e * u);
  } else {
    let mB = 0;
    let pB = 0;
    for (const o of others) {
      mB += o.mass;
      pB += o.mass * (alongY ? o.vy : o.vx);
    }
    const uB = pB / mB;
    closing = (u - uB) * s;
    if (closing > 0) {
      const m = b.mass;
      const total = m + mB;
      const uA2 = (m * u + mB * uB + mB * e * (uB - u)) / total;
      const uB2 = (m * u + mB * uB + m * e * (u - uB)) / total;
      setAxis(b, alongY, uA2);
      for (const o of others) {
        setAxis(o, alongY, uB2);
        if (!struck.includes(o)) struck.push(o);
      }
    }
  }
  // The body stays flush against whatever stopped it.
  if (alongY) b.oy = 0;
  else b.ox = 0;

  if (closing >= w.rules.world.minImpact) {
    const touched = new Set<number>();
    for (const [c, t] of blocked.pairs) {
      touched.add(c);
      if (t >= 0) touched.add(t);
    }
    if (onPile) for (const o of others) impactDown(w, o, touched, new Set([b.id]));
    for (const c of [...touched].sort((p, q) => p - q)) recordImpact(w, c, closing);
  }
}

/** Collect the contact cells under a held body, down through the pile to the terrain. */
function impactDown(w: World, b: Body, touched: Set<number>, seen: Set<number>): void {
  if (seen.has(b.id)) return;
  seen.add(b.id);
  for (const c of b.cells) {
    const y = w.yOf(c);
    if (y === w.height - 1) {
      touched.add(c);
      continue;
    }
    const below = c + w.width;
    if (w.elem[below] === 0 || w.body[below] === b.id) continue;
    touched.add(c);
    touched.add(below);
    const o = w.body[below];
    if (o !== 0) {
      const ob = w.bodies.get(o)!;
      if (held(ob)) impactDown(w, ob, touched, seen);
    }
  }
}

function recordImpact(w: World, c: number, closing: number): void {
  w.feelImpact(c, closing, 1, w.impactNext);
}

function setAxis(b: Body, alongY: boolean, v: number): void {
  if (alongY) {
    b.vy = v;
    if (v < 0) b.resting = false;
  } else b.vx = v;
}

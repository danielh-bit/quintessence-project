// Motion: gravity, forces, integration, ordered movement and collisions.
//
// Bodies carry a velocity (cells/tick) and a sub-cell offset. Each tick the
// offset accumulates the velocity; whenever it reaches half a cell the body
// tries a one-cell step on the axis with the larger offset. A step succeeds
// only if every destination cell is empty or already part of the same body,
// so nothing ever tunnels. A blocked step is a one-dimensional collision on
// that axis: momentum is shared with the bodies in the way (terrain and the
// world's edge have infinite mass), restitution sets how much bounces back,
// and the closing speed is recorded as an impact on both cells in contact.

import { computeSupport } from "./support";
import type { Body, World } from "./world";

export function applyMotion(w: World): void {
  const world = w.rules.world;
  const g = world.gravity;

  // Forces from responses and energy effects, gathered per body.
  for (const b of w.bodies.values()) {
    for (const c of b.cells) {
      b.fx += w.forceX[c];
      b.fy += w.forceY[c];
    }
  }

  // Degradation earlier in the tick can change who rests on what.
  computeSupport(w);

  const list = w.sortedBodies();
  for (const b of list) integrate(b, g, world.friction, world.airDrag, world.maxSpeed);

  // Leading bodies first: the bottom of a falling stack moves before the top,
  // the top of a rising stack before the bottom. Ties by id.
  const keyed = list.map((b) => ({ b, key: leadKey(w, b) }));
  keyed.sort((p, q) => (q.key - p.key) || (p.b.id - q.b.id));
  for (const { b } of keyed) {
    if (w.bodies.get(b.id) !== b) continue;
    move(w, b);
  }

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

function integrate(b: Body, g: number, mu: number, drag: number, maxSpeed: number): void {
  const m = b.mass;
  const ax = b.fx / m;
  let ay = g + b.fy / m;
  if (b.resting) {
    // The support holds the weight (normal force) and friction resists sliding.
    const normal = ay > 0 ? ay : 0;
    if (ay > 0) ay = 0;
    let vx = b.vx + ax;
    const f = mu * normal;
    if (f > 0) {
      if (Math.abs(vx) <= f) vx = 0;
      else vx -= vx > 0 ? f : -f;
    }
    b.vx = vx;
    b.vy += ay;
  } else {
    b.vx += ax;
    b.vy += ay;
    if (drag > 0) {
      b.vx *= 1 - drag;
      b.vy *= 1 - drag;
    }
  }
  b.vx = clamp(b.vx + b.jx, maxSpeed);
  b.vy = clamp(b.vy + b.jy, maxSpeed);
}

function leadKey(w: World, b: Body): number {
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (speed === 0) return 0;
  let sx = 0;
  let sy = 0;
  for (const c of b.cells) {
    sx += w.xOf(c);
    sy += w.yOf(c);
  }
  const n = b.cells.length;
  return ((sx / n) * b.vx + (sy / n) * b.vy) / speed;
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
      pairs.push([c, -1]);
      continue;
    }
    const t = c + dy * w.width + dx;
    if (w.elem[t] !== 0 && w.body[t] !== b.id) pairs.push([c, t]);
  }
  return pairs.length === 0 ? null : { pairs };
}

function tryStep(w: World, b: Body, dx: number, dy: number): Blocked | null {
  const blocked = blockers(w, b, dx, dy);
  if (!blocked) w.translateBody(b, dx, dy);
  return blocked;
}

function move(w: World, b: Body): void {
  // Moving into something already touching collides at once, whatever the
  // sub-cell offset: no creeping into contact, no delayed impacts.
  if (b.vy !== 0) {
    const s = b.vy > 0 ? 1 : -1;
    const touching = blockers(w, b, 0, s);
    if (touching) collide(w, b, true, s, touching);
  }
  if (b.vx !== 0) {
    const s = b.vx > 0 ? 1 : -1;
    const touching = blockers(w, b, s, 0);
    if (touching) collide(w, b, false, s, touching);
  }
  b.ox += b.vx;
  b.oy += b.vy;
  let blockedX = false;
  let blockedY = false;
  for (let guard = 0; guard < 32; guard++) {
    const wantY = !blockedY && Math.abs(b.oy) >= 0.5;
    const wantX = !blockedX && Math.abs(b.ox) >= 0.5;
    if (!wantX && !wantY) break;
    const alongY = wantY && (!wantX || Math.abs(b.oy) >= Math.abs(b.ox));
    const s = alongY ? (b.oy > 0 ? 1 : -1) : b.ox > 0 ? 1 : -1;
    const blocked = alongY ? tryStep(w, b, 0, s) : tryStep(w, b, s, 0);
    if (!blocked) {
      if (alongY) b.oy -= s;
      else b.ox -= s;
      continue;
    }
    collide(w, b, alongY, s, blocked);
    if (alongY) blockedY = true;
    else blockedX = true;
  }
}

function collide(w: World, b: Body, alongY: boolean, s: number, blocked: Blocked): void {
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
  // Pressing down on bodies that rest on the ground is pressing on the ground:
  // the pile does not give way, and the blow travels down to the bottom.
  const held = !anchored && alongY && s > 0 && others.every((o) => o.resting);

  let closing: number;
  if (anchored || held) {
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
      for (const o of others) setAxis(o, alongY, uB2);
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
    if (held) for (const o of others) impactDown(w, o, touched, new Set([b.id]));
    for (const c of [...touched].sort((p, q) => p - q)) recordImpact(w, c, closing);
  }
}

/** Collect the contact cells under a resting body, down through the pile to the terrain. */
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
      if (ob.resting) impactDown(w, ob, touched, seen);
    }
  }
}

function recordImpact(w: World, c: number, closing: number): void {
  if (closing > w.impactNext[c]) w.impactNext[c] = closing;
  w.strain[c] += w.rules.world.impactStrain * closing;
}

function setAxis(b: Body, alongY: boolean, v: number): void {
  if (alongY) b.vy = v;
  else b.vx = v;
}

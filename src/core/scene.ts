// Scenes: worlds as plain JSON. The same format serves hand-made setups and
// full snapshots. A snapshot restores the exact state, so a saved run
// continues identically.

import type { RuleSet } from "./rules";
import { World } from "./world";

export const SCENE_FORMAT = "quintessence-scene";
export const SCENE_VERSION = 1;

export interface SceneCell {
  x: number;
  y: number;
  /** Element id. */
  e: string;
  /** Anchored (never moves). */
  a?: boolean;
  /** Body id for loose cells; cells sharing an id are bonded. Omitted = a one-cell body. */
  b?: number;
  /** Strain. */
  s?: number;
  /** Response output. */
  o?: number;
  /** Pitch of the current emission. */
  p?: number;
  /** Impact felt in the last motion phase. */
  i?: number;
  /** Stored values of diffusion energies, by energy id. */
  f?: Record<string, number>;
}

export interface SceneBody {
  id: number;
  vx?: number;
  vy?: number;
  ox?: number;
  oy?: number;
}

export interface Scene {
  format: typeof SCENE_FORMAT;
  version: number;
  name?: string;
  description?: string;
  /** Rule-set version the scene was made with (informational). */
  rules?: string;
  width: number;
  height: number;
  seed?: number;
  tick?: number;
  nextBodyId?: number;
  cells: SceneCell[];
  bodies?: SceneBody[];
}

/** Snapshot the full state of a world. */
export function saveScene(w: World, meta: { name?: string; description?: string } = {}): Scene {
  const cells: SceneCell[] = [];
  const diff = w.rules.energies.filter((e) => e.spread === "diffusion");
  for (let i = 0; i < w.size; i++) {
    const el = w.elem[i];
    if (el === 0) continue;
    const c: SceneCell = { x: w.xOf(i), y: w.yOf(i), e: w.rules.elements[el].id };
    if (w.body[i] === 0) c.a = true;
    else c.b = w.body[i];
    if (w.strain[i] !== 0) c.s = w.strain[i];
    if (w.output[i] !== 0) c.o = w.output[i];
    if (w.outPitch[i] !== 0) c.p = w.outPitch[i];
    if (w.impact[i] !== 0) c.i = w.impact[i];
    for (const en of diff) {
      const v = w.field[en.index][i];
      if (v !== 0) (c.f ??= {})[en.id] = v;
    }
    cells.push(c);
  }
  const bodies: SceneBody[] = w.sortedBodies().map((b) => {
    const sb: SceneBody = { id: b.id };
    if (b.vx !== 0) sb.vx = b.vx;
    if (b.vy !== 0) sb.vy = b.vy;
    if (b.ox !== 0) sb.ox = b.ox;
    if (b.oy !== 0) sb.oy = b.oy;
    return sb;
  });
  return {
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    ...meta,
    rules: w.rules.version,
    width: w.width,
    height: w.height,
    seed: w.seed,
    tick: w.tick,
    nextBodyId: w.nextBodyId,
    cells,
    bodies,
  };
}

function fail(msg: string): never {
  throw new Error(`scene: ${msg}`);
}

function finite(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${what} must be a finite number`);
  return v;
}

/** Build a world from a scene (hand-made or a snapshot). */
export function loadScene(rules: RuleSet, scene: unknown): World {
  if (typeof scene !== "object" || scene === null) fail("expected an object");
  const s = scene as Partial<Scene>;
  if (s.format !== SCENE_FORMAT) fail(`format must be "${SCENE_FORMAT}"`);
  if (s.version !== SCENE_VERSION) fail(`unsupported version ${String(s.version)}`);
  const width = finite(s.width, "width");
  const height = finite(s.height, "height");
  const w = new World(rules, width, height, { seed: s.seed === undefined ? 1 : finite(s.seed, "seed") });
  if (!Array.isArray(s.cells)) fail("cells must be a list");

  const groups = new Map<number, number[]>();
  const singles: number[] = [];
  for (const c of s.cells) {
    const x = finite(c.x, "cell x");
    const y = finite(c.y, "cell y");
    if (!w.inBounds(x, y)) fail(`cell (${x}, ${y}) is outside the world`);
    const i = w.idx(x, y);
    if (w.elem[i] !== 0) fail(`two cells at (${x}, ${y})`);
    const el = rules.elementIndex[c.e];
    if (el === undefined) fail(`unknown element "${c.e}" at (${x}, ${y})`);
    w.elem[i] = el;
    w.body[i] = 0;
    if (c.s !== undefined) w.strain[i] = finite(c.s, "strain");
    if (c.o !== undefined) w.output[i] = finite(c.o, "output");
    if (c.p !== undefined) w.outPitch[i] = finite(c.p, "pitch");
    if (c.i !== undefined) w.impact[i] = finite(c.i, "impact");
    if (c.f) {
      for (const [eid, v] of Object.entries(c.f)) {
        const en = rules.energies[rules.energyIndex[eid] ?? -1];
        if (!en || en.spread !== "diffusion") fail(`"${eid}" is not a stored (diffusion) energy`);
        w.field[en.index][i] = finite(v, `${eid} value`);
      }
    }
    if (c.a) continue;
    if (c.b !== undefined) {
      const id = finite(c.b, "body id");
      if (!Number.isInteger(id) || id < 1) fail(`body id must be a whole number >= 1`);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id)!.push(i);
    } else singles.push(i);
  }

  const bodyMeta = new Map<number, SceneBody>();
  for (const b of s.bodies ?? []) bodyMeta.set(finite(b.id, "body id"), b);

  for (const id of [...groups.keys()].sort((a, b) => a - b)) {
    const b = w.newBody(groups.get(id)!, id);
    const m = bodyMeta.get(id);
    if (m) {
      b.vx = m.vx ?? 0;
      b.vy = m.vy ?? 0;
      b.ox = m.ox ?? 0;
      b.oy = m.oy ?? 0;
    }
  }
  if (s.nextBodyId !== undefined) w.nextBodyId = Math.max(w.nextBodyId, finite(s.nextBodyId, "nextBodyId"));
  for (const i of singles) w.newBody([i]);
  // Bonded groups that are not connected fall apart into their parts.
  for (const id of [...groups.keys()].sort((a, b) => a - b)) {
    const b = w.bodies.get(id);
    if (b) w.resplit(b);
  }
  if (s.tick !== undefined) w.tick = finite(s.tick, "tick");
  return w;
}

/** Deep copy of a world through the scene format. */
export function cloneWorld(w: World): World {
  return loadScene(w.rules, JSON.parse(JSON.stringify(saveScene(w))));
}

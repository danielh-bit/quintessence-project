// Scenes: worlds as plain JSON. The same format serves hand-made setups and
// full snapshots. A snapshot restores the exact state, so a saved run
// continues identically.

import type { RuleSet } from "./rules";
import { World } from "./world";

export const SCENE_FORMAT = "quintessence-scene";
/** Version 2 adds carried grids. A scene without any is still written as version 1. */
export const SCENE_VERSION = 2;

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
  /** Shock (anchored cells only). */
  k?: number;
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

/** A grid carried by a body of the scene's world (see carried.ts). */
export interface SceneCarried {
  /** Opening cells in the parent, as [x, y]. */
  ports: Array<[number, number]>;
  scene: Scene;
  /** The carrier's velocity when the grid was last stepped. */
  vx?: number;
  vy?: number;
  /** Force its contents passed to the carrier for the coming tick. */
  fx?: number;
  fy?: number;
  /** What it let out when last stepped: [energy id, strength, pitch]. */
  leak?: Array<[string, number, number]>;
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
  carried?: SceneCarried[];
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
    if (w.shock[i] !== 0) c.k = w.shock[i];
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
  const scene: Scene = {
    format: SCENE_FORMAT,
    version: w.carried.length > 0 ? SCENE_VERSION : 1,
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
  if (w.carried.length > 0) {
    scene.carried = w.carried.map((c) => {
      const sc: SceneCarried = { ports: c.ports.map((p) => [w.xOf(p), w.yOf(p)]), scene: saveScene(c.world) };
      if (c.lastVx !== 0) sc.vx = c.lastVx;
      if (c.lastVy !== 0) sc.vy = c.lastVy;
      if (c.fx !== 0) sc.fx = c.fx;
      if (c.fy !== 0) sc.fy = c.fy;
      if (c.leak.length > 0) sc.leak = c.leak.map((l) => [w.rules.energies[l.energy].id, l.strength, l.pitch]);
      return sc;
    });
  }
  return scene;
}

function fail(msg: string): never {
  throw new Error(`scene: ${msg}`);
}

function finite(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${what} must be a finite number`);
  return v;
}

function whole(v: unknown, what: string, min = 0): number {
  const n = finite(v, what);
  if (!Number.isInteger(n) || n < min) fail(`${what} must be a whole number >= ${min}`);
  return n;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const MAX_CELLS = 4_000_000;

/** Build a world from a scene (hand-made or a snapshot). */
export function loadScene(rules: RuleSet, scene: unknown): World {
  if (typeof scene !== "object" || scene === null) fail("expected an object");
  const s = scene as Partial<Scene>;
  if (s.format !== SCENE_FORMAT) fail(`format must be "${SCENE_FORMAT}"`);
  if (s.version !== 1 && s.version !== SCENE_VERSION) fail(`unsupported version ${String(s.version)}`);
  const width = whole(s.width, "width", 1);
  const height = whole(s.height, "height", 1);
  if (width * height > MAX_CELLS) fail(`a ${width}x${height} world is too large`);
  const w = new World(rules, width, height, { seed: s.seed === undefined ? 1 : whole(s.seed, "seed") });
  if (!Array.isArray(s.cells)) fail("cells must be a list");
  if (s.bodies !== undefined && !Array.isArray(s.bodies)) fail("bodies must be a list");

  const groups = new Map<number, number[]>();
  const singles: number[] = [];
  for (const c of s.cells as unknown[]) {
    if (!isRecord(c)) fail("every cell must be an object");
    const x = whole(c.x, "cell x");
    const y = whole(c.y, "cell y");
    if (!w.inBounds(x, y)) fail(`cell (${x}, ${y}) is outside the world`);
    const i = w.idx(x, y);
    if (w.elem[i] !== 0) fail(`two cells at (${x}, ${y})`);
    const el = typeof c.e === "string" && Object.prototype.hasOwnProperty.call(rules.elementIndex, c.e) ? rules.elementIndex[c.e] : undefined;
    if (el === undefined) fail(`unknown element "${String(c.e)}" at (${x}, ${y})`);
    w.elem[i] = el;
    w.body[i] = 0;
    if (c.s !== undefined) w.strain[i] = finite(c.s, "strain");
    if (c.o !== undefined) w.output[i] = finite(c.o, "output");
    if (c.p !== undefined) w.outPitch[i] = finite(c.p, "pitch");
    if (c.i !== undefined) w.impact[i] = finite(c.i, "impact");
    if (c.k !== undefined && c.a) w.shock[i] = finite(c.k, "shock");
    if (c.f !== undefined) {
      if (!isRecord(c.f)) fail(`stored energies at (${x}, ${y}) must be an object`);
      for (const [eid, v] of Object.entries(c.f)) {
        const en = rules.energies[rules.energyIndex[eid] ?? -1];
        if (!en || en.spread !== "diffusion") fail(`"${eid}" is not a stored (diffusion) energy`);
        w.field[en.index][i] = finite(v, `${eid} value`);
      }
    }
    if (c.a) continue;
    if (c.b !== undefined) {
      const id = whole(c.b, "body id", 1);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id)!.push(i);
    } else singles.push(i);
  }

  const bodyMeta = new Map<number, { vx: number; vy: number; ox: number; oy: number }>();
  for (const b of (s.bodies ?? []) as unknown[]) {
    if (!isRecord(b)) fail("every body must be an object");
    const id = whole(b.id, "body id", 1);
    const opt = (k: "vx" | "vy" | "ox" | "oy") => (b[k] === undefined ? 0 : finite(b[k], `body ${id} ${k}`));
    const m = { vx: opt("vx"), vy: opt("vy"), ox: opt("ox"), oy: opt("oy") };
    if (Math.abs(m.ox) > 0.5 || Math.abs(m.oy) > 0.5) fail(`body ${id} offset must be within half a cell`);
    bodyMeta.set(id, m);
  }

  for (const id of [...groups.keys()].sort((a, b) => a - b)) {
    const b = w.newBody(groups.get(id)!, id);
    const m = bodyMeta.get(id);
    if (m) {
      b.vx = m.vx;
      b.vy = m.vy;
      b.ox = m.ox;
      b.oy = m.oy;
    }
  }
  if (s.nextBodyId !== undefined) w.nextBodyId = Math.max(w.nextBodyId, whole(s.nextBodyId, "nextBodyId", 1));
  for (const i of singles) w.newBody([i]);
  // Bonded groups that are not connected fall apart into their parts.
  for (const id of [...groups.keys()].sort((a, b) => a - b)) {
    const b = w.bodies.get(id);
    if (b) w.resplit(b);
  }
  if (s.tick !== undefined) w.tick = whole(s.tick, "tick");

  if (s.carried !== undefined) {
    if (!Array.isArray(s.carried)) fail("carried must be a list");
    for (const entry of s.carried as unknown[]) {
      if (!isRecord(entry)) fail("every carried grid must be an object");
      if (!Array.isArray(entry.ports) || entry.ports.length === 0) fail("a carried grid needs a list of openings");
      const ports = (entry.ports as unknown[]).map((p): [number, number] => {
        if (!Array.isArray(p) || p.length !== 2) fail("an opening must be [x, y]");
        const x = whole(p[0], "opening x");
        const y = whole(p[1], "opening y");
        if (!w.inBounds(x, y)) fail(`opening (${x}, ${y}) is outside the world`);
        return [x, y];
      });
      const c = w.attach(loadScene(rules, entry.scene), ports);
      const opt = (k: "vx" | "vy" | "fx" | "fy") => (entry[k] === undefined ? 0 : finite(entry[k], `carried ${k}`));
      c.lastVx = opt("vx");
      c.lastVy = opt("vy");
      c.fx = opt("fx");
      c.fy = opt("fy");
      if (entry.leak !== undefined) {
        if (!Array.isArray(entry.leak)) fail("leak must be a list");
        for (const l of entry.leak as unknown[]) {
          if (!Array.isArray(l) || l.length !== 3 || typeof l[0] !== "string") fail("a leak must be [energy, strength, pitch]");
          const en = rules.energies[rules.energyIndex[l[0]] ?? -1];
          if (!en || en.spread === "diffusion") fail(`"${l[0]}" is not an energy a grid can let out`);
          c.leak.push({ energy: en.index, strength: finite(l[1], "leak strength"), pitch: finite(l[2], "leak pitch") });
        }
      }
    }
  }
  return w;
}

/** Deep copy of a world through the scene format. */
export function cloneWorld(w: World): World {
  return loadScene(w.rules, JSON.parse(JSON.stringify(saveScene(w))));
}

// The world: a 2D side-view grid (row 0 at the top, +y pointing down with
// gravity). Each cell is empty or holds one element. Per-cell state is stored
// as parallel typed arrays ("channels"); state that belongs to the matter in a
// cell travels with it when the cell moves.
//
// Cells are either anchored (body 0: terrain or built structure, never moves)
// or belong to a loose body (id >= 1). A body is a rigid group of cells that
// translates as one; a single loose cell is a one-cell body.
//
// See docs/SIMULATION.md for the model and the order of phases in a tick.

import { computeFields } from "./fields/index";
import { applyMotion } from "./motion";
import { applyEffects, applyResponses, applyStrain } from "./responses";
import { hash32 } from "./rng";
import type { RuleSet } from "./rules";
import { computeSupport } from "./support";

export interface Body {
  id: number;
  /** Cell indices, always kept sorted ascending (canonical order). */
  cells: number[];
  mass: number;
  vx: number;
  vy: number;
  /** Sub-cell offset in cells, kept within (-0.5, 0.5] after each move. */
  ox: number;
  oy: number;
  /** Resting on terrain or on something resting (set by the support pass). */
  supported: boolean;
  /** Supported, not moving up, and not above its contact: gravity is held. */
  resting: boolean;
  /** Forces accumulated this tick (cleared after motion). */
  fx: number;
  fy: number;
  /** Velocity kicks accumulated this tick (cleared after motion). */
  jx: number;
  jy: number;
}

export interface WorldEvent {
  tick: number;
  kind: "degrade" | "loosen";
  x: number;
  y: number;
  /** Element index before the event. */
  element: number;
  /** Element index after the event (0 = empty). */
  into: number;
}

export interface WorldOptions {
  seed?: number;
}

export class World {
  readonly rules: RuleSet;
  readonly width: number;
  readonly height: number;
  readonly size: number;
  seed: number;
  tick = 0;

  // --- channels that travel with the matter in a cell ---
  /** Element index, 0 = empty. */
  readonly elem: Uint8Array;
  /** 0 = anchored (or empty), >= 1 = loose body id. */
  readonly body: Int32Array;
  readonly strain: Float64Array;
  /** Current response output (emission strength, push size, ...). */
  readonly output: Float64Array;
  /** Pitch carried by the current emission (only some responses set it). */
  readonly outPitch: Float64Array;
  /** Largest closing speed this cell felt in the last motion phase. */
  readonly impact: Float64Array;
  /** Impacts being recorded during the current motion phase. */
  readonly impactNext: Float64Array;

  // --- channels recomputed every tick ---
  /** Weight resting on the cell, in mass units. */
  readonly load: Float64Array;
  /** Field value per energy. Diffusion energies are persistent state and travel with matter. */
  readonly field: Float64Array[];
  /** Direction-weighted field per directional energy ("away from the source"), else null. */
  readonly dirX: (Float64Array | null)[];
  readonly dirY: (Float64Array | null)[];
  /** Amplitude-weighted pitch per conduction energy, else null. */
  readonly pitch: (Float64Array | null)[];
  /** Part of the field at a cell that the cell emitted itself (excluded from its exposure). */
  readonly ownField: Float64Array[];
  /** Forces from responses this tick, per cell. */
  readonly forceX: Float64Array;
  readonly forceY: Float64Array;

  readonly bodies = new Map<number, Body>();
  nextBodyId = 1;
  /** Events from the last step (degradations, cells shaken loose). */
  events: WorldEvent[] = [];

  constructor(rules: RuleSet, width: number, height: number, opts: WorldOptions = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error(`invalid world size ${width}x${height}`);
    }
    this.rules = rules;
    this.width = width;
    this.height = height;
    this.size = width * height;
    this.seed = opts.seed ?? 1;
    const n = this.size;
    this.elem = new Uint8Array(n);
    this.body = new Int32Array(n);
    this.strain = new Float64Array(n);
    this.output = new Float64Array(n);
    this.outPitch = new Float64Array(n);
    this.impact = new Float64Array(n);
    this.impactNext = new Float64Array(n);
    this.load = new Float64Array(n);
    this.forceX = new Float64Array(n);
    this.forceY = new Float64Array(n);
    this.field = rules.energies.map(() => new Float64Array(n));
    this.ownField = rules.energies.map(() => new Float64Array(n));
    this.dirX = rules.energies.map((e) => (e.directional ? new Float64Array(n) : null));
    this.dirY = rules.energies.map((e) => (e.directional ? new Float64Array(n) : null));
    this.pitch = rules.energies.map((e) => (e.spread === "conduction" ? new Float64Array(n) : null));
  }

  // ------------------------------------------------------------------ geometry

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  xOf(i: number): number {
    return i % this.width;
  }

  yOf(i: number): number {
    return (i - (i % this.width)) / this.width;
  }

  // ------------------------------------------------------------------ editing

  /** Resolve an element id ("lobime") or index to an index; throws if unknown. */
  elementIndexOf(element: string | number): number {
    if (typeof element === "number") {
      if (element < 1 || element >= this.rules.elements.length) throw new Error(`unknown element index ${element}`);
      return element;
    }
    const i = this.rules.elementIndex[element];
    if (i === undefined) throw new Error(`unknown element "${element}"`);
    return i;
  }

  /**
   * Put an element in a cell (replacing what is there). Anchored cells never
   * move; loose cells become a new one-cell body. Returns the body id (0 if anchored).
   */
  place(x: number, y: number, element: string | number, opts: { anchored?: boolean } = {}): number {
    if (!this.inBounds(x, y)) throw new Error(`(${x}, ${y}) is outside the world`);
    const el = this.elementIndexOf(element);
    const i = this.idx(x, y);
    if (this.elem[i] !== 0) this.erase(x, y);
    this.elem[i] = el;
    if (opts.anchored) {
      this.body[i] = 0;
      return 0;
    }
    const b = this.newBody([i]);
    return b.id;
  }

  /** Empty a cell (and drop its state). Splits its body if that disconnects it. */
  erase(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    this.removeCell(this.idx(x, y));
  }

  /** Empty a cell by index; keeps bodies consistent. */
  removeCell(i: number): void {
    if (this.elem[i] === 0) return;
    const id = this.body[i];
    this.clearCell(i);
    for (const f of this.diffusionFields()) f[i] = 0;
    if (id !== 0) {
      const b = this.bodies.get(id)!;
      b.cells.splice(b.cells.indexOf(i), 1);
      if (b.cells.length === 0) this.bodies.delete(id);
      else this.resplit(b);
    }
  }

  /** Turn a cell into another element in place (keeps its body; 0 removes it). */
  transmute(i: number, element: number): void {
    if (element === 0) {
      this.removeCell(i);
      return;
    }
    this.elem[i] = element;
    this.strain[i] = 0;
    this.output[i] = 0;
    this.outPitch[i] = 0;
    const id = this.body[i];
    if (id !== 0) this.recomputeMass(this.bodies.get(id)!);
  }

  /**
   * Bond the loose cells at the given positions (and the bodies they belong to)
   * into rigid bodies. Only cells that touch (4-neighbours) stay together.
   * Returns the ids of the resulting bodies.
   */
  bond(positions: Array<[number, number]>): number[] {
    const ids = new Set<number>();
    for (const [x, y] of positions) {
      if (!this.inBounds(x, y)) continue;
      const i = this.idx(x, y);
      if (this.elem[i] !== 0 && this.body[i] !== 0) ids.add(this.body[i]);
    }
    if (ids.size === 0) return [];
    const sorted = [...ids].sort((a, b) => a - b);
    const keep = this.bodies.get(sorted[0])!;
    let px = keep.vx * keep.mass;
    let py = keep.vy * keep.mass;
    for (const id of sorted.slice(1)) {
      const b = this.bodies.get(id)!;
      px += b.vx * b.mass;
      py += b.vy * b.mass;
      for (const c of b.cells) {
        this.body[c] = keep.id;
        keep.cells.push(c);
      }
      this.bodies.delete(id);
    }
    keep.cells.sort((a, b) => a - b);
    this.recomputeMass(keep);
    keep.vx = px / keep.mass;
    keep.vy = py / keep.mass;
    return this.resplit(keep);
  }

  /** Break the body at (x, y) back into one-cell bodies. */
  unbond(x: number, y: number): void {
    const i = this.idx(x, y);
    const id = this.body[i];
    if (this.elem[i] === 0 || id === 0) return;
    const b = this.bodies.get(id)!;
    const rest = b.cells.slice(1);
    b.cells = [b.cells[0]];
    this.recomputeMass(b);
    for (const c of rest) {
      const nb = this.newBody([c]);
      nb.vx = b.vx;
      nb.vy = b.vy;
      nb.ox = b.ox;
      nb.oy = b.oy;
    }
  }

  /** Free an anchored cell: it becomes a one-cell loose body. */
  loosen(i: number): void {
    if (this.elem[i] === 0 || this.body[i] !== 0) return;
    this.newBody([i]);
  }

  /** Anchor a loose cell's whole body in place. */
  anchorBodyAt(x: number, y: number): void {
    const i = this.idx(x, y);
    const id = this.body[i];
    if (this.elem[i] === 0 || id === 0) return;
    const b = this.bodies.get(id)!;
    for (const c of b.cells) this.body[c] = 0;
    this.bodies.delete(id);
  }

  /** Set the velocity of the body at (x, y), e.g. a shove by hand. */
  setVelocity(x: number, y: number, vx: number, vy: number): void {
    const b = this.bodyAt(x, y);
    if (!b) return;
    b.vx = vx;
    b.vy = vy;
  }

  bodyAt(x: number, y: number): Body | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const i = this.idx(x, y);
    if (this.elem[i] === 0 || this.body[i] === 0) return undefined;
    return this.bodies.get(this.body[i]);
  }

  // ------------------------------------------------------------------ bodies

  newBody(cells: number[], id?: number): Body {
    const bid = id ?? this.nextBodyId++;
    if (id !== undefined && id >= this.nextBodyId) this.nextBodyId = id + 1;
    const b: Body = {
      id: bid,
      cells: [...cells].sort((a, c) => a - c),
      mass: 0,
      vx: 0,
      vy: 0,
      ox: 0,
      oy: 0,
      supported: false,
      resting: false,
      fx: 0,
      fy: 0,
      jx: 0,
      jy: 0,
    };
    for (const c of b.cells) this.body[c] = bid;
    this.recomputeMass(b);
    this.bodies.set(bid, b);
    return b;
  }

  recomputeMass(b: Body): void {
    let m = 0;
    for (const c of b.cells) m += this.rules.elements[this.elem[c]].mass;
    b.mass = m;
  }

  /**
   * Split a body into its 4-connected parts. The part holding the lowest cell
   * index keeps the id; the others get new ids and inherit the motion.
   * Returns the ids of all parts.
   */
  resplit(b: Body): number[] {
    const inBody = new Set(b.cells);
    const seen = new Set<number>();
    const parts: number[][] = [];
    for (const start of b.cells) {
      if (seen.has(start)) continue;
      const part: number[] = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const c = stack.pop()!;
        part.push(c);
        for (const n of this.neighbours4(c)) {
          if (inBody.has(n) && !seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
      part.sort((a, c) => a - c);
      parts.push(part);
    }
    if (parts.length === 1) {
      b.cells = parts[0];
      this.recomputeMass(b);
      return [b.id];
    }
    parts.sort((p, q) => p[0] - q[0]);
    b.cells = parts[0];
    this.recomputeMass(b);
    const ids = [b.id];
    for (const part of parts.slice(1)) {
      const nb = this.newBody(part);
      nb.vx = b.vx;
      nb.vy = b.vy;
      nb.ox = b.ox;
      nb.oy = b.oy;
      ids.push(nb.id);
    }
    return ids;
  }

  /** Loose bodies in ascending id order. */
  sortedBodies(): Body[] {
    return [...this.bodies.values()].sort((a, b) => a.id - b.id);
  }

  neighbours4(i: number): number[] {
    const x = this.xOf(i);
    const y = this.yOf(i);
    const out: number[] = [];
    if (y > 0) out.push(i - this.width);
    if (x > 0) out.push(i - 1);
    if (x < this.width - 1) out.push(i + 1);
    if (y < this.height - 1) out.push(i + this.width);
    return out;
  }

  // ------------------------------------------------------------------ cell state moves

  /** Fields that are persistent state (diffusion energies). */
  diffusionFields(): Float64Array[] {
    return this.rules.energies.filter((e) => e.spread === "diffusion").map((e) => this.field[e.index]);
  }

  clearCell(i: number): void {
    this.elem[i] = 0;
    this.body[i] = 0;
    this.strain[i] = 0;
    this.output[i] = 0;
    this.outPitch[i] = 0;
    this.impact[i] = 0;
    this.impactNext[i] = 0;
  }

  /**
   * Translate a body by (dx, dy) cells, carrying all per-matter state.
   * The caller has checked that every destination is empty or part of the body.
   */
  translateBody(b: Body, dx: number, dy: number): void {
    const delta = dy * this.width + dx;
    const diff = this.diffusionFields();
    const n = b.cells.length;
    const el = new Uint8Array(n);
    const st = new Float64Array(n);
    const out = new Float64Array(n);
    const op = new Float64Array(n);
    const im = new Float64Array(n);
    const imn = new Float64Array(n);
    const df = diff.map(() => new Float64Array(n));
    for (let k = 0; k < n; k++) {
      const c = b.cells[k];
      el[k] = this.elem[c];
      st[k] = this.strain[c];
      out[k] = this.output[c];
      op[k] = this.outPitch[c];
      im[k] = this.impact[c];
      imn[k] = this.impactNext[c];
      for (let f = 0; f < diff.length; f++) df[f][k] = diff[f][c];
    }
    for (const c of b.cells) {
      this.clearCell(c);
      for (const f of diff) f[c] = 0;
    }
    for (let k = 0; k < n; k++) {
      const t = b.cells[k] + delta;
      b.cells[k] = t;
      this.elem[t] = el[k];
      this.body[t] = b.id;
      this.strain[t] = st[k];
      this.output[t] = out[k];
      this.outPitch[t] = op[k];
      this.impact[t] = im[k];
      this.impactNext[t] = imn[k];
      for (let f = 0; f < diff.length; f++) diff[f][t] = df[f][k];
    }
  }

  // ------------------------------------------------------------------ simulation

  /**
   * Advance one fixed tick. Phases always run in this order:
   *   1. support & load      (who rests on what, weight on each cell)
   *   2. fields              (energies from last tick's outputs; one diffusion step)
   *   3. responses           (triggers -> outputs, push forces, strain build)
   *   4. generic effects     (energy effects on every cell, e.g. strain, shaking)
   *   5. strain              (recovery, degradation, body splits)
   *   6. motion              (gravity, forces, moves, collisions -> impacts)
   */
  step(): void {
    this.events = [];
    computeSupport(this);
    computeFields(this);
    applyResponses(this);
    applyEffects(this);
    applyStrain(this);
    applyMotion(this);
    this.tick++;
  }

  run(ticks: number): void {
    for (let t = 0; t < ticks; t++) this.step();
  }

  // ------------------------------------------------------------------ observation

  /** Element id at (x, y), or null if empty / out of bounds. */
  elementAt(x: number, y: number): string | null {
    if (!this.inBounds(x, y)) return null;
    const e = this.elem[this.idx(x, y)];
    return e === 0 ? null : this.rules.elements[e].id;
  }

  /** Field value of an energy (by id) at (x, y). */
  fieldAt(energy: string, x: number, y: number): number {
    const e = this.rules.energyIndex[energy];
    if (e === undefined) throw new Error(`unknown energy "${energy}"`);
    if (!this.inBounds(x, y)) return 0;
    return this.field[e][this.idx(x, y)];
  }

  /** Every cell holding the given element, as [x, y] pairs in index order. */
  find(element: string): Array<[number, number]> {
    const el = this.elementIndexOf(element);
    const out: Array<[number, number]> = [];
    for (let i = 0; i < this.size; i++) if (this.elem[i] === el) out.push([this.xOf(i), this.yOf(i)]);
    return out;
  }

  /** Everything known about a cell, for inspection and tests. */
  inspect(x: number, y: number): CellInfo | null {
    if (!this.inBounds(x, y)) return null;
    const i = this.idx(x, y);
    const e = this.elem[i];
    const fields: Record<string, number> = {};
    for (const en of this.rules.energies) fields[en.id] = this.field[en.index][i];
    const b = e !== 0 && this.body[i] !== 0 ? this.bodies.get(this.body[i]) : undefined;
    return {
      x,
      y,
      element: e === 0 ? null : this.rules.elements[e].id,
      anchored: e !== 0 && this.body[i] === 0,
      body: b
        ? { id: b.id, cells: b.cells.length, mass: b.mass, vx: b.vx, vy: b.vy, ox: b.ox, oy: b.oy, supported: b.supported, resting: b.resting }
        : null,
      strain: this.strain[i],
      strainMax: this.rules.elements[e].strain.max,
      output: this.output[i],
      impact: this.impact[i],
      load: this.load[i],
      fields,
    };
  }

  /** Stable hash of the full simulation state (for determinism checks). */
  stateHash(): string {
    let h = 0x811c9dc5 >>> 0;
    const eat = (bytes: Uint8Array) => {
      for (let k = 0; k < bytes.length; k++) {
        h ^= bytes[k];
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    };
    // -0 and +0 behave the same in the simulation but differ in their bytes; hash them alike.
    const f64 = (arr: Float64Array) => {
      const copy = new Float64Array(arr.length);
      for (let k = 0; k < arr.length; k++) copy[k] = arr[k] === 0 ? 0 : arr[k];
      eat(new Uint8Array(copy.buffer));
    };
    eat(this.elem);
    eat(new Uint8Array(this.body.buffer));
    f64(this.strain);
    f64(this.output);
    f64(this.outPitch);
    f64(this.impact);
    for (const f of this.diffusionFields()) f64(f);
    const bodyState = new Float64Array(this.bodies.size * 5 + 2);
    let k = 0;
    for (const b of this.sortedBodies()) {
      bodyState[k++] = b.id;
      bodyState[k++] = b.vx;
      bodyState[k++] = b.vy;
      bodyState[k++] = b.ox;
      bodyState[k++] = b.oy;
    }
    bodyState[k++] = this.tick;
    bodyState[k++] = this.nextBodyId;
    f64(bodyState);
    return (hash32(h, this.tick, this.size, this.seed) >>> 0).toString(16).padStart(8, "0") + h.toString(16).padStart(8, "0");
  }
}

export interface CellInfo {
  x: number;
  y: number;
  element: string | null;
  anchored: boolean;
  body: {
    id: number;
    cells: number;
    mass: number;
    vx: number;
    vy: number;
    ox: number;
    oy: number;
    supported: boolean;
    resting: boolean;
  } | null;
  strain: number;
  strainMax: number;
  output: number;
  impact: number;
  load: number;
  fields: Record<string, number>;
}

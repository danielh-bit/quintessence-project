// Grains: the fine structure inside blocks.
//
// The block is the unit the rules think in. With grains switched on (a
// `grains` entry in the rules' world parameters), every block is a square of
// size x size grains:
//
//   chipping   an anchored block shaken past its grip loses the grains nearest
//              the blow instead of coming loose whole; they become dust
//   what is    a block's mass and response go with the grains it has left; too
//   left       little left and the rest crumbles to dust
//   dust       free grains on the fine grid. Dust is light and slowed by the
//              air, so it has no momentum of its own: each tick it moves at a
//              steady speed set by what acts on it (it sinks, and is carried
//              by any push its element responds to). It piles and slides.
//   dust       dust of an element in a block-sized area responds as that
//   reacts     element, in proportion to how much is there, and its weight
//              rests on what it lies on
//
// A world whose blocks are all whole and that holds no dust behaves exactly as
// one without grains. Nothing here knows which element is which.

import { exposure } from "./fields/index";
import { rand01 } from "./rng";
import type { FieldSource } from "./carried";
import type { World } from "./world";

export interface GrainParams {
  /** Grains along one side of a block. */
  size: number;
  /** Fraction of a whole block that comes off each time a block is shaken past its grip. */
  chip: number;
  /** A block with less than this fraction of its grains left crumbles to dust. */
  crumbleBelow: number;
  /** Speed at which dust sinks, blocks per tick. */
  dustFall: number;
  /** Speed dust is carried at per unit of force on a whole block of it, blocks per tick. */
  dustMobility: number;
}

/** What the dust of one element in one block-sized area is doing this tick. */
interface DustResponse {
  cell: number;
  element: number;
  /** Response output, already scaled by how much dust is there. */
  output: number;
  pitch: number;
}

const SALT_STEP_X = 101;
const SALT_STEP_Y = 102;
const SALT_SLIDE = 103;

export class Grains {
  readonly w: World;
  readonly params: GrainParams;
  /** Grains along one side of a block. */
  readonly n: number;
  /** Grains in a block. */
  readonly nn: number;
  /** Size of the fine grid. */
  readonly fw: number;
  readonly fh: number;
  /** 1 where a block's grain is gone, per block cell then per grain. Travels with the matter. */
  readonly gone: Uint8Array;
  /** Fraction of its grains a block has left (1 = whole). Travels with the matter. */
  readonly fill: Float64Array;
  /** Where the last blow on a block landed, as a grain index inside it. */
  readonly hit: Uint8Array;
  /** Dust on the fine grid: element index per fine cell, 0 = none. */
  readonly dust: Uint8Array;
  /** Fine cells holding dust, in no particular order (sorted when stepped). */
  cells: number[] = [];
  /** Emissions of dust from the last response phase: sources for the next tick (state). */
  emitting: DustResponse[] = [];
  /** Dust freed by chipping in this tick: where each grain is now, and the block cell it came off. */
  freed = new Map<number, number>();
  /** Speed (blocks per tick) dust of each element is carried at in each block cell this tick. */
  private carryX = new Map<number, number>();
  private carryY = new Map<number, number>();

  constructor(w: World, params: GrainParams) {
    this.w = w;
    this.params = params;
    this.n = params.size;
    this.nn = this.n * this.n;
    this.fw = w.width * this.n;
    this.fh = w.height * this.n;
    this.gone = new Uint8Array(w.size * this.nn);
    this.fill = new Float64Array(w.size).fill(1);
    this.hit = new Uint8Array(w.size).fill(this.centre());
    this.dust = new Uint8Array(this.fw * this.fh);
  }

  /** The grain in the middle of a block. */
  centre(): number {
    const h = this.n >> 1;
    return h * this.n + h;
  }

  // ------------------------------------------------------------------ geometry

  fineIdx(fx: number, fy: number): number {
    return fy * this.fw + fx;
  }

  /** Block cell a fine cell lies in. */
  blockOf(f: number): number {
    const fx = f % this.fw;
    const fy = (f - fx) / this.fw;
    return ((fy - (fy % this.n)) / this.n) * this.w.width + (fx - (fx % this.n)) / this.n;
  }

  /** Whether a fine cell is filled by a grain of a solid block. */
  solidAt(fx: number, fy: number): boolean {
    const n = this.n;
    const lx = fx % n;
    const ly = fy % n;
    const c = ((fy - ly) / n) * this.w.width + (fx - lx) / n;
    return this.w.elem[c] !== 0 && this.gone[c * this.nn + ly * n + lx] === 0;
  }

  /** Whether dust could be in a fine cell: inside the grid, no solid grain, no dust. */
  free(fx: number, fy: number): boolean {
    if (fx < 0 || fy < 0 || fx >= this.fw || fy >= this.fh) return false;
    return this.dust[fy * this.fw + fx] === 0 && !this.solidAt(fx, fy);
  }

  /** Grains a block has left. */
  grainsLeft(c: number): number {
    let k = 0;
    const base = c * this.nn;
    for (let g = 0; g < this.nn; g++) if (this.gone[base + g] === 0) k++;
    return k;
  }

  // ------------------------------------------------------------------ dust in and out

  /** Put one grain of dust in a free fine cell. */
  addDust(fx: number, fy: number, element: number): void {
    const f = fy * this.fw + fx;
    if (this.dust[f] !== 0) throw new Error("there is dust in that fine cell already");
    this.dust[f] = element;
    this.cells.push(f);
  }

  /** Remove the dust in a fine cell; returns its element (0 if there was none). */
  removeDust(f: number): number {
    const el = this.dust[f];
    if (el === 0) return 0;
    this.dust[f] = 0;
    const k = this.cells.indexOf(f);
    if (k >= 0) this.cells.splice(k, 1);
    return el;
  }

  /** How many grains of dust of an element (by index) there are. */
  countDust(element?: number): number {
    if (element === undefined) return this.cells.length;
    let k = 0;
    for (const f of this.cells) if (this.dust[f] === element) k++;
    return k;
  }

  /** Mass of all the dust. */
  dustMass(): number {
    let m = 0;
    for (const f of this.cells) m += this.w.rules.elements[this.dust[f]].mass;
    return m / this.nn;
  }

  // ------------------------------------------------------------------ blocks

  /** Forget a block's fine structure (the cell was emptied). */
  clear(c: number): void {
    if (this.fill[c] !== 1) this.gone.fill(0, c * this.nn, (c + 1) * this.nn);
    this.fill[c] = 1;
    this.hit[c] = this.centre();
  }

  /** Copy a block's fine structure from a cell of another grid (or this one). */
  copyFrom(from: Grains, i: number, j: number): void {
    this.gone.set(from.gone.subarray(i * this.nn, (i + 1) * this.nn), j * this.nn);
    this.fill[j] = from.fill[i];
    this.hit[j] = this.centre();
  }

  /**
   * Make the block in cell c a piece of `count` grains, filled from the bottom
   * row up (so it sits on what is below it). The rest of the block is simply
   * not there: nothing turns to dust.
   */
  shape(c: number, count: number): void {
    const w = this.w;
    if (w.elem[c] === 0) return;
    const k = count < 1 ? 1 : count > this.nn ? this.nn : Math.floor(count);
    const base = c * this.nn;
    for (let g = 0; g < this.nn; g++) {
      // Grain g is in row floor(g / n) from the top; the bottom rows are kept.
      const fromBottom = this.nn - 1 - g;
      const row = (fromBottom - (fromBottom % this.n)) / this.n;
      const col = g % this.n;
      this.gone[base + g] = row * this.n + col < k ? 0 : 1;
    }
    this.fill[c] = k / this.nn;
    const id = w.body[c];
    if (id !== 0) w.recomputeMass(w.bodies.get(id)!);
  }

  /**
   * Knock grains off a block: the `count` grains nearest where the last blow
   * landed become dust where they were. A block left with too little crumbles
   * altogether. Returns how many grains came off.
   */
  chip(c: number, count: number): number {
    const w = this.w;
    const n = this.n;
    const el = w.elem[c];
    if (el === 0 || count <= 0) return 0;
    const base = c * this.nn;
    const hx = this.hit[c] % n;
    const hy = (this.hit[c] - hx) / n;
    const left: number[] = [];
    for (let g = 0; g < this.nn; g++) if (this.gone[base + g] === 0) left.push(g);
    const d2 = (g: number) => {
      const dx = (g % n) - hx;
      const dy = (g - (g % n)) / n - hy;
      return dx * dx + dy * dy;
    };
    left.sort((p, q) => d2(p) - d2(q) || p - q);
    let off = left.slice(0, count);
    if ((left.length - off.length) / this.nn < this.params.crumbleBelow) off = left;
    const bx = w.xOf(c) * n;
    const by = w.yOf(c) * n;
    for (const g of off) {
      this.gone[base + g] = 1;
      const f = (by + (g - (g % n)) / n) * this.fw + bx + (g % n);
      // Dust lying in a part chipped away earlier may already be here; then the grain joins the nearest free spot above.
      if (this.dust[f] === 0) {
        this.dust[f] = el;
        this.cells.push(f);
        this.freed.set(f, c);
      } else {
        const at = this.nearestFree(bx + (g % n), by + (g - (g % n)) / n);
        if (at >= 0) {
          this.dust[at] = el;
          this.cells.push(at);
          this.freed.set(at, c);
        }
      }
    }
    if (off.length === left.length) {
      // Nothing solid is left: the cell is empty now (its dust stays).
      w.removeCell(c);
    } else {
      this.fill[c] = (left.length - off.length) / this.nn;
      const id = w.body[c];
      if (id !== 0) w.recomputeMass(w.bodies.get(id)!);
    }
    return off.length;
  }

  /** The nearest fine cell free for dust, looking up the column first, then to the sides; -1 if none nearby. */
  nearestFree(fx: number, fy: number): number {
    for (let r = 0; r <= this.n * 4; r++) {
      for (let dy = 0; dy <= r; dy++) {
        const y = fy - dy;
        for (const dx of r === 0 ? [0] : [-(r - dy), r - dy]) {
          if (this.free(fx + dx, y)) return y * this.fw + fx + dx;
        }
      }
    }
    return -1;
  }

  /** After solid matter moved into block cell c: dust now inside its grains is pushed out to the nearest free spot. */
  displace(c: number): void {
    const n = this.n;
    const bx = this.w.xOf(c) * n;
    const by = this.w.yOf(c) * n;
    for (let ly = 0; ly < n; ly++) {
      for (let lx = 0; lx < n; lx++) {
        const f = (by + ly) * this.fw + bx + lx;
        const el = this.dust[f];
        if (el === 0 || this.gone[c * this.nn + ly * n + lx] !== 0) continue;
        this.removeDust(f);
        const at = this.nearestFree(bx + lx, by + ly);
        if (at >= 0) {
          this.dust[at] = el;
          this.cells.push(at);
        }
      }
    }
  }

  // ------------------------------------------------------------------ dust in the rules

  /** Grains of dust of each element in each block cell that has any, as a map from cell * E + element to count. */
  private census(): Map<number, number> {
    const E = this.w.rules.elements.length;
    const out = new Map<number, number>();
    for (const f of this.cells) {
      const key = this.blockOf(f) * E + this.dust[f];
      out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  }

  /** Weight of dust resting on solid matter, added to the load of the block cell it lies on. */
  addLoad(): void {
    if (this.cells.length === 0) return;
    const w = this.w;
    const els = w.rules.elements;
    for (const f of this.cells) {
      const fx = f % this.fw;
      let fy = (f - fx) / this.fw + 1;
      // Down through the heap to what it lies on.
      while (fy < this.fh && this.dust[fy * this.fw + fx] !== 0) fy++;
      if (fy >= this.fh || !this.solidAt(fx, fy)) continue;
      w.load[this.blockOf(fy * this.fw + fx)] += els[this.dust[f]].mass / this.nn;
    }
  }

  /** Dust's emissions from last tick's responses, as sources of their energies. */
  sources(): FieldSource[] {
    const els = this.w.rules.elements;
    const out: FieldSource[] = [];
    for (const r of this.emitting) {
      const resp = els[r.element].response;
      if (resp.kind === "emit" && r.output > 0) out.push({ cell: r.cell, energy: resp.energy, strength: r.output, pitch: r.pitch });
    }
    return out;
  }

  /**
   * Responses of dust: per block cell and element, the element's own response
   * to what reaches that cell, scaled by how much dust is there. Dust lies
   * still or drifts, so it is neither pressed on, nor moving, nor struck: only
   * exposure can set it off.
   */
  respond(): void {
    this.emitting = [];
    this.carryX.clear();
    this.carryY.clear();
    if (this.cells.length === 0) return;
    const w = this.w;
    const els = w.rules.elements;
    const E = els.length;
    const census = this.census();
    const keys = [...census.keys()].sort((p, q) => p - q);
    for (const key of keys) {
      const element = key % E;
      const cell = (key - element) / E;
      const def = els[element];
      const r = def.response;
      const t = def.trigger;
      if (r.kind === "none" || t.kind !== "exposure") continue;
      const x = exposure(w, t.energy, cell);
      const input = x > r.threshold ? x - r.threshold : 0;
      let out = r.gain * input;
      if (out > r.max) out = r.max;
      out *= census.get(key)! / this.nn;
      if (out <= 0) continue;
      if (r.kind === "emit") {
        this.emitting.push({ cell, element, output: out, pitch: r.pitch * x });
      } else {
        const total = w.field[t.energy][cell];
        if (total > 0) {
          // A whole block of this dust would feel this force; dust is carried at a speed in proportion.
          const per = (r.gain * input > r.max ? r.max : r.gain * input) * this.params.dustMobility;
          this.carryX.set(key, (per * w.dirX[t.energy]![cell]) / total);
          this.carryY.set(key, (per * w.dirY[t.energy]![cell]) / total);
        }
      }
    }
  }

  // ------------------------------------------------------------------ dust in motion

  /**
   * Move the dust one tick. Each grain sinks at the dust's falling speed and is
   * carried by any push on dust of its element where it is. Speeds below one
   * grain per tick become a step on some ticks (decided by the hash, so the
   * same world always moves the same way). A grain that cannot sink straight
   * down slides off to a lower side; a grain carried sideways climbs a step
   * one grain high.
   */
  step(): void {
    const cells = this.cells;
    if (cells.length === 0) return;
    const w = this.w;
    const n = this.n;
    const fw = this.fw;
    const E = w.rules.elements.length;
    const fall = this.params.dustFall * n;
    const leftFirst = (w.tick & 1) === 0;
    // Lowest first, so a heap settles from the bottom up; along a row, from alternate ends on alternate ticks.
    const order = new Float64Array(cells.length);
    for (let k = 0; k < cells.length; k++) {
      const f = cells[k];
      const x = f % fw;
      order[k] = (this.fh - 1 - (f - x) / fw) * fw + (leftFirst ? x : fw - 1 - x);
    }
    order.sort();
    for (let k = 0; k < cells.length; k++) {
      const key = order[k];
      const x = key % fw;
      cells[k] = (this.fh - 1 - (key - x) / fw) * fw + (leftFirst ? x : fw - 1 - x);
    }
    const steps = (v: number, f: number, salt: number): number => {
      const a = v < 0 ? -v : v;
      let k = Math.floor(a);
      if (rand01(w.seed, w.tick, f, salt) < a - k) k++;
      if (k > n) k = n;
      return v < 0 ? -k : k;
    };
    for (let k = 0; k < cells.length; k++) {
      const f0 = cells[k];
      const el = this.dust[f0];
      let fx = f0 % fw;
      let fy = (f0 - fx) / fw;
      const key = this.blockOf(f0) * E + el;
      const vx = (this.carryX.get(key) ?? 0) * n;
      const vy = fall + (this.carryY.get(key) ?? 0) * n;
      let sy = steps(vy, f0, SALT_STEP_Y);
      let sx = steps(vx, f0, SALT_STEP_X);
      if (sx === 0 && sy === 0) continue;
      this.dust[f0] = 0;
      while (sy !== 0) {
        const d = sy > 0 ? 1 : -1;
        if (this.free(fx, fy + d)) fy += d;
        else if (d > 0 && sx === 0) {
          // Resting on something: slide off to a lower side if there is one.
          const first = rand01(w.seed, w.tick, f0, SALT_SLIDE) < 0.5 ? -1 : 1;
          if (this.free(fx + first, fy + 1) && this.free(fx + first, fy)) {
            fx += first;
            fy += 1;
          } else if (this.free(fx - first, fy + 1) && this.free(fx - first, fy)) {
            fx -= first;
            fy += 1;
          } else break;
        } else break;
        sy -= d;
      }
      while (sx !== 0) {
        const d = sx > 0 ? 1 : -1;
        if (this.free(fx + d, fy)) fx += d;
        else if (this.free(fx + d, fy - 1) && this.free(fx, fy - 1)) {
          // Carried against something one grain high: it goes up and over.
          fx += d;
          fy -= 1;
        } else break;
        sx -= d;
      }
      const f1 = fy * fw + fx;
      this.dust[f1] = el;
      cells[k] = f1;
      const from = this.freed.get(f0);
      if (from !== undefined) {
        this.freed.delete(f0);
        this.freed.set(f1, from);
      }
    }
  }
}

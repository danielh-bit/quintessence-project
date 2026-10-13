// Reusable work buffers for field computations (one set per world size).
// Nothing here is simulation state.

export class Scratch {
  readonly dist: Float64Array;
  readonly stamp: Int32Array;
  stampId = 0;
  readonly queue: Int32Array;
  readonly visited: Int32Array;
  readonly heapCell: Int32Array;
  readonly heapKey: Float64Array;
  readonly buf: Float64Array;
  readonly buf2: Float64Array;

  constructor(size: number) {
    this.dist = new Float64Array(size).fill(Infinity);
    this.stamp = new Int32Array(size);
    this.queue = new Int32Array(size);
    this.visited = new Int32Array(size);
    this.heapCell = new Int32Array(size * 8 + 8);
    this.heapKey = new Float64Array(size * 8 + 8);
    this.buf = new Float64Array(size);
    this.buf2 = new Float64Array(size);
  }

  nextStamp(): number {
    this.stampId++;
    if (this.stampId === 0x7fffffff) {
      this.stamp.fill(0);
      this.stampId = 1;
    }
    return this.stampId;
  }
}

const cache = new WeakMap<object, Scratch>();

export function scratchFor(owner: object, size: number): Scratch {
  let s = cache.get(owner);
  if (!s || s.dist.length !== size) {
    s = new Scratch(size);
    cache.set(owner, s);
  }
  return s;
}

/** Linear falloff: full strength at the source, 1/(range+1) of it at the edge of the range. */
export function falloff(d: number, range: number): number {
  return d > range ? 0 : 1 - d / (range + 1);
}

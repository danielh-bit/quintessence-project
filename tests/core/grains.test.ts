// The grain engine (stage 1 of the milestone 2 spike): blocks made of grains,
// chipping, and dust. Run with grains switched on in the rules; the rules as
// shipped have them off.
import { describe, expect, it } from "vitest";
import { cloneWorld, World } from "../../src/core";
import { SCENARIOS } from "../../src/scenarios";
import { VG } from "../helpers/grains";
import { brightness } from "../helpers/observe";
import { floor, V0 } from "../helpers/world";

function ground(width: number, height: number): World {
  const w = new World(VG, width, height);
  floor(w);
  return w;
}

/** A heap of dust: `count` grains of an element in block cell (bx, by), filled from the bottom row up. */
function heap(w: World, bx: number, by: number, element: string, count: number): void {
  const g = w.grains!;
  const el = w.rules.elementIndex[element];
  for (let k = 0; k < count; k++) g.addDust(bx * g.n + (k % g.n), by * g.n + g.n - 1 - Math.floor(k / g.n), el);
}

/** Where the dust is, in blocks from column x0 (centre of each grain). */
function dustX(w: World, x0: number): number[] {
  const g = w.grains!;
  return g.cells.map((f) => ((f % g.fw) + 0.5) / g.n - x0);
}

describe("grains: whole blocks behave exactly as before", () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: runs the same with grains on, and makes no chips or dust`, () => {
      const a = s.build(VG);
      const b = s.build(V0);
      a.run(1500);
      b.run(1500);
      expect([...a.elem]).toEqual([...b.elem]);
      expect([...a.strain]).toEqual([...b.strain]);
      expect([...a.output]).toEqual([...b.output]);
      expect(a.sortedBodies().map((x) => [x.id, x.vx, x.vy, x.ox, x.oy])).toEqual(b.sortedBodies().map((x) => [x.id, x.vx, x.vy, x.ox, x.oy]));
      expect(a.grains!.cells.length).toBe(0);
      expect(a.grains!.fill.every((f) => f === 1)).toBe(true);
    });
  }
});

describe("grains: chipping", () => {
  it("blows shake grains off an anchored block near where they land, a part at a time", () => {
    const w = ground(20, 12);
    const fy = w.height - 1;
    w.place(8, fy - 1, "lobime", { anchored: true });
    const i = w.idx(8, fy - 1);
    const g = w.grains!;
    // Three blows on the left edge, in quick succession: enough shock for one chip.
    for (let k = 0; k < 3; k++) {
      w.strike(i, 1, 3, 0, 4);
      w.step();
    }
    expect(g.fill[i]).toBe(0.75);
    // The grains that went are the ones on the left.
    const gone: number[] = [];
    for (let n = 0; n < g.nn; n++) if (g.gone[i * g.nn + n]) gone.push(n % g.n);
    expect(gone.length).toBe(16);
    expect(Math.max(...gone)).toBeLessThanOrEqual(2);
    // They are dust now, of the same element, and nothing was lost.
    expect(g.countDust(VG.elementIndex.lobime)).toBe(16);
    expect(w.elementAt(8, fy - 1)).toBe("lobime");
    expect(w.inspect(8, fy - 1)!.anchored).toBe(true);
  });

  it("a block chipped down to too little crumbles into dust altogether", () => {
    const w = ground(20, 12);
    const fy = w.height - 1;
    w.place(8, fy - 1, "lobime", { anchored: true });
    const i = w.idx(8, fy - 1);
    for (let k = 0; k < 40 && w.elementAt(8, fy - 1) !== null; k++) {
      w.strike(i, 1, 3, 4, 0);
      w.step();
    }
    expect(w.elementAt(8, fy - 1)).toBeNull();
    expect(w.grains!.countDust(VG.elementIndex.lobime)).toBe(64);
  });

  it("an element with no grip does not chip, however long it is struck", () => {
    const w = ground(20, 12);
    const fy = w.height - 1;
    w.place(8, fy - 1, "hard_rock", { anchored: true });
    for (let k = 0; k < 500; k++) {
      w.strike(w.idx(8, fy - 1), 1, 3, 0, 4);
      w.run(12);
    }
    expect(w.grains!.fill[w.idx(8, fy - 1)]).toBe(1);
    expect(w.grains!.cells.length).toBe(0);
  });

  it("a chipped block weighs and responds in proportion to what is left", () => {
    const out = (chips: number) => {
      const w = ground(20, 12);
      const fy = w.height - 1;
      w.place(8, fy, "galog", { anchored: true });
      w.place(8, fy - 1, "lobime");
      for (let k = 0; k < chips; k++) w.grains!.chip(w.idx(8, fy), 16);
      for (const f of [...w.grains!.cells]) w.grains!.removeDust(f);
      w.run(10);
      return w.inspect(8, fy)!.output;
    };
    const whole = out(0);
    expect(whole).toBeGreaterThan(0);
    expect(out(1)).toBeCloseTo(whole * 0.75, 10);
    expect(out(2)).toBeCloseTo(whole * 0.5, 10);

    const w = ground(20, 12);
    w.place(8, 5, "lobime");
    const b = w.bodyAt(8, 5)!;
    const full = b.mass;
    w.grains!.chip(w.idx(8, 5), 16);
    expect(b.mass).toBeCloseTo(full * 0.75, 10);
  });

  it("a chipped block keeps its shape when it moves", () => {
    const w = ground(20, 16);
    w.place(8, 3, "lobime");
    const g = w.grains!;
    g.hit[w.idx(8, 3)] = 0;
    g.chip(w.idx(8, 3), 16);
    for (const f of [...g.cells]) g.removeDust(f);
    const shape = [...g.gone.subarray(w.idx(8, 3) * g.nn, (w.idx(8, 3) + 1) * g.nn)];
    w.run(80);
    const [[x, y]] = w.find("lobime");
    expect(y).toBe(w.height - 2);
    expect([...g.gone.subarray(w.idx(x, y) * g.nn, (w.idx(x, y) + 1) * g.nn)]).toEqual(shape);
    expect(g.fill[w.idx(x, y)]).toBe(0.75);
    expect(g.fill[w.idx(8, 3)]).toBe(1);
  });
});

describe("grains: pieces smaller than a block", () => {
  it("a part-block piece falls and rests like any block, and weighs what it has", () => {
    const w = ground(20, 14);
    const fy = w.height - 1;
    w.place(8, fy, "galog", { anchored: true });
    w.place(8, 3, "lobime");
    w.grains!.shape(w.idx(8, 3), 32);
    const whole = VG.elements[VG.elementIndex.lobime].mass;
    expect(w.bodyAt(8, 3)!.mass).toBeCloseTo(whole / 2, 10);
    w.run(80);
    expect(w.find("lobime")).toEqual([[8, fy - 1]]);
    expect(w.grains!.fill[w.idx(8, fy - 1)]).toBe(0.5);
    // The Galog under it feels half a stone, and emits half as much.
    expect(w.inspect(8, fy)!.load).toBeCloseTo(whole / 2, 10);
    const half = w.inspect(8, fy)!.output;
    w.grains!.shape(w.idx(8, fy - 1), 64);
    w.run(10);
    expect(w.inspect(8, fy)!.output).toBeCloseTo(half * 2, 10);
  });

  it("its grains are the bottom ones, so it sits on what is below", () => {
    const w = ground(20, 14);
    w.place(8, 5, "lobime");
    const g = w.grains!;
    g.shape(w.idx(8, 5), 16);
    const rows: number[] = [];
    for (let n = 0; n < g.nn; n++) if (!g.gone[w.idx(8, 5) * g.nn + n]) rows.push(Math.floor(n / g.n));
    expect(rows.length).toBe(16);
    expect(Math.min(...rows)).toBe(g.n - 2);
  });

  it("still takes up its whole block: two small pieces cannot share one (a limit of stage 1)", () => {
    const w = ground(20, 14);
    const fy = w.height - 1;
    w.place(8, fy - 1, "lobime");
    w.grains!.shape(w.idx(8, fy - 1), 16);
    w.place(8, 3, "lobime");
    w.grains!.shape(w.idx(8, 3), 16);
    w.run(120);
    // The second quarter-piece rests a whole block above the first, with a gap between them.
    expect(w.find("lobime")).toEqual([[8, fy - 2], [8, fy - 1]]);
  });
});

describe("grains: dust", () => {
  it("falls, and comes to rest in a heap on what is below", () => {
    const w = ground(20, 12);
    const g = w.grains!;
    for (let k = 0; k < 30; k++) g.addDust(8 * g.n + 3, 2 * g.n + k, VG.elementIndex.lobime);
    w.run(1200);
    const fy = w.height - 1;
    const ys = g.cells.map((f) => Math.floor(f / g.fw));
    // All of it lies on the floor, none inside it and none still in the air.
    expect(g.cells.length).toBe(30);
    expect(Math.max(...ys)).toBe(fy * g.n - 1);
    expect(Math.min(...ys)).toBeGreaterThan(fy * g.n - 12);
    // A heap, not a column: it spread sideways.
    const xs = g.cells.map((f) => f % g.fw);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(4);
    const before = [...g.cells].sort((a, b) => a - b);
    w.run(200);
    expect([...g.cells].sort((a, b) => a - b)).toEqual(before);
  });

  it("sinks slowly: far slower than a stone dropped beside it", () => {
    const w = ground(20, 40);
    w.grains!.addDust(8 * 8 + 3, 2 * 8, VG.elementIndex.lobime);
    w.place(12, 2, "lobime");
    w.run(60);
    const dustRow = Math.floor(w.grains!.cells[0] / w.grains!.fw) / 8;
    expect(w.find("lobime")[0][1]).toBe(w.height - 2);
    expect(dustRow).toBeLessThan(12);
    expect(dustRow).toBeGreaterThan(4);
  });

  it("its weight rests on what it lies on: a heap of stone dust on a Galog lights a Queflair", () => {
    const w = ground(24, 12);
    const fy = w.height - 1;
    w.place(8, fy, "galog", { anchored: true });
    w.place(10, fy - 1, "queflair");
    w.run(20);
    expect(brightness(w, "queflair")).toBe(0);
    heap(w, 8, fy - 1, "lobime", 64);
    w.run(20);
    // A block's worth of dust weighs what the block weighed. The heap slumps,
    // so some of it lies on the floor either side; most is on the Galog.
    let total = 0;
    for (let x = 5; x <= 11; x++) if (x !== 10) total += w.inspect(x, fy)!.load; // 10 holds the Queflair
    expect(total).toBeCloseTo(VG.elements[VG.elementIndex.lobime].mass, 10);
    expect(w.inspect(8, fy)!.load).toBeGreaterThan(total / 2);
    expect(brightness(w, "queflair")).toBeGreaterThan(1);
  });

  it("Bormite dust beside a loaded Galog drifts away slowly and stays within a few blocks", () => {
    const w = ground(120, 16);
    const fy = w.height - 1;
    const gx = 40;
    w.place(gx, fy, "galog", { anchored: true });
    for (let k = 1; k <= 3; k++) w.place(gx, fy - k, "lobime");
    for (const bx of [gx + 2, gx + 3, gx + 4]) heap(w, bx, fy - 1, "bormite", 16);
    const start = dustX(w, gx);
    let fastest = 0;
    let before = dustX(w, gx).sort((a, b) => a - b);
    for (let t = 0; t < 1500; t++) {
      w.step();
      if (t % 20 === 19) {
        const now = dustX(w, gx).sort((a, b) => a - b);
        for (let k = 0; k < now.length; k++) fastest = Math.max(fastest, Math.abs(now[k] - before[k]) / 20);
        before = now;
      }
    }
    const end = dustX(w, gx);
    expect(end.length).toBe(48);
    // It moved away from the pile...
    expect(Math.min(...end)).toBeGreaterThan(Math.min(...start) + 1);
    // ...at a speed you can watch (a block takes many ticks)...
    expect(fastest).toBeLessThan(0.1);
    expect(fastest).toBeGreaterThan(0.005);
    // ...and gathered just where the Galog's reach ends, not at the far wall.
    expect(Math.max(...end)).toBeLessThan(7);
  });

  it("stone dust beside the same Galog does not move: only what Teta pushes is carried", () => {
    const w = ground(60, 16);
    const fy = w.height - 1;
    w.place(20, fy, "galog", { anchored: true });
    w.place(20, fy - 1, "lobime");
    heap(w, 22, fy - 1, "lobime", 8);
    w.run(100);
    const before = dustX(w, 20).sort((a, b) => a - b);
    w.run(400);
    expect(dustX(w, 20).sort((a, b) => a - b)).toEqual(before);
  });

  it("dust responds as its element, in proportion: more Queflair dust glows brighter", () => {
    const glow = (grains: number) => {
      const w = ground(40, 12);
      const fy = w.height - 1;
      w.place(8, fy, "galog", { anchored: true });
      w.place(8, fy - 1, "lobime");
      heap(w, 10, fy - 1, "queflair", grains);
      w.run(30);
      return w.fieldAt("glow", 16, fy - 1);
    };
    expect(glow(0)).toBe(0);
    const some = glow(16);
    expect(some).toBeGreaterThan(0);
    expect(glow(32)).toBeCloseTo(some * 2, 6);
  });

  it("is pushed aside by a block that lands on it, not lost", () => {
    const w = ground(20, 16);
    const fy = w.height - 1;
    heap(w, 8, fy - 1, "lobime", 24);
    w.place(8, 4, "hard_rock");
    w.run(200);
    expect(w.find("hard_rock").filter(([, y]) => y === fy - 1)).toEqual([[8, fy - 1]]);
    expect(w.grains!.countDust()).toBe(24);
    for (const f of w.grains!.cells) expect(w.grains!.solidAt(f % w.grains!.fw, Math.floor(f / w.grains!.fw))).toBe(false);
  });
});

describe("grains: snapshots and determinism", () => {
  function busy(): World {
    const w = ground(60, 16);
    const fy = w.height - 1;
    w.place(20, fy, "galog", { anchored: true });
    for (let k = 1; k <= 2; k++) w.place(20, fy - k, "lobime");
    w.place(18, fy - 1, "lobime", { anchored: true });
    heap(w, 22, fy - 1, "bormite", 20);
    heap(w, 23, fy - 1, "queflair", 12);
    for (let k = 0; k < 20; k++) w.grains!.addDust(30 * 8 + (k % 5), 3 * 8 + k, VG.elementIndex.lobime);
    return w;
  }

  it("a snapshot with chips and dust restores exactly and continues identically", () => {
    const a = busy();
    for (let t = 0; t < 70; t++) {
      if (t % 10 === 0) a.strike(a.idx(18, a.height - 2), 1, 3, 7, 3);
      a.step();
    }
    expect(a.grains!.fill[a.idx(18, a.height - 2)]).toBe(0.5);
    expect(a.grains!.countDust()).toBeGreaterThan(60);
    const b = cloneWorld(a);
    expect(b.stateHash()).toBe(a.stateHash());
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
      if (t % 25 === 0) expect(b.stateHash()).toBe(a.stateHash());
    }
    expect(b.stateHash()).toBe(a.stateHash());
  });

  it("two runs of the same world agree", () => {
    const a = busy();
    const b = busy();
    a.run(500);
    b.run(500);
    expect(b.stateHash()).toBe(a.stateHash());
  });
});

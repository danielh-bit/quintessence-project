import { describe, expect, it } from "vitest";
import { cloneWorld, loadScene, saveScene } from "../../src/core";
import { floor, makeWorld, rulesWith, runUntil, V0 } from "../helpers/world";

const g = V0.world.gravity;

describe("gravity and falling", () => {
  it("a loose cell accelerates at g, lands on the floor and stops", () => {
    const w = makeWorld(5, 30);
    floor(w);
    w.place(2, 0, "lobime");
    w.step();
    const b = w.bodyAt(2, 0)!;
    expect(b.vy).toBeCloseTo(g, 10);
    w.step();
    expect(w.bodyAt(2, w.yOf(b.cells[0]))!.vy).toBeCloseTo(2 * g, 10);

    const landed = runUntil(w, () => w.elementAt(2, 28) === "lobime", 200);
    expect(landed).toBeGreaterThan(0);
    w.run(5);
    const info = w.inspect(2, 28)!;
    expect(info.body!.vy).toBe(0);
    expect(info.body!.resting).toBe(true);
  });

  it("fall time grows like sqrt(height)", () => {
    const fallTicks = (h: number) => {
      const w = makeWorld(3, h + 2);
      floor(w);
      w.place(1, 0, "lobime");
      return runUntil(w, () => w.elementAt(1, h) === "lobime", 1000);
    };
    const t8 = fallTicks(8);
    const t32 = fallTicks(32);
    // Ideal: t = sqrt(2h/g); quadrupling the height doubles the time.
    expect(t8).toBeGreaterThan(Math.sqrt((2 * 8) / g) - 3);
    expect(t8).toBeLessThan(Math.sqrt((2 * 8) / g) + 3);
    expect(t32 / t8).toBeGreaterThan(1.8);
    expect(t32 / t8).toBeLessThan(2.2);
  });

  it("records the landing as an impact equal to the closing speed", () => {
    const w = makeWorld(3, 20);
    floor(w);
    w.place(1, 0, "lobime");
    let maxImpact = 0;
    for (let t = 0; t < 100; t++) {
      w.step();
      maxImpact = Math.max(maxImpact, w.impact[w.idx(1, 18)], w.impact[w.idx(1, 19)]);
    }
    const ideal = Math.sqrt(2 * g * 18);
    expect(maxImpact).toBeGreaterThan(ideal * 0.8);
    expect(maxImpact).toBeLessThan(ideal * 1.2);
  });

  it("a settled stack stays put and records no further impacts", () => {
    const w = makeWorld(3, 20);
    floor(w);
    for (let y = 0; y < 6; y++) w.place(1, y * 2, "lobime");
    w.run(200);
    const col = [...Array(20).keys()].map((y) => w.elementAt(1, y));
    // Six cells stacked flush on the floor, no gaps.
    expect(col.slice(13, 19)).toEqual(Array(6).fill("lobime"));
    expect(col.slice(0, 13).every((c) => c === null)).toBe(true);
    const hash = w.stateHash();
    for (let t = 0; t < 100; t++) {
      w.step();
      for (let y = 13; y < 20; y++) expect(w.impact[w.idx(1, y)]).toBe(0);
    }
    // Only the tick counter changed.
    w.tick -= 100;
    expect(w.stateHash()).toBe(hash);
  });

  it("a bonded body falls as one and rests on a single pillar", () => {
    const w = makeWorld(9, 20);
    floor(w);
    w.place(4, 18, "hard_rock", { anchored: true });
    for (let x = 2; x <= 6; x++) w.place(x, 2, "lobime");
    const [id] = w.bond([2, 3, 4, 5, 6].map((x) => [x, 2] as [number, number]));
    expect(w.bodies.get(id)!.cells.length).toBe(5);
    w.run(150);
    for (let x = 2; x <= 6; x++) expect(w.elementAt(x, 17)).toBe("lobime");
    expect(w.bodyAt(2, 17)!.resting).toBe(true);
  });
});

describe("collisions and friction", () => {
  it("a moving body hitting a resting one shares its momentum", () => {
    const w = makeWorld(30, 4, rulesWith((j) => (j.world.friction = 0)));
    floor(w);
    w.place(2, 2, "lobime");
    w.place(10, 2, "lobime");
    w.setVelocity(2, 2, 0.5, 0);
    w.run(60);
    const a = w.find("lobime").map(([x]) => x);
    // Equal masses, no restitution: they move off together at half the speed.
    expect(a[0]).toBeGreaterThan(10);
    expect(w.bodyAt(a[1], 2)!.vx).toBeCloseTo(0.25, 6);
  });

  it("friction slows a shoved block to a stop on the floor", () => {
    const w = makeWorld(60, 4);
    floor(w);
    w.place(2, 2, "lobime");
    w.setVelocity(2, 2, 1.0, 0);
    w.run(200);
    const [[x]] = w.find("lobime");
    expect(x).toBeGreaterThan(2);
    expect(w.bodyAt(x, 2)!.vx).toBe(0);
  });

  it("an impact on a pile reaches the cell at the bottom", () => {
    const w = makeWorld(3, 30);
    floor(w);
    w.place(1, 27, "lobime");
    w.place(1, 28, "lobime");
    w.place(1, 0, "lobime");
    let floorImpact = 0;
    for (let t = 0; t < 120; t++) {
      w.step();
      floorImpact = Math.max(floorImpact, w.impact[w.idx(1, 29)]);
    }
    expect(floorImpact).toBeGreaterThan(V0.world.minImpact);
  });
});

describe("weight resting on a cell", () => {
  it("is the mass of the stack above", () => {
    const w = makeWorld(3, 10);
    floor(w);
    w.place(1, 8, "galog", { anchored: true });
    for (let y = 5; y <= 7; y++) w.place(1, y, "lobime");
    w.run(2);
    expect(w.load[w.idx(1, 8)]).toBeCloseTo(9, 10);
    expect(w.load[w.idx(1, 7)]).toBeCloseTo(6, 10);
  });

  it("splits a bonded slab's weight over the cells it rests on", () => {
    const w = makeWorld(7, 10);
    floor(w);
    for (let x = 2; x <= 4; x++) w.place(x, 8, "galog", { anchored: true });
    for (let x = 2; x <= 4; x++) w.place(x, 7, "lobime");
    w.place(3, 6, "hard_rock");
    w.bond([[2, 7], [3, 7], [4, 7], [3, 6]]);
    w.run(2);
    const total = 3 * 3 + 6;
    for (let x = 2; x <= 4; x++) expect(w.load[w.idx(x, 8)]).toBeCloseTo(total / 3, 10);
    // Inside the body, the middle cell carries the hard rock bonded on top of it.
    expect(w.load[w.idx(3, 7)]).toBeCloseTo(6, 10);
  });
});

describe("determinism and scenes", () => {
  function messyWorld(seed: number) {
    const w = makeWorld(40, 30, V0, seed);
    floor(w);
    const ids = Object.keys(V0.elementIndex);
    let k = 0;
    for (let y = 2; y < 20; y += 2) {
      for (let x = 1; x < 39; x += 3) {
        k++;
        w.place(x + (k % 2), y, ids[k % ids.length], { anchored: k % 7 === 0 });
      }
    }
    w.bond([[4, 4], [5, 4], [4, 5]]);
    return w;
  }

  it("the same start state gives the same result", () => {
    const a = messyWorld(7);
    const b = messyWorld(7);
    a.run(300);
    b.run(300);
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it("a snapshot taken mid-run continues identically", () => {
    const a = messyWorld(3);
    a.run(80);
    const json = JSON.stringify(saveScene(a));
    const b = loadScene(V0, JSON.parse(json));
    expect(b.stateHash()).toBe(a.stateHash());
    a.run(200);
    b.run(200);
    expect(b.stateHash()).toBe(a.stateHash());
  });

  it("round-trips through JSON without loss", () => {
    const a = messyWorld(5);
    a.run(40);
    const c = cloneWorld(a);
    expect(saveScene(c)).toEqual(saveScene(a));
  });

  it("rejects malformed scenes with a message", () => {
    expect(() => loadScene(V0, { format: "x" })).toThrow(/format/);
    expect(() =>
      loadScene(V0, { format: "quintessence-scene", version: 1, width: 2, height: 2, cells: [{ x: 5, y: 0, e: "lobime" }] }),
    ).toThrow(/outside/);
    expect(() =>
      loadScene(V0, { format: "quintessence-scene", version: 1, width: 2, height: 2, cells: [{ x: 0, y: 0, e: "nope" }] }),
    ).toThrow(/unknown element/);
  });
});

describe("review fixes: motion", () => {
  it("a body landing on a stack that is being lifted is not treated as hitting the ground", () => {
    const w = makeWorld(5, 8);
    floor(w);
    w.place(2, 6, "exgen", { anchored: true });
    w.place(2, 5, "bormite");
    w.place(2, 4, "queflair");
    w.setVelocity(2, 4, 0, 0.3);
    w.output[w.idx(2, 6)] = 300; // the Exgen has just fired: its Teta lifts the Bormite this tick
    w.step();
    // The blow from the Queflair never reaches the Exgen under a rising Bormite.
    expect(w.impact[w.idx(2, 6)]).toBe(0);
  });

  it("is mirror-symmetric: a row pushed right behaves like the same row pushed left", () => {
    const run = (dir: 1 | -1) => {
      const w = makeWorld(21, 4);
      floor(w);
      for (const x of [8, 9, 10]) w.place(dir === 1 ? x : 20 - x, 2, "lobime");
      w.setVelocity(dir === 1 ? 8 : 12, 2, dir * 1.0, 0);
      const trace: string[] = [];
      for (let t = 0; t < 30; t++) {
        w.step();
        trace.push(
          w
            .find("lobime")
            .filter(([, y]) => y === 2)
            .map(([x]) => (dir === 1 ? x : 20 - x))
            .sort((a, b) => a - b)
            .join(","),
        );
      }
      return trace;
    };
    expect(run(-1)).toEqual(run(1));
  });

  it("is translation-invariant: the same setup elsewhere in the world gives the same result", () => {
    const run = (shift: number) => {
      const w = makeWorld(40, 12);
      floor(w);
      w.place(5 + shift, 10, "lobime");
      w.place(6 + shift, 10, "lobime");
      w.place(9 + shift, 10, "lobime");
      w.place(6 + shift, 2, "lobime");
      w.setVelocity(5 + shift, 10, 0.8, 0);
      w.setVelocity(9 + shift, 10, -0.8, 0);
      w.run(40);
      return w.find("lobime").map(([x, y]) => `${x - shift},${y}`).sort().join(" ");
    };
    expect(run(17)).toBe(run(0));
  });

  it("friction drags loose cargo along with the moving body it rests on", () => {
    const w = makeWorld(80, 6, rulesWith((j) => (j.world.friction = 0.2)));
    floor(w);
    const slab = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (const x of slab) w.place(x, 4, "lobime");
    w.bond(slab.map((x) => [x, 4] as [number, number]));
    w.place(9, 3, "queflair");
    // A gentle shove: friction can only speed the cargo up by mu*g per tick.
    w.setVelocity(2, 4, 0.3, 0);
    w.run(80);
    const [[qx, qy]] = w.find("queflair");
    expect(qy).toBe(3); // still riding on the slab
    expect(qx).toBeGreaterThanOrEqual(11); // carried along, not left standing still
  });

  it("bonding bodies that do not touch leaves them exactly as they were", () => {
    const w = makeWorld(10, 10);
    w.place(1, 1, "lobime");
    w.place(5, 1, "lobime");
    w.setVelocity(1, 1, 0.3, 0);
    const a = w.bodyAt(1, 1)!.id;
    const b = w.bodyAt(5, 1)!.id;
    w.bond([[1, 1], [5, 1]]);
    expect(w.bodyAt(1, 1)!.id).toBe(a);
    expect(w.bodyAt(5, 1)!.id).toBe(b);
    expect(w.bodyAt(1, 1)!.vx).toBe(0.3);
    expect(w.bodyAt(5, 1)!.vx).toBe(0);
  });

  it("speeds above any fixed step budget keep offsets within half a cell", () => {
    const w = makeWorld(400, 3, rulesWith((j) => (j.world.maxSpeed = 60)));
    w.place(1, 1, "lobime", { anchored: false });
    const rules = w.rules;
    expect(rules.world.maxSpeed).toBe(60);
    // No gravity effect matters here: give it a fast horizontal start in mid-air.
    w.setVelocity(1, 1, 50, 0);
    w.step();
    const [[x]] = w.find("lobime");
    expect(x).toBeGreaterThan(40);
    const b = w.bodyAt(x, w.find("lobime")[0][1])!;
    expect(Math.abs(b.ox)).toBeLessThanOrEqual(0.5);
  });

  it("weight on bodies that rest on each other in a loop still reaches the cell below", () => {
    const w = makeWorld(6, 10);
    floor(w);
    w.place(2, 8, "galog", { anchored: true });
    w.place(2, 7, "lobime");
    const A: Array<[number, number]> = [[1, 3], [1, 4], [1, 5], [2, 5]];
    const B: Array<[number, number]> = [[2, 4], [3, 4], [3, 5], [3, 6], [2, 6]];
    for (const [x, y] of [...A, ...B]) w.place(x, y, "lobime");
    w.bond(A);
    w.bond(B);
    expect(w.bodyAt(1, 3)!.id).not.toBe(w.bodyAt(2, 4)!.id);
    w.run(3);
    // Lobime block + hook A (4 cells) + hook B (5 cells), all mass 3.
    expect(w.load[w.idx(2, 8)]).toBeCloseTo(30, 6);
  });

  it("refuses malformed body and tick values in a scene", () => {
    const base = { format: "quintessence-scene", version: 1, width: 4, height: 4 };
    const cell = { x: 1, y: 1, e: "lobime", b: 1 };
    expect(() => loadScene(V0, { ...base, cells: [cell], bodies: [{ id: 1, vx: "fast" }] })).toThrow(/vx/);
    expect(() => loadScene(V0, { ...base, cells: [cell], tick: -5.5 })).toThrow(/tick/);
    expect(() => loadScene(V0, { ...base, cells: [null] })).toThrow(/object/);
    expect(() => loadScene(V0, { ...base, cells: [{ x: 1.5, y: 1, e: "lobime" }] })).toThrow(/whole/);
    expect(() => loadScene(V0, { ...base, cells: [{ x: 1, y: 1, e: "toString" }] })).toThrow(/unknown element/);
    expect(() => loadScene(V0, { ...base, cells: [cell], bodies: 5 })).toThrow(/bodies/);
    expect(() => loadScene(V0, { ...base, cells: [cell], bodies: [{ id: 1, ox: 50 }] })).toThrow(/offset/);
  });
});

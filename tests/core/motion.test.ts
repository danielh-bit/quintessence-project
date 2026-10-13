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

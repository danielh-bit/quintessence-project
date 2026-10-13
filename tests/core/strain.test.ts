import { describe, expect, it } from "vitest";
import { floor, makeWorld, rulesWith, V0 } from "../helpers/world";

const def = (id: string) => V0.elements[V0.elementIndex[id]];

/** A Galog in the floor with `n` stones on it, and a Queflair beside the stack. */
function loadedGalog(n: number, rules = V0) {
  const w = makeWorld(9, 12, rules);
  floor(w);
  w.place(4, 11, "galog", { anchored: true });
  for (let k = 1; k <= n; k++) w.place(4, 11 - k, "lobime");
  return w;
}

describe("strain", () => {
  it("builds with the response and recovers at rest", () => {
    const w = loadedGalog(3);
    const g = w.idx(4, 11);
    w.run(200);
    const loaded = w.strain[g];
    expect(loaded).toBeGreaterThan(0);
    for (let y = 8; y <= 10; y++) w.erase(4, y);
    w.run(50);
    expect(w.strain[g]).toBeLessThan(loaded);
    w.run(2000);
    expect(w.strain[g]).toBe(0);
  });

  it("Galog tires under long load (output falls) and recovers when unloaded", () => {
    const w = loadedGalog(3);
    const g = w.idx(4, 11);
    w.run(3);
    const fresh = w.output[g];
    w.run(3000);
    const tired = w.output[g];
    expect(tired).toBeLessThan(fresh * 0.9);
    expect(tired).toBeGreaterThan(0);
    // It settles below its breaking point instead of degrading.
    expect(w.elementAt(4, 11)).toBe("galog");
    expect(w.strain[g]).toBeLessThan(def("galog").strain.max);
    for (let y = 8; y <= 10; y++) w.erase(4, y);
    w.run(3000);
    for (let y = 8; y <= 10; y++) w.place(4, y, "lobime");
    w.run(3);
    expect(w.output[g]).toBeGreaterThan(tired);
  });

  it("an element past its limit degrades (Queflair burns out after glowing for a while)", () => {
    // Mechanism only: recovery slower than the build-up at this glow.
    const w = loadedGalog(3, rulesWith((j) => (j.elements.queflair.strain.recover = 0.02)));
    w.place(5, 10, "queflair");
    let burnt = -1;
    for (let t = 0; t < 20000 && burnt < 0; t++) {
      w.step();
      if (w.events.some((e) => e.kind === "degrade" && e.element === V0.elementIndex.queflair)) burnt = t;
    }
    expect(burnt).toBeGreaterThan(100);
    expect(w.find("queflair")).toEqual([]);
  });

  it("degradesTo is data: a cell can turn into another element instead of crumbling", () => {
    const rules = rulesWith((j) => {
      j.elements.queflair.degradesTo = "lobime";
      j.elements.queflair.strain.max = 1;
    });
    const w = loadedGalog(3, rules);
    w.place(5, 10, "queflair");
    w.run(200);
    expect(w.find("queflair")).toEqual([]);
    expect(w.elementAt(5, 10)).toBe("lobime");
  });

  it("a bonded body that loses a cell falls apart into its parts", () => {
    const rules = rulesWith((j) => (j.elements.queflair.strain.max = 1));
    const w = makeWorld(12, 12, rules);
    floor(w);
    w.place(5, 11, "galog", { anchored: true });
    w.place(5, 10, "lobime");
    // A bonded beam resting on a pillar, with a Queflair in the middle near the Galog.
    w.place(2, 6, "hard_rock", { anchored: true });
    w.place(8, 6, "hard_rock", { anchored: true });
    for (let x = 2; x <= 8; x++) w.place(x, 5, x === 6 ? "queflair" : "lobime");
    w.bond([2, 3, 4, 5, 6, 7, 8].map((x) => [x, 5] as [number, number]));
    expect(new Set([2, 3, 4, 5, 6, 7, 8].map((x) => w.bodyAt(x, 5)!.id)).size).toBe(1);
    // Put Teta on the Queflair directly by loading a Galog right under it.
    w.place(6, 6, "galog", { anchored: true });
    w.place(6, 4, "hard_rock");
    w.run(300);
    if (w.find("queflair").length === 0) {
      const ids = new Set(w.find("lobime").filter(([, y]) => y < 10).map(([x, y]) => w.bodyAt(x, y)?.id));
      expect(ids.size).toBeGreaterThanOrEqual(2);
    } else {
      throw new Error("queflair did not burn out");
    }
  });

  it("heat strains and eventually breaks Hard Rock, which reacts to nothing directly", () => {
    const w = makeWorld(5, 5);
    w.place(2, 2, "hard_rock", { anchored: true });
    const heat = V0.energyIndex.heat;
    let broke = false;
    for (let t = 0; t < 20000 && !broke; t++) {
      w.field[heat][w.idx(2, 2)] = 400; // held hot from outside
      w.step();
      broke = w.elementAt(2, 2) === null;
    }
    expect(broke).toBe(true);
  });
});

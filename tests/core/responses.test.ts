import { describe, expect, it } from "vitest";
import { floor, makeWorld, rulesWith, V0 } from "../helpers/world";

const el = (id: string) => V0.elements[V0.elementIndex[id]];
const emitShape = (id: string) => {
  const r = el(id).response;
  if (r.kind === "none") throw new Error("no response");
  return r;
};

describe("pressure trigger (Galog)", () => {
  it("emits in proportion to the weight resting on it, and stops when unloaded", () => {
    const w = makeWorld(5, 10);
    floor(w);
    w.place(2, 8, "galog", { anchored: true });
    w.run(3);
    expect(w.output[w.idx(2, 8)]).toBe(0);
    w.place(2, 7, "lobime");
    w.run(2);
    const g = emitShape("galog");
    expect(w.output[w.idx(2, 8)]).toBeCloseTo(g.gain * 3, 1);
    w.place(2, 6, "lobime");
    w.run(2);
    expect(w.output[w.idx(2, 8)]).toBeCloseTo(g.gain * 6, 1);
    w.erase(2, 6);
    w.erase(2, 7);
    w.run(2);
    expect(w.output[w.idx(2, 8)]).toBe(0);
  });
});

describe("motion trigger (Colomium)", () => {
  it("hums only while moving, louder and higher when faster", () => {
    const run = (speed: number) => {
      const w = makeWorld(200, 4, rulesWith((j) => (j.world.friction = 0)));
      floor(w);
      w.place(2, 2, "colomium");
      w.setVelocity(2, 2, speed, 0);
      w.step();
      const [[x, y]] = w.find("colomium");
      return { out: w.output[w.idx(x, y)], pitch: w.outPitch[w.idx(x, y)] };
    };
    const slow = run(0.2);
    const fast = run(0.6);
    expect(slow.out).toBeGreaterThan(0);
    expect(fast.out).toBeGreaterThan(slow.out);
    expect(fast.pitch).toBeGreaterThan(slow.pitch);
    expect(run(0).out).toBe(0);
  });
});

describe("impact trigger (Exgen)", () => {
  it("fires a burst sized by the closing speed, which then dies away", () => {
    const burst = (height: number) => {
      const w = makeWorld(3, height + 3);
      floor(w);
      w.place(1, height + 1, "exgen", { anchored: true });
      w.place(1, 0, "lobime");
      let peak = 0;
      const trace: number[] = [];
      for (let t = 0; t < 200; t++) {
        w.step();
        const o = w.output[w.idx(1, height + 1)];
        trace.push(o);
        peak = Math.max(peak, o);
      }
      return { peak, trace };
    };
    const low = burst(4);
    const high = burst(16);
    expect(low.peak).toBeGreaterThan(0);
    expect(high.peak).toBeGreaterThan(low.peak * 1.6);
    // After the burst it decays geometrically and is gone at the end.
    expect(high.trace[high.trace.length - 1]).toBe(0);
  });
});

describe("exposure trigger and the Teta push (Galog -> Queflair, Bormite)", () => {
  it("a loaded Galog makes a neighbouring Queflair glow and pushes Bormite away", () => {
    const w = makeWorld(15, 11);
    floor(w);
    w.place(7, 10, "galog", { anchored: true });
    for (let y = 7; y <= 9; y++) w.place(7, y, "lobime");
    w.place(8, 9, "queflair");
    w.place(9, 9, "bormite");
    w.run(4);
    expect(w.output[w.idx(8, 9)]).toBeGreaterThan(0);
    expect(w.fieldAt("glow", 8, 9)).toBeGreaterThan(0);
    // Bormite (very light) is pushed away from the Galog: up and to the right.
    const b = w.bodyAt(9, 9) ?? [...w.bodies.values()].find((bb) => w.elem[bb.cells[0]] === V0.elementIndex.bormite)!;
    expect(b.vx).toBeGreaterThanOrEqual(0);
    w.run(100);
    const [[bx, by]] = w.find("bormite");
    expect(Math.hypot(bx - 7, by - 10)).toBeGreaterThan(Math.hypot(9 - 7, 9 - 10));
  });

  it("nothing happens without the weight", () => {
    const w = makeWorld(15, 11);
    floor(w);
    w.place(7, 10, "galog", { anchored: true });
    w.place(8, 9, "queflair");
    w.place(9, 9, "bormite");
    w.run(100);
    expect(w.output[w.idx(8, 9)]).toBe(0);
    expect(w.elementAt(9, 9)).toBe("bormite");
  });

  it("gains are data: doubling Queflair's gain doubles its glow", () => {
    const glow = (gain: number) => {
      const rules = rulesWith((j) => (j.elements.queflair.response.gain = gain));
      const w = makeWorld(15, 11, rules);
      floor(w);
      w.place(7, 10, "galog", { anchored: true });
      w.place(7, 9, "lobime");
      w.place(8, 9, "queflair");
      w.run(4);
      return w.output[w.idx(8, 9)];
    };
    // Small gains so the glow stays below its cap.
    expect(glow(0.1)).toBeCloseTo(2 * glow(0.05), 6);
    expect(glow(0.05)).toBeGreaterThan(0);
  });
});

describe("generic energy effects", () => {
  it("heat adds strain to whatever holds it, even elements with no trigger", () => {
    const w = makeWorld(5, 5);
    w.place(2, 2, "hard_rock", { anchored: true });
    w.field[V0.energyIndex.heat][w.idx(2, 2)] = 500; // hot enough to out-pace recovery
    w.step();
    expect(w.strain[w.idx(2, 2)]).toBeGreaterThan(0);
  });

  it("hum shakes small loose things on a humming surface, not heavy ones", () => {
    const w = makeWorld(40, 6);
    floor(w);
    w.place(2, 4, "colomium", { anchored: true });
    w.output[w.idx(2, 4)] = 40; // as if it were moving fast
    w.place(10, 4, "bormite");
    w.place(14, 4, "hard_rock");
    const before = { b: w.find("bormite")[0].join(), r: w.find("hard_rock").filter(([, y]) => y === 4)[0].join() };
    let bormiteMoved = false;
    for (let t = 0; t < 200; t++) {
      // keep the source "moving"
      w.output[w.idx(2, 4)] = 40;
      w.step();
      if (w.find("bormite")[0].join() !== before.b) bormiteMoved = true;
    }
    expect(bormiteMoved).toBe(true);
    expect(w.find("hard_rock").filter(([, y]) => y === 4)[0].join()).toBe(before.r);
  });
});

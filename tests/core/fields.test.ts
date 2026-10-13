import { describe, expect, it } from "vitest";
import { computeFields } from "../../src/core/fields/index";
import type { World } from "../../src/core";
import { floor, makeWorld, rulesWith, V0 } from "../helpers/world";

const TETA = V0.energyIndex.teta;
const GLOW = V0.energyIndex.glow;
const HUM = V0.energyIndex.hum;
const HEAT = V0.energyIndex.heat;
const R_TETA = V0.energies[TETA].range;

/** Make the cell at (x, y) emit with a fixed output (as if its trigger had fired). */
function emitter(w: World, x: number, y: number, element: string, output: number, pitch = 0) {
  w.place(x, y, element, { anchored: true });
  w.output[w.idx(x, y)] = output;
  w.outPitch[w.idx(x, y)] = pitch;
}

describe("Teta (radial): short range, all directions, blocked by Lobime", () => {
  it("falls off linearly and stops at its range", () => {
    const w = makeWorld(21, 21);
    emitter(w, 10, 10, "galog", 12);
    computeFields(w);
    const f = (x: number, y: number) => w.fieldAt("teta", x, y);
    expect(f(10, 10)).toBeCloseTo(12, 10);
    expect(f(11, 10)).toBeCloseTo(12 * (1 - 1 / (R_TETA + 1)), 10);
    expect(f(10 + R_TETA, 10)).toBeCloseTo(12 / (R_TETA + 1), 10);
    expect(f(10 + R_TETA + 1, 10)).toBe(0);
    // All directions, including diagonals (path length sqrt 2 per step).
    expect(f(10, 7)).toBeCloseTo(f(13, 10), 10);
    expect(f(12, 12)).toBeCloseTo(12 * (1 - (2 * Math.SQRT2) / (R_TETA + 1)), 10);
  });

  it("does not pass a closed Lobime wall, and is absent inside Lobime", () => {
    const w = makeWorld(21, 21);
    emitter(w, 10, 10, "galog", 12);
    for (let y = 0; y < 21; y++) w.place(12, y, "lobime", { anchored: true });
    computeFields(w);
    expect(w.fieldAt("teta", 11, 10)).toBeGreaterThan(0);
    expect(w.fieldAt("teta", 12, 10)).toBe(0);
    expect(w.fieldAt("teta", 13, 10)).toBe(0);
  });

  it("goes around a single Lobime block (weaker behind it), but not through a diagonal Lobime wall", () => {
    const w = makeWorld(21, 21);
    emitter(w, 10, 10, "galog", 12);
    w.place(11, 10, "lobime", { anchored: true });
    computeFields(w);
    const behind = w.fieldAt("teta", 12, 10);
    expect(behind).toBeGreaterThan(0);
    expect(behind).toBeLessThan(w.fieldAt("teta", 10, 12));

    const v = makeWorld(21, 21);
    emitter(v, 10, 10, "galog", 12);
    for (let k = -10; k <= 10; k++) if (v.inBounds(12 + k, 10 - k)) v.place(12 + k, 10 - k, "lobime", { anchored: true });
    computeFields(v);
    expect(v.fieldAt("teta", 12, 11)).toBe(0);
    expect(v.fieldAt("teta", 13, 10)).toBe(0);
  });

  it("passes through other matter (only blockers stop it)", () => {
    const w = makeWorld(21, 21);
    emitter(w, 10, 10, "galog", 12);
    w.place(11, 10, "hard_rock", { anchored: true });
    computeFields(w);
    expect(w.fieldAt("teta", 12, 10)).toBeCloseTo(12 * (1 - 2 / (R_TETA + 1)), 10);
  });

  it("points away from its source, and opposite sources cancel", () => {
    const w = makeWorld(21, 21);
    emitter(w, 10, 10, "galog", 12);
    computeFields(w);
    const i = w.idx(12, 10);
    expect(w.dirX[TETA]![i]).toBeGreaterThan(0);
    expect(w.dirY[TETA]![i]).toBeCloseTo(0, 10);
    expect(w.dirY[TETA]![w.idx(10, 8)]).toBeLessThan(0); // above the source: pushed up

    const v = makeWorld(21, 21);
    emitter(v, 8, 10, "galog", 12);
    emitter(v, 12, 10, "galog", 12);
    computeFields(v);
    expect(v.dirX[TETA]![v.idx(10, 10)]).toBeCloseTo(0, 10);
    expect(v.fieldAt("teta", 10, 10)).toBeGreaterThan(12);
  });

  it("leaves out a cell's own emission from its exposure", () => {
    const w = makeWorld(5, 5);
    emitter(w, 2, 2, "galog", 12);
    computeFields(w);
    const i = w.idx(2, 2);
    expect(w.field[TETA][i] - w.ownField[TETA][i]).toBe(0);
  });

  it("reach is data: a shorter range in the rules reaches fewer cells", () => {
    const rules = rulesWith((j) => (j.energies.teta.range = 2));
    const w = makeWorld(21, 21, rules);
    emitter(w, 10, 10, "galog", 12);
    computeFields(w);
    expect(w.fieldAt("teta", 12, 10)).toBeGreaterThan(0);
    expect(w.fieldAt("teta", 13, 10)).toBe(0);
  });
});

describe("Glow (ray): straight lines of sight", () => {
  it("reaches far along a clear line and lights the surface it lands on", () => {
    const w = makeWorld(60, 9);
    emitter(w, 5, 4, "queflair", 10);
    w.place(40, 4, "ralgen", { anchored: true });
    computeFields(w);
    const R = V0.energies[GLOW].range;
    expect(w.fieldAt("glow", 40, 4)).toBeCloseTo(10 * (1 - 35 / (R + 1)), 10);
    expect(w.fieldAt("glow", 41, 4)).toBe(0); // behind the Ralgen: in its shadow
  });

  it("is blocked by matter in the line, and does not bend around corners", () => {
    const w = makeWorld(60, 9);
    emitter(w, 5, 4, "queflair", 10);
    w.place(40, 4, "ralgen", { anchored: true });
    w.place(20, 4, "lobime", { anchored: true });
    computeFields(w);
    expect(w.fieldAt("glow", 20, 4)).toBeGreaterThan(0);
    expect(w.fieldAt("glow", 40, 4)).toBe(0);
  });

  it("does not reach beyond its range", () => {
    const R = V0.energies[GLOW].range;
    const w = makeWorld(R + 20, 3);
    emitter(w, 1, 1, "queflair", 10);
    computeFields(w);
    expect(w.fieldAt("glow", 1 + R, 1)).toBeGreaterThan(0);
    expect(w.fieldAt("glow", 2 + R, 1)).toBe(0);
  });
});

describe("Hum (conduction): only through connected solids, long range", () => {
  it("travels far along a touching line of stone, with the source's pitch", () => {
    const w = makeWorld(60, 5);
    for (let x = 0; x < 50; x++) w.place(x, 3, "hard_rock", { anchored: true });
    emitter(w, 2, 2, "colomium", 8, 0.7);
    w.place(45, 2, "sormite", { anchored: true });
    computeFields(w);
    expect(w.fieldAt("hum", 45, 2)).toBeGreaterThan(0);
    expect(w.pitch[HUM]![w.idx(45, 2)]).toBeCloseTo(0.7, 10);
    // Not into the air above the line.
    expect(w.fieldAt("hum", 20, 2)).toBe(0);
  });

  it("does not jump a gap and is stopped by Lobime", () => {
    const w = makeWorld(40, 5);
    for (let x = 0; x < 40; x++) if (x !== 20) w.place(x, 3, "hard_rock", { anchored: true });
    emitter(w, 2, 2, "colomium", 8);
    computeFields(w);
    expect(w.fieldAt("hum", 19, 3)).toBeGreaterThan(0);
    expect(w.fieldAt("hum", 21, 3)).toBe(0);

    w.place(20, 3, "lobime", { anchored: true });
    computeFields(w);
    expect(w.fieldAt("hum", 21, 3)).toBe(0);
    w.place(20, 3, "hard_rock", { anchored: true });
    computeFields(w);
    expect(w.fieldAt("hum", 21, 3)).toBeGreaterThan(0);
  });

  it("reaches loose things resting on a humming surface", () => {
    const w = makeWorld(30, 5);
    floor(w);
    emitter(w, 2, 3, "colomium", 8);
    w.place(20, 3, "bormite");
    computeFields(w);
    expect(w.fieldAt("hum", 20, 3)).toBeGreaterThan(0);
  });
});

describe("Heat (diffusion): slow spread through solids", () => {
  function rod(len: number, element = "hard_rock") {
    const w = makeWorld(len + 2, 3);
    for (let x = 1; x <= len; x++) w.place(x, 1, element, { anchored: true });
    return w;
  }

  it("spreads slowly along a rod and is conserved apart from the loss", () => {
    const w = rod(30);
    w.field[HEAT][w.idx(1, 1)] = 100;
    const sum = () => w.field[HEAT].reduce((a, b) => a + b, 0);
    computeFields(w);
    expect(sum()).toBeCloseTo(100 * (1 - V0.energies[HEAT].loss), 8);
    const far = w.idx(20, 1);
    let ticks = 0;
    while (w.field[HEAT][far] < 0.01 && ticks < 5000) {
      computeFields(w);
      ticks++;
    }
    // Far end warms only after many ticks: heat crawls.
    expect(ticks).toBeGreaterThan(50);
    expect(w.field[HEAT][w.idx(2, 1)]).toBeGreaterThan(w.field[HEAT][far]);
  });

  it("does not cross Lobime or empty space", () => {
    const w = rod(10);
    w.place(5, 1, "lobime", { anchored: true });
    w.erase(8, 1);
    w.field[HEAT][w.idx(1, 1)] = 100;
    w.field[HEAT][w.idx(7, 1)] = 50;
    for (let t = 0; t < 500; t++) computeFields(w);
    expect(w.field[HEAT][w.idx(5, 1)]).toBe(0);
    expect(w.field[HEAT][w.idx(6, 1)]).toBeGreaterThan(0); // from the right side only
    expect(w.field[HEAT][w.idx(9, 1)]).toBe(0);
    expect(w.field[HEAT][w.idx(8, 1)]).toBe(0);
  });

  it("travels with a moving cell", () => {
    const w = makeWorld(3, 20);
    floor(w);
    w.place(1, 0, "lyegen");
    w.field[HEAT][w.idx(1, 0)] = 40;
    w.run(60);
    const [[x, y]] = w.find("lyegen");
    expect(w.field[HEAT][w.idx(x, y)]).toBeGreaterThan(0);
    expect(w.field[HEAT][w.idx(1, 0)]).toBe(0);
  });
});

describe("review fixes: fields", () => {
  it("a one-cell diagonal wall casts a full Glow shadow (no slipping past corners)", () => {
    const w = makeWorld(21, 21);
    emitter(w, 4, 4, "queflair", 10);
    for (let k = 0; k <= 20; k++) w.place(20 - k, k, "lobime", { anchored: true });
    computeFields(w);
    for (let y = 12; y < 21; y++) for (let x = 21 - (20 - y) + 1; x < 21; x++) {
      if (w.elementAt(x, y) === null) expect(w.fieldAt("glow", x, y)).toBe(0);
    }
  });

  it("a block right in front of a receiver shades it", () => {
    const w = makeWorld(40, 9);
    emitter(w, 3, 4, "queflair", 10);
    w.place(30, 4, "ralgen", { anchored: true });
    computeFields(w);
    expect(w.fieldAt("glow", 30, 4)).toBeGreaterThan(0);
    w.place(29, 4, "lobime", { anchored: true });
    computeFields(w);
    expect(w.fieldAt("glow", 30, 4)).toBe(0);
  });

  it("an element that reacts to the energy it emits does not excite itself", () => {
    const rules = rulesWith((j) => {
      j.elements.lyegen.trigger = { kind: "exposure", energy: "teta" };
      j.elements.lyegen.response = { kind: "emit", energy: "teta", gain: 5, threshold: 0, max: 100, decay: 0 };
    });
    const w = makeWorld(9, 9, rules);
    w.place(4, 4, "lyegen", { anchored: true });
    w.output[w.idx(4, 4)] = 1;
    w.run(5);
    expect(w.output[w.idx(4, 4)]).toBe(0);
  });
});

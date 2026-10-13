// The invisible energy (GAME_OVERVIEW §6): a Galog with stones piled on it, a
// Queflair beside it, Bormite dust nearby. Watched from outside: does the
// Queflair light up, does the dust move away from the pile.
import { describe, expect, it } from "vitest";
import { invisibleEnergy } from "../../src/scenarios/invisibleEnergy";
import { brightness, where } from "../helpers/observe";
import { V0 } from "../helpers/world";

function distanceFromGalog(w: ReturnType<typeof invisibleEnergy.build>) {
  const [[gx, gy]] = w.find("galog");
  return where(w, "bormite").map(([x, y]) => Math.hypot(x - gx, y - gy));
}

describe("invisible energy", () => {
  it("a Galog with stones on it lights the Queflair beside it", () => {
    const w = invisibleEnergy.build(V0, { stones: 3 });
    w.run(10);
    expect(brightness(w, "queflair")).toBeGreaterThan(1);
  });

  it("nearby Bormite dust drifts away from the pile", () => {
    const w = invisibleEnergy.build(V0, { stones: 3 });
    const before = distanceFromGalog(w);
    w.run(200);
    const after = distanceFromGalog(w);
    expect(after.length).toBe(before.length);
    expect(Math.min(...after)).toBeGreaterThan(Math.max(...before));
  });

  it("with no stones on the Galog, nothing happens", () => {
    const w = invisibleEnergy.build(V0, { stones: 0 });
    const before = where(w, "bormite");
    w.run(300);
    expect(brightness(w, "queflair")).toBe(0);
    expect(where(w, "bormite")).toEqual(before);
  });

  it("even one stone is enough (the effect is set off by accident, not by a careful setup)", () => {
    const w = invisibleEnergy.build(V0, { stones: 1 });
    w.run(10);
    expect(brightness(w, "queflair")).toBeGreaterThan(1);
  });

  it("taking the stones off puts the Queflair out", () => {
    const w = invisibleEnergy.build(V0, { stones: 3 });
    w.run(20);
    expect(brightness(w, "queflair")).toBeGreaterThan(1);
    for (const [x, y] of w.find("lobime")) w.erase(x, y);
    w.run(5);
    expect(brightness(w, "queflair")).toBe(0);
  });

  it("the Queflair burns out after glowing for a while", () => {
    const w = invisibleEnergy.build(V0, { stones: 3 });
    let gone = -1;
    for (let t = 0; t < 20000 && gone < 0; t++) {
      w.step();
      if (w.find("queflair").length === 0) gone = w.tick;
    }
    expect(gone).toBeGreaterThan(300);
  });
});

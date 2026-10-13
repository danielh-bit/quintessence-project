// The runaway engine (GAME_OVERVIEW §6): moving Colomium hums, Sormite heats
// up, Lyegen emits Teta, and Teta pushes the cart carrying the Colomium faster.
// Watched from outside: where the cart is (so how fast it goes), how hot its
// parts are (hot stone changes colour), and what cracks.
import { describe, expect, it } from "vitest";
import { runaway } from "../../src/scenarios/runaway";
import { where } from "../helpers/observe";
import { V0 } from "../helpers/world";

type W = ReturnType<typeof runaway.build>;
const HEAT = V0.energies.find((e) => e.spread === "diffusion")!.index;

/** Front of the cart: the rightmost cart cell on the cart row. */
function front(w: W): number {
  const xs = [...where(w, "bormite"), ...where(w, "lyegen"), ...where(w, "colomium")].map(([x]) => x);
  return xs.length ? Math.max(...xs) : -1;
}

/** Cells moved per tick over the next n ticks. */
function speedOver(w: W, n: number): number {
  const a = front(w);
  w.run(n);
  return (front(w) - a) / n;
}

function temperature(w: W, element: string): number {
  const p = where(w, element)[0];
  return p ? w.field[HEAT][w.idx(p[0], p[1])] : NaN;
}

describe("runaway engine", () => {
  it("after a shove it speeds itself up", () => {
    const w = runaway.build(V0, { shove: 0.5, track: 1600 });
    const s1 = speedOver(w, 100);
    const s2 = speedOver(w, 100);
    const s3 = speedOver(w, 100);
    expect(s2).toBeGreaterThan(s1);
    expect(s3).toBeGreaterThan(s2);
    expect(s3).toBeGreaterThan(0.5 * 2); // well past its starting speed
  });

  it("each link of the loop shows: it hums, the Sormite heats, the Lyegen pushes the sail", () => {
    const w = runaway.build(V0, { shove: 0.5, track: 1600 });
    w.run(150);
    const [[sx, sy]] = where(w, "sormite");
    expect(w.fieldAt("hum", sx, sy)).toBeGreaterThan(0);
    const t1 = temperature(w, "sormite");
    w.run(100);
    expect(temperature(w, "sormite")).toBeGreaterThan(t1);
    expect(temperature(w, "lyegen")).toBeGreaterThan(0);
    const [[bx, by]] = where(w, "bormite");
    expect(w.fieldAt("teta", bx, by)).toBeGreaterThan(1);
  });

  it("keeps heating while it runs until it overheats and falls apart", () => {
    const w = runaway.build(V0, { shove: 0.5, track: 1600 });
    const cracks: Array<{ tick: number; element: string; x: number; heat: number }> = [];
    let sormiteHeat = 0;
    for (let t = 0; t < 1400; t++) {
      if (where(w, "sormite").length) sormiteHeat = temperature(w, "sormite");
      w.step();
      for (const e of w.events) {
        if (e.kind !== "degrade") continue;
        cracks.push({ tick: e.tick, element: w.rules.elements[e.element].id, x: e.x, heat: sormiteHeat });
      }
    }
    const engine = cracks.filter((c) => ["lyegen", "sormite", "colomium"].includes(c.element));
    expect(engine.length).toBeGreaterThanOrEqual(2);
    // The first part to go cracks late, and hot: overheating, not wear from its own output.
    expect(engine[0].tick).toBeGreaterThan(500);
    expect(engine[0].heat).toBeGreaterThan(200);
    // ...out on the track, not by crashing into the end wall...
    expect(engine[0].x).toBeLessThan(1600 - 10);
    // ...and the rest of the engine follows: it falls apart.
    expect(new Set(engine.map((c) => c.element)).size).toBeGreaterThanOrEqual(2);
    expect(where(w, "lyegen").length).toBe(0);
  });

  it("with the loop broken (Lobime instead of Sormite) the same shove just coasts to a stop", () => {
    const w = runaway.build(V0, { shove: 0.5, loop: 0 });
    const s1 = speedOver(w, 30);
    w.run(200);
    const s2 = speedOver(w, 50);
    expect(s1).toBeGreaterThan(0);
    expect(s2).toBe(0);
    expect(temperature(w, "lyegen")).toBe(0);
  });

  it("needs a kick: too gentle a shove dies out before the heat builds", () => {
    const w = runaway.build(V0, { shove: 0.3 });
    w.run(300);
    expect(speedOver(w, 50)).toBe(0);
    const still = runaway.build(V0, { shove: 0 });
    still.run(300);
    expect(front(still)).toBe(front(runaway.build(V0, { shove: 0 })));
  });
});

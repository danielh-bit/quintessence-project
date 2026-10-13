// The bouncer (GAME_OVERVIEW §6): Bormite in a closed shaft on an Exgen.
// Built from plain blocks by src/scenarios/bouncer.ts and watched from outside:
// where the Bormite is, and when the Queflair in the wall flashes.
import { describe, expect, it } from "vitest";
import { bouncer } from "../../src/scenarios/bouncer";
import { period, risingEdges } from "../helpers/measure";
import { brightness, record, runCollectingEvents, where } from "../helpers/observe";
import { rulesWith, V0 } from "../helpers/world";

const TICKS = 2000;

/** Times the Bormite arrives at the bottom of the shaft (its lowest row). */
function landings(heights: number[]): number[] {
  const bottom = Math.max(...heights);
  const out: number[] = [];
  for (let i = 1; i < heights.length; i++) if (heights[i] === bottom && heights[i - 1] !== bottom) out.push(i);
  return out;
}

function watch(params: { shaft: number; weight?: number }, rules = V0) {
  const w = bouncer.build(rules, params);
  const samples = record(w, TICKS, (w) => ({ y: where(w, "bormite")[0]?.[1] ?? -1, glow: brightness(w, "queflair") }));
  const ys = samples.map((s) => s.y);
  const flashes = risingEdges(samples.map((s) => s.glow), 1);
  return { lands: landings(ys), flashes, beat: period(flashes) };
}

describe("bouncer", () => {
  it("keeps bouncing on its own, with a steady beat", () => {
    const { lands, beat } = watch({ shaft: 10 });
    expect(lands.length).toBeGreaterThan(40);
    expect(beat.count).toBeGreaterThan(40);
    expect(beat.cv).toBeLessThan(0.05);
    // Still going at the end of the run.
    expect(lands[lands.length - 1]).toBeGreaterThan(TICKS - 3 * beat.period);
  });

  it("the Queflair beside it flashes once per beat", () => {
    const { lands, flashes } = watch({ shaft: 10 });
    expect(lands.length).toBeGreaterThan(40);
    expect(flashes.length).toBeGreaterThan(40);
    expect(Math.abs(flashes.length - lands.length)).toBeLessThanOrEqual(1);
    // Each flash follows a landing within a few ticks, and each landing brings a flash.
    for (const f of flashes.slice(1, 30)) {
      const before = lands.filter((l) => l <= f).pop()!;
      expect(f - before).toBeLessThanOrEqual(4);
    }
    for (const l of lands.slice(1, 30)) {
      const after = flashes.find((f) => f >= l)!;
      expect(after - l).toBeLessThanOrEqual(4);
    }
  });

  it("a taller shaft makes a slower beat", () => {
    const periods = [6, 12, 20].map((shaft) => watch({ shaft }).beat.period);
    expect(periods[1]).toBeGreaterThan(periods[0]);
    expect(periods[2]).toBeGreaterThan(periods[1]);
  });

  it("added weight makes a slower beat, and too much weight stops it", () => {
    const p = [0, 1, 2].map((weight) => watch({ shaft: 10, weight }).beat);
    for (const b of p) expect(b.count).toBeGreaterThan(40);
    expect(p[1].period).toBeGreaterThanOrEqual(p[0].period);
    expect(p[2].period).toBeGreaterThan(p[1].period);
    expect(p[2].period).toBeGreaterThan(p[0].period);
    const heavy = watch({ shaft: 10, weight: 3 });
    expect(heavy.flashes.length).toBeLessThan(25);
    expect(heavy.flashes[heavy.flashes.length - 1]).toBeLessThan(TICKS / 2);
  });

  it("needs the Exgen: with plain stone at the bottom the Bormite just lands and stays", () => {
    const rules = V0;
    const w = bouncer.build(rules, { shaft: 10 });
    const [ex] = w.find("exgen");
    w.place(ex[0], ex[1], "lobime", { anchored: true });
    const ys = record(w, 600, (w) => where(w, "bormite")[0][1]);
    expect(landings(ys).length).toBe(1);
    expect(ys.slice(100).every((y) => y === ys[ys.length - 1])).toBe(true);
  });

  it("the bounce comes from Teta, not from elastic collisions (restitution is 0)", () => {
    expect(V0.world.restitution).toBe(0);
    // With Bormite's push turned off in the data, the bouncer is dead.
    const { lands } = watch({ shaft: 10 }, rulesWith((j) => (j.elements.bormite.response.gain = 0)));
    expect(lands.length).toBe(1);
  });

  it("the Bormite is durable: after thousands of beats only the Exgen shows wear", () => {
    const w = bouncer.build(V0, { shaft: 10 });
    const events = runCollectingEvents(w, 3000);
    expect(events.filter((e) => e.element === "bormite")).toEqual([]);
    const ys = record(w, 200, (w) => where(w, "bormite")[0][1]);
    expect(landings(ys).length).toBeGreaterThan(3);
  });
});

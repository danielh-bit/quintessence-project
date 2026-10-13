// The buzzer (GAME_OVERVIEW §6): a weight with a Bormite underside on a Galog.
// Watched from outside: the weight's height, and a Teta reading beside the
// Galog (what a detector placed there would show).
import { describe, expect, it } from "vitest";
import { buzzer } from "../../src/scenarios/buzzer";
import { period, risingEdges } from "../helpers/measure";
import { record, where } from "../helpers/observe";
import { V0 } from "../helpers/world";

const TICKS = 3000;

function watch(weight: number, mutate?: (w: ReturnType<typeof buzzer.build>) => void) {
  const w = buzzer.build(V0, { weight });
  mutate?.(w);
  const [[gx, gy]] = w.find("galog");
  const probe: [number, number] = [gx + 2, gy - 1];
  const samples = record(w, TICKS, (w) => ({
    top: Math.min(...[...where(w, "bormite"), ...where(w, "lobime")].map(([, y]) => y)),
    teta: w.fieldAt("teta", probe[0], probe[1]),
  }));
  const tops = samples.map((s) => s.top);
  const rest = Math.max(...tops);
  const lifts = risingEdges(tops.map((t) => rest - t), 1);
  const on = risingEdges(samples.map((s) => s.teta), 0.5);
  const off = risingEdges(samples.map((s) => (s.teta < 0.5 ? 1 : 0)), 1);
  return { lifts, on, off, beat: period(lifts), samples };
}

describe("buzzer", () => {
  it("lifts and drops over and over, at a steady rate", () => {
    const { lifts, beat } = watch(1);
    expect(lifts.length).toBeGreaterThan(100);
    expect(beat.cv).toBeLessThan(0.1);
    expect(lifts[lifts.length - 1]).toBeGreaterThan(TICKS - 4 * beat.period);
  });

  it("the Galog's Teta switches on and off with the beat", () => {
    const { lifts, on, off } = watch(1);
    expect(on.length).toBeGreaterThan(100);
    expect(off.length).toBeGreaterThan(100);
    expect(Math.abs(on.length - lifts.length)).toBeLessThanOrEqual(2);
  });

  it("is a clock of its own: a different period from the bouncer's, set by different rules", () => {
    const { beat } = watch(1);
    expect(beat.period).toBeGreaterThan(5);
    expect(beat.period).toBeLessThan(60);
  });

  it("works with several weights; an overloaded Galog tires until the buzz stops", () => {
    for (const weight of [0, 2, 3]) expect(watch(weight).lifts.length).toBeGreaterThan(100);
    const heavy = watch(5);
    expect(heavy.lifts.length).toBeGreaterThan(5);
    expect(heavy.lifts[heavy.lifts.length - 1]).toBeLessThan(TICKS / 2);
    // Stopped with the weight resting on a still-emitting (tired) Galog.
    expect(heavy.samples[TICKS - 1].teta).toBeGreaterThan(0);
  });

  it("needs the Bormite underside: a plain weight on the Galog never lifts", () => {
    const { lifts, off } = watch(1, (w) => {
      const [[bx, by]] = w.find("bormite");
      w.unbond(bx, by);
      w.place(bx, by, "lobime");
    });
    expect(lifts.length).toBe(0);
    expect(off.length).toBe(0); // the Galog simply stays on
  });
});

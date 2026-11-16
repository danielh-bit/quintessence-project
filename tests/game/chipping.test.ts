// Mining with grains on: the pick chips, and the chips go into the pack as dust.
import { describe, expect, it } from "vitest";
import { World } from "../../src/core";
import { Game, input, Recorder, replay } from "../../src/game";
import { hold, PLAYER, topRow } from "../helpers/game";
import { VG } from "../helpers/grains";
import { floor } from "../helpers/world";

function face(element: string) {
  const w = new World(VG, 40, 20);
  floor(w);
  const fy = w.height - 1;
  for (let y = fy - 6; y < fy; y++) for (let x = 14; x < 18; x++) w.place(x, y, element, { anchored: true });
  const g = Game.create(w, PLAYER, 11, topRow(fy));
  hold(g, 5);
  return { w, g, target: { x: 14, y: fy - 2 } };
}

/** Swing until the block is gone; returns the number of blows, or -1. */
function swingsToClear(g: Game, target: { x: number; y: number }, maxTicks: number): number {
  let blows = 0;
  for (let t = 0; t < maxTicks; t++) {
    g.step(input({ swing: target }));
    if (g.events.some((e) => e.kind === "swing")) blows++;
    if (g.world.elementAt(target.x, target.y) === null) return blows;
  }
  return -1;
}

describe("chipping with the pick", () => {
  it("a block comes away a part at a time, starting on the side the player stands", () => {
    const { w, g, target } = face("lobime");
    const i = w.idx(target.x, target.y);
    const gr = w.grains!;
    const seen: number[] = [];
    for (let t = 0; t < 400 && w.elementAt(target.x, target.y) !== null; t++) {
      g.step(input({ swing: target }));
      const f = gr.fill[i];
      if (w.elementAt(target.x, target.y) !== null && seen[seen.length - 1] !== f) seen.push(f);
    }
    // Whole, then three quarters, a half, a quarter, then gone.
    expect(seen).toEqual([1, 0.75, 0.5, 0.25]);
    expect(w.elementAt(target.x, target.y)).toBeNull();
  });

  it("the first chip is off the face nearest the player", () => {
    const { w, g, target } = face("lobime");
    const i = w.idx(target.x, target.y);
    const gr = w.grains!;
    for (let t = 0; t < 200 && gr.fill[i] === 1; t++) g.step(input({ swing: target }));
    const cols: number[] = [];
    for (let n = 0; n < gr.nn; n++) if (gr.gone[i * gr.nn + n]) cols.push(n % gr.n);
    // The player stands to the left of the wall: the bite is out of the left side.
    expect(cols.length).toBe(16);
    expect(cols.reduce((a, b) => a + b, 0) / cols.length).toBeLessThan(2.5);
    expect(cols.includes(0)).toBe(true);
    expect(Math.max(...cols)).toBeLessThan(gr.n - 2);
  });

  it("softer elements come away in fewer swings; Hard Rock and the hull never chip", () => {
    const blows = (element: string) => {
      const { g, target } = face(element);
      return swingsToClear(g, target, 3000);
    };
    const bormite = blows("bormite");
    const queflair = blows("queflair");
    const lobime = blows("lobime");
    expect(bormite).toBeGreaterThan(1);
    expect(queflair).toBeGreaterThan(bormite);
    expect(lobime).toBeGreaterThan(queflair);
    expect(blows("hard_rock")).toBe(-1);
    expect(blows("dense_lobime")).toBe(-1);
  });

  it("what is chipped off goes into the pack as dust: all of it, and it weighs on the player", () => {
    const { w, g, target } = face("lobime");
    const before = g.body()!.mass;
    expect(swingsToClear(g, target, 400)).toBeGreaterThan(0);
    hold(g, 5);
    const lobime = VG.elementIndex.lobime;
    expect(g.pack.grains!.countDust(lobime)).toBe(64);
    expect(w.grains!.countDust()).toBe(0);
    expect(g.body()!.mass).toBeCloseTo(before + VG.elements[lobime].mass, 10);
  });

  it("dust in the pack is live: Queflair dust glows when the player stands on a Galog", () => {
    const w = new World(VG, 40, 20);
    floor(w);
    const fy = w.height - 1;
    w.place(11, fy, "galog", { anchored: true });
    for (let y = fy - 4; y < fy; y++) w.place(14, y, "queflair", { anchored: true });
    const g = Game.create(w, PLAYER, 11, topRow(fy));
    expect(swingsToClear(g, { x: 14, y: fy - 2 }, 600)).toBeGreaterThan(0);
    hold(g, 30);
    const pg = g.pack.grains!;
    expect(pg.countDust(VG.elementIndex.queflair)).toBe(64);
    // It settled on the pack's floor and is lit from inside.
    expect(pg.emitting.some((e) => e.element === VG.elementIndex.queflair && e.output > 0)).toBe(true);
    const b = g.bounds()!;
    expect(w.fieldAt("glow", b.x - 3, b.y + 1)).toBeGreaterThan(0);
  });

  it("a loose block is still taken whole by the first swing, with its shape", () => {
    const w = new World(VG, 40, 20);
    floor(w);
    const fy = w.height - 1;
    w.place(14, fy - 1, "lobime");
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    hold(g, 5);
    g.step(input({ swing: { x: 14, y: fy - 1 } }));
    expect(g.events.map((e) => e.kind)).toEqual(["swing", "take"]);
    expect(g.pack.find("lobime").length).toBe(1);
  });

  it("a recorded session with chipping and dust replays exactly", () => {
    const { g, target } = face("bormite");
    const rec = new Recorder(g);
    for (let t = 0; t < 500; t++) {
      rec.step(input({ swing: t < 300 ? target : { x: 14, y: target.y - 1 }, move: t % 120 < 20 ? -1 : t % 120 < 40 ? 1 : 0, jump: t % 90 === 0 }));
    }
    expect(rec.game.pack.grains!.countDust()).toBeGreaterThan(64);
    const again = replay(VG, PLAYER, JSON.parse(JSON.stringify(rec.recording)));
    expect(again.stateHash()).toBe(rec.game.stateHash());
  });
});

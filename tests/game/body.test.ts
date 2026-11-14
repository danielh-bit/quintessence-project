// The player's body is a body like any other: it loads what it stands on,
// landing is an impact, it collides with solid cells. Watched from outside:
// the brightness of a Queflair, a Teta reading at a probe cell, positions.
import { describe, expect, it } from "vitest";
import { Game, input } from "../../src/game";
import { ground, hold, PLAYER, topRow, walkTo } from "../helpers/game";
import { brightness } from "../helpers/observe";

/** A Galog in the floor with a Queflair lying three cells to its left. */
function galogSite() {
  const w = ground(40, 20);
  const fy = w.height - 1;
  w.place(12, fy, "galog", { anchored: true });
  w.place(9, fy - 1, "queflair");
  const g = Game.create(w, PLAYER, 22, topRow(fy));
  return { w, g, fy };
}

describe("the player's body: weight", () => {
  it("standing on a Galog makes a nearby Queflair glow; stepping off stops it", () => {
    const { w, g } = galogSite();
    hold(g, 30);
    expect(brightness(w, "queflair")).toBe(0);

    walkTo(g, 12);
    expect(g.bounds()!.x).toBe(12);
    hold(g, 10);
    expect(brightness(w, "queflair")).toBeGreaterThan(1);

    walkTo(g, 22);
    hold(g, 10);
    expect(brightness(w, "queflair")).toBe(0);
  });

  it("the Galog feels the body's weight like any other weight", () => {
    const { w, g, fy } = galogSite();
    walkTo(g, 12);
    hold(g, 5);
    // Two feet on the floor: half the body's mass rests on the Galog's cell.
    expect(w.inspect(12, fy)!.load).toBe(g.body()!.mass / 2);
  });

  it("walks, stops when the key is released, and is stopped by a wall", () => {
    const w = ground(40, 20);
    const fy = w.height - 1;
    for (let y = fy - 6; y < fy; y++) w.place(30, y, "hard_rock", { anchored: true });
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    hold(g, 40, { move: 1 });
    const x1 = g.bounds()!.x;
    expect(x1).toBeGreaterThan(12);
    hold(g, 40);
    expect(g.body()!.vx).toBe(0);
    const x2 = g.bounds()!.x;
    hold(g, 40);
    expect(g.bounds()!.x).toBe(x2);
    hold(g, 400, { move: 1 });
    // Flush against the wall: the body is two cells wide.
    expect(g.bounds()!.x).toBe(30 - PLAYER.body.width);
  });

  it("jumps only from the ground, and comes back down", () => {
    const w = ground(40, 30);
    const fy = w.height - 1;
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    const rest = g.bounds()!.y;
    let top = rest;
    for (let t = 0; t < 80; t++) {
      // Holding jump the whole time: it cannot jump again in the air.
      g.step(input({ jump: t < 20 }));
      top = Math.min(top, g.bounds()!.y);
    }
    expect(rest - top).toBeGreaterThanOrEqual(2);
    expect(rest - top).toBeLessThanOrEqual(4);
    expect(g.bounds()!.y).toBe(rest);
  });

  it("pushes a loose stone it walks into", () => {
    const w = ground(40, 20);
    const fy = w.height - 1;
    w.place(16, fy - 1, "lobime");
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    hold(g, 120, { move: 1 });
    expect(w.find("lobime")[0][0]).toBeGreaterThan(18);
  });
});

/** Largest Teta reading at a probe beside an Exgen while the body drops onto it from a height. */
function dropOnExgen(height: number): number {
  const w = ground(30, 60);
  const fy = w.height - 1;
  w.place(10, fy, "exgen", { anchored: true });
  const g = Game.create(w, PLAYER, 10, topRow(fy, height));
  let peak = 0;
  for (let t = 0; t < 200; t++) {
    g.step(input());
    peak = Math.max(peak, w.fieldAt("teta", 13, fy - 1));
  }
  expect(g.bounds()!.y).toBe(topRow(fy));
  return peak;
}

describe("the player's body: impact", () => {
  it("landing on an Exgen fires it, and the burst grows with the fall height", () => {
    const bursts = [2, 6, 14, 30].map(dropOnExgen);
    expect(bursts[0]).toBeGreaterThan(1);
    for (let k = 1; k < bursts.length; k++) expect(bursts[k]).toBeGreaterThan(bursts[k - 1] * 1.2);
  });

  it("just standing on an Exgen does nothing", () => {
    expect(dropOnExgen(0)).toBe(0);
  });

  it("jumping on the spot on an Exgen fires it on every landing", () => {
    const w = ground(30, 30);
    const fy = w.height - 1;
    w.place(10, fy, "exgen", { anchored: true });
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    // A burst dies away over many ticks, so count the moments the reading jumps up again.
    let bursts = 0;
    let was = 0;
    for (let t = 0; t < 300; t++) {
      g.step(input({ jump: true }));
      const now = w.fieldAt("teta", 13, fy - 1);
      if (now > was * 2 && now > 1) bursts++;
      was = now;
    }
    expect(bursts).toBeGreaterThan(5);
  });

  it("a swing is an impact on the cell it hits: an Exgen fires, plain stone does not", () => {
    const w = ground(30, 20);
    const fy = w.height - 1;
    w.place(13, fy, "exgen", { anchored: true });
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    hold(g, 5);
    g.step(input({ swing: { x: 14, y: fy } }));
    hold(g, 3);
    expect(w.fieldAt("teta", 16, fy - 1)).toBe(0);
    hold(g, 20);
    g.step(input({ swing: { x: 13, y: fy } }));
    let peak = 0;
    for (let t = 0; t < 5; t++) {
      g.step(input());
      peak = Math.max(peak, w.fieldAt("teta", 16, fy - 1));
    }
    expect(peak).toBeGreaterThan(1);
  });

  it("cannot swing at what is out of reach, nor faster than the tool allows", () => {
    const w = ground(40, 20);
    const fy = w.height - 1;
    w.place(30, fy, "exgen", { anchored: true });
    w.place(13, fy, "exgen", { anchored: true });
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    hold(g, 5);
    g.step(input({ swing: { x: 30, y: fy } }));
    hold(g, 5);
    expect(w.fieldAt("teta", 32, fy - 1)).toBe(0);
    // Swinging every tick still lands only one blow per cooldown.
    let bursts = 0;
    for (let t = 0; t < PLAYER.swing.cooldown * 4; t++) {
      g.step(input({ swing: { x: 14, y: fy } }));
      if (g.events.some((e) => e.kind === "swing")) bursts++;
    }
    expect(bursts).toBe(4);
  });
});

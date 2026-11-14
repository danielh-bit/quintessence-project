// Mining and placing. A swing is an impact on the cell it hits; enough of them
// knock an anchored cell loose, and a loose cell the swing hits goes into the
// pack. A cell from the pack can be put down in the world, where it is loose.
import { describe, expect, it } from "vitest";
import { Game, input } from "../../src/game";
import { ground, hold, PLAYER, topRow } from "../helpers/game";
import { brightness } from "../helpers/observe";
import { V0 } from "../helpers/world";

/** A wall of one element just right of the player, to swing at. */
function face(element: string) {
  const w = ground(40, 20);
  const fy = w.height - 1;
  for (let y = fy - 6; y < fy; y++) for (let x = 14; x < 18; x++) w.place(x, y, element, { anchored: true });
  const g = Game.create(w, PLAYER, 11, topRow(fy));
  hold(g, 5);
  return { w, g, fy, target: { x: 14, y: fy - 2 } };
}

/** Swing at a cell as fast as the tool allows; returns how many blows it took to get it, or -1. */
function swingsToTake(g: Game, target: { x: number; y: number }, maxTicks: number): number {
  let blows = 0;
  for (let t = 0; t < maxTicks; t++) {
    g.step(input({ swing: target }));
    if (g.events.some((e) => e.kind === "swing")) blows++;
    if (g.events.some((e) => e.kind === "take")) return blows;
  }
  return -1;
}

function inPack(g: Game, element: string): number {
  return g.pack.find(element).filter(([x, y]) => g.isPackRoom(x, y)).length;
}

describe("mining", () => {
  it("a soft cell breaks loose within a few swings and goes into the pack", () => {
    const { w, g, target } = face("bormite");
    expect(swingsToTake(g, target, 200)).toBe(1);
    expect(w.elementAt(target.x, target.y)).toBeNull();
    expect(inPack(g, "bormite")).toBe(1);
  });

  it("tougher elements take more swings, each in its own number", () => {
    const blows = (element: string) => {
      const { g, target } = face(element);
      return swingsToTake(g, target, 400);
    };
    const queflair = blows("queflair");
    const lobime = blows("lobime");
    const galog = blows("galog");
    expect(queflair).toBeGreaterThan(1);
    expect(lobime).toBeGreaterThan(queflair);
    expect(lobime).toBeLessThanOrEqual(5);
    expect(galog).toBe(lobime);
  });

  it("Hard Rock never breaks from the pick", () => {
    const { w, g, target, fy } = face("hard_rock");
    const before = w.find("hard_rock").length;
    let blows = 0;
    let worst = 0;
    for (let t = 0; t < 6000; t++) {
      g.step(input({ swing: target }));
      if (g.events.some((e) => e.kind === "swing")) blows++;
      worst = Math.max(worst, w.inspect(target.x, target.y)!.strain);
      expect(g.events.some((e) => e.kind === "take")).toBe(false);
    }
    expect(blows).toBeGreaterThan(400);
    // Not loosened, not crumbled, and not on its way there: its wear never builds up.
    expect(w.find("hard_rock").length).toBe(before);
    expect(w.inspect(target.x, target.y)!.anchored).toBe(true);
    expect(worst).toBeLessThan(V0.elements[V0.elementIndex.hard_rock].strain.max / 100);
    expect(inPack(g, "hard_rock")).toBe(0);
    expect(fy).toBe(w.height - 1);
  });

  it("the ship's hull material cannot be chipped either, though plain Lobime can", () => {
    const { w, g, target } = face("dense_lobime");
    const before = w.find("dense_lobime").length;
    expect(swingsToTake(g, target, 1500)).toBe(-1);
    // The pack's own divider is made of the same material; none was added to it.
    expect(w.find("dense_lobime").length).toBe(before);
  });

  it("swings that come too slowly never add up: the cell settles between blows", () => {
    const { w, g, target } = face("lobime");
    for (let k = 0; k < 20; k++) {
      g.step(input({ swing: target }));
      hold(g, 60);
    }
    expect(w.inspect(target.x, target.y)!.anchored).toBe(true);
    expect(inPack(g, "lobime")).toBe(0);
  });

  it("a mined cell keeps its wear: a tired Galog comes out tired", () => {
    const w = ground(40, 20);
    const fy = w.height - 1;
    w.place(14, fy, "galog", { anchored: true });
    for (let k = 1; k <= 6; k++) w.place(14, fy - k, "lobime");
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    hold(g, 1500);
    const worn = w.inspect(14, fy)!.strain;
    expect(worn).toBeGreaterThan(20);
    expect(swingsToTake(g, { x: 14, y: fy }, 400)).toBeGreaterThan(1);
    const [[px, py]] = g.pack.find("galog");
    // A little recovered on the way, but nowhere near fresh.
    expect(g.pack.inspect(px, py)!.strain).toBeGreaterThan(worn * 0.8);
  });

  it("a swing at an Exgen in the ground fires it on every blow until it comes out", () => {
    const w = ground(40, 20);
    const fy = w.height - 1;
    w.place(14, fy, "exgen", { anchored: true });
    w.place(18, fy - 1, "queflair");
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    hold(g, 5);
    let flashes = 0;
    let lit = false;
    let blows = 0;
    for (let t = 0; t < 200; t++) {
      g.step(input({ swing: { x: 14, y: fy } }));
      if (g.events.some((e) => e.kind === "swing")) blows++;
      const now = brightness(w, "queflair") > 1;
      if (now && !lit) flashes++;
      lit = now;
      if (inPack(g, "exgen") === 1) break;
    }
    expect(blows).toBeGreaterThan(1);
    expect(flashes).toBeGreaterThanOrEqual(1);
    expect(inPack(g, "exgen")).toBe(1);
  });

  it("a loose cell is taken by the first swing that hits it", () => {
    const w = ground(40, 20);
    const fy = w.height - 1;
    w.place(14, fy - 1, "lobime");
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    hold(g, 5);
    expect(swingsToTake(g, { x: 14, y: fy - 1 }, 50)).toBe(1);
    expect(w.find("lobime").length).toBe(0);
    expect(inPack(g, "lobime")).toBe(1);
  });

  it("what is mined weighs the player down", () => {
    const { g, target } = face("lobime");
    const before = g.body()!.mass;
    expect(swingsToTake(g, target, 400)).toBeGreaterThan(0);
    hold(g, 2);
    expect(g.body()!.mass).toBeCloseTo(before + V0.elements[V0.elementIndex.lobime].mass, 10);
  });

  it("a full pack takes no more: the cell comes loose and stays in the world", () => {
    const { w, g } = face("bormite");
    for (let y = 1; y <= 3; y++) for (const x of [1, 2, 4, 5]) g.pack.place(x, y, "lobime");
    const before = w.find("bormite").length;
    hold(g, 40, { swing: { x: 14, y: w.height - 3 } });
    expect(g.events.some((e) => e.kind === "take")).toBe(false);
    expect(inPack(g, "bormite")).toBe(0);
    // Still all there, and at least one of them is loose now.
    expect(w.find("bormite").length).toBe(before);
    expect(w.find("bormite").some(([x, y]) => !w.inspect(x, y)!.anchored)).toBe(true);
  });
});

describe("placing", () => {
  function carrying(element: string) {
    const w = ground(40, 20);
    const fy = w.height - 1;
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    g.pack.place(1, 3, element);
    hold(g, 5);
    return { w, g, fy };
  }

  it("a placed cell leaves the pack and is loose: it falls and comes to rest", () => {
    const { w, g, fy } = carrying("lobime");
    g.step(input({ place: { x: 14, y: fy - 4, slotX: 1, slotY: 3 } }));
    expect(g.events.map((e) => e.kind)).toEqual(["place"]);
    expect(inPack(g, "lobime")).toBe(0);
    expect(w.inspect(14, fy - 4)!.anchored).toBe(false);
    hold(g, 60);
    expect(w.find("lobime")).toEqual([[14, fy - 1]]);
  });

  it("stones stacked on a Galog by hand make it emit: a Queflair beside it lights up", () => {
    const w = ground(40, 20);
    const fy = w.height - 1;
    w.place(14, fy, "galog", { anchored: true });
    w.place(16, fy - 1, "queflair");
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    g.pack.place(1, 3, "lobime");
    g.pack.place(1, 2, "lobime");
    hold(g, 20);
    expect(brightness(w, "queflair")).toBe(0);
    g.step(input({ place: { x: 14, y: fy - 1, slotX: 1, slotY: 3 } }));
    hold(g, 20);
    expect(brightness(w, "queflair")).toBeGreaterThan(1);
    const one = brightness(w, "queflair");
    // The second stone fell to the bottom of the compartment; stack it on the first.
    g.step(input({ place: { x: 14, y: fy - 2, slotX: 1, slotY: 3 } }));
    hold(g, 20);
    expect(w.find("lobime").length).toBe(2);
    expect(brightness(w, "queflair")).toBeGreaterThanOrEqual(one);
  });

  it("only into an empty cell within reach, and only from a pack cell that holds something", () => {
    const { w, g, fy } = carrying("lobime");
    const tries = [
      { x: 30, y: fy - 1, slotX: 1, slotY: 3 }, // out of reach
      { x: 14, y: fy, slotX: 1, slotY: 3 }, // the floor: not empty
      { x: 10, y: fy - 1, slotX: 1, slotY: 3 }, // the player's own body
      { x: 14, y: fy - 1, slotX: 2, slotY: 3 }, // an empty pack cell
      { x: 14, y: fy - 1, slotX: 3, slotY: 2 }, // the divider
      { x: 14, y: fy - 1, slotX: 0, slotY: 0 }, // a wall
      { x: 14, y: fy - 1, slotX: 99, slotY: 99 }, // nowhere
    ];
    for (const place of tries) {
      g.step(input({ place }));
      hold(g, 10);
      expect(g.events).toEqual([]);
    }
    expect(inPack(g, "lobime")).toBe(1);
    expect(w.find("lobime").length).toBe(0);
    expect(g.pack.find("dense_lobime").length).toBe(5);
  });

  it("mined, carried and put down again, a Queflair still works", () => {
    const w = ground(40, 20);
    const fy = w.height - 1;
    w.place(14, fy - 1, "queflair", { anchored: true });
    w.place(26, fy, "galog", { anchored: true });
    w.place(26, fy - 1, "lobime");
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    hold(g, 5);
    expect(swingsToTake(g, { x: 14, y: fy - 1 }, 200)).toBeGreaterThan(0);
    for (let t = 0; t < 400 && g.bounds()!.x < 21; t++) g.step(input({ move: 1 }));
    hold(g, 30);
    const [[sx, sy]] = g.pack.find("queflair");
    g.step(input({ place: { x: 24, y: fy - 1, slotX: sx, slotY: sy } }));
    hold(g, 30);
    expect(w.find("queflair")).toEqual([[24, fy - 1]]);
    expect(brightness(w, "queflair")).toBeGreaterThan(1);
  });
});

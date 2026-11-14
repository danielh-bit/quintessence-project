// The pack: a small grid carried by the player's body, run by the same rules.
// Watched from outside: readings in the world around the player, what is
// where, and what breaks.
import { describe, expect, it } from "vitest";
import { Game, input } from "../../src/game";
import { ground, hold, PLAYER, topRow, walkTo } from "../helpers/game";
import { brightness } from "../helpers/observe";
import { rulesWith } from "../helpers/world";

// Room in the starting pack: two compartments, columns 1-2 and 4-5, rows 1-3.
const LEFT = 1;
const RIGHT = 4;
const BOTTOM = 3;

function site(width = 60, height = 24) {
  const w = ground(width, height);
  const fy = w.height - 1;
  const g = Game.create(w, PLAYER, 20, topRow(fy));
  return { w, g, fy };
}

/** Loudest hum in the ground under and around the player's feet. */
function humUnderfoot(g: Game): number {
  const b = g.bounds()!;
  const y = b.y + b.height;
  let v = 0;
  for (let x = b.x - 1; x <= b.x + b.width; x++) v = Math.max(v, g.world.fieldAt("hum", x, y));
  return v;
}

describe("the pack moves with the player", () => {
  it("Colomium in the pack hums while the player walks and stops when they stand still", () => {
    const { g } = site();
    g.pack.place(LEFT, BOTTOM, "colomium");
    hold(g, 40);
    expect(humUnderfoot(g)).toBe(0);

    let loudest = 0;
    for (let t = 0; t < 80; t++) {
      g.step(input({ move: 1 }));
      if (t > 20) loudest = Math.max(loudest, humUnderfoot(g));
    }
    expect(loudest).toBeGreaterThan(0.5);
    // Still humming at the end of the walk, not just at the start.
    expect(humUnderfoot(g)).toBeGreaterThan(0.5);

    hold(g, 60);
    expect(g.body()!.vx).toBe(0);
    expect(humUnderfoot(g)).toBe(0);
  });

  it("the hum's pitch follows the walking speed", () => {
    const { g } = site();
    g.pack.place(LEFT, BOTTOM, "colomium");
    hold(g, 60, { move: 1 });
    const b = g.bounds()!;
    const hum = g.world.rules.energyIndex.hum;
    const pitch = g.world.pitch[hum]![g.world.idx(b.x, b.y + b.height)];
    expect(pitch).toBeGreaterThan(g.body()!.vx * 0.8);
    expect(pitch).toBeLessThan(g.body()!.vx * 1.2);
  });

  it("without Colomium, walking makes no hum", () => {
    const { g } = site();
    g.pack.place(LEFT, BOTTOM, "lobime");
    let loudest = 0;
    for (let t = 0; t < 80; t++) {
      g.step(input({ move: 1 }));
      loudest = Math.max(loudest, humUnderfoot(g));
    }
    expect(loudest).toBe(0);
  });

  it("what is in the pack adds to the player's weight", () => {
    const { w, g, fy } = site();
    w.place(20, fy, "galog", { anchored: true });
    hold(g, 5);
    const empty = w.inspect(20, fy)!.load;
    g.pack.place(LEFT, BOTTOM, "lobime");
    g.pack.place(RIGHT, BOTTOM, "lobime");
    hold(g, 30);
    expect(w.inspect(20, fy)!.load).toBeCloseTo(empty + (2 * w.rules.elements[w.rules.elementIndex.lobime].mass) / 2, 10);
  });

  it("walking about and jumping only shifts the contents: nothing breaks, nothing is lost", () => {
    const { g } = site();
    g.pack.place(LEFT, BOTTOM, "lobime");
    g.pack.place(LEFT + 1, BOTTOM, "queflair");
    g.pack.place(RIGHT, BOTTOM, "colomium");
    const walls = g.pack.find("weave").length;
    let shifted = false;
    for (let t = 0; t < 1200; t++) {
      const phase = Math.floor(t / 60) % 4;
      g.step(input({ move: phase === 0 ? 1 : phase === 2 ? -1 : 0, jump: t % 90 < 3 }));
      for (const b of g.pack.bodies.values()) if (b.vx !== 0 || b.vy !== 0 || b.ox !== 0 || b.oy !== 0) shifted = true;
    }
    expect(shifted).toBe(true);
    expect(g.pack.find("weave").length).toBe(walls);
    expect(g.pack.find("lobime").filter(([x]) => x !== 3).length).toBe(1);
    expect(g.pack.find("queflair").length).toBe(1);
    expect(g.pack.find("colomium").length).toBe(1);
    expect(g.world.find("queflair").length).toBe(0);
  });

  it("a hard landing is an impact inside the pack too: an Exgen in it fires", () => {
    const w = ground(40, 60);
    const fy = w.height - 1;
    const g = Game.create(w, PLAYER, 20, topRow(fy, 20));
    g.pack.place(LEFT, BOTTOM, "exgen");
    let peak = 0;
    for (let t = 0; t < 120; t++) {
      g.step(input());
      peak = Math.max(peak, brightness(g.pack, "exgen"));
    }
    expect(peak).toBeGreaterThan(100);
  });
});

describe("energies pass between the pack and the world", () => {
  it("Teta from the world reaches into the pack: standing on a Galog lights a Queflair being carried", () => {
    const { w, g, fy } = site();
    w.place(30, fy, "galog", { anchored: true });
    g.pack.place(LEFT, BOTTOM, "queflair");
    hold(g, 20);
    expect(brightness(g.pack, "queflair")).toBe(0);
    walkTo(g, 30);
    hold(g, 10);
    expect(brightness(g.pack, "queflair")).toBeGreaterThan(1);
  });

  it("glow in the pack lights the world around the player", () => {
    const { w, g, fy } = site();
    w.place(30, fy, "galog", { anchored: true });
    g.pack.place(LEFT, BOTTOM, "queflair");
    walkTo(g, 30);
    hold(g, 10);
    const b = g.bounds()!;
    // On both sides of the player, a few cells away, at pack height.
    expect(w.fieldAt("glow", b.x - 4, b.y + 1)).toBeGreaterThan(0.5);
    expect(w.fieldAt("glow", b.x + b.width + 3, b.y + 1)).toBeGreaterThan(0.5);
    // Nothing else out here glows.
    expect(w.find("queflair").length).toBe(0);
  });

  it("compartments are sealed from each other by the divider", () => {
    // A stone on a Galog makes Teta inside the pack. A Queflair beside it glows;
    // one in the other compartment does not.
    const lit = (queflairX: number) => {
      const { g } = site();
      g.pack.place(LEFT, BOTTOM, "galog");
      g.pack.place(LEFT, BOTTOM - 1, "lobime");
      g.pack.place(queflairX, BOTTOM, "queflair");
      hold(g, 30);
      return brightness(g.pack, "queflair");
    };
    expect(lit(LEFT + 1)).toBeGreaterThan(1);
    expect(lit(RIGHT)).toBe(0);
    expect(lit(RIGHT + 1)).toBe(0);
  });

  it("what the pack lets out does not come back in as if it were from outside", () => {
    // Teta made in the left compartment reaches the world around the player...
    const { w, g } = site();
    g.pack.place(LEFT, BOTTOM, "galog");
    g.pack.place(LEFT, BOTTOM - 1, "lobime");
    g.pack.place(RIGHT, BOTTOM, "queflair");
    hold(g, 30);
    const b = g.bounds()!;
    expect(w.fieldAt("teta", b.x - 2, b.y + 1)).toBeGreaterThan(1);
    // ...but the Queflair in the sealed right compartment stays dark.
    expect(brightness(g.pack, "queflair")).toBe(0);
  });

  it("heat passes between the pack and the body that carries it", () => {
    const { w, g } = site();
    g.pack.place(LEFT, BOTTOM, "lobime");
    const heat = w.rules.energyIndex.heat;
    // A hot stone in the pack...
    g.pack.field[heat][g.pack.idx(LEFT, BOTTOM)] = 0;
    g.pack.place(RIGHT, BOTTOM, "hard_rock");
    g.pack.field[heat][g.pack.idx(RIGHT, BOTTOM)] = 400;
    hold(g, 200);
    const b = g.bounds()!;
    // ...warms the player's body.
    expect(w.fieldAt("heat", b.x, b.y + 1)).toBeGreaterThan(0.1);
  });
});

describe("pushes inside the pack", () => {
  /** Drop onto an Exgen from a height, with Bormite in one compartment and a stone in the other. */
  function dropOnExgen(height: number, ticks = 150) {
    const w = ground(60, 80);
    const fy = w.height - 1;
    w.place(20, fy, "exgen", { anchored: true });
    w.place(21, fy, "exgen", { anchored: true });
    const g = Game.create(w, PLAYER, 20, topRow(fy, height));
    g.pack.place(LEFT, BOTTOM, "bormite");
    g.pack.place(RIGHT, BOTTOM, "lobime");
    const walls = g.pack.find("weave").length;
    const start = g.pack.find("bormite")[0];
    let shifted = false;
    let spilled = false;
    for (let t = 0; t < ticks; t++) {
      g.step(input());
      const at = g.pack.find("bormite")[0];
      if (at && (at[0] !== start[0] || at[1] !== start[1])) shifted = true;
      if (w.find("bormite").length > 0) spilled = true;
    }
    return { w, g, shifted, spilled, broken: walls - g.pack.find("weave").length };
  }

  it("a small push only throws the contents about", () => {
    // A short drop: the Exgen's burst reaches into the pack and moves the Bormite, no more.
    const { g, shifted, spilled, broken } = dropOnExgen(1);
    expect(shifted).toBe(true);
    expect(broken).toBe(0);
    expect(spilled).toBe(false);
    expect(g.pack.find("bormite").length).toBe(1);
  });

  it("a strong push inside the pack cracks its walls and spills the contents", () => {
    // A long drop: a far bigger burst drives the Bormite against the wall until the wall gives.
    const { g, spilled, broken } = dropOnExgen(20);
    expect(broken).toBeGreaterThan(0);
    expect(spilled).toBe(true);
    expect(g.pack.find("bormite").length).toBe(0);
    // The stone in the other compartment, which nothing pushed, stays in the pack.
    expect(g.pack.find("lobime").filter(([x]) => x !== 3).length).toBe(1);
  });

  it("the same long drop with only a stone in the pack breaks nothing", () => {
    const w = ground(60, 80);
    const fy = w.height - 1;
    w.place(20, fy, "exgen", { anchored: true });
    const g = Game.create(w, PLAYER, 20, topRow(fy, 20));
    g.pack.place(LEFT, BOTTOM, "lobime");
    const walls = g.pack.find("weave").length;
    hold(g, 150);
    expect(g.pack.find("weave").length).toBe(walls);
    expect(g.pack.find("lobime").filter(([x]) => x !== 3).length).toBe(1);
  });

  it("jumping about with stones in the pack never wears the walls through", () => {
    const { g } = site();
    g.pack.place(LEFT, BOTTOM, "lobime");
    g.pack.place(RIGHT, BOTTOM, "colomium");
    const walls = g.pack.find("weave").length;
    hold(g, 2000, { jump: true });
    expect(g.pack.find("weave").length).toBe(walls);
  });

  it("contents ride along in free fall instead of drifting about", () => {
    const w = ground(40, 80);
    const fy = w.height - 1;
    const g = Game.create(w, PLAYER, 20, topRow(fy, 40));
    g.pack.place(LEFT, BOTTOM, "lobime");
    for (let t = 0; t < 30; t++) {
      g.step(input());
      expect(g.pack.find("lobime").filter(([x]) => x !== 3)[0]).toEqual([LEFT, BOTTOM]);
    }
    expect(g.body()!.vy).toBeGreaterThan(1);
  });

  it("a push on what is in the pack is a push on the player: enough Bormite lifts them off a Galog", () => {
    // With walls too tough to give way, so the Bormite stays in and keeps pushing.
    const rules = rulesWith((j) => (j.elements.weave.strain.max = 1e9));
    const w = ground(60, 24, rules);
    const fy = w.height - 1;
    for (const x of [28, 29]) w.place(x, fy, "galog", { anchored: true });
    const g = Game.create(w, PLAYER, 28, topRow(fy));
    for (const x of [LEFT, LEFT + 1, RIGHT, RIGHT + 1]) for (const y of [BOTTOM, BOTTOM - 1]) g.pack.place(x, y, "bormite");
    const rest = topRow(fy);
    let highest = rest;
    let lifts = 0;
    for (let t = 0; t < 300; t++) {
      const before = g.bounds()!.y;
      g.step(input());
      if (before === rest && g.bounds()!.y < rest) lifts++;
      highest = Math.min(highest, g.bounds()!.y);
    }
    expect(highest).toBeLessThan(rest);
    // Lifted off, the Galog is unloaded and stops; the player drops back and it starts again.
    expect(lifts).toBeGreaterThan(3);
    // The same stand with no Bormite: the player stays put.
    const w2 = ground(60, 24, rules);
    for (const x of [28, 29]) w2.place(x, fy, "galog", { anchored: true });
    const g2 = Game.create(w2, PLAYER, 28, topRow(fy));
    hold(g2, 300);
    expect(g2.bounds()!.y).toBe(rest);
  });
});

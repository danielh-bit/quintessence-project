// Moving an item to another compartment of the pack: a hand action, so it is an
// input (replays exactly), and the item then falls and rests like any other.
import { describe, expect, it } from "vitest";
import { Game, input, parseInput, Recorder, replay } from "../../src/game";
import { ground, hold, PLAYER, topRow } from "../helpers/game";

function packGame() {
  const w = ground(60, 20);
  const g = Game.create(w, PLAYER, 10, topRow(w.height - 1));
  return { w, g };
}
const find = (g: Game, id: string) => g.pack.find(id);

describe("pack compartments", () => {
  it("finds the compartments of the layout, in reading order", () => {
    const { g } = packGame();
    const rooms = g.compartments();
    expect(rooms.length).toBe(2);
    expect(rooms[0].every(([x]) => x < 3)).toBe(true);
    expect(rooms[1].every(([x]) => x > 3)).toBe(true);
  });

  it("moves an item to the other compartment, where it falls and rests", () => {
    const { g } = packGame();
    g.pack.place(1, 3, "lobime");
    hold(g, 20);
    expect(find(g, "lobime")).toEqual([[1, 3]]);
    g.step(input({ stow: { x: 1, y: 3 } }));
    expect(g.events.some((e) => e.kind === "stow")).toBe(true);
    hold(g, 60);
    const [[x, y]] = find(g, "lobime");
    expect(x).toBeGreaterThan(3); // the right-hand compartment
    expect(y).toBe(3); // it fell to the floor
    // ...and back again.
    hold(g, 10);
    g.step(input({ stow: { x, y } }));
    hold(g, 60);
    expect(find(g, "lobime")[0][0]).toBeLessThan(3);
  });

  it("keeps the item: strain, element and mass", () => {
    const { g } = packGame();
    g.pack.place(1, 3, "galog");
    hold(g, 5);
    const before = g.body()!.mass;
    g.step(input({ stow: { x: 1, y: 3 } }));
    hold(g, 30);
    expect(find(g, "galog").length).toBe(1);
    expect(g.body()!.mass).toBeCloseTo(before, 10);
  });

  it("does nothing when the cell is empty, a wall, or the other compartment is full", () => {
    const { g } = packGame();
    g.step(input({ stow: { x: 1, y: 3 } })); // empty
    g.step(input({ stow: { x: 0, y: 0 } })); // a wall
    expect(g.events.length).toBe(0);
    g.pack.place(1, 3, "lobime");
    // Fill the top row of the right compartment so nothing can enter it.
    for (const x of [4, 5]) for (const y of [1, 2, 3]) g.pack.place(x, y, "bormite");
    hold(g, 5);
    hold(g, 10); // cooldown
    g.step(input({ stow: { x: 1, y: 3 } }));
    expect(g.events.some((e) => e.kind === "stow")).toBe(false);
    expect(find(g, "lobime")).toEqual([[1, 3]]);
  });

  it("replays exactly, and recordings without the field still load", () => {
    const { g } = packGame();
    g.pack.place(1, 3, "lobime");
    g.pack.place(2, 3, "queflair");
    const rec = new Recorder(g);
    rec.step(input());
    rec.step(input({ stow: { x: 1, y: 3 } }));
    for (let t = 0; t < 80; t++) rec.step(input({ move: t < 30 ? 1 : 0 }));
    const again = replay(g.world.rules, PLAYER, JSON.parse(JSON.stringify(rec.recording)));
    expect(again.stateHash()).toBe(g.stateHash());
    const old = { move: 0, jump: false, swing: null, place: null };
    expect(parseInput(old).stow).toBeNull();
  });
});

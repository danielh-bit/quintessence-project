// Determinism: a recorded input sequence replayed from the same start gives
// exactly the same world.
import { describe, expect, it } from "vitest";
import { rand01 } from "../../src/core";
import { Game, Recorder, replay, type Input, type Recording } from "../../src/game";
import { ground, PLAYER, topRow } from "../helpers/game";
import { V0 } from "../helpers/world";

/** A busy little site: things that react to weight, impact, Teta and motion. */
function site(): Game {
  const w = ground(60, 30);
  const fy = w.height - 1;
  w.place(14, fy, "galog", { anchored: true });
  w.place(22, fy, "exgen", { anchored: true });
  w.place(11, fy - 1, "queflair");
  w.place(13, fy - 1, "ralgen");
  for (const x of [17, 18, 24, 25]) w.place(x, fy - 1, "bormite");
  for (const x of [28, 29]) w.place(x, fy - 1, "lobime");
  w.place(28, fy - 2, "colomium");
  for (let y = fy - 5; y < fy; y++) w.place(50, y, "hard_rock", { anchored: true });
  const g = Game.create(w, PLAYER, 30, topRow(fy));
  // Things in the pack that react to motion, Teta and impact as the player moves about.
  g.pack.place(1, 3, "colomium");
  g.pack.place(2, 3, "queflair");
  g.pack.place(4, 3, "bormite");
  g.pack.place(5, 3, "exgen");
  return g;
}

/** A made-up but fixed input sequence: wandering, jumping, swinging at things nearby. */
function script(g: Game, t: number): Input {
  const r = (salt: number) => rand01(7, Math.floor(t / 20), 0, salt);
  const move = r(1) < 0.45 ? -1 : r(1) < 0.8 ? 1 : 0;
  const jump = r(2) < 0.3;
  let swing: Input["swing"] = null;
  if (t % 7 === 0) {
    const b = g.bounds()!;
    swing = { x: b.x + Math.floor(r(3) * 9) - 4, y: b.y + Math.floor(r(4) * 7) };
  }
  // Now and then, put down whatever is in some pack cell.
  let place: Input["place"] = null;
  if (t % 31 === 5) {
    const b = g.bounds()!;
    place = { x: b.x + (r(5) < 0.5 ? -2 : 3), y: b.y + 1 + Math.floor(r(6) * 3), slotX: 1 + Math.floor(r(7) * 5), slotY: 1 + Math.floor(r(8) * 3) };
  }
  return { move, jump, swing, place };
}

function play(ticks: number): { game: Game; recording: Recording } {
  const rec = new Recorder(site());
  for (let t = 0; t < ticks; t++) rec.step(script(rec.game, t));
  return { game: rec.game, recording: rec.recording };
}

describe("determinism", () => {
  it("a recorded input sequence replayed from the same start gives exactly the same world", () => {
    const { game, recording } = play(1500);
    // Through JSON, as a saved recording would be.
    const again = replay(V0, PLAYER, JSON.parse(JSON.stringify(recording)));
    expect(again.stateHash()).toBe(game.stateHash());
    expect(again.world.tick).toBe(1500);
  });

  it("the run actually did something, and playing it twice agrees tick by tick", () => {
    const a = new Recorder(site());
    const b = new Recorder(site());
    const start = a.game.bounds()!.x;
    let moved = false;
    let stirred = false;
    let taken = false;
    let placed = false;
    for (let t = 0; t < 600; t++) {
      a.step(script(a.game, t));
      b.step(script(b.game, t));
      if (a.game.bounds()!.x !== start) moved = true;
      if (a.game.pack.find("bormite")[0]?.[1] !== 3) stirred = true;
      if (a.game.events.some((e) => e.kind === "take")) taken = true;
      if (a.game.events.some((e) => e.kind === "place")) placed = true;
      if (t % 50 === 0) expect(b.game.stateHash()).toBe(a.game.stateHash());
    }
    expect(moved).toBe(true);
    expect(a.recording.inputs.some((i) => i.swing !== null)).toBe(true);
    expect(taken).toBe(true);
    expect(placed).toBe(true);
    // The pack took part: its contents were thrown about.
    expect(stirred).toBe(true);
  });

  it("a different input gives a different world (the hash is not blind to the player)", () => {
    const { recording } = play(130);
    const same: Recording = JSON.parse(JSON.stringify(recording));
    const changed: Recording = JSON.parse(JSON.stringify(recording));
    for (let k = 100; k < 130; k++) changed.inputs[k].move = recording.inputs[k].move === -1 ? 1 : -1;
    const base = replay(V0, PLAYER, same);
    const other = replay(V0, PLAYER, changed);
    expect(other.bounds()!.x).not.toBe(base.bounds()!.x);
    expect(other.stateHash()).not.toBe(base.stateHash());
  });

  it("at every tick, a restored snapshot takes the next step exactly as the live game does", () => {
    // Stricter than comparing end states: nothing the next tick depends on may be missing from a snapshot.
    const g = site();
    for (let t = 0; t < 400; t++) {
      const copy = Game.restore(V0, PLAYER, JSON.parse(JSON.stringify(g.snapshot())));
      expect(copy.stateHash()).toBe(g.stateHash());
      const i = script(g, t);
      g.step(i);
      copy.step(i);
      expect(copy.stateHash(), `step from tick ${t}`).toBe(g.stateHash());
    }
  });

  it("a snapshot taken mid-run continues identically", () => {
    const rec = new Recorder(site());
    for (let t = 0; t < 300; t++) rec.step(script(rec.game, t));
    const copy = Game.restore(V0, PLAYER, JSON.parse(JSON.stringify(rec.game.snapshot())));
    expect(copy.stateHash()).toBe(rec.game.stateHash());
    for (let t = 300; t < 600; t++) {
      const i = script(rec.game, t);
      rec.step(i);
      copy.step(i);
    }
    expect(copy.stateHash()).toBe(rec.game.stateHash());
  });
});

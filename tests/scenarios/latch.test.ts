// The latch (GAME_OVERVIEW §6): a Queflair and a Ralgen facing each other keep
// each other going. Watched from outside: how bright the pair is, before and
// after one pulse, with a Lobime block in the beam and after taking it away.
import { describe, expect, it } from "vitest";
import { latch } from "../../src/scenarios/latch";
import { brightness } from "../helpers/observe";
import { V0 } from "../helpers/world";

type W = ReturnType<typeof latch.build>;
const lit = (w: W) => brightness(w, "queflair") > 1;

/** A Teta reading just above the Queflair: shows whether the Ralgen is driving it. */
function tetaAtQueflair(w: W) {
  const [[qx, qy]] = w.find("queflair");
  return w.fieldAt("teta", qx, qy - 1);
}

function pulse(w: W, height = 8) {
  const [[ex, ey]] = w.find("exgen");
  w.place(ex, ey - 1 - height, "lobime");
}

describe("latch", () => {
  it("is dark until the pulse, then turns on and stays on long after the pulse is over", () => {
    const w = latch.build(V0, { gap: 2 });
    for (let t = 0; t < 15; t++) {
      w.step();
      expect(lit(w)).toBe(false);
    }
    // Wait for the stone to land, the Exgen to fire, and its Teta to die away
    // (read just beside the Exgen, on the side away from the pair).
    const [[ex, ey]] = w.find("exgen");
    const burst = () => w.fieldAt("teta", ex - 1, ey - 1);
    let fired = false;
    let quiet = -1;
    for (let t = 0; t < 300 && quiet < 0; t++) {
      w.step();
      if (burst() > 100) fired = true;
      if (fired && burst() < 1) quiet = t;
    }
    expect(fired).toBe(true);
    expect(quiet).toBeGreaterThan(0);
    expect(lit(w)).toBe(true);
    for (let t = 0; t < 800; t++) {
      w.step();
      expect(lit(w)).toBe(true);
    }
    expect(tetaAtQueflair(w)).toBeGreaterThan(1);
  });

  it("without a pulse it never turns on", () => {
    const w = latch.build(V0, { gap: 2, drop: 0 });
    w.run(500);
    expect(lit(w)).toBe(false);
  });

  it("blocking the light turns it off, and it stays off when the block is taken away (memory)", () => {
    const w = latch.build(V0, { gap: 2 });
    w.run(200);
    expect(lit(w)).toBe(true);
    const [[qx, qy]] = w.find("queflair");
    w.place(qx + 1, qy, "lobime", { anchored: true });
    w.run(5);
    expect(lit(w)).toBe(false);
    expect(tetaAtQueflair(w)).toBe(0);
    w.erase(qx + 1, qy);
    for (let t = 0; t < 400; t++) {
      w.step();
      expect(lit(w)).toBe(false);
    }
    // A second pulse turns it on again.
    pulse(w);
    w.run(60);
    expect(lit(w)).toBe(true);
    w.run(300);
    expect(lit(w)).toBe(true);
  });

  it("goes out for good when the Queflair burns out", () => {
    const w = latch.build(V0, { gap: 2 });
    let gone = -1;
    for (let t = 0; t < 20000 && gone < 0; t++) {
      w.step();
      if (w.find("queflair").length === 0) gone = w.tick;
    }
    expect(gone).toBeGreaterThan(1000);
    w.run(50);
    const [[rx, ry]] = w.find("ralgen");
    expect(w.fieldAt("teta", rx + 1, ry)).toBe(0); // the Ralgen has gone quiet too
  });

  it("only latches when the pair is close enough for the Ralgen's Teta to reach back", () => {
    const close = latch.build(V0, { gap: 1 });
    close.run(400);
    expect(lit(close)).toBe(true);
    const edge = latch.build(V0, { gap: 2 });
    edge.run(400);
    expect(lit(edge)).toBe(true);
    const beyond = latch.build(V0, { gap: 3 });
    beyond.run(400);
    expect(lit(beyond)).toBe(false);
    const far = latch.build(V0, { gap: 6 });
    far.run(400);
    expect(lit(far)).toBe(false);
  });
});

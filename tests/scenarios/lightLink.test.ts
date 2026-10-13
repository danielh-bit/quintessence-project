// The light link and the light switch (GAME_OVERVIEW §6). Watched from outside:
// is the far Ralgen active (a Teta reading beside it), does the Bormite behind
// it move, and what happens when a Lobime block is slid into the beam.
import { describe, expect, it } from "vitest";
import { lightLink, lightSwitch } from "../../src/scenarios/lightLink";
import { where } from "../helpers/observe";
import { V0 } from "../helpers/world";

type W = ReturnType<typeof lightLink.build>;

/** A Teta reading just above the Ralgen: what a detector there would show. */
function tetaAtRalgen(w: W): number {
  const [[rx, ry]] = w.find("ralgen");
  return w.fieldAt("teta", rx, ry - 1);
}

describe("light link", () => {
  it("a Ralgen that can see a far Queflair delivers Teta at a distance", () => {
    const w = lightLink.build(V0, { distance: 30 });
    const [bx0] = where(w, "bormite")[0];
    w.run(60);
    expect(tetaAtRalgen(w)).toBeGreaterThan(1);
    const [bx1] = where(w, "bormite")[0];
    expect(bx1).toBeGreaterThan(bx0 + 2);
    // It is the light that carries it: the Galog's own Teta does not get anywhere near.
    const [[gx]] = w.find("galog");
    const [[rx]] = w.find("ralgen");
    expect(rx - gx).toBeGreaterThan(V0.energies[V0.energyIndex.teta].range * 4);
  });

  it("the signal weakens with distance and stops beyond the light's reach", () => {
    const reading = (distance: number) => {
      const w = lightLink.build(V0, { distance });
      w.run(40);
      return tetaAtRalgen(w);
    };
    const near = reading(10);
    const mid = reading(30);
    const far = reading(38);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(reading(V0.energies[V0.energyIndex.glow].range + 5)).toBe(0);
  });

  it("an unlit lamp sends nothing", () => {
    const w = lightLink.build(V0, { distance: 30, stones: 0 });
    const b0 = where(w, "bormite");
    w.run(200);
    expect(tetaAtRalgen(w)).toBe(0);
    expect(where(w, "bormite")).toEqual(b0);
  });
});

describe("light switch", () => {
  it("sliding the Lobime block into the beam cuts the signal; taking it out restores it", () => {
    const w = lightSwitch.build(V0, { distance: 30 });
    w.run(40);
    expect(tetaAtRalgen(w)).toBeGreaterThan(1);

    // Shove the block off its ledge by hand.
    const [[lx, ly]] = w.find("lobime").filter(([x]) => x > 6);
    w.setVelocity(lx, ly, 0.35, 0);
    let cutAt = -1;
    for (let t = 0; t < 200 && cutAt < 0; t++) {
      w.step();
      if (tetaAtRalgen(w) === 0) cutAt = t;
    }
    expect(cutAt).toBeGreaterThan(0);
    w.run(100);
    expect(tetaAtRalgen(w)).toBe(0);
    // The block has come to rest in the beam row, between the lamp and the Ralgen.
    const [[qx, qy]] = w.find("queflair");
    const [[rx]] = w.find("ralgen");
    const block = w.find("lobime").filter(([x, y]) => y === qy && x > qx && x < rx);
    expect(block.length).toBe(1);

    // Pick it up again.
    w.erase(block[0][0], block[0][1]);
    w.run(5);
    expect(tetaAtRalgen(w)).toBeGreaterThan(1);
  });

  it("works as a switch, over and over", () => {
    const w = lightSwitch.build(V0, { distance: 30 });
    const [[qx, qy]] = w.find("queflair");
    const gap: [number, number] = [qx + 10, qy];
    for (let k = 0; k < 4; k++) {
      w.place(gap[0], gap[1], "lobime");
      w.run(5);
      expect(tetaAtRalgen(w)).toBe(0);
      w.erase(gap[0], gap[1]);
      w.run(5);
      expect(tetaAtRalgen(w)).toBeGreaterThan(1);
    }
  });
});

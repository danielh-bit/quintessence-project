// What the player hears: pitch rises with the humming speed, volume falls with
// distance and stops where the hum cannot travel.
import { describe, expect, it } from "vitest";
import { Game, input } from "../../src/game";
import { listen, loudRef, pitchToHz, soundEnergies } from "../../src/play/hum";
import { ground, hold, PLAYER, topRow } from "../helpers/game";
import { V0 } from "../helpers/world";

const energies = soundEnergies(V0);
const refs = energies.map((e) => loudRef(V0, e));

/** A player on a floor, with a Colomium cell on the floor `gap` cells away, set moving at speed v. */
function scene(gap: number, v: number) {
  const w = ground(80, 20);
  const fy = w.height - 1;
  const g = Game.create(w, PLAYER, 10, topRow(fy));
  w.place(12 + gap, fy - 1, "colomium");
  // Keep it moving for a few ticks: each link of the chain (speed, output, field) takes one.
  for (let t = 0; t < 4; t++) {
    const [[x, y]] = w.find("colomium");
    w.setVelocity(x, y, v, 0);
    g.step(input());
  }
  return { w, g };
}

describe("hearing", () => {
  it("finds the energy that travels through solids, from the rules", () => {
    expect(energies.length).toBe(1);
    expect(V0.energies[energies[0]].name).toBe("Hum");
  });

  it("hears nothing when nothing hums", () => {
    const { g } = scene(4, 0);
    expect(listen(g, energies, refs).gain).toBe(0);
  });

  it("is louder close by than far away, and silent past the hum's reach", () => {
    const near = listen(scene(3, 0.3).g, energies, refs);
    const far = listen(scene(30, 0.3).g, energies, refs);
    const gone = listen(scene(60, 0.3).g, energies, refs);
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(far.gain).toBeGreaterThan(0);
    expect(gone.gain).toBe(0);
  });

  it("rises in pitch with the speed of the Colomium", () => {
    const slow = listen(scene(3, 0.2).g, energies, refs);
    const fast = listen(scene(3, 0.8).g, energies, refs);
    expect(fast.freq).toBeGreaterThan(slow.freq);
    expect(pitchToHz(0)).toBeLessThan(pitchToHz(0.5));
    expect(pitchToHz(100)).toBeLessThanOrEqual(2400);
  });

  it("hears the hum of its own pack while walking, and not while standing", () => {
    const w = ground(40, 20);
    const fy = w.height - 1;
    const g = Game.create(w, PLAYER, 10, topRow(fy));
    g.pack.place(1, 3, "colomium");
    hold(g, 5);
    expect(listen(g, energies, refs).gain).toBe(0);
    hold(g, 20, { move: 1 });
    expect(listen(g, energies, refs).gain).toBeGreaterThan(0);
    hold(g, 120);
    expect(listen(g, energies, refs).gain).toBe(0);
  });
});

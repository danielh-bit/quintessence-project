import { World } from "../core";
import { bondRect, fill } from "./builder";
import { type Scenario, withDefaults } from "./types";

/**
 * GAME_OVERVIEW §6, "the runaway engine": moving Colomium hums, Sormite heats
 * up, Lyegen emits Teta, and Teta pushes the cart carrying the Colomium faster.
 *
 * Plain blocks, bonded into one cart that rides a long Hard Rock track:
 *
 *     C S Y B      Colomium, Sormite, Lyegen, Bormite (the sail)
 *     L L L L      a Lobime base: keeps heat and hum out of the track
 *   ===========    anchored track
 *
 * `loop = 0` builds the same cart with Lobime instead of Sormite (the loop is
 * broken). `heat` pre-warms the Sormite and Lyegen. `shove` is the starting speed.
 */
export const runaway: Scenario = {
  id: "runaway",
  name: "Runaway engine",
  description:
    "A cart (Colomium, Sormite, Lyegen and a Bormite sail on a Lobime base) given a shove along a long track. Its motion hums, the hum heats the Sormite, the heat makes the Lyegen push the sail: it speeds up, heats up and cracks unless limited.",
  params: {
    track: { label: "Track length (cells)", default: 1200, min: 40, max: 4000 },
    shove: { label: "Starting speed (cells/tick)", default: 0.5, min: 0, max: 2, step: 0.05 },
    heat: { label: "Pre-heat of Sormite and Lyegen", default: 0, min: 0, max: 500 },
    loop: { label: "Sormite in the cart (1) or Lobime (0)", default: 1, min: 0, max: 1 },
  },
  build(rules, p) {
    const q = withDefaults(this, p);
    const width = q.track + 2;
    const w = new World(rules, width, 10);
    const ty = w.height - 1;
    fill(w, 0, ty, width - 1, ty, "hard_rock", { anchored: true });
    fill(w, width - 1, 0, width - 1, ty, "hard_rock", { anchored: true }); // end wall
    const x0 = 2;
    const top = ty - 2;
    const base = ty - 1;
    fill(w, x0, base, x0 + 3, base, "lobime");
    w.place(x0, top, "colomium");
    w.place(x0 + 1, top, q.loop ? "sormite" : "lobime");
    w.place(x0 + 2, top, "lyegen");
    w.place(x0 + 3, top, "bormite");
    bondRect(w, x0, top, x0 + 3, base);
    const heat = rules.energies.find((e) => e.spread === "diffusion");
    if (heat && q.heat > 0) {
      w.field[heat.index][w.idx(x0 + 1, top)] = q.heat;
      w.field[heat.index][w.idx(x0 + 2, top)] = q.heat;
    }
    w.setVelocity(x0, top, q.shove, 0);
    return w;
  },
};

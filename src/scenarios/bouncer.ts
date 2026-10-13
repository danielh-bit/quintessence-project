import { World } from "../core";
import { bondRect, fill, ground } from "./builder";
import { type Scenario, withDefaults } from "./types";

/**
 * GAME_OVERVIEW §6, "the bouncer": Bormite resting on Exgen in a closed shaft.
 * Built from plain blocks only: Hard Rock walls, a Lobime lid, an Exgen at the
 * bottom, a Bormite dropped from the top, a Queflair set into the wall beside
 * the Exgen. Optional weight: Lobime blocks bonded on top of the Bormite.
 */
export const bouncer: Scenario = {
  id: "bouncer",
  name: "Bouncer (pulse)",
  description:
    "A Bormite dropped down a closed shaft onto an Exgen. Watch it bounce, and the Queflair in the wall flash on every beat. Try a taller shaft or added weight.",
  params: {
    shaft: { label: "Free fall above the payload (cells)", default: 10, min: 2, max: 60 },
    weight: { label: "Lobime blocks bonded on the Bormite", default: 0, min: 0, max: 5 },
  },
  build(rules, p) {
    const q = withDefaults(this, p);
    // Interior height = free fall + the payload (Bormite plus stacked weight),
    // so adding weight does not shorten the drop.
    const n = q.weight;
    const H = q.shaft + 1 + n;
    const width = 11;
    const height = H + 4;
    const w = new World(rules, width, height);
    ground(w);
    const cx = 5;
    const exgenY = height - 2; // just above the ground row
    const lidY = exgenY - H - 1;
    // Walls and lid.
    fill(w, cx - 1, lidY, cx - 1, exgenY, "hard_rock", { anchored: true });
    fill(w, cx + 1, lidY, cx + 1, exgenY, "hard_rock", { anchored: true });
    fill(w, cx - 1, lidY, cx + 1, lidY, "lobime", { anchored: true });
    w.place(cx, exgenY, "exgen", { anchored: true });
    w.place(cx + 1, exgenY, "queflair", { anchored: true });
    // The Bormite (with optional weight on top) starts at the top of the shaft.
    const bormY = lidY + 1 + n;
    w.place(cx, bormY, "bormite");
    for (let k = 1; k <= n; k++) w.place(cx, bormY - k, "lobime");
    if (n > 0) bondRect(w, cx, bormY - n, cx, bormY);
    return w;
  },
};

/** Where the bouncer's parts are, for observers (tests). */
export function bouncerLayout(shaft: number, weight = 0) {
  const height = shaft + 1 + weight + 4;
  return { cx: 5, exgenY: height - 2, queflair: [6, height - 2] as [number, number] };
}

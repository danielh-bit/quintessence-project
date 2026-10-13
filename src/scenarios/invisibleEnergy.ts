import { World } from "../core";
import { ground } from "./builder";
import { type Scenario, withDefaults } from "./types";

/**
 * GAME_OVERVIEW §6, "the invisible energy": a Galog with stones piled on it,
 * next to a Queflair; Bormite dust lies nearby. Plain blocks only.
 */
export const invisibleEnergy: Scenario = {
  id: "invisible-energy",
  name: "Invisible energy",
  description:
    "A Galog in the floor with stones piled on it, a Queflair beside the pile and Bormite dust on the floor. Nothing visible connects them, yet the Queflair lights up and the dust drifts away. Take the stones off and it all stops.",
  params: {
    stones: { label: "Stones piled on the Galog", default: 3, min: 0, max: 8 },
  },
  build(rules, p) {
    const q = withDefaults(this, p);
    const w = new World(rules, 32, 16);
    ground(w);
    const gx = 12;
    const fy = w.height - 1;
    w.place(gx, fy, "galog", { anchored: true });
    for (let k = 1; k <= q.stones; k++) w.place(gx, fy - k, "lobime");
    w.place(gx - 1, fy - 1, "queflair");
    for (const x of [gx + 2, gx + 3, gx + 4]) w.place(x, fy - 1, "bormite");
    return w;
  },
};

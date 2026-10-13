import { World } from "../core";
import { bondRect, ground } from "./builder";
import { type Scenario, withDefaults } from "./types";

/**
 * GAME_OVERVIEW §6, "the buzzer": a weight with a Bormite underside resting on
 * Galog. Plain blocks: a Galog set into the floor, a Bormite on it and Lobime
 * blocks bonded on top of the Bormite (the weight).
 */
export const buzzer: Scenario = {
  id: "buzzer",
  name: "Buzzer (second clock)",
  description:
    "A Lobime weight with a Bormite underside, resting on a Galog in the floor. The weight presses the Galog, its Teta lifts the weight, the Galog stops, the weight drops: watch it buzz.",
  params: {
    weight: { label: "Lobime blocks bonded above the Bormite", default: 1, min: 0, max: 6 },
  },
  build(rules, p) {
    const q = withDefaults(this, p);
    const n = q.weight;
    const w = new World(rules, 15, 14 + n);
    ground(w);
    const cx = 7;
    const gy = w.height - 1;
    w.place(cx, gy, "galog", { anchored: true });
    w.place(cx, gy - 1, "bormite");
    for (let k = 1; k <= n; k++) w.place(cx, gy - 1 - k, "lobime");
    if (n > 0) bondRect(w, cx, gy - 1 - n, cx, gy - 1);
    return w;
  },
};

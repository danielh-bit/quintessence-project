import { World } from "../core";
import { ground } from "./builder";
import { type Scenario, withDefaults } from "./types";

/**
 * GAME_OVERVIEW §6, "the latch (memory)": a Queflair and a Ralgen facing each
 * other. Plain blocks: the pair on the floor, `gap` empty cells apart, and an
 * Exgen set into the floor near the Queflair with a stone held high above it.
 * Erasing the stone's support (or dropping any stone on the Exgen) gives the
 * one pulse; here the stone simply starts falling.
 */
export const latch: Scenario = {
  id: "latch",
  name: "Latch (memory)",
  description:
    "A Queflair and a Ralgen facing each other, dark. A stone falls on the Exgen nearby: one pulse, and the pair lights up and stays lit. Put a Lobime block between them and they go dark, and stay dark when you take it away, until the next pulse.",
  params: {
    gap: { label: "Empty cells between Queflair and Ralgen", default: 2, min: 0, max: 8 },
    drop: { label: "Stone drop height (0 = no stone)", default: 8, min: 0, max: 20 },
  },
  build(rules, p) {
    const q = withDefaults(this, p);
    const w = new World(rules, 30, 24);
    ground(w);
    const fy = w.height - 1;
    const row = fy - 1;
    const qx = 12;
    w.place(qx, row, "queflair", { anchored: true });
    w.place(qx + q.gap + 1, row, "ralgen", { anchored: true });
    const ex = qx - 2;
    w.place(ex, fy, "exgen", { anchored: true });
    if (q.drop > 0) w.place(ex, fy - 1 - q.drop, "lobime");
    return w;
  },
};

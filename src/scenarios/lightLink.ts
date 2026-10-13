import { World } from "../core";
import { fill, ground } from "./builder";
import { type Scenario, withDefaults } from "./types";

/**
 * Shared layout: a lamp on the left (a Galog in the floor with a stone on it
 * and a Queflair beside it) and, `distance` cells along the same row, a Ralgen
 * with a Bormite resting behind it.
 */
function buildLink(rules: Parameters<Scenario["build"]>[0], distance: number, stones: number): World {
  const width = distance + 14;
  const w = new World(rules, width, 14);
  ground(w);
  const fy = w.height - 1;
  const row = fy - 1;
  const gx = 3;
  w.place(gx, fy, "galog", { anchored: true });
  for (let k = 1; k <= stones; k++) w.place(gx, fy - k, "lobime");
  const qx = gx + 1;
  w.place(qx, row, "queflair", { anchored: true });
  const rx = qx + distance;
  w.place(rx, row, "ralgen", { anchored: true });
  w.place(rx + 1, row, "bormite");
  return w;
}

/** GAME_OVERVIEW §6, "the light link": a Ralgen that can see a far Queflair. */
export const lightLink: Scenario = {
  id: "light-link",
  name: "Light link",
  description:
    "A lamp (a Queflair lit by a loaded Galog) and, far along the same row, a Ralgen with a Bormite behind it. The Ralgen sees the light and the Bormite is pushed: something is delivered at a distance.",
  params: {
    distance: { label: "Lamp-to-Ralgen distance (cells)", default: 30, min: 3, max: 120 },
    stones: { label: "Stones on the lamp's Galog", default: 1, min: 0, max: 5 },
  },
  build(rules, p) {
    const q = withDefaults(this, p);
    return buildLink(rules, q.distance, q.stones);
  },
};

/**
 * GAME_OVERVIEW §6, "the light switch": the light link plus a loose Lobime block
 * sitting on a ledge above the beam. Shove it off the ledge and it drops into
 * the beam; pick it up and the signal returns.
 */
export const lightSwitch: Scenario = {
  id: "light-switch",
  name: "Light switch",
  description:
    "The light link with a Lobime block on a ledge above the beam. Shove the block (Shove tool) so it slides off into the beam and the Ralgen goes quiet; erase it and the signal comes back.",
  params: {
    distance: { label: "Lamp-to-Ralgen distance (cells)", default: 30, min: 8, max: 120 },
  },
  build(rules, p) {
    const q = withDefaults(this, p);
    const w = buildLink(rules, q.distance, 1);
    const fy = w.height - 1;
    const mid = 4 + Math.floor(q.distance / 2);
    // A ledge two rows above the beam, ending just before `mid`, with the block on its end.
    fill(w, mid - 4, fy - 3, mid - 1, fy - 3, "hard_rock", { anchored: true });
    w.place(mid - 1, fy - 4, "lobime");
    return w;
  },
};

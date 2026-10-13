import { World } from "../core";
import { ground } from "./builder";
import { type Scenario, withDefaults } from "./types";

/** An empty room with a floor: a blank workbench. */
export const playground: Scenario = {
  id: "playground",
  name: "Playground",
  description: "An empty room with a Hard Rock floor. Build anything.",
  params: {
    width: { label: "Width", default: 96, min: 16, max: 400 },
    height: { label: "Height", default: 64, min: 16, max: 200 },
  },
  build(rules, p) {
    const q = withDefaults(this, p);
    const w = new World(rules, q.width, q.height);
    ground(w);
    return w;
  },
};

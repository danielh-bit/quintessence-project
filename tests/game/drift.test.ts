// Bormite dust near a Teta source: the spec asks that it drift away and stay
// within a few cells instead of being flung. With the rules as they stand it
// is flung (docs/TUNING.md, entries 9 and 13). This file pins what the
// experimental flow limit on the push does about it, and keeps the open
// question visible.
import { describe, expect, it } from "vitest";
import { World } from "../../src/core";
import { rulesWith, V0 } from "../helpers/world";

/** A loaded Galog in an open floor with three specks of dust 2, 3 and 4 cells away. */
function dustSite(rules = V0, stones = 1) {
  const w = new World(rules, 200, 24);
  const fy = w.height - 1;
  for (let x = 0; x < w.width; x++) w.place(x, fy, "hard_rock", { anchored: true });
  const gx = 40;
  w.place(gx, fy, "galog", { anchored: true });
  for (let k = 1; k <= stones; k++) w.place(gx, fy - k, "lobime");
  for (const x of [gx + 2, gx + 3, gx + 4]) w.place(x, fy - 1, "bormite");
  return { w, gx };
}

function watch(rules = V0, stones = 1) {
  const { w, gx } = dustSite(rules, stones);
  let top = 0;
  for (let t = 0; t < 1500; t++) {
    w.step();
    for (const b of w.bodies.values()) {
      if (w.elementAt(w.xOf(b.cells[0]), w.yOf(b.cells[0])) !== "bormite") continue;
      const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (s > top) top = s;
    }
  }
  return { top, ends: w.find("bormite").map(([x]) => x - gx) };
}

describe("Bormite dust near a Teta source", () => {
  it("with the experimental flow limit on, it drifts away slowly and stays within a few cells", () => {
    const rules = rulesWith((j) => (j.elements.bormite.response.flow = 0.003));
    const { top, ends } = watch(rules);
    expect(ends.length).toBe(3);
    // It moved away from the pile...
    expect(Math.min(...ends)).toBeGreaterThan(4);
    // ...slowly enough to watch (well under a cell per tick)...
    expect(top).toBeLessThan(0.3);
    // ...and stopped just outside the Galog's reach.
    expect(Math.max(...ends)).toBeLessThanOrEqual(9);
  });

  it("the flow limit is off in the rules as they stand, and the dust is flung far out of reach", () => {
    expect(V0.elements[V0.elementIndex.bormite].response).toMatchObject({ kind: "push", flow: 0 });
    const { top, ends } = watch();
    expect(top).toBeGreaterThan(1);
    expect(Math.max(...ends)).toBeGreaterThan(50);
  });

  it.todo("with the rules as they stand, dust drifts and stays within a few cells (open: docs/TUNING.md entry 13)");
});

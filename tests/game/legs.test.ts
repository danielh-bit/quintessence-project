// Walking on loose blocks: the legs push back on what they stand on only as hard
// as the ground can hold it, so a heavy walker (the body plus a full pack) does
// not throw a light block out from under its feet.
import { describe, expect, it } from "vitest";
import { Game, input } from "../../src/game";
import { ground, PLAYER } from "../helpers/game";

/** Stand on `n` blocks of one element lying in a row, walk, and report the fastest any block moved and where they ended. */
function walkOver(element: string, n: number, move: 1 | -1, blocksFirst: boolean): { fastest: number; moved: boolean } {
  const w = ground(60, 24);
  const fy = w.height - 1;
  const blocks = () => {
    for (let k = 0; k < n; k++) w.place(20 + k, fy - 1, element);
  };
  // The order things were made in must not matter (in the real map the rubble is made first).
  if (blocksFirst) blocks();
  const g = Game.create(w, PLAYER, 20, fy - 1 - PLAYER.body.height);
  if (!blocksFirst) blocks();
  const before = JSON.stringify(w.find(element));
  let fastest = 0;
  for (let t = 0; t < 150; t++) {
    g.step(input({ move }));
    for (const [x, y] of w.find(element)) {
      const b = w.bodyAt(x, y);
      if (b) fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
    }
  }
  return { fastest, moved: JSON.stringify(w.find(element)) !== before };
}

describe("walking on loose blocks", () => {
  for (const element of ["lobime", "queflair", "bormite", "galog"]) {
    for (const n of [1, 3]) {
      it(`${n} ${element} block${n > 1 ? "s" : ""} stay put under a walker`, () => {
        for (const move of [1, -1] as const) {
          for (const blocksFirst of [true, false]) {
            // They stay where they are: not thrown out, and not carried along by the feet.
            const r = walkOver(element, n, move, blocksFirst);
            expect(r.fastest, `${move} ${blocksFirst}`).toBeLessThan(0.01);
            expect(r.moved, `${move} ${blocksFirst}`).toBe(false);
          }
        }
      });
    }
  }

  it("a block can still be walked off of, and the walker keeps moving", () => {
    const w = ground(60, 24);
    const fy = w.height - 1;
    const g = Game.create(w, PLAYER, 20, fy - 1 - PLAYER.body.height);
    w.place(20, fy - 1, "lobime");
    for (let t = 0; t < 150; t++) g.step(input({ move: 1 }));
    expect(g.bounds()!.x).toBeGreaterThan(30);
  });
});

import { describe, expect, it } from "vitest";
import { floor, makeWorld } from "../helpers/world";

describe("bodies", () => {
  it("bond keeps only touching cells together", () => {
    const w = makeWorld(10, 10);
    w.place(1, 1, "lobime");
    w.place(2, 1, "lobime");
    w.place(5, 1, "lobime");
    const ids = w.bond([[1, 1], [2, 1], [5, 1]]);
    expect(ids.length).toBe(2);
    expect(w.bodyAt(1, 1)!.id).toBe(w.bodyAt(2, 1)!.id);
    expect(w.bodyAt(5, 1)!.id).not.toBe(w.bodyAt(1, 1)!.id);
  });

  it("removing a middle cell splits a body into its parts, both keeping the motion", () => {
    const w = makeWorld(10, 10);
    for (let x = 1; x <= 3; x++) w.place(x, 1, "lobime");
    w.bond([[1, 1], [2, 1], [3, 1]]);
    w.setVelocity(1, 1, 0.3, 0);
    w.erase(2, 1);
    const a = w.bodyAt(1, 1)!;
    const b = w.bodyAt(3, 1)!;
    expect(a.id).not.toBe(b.id);
    expect(a.vx).toBe(0.3);
    expect(b.vx).toBe(0.3);
    expect(a.mass).toBe(3);
  });

  it("anchored cells never move; unbond frees each cell", () => {
    const w = makeWorld(6, 10);
    floor(w);
    w.place(2, 2, "lobime", { anchored: true });
    w.place(3, 2, "lobime");
    w.place(3, 1, "lobime");
    w.bond([[3, 2], [3, 1]]);
    w.run(50);
    expect(w.elementAt(2, 2)).toBe("lobime");
    expect(w.elementAt(3, 8)).toBe("lobime");
    expect(w.elementAt(3, 7)).toBe("lobime");
    w.unbond(3, 8);
    expect(w.bodyAt(3, 8)!.id).not.toBe(w.bodyAt(3, 7)!.id);
  });

  it("mass is the sum of the element masses from the rules", () => {
    const w = makeWorld(6, 6);
    w.place(1, 1, "bormite");
    w.place(1, 2, "hard_rock");
    const [id] = w.bond([[1, 1], [1, 2]]);
    expect(w.bodies.get(id)!.mass).toBeCloseTo(0.2 + 6, 10);
  });
});

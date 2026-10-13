// Every scenario is also a scene: it survives a save/load round trip through
// JSON, and a loaded scene runs exactly like the built one (determinism).
import { describe, expect, it } from "vitest";
import { loadScene, saveScene } from "../../src/core";
import { SCENARIOS } from "../../src/scenarios";
import { V0 } from "../helpers/world";

describe("scenarios as scenes", () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: round-trips through scene JSON and runs identically`, () => {
      const built = s.build(V0);
      const json = JSON.parse(JSON.stringify(saveScene(built, { name: s.name })));
      const loaded = loadScene(V0, json);
      expect(loaded.stateHash()).toBe(built.stateHash());
      built.run(300);
      loaded.run(300);
      expect(loaded.stateHash()).toBe(built.stateHash());
    });

    it(`${s.id}: building twice gives the same world and the same run`, () => {
      const a = s.build(V0);
      const b = s.build(V0);
      a.run(200);
      b.run(200);
      expect(a.stateHash()).toBe(b.stateHash());
    });
  }

  it("every scenario documents its parameters with sane defaults", () => {
    for (const s of SCENARIOS) {
      expect(s.description.length).toBeGreaterThan(20);
      for (const p of Object.values(s.params)) {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import v0 from "../../rules/v0.json";
import { cloneRulesJson, loadRules, RulesError } from "../../src/core/rules";

describe("rules loader", () => {
  it("loads rules/v0.json into a typed, index-resolved rule set", () => {
    const rules = loadRules(v0);
    expect(rules.version).toBe("v0");
    // Index 0 is the empty placeholder; the ten v0 elements follow.
    expect(rules.elements.length).toBe(11);
    expect(rules.energies.length).toBe(4);
    for (const el of rules.elements.slice(1)) {
      expect(rules.elementIndex[el.id]).toBe(el.index);
      expect(el.mass).toBeGreaterThan(0);
      expect(el.blocks.length).toBe(rules.energies.length);
    }
  });

  it("gives every element exactly one trigger and one response (section 6 grammar)", () => {
    const rules = loadRules(v0);
    for (const el of rules.elements.slice(1)) {
      expect(el.trigger.kind).toBeTypeOf("string");
      expect(el.response.kind).toBeTypeOf("string");
    }
  });

  it("rejects unknown keys, bad references and out-of-range numbers with a path", () => {
    const bad1 = cloneRulesJson(v0) as any;
    bad1.elements.galog.response.energy = "nope";
    expect(() => loadRules(bad1)).toThrow(/elements\.galog\.response\.energy.*unknown energy/);

    const bad2 = cloneRulesJson(v0) as any;
    bad2.world.gravty = 1;
    expect(() => loadRules(bad2)).toThrow(RulesError);

    const bad3 = cloneRulesJson(v0) as any;
    bad3.energies.heat.conductivity = 0.9;
    expect(() => loadRules(bad3)).toThrow(/conductivity/);

    const bad4 = cloneRulesJson(v0) as any;
    bad4.elements.bormite.trigger = { kind: "exposure", energy: "hum" };
    expect(() => loadRules(bad4)).toThrow(/push response needs/);

    const bad5 = cloneRulesJson(v0) as any;
    bad5.elements.lobime.color = "grey";
    expect(() => loadRules(bad5)).toThrow(/color/);
  });

  it("resolves degradesTo to an element index or 0 (crumbles away)", () => {
    const json = cloneRulesJson(v0) as any;
    json.elements.queflair.degradesTo = "lobime";
    const rules = loadRules(json);
    expect(rules.elements[rules.elementIndex.queflair].degradesTo).toBe(rules.elementIndex.lobime);
    expect(rules.elements[rules.elementIndex.galog].degradesTo).toBe(0);
  });
});

describe("rules loader: review fixes", () => {
  it("rejects an element triggered by a stored (diffusion) energy that it emits itself", () => {
    const bad = cloneRulesJson(v0) as any;
    bad.elements.sormite.trigger = { kind: "exposure", energy: "heat" };
    expect(() => loadRules(bad)).toThrow(/stored \(diffusion\) energy/);
  });
});

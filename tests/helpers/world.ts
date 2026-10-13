import v0 from "../../rules/v0.json";
import { cloneRulesJson, loadRules, World, type RuleSet } from "../../src/core";

export const V0_JSON = v0;
export const V0 = loadRules(v0);

/** Rules from v0.json with some values changed (a deep-path patch function). */
export function rulesWith(patch: (json: any) => void): RuleSet {
  const json = cloneRulesJson(v0) as any;
  patch(json);
  return loadRules(json);
}

export function makeWorld(width: number, height: number, rules: RuleSet = V0, seed = 1): World {
  return new World(rules, width, height, { seed });
}

/** Anchored floor along the bottom row. */
export function floor(w: World, element = "hard_rock", y = w.height - 1): void {
  for (let x = 0; x < w.width; x++) w.place(x, y, element, { anchored: true });
}

/** Run until the predicate holds; returns the tick count it took or -1. */
export function runUntil(w: World, pred: () => boolean, maxTicks: number): number {
  for (let t = 0; t < maxTicks; t++) {
    if (pred()) return t;
    w.step();
  }
  return pred() ? maxTicks : -1;
}

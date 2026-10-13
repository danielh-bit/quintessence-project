import type { RuleSet, World } from "../core";

export interface ScenarioParam {
  label: string;
  default: number;
  min: number;
  max: number;
  step?: number;
}

/**
 * A setup built from plain blocks. Scenarios may name machines; the core may
 * not. Tests and the sandbox UI build worlds from the same scenarios.
 */
export interface Scenario {
  id: string;
  name: string;
  /** What to look at, in a sentence or two (shown in the UI). */
  description: string;
  params: Record<string, ScenarioParam>;
  build(rules: RuleSet, params?: Partial<Record<string, number>>): World;
}

/** Merge given params over a scenario's defaults. */
export function withDefaults(s: Pick<Scenario, "params">, p: Partial<Record<string, number>> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, def] of Object.entries(s.params)) out[k] = p[k] ?? def.default;
  return out;
}

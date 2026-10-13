// Registry of setups the sandbox UI can load and the tests can build.
import { bouncer } from "./bouncer";
import { buzzer } from "./buzzer";
import { invisibleEnergy } from "./invisibleEnergy";
import { lightLink, lightSwitch } from "./lightLink";
import { playground } from "./playground";
import type { Scenario } from "./types";

export type { Scenario, ScenarioParam } from "./types";

export const SCENARIOS: Scenario[] = [playground, invisibleEnergy, bouncer, buzzer, lightLink, lightSwitch];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

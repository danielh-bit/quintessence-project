// Rules with grains switched on, for the grain engine tests and measurements.
import type { GrainParams } from "../../src/core";
import { rulesWith } from "./world";

export const GRAINS: GrainParams = { size: 8, chip: 0.25, crumbleBelow: 0.25, dustFall: 0.1, dustMobility: 0.25 };

/** v0 with grains on (and optionally other values patched). */
export function grainRules(patch: Partial<GrainParams> = {}, more?: (json: any) => void) {
  return rulesWith((j) => {
    j.world.grains = { ...GRAINS, ...patch };
    more?.(j);
  });
}

export const VG = grainRules();

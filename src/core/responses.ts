// Triggers, responses, generic energy effects and strain. Filled in by later steps.
import type { World } from "./world";

export function applyResponses(w: World): void {
  w.forceX.fill(0);
  w.forceY.fill(0);
}

export function applyEffects(_w: World): void {}

export function applyStrain(_w: World): void {}

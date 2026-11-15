// How much open sky reaches each cell: a presentation choice, never read by the
// simulation (docs/ROADMAP.md, "Daylight"). Underground and inside the ship it is
// dark; the only light there is Glow. Computed once from the map as it was drawn.

import type { World } from "../core";

/** How fast daylight fades going through empty space and through rock, per cell. */
const AIR_FADE = 0.1;
const ROCK_FADE = 0.15;

/**
 * Daylight 0..1 per cell. Cells open to the sky have 1. It falls off with
 * distance from the open sky, quickly through rock and slowly through air, so
 * a cave mouth fades into dark over a few steps.
 */
export function computeDaylight(world: World, sky: Uint8Array): Float32Array {
  const { width, height, size } = world;
  const day = new Float32Array(size);
  const fade = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    if (sky[i]) day[i] = 1;
    fade[i] = world.elem[i] !== 0 && world.body[i] === 0 ? ROCK_FADE : AIR_FADE;
  }
  // Relax in alternating sweeps until nothing changes (a few dozen passes at most).
  for (let pass = 0; pass < 80; pass++) {
    let changed = false;
    for (let dir = 0; dir < 2; dir++) {
      for (let k = 0; k < size; k++) {
        const i = dir === 0 ? k : size - 1 - k;
        const x = i % width;
        const y = (i - x) / width;
        let best = day[i];
        const f = fade[i];
        if (x > 0 && day[i - 1] - f > best) best = day[i - 1] - f;
        if (x < width - 1 && day[i + 1] - f > best) best = day[i + 1] - f;
        if (y > 0 && day[i - width] - f > best) best = day[i - width] - f;
        if (y < height - 1 && day[i + width] - f > best) best = day[i + width] - f;
        if (best > day[i]) {
          day[i] = best;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  // Squared, so the last of the daylight dies away quickly and a cave is truly dark.
  for (let i = 0; i < size; i++) day[i] *= day[i];
  return day;
}

// What the player hears: pure functions from the world to a sound, so they can be
// tested without a browser. Hum travels only through touching solids, so it is
// heard through the body (what the pack lets out) and the ground under the feet.
// The field already falls off along its path, so the volume falls with distance.

import type { RuleSet } from "../core";
import type { Game } from "../game";

export interface Hearing {
  /** 0..1 loudness. */
  gain: number;
  /** Hz. */
  freq: number;
}

export const SILENT: Hearing = { gain: 0, freq: 110 };

/** Lowest and highest pitch, Hz, and how many octaves a speed of one cell per tick adds. */
const F_LOW = 90;
const F_MAX = 2400;
const OCTAVES_PER_SPEED = 2.5;

/** The energies that travel through connected solids (heard as sound). */
export function soundEnergies(rules: RuleSet): number[] {
  return rules.energies.filter((e) => e.spread === "conduction").map((e) => e.index);
}

/**
 * A field value that counts as loud: a fraction of the strongest output of any
 * element that emits such an energy, taken from the rules.
 */
export function loudRef(rules: RuleSet, energy: number): number {
  let max = 0;
  for (const el of rules.elements) {
    if (el.response.kind === "emit" && el.response.energy === energy) max = Math.max(max, el.response.max);
  }
  return max > 0 ? max * 0.08 : 1;
}

/** The pitch of a hum: higher for faster-moving sources. */
export function pitchToHz(pitch: number): number {
  const f = F_LOW * Math.pow(2, Math.max(0, pitch) * OCTAVES_PER_SPEED);
  return f > F_MAX ? F_MAX : f;
}

/** Loudness from a field value: soft at first, never past 1. */
export function loudness(value: number, ref: number): number {
  return value > 0 ? 1 - Math.exp(-value / ref) : 0;
}

/** What the player hears now: the loudest hum in the body's cells and the cells under its feet. */
export function listen(game: Game, energies: number[], refs: number[]): Hearing {
  const w = game.world;
  const b = game.body();
  const bb = game.bounds();
  if (!b || !bb || energies.length === 0) return SILENT;
  const cells: number[] = [...b.cells];
  for (let x = bb.x; x < bb.x + bb.width; x++) {
    if (w.inBounds(x, bb.y + bb.height)) cells.push(w.idx(x, bb.y + bb.height));
  }
  let best = 0;
  let bestPitch = 0;
  energies.forEach((e, k) => {
    const pitch = w.pitch[e];
    for (const i of cells) {
      const v = loudness(w.field[e][i], refs[k]);
      if (v > best) {
        best = v;
        bestPitch = pitch ? pitch[i] : 0;
      }
    }
  });
  return best > 0 ? { gain: best, freq: pitchToHz(bestPitch) } : SILENT;
}

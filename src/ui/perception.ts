// What the player can perceive (GAME_OVERVIEW pillar 2, rule 11.2).
//
// The player view shows only things the senses reach: matter (its colour),
// light, and the colour of hot matter. Which energy is "light" and which is
// "heat" is read from each energy's spread kind in the rules, never its id:
//   - an energy that spreads as rays is light you can see;
//   - an energy that diffuses through matter tints hot matter red/orange;
//   - every other energy (and strain, load, velocity, ...) stays invisible.
// All reference levels are derived from the rule set's own numbers.

import type { RuleSet, World } from "../core";
import { hexToRgb, type RGB } from "./colors";

/** How much of its colour unlit matter shows: the world is dim. */
const AMBIENT = 0.55;
const EMPTY: RGB = [6, 7, 10];
const EMPTY_FLAT: RGB = [22, 24, 30];
/** Tint of light, on matter and in the air around lit areas. */
const WARM: RGB = [255, 198, 120];
/** Strength of the haze that light leaves in empty space. */
const AIR = 0.4;
/** Colours of hot matter: warm, damaging (t = 0.5), glowing (t = 1). */
const HOT_LOW: RGB = [140, 26, 12];
const HOT_MID: RGB = [225, 72, 22];
const HOT_HIGH: RGB = [255, 196, 96];
/** The heat ramp starts showing at heatRef / HEAT_SOFT ... */
const HEAT_SOFT = 5;
/** ... and is fully glowing at HEAT_SPAN * heatRef. */
const HEAT_SPAN = 8;

export class Perception {
  /** Energies that spread as rays (seen as light). */
  readonly lightEnergies: number[];
  /** Energies stored in matter by diffusion (seen as the colour of hot matter). */
  readonly heatEnergies: number[];
  /** Light field that reads as "well lit" (from the strongest light emitter). */
  readonly lightRef: number;
  /**
   * Stored heat that reads as "hot enough to hurt": the level at which the
   * energy's strain effect matches a typical element's strain recovery.
   */
  readonly heatRef: number;
  private readonly heatScale: number;
  /** Per element: output that reads as "glowing"; 0 if it does not emit light. */
  readonly glowRef: Float64Array;
  /** Per element colour from the rules (index 0 = empty). */
  readonly colors: RGB[];

  constructor(rules: RuleSet) {
    this.lightEnergies = rules.energies.filter((e) => e.spread === "ray").map((e) => e.index);
    this.heatEnergies = rules.energies.filter((e) => e.spread === "diffusion").map((e) => e.index);
    this.colors = rules.elements.map((e) => hexToRgb(e.color));
    this.glowRef = new Float64Array(rules.elements.length);
    let maxLight = 0;
    for (const el of rules.elements) {
      const r = el.response;
      if (r.kind !== "emit") continue;
      const spread = rules.energies[r.energy].spread;
      if (spread === "ray") {
        this.glowRef[el.index] = Math.max(r.max * 0.3, 1e-6);
        maxLight = Math.max(maxLight, r.max);
      }
    }
    this.lightRef = maxLight > 0 ? maxLight * 0.6 : 1;
    this.heatRef = heatReference(rules);
    this.heatScale = 1 / Math.log1p(HEAT_SOFT * HEAT_SPAN);
  }

  /** Perceived light level 0..1 at a cell. */
  light(w: World, i: number): number {
    let L = 0;
    for (const e of this.lightEnergies) L += w.field[e][i];
    return L > 0 ? 1 - Math.exp(-L / this.lightRef) : 0;
  }

  /**
   * Perceived colour of cell i, written to out[0..2] (0..255 floats).
   * `asEmpty` draws the cell as the air it sits in (used under moving bodies).
   * `flat` (developer overlay only) shows raw element colours without lighting.
   */
  shade(w: World, i: number, out: Float64Array, flat: boolean, asEmpty = false): void {
    const el = asEmpty ? 0 : w.elem[i];
    if (flat) {
      const c = el === 0 ? EMPTY_FLAT : this.colors[el];
      out[0] = c[0];
      out[1] = c[1];
      out[2] = c[2];
      return;
    }
    const l = this.light(w, i);
    if (el === 0) {
      // Air around lit areas: a warm haze, brightest close to the light.
      const a = l * l * AIR;
      out[0] = EMPTY[0] + WARM[0] * a;
      out[1] = EMPTY[1] + WARM[1] * a;
      out[2] = EMPTY[2] + WARM[2] * a;
      return;
    }
    const c = this.colors[el];
    const k = AMBIENT + (1 - AMBIENT) * l;
    let r = c[0] * k + WARM[0] * l * 0.12;
    let g = c[1] * k + WARM[1] * l * 0.12;
    let b = c[2] * k + WARM[2] * l * 0.12;

    // A light emitter looks lit in proportion to its output.
    const gr = this.glowRef[el];
    if (gr > 0) {
      const o = w.output[i];
      if (o > 0) {
        const t = 1 - Math.exp(-o / gr);
        r += (Math.min(255, c[0] * 1.15 + 90) - r) * t;
        g += (Math.min(255, c[1] * 1.15 + 80) - g) * t;
        b += (Math.min(255, c[2] * 1.1 + 50) - b) * t;
      }
    }

    // Hot matter changes colour (it carries its heat with it).
    if (this.heatEnergies.length > 0) {
      let H = 0;
      for (const e of this.heatEnergies) H += w.field[e][i];
      if (H > 0) {
        // Logarithmic, so the colour keeps changing from warm to well past
        // the level that does damage (instead of saturating early).
        const t = Math.min(1, Math.log1p((H * HEAT_SOFT) / this.heatRef) * this.heatScale);
        const m = Math.min(1, t * 1.6);
        const lo = t < 0.5 ? HOT_LOW : HOT_MID;
        const hi = t < 0.5 ? HOT_MID : HOT_HIGH;
        const u = t < 0.5 ? t * 2 : t * 2 - 1;
        r += (lo[0] + (hi[0] - lo[0]) * u - r) * m;
        g += (lo[1] + (hi[1] - lo[1]) * u - g) * m;
        b += (lo[2] + (hi[2] - lo[2]) * u - b) * m;
      }
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
  }
}

/**
 * The stored level of the diffusion energies that starts to do damage: where
 * its strain effect per tick equals a typical (median) element's strain
 * recovery. Without a strain effect, a few times the strongest emitter's output.
 */
function heatReference(rules: RuleSet): number {
  const refs: number[] = [];
  for (const en of rules.energies) {
    if (en.spread !== "diffusion" || !(en.effects.strain > 0)) continue;
    const levels = rules.elements
      .filter((el) => el.index !== 0 && Number.isFinite(el.strain.max) && el.strain.recover > 0)
      .map((el) => el.strain.recover / en.effects.strain)
      .sort((a, b) => a - b);
    if (levels.length === 0) continue;
    const mid = levels.length >> 1;
    refs.push(levels.length % 2 ? levels[mid] : (levels[mid - 1] + levels[mid]) / 2);
  }
  if (refs.length > 0) return Math.min(...refs);
  let maxHeat = 0;
  for (const el of rules.elements) {
    const r = el.response;
    if (r.kind === "emit" && rules.energies[r.energy].spread === "diffusion") maxHeat = Math.max(maxHeat, r.max);
  }
  return maxHeat > 0 ? maxHeat * 5 : 50;
}

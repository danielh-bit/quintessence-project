// Triggers, responses, generic energy effects and strain.
//
// Every element has one trigger and one response (GAME_OVERVIEW §6). The
// trigger value x is read from the world:
//   pressure  -> load on the cell (static resting mass)
//   motion    -> speed of the cell's body (0 if anchored)
//   impact    -> largest closing speed the cell felt last tick
//   exposure  -> the energy's field at the cell, minus the cell's own emission
// and the response output follows, the same way for every element:
//   target = min(max, gain * max(0, x - threshold) * (1 - fatigue * strain / strainMax))
//   output = max(target, previous output * decay)
// An `emit` response makes the cell a source of its energy next tick; a `push`
// response is a force along the trigger energy's direction; every response
// builds strain in proportion to its output.

import { exposure } from "./fields/index";
import { rand01 } from "./rng";
import type { World } from "./world";

/**
 * Outputs below this are zero. Numerical hygiene, not physics: a decaying burst
 * would otherwise linger forever as a vanishing source.
 */
export const OUTPUT_FLOOR = 1e-6;

export function applyResponses(w: World): void {
  w.forceX.fill(0);
  w.forceY.fill(0);
  const els = w.rules.elements;
  for (let c = 0; c < w.size; c++) {
    const el = w.elem[c];
    if (el === 0) continue;
    const def = els[el];
    const r = def.response;
    if (r.kind === "none") {
      w.output[c] = 0;
      continue;
    }
    const t = def.trigger;
    let x = 0;
    switch (t.kind) {
      case "pressure":
        x = w.load[c];
        break;
      case "motion": {
        const id = w.body[c];
        if (id !== 0) {
          const b = w.bodies.get(id)!;
          x = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        }
        break;
      }
      case "impact":
        x = w.impact[c];
        break;
      case "exposure":
        x = exposure(w, t.energy, c);
        break;
      case "none":
        break;
    }
    const input = x > r.threshold ? x - r.threshold : 0;
    let eff = 1 - (def.strain.fatigue * w.strain[c]) / def.strain.max;
    if (eff < 0) eff = 0;
    let target = r.gain * input * eff;
    if (target > r.max) target = r.max;
    const decayed = w.output[c] * r.decay;
    let out = target >= decayed ? target : decayed;
    if (out < OUTPUT_FLOOR) out = 0;
    w.output[c] = out;
    if (r.kind === "emit") {
      if (target >= decayed) w.outPitch[c] = out > 0 ? r.pitch * x : 0;
    } else if (r.kind === "push" && out > 0 && t.kind === "exposure") {
      // Along the field's direction, scaled by how one-sided it is (opposite pushes cancel).
      const total = w.field[t.energy][c];
      if (total > 0) {
        w.forceX[c] += (out * w.dirX[t.energy]![c]) / total;
        w.forceY[c] += (out * w.dirY[t.energy]![c]) / total;
      }
    }
    w.strain[c] += def.strain.build * out;
  }
}

// Eight directions for shaking, as unit vectors (diagonals use sqrt 1/2).
const H = Math.SQRT1_2;
const SHAKE_X = [1, H, 0, -H, -1, -H, 0, H];
const SHAKE_Y = [0, -H, -1, -H, 0, H, 1, H];

/** Effects every energy has on whatever it reaches, whatever the element. */
export function applyEffects(w: World): void {
  const els = w.rules.elements;
  for (const en of w.rules.energies) {
    const field = w.field[en.index];
    const fx = en.effects;

    if (fx.strain > 0) {
      for (let c = 0; c < w.size; c++) if (w.elem[c] !== 0 && field[c] > 0) w.strain[c] += fx.strain * field[c];
    }

    if (fx.push > 0) {
      const dx = w.dirX[en.index]!;
      const dy = w.dirY[en.index]!;
      for (let c = 0; c < w.size; c++) {
        if (w.elem[c] === 0 || w.body[c] === 0) continue;
        w.forceX[c] += fx.push * dx[c];
        w.forceY[c] += fx.push * dy[c];
      }
    }

    if (fx.shake.strength > 0) {
      for (const b of w.sortedBodies()) {
        if (b.mass > fx.shake.maxMass) continue;
        let amp = 0;
        for (const c of b.cells) if (field[c] > amp) amp = field[c];
        if (amp < fx.shake.threshold || amp === 0) continue;
        const k = Math.floor(rand01(w.seed, w.tick, b.cells[0], en.index) * 8);
        const kick = fx.shake.strength * amp;
        b.jx += kick * SHAKE_X[k];
        b.jy += kick * SHAKE_Y[k];
      }
    }

    const lt = fx.loosen.threshold;
    if (lt !== null) {
      for (let c = 0; c < w.size; c++) {
        const el = w.elem[c];
        if (el === 0 || w.body[c] !== 0 || field[c] <= 0 || field[c] < lt || els[el].mass > fx.loosen.maxMass) continue;
        w.loosen(c);
        w.events.push({ tick: w.tick, kind: "loosen", x: w.xOf(c), y: w.yOf(c), element: el, into: el });
      }
    }
  }
}

/**
 * Strain recovery and degradation. Recovery is constant, so an element that
 * rests (or responds only lightly) recovers; at or above its limit an element
 * degrades into `degradesTo` (0 = it crumbles away), and a body that loses a
 * cell falls apart into its connected parts.
 */
export function applyStrain(w: World): void {
  const els = w.rules.elements;
  for (let c = 0; c < w.size; c++) {
    const el = w.elem[c];
    if (el === 0) continue;
    const st = els[el].strain;
    let s = w.strain[c] - st.recover;
    if (s < 0) s = 0;
    w.strain[c] = s;
    if (s >= st.max) {
      const into = els[el].degradesTo;
      w.events.push({ tick: w.tick, kind: "degrade", x: w.xOf(c), y: w.yOf(c), element: el, into });
      w.transmute(c, into);
    }
  }
}

// Energy fields. Each energy spreads by the algorithm its data names
// ("spread"); the core does not know which energy is which.
//
// Non-diffusion fields are rebuilt every tick from the outputs that responses
// produced last tick. Diffusion fields are stored state that takes one step.
// `ownField` records what a cell contributed to its own field, so exposure can
// leave it out (an element never triggers itself).

import type { World } from "../world";
import { spreadConduction } from "./conduction";
import { spreadDiffusion } from "./diffusion";
import { spreadRadial } from "./radial";
import { spreadRays } from "./rays";
import { scratchFor } from "./scratch";

/** For each element index, the energy index its response emits (or -1). */
function emitTable(w: World): Int32Array {
  const t = new Int32Array(w.rules.elements.length).fill(-1);
  for (const el of w.rules.elements) if (el.response.kind === "emit") t[el.index] = el.response.energy;
  return t;
}

const tables = new WeakMap<object, Int32Array>();

export function computeFields(w: World): void {
  const s = scratchFor(w, w.size);
  let emits = tables.get(w.rules);
  if (!emits) {
    emits = emitTable(w);
    tables.set(w.rules, emits);
  }
  const sources: number[][] = w.rules.energies.map(() => []);
  for (let c = 0; c < w.size; c++) {
    const e = emits[w.elem[c]];
    if (e >= 0 && w.output[c] > 0) sources[e].push(c);
  }

  for (const en of w.rules.energies) {
    const e = en.index;
    const field = w.field[e];
    const own = w.ownField[e];
    if (en.spread === "diffusion") {
      own.fill(0);
      spreadDiffusion(w, s, e, en.conductivity, en.loss, sources[e], field);
      continue;
    }
    field.fill(0);
    own.fill(0);
    const dx = w.dirX[e];
    const dy = w.dirY[e];
    if (dx && dy) {
      dx.fill(0);
      dy.fill(0);
    }
    switch (en.spread) {
      case "radial":
        spreadRadial(w, s, e, en.range, sources[e], field, own, dx!, dy!);
        break;
      case "ray":
        spreadRays(w, s, e, en.range, sources[e], field, own, dx!, dy!);
        break;
      case "conduction":
        spreadConduction(w, s, e, en.range, sources[e], field, own, w.pitch[e]!);
        break;
    }
  }
}

/** What a cell is exposed to: the field there minus its own contribution. */
export function exposure(w: World, energy: number, c: number): number {
  const v = w.field[energy][c] - w.ownField[energy][c];
  return v > 0 ? v : 0;
}

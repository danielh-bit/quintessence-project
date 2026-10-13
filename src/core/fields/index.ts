// Energy fields. Filled in by the energy step; for now every field is zero.
import type { World } from "../world";

export function computeFields(w: World): void {
  for (const e of w.rules.energies) {
    if (e.spread === "diffusion") continue;
    w.field[e.index].fill(0);
    w.ownField[e.index].fill(0);
  }
}

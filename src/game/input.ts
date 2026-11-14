// Input as simulation input. One Input per tick, plain data with whole numbers
// only, so a list of inputs replayed from the same start gives the same world.

export interface Input {
  /** Walk: -1 left, 0 stand, 1 right. */
  move: -1 | 0 | 1;
  /** Jump (only does something while standing on something). */
  jump: boolean;
  /** Swing the tool at this world cell, or null. */
  swing: { x: number; y: number } | null;
  /** Put the cell in pack cell (slotX, slotY) down in the empty world cell (x, y), or null. */
  place: { x: number; y: number; slotX: number; slotY: number } | null;
}

export const IDLE: Input = { move: 0, jump: false, swing: null, place: null };

/** A copy of an input that shares nothing with the original. */
export function copyInput(i: Input): Input {
  return {
    move: i.move,
    jump: i.jump,
    swing: i.swing ? { x: i.swing.x, y: i.swing.y } : null,
    place: i.place ? { x: i.place.x, y: i.place.y, slotX: i.place.slotX, slotY: i.place.slotY } : null,
  };
}

/** An input with defaults filled in, e.g. `input({ move: 1 })`. */
export function input(partial: Partial<Input> = {}): Input {
  return { ...IDLE, ...partial };
}

function fail(msg: string): never {
  throw new Error(`input: ${msg}`);
}

function cell(v: unknown, what: string): { x: number; y: number } | null {
  if (v === null || v === undefined) return null;
  const o = v as { x?: unknown; y?: unknown };
  if (typeof o !== "object" || !Number.isInteger(o.x) || !Number.isInteger(o.y)) fail(`${what} must be a cell {x, y} of whole numbers`);
  return { x: o.x as number, y: o.y as number };
}

/** Check and normalise an input that came from outside (a file, the network). */
export function parseInput(v: unknown): Input {
  if (typeof v !== "object" || v === null) fail("expected an object");
  const o = v as Record<string, unknown>;
  if (o.move !== -1 && o.move !== 0 && o.move !== 1) fail("move must be -1, 0 or 1");
  if (typeof o.jump !== "boolean") fail("jump must be true or false");
  let place: Input["place"] = null;
  if (o.place !== null && o.place !== undefined) {
    const at = cell(o.place, "place")!;
    const p = o.place as { slotX?: unknown; slotY?: unknown };
    if (!Number.isInteger(p.slotX) || !Number.isInteger(p.slotY)) fail("place needs a pack cell (slotX, slotY) of whole numbers");
    place = { x: at.x, y: at.y, slotX: p.slotX as number, slotY: p.slotY as number };
  }
  return { move: o.move, jump: o.jump, swing: cell(o.swing, "swing"), place };
}

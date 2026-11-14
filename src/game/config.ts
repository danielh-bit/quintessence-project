// The actor's configuration: the body, how it moves and what its tools do.
// It comes from plain JSON (data/player.json) so it can be tuned without code.

export interface ActorConfig {
  body: {
    /** Element id (from the rules) the body's cells are made of. */
    element: string;
    width: number;
    height: number;
  };
  walk: {
    /** Target walking speed, cells per tick. */
    speed: number;
    /** Most the legs can change the speed per tick while standing on something. */
    accel: number;
    /** Fraction of `accel` available in the air (0 = none). */
    airControl: number;
  };
  jump: {
    /** Upward speed of a jump, cells per tick. */
    speed: number;
  };
  /** How far from the body's centre a hand reaches, in cells. */
  reach: number;
  swing: {
    /** Closing speed of the blow: it is an impact like any other. */
    speed: number;
    /** How concentrated the blow is (a pointed tool); a plain collision is 1. */
    focus: number;
    /** Ticks between swings. */
    cooldown: number;
  };
}

function fail(path: string, msg: string): never {
  throw new Error(`player config${path}: ${msg}`);
}

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "expected an object");
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string, path: string, min: number, whole = false): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${path}.${key}`, "expected a finite number");
  if (v < min) fail(`${path}.${key}`, `must be >= ${min}`);
  if (whole && !Number.isInteger(v)) fail(`${path}.${key}`, "must be a whole number");
  return v;
}

/** Validate plain JSON and return a typed configuration. */
export function loadActorConfig(json: unknown): ActorConfig {
  const root = rec(json, "");
  const body = rec(root.body, ".body");
  const walk = rec(root.walk, ".walk");
  const jump = rec(root.jump, ".jump");
  const swing = rec(root.swing, ".swing");
  if (typeof body.element !== "string") fail(".body.element", "expected an element id");
  return {
    body: { element: body.element, width: num(body, "width", ".body", 1, true), height: num(body, "height", ".body", 1, true) },
    walk: { speed: num(walk, "speed", ".walk", 0), accel: num(walk, "accel", ".walk", 0), airControl: num(walk, "airControl", ".walk", 0) },
    jump: { speed: num(jump, "speed", ".jump", 0) },
    reach: num(root, "reach", "", 0),
    swing: { speed: num(swing, "speed", ".swing", 0), focus: num(swing, "focus", ".swing", 0), cooldown: num(swing, "cooldown", ".swing", 0, true) },
  };
}

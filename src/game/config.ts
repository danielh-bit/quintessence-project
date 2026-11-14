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
  place: {
    /** Ticks the hand is busy after putting a cell down. */
    cooldown: number;
  };
  /**
   * The pack: a small grid carried by the body, drawn as a picture. Each
   * character of `layout` is one cell; `legend` names the element of each
   * character (those cells are fixed walls and dividers), and "." is empty
   * room for contents.
   */
  pack: {
    /** Cells of the body the pack opens onto, as [dx, dy] from the body's top-left cell. */
    ports: Array<[number, number]>;
    layout: string[];
    legend: Record<string, string>;
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
  const place = rec(root.place, ".place");
  if (typeof body.element !== "string") fail(".body.element", "expected an element id");
  const width = num(body, "width", ".body", 1, true);
  const height = num(body, "height", ".body", 1, true);

  const pack = rec(root.pack, ".pack");
  if (!Array.isArray(pack.ports) || pack.ports.length === 0) fail(".pack.ports", "expected a list of [dx, dy] cells");
  const ports = (pack.ports as unknown[]).map((p, k): [number, number] => {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || !Number.isInteger(p[1])) fail(`.pack.ports[${k}]`, "expected [dx, dy]");
    const [dx, dy] = p as [number, number];
    if (dx < 0 || dy < 0 || dx >= width || dy >= height) fail(`.pack.ports[${k}]`, "must be a cell of the body");
    return [dx, dy];
  });
  if (!Array.isArray(pack.layout) || pack.layout.length === 0) fail(".pack.layout", "expected a list of rows");
  const layout = (pack.layout as unknown[]).map((row, k) => {
    if (typeof row !== "string" || row.length === 0) fail(`.pack.layout[${k}]`, "expected a row of characters");
    return row;
  });
  if (layout.some((row) => row.length !== layout[0].length)) fail(".pack.layout", "every row must have the same length");
  const legendO = rec(pack.legend, ".pack.legend");
  const legend: Record<string, string> = {};
  for (const [ch, el] of Object.entries(legendO)) {
    if (ch.length !== 1 || ch === ".") fail(`.pack.legend.${ch}`, 'keys are single characters other than "."');
    if (typeof el !== "string") fail(`.pack.legend.${ch}`, "expected an element id");
    legend[ch] = el;
  }
  for (const row of layout) for (const ch of row) if (ch !== "." && legend[ch] === undefined) fail(".pack.layout", `"${ch}" is not in the legend`);

  return {
    body: { element: body.element, width, height },
    walk: { speed: num(walk, "speed", ".walk", 0), accel: num(walk, "accel", ".walk", 0), airControl: num(walk, "airControl", ".walk", 0) },
    jump: { speed: num(jump, "speed", ".jump", 0) },
    reach: num(root, "reach", "", 0),
    swing: { speed: num(swing, "speed", ".swing", 0), focus: num(swing, "focus", ".swing", 0), cooldown: num(swing, "cooldown", ".swing", 0, true) },
    place: { cooldown: num(place, "cooldown", ".place", 0, true) },
    pack: { ports, layout, legend },
  };
}

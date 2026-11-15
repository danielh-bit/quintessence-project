// Maps: a level as an editable picture. One character is one cell.
//
// Text format (see maps/crash-site.txt):
//
//   ; a comment (only on lines of the legend part)
//   # = hard_rock              terrain: anchored, never moves
//   s = lobime loose           a loose cell: it falls, rests and can be pushed or taken
//   C = colomium loose bond    loose cells of this character that touch are one rigid body
//   start = @                  the character marking the body's top-left cell
//   hatch = +                  the character marking the cells of the ship's hatch
//   map:
//   <one row per line, all the same length; "." is empty>
//
// Rows come after the line `map:`. The characters "." and " " are empty cells.
// Anything the map names must exist in the rules: unknown characters, unknown
// elements and uneven rows fail with a message that says where.

import type { RuleSet } from "../core";
import { World } from "../core";
import type { ActorConfig } from "./config";
import { Game } from "./game";

export interface MapLegendEntry {
  element: string;
  /** Loose cells are bodies of their own: they fall and can be pushed. Default: anchored terrain. */
  loose?: boolean;
  /** Touching loose cells of the same character are bonded into one rigid body. Implies loose. */
  bond?: boolean;
}

export interface MapFile {
  rows: string[];
  legend: Record<string, MapLegendEntry>;
  /** The character marking the body's top-left cell. */
  start: string;
  /** The character marking the ship's hatch (any number of cells). */
  hatch?: string;
}

/** The cells of the hatch: their bounding box, in world cells. */
export interface HatchBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LoadedMap {
  game: Game;
  /** The ship's hatch, if the map has one. */
  hatch: HatchBox | null;
  /**
   * For presentation only (never read by the simulation): per cell, whether it
   * is open to the sky, computed from the picture as it was drawn.
   */
  sky: Uint8Array;
}

function fail(where: string, msg: string): never {
  throw new Error(`map${where}: ${msg}`);
}

/** Parse the text format into a MapFile. */
export function parseMapText(text: string): MapFile {
  const lines = text.replace(/\r/g, "").split("\n");
  const legend: Record<string, MapLegendEntry> = {};
  let start: string | undefined;
  let hatch: string | undefined;
  const rows: string[] = [];
  let inMap = false;
  lines.forEach((line, n) => {
    const where = ` line ${n + 1}`;
    if (inMap) {
      if (line.trim() === "") return;
      rows.push(line);
      return;
    }
    const body = line.replace(/;.*$/, "").trim();
    if (body === "") return;
    if (body === "map:") {
      inMap = true;
      return;
    }
    const m = /^(\S+)\s*=\s*(.+)$/.exec(body);
    if (!m) return fail(where, `expected "<character> = <element> [loose] [bond]", got "${body}"`);
    const [, key, value] = m;
    if (key === "start" || key === "hatch") {
      if (value.length !== 1) return fail(where, `${key} must be a single character`);
      if (key === "start") start = value;
      else hatch = value;
      return;
    }
    if (key.length !== 1) return fail(where, `legend keys are single characters, got "${key}"`);
    if (key === "." || key === " ") return fail(where, `"${key}" is always an empty cell`);
    if (legend[key]) return fail(where, `"${key}" is defined twice`);
    const [element, ...flags] = value.split(/\s+/);
    const entry: MapLegendEntry = { element };
    for (const f of flags) {
      if (f === "loose") entry.loose = true;
      else if (f === "bond") {
        entry.bond = true;
        entry.loose = true;
      } else return fail(where, `unknown flag "${f}" (use loose or bond)`);
    }
    legend[key] = entry;
  });
  if (!inMap) fail("", 'there is no "map:" line');
  if (start === undefined) fail("", 'there is no "start = <character>" line');
  return { rows, legend, start, hatch };
}

/**
 * Build the world from a map and put the body at its start.
 * Terrain is anchored; loose cells are bodies; the rest is empty.
 */
export function loadMap(rules: RuleSet, config: ActorConfig, map: MapFile): LoadedMap {
  const { rows, legend } = map;
  if (rows.length === 0) fail("", "there are no rows");
  const width = rows[0].length;
  const height = rows.length;
  rows.forEach((row, y) => {
    if (row.length !== width) fail(` row ${y + 1}`, `has ${row.length} cells, the first row has ${width}`);
  });
  for (const [ch, e] of Object.entries(legend)) {
    if (rules.elementIndex[e.element] === undefined || rules.elementIndex[e.element] === 0) {
      fail(` legend "${ch}"`, `unknown element "${e.element}"`);
    }
  }
  if (map.start.length !== 1) fail("", "start must be a single character");

  const world = new World(rules, width, height);
  let startAt = null as [number, number] | null;
  let hx0 = width;
  let hy0 = height;
  let hx1 = -1;
  let hy1 = -1;
  // Bonded groups: loose cells of one bonding character that touch.
  const groups = new Map<string, Array<[number, number]>>();

  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "." || ch === " ") return;
      if (ch === map.start) {
        if (startAt) fail(` (${x}, ${y})`, `a second start; the first is at (${startAt[0]}, ${startAt[1]})`);
        startAt = [x, y];
        return;
      }
      if (map.hatch !== undefined && ch === map.hatch) {
        hx0 = Math.min(hx0, x);
        hy0 = Math.min(hy0, y);
        hx1 = Math.max(hx1, x);
        hy1 = Math.max(hy1, y);
        return;
      }
      const e = legend[ch];
      if (!e) return fail(` (${x}, ${y})`, `"${ch}" is not in the legend`);
      world.place(x, y, e.element, { anchored: !e.loose });
      if (e.bond) {
        const key = `${ch}`;
        const list = groups.get(key) ?? [];
        list.push([x, y]);
        groups.set(key, list);
      }
    });
  });
  if (!startAt) fail("", `the start character "${map.start}" is not in the picture`);

  for (const cells of groups.values()) {
    const seen = new Set<number>();
    const member = new Set(cells.map(([x, y]) => y * width + x));
    for (const [x, y] of cells) {
      if (seen.has(y * width + x)) continue;
      const part: Array<[number, number]> = [];
      const stack: Array<[number, number]> = [[x, y]];
      seen.add(y * width + x);
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        part.push([cx, cy]);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
          const k = ny * width + nx;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && member.has(k) && !seen.has(k)) {
            seen.add(k);
            stack.push([nx, ny]);
          }
        }
      }
      if (part.length > 1) world.bond(part);
    }
  }

  const [sx, sy] = startAt;
  let game: Game;
  try {
    game = Game.create(world, config, sx, sy);
  } catch (e) {
    return fail(` start (${sx}, ${sy})`, `the body does not fit: ${(e as Error).message}`);
  }
  const hatch = hx1 >= 0 ? { x: hx0, y: hy0, width: hx1 - hx0 + 1, height: hy1 - hy0 + 1 } : null;
  return { game, hatch, sky: openSky(world) };
}

/** Cells open to the sky: empty cells with no anchored cell above them in their column. */
function openSky(world: World): Uint8Array {
  const sky = new Uint8Array(world.size);
  for (let x = 0; x < world.width; x++) {
    for (let y = 0; y < world.height; y++) {
      const i = world.idx(x, y);
      if (world.elem[i] !== 0 && world.body[i] === 0) break;
      sky[i] = 1;
    }
  }
  return sky;
}

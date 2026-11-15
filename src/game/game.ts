// The game: a world plus one actor (the player's body) driven by inputs.
//
// The actor is a bonded body of ordinary cells in the world, so every rule
// applies to it as to any other body: it loads what it stands on, landing is
// an impact, it collides with solid cells. This layer never changes a rule; it
// only acts on the world through the core's outside actions (push, kick,
// strike), the way a hand would.
//
// The pack is a small grid of its own, carried by the body (a carried grid of
// the core). It runs on the same rules, moves with the body and weighs on it.
//
// The hands move matter between the world and the pack: a swing that leaves
// its target loose takes it into the pack, and a cell from the pack can be put
// down in the world. Matter keeps everything that belongs to it on the way.
//
// Everything here is deterministic: `step(input)` applies the input and
// advances the world one tick.

import { loadScene, saveScene, type Body, type RuleSet, type Scene, World } from "../core";
import type { ActorConfig } from "./config";
import { copyInput, type Input, parseInput } from "./input";

export const GAME_FORMAT = "quintessence-game";
export const GAME_VERSION = 1;

/** Full state of a game, as plain JSON. */
export interface GameSnapshot {
  format: typeof GAME_FORMAT;
  version: number;
  scene: Scene;
  /** Body id of the actor in the scene. */
  body: number;
  /** Ticks until the tool can swing again. */
  cooldown: number;
}

/** Something the player's hands did in the last step (for sound and animation; not simulation state). */
export interface GameEvent {
  /** "swing": a blow landed. "take": a cell went into the pack. "place": a cell was put down. "stow": an item moved to another compartment of the pack. */
  kind: "swing" | "take" | "place" | "stow";
  /** World cell it happened at (for "stow": the pack cell the item arrived in). */
  x: number;
  y: number;
  /** Element id of the cell involved. */
  element: string;
  /** For "stow": the id of the item's body in the pack, so a view can keep following it. */
  body?: number;
}

export class Game {
  readonly world: World;
  readonly config: ActorConfig;
  /** Body id of the actor. */
  bodyId: number;
  /** Ticks until the hands are free again (after a swing or putting something down). */
  cooldown = 0;
  /** What the hands did in the last step. */
  events: GameEvent[] = [];

  private constructor(world: World, config: ActorConfig, bodyId: number) {
    this.world = world;
    this.config = config;
    this.bodyId = bodyId;
  }

  /**
   * Put the actor's body into a world, its top-left cell at (x, y). The cells
   * must be empty.
   */
  static create(world: World, config: ActorConfig, x: number, y: number): Game {
    const { element, width, height } = config.body;
    const cells: Array<[number, number]> = [];
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (!world.inBounds(cx, cy)) throw new Error(`the body does not fit at (${x}, ${y})`);
        if (world.elementAt(cx, cy) !== null) throw new Error(`(${cx}, ${cy}) is not empty`);
        cells.push([cx, cy]);
      }
    }
    for (const [cx, cy] of cells) world.place(cx, cy, element);
    const ids = world.bond(cells);

    // The pack: walls and dividers from the picture, fixed in place.
    const { layout, legend, ports } = config.pack;
    const pack = new World(world.rules, layout[0].length, layout.length, { seed: world.seed + 1 });
    layout.forEach((row, py) => {
      [...row].forEach((ch, px) => {
        if (ch !== ".") pack.place(px, py, legend[ch], { anchored: true });
      });
    });
    world.attach(pack, ports.map(([dx, dy]): [number, number] => [x + dx, y + dy]));
    return new Game(world, config, ids[0]);
  }

  /** The pack's grid: a world of its own, read and edited like any other. */
  get pack(): World {
    return this.world.carried[0].world;
  }

  /** Whether a pack cell is room for contents (not a wall or divider of the layout). */
  isPackRoom(x: number, y: number): boolean {
    const row = this.config.pack.layout[y];
    return row !== undefined && row[x] === ".";
  }

  /** The actor's body, or undefined if it no longer exists. */
  body(): Body | undefined {
    return this.world.bodies.get(this.bodyId);
  }

  /** Top-left corner and size of the body's bounding box, in cells. */
  bounds(): { x: number; y: number; width: number; height: number } | null {
    const b = this.body();
    if (!b) return null;
    const w = this.world;
    let x0 = w.width;
    let y0 = w.height;
    let x1 = -1;
    let y1 = -1;
    for (const c of b.cells) {
      const x = w.xOf(c);
      const y = w.yOf(c);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  }

  /** Whether a world cell is within the hand's reach of the body's centre. */
  inReach(x: number, y: number): boolean {
    const b = this.body();
    if (!b || !this.world.inBounds(x, y)) return false;
    const w = this.world;
    const n = b.cells.length;
    let sx = 0;
    let sy = 0;
    for (const c of b.cells) {
      sx += w.xOf(c);
      sy += w.yOf(c);
    }
    // Distance from the centre, compared without dividing (whole numbers).
    const dx = n * x - sx;
    const dy = n * y - sy;
    const r = this.config.reach * n;
    return dx * dx + dy * dy <= r * r;
  }

  /** Apply one tick's input, then advance the world one tick. */
  step(input: Input): void {
    this.events = [];
    const struck = this.act(input);
    this.world.step();
    if (struck >= 0) this.take(struck);
  }

  /**
   * The pack's compartments: the connected areas of room in its layout, each a
   * list of [x, y] cells in reading order, the compartments themselves in
   * reading order of their first cell.
   */
  compartments(): Array<Array<[number, number]>> {
    const layout = this.config.pack.layout;
    const seen = new Set<number>();
    const out: Array<Array<[number, number]>> = [];
    const W = layout[0].length;
    for (let y = 0; y < layout.length; y++) {
      for (let x = 0; x < W; x++) {
        if (layout[y][x] !== "." || seen.has(y * W + x)) continue;
        const part: Array<[number, number]> = [];
        const stack: Array<[number, number]> = [[x, y]];
        seen.add(y * W + x);
        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          part.push([cx, cy]);
          for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
            if (ny < 0 || ny >= layout.length || nx < 0 || nx >= W || layout[ny][nx] !== "." || seen.has(ny * W + nx)) continue;
            seen.add(ny * W + nx);
            stack.push([nx, ny]);
          }
        }
        part.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        out.push(part);
      }
    }
    return out;
  }

  /** The first free cell at the top of the pack's room, in reading order, or -1 if it is full. */
  packEntry(): number {
    return this.entryIn(this.compartments().flat());
  }

  /** The first free cell at the top of the given room cells (nothing but wall above it), or -1. */
  private entryIn(room: Array<[number, number]>): number {
    const pack = this.pack;
    const layout = this.config.pack.layout;
    const sorted = [...room].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of sorted) {
      // Room at the top: nothing but wall above it.
      if (y > 0 && layout[y - 1][x] === ".") continue;
      if (pack.elem[pack.idx(x, y)] === 0) return pack.idx(x, y);
    }
    return -1;
  }

  /** After a swing: if the cell it hit is loose now, it goes into the pack (if there is room). */
  private take(i: number): void {
    const w = this.world;
    if (w.elem[i] === 0 || w.body[i] === 0 || w.body[i] === this.bodyId) return;
    const to = this.packEntry();
    if (to < 0) return;
    const element = w.rules.elements[w.elem[i]].id;
    const x = w.xOf(i);
    const y = w.yOf(i);
    this.pack.takeCell(w, i, to);
    const b = this.body();
    if (b) w.recomputeMass(b);
    this.events.push({ kind: "take", x, y, element });
  }

  /** Apply the input to the world. Returns the cell a swing landed on, or -1. */
  private act(input: Input): number {
    const w = this.world;
    if (this.cooldown > 0) this.cooldown--;
    const b = this.body();
    if (!b) return -1;
    w.refreshSupport();
    const { walk, jump, swing } = this.config;

    // Legs: a force towards the walking speed. Standing still is braking.
    if (b.resting) {
      const want = input.move * walk.speed - b.vx;
      const dv = want > walk.accel ? walk.accel : want < -walk.accel ? -walk.accel : want;
      if (dv !== 0) {
        const f = b.mass * dv;
        w.push(b.id, f, 0);
        // The legs push back on whatever loose thing they stand on, but only as
        // hard as the ground can hold that thing in place: the core's friction
        // changes a resting body's speed by at most friction x gravity per tick,
        // whatever the load. A harder push would throw a light block out from
        // under the walker, tick after tick, at the world's speed limit.
        if (!b.restsOnTerrain && b.restsOn.length > 0) {
          let held = 0;
          for (const id of b.restsOn) held += w.bodies.get(id)!.mass;
          const grip = w.rules.world.friction * w.rules.world.gravity * held;
          const back = f > grip ? grip : f < -grip ? -grip : f;
          for (const id of b.restsOn) w.push(id, -back / b.restsOn.length, 0);
        }
      }
      if (input.jump) w.kick(b.id, 0, -jump.speed);
    } else if (input.move !== 0 && walk.airControl > 0) {
      const most = walk.accel * walk.airControl;
      const want = input.move * walk.speed - b.vx;
      // In the air there is only a little steering, and no braking.
      if (want * input.move > 0) {
        const dv = want > most ? most : want < -most ? -most : want;
        w.push(b.id, b.mass * dv, 0);
      }
    }

    // The tool: a blow on the aimed cell.
    let struck = -1;
    if (input.swing && this.cooldown === 0) {
      const { x, y } = input.swing;
      if (this.inReach(x, y)) {
        const i = w.idx(x, y);
        if (w.elem[i] !== 0 && w.body[i] !== b.id) {
          w.strike(i, swing.speed, swing.focus);
          this.cooldown = swing.cooldown;
          struck = i;
          this.events.push({ kind: "swing", x, y, element: w.rules.elements[w.elem[i]].id });
        }
      }
    }

    // The hand: put a cell from the pack down in an empty cell of the world.
    if (input.place && this.cooldown === 0) {
      const { x, y, slotX, slotY } = input.place;
      const pack = this.pack;
      if (this.inReach(x, y) && w.elem[w.idx(x, y)] === 0 && this.isPackRoom(slotX, slotY)) {
        const from = pack.idx(slotX, slotY);
        const held = pack.bodyAt(slotX, slotY);
        if (held && held.cells.length === 1) {
          const element = pack.rules.elements[pack.elem[from]].id;
          const nb = w.takeCell(pack, from, w.idx(x, y));
          // It leaves the hand moving with the player.
          nb.vx = b.vx;
          nb.vy = b.vy;
          w.recomputeMass(b);
          this.cooldown = this.config.place.cooldown;
          this.events.push({ kind: "place", x, y, element });
        }
      }
    }
    // The hand: move an item to the next compartment of the pack.
    if (input.stow && this.cooldown === 0) {
      const { x, y } = input.stow;
      const pack = this.pack;
      const rooms = this.compartments();
      const from = rooms.findIndex((r) => r.some(([rx, ry]) => rx === x && ry === y));
      const held = from >= 0 ? pack.bodyAt(x, y) : undefined;
      if (from >= 0 && rooms.length > 1 && held && held.cells.length === 1) {
        const to = this.entryIn(rooms[(from + 1) % rooms.length]);
        if (to >= 0) {
          const element = pack.rules.elements[pack.elem[pack.idx(x, y)]].id;
          const nb = pack.takeCell(pack, pack.idx(x, y), to);
          this.cooldown = this.config.place.cooldown;
          this.events.push({ kind: "stow", x: pack.xOf(to), y: pack.yOf(to), element, body: nb.id });
        }
      }
    }
    return struck;
  }

  // ------------------------------------------------------------------ state

  snapshot(): GameSnapshot {
    return { format: GAME_FORMAT, version: GAME_VERSION, scene: saveScene(this.world), body: this.bodyId, cooldown: this.cooldown };
  }

  static restore(rules: RuleSet, config: ActorConfig, snapshot: unknown): Game {
    const s = snapshot as Partial<GameSnapshot> | null;
    if (typeof s !== "object" || s === null || s.format !== GAME_FORMAT) throw new Error(`game: format must be "${GAME_FORMAT}"`);
    if (s.version !== GAME_VERSION) throw new Error(`game: unsupported version ${String(s.version)}`);
    if (!Number.isInteger(s.body) || !Number.isInteger(s.cooldown)) throw new Error("game: body and cooldown must be whole numbers");
    const world = loadScene(rules, s.scene);
    if (world.carried.length === 0) throw new Error("game: the scene has no pack");
    const g = new Game(world, config, s.body as number);
    g.cooldown = s.cooldown as number;
    return g;
  }

  /** Stable hash of the full state (world and actor). */
  stateHash(): string {
    return `${this.world.stateHash()}-${this.bodyId}-${this.cooldown}`;
  }
}

// ------------------------------------------------------------------ recording

/** A start state and the inputs that followed it: enough to reproduce a run exactly. */
export interface Recording {
  start: GameSnapshot;
  inputs: Input[];
}

/** Steps a game while writing down every input. */
export class Recorder {
  readonly game: Game;
  readonly recording: Recording;

  constructor(game: Game) {
    this.game = game;
    this.recording = { start: JSON.parse(JSON.stringify(game.snapshot())) as GameSnapshot, inputs: [] };
  }

  step(input: Input): void {
    this.recording.inputs.push(copyInput(input));
    this.game.step(input);
  }
}

/** Rebuild the start of a recording and feed it the same inputs. */
export function replay(rules: RuleSet, config: ActorConfig, recording: Recording): Game {
  const g = Game.restore(rules, config, recording.start);
  for (const i of recording.inputs) g.step(parseInput(i));
  return g;
}

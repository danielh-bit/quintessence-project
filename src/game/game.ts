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
// Everything here is deterministic: `step(input)` applies the input and
// advances the world one tick.

import { loadScene, saveScene, type Body, type RuleSet, type Scene, World } from "../core";
import type { ActorConfig } from "./config";
import { type Input, parseInput } from "./input";

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

export class Game {
  readonly world: World;
  readonly config: ActorConfig;
  /** Body id of the actor. */
  bodyId: number;
  /** Ticks until the tool can swing again. */
  cooldown = 0;

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
    this.act(input);
    this.world.step();
  }

  private act(input: Input): void {
    const w = this.world;
    if (this.cooldown > 0) this.cooldown--;
    const b = this.body();
    if (!b) return;
    w.refreshSupport();
    const { walk, jump, swing } = this.config;

    // Legs: a force towards the walking speed. Standing still is braking.
    if (b.resting) {
      const want = input.move * walk.speed - b.vx;
      const dv = want > walk.accel ? walk.accel : want < -walk.accel ? -walk.accel : want;
      if (dv !== 0) {
        const f = b.mass * dv;
        w.push(b.id, f, 0);
        // The legs push back on whatever loose thing they stand on.
        if (!b.restsOnTerrain && b.restsOn.length > 0) {
          for (const id of b.restsOn) w.push(id, -f / b.restsOn.length, 0);
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
    if (input.swing && this.cooldown === 0) {
      const { x, y } = input.swing;
      if (this.inReach(x, y)) {
        const i = w.idx(x, y);
        if (w.elem[i] !== 0 && w.body[i] !== b.id) {
          w.strike(i, swing.speed, swing.focus);
          this.cooldown = swing.cooldown;
        }
      }
    }
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
    this.recording.inputs.push({ move: input.move, jump: input.jump, swing: input.swing ? { x: input.swing.x, y: input.swing.y } : null });
    this.game.step(input);
  }
}

/** Rebuild the start of a recording and feed it the same inputs. */
export function replay(rules: RuleSet, config: ActorConfig, recording: Recording): Game {
  const g = Game.restore(rules, config, recording.start);
  for (const i of recording.inputs) g.step(parseInput(i));
  return g;
}

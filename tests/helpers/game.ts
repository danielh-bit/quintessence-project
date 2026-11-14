// Helpers for driving the game layer headless with scripted inputs.
import player from "../../data/player.json";
import type { RuleSet, World } from "../../src/core";
import { Game, input, loadActorConfig, type Input } from "../../src/game";
import { floor, makeWorld, V0 } from "./world";

export const PLAYER_JSON = player;
export const PLAYER = loadActorConfig(player);

/** A world with a Hard Rock floor along the bottom row. */
export function ground(width: number, height: number, rules: RuleSet = V0): World {
  const w = makeWorld(width, height, rules);
  floor(w);
  return w;
}

/** Row of the body's top-left cell when its feet are `above` cells over the surface at row `surfaceY`. */
export function topRow(surfaceY: number, above = 0): number {
  return surfaceY - PLAYER.body.height - above;
}

/** Step with the same input n times. */
export function hold(g: Game, n: number, partial: Partial<Input> = {}): void {
  for (let t = 0; t < n; t++) g.step(input(partial));
}

/** Walk until the body's left edge is at column x (or give up after maxTicks), then stand until it stops. */
export function walkTo(g: Game, x: number, maxTicks = 2000): void {
  for (let t = 0; t < maxTicks; t++) {
    const at = g.bounds()!.x;
    if (at === x) break;
    g.step(input({ move: at < x ? 1 : -1 }));
  }
  for (let t = 0; t < 200 && g.body()!.vx !== 0; t++) g.step(input());
}

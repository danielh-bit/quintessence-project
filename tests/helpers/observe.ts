// Ways of watching a running world from the outside: positions of visible
// things, brightness of glowing things, and field readings at a probe cell
// (what an instrument placed there would show).
import type { World } from "../../src/core";

/** Positions of every cell of an element, in index order. */
export function where(w: World, element: string): Array<[number, number]> {
  return w.find(element);
}

/** Brightness (response output) of the brightest cell of an element. */
export function brightness(w: World, element: string): number {
  const el = w.rules.elementIndex[element];
  let v = 0;
  for (let i = 0; i < w.size; i++) if (w.elem[i] === el && w.output[i] > v) v = w.output[i];
  return v;
}

/** Run n ticks, sampling f after each. */
export function record<T>(w: World, n: number, f: (w: World) => T): T[] {
  const out: T[] = [];
  for (let t = 0; t < n; t++) {
    w.step();
    out.push(f(w));
  }
  return out;
}

/** Degradations seen while running. */
export function runCollectingEvents(w: World, n: number) {
  const events: Array<{ tick: number; kind: string; element: string; x: number; y: number }> = [];
  for (let t = 0; t < n; t++) {
    w.step();
    for (const e of w.events) events.push({ tick: e.tick, kind: e.kind, element: w.rules.elements[e.element].id, x: e.x, y: e.y });
  }
  return events;
}

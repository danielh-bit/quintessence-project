// Checks on a scene file before it reaches loadScene, so a malformed file is
// refused with a readable message instead of loading a corrupted world.
// (loadScene checks the format, elements and cell values itself; these are
// the shapes it takes on trust.)

import type { RuleSet } from "../core";
import { sizeProblem } from "./io";

const MAX_ID = 2 ** 31 - 1;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isWhole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Returns what is wrong with a parsed scene file, or null if it can be loaded. */
export function sceneProblem(rules: RuleSet, json: unknown): string | null {
  if (!isObj(json)) return "expected an object";
  const size = sizeProblem(json.width, json.height);
  if (size) return size;
  const width = json.width as number;
  const height = json.height as number;

  if (json.name !== undefined && typeof json.name !== "string") return "name must be text";
  if (json.tick !== undefined && !(isWhole(json.tick) && json.tick >= 0)) return "tick must be a whole number >= 0";
  if (json.seed !== undefined && !isNum(json.seed)) return "seed must be a finite number";
  if (json.nextBodyId !== undefined && !(isWhole(json.nextBodyId) && json.nextBodyId >= 1 && json.nextBodyId <= MAX_ID)) {
    return "nextBodyId must be a whole number >= 1";
  }

  if (!Array.isArray(json.cells)) return "cells must be a list";
  if (json.cells.length > width * height) return `more cells (${json.cells.length}) than the world has`;
  for (let k = 0; k < json.cells.length; k++) {
    const c: unknown = json.cells[k];
    if (!isObj(c)) return `cell #${k + 1} must be an object`;
    if (!isWhole(c.x) || !isWhole(c.y)) return `cell #${k + 1}: x and y must be whole numbers`;
    if (typeof c.e !== "string" || !Object.hasOwn(rules.elementIndex, c.e)) {
      return `cell (${c.x}, ${c.y}): unknown element ${JSON.stringify(c.e)}`;
    }
    if (c.b !== undefined && !(isWhole(c.b) && c.b >= 1 && c.b <= MAX_ID)) {
      return `cell (${c.x}, ${c.y}): body id must be a whole number >= 1`;
    }
    for (const key of ["s", "o", "p", "i"] as const) {
      if (c[key] !== undefined && !isNum(c[key])) return `cell (${c.x}, ${c.y}): "${key}" must be a finite number`;
    }
    if (c.f !== undefined) {
      if (!isObj(c.f)) return `cell (${c.x}, ${c.y}): "f" must be an object of energy values`;
      for (const [id, v] of Object.entries(c.f)) {
        if (!Object.hasOwn(rules.energyIndex, id)) return `cell (${c.x}, ${c.y}): unknown energy ${JSON.stringify(id)}`;
        if (!isNum(v)) return `cell (${c.x}, ${c.y}): ${id} value must be a finite number`;
      }
    }
  }

  if (json.bodies !== undefined) {
    if (!Array.isArray(json.bodies)) return "bodies must be a list";
    for (let k = 0; k < json.bodies.length; k++) {
      const b: unknown = json.bodies[k];
      if (!isObj(b)) return `body #${k + 1} must be an object`;
      if (!(isWhole(b.id) && b.id >= 1 && b.id <= MAX_ID)) return `body #${k + 1}: id must be a whole number >= 1`;
      for (const key of ["vx", "vy", "ox", "oy"] as const) {
        if (b[key] !== undefined && !isNum(b[key])) return `body ${b.id}: ${key} must be a finite number`;
      }
      // A sub-cell offset is less than a cell (the core moves a body a whole
      // cell once it passes half of one).
      for (const key of ["ox", "oy"] as const) {
        if (typeof b[key] === "number" && Math.abs(b[key]) > 1) return `body ${b.id}: ${key} must be between -1 and 1`;
      }
    }
  }
  return null;
}

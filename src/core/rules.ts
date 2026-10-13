// Rule-set types and the validating loader.
//
// The core never names an element or an energy: everything it knows about the
// world's physics comes from a RuleSet built here from plain JSON
// (rules/v0.json). Elements and energies are addressed by index after loading.

export type SpreadKind = "radial" | "ray" | "conduction" | "diffusion";

export const SPREAD_KINDS: readonly SpreadKind[] = ["radial", "ray", "conduction", "diffusion"];

/** Spreads whose field has a direction ("away from its source"). */
export function isDirectional(spread: SpreadKind): boolean {
  return spread === "radial" || spread === "ray";
}

export interface WorldParams {
  /** Downward acceleration, cells per tick squared. */
  gravity: number;
  /** Speed cap per axis, cells per tick. */
  maxSpeed: number;
  /** Fraction of velocity lost per tick by bodies that are not resting on anything. */
  airDrag: number;
  /** Coulomb friction coefficient for bodies resting on something. */
  friction: number;
  /** Fraction of closing speed returned on a collision (0 = no bounce). */
  restitution: number;
  /** Closing speeds below this are resting contact, not impacts. */
  minImpact: number;
  /** Strain added to each of the two contact cells per unit of closing speed. */
  impactStrain: number;
}

export interface ShakeEffect {
  /** Velocity kick per unit of field, applied in a pseudo-random direction. */
  strength: number;
  /** Field level below which nothing shakes. */
  threshold: number;
  /** Only loose bodies at or below this mass are shaken. */
  maxMass: number;
}

export interface LoosenEffect {
  /** Field level at which an anchored cell is freed; null disables the effect. */
  threshold: number | null;
  /** Only anchored cells at or below this mass can be freed. */
  maxMass: number;
}

/** Effects an energy has on every cell it reaches, regardless of element. */
export interface EnergyEffects {
  /** Strain added per tick per unit of field. */
  strain: number;
  /** Force per unit of field on every loose cell, along the field direction (directional spreads only). */
  push: number;
  shake: ShakeEffect;
  loosen: LoosenEffect;
}

export interface EnergyDef {
  id: string;
  index: number;
  name: string;
  spread: SpreadKind;
  directional: boolean;
  /** Reach in cells (radial, ray, conduction). */
  range: number;
  /** Fraction of the difference exchanged per tick between touching cells (diffusion). */
  conductivity: number;
  /** Fraction of the stored value lost per tick (diffusion). */
  loss: number;
  effects: EnergyEffects;
}

export type TriggerDef =
  | { kind: "none" }
  | { kind: "pressure" }
  | { kind: "motion" }
  | { kind: "impact" }
  | { kind: "exposure"; energy: number };

export const TRIGGER_KINDS = ["none", "pressure", "motion", "impact", "exposure"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export interface ResponseShape {
  gain: number;
  threshold: number;
  max: number;
  decay: number;
}

export type ResponseDef =
  | { kind: "none" }
  | ({ kind: "emit"; energy: number; pitch: number } & ResponseShape)
  | ({ kind: "push" } & ResponseShape);

export const RESPONSE_KINDS = ["none", "emit", "push"] as const;

export interface StrainDef {
  /** Strain added per tick per unit of response output. */
  build: number;
  /** Strain removed per tick (always on; an element at rest recovers). */
  recover: number;
  /** At or above this, the element degrades. */
  max: number;
  /** 0..1: how much strain weakens the response (1 = output falls to 0 at max strain). */
  fatigue: number;
}

export interface ElementDef {
  id: string;
  /** 1-based; cell value 0 means empty. */
  index: number;
  name: string;
  color: string;
  mass: number;
  /** blocks[energyIndex] is true if this element stops that energy. */
  blocks: boolean[];
  trigger: TriggerDef;
  response: ResponseDef;
  strain: StrainDef;
  /** Element index the cell turns into when it degrades; 0 = it crumbles away. */
  degradesTo: number;
}

export interface RuleSet {
  version: string;
  description: string;
  world: WorldParams;
  energies: EnergyDef[];
  energyIndex: Record<string, number>;
  /** elements[0] is a placeholder for "empty"; real elements start at 1. */
  elements: ElementDef[];
  elementIndex: Record<string, number>;
}

export class RulesError extends Error {
  constructor(path: string, message: string) {
    super(`rules${path}: ${message}`);
    this.name = "RulesError";
  }
}

type Json = unknown;

function isObject(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function obj(v: Json, path: string): Record<string, Json> {
  if (!isObject(v)) throw new RulesError(path, "expected an object");
  return v;
}

function num(o: Record<string, Json>, key: string, path: string, opts: { min?: number; max?: number; def?: number } = {}): number {
  const v = o[key];
  if (v === undefined && opts.def !== undefined) return opts.def;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new RulesError(`${path}.${key}`, "expected a finite number");
  if (opts.min !== undefined && v < opts.min) throw new RulesError(`${path}.${key}`, `must be >= ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) throw new RulesError(`${path}.${key}`, `must be <= ${opts.max}`);
  return v;
}

function str(o: Record<string, Json>, key: string, path: string, def?: string): string {
  const v = o[key];
  if (v === undefined && def !== undefined) return def;
  if (typeof v !== "string") throw new RulesError(`${path}.${key}`, "expected a string");
  return v;
}

function oneOf<T extends string>(v: string, allowed: readonly T[], path: string): T {
  if (!(allowed as readonly string[]).includes(v)) {
    throw new RulesError(path, `must be one of ${allowed.join(", ")} (got "${v}")`);
  }
  return v as T;
}

function rejectUnknownKeys(o: Record<string, Json>, allowed: string[], path: string): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) throw new RulesError(`${path}.${k}`, `unknown key (allowed: ${allowed.join(", ")})`);
  }
}

function parseWorld(v: Json): WorldParams {
  const o = obj(v, ".world");
  rejectUnknownKeys(o, ["gravity", "maxSpeed", "airDrag", "friction", "restitution", "minImpact", "impactStrain"], ".world");
  return {
    gravity: num(o, "gravity", ".world", { min: 0 }),
    maxSpeed: num(o, "maxSpeed", ".world", { min: 0 }),
    airDrag: num(o, "airDrag", ".world", { min: 0, max: 1 }),
    friction: num(o, "friction", ".world", { min: 0 }),
    restitution: num(o, "restitution", ".world", { min: 0, max: 1 }),
    minImpact: num(o, "minImpact", ".world", { min: 0 }),
    impactStrain: num(o, "impactStrain", ".world", { min: 0 }),
  };
}

function parseEffects(v: Json, path: string, directional: boolean): EnergyEffects {
  const o = v === undefined ? {} : obj(v, path);
  rejectUnknownKeys(o, ["strain", "push", "shake", "loosen"], path);
  const shakeO = o.shake === undefined ? {} : obj(o.shake, `${path}.shake`);
  rejectUnknownKeys(shakeO, ["strength", "threshold", "maxMass"], `${path}.shake`);
  const loosenO = o.loosen === undefined ? {} : obj(o.loosen, `${path}.loosen`);
  rejectUnknownKeys(loosenO, ["threshold", "maxMass"], `${path}.loosen`);
  const push = num(o, "push", path, { min: 0, def: 0 });
  if (push > 0 && !directional) throw new RulesError(`${path}.push`, "only energies with a direction (radial, ray) can push");
  let loosenThreshold: number | null = null;
  if (loosenO.threshold !== undefined && loosenO.threshold !== null) {
    loosenThreshold = num(loosenO, "threshold", `${path}.loosen`, { min: 0 });
  }
  return {
    strain: num(o, "strain", path, { min: 0, def: 0 }),
    push,
    shake: {
      strength: num(shakeO, "strength", `${path}.shake`, { min: 0, def: 0 }),
      threshold: num(shakeO, "threshold", `${path}.shake`, { min: 0, def: 0 }),
      maxMass: num(shakeO, "maxMass", `${path}.shake`, { min: 0, def: 0 }),
    },
    loosen: {
      threshold: loosenThreshold,
      maxMass: num(loosenO, "maxMass", `${path}.loosen`, { min: 0, def: 0 }),
    },
  };
}

function parseEnergy(id: string, index: number, v: Json): EnergyDef {
  const path = `.energies.${id}`;
  const o = obj(v, path);
  rejectUnknownKeys(o, ["name", "spread", "range", "conductivity", "loss", "effects"], path);
  const spread = oneOf(str(o, "spread", path), SPREAD_KINDS, `${path}.spread`);
  const directional = isDirectional(spread);
  const needsRange = spread !== "diffusion";
  const range = needsRange ? num(o, "range", path, { min: 1, max: 256 }) : 0;
  if (needsRange && !Number.isInteger(range)) throw new RulesError(`${path}.range`, "must be a whole number of cells");
  const conductivity = spread === "diffusion" ? num(o, "conductivity", path, { min: 0, max: 0.25 }) : 0;
  const loss = spread === "diffusion" ? num(o, "loss", path, { min: 0, max: 1 }) : 0;
  return {
    id,
    index,
    name: str(o, "name", path, id),
    spread,
    directional,
    range,
    conductivity,
    loss,
    effects: parseEffects(o.effects, `${path}.effects`, directional),
  };
}

function energyRef(v: Json, path: string, energyIndex: Record<string, number>): number {
  if (typeof v !== "string") throw new RulesError(path, "expected an energy id");
  const i = energyIndex[v];
  if (i === undefined) throw new RulesError(path, `unknown energy "${v}"`);
  return i;
}

function parseTrigger(v: Json, path: string, energyIndex: Record<string, number>): TriggerDef {
  const o = obj(v, path);
  const kind = oneOf(str(o, "kind", path), TRIGGER_KINDS, `${path}.kind`);
  if (kind === "exposure") {
    rejectUnknownKeys(o, ["kind", "energy"], path);
    return { kind, energy: energyRef(o.energy, `${path}.energy`, energyIndex) };
  }
  rejectUnknownKeys(o, ["kind"], path);
  return { kind };
}

function parseResponse(v: Json, path: string, energyIndex: Record<string, number>): ResponseDef {
  const o = obj(v, path);
  const kind = oneOf(str(o, "kind", path), RESPONSE_KINDS, `${path}.kind`);
  if (kind === "none") {
    rejectUnknownKeys(o, ["kind"], path);
    return { kind };
  }
  const shape: ResponseShape = {
    gain: num(o, "gain", path, { min: 0 }),
    threshold: num(o, "threshold", path, { min: 0, def: 0 }),
    max: num(o, "max", path, { min: 0 }),
    decay: num(o, "decay", path, { min: 0, max: 0.999, def: 0 }),
  };
  if (kind === "emit") {
    rejectUnknownKeys(o, ["kind", "energy", "gain", "threshold", "max", "decay", "pitch"], path);
    return { kind, energy: energyRef(o.energy, `${path}.energy`, energyIndex), pitch: num(o, "pitch", path, { min: 0, def: 0 }), ...shape };
  }
  rejectUnknownKeys(o, ["kind", "gain", "threshold", "max", "decay"], path);
  return { kind, ...shape };
}

function parseStrain(v: Json, path: string): StrainDef {
  const o = obj(v, path);
  rejectUnknownKeys(o, ["build", "recover", "max", "fatigue"], path);
  return {
    build: num(o, "build", path, { min: 0 }),
    recover: num(o, "recover", path, { min: 0 }),
    max: num(o, "max", path, { min: Number.MIN_VALUE }),
    fatigue: num(o, "fatigue", path, { min: 0, max: 1, def: 0 }),
  };
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate plain JSON (e.g. the parsed contents of rules/v0.json) and return a
 * typed, index-resolved RuleSet. Throws RulesError with a path on any problem.
 */
export function loadRules(json: unknown): RuleSet {
  const root = obj(json, "");
  rejectUnknownKeys(root, ["version", "description", "world", "energies", "elements"], "");
  const version = str(root, "version", "");
  const description = str(root, "description", "", "");
  const world = parseWorld(root.world);

  const energiesO = obj(root.energies, ".energies");
  const energyIds = Object.keys(energiesO);
  if (energyIds.length === 0) throw new RulesError(".energies", "needs at least one energy");
  const energyIndex: Record<string, number> = {};
  energyIds.forEach((id, i) => (energyIndex[id] = i));
  const energies = energyIds.map((id, i) => parseEnergy(id, i, energiesO[id]));

  const elementsO = obj(root.elements, ".elements");
  const elementIds = Object.keys(elementsO);
  if (elementIds.length === 0) throw new RulesError(".elements", "needs at least one element");
  if (elementIds.length > 254) throw new RulesError(".elements", "at most 254 elements");
  const elementIndex: Record<string, number> = {};
  elementIds.forEach((id, i) => (elementIndex[id] = i + 1));

  const placeholder: ElementDef = {
    id: "",
    index: 0,
    name: "Empty",
    color: "#000000",
    mass: 0,
    blocks: energies.map(() => false),
    trigger: { kind: "none" },
    response: { kind: "none" },
    strain: { build: 0, recover: 0, max: Infinity, fatigue: 0 },
    degradesTo: 0,
  };

  const elements: ElementDef[] = [placeholder];
  for (const id of elementIds) {
    const path = `.elements.${id}`;
    const o = obj(elementsO[id], path);
    rejectUnknownKeys(o, ["name", "color", "mass", "blocks", "trigger", "response", "strain", "degradesTo"], path);
    const color = str(o, "color", path);
    if (!COLOR_RE.test(color)) throw new RulesError(`${path}.color`, "expected #rrggbb");
    const blocksRaw = o.blocks ?? [];
    if (!Array.isArray(blocksRaw)) throw new RulesError(`${path}.blocks`, "expected a list of energy ids");
    const blocks = energies.map(() => false);
    blocksRaw.forEach((b, i) => (blocks[energyRef(b, `${path}.blocks[${i}]`, energyIndex)] = true));
    const trigger = parseTrigger(o.trigger, `${path}.trigger`, energyIndex);
    const response = parseResponse(o.response, `${path}.response`, energyIndex);
    if (response.kind === "push") {
      if (trigger.kind !== "exposure" || !energies[trigger.energy].directional) {
        throw new RulesError(`${path}.response`, "a push response needs an exposure trigger on an energy with a direction (radial or ray)");
      }
    }
    if (response.kind !== "none" && trigger.kind === "none") {
      throw new RulesError(`${path}.response`, "an element with a response needs a trigger");
    }
    let degradesTo = 0;
    if (o.degradesTo !== undefined && o.degradesTo !== null) {
      if (typeof o.degradesTo !== "string" || elementIndex[o.degradesTo] === undefined) {
        throw new RulesError(`${path}.degradesTo`, "expected null or an element id");
      }
      degradesTo = elementIndex[o.degradesTo];
    }
    elements.push({
      id,
      index: elementIndex[id],
      name: str(o, "name", path, id),
      color,
      mass: num(o, "mass", path, { min: Number.MIN_VALUE }),
      blocks,
      trigger,
      response,
      strain: parseStrain(o.strain, `${path}.strain`),
      degradesTo,
    });
  }

  return { version, description, world, energies, energyIndex, elements, elementIndex };
}

/** Deep copy of plain rules JSON, handy for tests and sweeps that tweak one value. */
export function cloneRulesJson<T>(json: T): T {
  return JSON.parse(JSON.stringify(json)) as T;
}

// Guards for GAME_OVERVIEW.md section 11.
// 11.1: no code or data in the core may special-case a machine, so the core and
//       the rules data must not even mention one by name.
// 11.4: no Math.random in the core (determinism).
// 11.5: the core stays headless: it imports nothing from outside src/core.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const coreFiles = walk(join(ROOT, "src/core"));
const ruleFiles = walk(join(ROOT, "rules"));

/** Names of machines and contraptions from GAME_OVERVIEW.md sections 6 and 7. */
export const MACHINE_NAMES = [
  "bouncer",
  "buzzer",
  "runaway",
  "latch",
  "light link",
  "light switch",
  "invisible energy",
  "pulse circuit",
  "hammer",
  "furnace",
  "strobe",
  "relay",
  "domino",
  "dominoes",
  "cart",
  "delay line",
  "clock",
  "lamp",
  "limiter",
];

function machineMentions(text: string): string[] {
  const hits: string[] = [];
  for (const name of MACHINE_NAMES) {
    const pattern = name.split(" ").join("[\\s_-]*");
    const re = new RegExp(`(^|[^a-z])${pattern}s?([^a-z]|$)`, "i");
    if (re.test(text)) hits.push(name);
  }
  return hits;
}

describe("guard: no special-casing in the core", () => {
  it("finds core and rules files to scan", () => {
    expect(coreFiles.length).toBeGreaterThan(0);
    expect(ruleFiles.length).toBeGreaterThan(0);
  });

  it("the detector itself catches a planted name", () => {
    expect(machineMentions("const isBouncer = true")).toEqual([]); // camelCase glued words are a known blind spot...
    expect(machineMentions("// handle the bouncer here")).toEqual(["bouncer"]);
    expect(machineMentions("light_switch")).toEqual(["light switch"]);
    expect(machineMentions("Latch")).toEqual(["latch"]);
  });

  for (const file of [...coreFiles, ...ruleFiles]) {
    const rel = relative(ROOT, file);
    it(`${rel} mentions no machine`, () => {
      const text = readFileSync(file, "utf8");
      // ...so also scan with camelCase split into words.
      const split = text.replace(/([a-z])([A-Z])/g, "$1 $2");
      expect([...new Set([...machineMentions(text), ...machineMentions(split)])]).toEqual([]);
    });
  }
});

describe("guard: determinism and headlessness of the core", () => {
  for (const file of coreFiles.filter((f) => f.endsWith(".ts"))) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    it(`${rel} does not use Math.random or wall-clock time`, () => {
      expect(text).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\(/);
    });
    it(`${rel} imports only from inside src/core`, () => {
      const imports = [...text.matchAll(/(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec.startsWith("."), `${rel} imports package "${spec}"`).toBe(true);
        const target = resolve(dirname(file), spec);
        expect(relative(join(ROOT, "src/core"), target).startsWith(".."), `${rel} imports ${spec} from outside the core`).toBe(false);
      }
    });
  }
});

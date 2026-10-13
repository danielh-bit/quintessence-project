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
  "cart",
  "delay line",
  "clock",
  "lamp",
  "limiter",
  "timer",
];

/** Text as words: camelCase and acronyms split, comment markers and JSON escapes neutralised. */
function normalise(text: string): string {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\/\*+|\*+\/|^\s*\*\s?|\/\//gm, " ")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function machineMentions(text: string): string[] {
  const words = normalise(text);
  const hits: string[] = [];
  for (const name of MACHINE_NAMES) {
    // Words may be separated by spaces, line breaks (comments wrapped), underscores or hyphens.
    const pattern = name.split(" ").join("[\\s_-]+");
    const re = new RegExp(`(^|[^a-z])${pattern}(e?s|ed|ing)?([^a-z]|$)`, "i");
    if (re.test(words)) hits.push(name);
  }
  return hits;
}

/** Source without comments (for checks on code only). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

describe("guard: no special-casing in the core", () => {
  it("finds core and rules files to scan", () => {
    expect(coreFiles.length).toBeGreaterThan(0);
    expect(ruleFiles.length).toBeGreaterThan(0);
  });

  it("the detector itself catches planted names in their many forms", () => {
    expect(machineMentions("// handle the bouncer here")).toEqual(["bouncer"]);
    expect(machineMentions("const isBouncer = true")).toEqual(["bouncer"]);
    expect(machineMentions("const HTTPBouncer = 1")).toEqual(["bouncer"]);
    expect(machineMentions("light_switch")).toEqual(["light switch"]);
    expect(machineMentions("Latch")).toEqual(["latch"]);
    expect(machineMentions("latches and relaying")).toEqual(["latch", "relay"]);
    expect(machineMentions("// the light\n// link works")).toEqual(["light link"]);
    expect(machineMentions('{"name": "\\u0062ouncer"}')).toEqual(["bouncer"]);
    expect(machineMentions("one-shot timer")).toEqual(["timer"]);
    // ...but not inside unrelated words.
    expect(machineMentions("clamp(x); cartesian; relayout")).toEqual([]);
  });

  for (const file of [...coreFiles, ...ruleFiles]) {
    const rel = relative(ROOT, file);
    it(`${rel} mentions no machine`, () => {
      const text = readFileSync(file, "utf8");
      // JSON is also checked after parsing (escapes resolved), names included.
      const parsed = file.endsWith(".json") ? JSON.stringify(JSON.parse(text)) : "";
      expect([...new Set([...machineMentions(text), ...machineMentions(parsed)])]).toEqual([]);
    });
  }
});

describe("guard: determinism and headlessness of the core", () => {
  // Engine-dependent maths: results may differ between JS engines (co-op needs identical runs).
  const TRANSCENDENTAL = /Math\.(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|hypot|cbrt)\b/;
  const EXPONENT_OP = /[\w)\]]\s*\*\*\s*[\w(]/;
  const RANDOM = /Math\.random|Math\s*\[|\{[^}]*\}\s*=\s*Math\b|Date\.now|performance\.now|new Date\(|\bDate\s*\(/;

  it("the code checks catch planted problems", () => {
    expect(TRANSCENDENTAL.test("const y = Math.pow(a, 2)")).toBe(true);
    expect(EXPONENT_OP.test(stripComments("const y = a ** 2"))).toBe(true);
    expect(EXPONENT_OP.test(stripComments("/** doc */ const y = a * 2"))).toBe(false);
    expect(RANDOM.test('const r = Math["random"]()')).toBe(true);
    expect(RANDOM.test("const { random } = Math")).toBe(true);
    expect(RANDOM.test("const t = Date()")).toBe(true);
  });

  for (const file of coreFiles.filter((f) => f.endsWith(".ts"))) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    const code = stripComments(text);
    it(`${rel} does not use randomness, wall-clock time or engine-dependent maths`, () => {
      expect(code).not.toMatch(RANDOM);
      expect(code).not.toMatch(TRANSCENDENTAL);
      expect(code).not.toMatch(EXPONENT_OP);
    });
    it(`${rel} imports only from inside src/core`, () => {
      const specs = [
        ...code.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g),
        ...code.matchAll(/import\s*['"]([^'"]+)['"]/g),
        ...code.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g),
      ].map((m) => m[1]);
      expect(/import\s*\(\s*[^'"\s]/.test(code), `${rel} has a dynamic import of a computed path`).toBe(false);
      for (const spec of specs) {
        expect(spec.startsWith("."), `${rel} imports package "${spec}"`).toBe(true);
        const target = resolve(dirname(file), spec);
        expect(relative(join(ROOT, "src/core"), target).startsWith(".."), `${rel} imports ${spec} from outside the core`).toBe(false);
      }
    });
  }
});

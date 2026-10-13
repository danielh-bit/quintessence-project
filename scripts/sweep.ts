// Headless parameter sweeps for tuning. Usage:
//   npx tsx scripts/sweep.ts bouncer 'elements.bormite.response.gain=0.002,0.003,0.004' shaft=6,10,16 ticks=3000
// Each "path=values" with a dotted path patches rules/v0.json; plain "name=values" are scenario params.
// Prints, for every combination, the pulse statistics of a probe chosen per scenario.
import v0 from "../rules/v0.json";
import { cloneRulesJson, loadRules, type World } from "../src/core";
import { scenarioById } from "../src/scenarios";
import { period, risingEdges } from "../tests/helpers/measure";

const [id, ...rest] = process.argv.slice(2);
const s = scenarioById(id);
if (!s) throw new Error(`no scenario ${id}`);
const axes: Array<{ key: string; values: number[]; rule: boolean }> = [];
let ticks = 3000;
for (const r of rest) {
  const [k, v] = r.split("=");
  if (k === "ticks") {
    ticks = Number(v);
    continue;
  }
  axes.push({ key: k, values: v.split(",").map(Number), rule: k.includes(".") });
}

function setPath(obj: any, path: string, value: number) {
  const parts = path.split(".");
  let o = obj;
  for (const p of parts.slice(0, -1)) o = o[p];
  o[parts[parts.length - 1]] = value;
}

/** Output of the first cell of an element, every tick. */
function trace(w: World, element: string, n: number): number[] {
  const el = w.rules.elementIndex[element];
  const out: number[] = [];
  for (let t = 0; t < n; t++) {
    w.step();
    let v = 0;
    for (let i = 0; i < w.size; i++) if (w.elem[i] === el && w.output[i] > v) v = w.output[i];
    out.push(v);
  }
  return out;
}

const probe: Record<string, string> = { bouncer: "queflair", buzzer: "galog" };

function* combos(i: number, acc: Record<string, number>): Generator<Record<string, number>> {
  if (i === axes.length) {
    yield { ...acc };
    return;
  }
  for (const v of axes[i].values) yield* combos(i + 1, { ...acc, [axes[i].key]: v });
}

for (const c of combos(0, {})) {
  const json = cloneRulesJson(v0) as any;
  const params: Record<string, number> = {};
  for (const a of axes) {
    if (a.rule) setPath(json, a.key, c[a.key]);
    else params[a.key] = c[a.key];
  }
  const w = s.build(loadRules(json), params);
  const tr = trace(w, probe[id] ?? "queflair", ticks);
  const edges = risingEdges(tr, 1);
  const p = period(edges);
  const last = edges[edges.length - 1] ?? -1;
  console.log(
    `${Object.entries(c).map(([k, v]) => `${k.split(".").slice(-3).join(".")}=${v}`).join(" ")}  pulses=${p.count} period=${p.period.toFixed(1)} cv=${p.cv.toFixed(3)} lastPulse=${last}`,
  );
}

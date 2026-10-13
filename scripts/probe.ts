// Ad-hoc probe: run a scenario headless and print traces. Usage:
//   npx tsx scripts/probe.ts bouncer shaft=10 weight=0 ticks=600
import v0 from "../rules/v0.json";
import { loadRules } from "../src/core";
import { scenarioById } from "../src/scenarios";

const [id, ...rest] = process.argv.slice(2);
const args: Record<string, number> = {};
for (const r of rest) {
  const [k, v] = r.split("=");
  args[k] = Number(v);
}
const s = scenarioById(id);
if (!s) throw new Error(`no scenario ${id}`);
const rules = loadRules(v0);
const w = s.build(rules, args);
const ticks = args.ticks ?? 400;
const every = args.every ?? 1;
const bormite = rules.elementIndex.bormite;
for (let t = 0; t < ticks; t++) {
  w.step();
  if (t % every) continue;
  const cells: string[] = [];
  for (let i = 0; i < w.size; i++) {
    const out = w.output[i];
    if (out > 0) cells.push(`${rules.elements[w.elem[i]].id}@${w.xOf(i)},${w.yOf(i)}=${out.toFixed(2)}`);
  }
  const bs = [...w.bodies.values()].filter((b) => b.cells.some((c) => w.elem[c] === bormite));
  const bstr = bs.map((b) => `y=${w.yOf(b.cells[b.cells.length - 1])}${b.oy >= 0 ? "+" : ""}${b.oy.toFixed(2)} vy=${b.vy.toFixed(3)}`).join(" ");
  const ev = w.events.map((e) => `${e.kind}:${rules.elements[e.element].id}@${e.x},${e.y}`).join(" ");
  console.log(`${w.tick} ${bstr} | ${cells.join(" ")} ${ev}`);
}

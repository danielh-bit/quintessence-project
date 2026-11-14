// Headless measurement of how far loose dust travels from a loaded source.
// Usage:
//   npx tsx scripts/drift.ts 'world.airDrag=0,0.005,0.01' 'elements.bormite.mass=0.2,0.5' stones=1,3 ticks=1500
// Each "path=values" with a dotted path patches rules/v0.json; "stones" is the
// pile on the source. Prints, per combination, the dust's top speed and how
// far from the source each speck ends up.
import v0 from "../rules/v0.json";
import { cloneRulesJson, loadRules, World } from "../src/core";

const axes: Array<{ key: string; values: number[] }> = [];
let ticks = 1500;
let source = "galog";
let pile = "lobime";
let dust = "bormite";
for (const r of process.argv.slice(2)) {
  const [k, v] = r.split("=");
  if (k === "ticks") ticks = Number(v);
  else if (k === "source") source = v;
  else if (k === "pile") pile = v;
  else if (k === "dust") dust = v;
  else axes.push({ key: k, values: v.split(",").map(Number) });
}

function setPath(obj: any, path: string, value: number) {
  const parts = path.split(".");
  let o = obj;
  for (const p of parts.slice(0, -1)) o = o[p];
  o[parts[parts.length - 1]] = value;
}

function* combos(i: number, acc: Record<string, number>): Generator<Record<string, number>> {
  if (i === axes.length) {
    yield { ...acc };
    return;
  }
  for (const v of axes[i].values) yield* combos(i + 1, { ...acc, [axes[i].key]: v });
}

for (const c of combos(0, {})) {
  const json = cloneRulesJson(v0) as any;
  let stones = 3;
  for (const a of axes) {
    if (a.key === "stones") stones = c[a.key];
    else setPath(json, a.key, c[a.key]);
  }
  const w = new World(loadRules(json), 400, 24);
  const fy = w.height - 1;
  for (let x = 0; x < w.width; x++) w.place(x, fy, "hard_rock", { anchored: true });
  const gx = 40;
  w.place(gx, fy, source, { anchored: true });
  for (let k = 1; k <= stones; k++) w.place(gx, fy - k, pile);
  const starts = [gx + 2, gx + 3, gx + 4];
  for (const x of starts) w.place(x, fy - 1, dust);
  let top = 0;
  for (let t = 0; t < ticks; t++) {
    w.step();
    for (const b of w.bodies.values()) {
      if (w.rules.elements[w.elem[b.cells[0]]].id !== dust) continue;
      const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (s > top) top = s;
    }
  }
  const ends = w.find(dust).map(([x]) => x - gx);
  const moving = [...w.bodies.values()].some((b) => b.vx !== 0 || b.vy !== 0);
  console.log(
    `${Object.entries(c).map(([k, v]) => `${k.split(".").slice(-2).join(".")}=${v}`).join(" ")}  topSpeed=${top.toFixed(2)} endDistance=[${ends.join(", ")}]${moving ? " (still moving)" : ""}`,
  );
}

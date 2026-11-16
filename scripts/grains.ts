// Measurements for the grain engine (docs/TUNING.md). Usage:
//   npx tsx scripts/grains.ts            all measurements with the default grain numbers
//   npx tsx scripts/grains.ts size=4     with another block size (or chip=, dustFall=, dustMobility=)
import v0 from "../rules/v0.json";
import playerJson from "../data/player.json";
import { readFileSync } from "node:fs";
import { cloneRulesJson, loadRules, World, type RuleSet } from "../src/core";
import { Game, input, loadActorConfig, loadMap, parseMapText } from "../src/game";
import { SCENARIOS } from "../src/scenarios";

const params: Record<string, number> = { size: 8, chip: 0.25, crumbleBelow: 0.25, dustFall: 0.1, dustMobility: 0.25 };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split("=");
  params[k] = Number(v);
}
const json = cloneRulesJson(v0) as any;
json.world.grains = params;
const RG: RuleSet = loadRules(json);
const R0: RuleSet = loadRules(v0);
const P = loadActorConfig(playerJson);
console.log("grains:", JSON.stringify(params));

function floor(w: World) {
  for (let x = 0; x < w.width; x++) w.place(x, w.height - 1, "hard_rock", { anchored: true });
}

// 1. The sandbox machines, with and without grains: identical?
{
  let same = 0;
  for (const s of SCENARIOS) {
    const a = s.build(RG);
    const b = s.build(R0);
    a.run(3000);
    b.run(3000);
    const eq = JSON.stringify([...a.elem]) === JSON.stringify([...b.elem]) && JSON.stringify([...a.strain]) === JSON.stringify([...b.strain]) && a.grains!.cells.length === 0;
    if (eq) same++;
    else console.log("  differs:", s.id);
  }
  console.log(`machines: ${same} of ${SCENARIOS.length} scenarios run identically with grains on (3000 ticks, no chips, no dust)`);
}

// 2. Dust drift: three small heaps of Bormite dust 2, 3 and 4 blocks from a loaded Galog.
for (const stones of [1, 3]) {
  const w = new World(RG, 120, 24);
  floor(w);
  const g = w.grains!;
  const fy = w.height - 1;
  const gx = 40;
  w.place(gx, fy, "galog", { anchored: true });
  for (let k = 1; k <= stones; k++) w.place(gx, fy - k, "lobime");
  const bormite = RG.elementIndex.bormite;
  for (const bx of [gx + 2, gx + 3, gx + 4]) {
    for (let k = 0; k < 16; k++) g.addDust(bx * g.n + 2 + (k % 4), (fy - 1) * g.n + g.n - 1 - Math.floor(k / 4), bormite);
  }
  const where = () => g.cells.map((f) => (f % g.fw) / g.n - gx - 0.5);
  let fastest = 0;
  let settled = -1;
  let before = where().sort((a, b) => a - b);
  for (let t = 0; t < 3000; t++) {
    w.step();
    if (t % 20 === 19) {
      const now = where().sort((a, b) => a - b);
      let moved = 0;
      for (let k = 0; k < now.length; k++) moved = Math.max(moved, Math.abs(now[k] - before[k]) / 20);
      fastest = Math.max(fastest, moved);
      if (moved === 0 && settled < 0) settled = t;
      if (moved !== 0) settled = -1;
      before = now;
    }
  }
  const d = where();
  console.log(
    `dust drift, ${stones} stone(s): ends ${Math.min(...d).toFixed(1)} to ${Math.max(...d).toFixed(1)} blocks from the Galog (mean ${(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1)}), fastest ${fastest.toFixed(3)} blocks/tick, ${settled < 0 ? "still moving" : "at rest from tick " + settled}`,
  );
}

// 3. Chipping with the pick: swings and ticks to clear a block of each element.
{
  const out: string[] = [];
  for (const el of ["bormite", "queflair", "ralgen", "lobime", "galog", "exgen", "hard_rock", "dense_lobime"]) {
    const w = new World(RG, 40, 20);
    floor(w);
    const fy = w.height - 1;
    for (let y = fy - 6; y < fy; y++) for (let x = 14; x < 18; x++) w.place(x, y, el, { anchored: true });
    const game = Game.create(w, P, 11, fy - 4);
    let swings = 0;
    let chips = 0;
    let gone = -1;
    for (let t = 0; t < 3000 && gone < 0; t++) {
      game.step(input({ swing: { x: 14, y: fy - 2 } }));
      if (game.events.some((e) => e.kind === "swing")) swings++;
      if (w.events.some((e) => e.kind === "loosen")) chips++;
      if (w.elementAt(14, fy - 2) === null) gone = t;
    }
    out.push(gone < 0 ? `${el}: never (${swings} swings)` : `${el}: ${swings} swings, ${chips} chips, ${gone} ticks, ${game.pack.grains!.countDust()} grains in the pack`);
  }
  console.log("chipping a block with the pick:\n  " + out.join("\n  "));
}

// 4. A chipped block emits in proportion to what is left.
{
  const out: string[] = [];
  for (const chips of [0, 1, 2]) {
    const w = new World(RG, 20, 12);
    floor(w);
    const fy = w.height - 1;
    w.place(8, fy, "galog", { anchored: true });
    w.place(8, fy - 1, "lobime");
    for (let k = 0; k < chips; k++) w.grains!.chip(w.idx(8, fy), 16);
    // Sweep the chips' dust away so only the block is measured.
    for (const f of [...w.grains!.cells]) w.grains!.removeDust(f);
    w.run(10);
    out.push(`${w.grains!.fill[w.idx(8, fy)].toFixed(2)} left -> output ${w.inspect(8, fy)!.output.toFixed(1)}`);
  }
  console.log("a chipped Galog under one stone: " + out.join("; "));
}

// 5. Speed on the crash-site map.
{
  const text = readFileSync(new URL("../maps/crash-site.txt", import.meta.url), "utf8");
  for (const [label, rules] of [["without grains", R0], ["with grains", RG]] as const) {
    const { game } = loadMap(rules, P, parseMapText(text));
    const g: Game = game;
    const gr = g.world.grains;
    if (gr) {
      // A few thousand grains of dust lying about and falling, of several elements.
      const els = ["lobime", "bormite", "queflair", "galog"].map((e) => rules.elementIndex[e]);
      let k = 0;
      for (let fy = 0; fy < 20 * gr.n && k < 4000; fy += 3) for (let fx = 30 * gr.n; fx < 110 * gr.n && k < 4000; fx += 7) if (gr.free(fx, fy)) gr.addDust(fx, fy, els[k++ % els.length]);
    }
    for (let t = 0; t < 120; t++) g.step(input({ move: 1 }));
    const t0 = performance.now();
    const N = 300;
    for (let t = 0; t < N; t++) g.step(input({ move: t % 200 < 100 ? 1 : -1, jump: t % 40 === 0 }));
    const ms = (performance.now() - t0) / N;
    console.log(`speed, crash site ${g.world.width}x${g.world.height} ${label}${gr ? ` (${gr.cells.length} grains of dust)` : ""}: ${ms.toFixed(2)} ms per tick = ${(1000 / ms).toFixed(0)} ticks per second`);
  }
}

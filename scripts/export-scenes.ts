// Write every scenario (with default parameters) to scenes/<id>.json, so each
// can also be opened with the sandbox's Load button or shared as a file.
//   npx tsx scripts/export-scenes.ts
import { mkdirSync, writeFileSync } from "node:fs";
import v0 from "../rules/v0.json";
import { loadRules, saveScene } from "../src/core";
import { SCENARIOS } from "../src/scenarios";

const rules = loadRules(v0);
mkdirSync("scenes", { recursive: true });
for (const s of SCENARIOS) {
  const scene = saveScene(s.build(rules), { name: s.name, description: s.description });
  writeFileSync(`scenes/${s.id}.json`, JSON.stringify(scene, null, 1) + "\n");
  console.log(`scenes/${s.id}.json  ${scene.width}x${scene.height}, ${scene.cells.length} cells`);
}

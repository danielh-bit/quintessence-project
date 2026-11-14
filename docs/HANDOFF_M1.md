# Milestone 1 hand-off: session A to session B

Session A built the headless simulation foundations for the crash site. Session B builds the game on top: rendering, controls, the map, audio and UI. Read `docs/MILESTONE_1_SPEC.md` first, then this, then `docs/SIMULATION.md` (sections "Outside actions", "Carried grids", "The game layer", "Decisions made in milestone 1").

State of the branch: `npm test` runs 242 tests, all passing, plus one deliberate `todo` (the drift question). `npm run typecheck` is clean.

## What is built

| Piece | Where | Notes |
| --- | --- | --- |
| Generic air drag | `src/core/motion.ts` | `world.airDrag`, mass-dependent. **Off (0).** |
| Outside actions | `src/core/world.ts` | `push`, `kick`, `strike`, `takeCell`, `attach`, `refreshSupport`. |
| Carried grids | `src/core/carried.ts` | A grid riding on a body: motion, mass, forces, energies, matter. |
| Shock and grip | `src/core/responses.ts`, `rules/v0.json` | Impacts knock anchored cells loose. |
| New elements | `rules/v0.json` | `shell` (the body), `weave` (pack wall), `dense_lobime` (hull, pack divider). |
| The game layer | `src/game/` | `Game`, `Input`, `Recorder`, `replay`, `loadActorConfig`. |
| Player data | `data/player.json` | Body size, walking, jumping, reach, the pick, the pack's picture. |
| Scene format v2 | `src/core/scene.ts` | Stores carried grids. Version 1 scenes still load. |
| Tests | `tests/game/` | Body, pack, mining and placing, determinism, drift. |
| Guard | `tests/guard.test.ts` | Core and rules may not name the player, the pack or a machine. |
| Tools | `scripts/drift.ts` | Measures how far dust travels from a loaded source. |

The spec's core tests and where they are:

| Spec test | File |
| --- | --- |
| Standing on a Galog lights a nearby Queflair; stepping off stops it | `tests/game/body.test.ts` |
| Landing on an Exgen fires it; the burst grows with fall height | `tests/game/body.test.ts` |
| Colomium in the pack hums while walking, stops when standing | `tests/game/pack.test.ts` |
| A strong push in the pack cracks its walls and spills contents | `tests/game/pack.test.ts` |
| A soft cell breaks within a few swings; Hard Rock never | `tests/game/mining.test.ts` |
| Bormite dust drifts and stays within a few cells | `tests/game/drift.test.ts`: **passes only with the experimental flow limit on.** As the rules stand it is a `todo`. |
| A recorded input sequence replays exactly | `tests/game/determinism.test.ts` |
| The guard covers the player, the pack and machine names | `tests/guard.test.ts` |

## Interfaces to use

### Starting a game

```ts
import rulesJson from "../rules/v0.json";
import playerJson from "../data/player.json";
import { loadRules, World } from "./core";
import { Game, loadActorConfig, input } from "./game";

const rules = loadRules(rulesJson);
const config = loadActorConfig(playerJson);
const world = new World(rules, width, height);   // then fill it from the map
const game = Game.create(world, config, x, y);    // (x, y) = top-left cell of the body; the cells must be empty
game.step(input({ move: 1 }));                    // one tick
```

### Input

One `Input` per simulation tick. Build it from the keys and the mouse each tick and pass it to `game.step`. Never change the world any other way while playing: that is what keeps replay exact.

```ts
interface Input {
  move: -1 | 0 | 1;
  jump: boolean;
  swing: { x: number; y: number } | null;                               // world cell under the mouse
  place: { x: number; y: number; slotX: number; slotY: number } | null; // world cell, and the selected pack cell
}
```

- Aim is a whole-number world cell. `game.inReach(x, y)` says whether the hands reach it (for the cursor).
- An input that cannot be done is a no-op. `game.events` says what did happen in the last step: `swing`, `take`, `place`, each with the cell and the element id.
- The selected pack cell and whether the pack view is open are UI state. They are not inputs.
- `Recorder` and `replay` are there if you want to save and replay sessions.

### Reading the world (rendering and perception)

`game.world` is the map; `game.pack` is the pack. Both are `World`s with the same read API. Read only; never write.

| To draw or hear | Read |
| --- | --- |
| What is in a cell | `world.elem[i]` (0 = empty; otherwise an index into `world.rules.elements`, which has `id`, `name`, `color`), or `world.elementAt(x, y)`. `i = world.idx(x, y)`. |
| Smooth motion | `world.body[i]` is the body id (0 = anchored). `world.bodies.get(id)` has `ox`, `oy` (sub-cell offset, within half a cell), `vx`, `vy`. Draw a loose cell at `(x + ox, y + oy)`. |
| The player | `game.body()`, `game.bounds()` (top-left cell, width, height). Draw a sprite over it; the cells are element `shell`. |
| Light | `world.fieldAt("glow", x, y)`, or the whole array `world.field[rules.energyIndex.glow]`. |
| Heat | `world.fieldAt("heat", x, y)`. Only filled cells hold heat. |
| Hum (volume) | `world.fieldAt("hum", x, y)`. Hum exists only in filled cells. For what the player hears, take the loudest value over the body's cells and the cells under its feet. |
| Hum (pitch) | `world.pitch[rules.energyIndex.hum]![i]`. It is the speed of the humming Colomium. |
| How bright a glowing cell is | `world.output[i]` for an element whose response emits glow. |
| What just happened | `world.events` after each step: `degrade` (a cell crumbled or burnt out), `loosen` (a cell came loose), `transfer` (a cell spilled out of the pack into the world). `game.pack.events` has the pack's own. Each list is replaced on the next step. |
| The pack view | `game.pack` (7×5 with the starting layout), `game.isPackRoom(x, y)`, `game.config.pack.layout`. |

- **What happens in the pack reaches the world by itself.** Glow from the pack appears in `world`'s glow field around the player; hum from the pack is in the player's body cells and the ground under them. You do not need to mix the pack's fields into the world's.
- **Teta is never drawn** in the player's view (pillar 2). Its effects are.
- The sandbox's `src/ui/perception.ts` already turns fields into what a player would perceive. Reuse what fits.
- `world.inspect(x, y)` returns everything about a cell. It is for developer overlays and tests, not the player's view.

### Loading a map (to build: `src/game/map.ts`)

Not built. The seam I suggest:

```ts
loadMap(rules: RuleSet, config: ActorConfig, map: MapFile): Game

interface MapFile {
  rows: string[];                                               // one string per row, all the same length
  legend: Record<string, { element: string; loose?: boolean }>; // "." and " " are empty
  start: string;                                                // the character marking the body's top-left cell
  hatch?: string;                                               // the character marking the ship's hatch
}
```

- Keep the map as an editable data file (the spec prefers an ASCII map with a legend), e.g. `maps/crash-site.json`.
- For each character: `world.place(x, y, element, { anchored: !loose })`. Terrain is anchored; rubble, boulders and dust are loose.
- Then `Game.create(world, config, startX, startY)`. Return the hatch position alongside the game for the UI.
- Validate as `loadActorConfig` does: unknown characters and elements fail with a clear message.
- The world's edges are walls. Surround the map with terrain or leave air above it.
- `stamp` in `src/scenarios/builder.ts` does the same job for small pictures.
- The hull element is `dense_lobime`.

### Speed

One tick of a 320×120 map with a couple of dozen loose bodies takes about 1.3 ms in Node (480×160: 2.5 ms). The UI decides how many ticks to run per frame; the tick itself is fixed.

## Still to do from the spec (session B)

- The game as a second browser entry point; the sandbox stays as a developer tool.
- Rendering and the camera following the player.
- Controls: keyboard, mouse aim within reach, left click to swing, right click to place, the pack key, the hatch key.
- The crash-site map as a data file, and its loader.
- The ship built from real elements (hull: `dense_lobime`), the hatch, and the empty interior screen.
- Senses: darkness and light, heat shimmer and colour shift, hum through Web Audio with pitch and distance, dust jitter.
- The pack view and the selected-cell HUD.
- `CLAUDE.md`: how to run the game. (How to run the sandbox and the tests is already there.)
- The playtest checklist in `docs/ROADMAP.md`.

## Known issues and open points

**Needs a decision from the designer**

- **Bormite dust is flung, not drifting.** Mild drag and softer masses do not fix it. A flow limit on the push does, at a cost to the runaway engine and the unweighted buzzer. It is in the code as `elements.bormite.response.flow`, set to 0. `docs/TUNING.md` entries 9 and 13 have the numbers. Until it is decided, dust at the crash site will shoot away from the rubble pile.

**Things that follow from the rules and may surprise**

- **The pack is fragile around Bormite and strong Teta.** Bormite held against a wall by Teta strikes it every tick. Standing on a Galog is safe; dropping about 10 cells or more onto an Exgen with Bormite aboard cracks the wall and the Bormite leaves. These numbers depend on the drift decision.
- **Anything struck hard and often is dug out.** That includes anchored cells next to Bormite under strong Teta.
- **A swing at a loose cell takes it.** That includes a loose Exgen: it fires from the blow and goes on bursting inside the pack.
- **Bormite in the pack can lift the player** off a loaded Galog.
- **The empty pack weighs 17; the body weighs 12.** The Dense Lobime divider is most of it. A Galog under the player is loaded heavily.
- **Light from the pack leaves sideways.** The body blocks Glow, so the pack's two openings light the left and the right of the player, not above or below.
- **A Queflair at its cap burns out in about 2000 ticks,** and a loaded Galog tires. The crash-site scene will fade unless the map or the tuning allows for it.

**Limits of what is built**

- **The body is rigid and two cells wide.** It cannot step up a one-cell ledge without jumping (a jump clears about 3 cells). If walking over rough ground feels bad, an automatic small hop when walking into a low step belongs in `src/game` (the actor), using `kick`. It is not built.
- **Entering the ship is not modelled.** If the world keeps running while the player is inside and the body stays where it is, nothing is needed. If the body must leave the world, that has to be an `Input` field so replay stays exact.
- **The body cannot break in milestone 1.** If it ever did, `game.body()` returns undefined and inputs do nothing.
- **Only one-cell bodies leave the pack.** Nothing in milestone 1 makes bigger ones.
- **The hands share one cooldown** for swinging and placing.
- **The sandbox UI** was touched in one line (`src/ui/app.ts`, a count for the new `transfer` event). The three new elements are part of the rule set, so they show up wherever the sandbox lists its elements (not checked in a browser this session).

**One existing test was changed**

- `tests/core/rules.test.ts` pinned the number of elements at ten. It now checks that the ten section-6 elements are present, in order. No scenario test was changed.

## Do not change

- **Nothing in `src/core` or `rules/` may know the player, the pack or a machine.** The guard enforces the names; keep to the intent as well. Player behaviour belongs in `src/game`.
- **The core and the game layer stay headless and deterministic.** No DOM, no Node APIs, no `Math.random`, no wall-clock time, no `Math.exp`/`pow`/trig. The guard and `tsconfig.core.json` check this.
- **The world changes only through `game.step(input)`** while playing. Rendering and audio read; they never write.
- **Fixed tick.** Do not scale physics by frame time; run whole ticks.
- **No rule value changes without an entry in `docs/TUNING.md`,** and every sandbox scenario test must still pass afterwards. Do not edit the assertions of existing scenario tests to make them pass. If a machine stops emerging, stop and ask.
- **No property in the player's view** (pillar 2). Developer overlays stay off by default and out of the game.
- `data/player.json` is tuning data and is yours to adjust (walking, jumping, reach, pick cooldown). Changing the pick's `speed` or `focus`, or the pack's layout, changes the mining and pack tests' numbers: re-measure and log it.

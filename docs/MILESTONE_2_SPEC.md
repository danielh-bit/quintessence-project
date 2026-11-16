# Milestones 2 and 3: matter, and the lab

This is the design for the two milestones that follow the crash site. It records the decisions made with the designer after the milestone 1 playtest (`docs/ROADMAP.md`, "What the milestone 1 playtest showed"), and the questions still open. Read `GAME_OVERVIEW.md` first; the pillars and build rules are binding.

Milestone 2 starts with an engine spike. Its results are in `docs/TUNING.md` and decide how much of section 1 is built as written.

## 1. Matter: blocks made of grains (milestone 2)

**Decision: the block stays the unit the rules think in, and each block has fine structure inside.** Triggers, responses, energy ranges, the seven machines and their tuning stay in block units. A whole block behaves exactly as it does today.

A true grain-only world (every grain its own cell, energies spreading at grain resolution) was considered and set aside: it is a new engine, every number would be re-tuned from zero, and all seven machines would have to be made to emerge again.

| Thing | Rule |
| --- | --- |
| Grains | Each block is a small square of grains (8×8 to start). |
| Chipping | A blow removes the grains near where it lands. How many depends on the blow (closing speed × focus) and the element's grip. |
| A chipped block | Its mass and its response scale with the grains it has left: a Galog chipped to half emits half. Below a fraction set in data, what is left crumbles to dust. |
| Dust | Freed grains are real matter on the fine grid. They fall, pile and slide. |
| Dust reacts | Dust of an element responds as that element, in proportion to how much is there: Bormite dust is pushed by Teta, a heap of dust on a Galog loads it. |
| Dust drifts | A grain is light and slowed by the air, so it moves at a slow steady speed, while a solid Bormite piece in a bouncer stays ballistic. This is meant to settle the open question of dust being flung (`docs/TUNING.md`, entries 9 and 13) without touching the machines. |
| Fine solids | A loose piece can be smaller than a block and pieces meet at grain resolution, which gives room for fine setups. |

None of this names a machine, the player or the pack. Chipping is still an impact. Dust is still the element.

## 2. Samples and mining

Two acts with two results.

| Act | Tool | What you get | Keeps its wear? |
| --- | --- | --- | --- |
| **Mining** | The pick chips | Dust: an amount of the element | No. It is ground up. |
| **Sampling** | A corer cuts a piece out whole | An intact solid piece | Yes |

**Decision: bulk material put back into the world is always a solid chunk** of a size the player chooses. Dust exists as what chipping produces, not as something poured from the inventory.

Where things are kept, in the order the player gets them:

| Store | When | What it is |
| --- | --- | --- |
| **The pack** | From the start, and the only store | The live grid of milestone 1, now with grains. Chips land in it as live dust beside intact pieces. It is meant to be as chaotic as possible. |
| **Sample jars and more compartments** | First equipment | Small sealed live containers that keep one sample apart. Clear ones let you watch it; shielded ones silence it. |
| **Bulk hold** | Later equipment | A traditional inventory: an amount per element, inert while stored, still weighing on the player. |

## 3. The lab: field kit and bench (milestone 3)

**Decision: experimentation equipment comes before Lama, building, survival and the ship.** Two places to set up an experiment, both live grids run by the same rules and edited with sandbox-style tools, with different constraints. Both use only matter the player brought. There is no palette.

| | Field kit | Lab bench |
| --- | --- | --- |
| Where | Carried, set down anywhere | In the ship |
| Size | Small | Large |
| Isolation | Open: the world leaks in and out | Sealed by the hull: a controlled room |
| Stillness | Still only while set down | Always still |
| Tools | Place, remove, drop | Also pin in place, bond, reset |

- Both are carried grids of the core (`docs/SIMULATION.md`, "Carried grids"), like the pack.
- Every edit is an input to the simulation, so a recording still replays exactly.
- **No energy instruments.** Pillar 4: those are made from the world's own elements, and the first one is found by accident.

## 4. Pack view, HUD and atmosphere (milestone 3, presentation only)

- **The pack as equipment:** an opened satchel with material walls and visible compartments, its contents lit by their own glow, drawn by the same renderer as the world.
- **A live window instead of a slot:** a small always-visible miniature of the pack, since watching the pack was the most valuable part of the playtest. The full view opens over it.
- **Atmosphere:** an alien sky with distance, the wreck with smoke and sparks, drifting motes, haze in the caves, a quiet ambient sound bed.
- No number, label or bar about any element appears anywhere (pillar 2).

## 5. Open questions

- **How the corer works,** and when the player gets it. At the start there is only the pick, so the first intact pieces are what is already loose: rubble and boulders.
- **Does a block that is chipped through fall?** Terrain cannot collapse today. Chipping may force the question.
- **What grinding costs.** Dust loses its wear. Should dust also be weaker than a solid piece of the same amount, so that samples stay worth taking?
- **How the bulk hold stays inert** in the fiction, and whether the player builds it or finds it.
- **Whether the field kit can be carried while it holds a running experiment,** or only when emptied.

## 6. The spike that starts milestone 2

Headless, in two stages, before any gameplay is built on it.

1. **Grains inside fixed blocks:** a grain mask per block, chipping, responses and mass scaled by what is left, dust that falls, reacts and drifts. Solid pieces still move on the block grid.
2. **Fine solids:** pieces smaller than a block, meeting at grain resolution.

What it must show: every existing test passes unchanged while blocks are whole; the seven machines keep their periods; Bormite dust beside a loaded Galog moves slowly and stops within a few blocks; a block takes several swings and Hard Rock does not chip; a chipped block emits in proportion; the crash-site map runs well above 60 ticks per second; replay stays exact with dust in the world. For stage 2: either fine solids work at an acceptable cost, or a clear statement of what they cost and a cheaper alternative.

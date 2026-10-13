# Simulation model (rule set v0 sandbox)

This document explains how the headless core in `src/core` turns the rules in `rules/v0.json` into behaviour, and why each choice was made. The core never names an element, an energy or a machine. Everything it knows about the world's physics arrives as data and is addressed by index.

## Grid and cells

- The world is a 2D side view: `width × height` cells, with row 0 at the top. **+y points down**, the same way as gravity.
- A cell is empty or holds one element. Per-cell state is stored as parallel typed arrays ("channels").
  - State that belongs to the matter and **moves with it**: element, body id, strain, response output and pitch, impact, and the stored value of every *diffusion* energy (heat).
  - State **recomputed every tick**: load, the field of every non-diffusion energy and its direction, and response forces.
- The edges of the world act like walls of terrain.

## Bodies: anchored terrain, loose cells, bonded groups

- **Anchored** cells (body id 0) are terrain or built structure. They never move. They still take part in everything else: they emit, block, conduct, carry load, feel impacts, strain and degrade.
- Every **loose** cell belongs to a body with id ≥ 1. A body is a rigid group of cells that only translates. A single loose cell is a one-cell body. In the sandbox the *bond* tool joins touching loose cells into one body, e.g. "a weight with a Bormite underside" or a cart.
- A body has a velocity `(vx, vy)` in cells per tick, a sub-cell offset `(ox, oy)` in cells, and a mass equal to the sum of its cells' element masses from data.
- When a cell disappears (it was erased or crumbled away), its body is split into 4-connected parts. The part with the lowest cell index keeps the id; the others get new ids and the same motion.
- `body.cells` is always kept sorted. Iteration order is canonical, so a saved and restored world sums floats in the same order and continues identically.

## Gravity, support and friction

Each tick a support pass builds the *rests-on* graph: a body rests on whatever is directly below one of its cells. From that graph:

- **Supported**: the body rests on terrain, on the world floor, or on a body that is *resting*. This propagates upward from the terrain until nothing changes.
- **Resting**: supported, not moving up (`vy ≥ 0`), and not above its contact (`oy ≥ 0`).

When integrating velocity, a loose body gets acceleration `a = (0, g) + F/M`, where `F` is the sum of forces from responses and energy effects on its cells.

- For a **resting** body, a downward net acceleration is held by the support (normal force), so the vertical part is dropped. Coulomb friction `μ·normal` acts on the horizontal velocity, with static friction for pushes that are too small. A resting object therefore never "re-falls" a fraction of a cell each tick and never produces fake impacts.
- A body that is *not* resting falls freely and loses `airDrag` of its velocity per tick. A body moving up out of a contact feels gravity again at once.
- Speeds are capped per axis at `world.maxSpeed`.

## Movement, collisions and impacts

- The offset accumulates the velocity. Whenever `|offset| ≥ 0.5` on an axis, the body tries a one-cell step on the axis with the larger offset (y wins ties). A step succeeds only if **every** destination cell is empty or part of the same body, so nothing tunnels at any speed.
- **Contact.** If a body's velocity points into something it already touches, the collision happens at once, whatever the offset. Bodies don't creep into contact over several ticks.
- **Collision** (a blocked step) is one-dimensional, on that axis.
  - Against terrain or the world's edge, mass is infinite: the velocity becomes `−e·u`, where `e = world.restitution`. The default is 0, so **every bounce in the sandbox comes from Teta, not from elastic collisions**.
  - Against loose bodies, momentum is shared with the combined blocking bodies (1-D collision with restitution).
  - Pressing **down** on bodies that are resting counts as pressing on the ground. The pile doesn't give way, and the blow is passed down through the pile to the terrain. A stone dropped on a pile that sits on an Exgen is therefore felt by the Exgen. (Without this, a settled stack kept trading tiny bits of momentum forever.)
- **Impact** = the **closing speed** at contact (`|Δv|` along the axis). It is recorded on both cells of every contact pair, keeping the largest value per tick. Closing speeds below `world.minImpact` count as resting contact. Every impact adds `world.impactStrain × closing speed` of strain to both cells. This is a *generic* rule, not stated in §6: it is inferred from §7's "Hammer" route and from "every pick swing is an impact" (Hard Rock "reacts to nothing directly"). Set it to 0 to switch it off.
  - *Why speed and not momentum?* "A sudden change in motion" is a change of velocity, so an Exgen's burst depends on how fast something hits it, not how heavy it is. This also gives the clean regularity "burst size scales with speed" (§7 "Measure speed"), and it means extra weight makes a pushed payload slower rather than making the burst bigger.
- **Order.** Bodies move one at a time, leading ones first: they are sorted by the projection of their centre on their own direction of motion, with ties broken by id. The bottom of a falling stack moves before the top, and the top of a rising stack before the bottom.

## Weight resting on a cell (load)

`load` is the **static mass** of everything resting on a cell, in mass units. Bodies are processed from the top of each pile down (topological order of the rests-on graph). Each body passes its own mass plus everything it carries, split equally over the cells it rests on. Inside a bonded body, a cell also carries the contiguous same-body cells above it (and whatever rests on them).

*Choice:* load is **not** reduced while a push is lifting the body. If it were (true normal force), a Teta-lifted stack on a Galog would settle into a hover at partial load and could never leave the Galog, so the "weight is lifted → Galog stops → weight drops" cycle could not exist. "Weight resting on it" is read literally: the mass that is resting there.

## Energies

Each energy's `spread` in the data picks one of four algorithms, so the core never knows which energy is Teta. Every element lists the energies it `blocks`. In v0, Lobime blocks all four, and every element blocks Glow (it is opaque), but empty space doesn't.

A cell **emits** when its response is `emit` and its output is above 0. Fields are built in phase 2 from the outputs of the previous tick. `ownField` records what a cell put into its own field, and **exposure** leaves it out, so an element never triggers itself.

| Spread | Used by (v0) | How it works |
| --- | --- | --- |
| `radial` | Teta | Shortest path over the 8 neighbours (steps of 1 and √2), up to `range` cells. It doesn't enter cells that block it, and a diagonal step can't squeeze between two blockers, so a diagonal Lobime wall seals. Value is `S·(1 − d/(range+1))`. It flows around obstacles (weaker behind them) and through any matter that doesn't block it. |
| `ray` | Glow | Straight lines of sight. From each source, Bresenham lines run to every cell on the edge of its range square. A ray stops after the first cell that blocks it, and that cell is still lit (the surface the light lands on). Each cell takes a source's light once. Value is `B·(1 − d/(range+1))` with Euclidean `d`. |
| `conduction` | Hum | Breadth-first through **touching** filled cells (4 neighbours) that don't block it. It never crosses empty space. Long `range`, linear falloff over the path length. Terrain, loose cells and bodies conduct alike when they touch, so dust lying on a humming floor hums too. The **pitch** at a cell is the amplitude-weighted mean of the sources' pitch (a response can give its emission a pitch, `pitch × trigger`; Colomium's rises with its speed). |
| `diffusion` | Heat | Stored in matter: it is state and travels with moving cells. Emitters add their output to their own cell. Every touching pair of filled, non-blocking cells exchanges `conductivity × difference` (double-buffered, so the result doesn't depend on visiting order), and every cell loses `loss` of its value. Empty space holds nothing. Slow and steady: heat "crawls" along a stone bar. |

**Direction.** Directional spreads (`radial`, `ray`) also store, per cell, `Σ value·unit(cell − source)`: literally "away from its source", weighted by strength. Sources on opposite sides cancel. This is what a push follows.

## Triggers and responses

Every element has exactly one trigger and one response (§6 grammar). The same code serves every element:

| Trigger | Value `x` |
| --- | --- |
| `pressure` | `load` on the cell (static resting mass) |
| `motion` | speed of the cell's body, `√(vx² + vy²)`; 0 if anchored |
| `impact` | largest closing speed the cell felt in the last motion phase |
| `exposure` (energy) | that energy's field at the cell minus the cell's own emission |

```
target = min(max, gain · max(0, x − threshold) · max(0, 1 − fatigue · strain / strainMax))
output = max(target, previousOutput · decay)        (outputs below 1e-6 snap to 0)
```

- `decay` lets a response linger: Exgen's burst fires on one tick's impact and dies away over a few ticks. A decay of 0 means the output follows the trigger at once.
- `emit`: the cell is a source of that energy next tick, with strength `output`. Responses can carry a pitch, `pitch · x` (Colomium's hum rises with speed).
- `push`: a force `output · P / field`, where `P` is the trigger energy's direction vector at the cell. The force points away from the sources, and opposite sources cancel. Only elements whose response is `push` are pushed (in v0, only Bormite). The energy-level `effects.push` can push all loose matter, but it is 0.
- Every response builds strain: `strain += build · output` per tick.

**Recoil-free push.** Teta's push is a local per-cell force. A source pushes the cells around it, including Bormite bonded to the same body as the source, and nothing pushes back on the source. A cart carrying its own Lyegen and a Bormite sail is therefore driven by its own Teta. This is the literal local rule; the consequence is logged in `docs/TUNING.md`.

## Generic energy effects

Effects each energy has on *every* cell it reaches, whatever the element (`energies.<id>.effects` in the data):

- `strain`: strain per tick per unit of field. In v0 this is heat ("adds strain to what it touches"). It also strains Hard Rock, which "reacts to nothing directly".
- `shake`: loose bodies with mass ≤ `maxMass`, where the field reaches `threshold`, get a velocity kick of `strength · field` in one of 8 directions. The direction comes from the hash RNG. In v0 this is hum ("shakes loose small things", "dust jitters on surfaces").
- `loosen`: anchored cells with mass ≤ `maxMass`, where the field reaches `threshold`, become loose. Set to `null` (off) in v0.
- `push`: a force on all loose matter along the field direction. It's 0 in v0 (see above).

## Strain

```
each tick:  strain += build · output          (phase 3, every response)
                    + effects.strain · field   (phase 4, e.g. heat)
                    + impactStrain · closing   (phase 6, every impact)
            strain  = max(0, strain − recover) (phase 5)
            strain ≥ max  →  degrade
```

- **Recovery is constant.** An element at rest, or one responding only lightly, recovers. So a Queflair that only flashes can wear more slowly than one that glows steadily (§7 "strobe lamp"). This falls out of the rule; it isn't special-cased.
- **Fatigue.** `fatigue` (0..1) weakens the response as strain rises. With `fatigue = 1`, output reaches 0 at the limit, so an element under constant load settles where `build · output = recover`, just below breaking. That is Galog: it "tires under long load, recovers when unloaded". (A consequence of the formula: a fully tired Galog's steady output is `recover / build`, whatever its load.)
- **Degradation.** At or above `strain.max` the cell turns into `degradesTo`: another element, or `null`, meaning it crumbles away and the cell becomes empty. A body that loses a cell falls apart into its connected parts, and things resting on a crumbled cell fall. Every degradation is reported in `world.events` (the UI and tests use this).

## One tick

`World.step()` always runs these phases in this order:

1. **Support and load**: who rests on what; the weight on each cell.
2. **Fields**: every non-diffusion energy is recomputed from last tick's outputs, and every diffusion energy takes one step.
3. **Responses**: each cell's trigger is read (load, its body's speed, last tick's impact, or exposure), and its output is updated with strain build. Push responses produce forces.
4. **Generic effects**: energy effects on every cell (strain from heat, shaking from hum, ...).
5. **Strain**: recovery, then degradation of cells at or above their limit (bodies split if needed).
6. **Motion**: forces are gathered into bodies, support is recomputed, velocities are integrated, bodies move in order, and collisions record impacts for the next tick.

Each link in a chain of effects therefore takes one tick (e.g. Galog loaded → its Teta exists next tick → Queflair glows the tick after). Cells iterate in index order, bodies in id order (or lead order for movement), and sources in cell order.

## Determinism

- One `step()` is one fixed tick; the UI only chooses how many ticks to run per frame.
- No `Math.random`: the only randomness is `rng.ts`, a pure hash of `(seed, tick, cell, salt)` built from 32-bit integer operations. It has no hidden state, so the order in which numbers are drawn can't matter.
- The core uses only `+ − × ÷` and `Math.sqrt` on doubles. These are exactly rounded by IEEE 754, so results match across JS engines (important for co-op later). It avoids `exp`, `pow`, `sin` and the like, whose precision differs between engines.
- `World.stateHash()` hashes the full state (and treats `-0` and `+0` alike). Tests check that two runs, and a snapshot → restore → continue run, end with the same hash.

## Scenes

`saveScene`/`loadScene` (in `scene.ts`) use one JSON format for hand-made setups and full snapshots: size, seed, tick, a sparse list of cells (element, anchored or body id, plus non-zero state) and the bodies' motion. A snapshot restores the exact state.

*(Energies, triggers, responses and strain are documented as they are built; see the sections below once present.)*

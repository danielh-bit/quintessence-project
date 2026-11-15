# Tuning log (rule set v0)

A running log of every change to `rules/v0.json`: what changed, why, and what was measured. Machines are fixed by changing **rules or parameters, never by special-casing code**. When a machine can't be made to emerge, the missing rule is written down here instead of being forced.

Tools: `npx tsx scripts/sweep.ts <scenario> 'path.in.rules=a,b,c' param=x,y ticks=N` runs a scenario headless over a grid of rule values and scenario parameters and prints pulse statistics. `npx tsx scripts/probe.ts <scenario> ...` prints a per-tick trace.

## Starting point

The first numbers in `rules/v0.json` were guesses on one scale:

- Masses: Bormite 0.2 ("very light"), Queflair and Ralgen 1 ("light"), the medium elements 3, Hard Rock 6 ("heavy").
- Gravity is 0.04 cells/tick², and the speed cap is 2 cells/tick.
- Teta range is 5 cells, Glow 40 and Hum 48.
- Strain limits are mostly 100 (Lobime 1000, Hard Rock 400).

## Log

### 1. Bouncer: Bormite push gain 0.002 → 0.004

- **Seen:** at 0.002 the Bormite bounced but lost height every beat (loop gain ≈ 0.9) and stopped after about 6 beats.
- **Sweep** (`elements.bormite.response.gain`, shaft 6/10/16): at 0.0025 and above, the bounce sustains itself, with a perfectly steady period (spread 0) that grows with shaft height. 0.004 leaves a margin.
- **Why it matters:** the closed shaft's lid caps the amplitude, so any loop gain above 1 settles into a fixed beat. The "pulse circuit" falls out of three local rules: impact → Teta burst, Teta → push, gravity.

### 2. Bouncer with weight: Exgen gain 60 → 1500 (cap 200 → 5000), Exgen strain build 0.002 → 0.0001

- **Seen:** a Lobime block bonded on top of the Bormite makes the payload 16× heavier (3.2 vs 0.2). The push is a force on the Bormite cell, so the launch speed falls 16×, and the weighted bouncer died at once.
- **Sweep** (`elements.exgen.response.gain` 1000/1500/2000 × weight 0–3 × shaft 6/10/16): at 1500, 0, 1 and 2 stones keep bouncing with periods that never shrink as weight is added (e.g. 10-cell drop: 30 / 31 / 36 ticks), and 3 stones stop it.
- **Exgen wear:** its strain build is per unit of output, so a 25× larger burst would also wear it 25× faster. The build was scaled down to keep "wears slowly with each hit": an Exgen now lasts about 110–150 beats, mostly from impact strain.
- **Side effect to watch:** a stone dropped on an Exgen in the open now makes a Teta burst of about 1000 within 5 cells. Any Bormite nearby is thrown at top speed ("energy bursts throw the player around", §5). A Queflair near it flashes at its cap.

### 3. Bormite durability: recover 0.05 → 0.2, max 100 → 200

- **Seen:** an unweighted Bormite is launched at the speed cap and slams into the lid every beat. Impact strain (1 per unit of closing speed) built up faster than it recovered, and the Bormite crumbled after about 70 beats.
- **Change:** §6 calls Bormite "durable", so it now recovers faster than one beat's impacts add.

### 4. Bouncer scenario geometry (not a rule change)

`shaft` now means the free fall above the payload. Previously each stacked stone took a cell of a 1-wide shaft and shortened the drop, which hid the effect of weight (the periods for 0–3 stones were non-monotonic).

### 5. Buzzer: Galog gain 1 → 20 (cap 100 → 1000), Galog strain build 0.01 → 0.0005

- **Seen:** at gain 1, a Galog under a Bormite + Lobime stack made Teta of about 2.7 at the Bormite. The push was about 1% of what lift-off needs, so the stack never moved.
- **Reasoning:** the Galog's output is proportional to the load, and the push on the stack is proportional to that output. Lift-off therefore needs `Bormite gain × Galog gain × falloff(1) > g`, whatever the weight: Galog gain ≥ 12.
- **Sweep** (gain 15/20/30 × build 0.0005/0.002/0.01 × weight 1/3): gain 20 buzzes at a steady 17-tick period. Two things broke it:
  - **The output cap.** At 100 it clipped heavier stacks and stopped them lifting. It was raised to 1000.
  - **Fast tiring.** With build 0.01 the Galog tired within about 50 beats and the buzz died. At build 0.0005, a Galog under constant load tires toward an output of `recover / build = 100`. A Galog under light loads never tires; one under heavy loads visibly does.
- **Result:** 0–3 stones buzz at the same 17-tick period. With 5 stones (load 15), the Galog tires below the lift point within about 1400 ticks and the buzz stops, with the weight sitting on a tired, still-emitting Galog. "Overload tires it" is a regularity the player can find.
- **Side effect to watch:** a loaded Galog is now a strong Teta source (3 stones give 180 at the source). Bormite near it gets thrown out of Teta range instead of hovering, and a Queflair beside it glows at its cap.

### 6. Latch: Queflair strain build 0.01 → 0.005, Ralgen strain build 0.005 → 0.001

- **Seen:** the latch worked with the numbers as they were (off, one pulse → on, blocked → off, memory, re-pulse), but both halves were near their limits after 500 ticks. The Ralgen (output 36) would have burnt out about as soon as the Queflair. §6 says the latch lasts "until the light is blocked or the Queflair burns out", and about 11 s of memory is very short.
- **Change:** a Queflair glowing at its cap now lasts about 2000 ticks. A Ralgen driven at about 36 now recovers faster than it strains, so it doesn't wear out in a latch.
- **Regularity that falls out:** the pair only latches when it is close (≤ 2 empty cells). Further apart, the Ralgen's Teta at the Queflair is too weak to keep the loop gain above 1. At 6 cells it is out of Teta range altogether.

### 7. Runaway engine: friction 0.5 → 0.2, Sormite gain 0.1 → 0.2, Lyegen gain 1 → 6, Lyegen strain build 0.005 → 0.0005

- **Seen:** the cart (Colomium, Sormite, Lyegen and a Bormite sail on a Lobime base, all bonded) stopped within about 25 ticks of a 0.5 shove. Friction (μ = 0.5) took the speed away long before the hum → heat → Teta chain had warmed up. A pre-heated cart moved, but its Lyegen burnt out from its own output within about 200 ticks. (The pre-heat was a developer probe that wrote heat into cells directly. It has since been removed from the scenario, which now uses plain blocks and a shove only.)
- **Sweep** (friction 0.5/0.3/0.2/0.15/0.05 × Lyegen gain 1/3/6 × Sormite gain 0.1/0.2/0.3 × shove 0.3/0.5/1 × pre-heat 0/200, with the broken-loop cart as control):
  - **Friction 0.5 or 0.3:** no runaway at any gain without a hard shove.
  - **Friction 0.2 with Lyegen 6 and Sormite 0.2:** a clean runaway. From a 0.5 shove, speed goes 0.25 → 0.86 → 1.64 → 2.0 (the cap) over 400 ticks while the Sormite heats 13 → 35 → 88 → 160 → 310. The Lyegen cracks at about tick 750, then the Sormite, then the Colomium, and the cart falls apart. The same cart with Lobime in place of Sormite stops within about 65 ticks. A 0.3 shove dies out: the loop has a threshold, so it needs a kick.
  - **Lyegen wear:** its response strain was per unit of output. At outputs near its cap of 100 it burnt out before it overheated. The build was lowered so that what cracks the engine is *overheating* (heat strain), as §6 says.
- **Friction is world-wide:** shoved blocks now slide about 2.5× further. No other scenario needed changing.

### 8. Review fixes (code, no rule changes)

An adversarial review of the core found real defects. They are fixed in generic code, and every machine was re-measured afterwards, with the same numbers as before:

- **Lifted piles treated as ground.** The "pressing down on a resting pile" rule read a resting flag computed before this tick's forces. A body landing on a stack being lifted by Teta lost its momentum, and the blow fired an Exgen under the stack.
- **Movement order wasn't local.** It depended on world position and direction, so mirrored or shifted setups gave different results. Now: direction groups, lead order within a group, and struck bodies move right after their striker.
- **Interlocked bonded hooks** lost their weight on the way down. Load now goes through strongly connected components.
- **Friction** was against the world frame, so cargo was never dragged by a moving support. It now acts relative to the support, with a shared impulse.
- **Bond** averaged the velocity of selected bodies that didn't touch each other.
- **Glow rays** slipped diagonally past the corners of blocking cells.
- A hidden 32-step cap per tick limited `maxSpeed`.
- The loader accepted self-exciting stored-energy elements.
- `loosen` with threshold 0 freed cells the energy never reached.
- Scene files with bad body or tick values loaded silently.

The tests were also tightened: the runaway must crack by overheating, the bouncer's flash test can no longer pass vacuously, the buzzer period is pinned and shown to be weight-independent, the latch's gap boundary is tested, and the guard is wider. Each was checked to fail when the old behaviour is restored.

### 9. Air drag made generic; softer mass scale measured (milestone 1, no values changed yet)

- **Code:** `world.airDrag` is now a generic rule for every loose body, resting or not: each tick `v *= 1 − airDrag × cells / mass`. Every cell is slowed by the air alike, so light bodies lose speed fastest. It used to apply only to bodies in free fall and ignored mass. At 0 (the current value) nothing changes: all 162 tests pass unchanged.
- **Tool:** `npx tsx scripts/drift.ts 'world.airDrag=0,0.01' stones=1,3` puts three Bormite specks 2–4 cells from a loaded Galog on an open floor and prints their top speed and where they end up.
- **Measured** (distance of the three specks from the Galog when they stop):

| airDrag | Masses (Bormite / medium / Hard Rock) | 1 stone | 3 stones | Scenario tests that fail |
| --- | --- | --- | --- | --- |
| 0 | 0.2 / 3 / 6 (today) | 70, 124, 155 | 147, 186, 352 | none |
| 0.005 | 0.2 / 3 / 6 | 18, 38, 48 | 41, 47, 71 | bouncer (weight order), runaway (no longer speeds up) |
| 0.01 | 0.2 / 3 / 6 | 16, 17, 25 | 27, 29, 41 | bouncer, buzzer (period spread), runaway (3 tests) |
| 0.02 | 0.2 / 3 / 6 | 11, 14, 15 | 16, 17, 23 | same as 0.01 |
| 0 | 0.5 / 2 / 4 | 29, 33, 36 | 48, 87, 135 | bouncer and buzzer (weight limits moved) |
| 0.01 | 0.5 / 2 / 4 | 14, 17, 19 | 23, 33, 50 | bouncer, buzzer |
| 0.025 | 0.5 / 2 / 4 | 10, 12, 12 | 14, 18, 25 | bouncer, buzzer, runaway (3 tests) |

- **What the failures are:**
  - *Drag 0.005, today's masses:* the bouncer still beats steadily, but a lone Bormite (period 32 at a 10-cell drop) is now slower than one with a stone on it (31), so "added weight never makes it faster" fails. The runaway cart no longer speeds itself up after the standard shove (0.79 after the warm-up, where the test needs more than 1).
  - *Softer masses, no drag:* both clocks still emerge. The limits move: the bouncer now carries 4 stones and stops at 5 (the test pins 3), and the buzzer still runs with 5 stones and only tires at 8 (the test pins 5).
- **Conclusion:** drag small enough to leave the machines alone does not exist in this range, and no combination brings the dust to rest within a few cells. The reason is the size of the push: a Teta force that lifts a stack of stones accelerates a lone Bormite at many times gravity, so it reaches the speed cap inside the 5-cell range, and only a drag strong enough to kill ballistic flight (and with it the lone-Bormite bouncer) would stop it nearby. **No values were changed.** Decision pending.

### 10. The player's body: new element Shell (milestone 1)

- **Added:** `shell` (mass 1.5 per cell, blocks Glow, no trigger or response, strain limit 1000 with recovery 1.0 like Lobime, no grip). The body is 2×4 cells (`data/player.json`), so it weighs 12: four stones.
- **Why these numbers:** survival is out of scope for milestone 1, so the body must not break. Landings do strain it by the generic impact rule (at most 2 per landing); recovery of 1.0 per tick clears that at once. Fall damage in milestone 3 can come from lowering these, with no new rule.
- **Movement** (`data/player.json`, not rules): walk 0.15 cells/tick, jump 0.5 (about 3 cells high). A jump landing is an impact of 0.5, so jumping on an Exgen fires it at about 600.

### 11. The pack: new element Weave, and the wall numbers (milestone 1)

- **Added:** `weave` (mass 0.1, blocks nothing, strain limit 3, recovery 0.8, no grip). It is the pack's outer wall. The divider between the two compartments is Dense Lobime (entry 12).
- **How a push strains a wall:** a Bormite held against a wall by Teta is pushed into it again every tick, and each of those is an impact (the existing rule; it is why Bormite's own durability was raised in entry 3). So a steady push strains the wall at about `0.02 × Teta` per tick, up to 2 per tick.
- **Measured** (one Bormite in the pack; peak strain on any wall cell, with the limit switched off):

| What the player does | Teta inside the pack | Peak wall strain (recovery 0.8) |
| --- | --- | --- |
| Stands on a Galog | 41 | 1.7 |
| Drops 1 cell onto two Exgens | 61 | 1.85 |
| Drops 3 cells | 165 | 2.0 |
| Drops 6 cells | 251 | 2.4 |
| Drops 10 cells | 338 | 3.1 |
| Drops 20 cells | 511 | 4.0 |
| Drops 45 cells | 771 | 5.0 |

- **Chosen:** limit 3. Standing on a Galog or a short drop only throws the contents about; a drop of about 10 cells or more onto an Exgen with Bormite aboard cracks a wall and the Bormite goes out through the hole. Stones never crack it: a landing slams them into the floor once (at most 2), below the limit.
- **Recovery 0.5 was tried first:** standing on a Galog then wore the wall through in about 45 ticks, which is not a "small push".
- **To revisit:** these numbers depend on how hard Teta throws a lone Bormite (the open drift question, entry 9). If the push changes, re-measure this table.
- **Weight:** the empty pack weighs 17 (five Dense Lobime divider cells at 3, twenty Weave cells at 0.1), more than the body's 12. A Galog under the player is therefore loaded at about 14.5 per foot. The divider is the cost; a lighter divider element is a data change.

### 12. Mining: grip and shock, and Dense Lobime (milestone 1)

- **New generic rule:** every impact on an anchored cell adds `closing speed × focus` to the cell's shock; shock falls by `world.shockRecover` per tick; at or above the element's `grip` the cell comes loose, keeping its strain and heat. Collisions have focus 1.
- **Why not the strain limit:** see `docs/SIMULATION.md`, "Mining". In short, machine parts must survive hundreds of impacts and Hard Rock must outlast the pick, so a pick that is only an impact cannot wear anything through; and a cell at its strain limit crumbles, leaving nothing to carry.
- **Values:** `shockRecover` 0.1. Grips: Bormite 3; Queflair, Ralgen 4.5; Lobime, Galog, Exgen, Colomium, Sormite, Lyegen 6; Hard Rock, Dense Lobime, Shell, Weave none.
- **The pick** (`data/player.json`): speed 1.0, focus 3, one swing per 12 ticks. So each swing adds 3 shock and 1.2 settles before the next: Bormite comes out in 1 swing, Queflair and Ralgen in 2, the rest in 3.
- **Hard Rock and the pick:** a swing adds 1 strain and Hard Rock recovers 1.2 between swings, so its strain never builds (tested over 500 swings).
- **The sandbox is untouched:** every grip is above 2, the fastest a collision can be, so one collision loosens nothing, and at 0.1 per tick the shock from a bouncer's beat (2 every 23 ticks or slower) is gone before the next. Measured over 3000 ticks of all eight scenarios: nothing loosened, highest shock 1.88 (the bouncer's Exgen), and every run identical cell for cell to a run with no grips at all.
- **Consequence to watch:** anything that strikes an anchored cell harder than 0.1 per tick on average will dig it out. A Bormite held against a wall by strong Teta does this (up to 2 per tick), so a strong enough source next to Bormite and a soft wall loosens the wall. A fast hammer machine would too.
- **Added:** `dense_lobime` (mass 3, blocks all four energies, strain limit 4000, no grip). The ship's hull material, and the pack's divider. It cannot be chipped by the pick or shaken loose by anything.

### 13. Prototype: a flow limit on the push (measured only; off, no value changed)

The open question from entry 9: how to make Bormite dust drift instead of being flung.

- **Idea:** treat the push as a flow with a speed of its own, proportional to the field: a cell is never pushed faster than `flow × field` along the push direction. Dust then drifts at a speed set by the field strength and slows as the field thins.
- **Code:** an optional `flow` on a `push` response in the rules data. It is **0 (off)** in `rules/v0.json`, and at 0 the push is exactly what it was (all tests pass unchanged). To try it, set `elements.bormite.response.flow` or pass it to the sweep scripts.
- **Measured** (dust: distance from the Galog where three specks starting 2, 3 and 4 cells away come to rest; periods in ticks; "stops" = the beat dies out):

| flow | Dust, 1 stone | Dust, 3 stones | Bouncer, 10-cell drop, 0 / 1 / 2 / 3 stones | Buzzer, 0 / 1 / 3 / 5 stones |
| --- | --- | --- | --- | --- |
| off (today) | 70, 124, 155 | 147, 186, 352 | 30 / 31 / 36 / stops | 17 / 17 / 17 / tires |
| 0.001 | 5, 6, 7 (top speed 0.03) | 5, 6, 7 (0.11) | 40 / 40 / stops / stops | never lifts / 41 / 15 / tires |
| 0.002 | 5, 6, 7 (0.07) | 5, 6, 7 (0.23) | 30 / 35 / 43 / stops | never lifts / 14 / 17 / tires |
| 0.004 | 5, 6, 7 (0.15) | 12, 15, 15 (0.42) | 30 / 31 / 37 / stops | never lifts / 15 / 17 / tires |
| 0.008 | 6, 7, 8 (0.29) | 23, 25, 53 (0.85) | 30 / 31 / 37 / stops | never lifts / 17 / 17 / tires |
| 0.016 | 18, 22, 22 (0.56) | 70, 71, 208 (1.70) | 30 / 31 / 36 / stops | 41 / 17 / 17 / tires |

- **What it fixes:** at 0.002 to 0.004 the dust does what the spec asks. It moves off at a slow, visible speed and stops just outside the Galog's reach, a few cells from where it lay. The bouncer keeps its beat and its regularities.
- **What it breaks** (existing scenario tests that fail with it on, at 0.002, 0.004 and 0.008 alike):
  - **Runaway engine** (3 tests). The cart's sail can no longer be pushed faster than the flow, so the engine tops out instead of running away and overheating. This is the real cost: the flow limit is a built-in limiter.
  - **Buzzer** (2 tests). A lone Bormite with no weight on it presses so lightly on the Galog that the flow is too slow to lift it a whole cell, so the unweighted buzzer never starts. With one or more stones it buzzes as before.
  - **Light link** (1 test). The far Ralgen still emits, but its Teta is weak, so the Bormite behind it barely moves and the test's "it was pushed" check fails.
- **Also to redo if adopted:** the pack wall numbers (entry 11) and three pack tests, which are tuned to today's push.
- **Not decided.** Options: adopt it and re-tune the runaway engine (a faster flow for strong fields, or stronger Lyegen), accept a gentler version of the drift, or leave the push as it is.

### 14. Glow: a ray stopped at a corner still lights the surface it ran into (milestone 1, code; no rule value changed)

Playing the cave showed that a light barely lights anything. Measured in a cave-sized chamber (23 x 7, a Queflair on its floor): the air was lit, but only 15 of the 48 wall, floor and ceiling cells in view were. The floor the light stands on stayed dark except the cell under it.

- **Cause:** a Glow ray may not step diagonally past the corner of a blocking cell (this is what makes a diagonal wall opaque). A light on a floor reaches the floor and ceiling only by shallow rays, and each of those ends with a diagonal step onto the surface, which the rule stopped before lighting it. So every surface hit at a shallow angle stayed black.
- **Change** (`src/core/fields/rays.ts`, no data): when the step a ray was making would pass a corner, and the cell it was heading for blocks Glow, that cell is lit and the ray ends there. If the cell it was heading for is open air, the ray ends unlit, as before, so a diagonal wall still seals.
- **Measured:** lit surface cells 15/48 to 37/48 in that chamber. In a 5-tall passage the floor is lit out to about 7 cells and the ceiling to about 14 (two new tests in `tests/core/fields.test.ts`; the first fails without the change). Every earlier test passes unchanged, the latch, light link and light switch included.
- **Still true:** rays are cast to the edge of the range square, so beyond about 10 cells they are sparser than cells and some floor and ceiling cells are skipped. Casting to every cell in range (or shadowcasting) would close that; not done.
- **Also:** the game's view now adapts its exposure to the dark (`src/play/view.ts`), a presentation change only.

### 15. Friction grips with the load, and bodies integrate top-down (milestone 1, code; no rule value changed)

Walking on a loose block did not throw it out any more (entry 8 of the game layer: the legs' push-back is capped), but the block stuck to the player's feet and was carried along at walking speed.

- **Cause 1: the load was ignored.** The core's friction capacity for a resting body was `μ·g` per tick, whatever sat on it. A heavy walker's feet could drag a light block with the walker's weight (`M·μ·g`), but the floor held the block with the block's own weight only. Friction grips with everything that presses the body down.
- **Cause 2: the order.** Bodies integrated in id order. A body's friction impulse is given to its support, so if the support had a lower id it had already settled its friction that tick and went on moving with the impulse. In the game the rubble is made before the player, so the walker's blocks were carried.
- **Changes** (`src/core/motion.ts`): the normal force in friction is multiplied by `1 + external load / mass` (the load on the top cell of each column of the body, from `w.load`), and bodies integrate top of the pile first (bodies resting on others before the ones they rest on; ties and loops by id).
- **Measured:** a player walking over 1 or 3 blocks of Lobime, Queflair, Bormite or Galog, either way, with the blocks made before or after the player: the blocks do not move (speed 0, same cells). Before: carried along at 0.08 to 0.15 cells/tick, a Bormite block several cells. Unloaded things are unchanged: cargo on a sliding cart is still dragged along (a core test).
- **All earlier tests pass unchanged**, the seven machines and the scenes included. New tests: two in `tests/core/motion.test.ts`; `tests/game/legs.test.ts` now checks that blocks stay put in both orders (the tests fail without either change).

## Results per machine

| Machine | Emerges? | Notes |
| --- | --- | --- |
| Bouncer | **Yes** | Steady beat (spread 0). Period grows with drop height (6 → 12 → 20 cells: 23 → 33 → 44 ticks) and with weight (0/1/2 stones: 30/31/36 at a 10-cell drop). 3 stones stop it. The wall Queflair flashes once per beat. Without the Exgen, or with Bormite's push set to 0, it just lands. Regime limit: drops shorter than about the Teta range (5) behave oddly, because the burst still reaches the Bormite at the lid. |
| Buzzer | **Yes** | Steady 17-tick buzz for 0–3 stones; the Galog's Teta switches on and off with each lift. A plain weight with no Bormite never lifts. The period doesn't depend on the weight: the lift condition is mass-independent, because a heavier weight presses harder. Overloading (5 stones) tires the Galog until it stops. |
| Invisible energy | **Yes** (no tuning needed) | One stone on a Galog is enough to light a Queflair beside it, and Bormite dust within Teta range moves away. With no stones, nothing happens; taking the stones off puts the Queflair out. **Caveat:** after entries 2 and 5 the dust is *flung* rather than drifting: it leaves Teta range at speed and hits the far wall. Gentler drift would need weaker Teta near Galogs (which conflicts with the buzzer's lift condition) or a mass-dependent air drag (a new generic rule, not added). The Queflair burns out after about 2000 ticks at its cap (since entry 6). |
| Light link | **Yes** (no tuning needed) | A Queflair lit by a loaded Galog makes a Ralgen 30 cells away emit Teta, which pushes a Bormite behind it. The Galog's own Teta (range 5) doesn't get anywhere near. The signal weakens with distance (Ralgen output 29 / 9.7 / 1.9 at 10 / 30 / 38 cells) and is gone beyond Glow's range (40). An unlit lamp sends nothing. |
| Light switch | **Yes** (no tuning needed) | Shoving a loose Lobime block off a ledge drops it into the beam, and the Ralgen goes quiet within a few ticks. Lifting it out restores the signal. Repeatable, so it's a hand-worked switch. Any opaque block works, since every element blocks Glow in v0; Lobime is just the common stone. |
| Latch | **Yes** | Dark until one pulse (a stone dropped on a nearby Exgen), then lit long after the Exgen has gone quiet. A Lobime block in the beam turns it off, and it *stays* off after the block is removed, until the next pulse. It goes out for good when the Queflair burns out (about 2000 ticks). Only latches when the pair is close (gap ≤ 2). |
| Runaway engine | **Yes**, given bonded carts and a recoil-free push (your choice at planning time) | After a shove, a bonded cart speeds itself up, its parts heat up continuously, and at about 750 ticks the Lyegen, then the Sormite, then the Colomium crack. Every link is observable: hum at the Sormite, rising heat, Teta at the sail. With Lobime instead of Sormite (loop broken) it coasts to a stop. Too gentle a shove dies out. It needs a long track (about 1200 cells) to overheat before reaching the end. |

## Observations and things to watch

- **Self-propelled Teta carts (recoil-free push).** A Teta source bonded into a body pushes that body's own Bormite and gets no push back. The runaway engine depends on this. It also means *any* bonded Teta source + Bormite sail is a vehicle that needs no track, e.g. a Galog with a stone bonded on top (internal load) and a sail. In v0, Galog fatigue limits such a vehicle to a sustainable trickle, and Lyegen and Exgen need heat or impacts. Watch whether this becomes a boring catch-all for "move things" once needs exist.
- **Strong Teta near Galog and Exgen.** Entries 2 and 5 made both strong sources, because Bormite is 15× lighter than a stone and the clocks must lift stones. As a result, loose Bormite near a loaded Galog or a hit Exgen is flung out of range rather than drifting. A mass-dependent air drag (a new generic rule) or a softer mass scale (e.g. Bormite 0.5, medium 2) would soften this; neither was added.
- **A tired Galog's output doesn't depend on its load.** With fatigue 1, a Galog under constant load settles where `build × output = recover`, i.e. output `recover / build` = 100. Light loads below that never tire. Whether "heavier load → same tired output" is a good regularity is a design question.
- **Bouncer drop height vs Teta range.** For drops shorter than about the Teta range, the burst still reaches the Bormite at the lid and the timing gets irregular. Players will probably find this edge.
- **The latch needs the pair close** (≤ 2 empty cells); it is a short-range device.
- **No structural collapse.** Anchored cells never fall, even when everything under them is gone, so "strained rock collapses" (§5) has no rule yet. It would need a support rule for terrain.
- **Hum doesn't loosen anchored cells in v0** (`loosen.threshold` is null). The generic effect exists and is off.
- **Falloff shape is fixed in code.** Data sets each energy's strength and range, but the shape is always linear, `1 − d/(range+1)`, with a hard cut past the range. Lift conditions depend on it: the buzzer needs `gain_B · gain_G · falloff(1) > g`, with falloff(1) = 5/6. If designers want a different reach profile, add an optional per-energy edge value whose default reproduces today's. The 8 shake directions and the neighbour stencils are likewise fixed parts of the algorithms.

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

## Results per machine

| Machine | Emerges? | Notes |
| --- | --- | --- |
| Bouncer | **Yes** | Steady beat (spread 0). Period grows with drop height (6 → 12 → 20 cells: 23 → 33 → 44 ticks) and with weight (0/1/2 stones: 30/31/36 at a 10-cell drop). 3 stones stop it. The wall Queflair flashes once per beat. Without the Exgen, or with Bormite's push set to 0, it just lands. Regime limit: drops shorter than about the Teta range (5) behave oddly, because the burst still reaches the Bormite at the lid. |
| Buzzer | **Yes** | Steady 17-tick buzz for 0–3 stones; the Galog's Teta switches on and off with each lift. A plain weight with no Bormite never lifts. The period doesn't depend on the weight: the lift condition is mass-independent, because a heavier weight presses harder. Overloading (5 stones) tires the Galog until it stops. |
| Invisible energy | **Yes** (no tuning needed) | One stone on a Galog is enough to light a Queflair beside it, and Bormite dust within Teta range moves away. With no stones, nothing happens; taking the stones off puts the Queflair out. **Caveat:** after entries 2 and 5 the dust is *flung* rather than drifting: it leaves Teta range at speed and hits the far wall. Gentler drift would need weaker Teta near Galogs (which conflicts with the buzzer's lift condition) or a mass-dependent air drag (a new generic rule, not added). The Queflair burns out after about 1000 ticks at its cap. |

# Know, What? — Game Overview

This document explains the game to someone who has never heard of it. Read all of it before building anything. It describes what the game is, what it should feel like, how its world works, and which rules every part of the code must respect.

---

## 1. The game in one paragraph

*Know, What?* is a solo game about discovering how an alien world works. You crash-land on an unknown planet with almost nothing, and nobody tells you anything. The world runs on its own physics: strange elements that react to weight, impact, motion and invisible energies. Surviving and repairing your ship give you reasons to act, but how you do it is up to you. The real game is figuring out the rules of the universe through observation, experiments and building machines. That understanding is the progression. You don't unlock a tech tree; you learn a world. It is a solo game that also works well with friends in co-op.

---

## 2. The experience we are after

Everything in this project serves one feeling. It comes from the creator's own experience:

- **Opening Minecraft for the first time.** No instructions. You poke at things, something unexpected happens, you form a theory, and you are completely free to do what you like.
- **The redstone lab.** As kids, the creator and a friend built a huge lab just to test redstone contraptions, and kept inventing their own techniques for engineering problems.
- **The pulse circuit.** They once stumbled on a circuit that pulsed on its own, then worked out how to change its timing. Understanding *why* it pulsed was more exciting than anything they built with it.

In Minecraft, understanding the world is optional, and most players learn it from YouTube. In *Know, What?*, understanding the world **is** the game. Engineering is the medium; **science is the reward**: the moment a hidden rule clicks into place.

**Inspirations**

| Game | What we take from it |
| --- | --- |
| Outer Wilds | The feeling: knowledge is the only real progression. (Not its visual style.) |
| Noita, The Powder Toy | The simulation: a world where materials are simulated and interact on their own, so surprising things emerge. |
| Opus Magnum | The engineering: open-ended machines, many valid solutions, some much more efficient than others. |
| No Man's Sky | Exploration: going somewhere unknown to see what is there. |

---

## 3. Story and setting

The player is a scientist travelling with their professor. They are drinking beer on a ship in warp when an asteroid hits. The professor dies, and the ship crash-lands on planet **E623MU**.

The ship's AI, **Lama**, survives, but its memory is wiped. It knows nothing about this world, so it rebuilds its knowledge from what the player discovers. That is the in-game reason the game keeps a record of what you have found.

The planet's physics is not ours. At first the player only needs to survive and fix the ship. Over time the question becomes much bigger: what *is* this universe, and how was it made? Deep in the planet lies **Coreium**, a material that creates gravity and behaves unlike anything else. It is the doorway to the final truth: the universe is built from information, created by an "Architect" testing whether a universe can contain enough information to discover its own origin. (Endings are far in the future; nothing about them needs building now.)

---

## 4. How play works: no fixed game loop

There is no fixed loop and no quest chain. Three forces drive the player instead:

1. **Needs.** The world creates problems: caves are dark, some rock is too hard to dig, the suit runs low on energy, the ship needs a steady energy supply, signals must reach far places. Needs are always described as *capabilities* ("keep time", "get past Hard Rock"), never as recipes ("craft item X").
2. **Accidents.** The world's rules fire whenever their conditions are met, including when the player didn't intend it. Mining, carrying and stacking things regularly sets off phenomena. A surprised player is a curious player.
3. **Curiosity.** The player chooses what to chase. Any need can be met in several unrelated ways.

**Discovery is a tree, not a chain.** For any need there are many routes through the world's physics, built from different knowledge. Nobody authors those routes. They emerge from a small set of rules, the way redstone clocks emerged from Minecraft's rules without Mojang designing them as "discoveries".

**Patterns are welcome; catch-alls are not.** As in any engineering field, some contraptions will prove generally useful (a clock, a memory cell). That's good. A boring contraption that solves every need, making all other routes pointless, is a design failure.

**Clever beats obvious.** The obvious solution to a need works. A less obvious one, built on deeper understanding, is more efficient: less fuel, less wear, faster or smaller.

**Early accidents, late predictions.** Near the surface, most phenomena are found by chance. Deeper phenomena are rare or impossible by chance: the player has to *predict* them from what they understand and build the setup on purpose.

**Survival** is just more needs, solved with the same physics. There are no separate survival systems:

- **Suit energy:** the lamp and life support run on charge that the invisible energy *Teta* recharges.
- **Temperature:** deep layers are hot and the surface is cold at night.
- **Self-inflicted hazards:** runaway machines overheat, strained rock collapses, energy bursts throw the player around.
- **No food or hunger.** Biology is out of scope.
- **Gentle failure:** the player collapses and wakes at the ship. They keep all knowledge, Lama's records and every machine they built, and may lose what they were carrying.

**Mining is an experiment, not a grind.** Every pick swing is an impact and every carried ore is weight and motion, so mining is where many early accidents happen. Machines need a handful of pieces, not stacks. Deeper layers are reached through understanding, not better picks. Large-scale automation is possible later but never required.

**Spoilers are the player's business.** Like a book or a film, it's up to the player to avoid spoilers. The world is the same for everyone, so guides stay valid, and a stuck player can ask Lama for a hint in steps: where to look, then what to try, then the answer.

---

## 5. The world's physics (rule set v0)

The world is built from a small set of local rules. Everything interesting must emerge from combining them.

### The grammar

- Every **element** has one **trigger** and one **response**. The response's strength is proportional to the trigger's strength.
- Every response causes **strain**. Strain recovers at rest. Too much strain and the element **degrades**: it cracks, crumbles or burns out.
- **Gravity** exists from the start. (Much later the player can learn that it comes from Coreium.)
- The four **energies** spread in different ways, and those differences are half of the design space.

### Energies

| Energy | What the player perceives without instruments | How it spreads | What it does |
| --- | --- | --- | --- |
| **Teta** | Nothing; only its effects | Short range, all directions; blocked by Lobime | Pushes light things away from its source |
| **Glow** | Light, seen directly | Straight lines (line of sight) | Lights dark areas |
| **Heat** | Air shimmer, colour change on hot stone | Slow diffusion through solids | Adds strain to what it touches |
| **Hum** | Sound; dust jitters on surfaces | Only through connected solids, long range | Shakes loose small things |

### Triggers

An element reacts to one of: **constant pressure** (weight resting on it), **motion** (its own speed), **impact** (a sudden change in motion), or **exposure** to a specific energy.

### Elements

| Element | Reacts to | Response | Wear | Mass |
| --- | --- | --- | --- | --- |
| **Lobime** | Nothing | Blocks all energies (the common insulating stone) | Very durable | Medium |
| **Galog** | Weight resting on it | Steady Teta | Tires under long load, recovers when unloaded | Medium |
| **Exgen** | Impact | A burst of Teta sized by the impact | Wears slowly with each hit | Medium |
| **Bormite** | Teta | Is pushed away from the source | Durable | Very light |
| **Queflair** | Teta | Glows | Burns out after glowing for a while | Light |
| **Colomium** | Its own motion | Hum, with pitch rising with speed | Durable | Medium |
| **Sormite** | Hum | Heat | Moderate | Medium |
| **Lyegen** | Heat | Teta | Moderate | Medium |
| **Ralgen** | Glow | Teta | Moderate | Light |
| **Hard Rock** | Nothing directly | Breaks only past a high strain threshold | Very durable | Heavy |

All strengths, ranges, rates and thresholds are **tuning parameters**, not fixed facts. They will change many times.

### Machines that should emerge (never be hard-coded)

These are the proof that the rules are rich enough. None of them should exist as special code; each should simply happen when the right blocks are placed.

- **The bouncer (the pulse circuit).** Bormite resting on Exgen in a closed shaft. It falls, the impact fires Teta, the Teta throws it up, it falls again. The period depends on shaft height and any weight added. A Queflair next to it flashes every beat.
- **The buzzer.** A weight with a Bormite underside resting on Galog. Galog emits Teta, Teta lifts the weight, Galog stops, the weight drops, and it repeats. A second clock, built from different rules.
- **The runaway engine.** Moving Colomium hums, Sormite heats up, Lyegen emits Teta, and Teta pushes the cart carrying the Colomium faster. A feedback loop that overheats and cracks parts unless the player limits it.
- **The light link.** A Queflair seen from far away by a Ralgen delivers Teta at a distance.
- **The light switch.** Sliding Lobime into the beam cuts the signal.
- **The latch (memory).** A Queflair and a Ralgen facing each other keep each other going. One pulse turns it on, and it stays on until the light is blocked or the Queflair burns out.
- **The invisible energy.** A Galog with stones piled on it, next to a Queflair, makes the Queflair glow, and nearby Bormite dust drifts away. The player learns that something exists that they cannot see.

### Example: one need, many routes

"Keep time" can be met with the bouncer, the buzzer, a Queflair burning out at a steady rate (a one-shot timer), or heat crawling along a stone bar to a Lyegen (a delay line). Each route rests on different knowledge. That width is what the whole design protects.

---

## 6. Three depths of understanding

1. **Phenomena:** what happens. ("Pressed Galog makes Queflair glow.")
2. **Regularities:** how much, how fast, in what proportion. ("A taller shaft makes a slower bouncer.")
3. **Mechanism:** why. This is the **EES** layer (Element Elementary Structure). Every element is secretly a small graph of nodes and edges. Energy flows through it along the path of least resistance, and the shape of that graph decides everything. How complex the flow is decides which energy the element emits; the structure's size decides which trigger sets it off. The table above is what the player sees from outside; the EES is the reason for it.

Each depth gives the player predictive power, and prediction gives shortcuts that tinkering can't reach. The EES layer is reached very late, only with very complex tools that can break elements under control and measure what comes out (fragments and released energies). **The EES is not part of v0.** It only matters now as a constraint: the v0 element behaviours should later be explainable by some underlying structure.

---

## 7. Knowledge and Lama

The player should not need a PhD, or a spreadsheet, to progress. Bookkeeping is Lama's job; thinking is the player's.

| Who | Does what | Example |
| --- | --- | --- |
| Lama, automatically | Logs every phenomenon the player actually witnessed (in view or on an instrument) | "Queflair glowed next to a weighted Galog." |
| Lama, when asked | Does the math: tabulates the measurements the player chose to take and fits a curve | "Bounce period against shaft height: rises steadily." |
| The player, lightly | Names things and groups observations into definitions, in one quick gesture | Naming the invisible push "Teta" |
| The player only | Decides what to test, forms hypotheses, predicts | "A taller shaft should slow the hammer below Hard Rock's recovery." |

Lama records *what* happened, never *why*, and never suggests a hypothesis. Once the player names something, Lama's log uses that name, so the record fills up with the player's own vocabulary. Lama only offers hints when the player asks.

---

## 8. Tools and systems

**Starting kit.** The player can measure the world's *geometry*, not its *forces*:

- Lama on the suit measures length, mass and time from the first minute.
- A pick (impact) and a pack (carrying). Nothing else.
- A suit lamp with limited charge.
- **No energy instruments.** Glow, Hum and Heat reach the senses; Teta doesn't. The first real instrument is one the player makes: a Teta detector, found when a Queflair lights up next to a loaded Galog.

**Building happens in the world.** Like redstone, machines are built directly from blocks in the world. The world is the workbench. Later tools make that work easier to keep and reuse:

- **Node Book.** The player's engineering notebook. It saves and names machines the player has already built and understood, and shows their parts (handles, housings, detectors, logic parts). It is not a recipe book: it never shows a machine the player hasn't made.
- **BluePrinter.** A fabricator that builds a copy of a design saved in the Node Book from the materials you provide. It saves you from rebuilding a machine by hand. It never unlocks anything you haven't already built yourself.
- **Terminal.** A console for programming machines.
- **Beep.** The game's visual programming language, closer to redstone than to text code: you connect *input → logic → output* modules into small programs and burn them onto **chips**. Chips are physical parts that grow out of the world's own physics (the bouncer and the latch are the first switches and memory). Programming is optional; it enables automation.

The Node Book, BluePrinter and Terminal arrive later, once the player has built things worth saving, copying or programming.

---

## 9. Rules for anyone building this game

These are constraints, not suggestions:

1. **Author rules, never paths.** No code may special-case a machine, recipe or discovery. If the bouncer only works because of a line of code that knows about bouncers, it's broken.
2. **Everything observable, nothing explained.** The game never shows a property in a tooltip. (Developer debug views are fine; they must be easy to turn off and never appear in the player's view.)
3. **Rules are local and data-driven.** Element and energy definitions live in data files, not code, so they can be tuned without programming.
4. **Deterministic simulation.** The same starting state and inputs always produce the same result. This keeps co-op possible and makes tests reliable.
5. **Simulation separate from presentation.** The simulation core must run headless (no rendering, no browser), so automated tests and a future "solver" tool can drive it.
6. **Freedom is measured, not assumed.** A future solver will check that every need has several routes, that useful patterns emerge, that no catch-all exists, and that clever routes beat obvious ones. Code should make that kind of analysis possible.

---

## 10. Out of scope for now

- Biology, creatures, and any other beings in the world
- Explaining the player's own body and existence (a known weak spot, saved for later)
- The EES layer and endings
- 3D, final art, sound design, story content
- Co-op networking (only determinism is required now)

---

## 11. Glossary

| Term | Meaning |
| --- | --- |
| E623MU | The planet where the game takes place |
| Lama | The ship's AI; the game's memory of the player's discoveries and the source of on-demand hints |
| Need | A capability the world pressures the player to achieve ("keep time") |
| Route | One way of meeting a need, resting on a particular set of knowledge |
| Discovery tree | All routes to all needs; it emerges from the rules and is never drawn by hand |
| Trigger | What sets an element off: weight, motion, impact or exposure to an energy |
| Response | What an element does when triggered: emit an energy or move |
| Strain | Wear from responding; recovers at rest, causes degradation if too high |
| Teta | The invisible pushing energy; the world's "electricity" |
| EES | Element Elementary Structure: the hidden graph inside every element that explains its behaviour |
| Coreium | Deep material that creates gravity; the key to the final mystery |
| Node Book | Notebook that saves machines the player has built |
| BluePrinter | Fabricator that builds copies of saved designs |
| Terminal / Beep | The programming console and its visual language |
| Chip | A physical part carrying a Beep program |

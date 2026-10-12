# Know, What? — Game Overview

This document explains the game to someone who has never heard of it. Read all of it before building anything. It describes what the game is, what it should feel like, the core pillars every decision is checked against, how the world works, and the rules every part of the code must follow.

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

**The anti-goal:** a fixed game loop, or an authored chain of discoveries. An earlier version of this design failed exactly here. As soon as the designer decides the route, the premise is broken.

**Inspirations**

| Game | What we take from it |
| --- | --- |
| Outer Wilds | The feeling: knowledge is the only real progression. (Not its visual style.) |
| Noita, The Powder Toy | The simulation: materials that are simulated and interact on their own, so surprising things emerge. |
| Opus Magnum | The engineering: open-ended machines, many valid solutions, some much more efficient than others. |
| No Man's Sky | Exploration: going somewhere unknown to see what is there. |

---

## 3. Core pillars

Seven pillars turn the feeling into constraints. Every mechanic is checked against them. A mechanic that breaks a pillar gets cut or reworked.

### Pillar 1 — Author rules, not paths

The designer writes a small set of local rules, like redstone's torch, dust and repeater. Paths to a goal are never authored; they emerge from combining rules. Mojang never designed the redstone pulse circuit as a "discovery"; it fell out of the rules.

As in any problem space, some patterns will dominate. Generally useful contraptions (a clock, a memory cell) are welcome; they are what experienced players reuse. A boring catch-all that solves every need and makes all other routes pointless is a design failure.

*In practice:* no code, data or content may special-case a machine, recipe or discovery. If a goal has too few routes, we change the rules (add an overlap, a second trigger), never add a hint or a scripted solution.

### Pillar 2 — Everything is observable before it is explained

Every rule shows itself in the world through something the player can perceive: glow, motion, sound, heat, breakage. No tooltip ever states a property.

But the player's head is not the only place knowledge lives. Too much to remember makes the game unplayable for a casual player, and so does forcing them to keep manual notes. **Lama** (the ship's AI) keeps a record of what the player has actually witnessed and does the math, while the thinking stays with the player. See section 9.

This touches the core of real science: building abstractions through good definitions. We keep a light version of it (the player names things and groups observations), but we never require a PhD to progress.

### Pillar 3 — Accidents early, predictions late

Rules fire whenever their conditions are met, including in places the player didn't intend. Mining, carrying and stacking things should regularly set off phenomena by accident. A rule that only fires in a deliberate setup will never be stumbled on.

That holds near the surface. Deeper phenomena are the reverse: rare or impossible by chance, so the player has to **predict** them from what they understand and build the setup on purpose. Accidents lead early; prediction leads late. This is the shift from tinkerer to scientist.

### Pillar 4 — Instruments are the progression

You can only study what you can measure. New detectors, timers and meters open new layers of the world. Progress is measured in **resolution**, not in tech-tree unlocks.

The player starts able to measure the world's *geometry* (length, mass, time), not its *forces*. Energy instruments have to be made from the world's own elements, and the first one (a detector for the invisible energy Teta) is found by accident.

### Pillar 5 — Understanding pays

There are three depths of understanding: **phenomena** (what happens), **regularities** (how much, how fast, in what proportion) and **mechanism** (why). Each depth gives prediction, and prediction gives shortcuts that tinkering can't reach.

Within a need, **the obvious solution works, but a less obvious one built on deeper knowledge is more efficient**: less fuel, less wear, faster or smaller (the Opus Magnum feeling).

### Pillar 6 — Pressures, not quests

The world creates needs: dark caves, hard rock, a broken ship, distance, a suit running low. It never says how, or in what order, to meet them. Needs are described as **capabilities** ("a steady energy supply", "keep time"), never as items ("craft a Galog Cell").

Light survival pressures sit on top of these, solved with the same physics. Biology stays out (see section 5).

### Pillar 7 — Discovery is a tree, not a chain

For any need, there must be many routes through the world's physics, resting on different knowledge. The discovery tree is not drawn and then built; it is a *property* of the rule set that we measure and tune (section 7). Drawing the routes would be authoring them, which breaks pillar 1.

**Together, pillars 3 and 6 replace the game loop:** needs give direction, accidents give leads, and the player chooses what to chase.

---

## 4. Story and setting

The player is a scientist travelling with their professor. They are drinking beer on a ship in warp when an asteroid hits. The professor dies, and the ship crash-lands on planet **E623MU**.

The ship's AI, **Lama**, survives, but its memory is wiped. It knows nothing about this world, so it rebuilds its knowledge from what the player discovers. That is the in-game reason the game keeps a record of what you have found.

The planet's physics is not ours. At first the player only needs to survive and fix the ship. Over time the question becomes much bigger: what *is* this universe, and how was it made? Deep in the planet lies **Coreium**, a material that creates gravity and behaves unlike anything else. It is the doorway to the final truth: the universe is built from information, created by an "Architect" testing whether a universe can contain enough information to discover its own origin. There are several possible endings, some fully defined and measurable, others open to interpretation. (Endings are far in the future; nothing about them needs building now.)

---

## 5. How play works

**No fixed loop.** Three forces drive the player instead:

1. **Needs** (pillar 6): problems the world creates, phrased as capabilities.
2. **Accidents** (pillar 3): phenomena that go off while the player is doing something else.
3. **Curiosity**: the player chooses what to chase. Any need can be met in several unrelated ways.

**The ship** is a list of capabilities to restore (steady power, timing, signalling, lifting), not a list of parts. Each capability can be met with whatever machine the player has invented.

**Survival** is just more needs, solved with the same physics. There are no separate survival systems:

- **Suit energy:** the lamp and life support run on charge that Teta recharges. The first real reason to want steady power is staying alive in the dark.
- **Temperature:** deep layers are hot and the surface is cold at night. Insulate with Lobime, or warm up with a stove built from Sormite fed by Hum.
- **Self-inflicted hazards:** runaway machines overheat, strained rock collapses, energy bursts throw the player around. Danger comes from careless experiments.
- **No food or hunger.** Biology is out of scope.
- **Gentle failure:** the player collapses and wakes at the ship, keeping all knowledge, Lama's records and every machine they built. Carried items may be lost. Knowledge is the progression, so it is never lost.

**Mining is an experiment, not a grind.** Every pick swing is an impact and every carried ore is weight and motion, so mining is where many early accidents happen. Machines need a handful of pieces, not stacks. Deeper layers are reached through understanding, not better picks. Large-scale automation is possible later but never required.

**Spoilers are the player's business.** As with a book or a film, avoiding spoilers is the player's choice. The world is the same for everyone, so guides stay valid. A stuck player can ask Lama for an opt-in hint in steps: where to look, then what to try, then the answer.

**Solo first, co-op friendly.** The game is designed for one player. Co-op (a shared lab with a friend) is welcome but never shapes the design. The only technical requirement now: the simulation is deterministic, so co-op stays possible later.

---

## 6. The world's physics (rule set v0)

The world is built from a small set of local rules. Everything interesting must emerge from combining them. This is a deliberately small first set: its job is to prove that a handful of rules already produces many routes and at least one "pulse circuit" moment.

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

These prove the rules are rich enough. None of them may exist as special code; each should simply happen when the right blocks are placed.

- **The bouncer (the pulse circuit).** Bormite resting on Exgen in a closed shaft. It falls, the impact fires Teta, the Teta throws it up, it falls again. The period depends on shaft height and any weight added. A Queflair next to it flashes every beat. Finding it, then learning to tune it, is the redstone pulse moment.
- **The buzzer.** A weight with a Bormite underside resting on Galog. Galog emits Teta, Teta lifts the weight, Galog stops, the weight drops, and it repeats. A second, unrelated clock built from different rules.
- **The runaway engine.** Moving Colomium hums, Sormite heats up, Lyegen emits Teta, and Teta pushes the cart carrying the Colomium faster. A feedback loop that overheats and cracks parts unless the player limits it.
- **The light link.** A Queflair seen from far away by a Ralgen delivers Teta at a distance.
- **The light switch.** Sliding Lobime into the beam cuts the signal. The first switch the player can work by hand.
- **The latch (memory).** A Queflair and a Ralgen facing each other keep each other going. One pulse turns it on, and it stays on until the light is blocked or the Queflair burns out. The second redstone-style moment, and the seed of programmable logic.
- **The invisible energy.** A Galog with stones piled on it, next to a Queflair, makes the Queflair glow, and nearby Bormite dust drifts away. The player learns that something exists that they cannot see. The first real science moment.

---

## 7. Discovery trees and how we measure them

**What a node is.** A node is a piece of *knowledge* the player can hold ("Galog emits something invisible when pressed", "heavier weights make the bounce slower"), not an item or an unlock. A goal is a *need* (a capability).

**How the tree works.** It is an AND/OR graph. A **route** is a set of knowledge that is enough together (AND). A need is met by *any one* of its routes (OR). The number of OR branches is the tree's width, and that is where the player's freedom lives.

**What we measure for each need:**

| Metric | Meaning | Target (first guess) |
| --- | --- | --- |
| Routes | Distinct minimal sets of knowledge that meet the need | 3 or more |
| Chokepoints | Knowledge that *every* route needs | None, or one that can itself be learned several ways |
| Accident paths | Ways a piece of knowledge can be noticed without trying | 1 or more for surface knowledge; deep knowledge may be prediction-only (pillar 3) |
| Depth payoff | How much a route improves with deeper knowledge | Noticeable at every depth |
| Useful patterns | Contraptions that serve several needs (clock, latch, light link) | A few emerge naturally; none solves everything |
| Efficiency spread | Gap between the obvious route and the best one | The best route is clearly better and rests on less obvious knowledge |

### The v0 routes, written by hand

Later, a solver produces this table automatically. Depth: **P** = phenomenon (knowing it happens), **R** = regularity (knowing how it scales).

| Need | Route | Knowledge it rests on | Depth |
| --- | --- | --- | --- |
| See in the dark | Queflair beside a loaded Galog | Pressed Galog emits something; it lights Queflair | P |
| See in the dark | Strobe lamp: Queflair beside a bouncer | Bouncer exists; flashing wears Queflair slower than steady glow | R |
| See in the dark | Remote lamp: Colomium hum → stone line → Sormite → Lyegen → Queflair | Hum travels through stone; the hum → heat → Teta chain | P |
| Get past Hard Rock | Hammer: a bouncer striking faster than the rock's strain recovers | Strain builds and recovers; pulse rate depends on height and weight | R |
| Get past Hard Rock | Furnace: Sormite against the rock, fed by Hum | Hum heats Sormite; heat strains stone | P |
| Get past Hard Rock | Runaway engine parked against the rock | Feedback loops exist and overheat | P |
| Get past Hard Rock | Go around: tunnel elsewhere | Teta pushes Bormite; the local geology | P |
| Keep time | Bouncer | Exgen fires on impact; Teta throws Bormite | P (R to tune) |
| Keep time | Buzzer | Galog stops when unloaded | P (R to tune) |
| Keep time | One-shot timer: Queflair burnout | Queflair burns out after a steady time | R |
| Keep time | Delay line: heat crawling along a stone bar to a Lyegen | Heat spreads slowly at a steady pace | R |
| Measure speed | Listen to Colomium's pitch | Pitch rises with speed | R |
| Measure speed | Count bouncer beats between two markers | A clock, plus distance ÷ time | R |
| Measure speed | Crash into an Exgen; see how far it throws Bormite | Burst size scales with impact | R |
| Signal over distance | Hum line ending in Sormite → Lyegen | Hum travels through stone; the chain | P |
| Signal over distance | Relay dominoes: Teta pushes a weight onto the next Galog | Galog fires under weight; Bormite is pushed | P |
| Signal over distance | Light link: a Ralgen that can see a far Queflair | Ralgen fires on glow; glow travels straight | P |
| Steady power | Two Galogs that swap loads so each rests | Galog tires and recovers, plus a clock to alternate | R |
| Steady power | Bouncer feeding a bank of Exgen | Bouncer; Exgen wear per hit | R |
| Steady power | Runaway engine with a limiter | Feedback, and how to cap it | R |

What this already shows: **branches share leaves, not trunks.** "Keep time" helps "steady power" and "get past Hard Rock", but neither requires it. Knowledge compounds without forcing an order.

### The solver and world search (design tools, not game features)

- **Solver.** A script that reads the same rules data the game uses and enumerates which combinations of elements and contraptions meet each need, filling in the metrics above. Run it every time the rules change.
- **World search.** Run the solver across many variations of the constants and element roles, score each world, and pick the most interesting as *the* world of the game. Score on: routes per need, how many oscillators and feedback loops emerge ("pulse circuit" moments), how rich the regularities are (behaviour that depends on tunable quantities in a non-trivial but learnable way), how many phenomena are prediction-only, and the absence of a dominant catch-all.

---

## 8. Three depths of understanding

1. **Phenomena:** what happens. ("Pressed Galog makes Queflair glow.")
2. **Regularities:** how much, how fast, in what proportion. ("A taller shaft makes a slower bouncer.")
3. **Mechanism:** why. This is the **EES** layer (Element Elementary Structure). Every element is secretly a small graph of nodes and edges. Energy flows through it along the path of least resistance, and the shape of that graph decides everything. How complex the flow is decides which energy the element emits; the structure's size decides which trigger sets it off. The element table is what the player sees from outside; the EES is the reason for it.

The EES is reached very late, by **breaking elements under control and measuring what comes out** (fragments and released energies), the way real physics learned about atoms. Only very complex tools can do this, and the system needs much more depth before this layer is reachable. **The EES is not part of v0.** For now it is only a constraint: the v0 behaviours should later be explainable by some underlying structure.

---

## 9. Knowledge and Lama

Bookkeeping is Lama's job; thinking is the player's.

| Who | Does what | Example |
| --- | --- | --- |
| Lama, automatically | Logs every phenomenon the player actually witnessed (in view or on an instrument) | "Queflair glowed next to a weighted Galog." |
| Lama, when asked | Does the math: tabulates the measurements the player chose to take and fits a curve | "Bounce period against shaft height: rises steadily." |
| The player, lightly | Names things and groups observations into definitions, in one quick gesture | Naming the invisible push "Teta"; grouping three ores as "weight-fired" |
| The player only | Decides what to test, forms hypotheses, predicts | "A taller shaft should slow the hammer below Hard Rock's recovery." |

- Lama records **what** happened, never **why**, and never suggests a hypothesis.
- It logs only what the player actually saw. An accident nobody noticed teaches nothing.
- Once the player names something, Lama's log uses that name, so the record fills up with the player's own vocabulary.
- Lama gives hints only when asked (section 5).

---

## 10. Tools and systems

**Starting kit** (pillar 4: geometry yes, forces no):

- **Lama on the suit** measures length, mass and time from the first minute.
- **A pick and a pack:** impact and carrying. Nothing else.
- **A suit lamp with limited charge:** an early survival pressure and a reason to care about Glow.
- **No energy instruments.** Glow, Hum and Heat reach the senses; Teta doesn't. The first real instrument is one the player makes: a Teta detector, found when a Queflair lights up next to a loaded Galog.

**Building happens in the world.** Like redstone, machines are built directly from blocks in the world; the world is the workbench. Later tools make that work easier to keep and reuse, and arrive only once the player has built things worth saving, copying or programming:

- **Node Book.** The player's engineering notebook. It saves and names machines the player has already built, and shows their parts. It is not a recipe book: it never shows a machine the player hasn't made.
- **BluePrinter.** A fabricator that builds a copy of a design saved in the Node Book, from the materials you provide. It saves you rebuilding a machine by hand. It never unlocks anything you haven't already built yourself.
- **Terminal.** A console for programming machines.
- **Beep.** The game's visual programming language, closer to redstone than to text code: you connect *input → logic → output* modules into small programs and burn them onto **chips**. Chips are physical parts that grow out of the world's own physics (the bouncer and the latch are the first switches and memory). Programming is optional; it enables automation.

---

## 11. Rules for anyone building this game

These are binding constraints that follow from the pillars:

1. **Never special-case a machine, recipe or discovery** (pillar 1). If the bouncer only works because some code knows about bouncers, it's broken.
2. **No property shown in the player's view** (pillar 2). Developer debug views are fine, but they must be easy to turn off and never appear for players.
3. **Rules are local and data-driven.** Element and energy definitions live in data files, not code, so they can be tuned without programming.
4. **Deterministic simulation.** The same starting state and inputs always produce the same result. This keeps co-op possible and makes tests and the solver reliable.
5. **Simulation separate from presentation.** The simulation core must run headless (no rendering, no browser), so tests and the solver can drive it.
6. **Freedom is measured, not assumed** (pillar 7). Code should make it possible to count routes, detect emerging patterns and compare route efficiency.

---

## 12. Deferred and out of scope

**Deferred (known open problems for later):**

- How the player reaches the EES layer: the direction is set (controlled breaking with very complex tools), but the system needs more depth first.
- The player's own existence. In a game built on curiosity, leaving unexplained how the player's body works (and why it needs warmth and energy) is a weak spot. Tied to the biology question.

**Out of scope for now:** biology, creatures and any other beings; endings and story content; 3D, final art and sound design; co-op networking (only determinism is required now).

---

## 13. Glossary

| Term | Meaning |
| --- | --- |
| E623MU | The planet where the game takes place |
| Lama | The ship's AI; the game's record of the player's discoveries and the source of opt-in hints |
| Need | A capability the world pressures the player to achieve ("keep time") |
| Route | One way of meeting a need, resting on a particular set of knowledge |
| Discovery tree | All routes to all needs; it emerges from the rules and is never drawn by hand |
| Solver | Design tool that enumerates routes from the rules data |
| World search | Running the solver over many rule variations to pick the most interesting world |
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

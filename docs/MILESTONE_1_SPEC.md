# Milestone 1 spec: the crash site

This is the full specification for **milestone 1** of the 2D demo of The Quintessence Project. It is built in two sessions (an architecture session, then a build-out session); each session's prompt says which parts are its job.

Before anything else, read `GAME_OVERVIEW.md`, `CLAUDE.md`, `docs/SIMULATION.md` and `docs/TUNING.md`. The core pillars and build rules in the overview are binding. The decisions in this spec were made after the overview was written; where they differ, this spec wins (see "Corrections to the overview").

## The goal

A playable crash site in the browser. The player wakes next to their crashed ship on an alien planet, with a pick and a pack, and the world reacts to them through the same rules the sandbox proved. **No goals, no progression, no Lama, no survival yet.** The question this milestone answers: *does the world feel alive and surprising with only the player's senses?*

The sandbox stays as a developer tool. The game is a second entry point built on the same simulation core.

## What the player is

- **A physics body with mass,** about **2 cells wide and 3–4 cells tall** (block scale; the sandbox ranges were sized for this). The rules must treat the player like any other body:
  - standing on a cell **loads** it (a Galog under the player emits Teta, so a nearby Queflair glows)
  - landing on a cell is an **impact** at the landing speed (dropping onto an Exgen fires it)
  - the player collides with solid cells.
- **Teta does not push the player.** In v0, Teta pushes only Bormite, and that stays.
- **The pack's contents add to the player's mass.**
- **Hard rule:** no rule code may check "is this the player?" or "is this the pack?". The guard test against machine names should be extended to cover this.

## Controls and camera

- Keyboard: move left/right and jump. The camera follows the player.
- The mouse aims at cells **within reach** (about 4–5 cells; tune).
- **Left click: swing the pick.** Every swing is a real **impact** at the target cell, so hitting an Exgen fires it. Preferred approach, to confirm in plan mode: a cell is mined when the strain from swings exceeds its limit (the existing strain rule), so softer materials take one swing and tougher ones several. Hard Rock's limit is beyond what the pick can reach. A mined cell goes into the pack.
- **Right click: place** one cell from the selected pack slot into an empty cell within reach. Placed cells are **loose**: they fall and rest under gravity, so the player can stack stones on a Galog.
- A key **opens and closes the pack view** (see below). A key **enters and exits the ship** at its hatch.

## The pack

- The pack is a **small grid** (start with something like 4×3 cells; tune), **simulated by the same rules** as the world. It moves with the player as one body, so its contents share the player's velocity. When the player walks, any Colomium in the pack moves and therefore hums; when they stand still, it stops. Danger comes from the physics, never from a list of "bad pairs".
- **Pack walls are cells of a durable material.** Pushes inside the pack strain them like anything else:
  - a **small push** just reshuffles the contents (mildly annoying)
  - a **large push** strains the walls past their limit until they crack, and the contents spill into the world.
- **The grid is only visible when the pack is opened,** but **its effects leak out at all times:** glow lights the area around the player, heat shimmers, hum is heard, pushes show as a jolt.
- Heat in the pack: overheated materials crack and crumble (the existing strain rule). Heat hurting the suit belongs to milestone 3; don't build it now.
- Open question, propose in plan mode: does opening the pack pause the world? (Lean: no, the pack is physical and keeps running.)

## The ship

- The ship is **part of the world, built from real elements** (its hull is Lobime, which blocks all energies, so the player can notice it shields them from Teta).
- Entering the ship at its hatch opens an **interior screen**, like other 2D games. In milestone 1 the interior is just an empty, safe room. Lama's console arrives in milestone 2.

## Senses only: what the player perceives

No HUD shows any property of anything (pillar 2). Everything is perceived:

- **Darkness and light.** Underground areas and the cave are dark. Glow lights its surroundings. The player has **no lamp yet** (the suit lamp belongs to milestone 3), so a dark cave is a real problem, and carrying a glowing Queflair in is one answer.
- **Heat:** a shimmer and colour shift on hot cells.
- **Hum:** heard through simple synthesized audio (Web Audio). Pitch rises with Colomium's speed, and volume falls with distance. Dust jitters on humming surfaces.
- **Pushes:** seen as motion. Bormite dust visibly *drifting* away from a Teta source.

The only HUD in milestone 1: the selected pack slot, and the pack view when it's open.

## Rule changes from the sandbox report

1. **Mild air drag plus a softer mass scale,** so Bormite *drifts* away from a Teta source instead of being flung out of range. Drag must be a generic rule that applies to everything, not something Bormite-specific. Keep drag small.
2. **Terrain stays anchored** and can't collapse (for now). Mined-then-placed cells are loose and obey gravity.
3. After any rule change, **every sandbox scenario test must still pass.** Log each change and the reason in `docs/TUNING.md`. If a machine stops emerging, stop and tell me rather than forcing it.

## The crash site (handcrafted)

Store the map as an **editable data file**, preferably an ASCII map with a legend, so I can change the layout without code. A side view, roughly left to right:

1. **The ship,** crashed on flat ground, hatch facing the player's start position.
2. **Next to the ship: crash rubble (loose stones) resting on an exposed Galog vein,** with a **Queflair** a few cells away and some **Bormite dust** nearby. Because of the crash, the Queflair is already glowing and the dust already drifts when the game starts. This should be the first thing the player notices.
3. **A small hill with Colomium boulders** on top. Knocking one down the slope makes it hum as it rolls.
4. **A ledge with an Exgen below it,** so jumping down onto it fires it.
5. **A cave mouth** leading down into a **dark cave**. Inside, a **Queflair and a Ralgen** facing each other a short distance apart, so a stray pulse can latch them.
6. Deeper in the cave, a **Hard Rock wall** blocking the passage, with **Sormite and Lyegen** beyond it (unreachable for now).

Choose the map size and exact distances so each spot is a short walk from the next. Nothing on the map should tell the player what to do.

## Corrections to the overview

- The overview says energy bursts can throw the player. With the decision that Teta pushes only Bormite, they can't. Note this in `docs/ROADMAP.md` (below); don't edit the pillars.

## Tests

- All existing sandbox scenario tests still pass.
- New scenario tests, run headless with scripted inputs:
  - the player standing on a Galog makes a nearby Queflair glow; stepping off stops it
  - the player landing on an Exgen fires it, and the burst grows with fall height
  - Colomium in the pack hums while the player walks and stops when they stand still
  - a strong push inside the pack cracks its walls and spills the contents
  - mining: a soft cell breaks within a few swings; Hard Rock never breaks from the pick
  - Bormite dust drifts away from a Teta source and stays within a few cells, instead of being flung
- **Determinism:** a recorded input sequence replayed from the same start produces exactly the same world.
- The guard test fails if rule code references the player, the pack, or any machine name.

## Docs

- Create `docs/ROADMAP.md` with the six demo milestones (crash site; Lama's record; survival; building and instruments; the ship as needs; demo polish and blind playtests) and the milestone 1 decisions from this prompt.
- Update `CLAUDE.md` with how to run the game, the sandbox and the tests.
- When you finish, add a short **playtest checklist** to `docs/ROADMAP.md`: what I should try in the first five minutes to check the milestone works.

## Out of scope for this milestone

Lama and measuring, the suit lamp, survival (energy, temperature, collapse and respawn), bonding parts into machines, the Node Book, BluePrinter, Beep, progression, world generation, final art, and the EES layer.

## How to work (both sessions)

- Each session starts in **plan mode** and waits for my approval before writing code.
- Build in small, working steps and commit after each one.
- If a decision here seems to conflict with the pillars, or with getting the sandbox machines to keep emerging, **stop and ask me**. Don't quietly bend the rules.

# Roadmap: the 2D demo

The demo is built in six milestones. Each one adds one layer and ends with something playable. `GAME_OVERVIEW.md` holds the pillars and the build rules; each milestone has its own spec in `docs/`.

## The six milestones

| # | Milestone | What it adds | The question it answers |
| --- | --- | --- | --- |
| 1 | **The crash site** | A player with a pick and a pack in a handcrafted map, perceived through senses only. No goals, no Lama, no survival. | Does the world feel alive and surprising with only the player's senses? |
| 2 | **Lama's record** | Lama logs what the player actually witnessed, and measures length, mass and time. Lama's console in the ship. | Does a record of what you saw make the world learnable without explaining it? |
| 3 | **Survival** | Suit energy and the suit lamp, temperature, collapse and waking at the ship. | Do light pressures give direction without becoming a loop? |
| 4 | **Building and instruments** | Bonding parts into machines, the first instruments made from the world's elements. | Does understanding turn into machines, and do instruments open new layers? |
| 5 | **The ship as needs** | The ship as a list of capabilities to restore, met by whatever the player invents. | Do needs get met by several unrelated routes? |
| 6 | **Demo polish and blind playtests** | Art and sound passes, tuning, and playtests with people who know nothing. | Does someone with no instructions find the science on their own? |

## Milestone 1: status

Built in two sessions.

- **Session A (done): the simulation foundations.** Multi-cell bodies and the player's body, input as simulation input with exact replay, the pack as a carried grid, mining and placing. All headless. See `docs/HANDOFF_M1.md`.
- **Session B (to do): the game.** Rendering and camera, controls, the map file and its loader, audio, the pack view, the ship and its hatch, and the playtest checklist below.

## Milestone 1: decisions

Details and reasons are in `docs/SIMULATION.md` ("Decisions made in milestone 1") and `docs/TUNING.md` (entries 9 to 13).

- **The player is a body like any other.** A bonded 2×4 body of ordinary cells. It loads what it stands on, landing is an impact, it collides with solid cells. No rule code knows it is the player; the guard test fails if the core or the rules data mention the player or the pack.
- **Teta does not push the player.** In v0 Teta pushes only Bormite, and that stays.
- **The pack is a small grid run by the same rules,** carried by the player. Its contents share the player's motion and add to the player's weight, and what happens inside leaks out: glow, heat, hum and pushes.
- **The pack has compartments.** They are divided by Dense Lobime, which blocks every energy, so what is in one compartment does not reach the other. The player starts with two. The outer wall lets energies through and cracks under hard blows; what goes out is what goes through the hole.
- **Opening the pack does not pause the world.** The pack is physical and keeps running.
- **Mining is knocking a cell loose, not wearing it through.** Every swing is a real impact on the cell it hits. Soft elements come out in one swing, tougher ones in two or three, Hard Rock never. A mined cell keeps its wear. This replaced the spec's first idea (the strain limit), which could not work with the numbers the machines need.
- **A swing takes whatever it leaves loose** into the pack; a cell put down from the pack is loose and obeys gravity.
- **Terrain stays anchored** and cannot collapse, for now.
- **The ship's hull is Dense Lobime,** a stronger Lobime-type element the pick cannot chip.
- **Senses only.** No HUD shows a property of anything. The only HUD is the selected pack cell and the pack view.

## Open questions

- **Bormite dust is flung, not drifting.** The spec asked for mild air drag and a softer mass scale so that dust drifts away from a Teta source and stays within a few cells. Measured: neither achieves it, and even the mildest drag breaks the bouncer's weight order and the runaway engine. A flow limit on the push does achieve it, but it caps the runaway engine and stops the unweighted buzzer. It is in the code, switched off. Decision needed (`docs/TUNING.md`, entries 9 and 13).
- **Daylight.** Daylight cannot be Glow, or every Ralgen on the surface would fire all day. In milestone 1, darkness underground is a presentation choice. Whether daylight should be something the world's rules know about is open.
- **How long the first sight lasts.** A Queflair glowing at its cap burns out after about 2000 ticks, and a loaded Galog tires. The crash-site scene the player first notices therefore fades. Whether that is a feature or needs tuning is a map and tuning question for session B.

## Corrections to the overview

- **Overview §5 says energy bursts throw the player around.** With the decision that Teta pushes only Bormite, a burst does not push the player's body. One thing follows from the rules all the same: Teta pushes Bormite the player is *carrying*, and a push on what is in the pack is a push on the player. A player with enough Bormite in the pack is lifted off a loaded Galog. The pillars are unchanged.
- **Overview §5 says every pick swing is an impact,** and it is. What the overview does not say is how a swing mines; see the mining decision above.

## Playtest checklist

To be written by session B when the milestone is playable: what to try in the first five minutes to check that it works.

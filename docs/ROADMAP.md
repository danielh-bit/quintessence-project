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
- **Session B (done): the game.** `npm run game` (`game.html`, code in `src/play/`). The crash site as an editable picture (`maps/crash-site.txt`, loaded by `src/game/map.ts`), rendering at block scale with a following camera, keyboard and mouse controls, the pack view and selected-slot HUD, the empty ship interior, darkness and light, heat shimmer, hum as Web Audio, and the jolt of a push. The core, `rules/` and every earlier test are unchanged.
- **Decisions in session B.** Entering the ship is UI state only: the world keeps running, the body stays at the hatch, and the hull (Dense Lobime) keeps it safe, so replay is not affected. Darkness is a presentation choice: daylight per cell is computed once from the map's open sky and falls off quickly into rock and slowly through air; underground, Glow is the only light. The terrain is Hard Rock because it lets hum through (Lobime blocks it, so a hum could not be heard through a Lobime floor); Lobime outcrops and loose stones are what the player can dig up and carry. The pack's selected slot snaps to the next occupied cell.

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

- **Bormite dust is flung, not drifting (seen in the game).** On the first tick the crash-site dust leaves the rubble and ends up hard against the outcrop 8 cells away, or at the world's right edge, 150 cells away. The rules were left as they are. The decision is still open. The spec asked for mild air drag and a softer mass scale so that dust drifts away from a Teta source and stays within a few cells. Measured: neither achieves it, and even the mildest drag breaks the bouncer's weight order and the runaway engine. A flow limit on the push does achieve it, but it caps the runaway engine and stops the unweighted buzzer. It is in the code, switched off. Decision needed (`docs/TUNING.md`, entries 9 and 13).
- **Daylight.** Daylight cannot be Glow, or every Ralgen on the surface would fire all day. In milestone 1, darkness underground is a presentation choice. Whether daylight should be something the world's rules know about is open.
- **How long the first sight lasts (measured).** The crash-site Queflair glows from tick 2 and burns out at about tick 2050: roughly 34 seconds at 60 ticks per second. If the player is not there to see it, or lights it themselves after it has gone, it is dark for good. Whether that is a feature or needs tuning (Queflair wear, or a map that keeps the Galog loaded) is open.
- **The pocket behind the Hard Rock wall is invisible.** Everything blocks Glow, so the Sormite and Lyegen beyond the wall can never be seen. That matches "unreachable for now" but means nothing hints at them.
- **Sound has not been heard by the author of this session.** The hearing is tested as pure functions (`tests/play/hum.test.ts`); how it sounds needs your ears.

## Corrections to the overview

- **Overview §5 says energy bursts throw the player around.** With the decision that Teta pushes only Bormite, a burst does not push the player's body. One thing follows from the rules all the same: Teta pushes Bormite the player is *carrying*, and a push on what is in the pack is a push on the player. A player with enough Bormite in the pack is lifted off a loaded Galog. The pillars are unchanged.
- **Overview §5 says every pick swing is an impact,** and it is. What the overview does not say is how a swing mines; see the mining decision above.

## Playtest checklist

Run `npm run game`. Do not read the map first; the point is what a stranger would see. Sound starts on your first key press or click, so use headphones if you can. About five minutes:

1. **First sight (0:00).** Stand still for a few seconds and look. Is a glow the first thing you notice? Does anything near it move? (The Queflair burns out after about 34 seconds. Note whether you saw it.)
2. **Move and jump.** `A`/`D`, `Space`. Walk into the loose stones at the rubble and the Queflair: they should be pushed, not walked through. Did the glow change when the stones moved?
3. **Dig and carry.** Aim the mouse at a stone within reach (the outline appears only then) and left-click. It should go into the pack (the slot at the bottom left fills). Open the pack with `Tab`: you should see it, and nothing else about it. Right-click to put it down somewhere; it should fall and rest.
4. **Weight and glow.** Within the first half minute, before the Queflair burns out, take the stones off the brown Galog and watch the glow; put them back. Does it follow the weight? (Once a Queflair has burnt out it is gone for good.)
5. **Hum.** Walk to the hill (east) and climb the 2-cell steps with jumps. Push a blue Colomium boulder off the top. Do you hear a tone? Does its pitch change as it speeds up, and does it fade as you walk away? Carry a Colomium cell in the pack and walk, then stand still: hum while walking, none while standing.
6. **The drop.** Climb the ledge further east and jump off the cliff onto the red Exgen. The Queflair beside it should flash and the dust beside it should be thrown. Jump from a lower step: is the flash weaker?
7. **The cave.** Walk down the trench to the east. It should get dark enough that you cannot see the way. Bring a glowing Queflair (mine one near the rubble, or carry stones to the Galog first) and see how far its light reaches. Find the two Queflair/Ralgen faces in the chamber. Can you make them light each other and stay lit? Can you break the pair by putting a Lobime stone between them?
8. **The wall.** Walk to the end of the passage. Does anything tell you what to do? (It should not.)
9. **The ship.** Go back to the ship and press `E` at its door, then `E` again. You should see an empty room, and then be back outside where you stood.
10. **The pack's leaks.** Mine the Queflair into the pack, then stand on the Galog vein (brown cells) and look for glow around you with the pack closed. Mine a piece of the red Exgen into the pack and jump off the ledge: does the screen jolt, and does anything react to the burst?

What to write down: anything you did not understand without being told, anything you saw that looked like a property (a number, a label, a bar), anything that felt dead, and where the world surprised you.

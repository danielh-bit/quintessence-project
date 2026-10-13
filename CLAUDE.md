# The Quintessence Project: rules sandbox

Read `GAME_OVERVIEW.md` before changing anything. This repo is currently a **rules sandbox**. It answers one question: do the v0 local rules (overview §6) produce the §6 machines on their own? It is not the game.

## Core pillars (overview §3), in short

1. **Author rules, not paths.** Only local rules. Nothing in code, data or content special-cases a machine, recipe or discovery. If a goal has too few routes, change the rules.
2. **Everything is observable before it is explained.** Every rule shows itself through something the player can perceive. No tooltip states a property. Lama keeps the records; the thinking stays with the player.
3. **Accidents early, predictions late.** Rules fire wherever their conditions are met. Surface phenomena get set off by accident; deep ones need prediction.
4. **Instruments are the progression.** The player starts measuring geometry (length, mass, time), not forces.
5. **Understanding pays.** Phenomena → regularities → mechanism. Deeper knowledge leads to more efficient solutions.
6. **Pressures, not quests.** Needs are capabilities, never items or orders.
7. **Discovery is a tree, not a chain.** Each need has many routes. The tree is a measured property of the rules, never drawn by hand.

## Binding rules (overview §11)

1. Never special-case a machine, recipe or discovery. `tests/guard.test.ts` fails if `src/core/**` or `rules/**` names a machine.
2. No property shown in the player's view. Developer overlays must be easy to turn off and must never appear for players. In the sandbox, the overlay is off by default (key `D`).
3. Rules are local and data-driven. Elements, energies and every tuning number live in `rules/v0.json`. Changing a strength or range never needs a code change.
4. Deterministic simulation: fixed timestep, no `Math.random` (seeded hash RNG only), fixed update order. The core avoids `Math.exp`/`pow`/`sin`, so results stay identical across JS engines.
5. Simulation separate from presentation. `src/core` has no DOM and no Node APIs; `tsconfig.core.json` has no DOM lib. It runs headless in tests and scripts.
6. Freedom is measured, not assumed. The code has to make counting routes and patterns possible later.

## Layout

- `rules/v0.json`: the whole rule set, loaded and validated by `src/core/rules.ts`.
- `src/core/`: the headless simulation (see `docs/SIMULATION.md` for the model and the tick order).
- `src/scenarios/`: machine setups built from plain blocks. They may name machines; the core may not.
- `src/ui/`: the browser sandbox.
- `tests/`: core unit tests, scenario (machine) tests, and the guard.
- `docs/SIMULATION.md`: design of the update model. `docs/TUNING.md`: log of every parameter change and why.

## Commands

```
npm install
npm run dev        # sandbox UI at http://localhost:5173
npm test           # all tests (headless)
npm run typecheck  # core without DOM, then everything
npm run build      # typecheck + production build
npm run sweep      # headless parameter sweeps (scripts/sweep.ts)
```

## Working rules for this repo

- If a machine doesn't emerge, change `rules/v0.json` (and log it in `docs/TUNING.md`), or write down which rule seems to be missing. Never add machine-aware code.
- If following the overview seems to conflict with getting a machine to emerge, stop and ask.
- Out of scope for now: the solver, Lama, the Node Book, BluePrinter, Beep, survival, EES, final art, 3D.

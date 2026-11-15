// Entry point of the game: the crash site, played in the browser.
//
// The simulation advances only by Game.step(input), at a fixed 60 ticks per
// second. Everything else here (camera, light, shimmer, sound, the pack view)
// reads the world and never writes it.

import playerJson from "../../data/player.json";
import rulesJson from "../../rules/v0.json";
import crashSite from "../../maps/crash-site.txt?raw";
import { loadRules } from "../core";
import { type Input, input, loadActorConfig, loadMap, parseMapText } from "../game";
import { Perception } from "../ui/perception";
import { bindControls } from "./controls";
import { computeDaylight } from "./daylight";
import { drawPack, drawSlot, occupiedSlots, packRect, type Slot } from "./hud";
import { HumVoice } from "./audio";
import { listen, loudRef, soundEnergies } from "./hum";
import { drawShip } from "./ship";
import { type Flash, View } from "./view";

const TICK_MS = 1000 / 60;
const MAX_TICKS_PER_FRAME = 5;

function start(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const devEl = document.getElementById("dev") as HTMLElement;

  const rules = loadRules(rulesJson);
  const config = loadActorConfig(playerJson);
  const loaded = loadMap(rules, config, parseMapText(crashSite));
  const game = loaded.game;
  const daylight = computeDaylight(game.world, loaded.sky);
  const perception = new Perception(rules);
  const view = new View(canvas, perception);
  const voice = new HumVoice();
  const heard = soundEnergies(rules);
  const heardRef = heard.map((e) => loudRef(rules, e));
  const ctx = canvas.getContext("2d")!;

  // UI state: never part of the simulation.
  const ui = { packOpen: false, inShip: false, slot: null as Slot | null, dev: false, facing: 1 as -1 | 1, jolt: 0, time: 0 };
  const flashes: Flash[] = [];

  const nearHatch = (): boolean => {
    const h = loaded.hatch;
    const b = game.bounds();
    if (!h || !b) return false;
    const overlapX = b.x < h.x + h.width + 2 && b.x + b.width > h.x - 1;
    const overlapY = b.y + b.height > h.y && b.y < h.y + h.height;
    return overlapX && overlapY;
  };

  const snapSlot = (): void => {
    const occ = occupiedSlots(game);
    if (occ.length === 0) {
      ui.slot = null;
      return;
    }
    const cur = ui.slot;
    if (cur && occ.some((s) => s.x === cur.x && s.y === cur.y)) return;
    ui.slot = occ.find((s) => !cur || s.y > cur.y || (s.y === cur.y && s.x > cur.x)) ?? occ[0];
  };

  const controls = bindControls(canvas, {
    togglePack: () => {
      ui.packOpen = !ui.packOpen;
    },
    toggleShip: () => {
      if (ui.inShip) ui.inShip = false;
      else if (nearHatch()) ui.inShip = true;
    },
    cycleSlot: (dir) => {
      const occ = occupiedSlots(game);
      if (occ.length === 0) return;
      const cur = ui.slot;
      let k = cur ? occ.findIndex((s) => s.x === cur.x && s.y === cur.y) : -1;
      k = k < 0 ? 0 : (k + dir + occ.length) % occ.length;
      ui.slot = occ[k];
    },
    click: (cx, cy) => {
      if (!ui.packOpen || ui.inShip) return false;
      const r = packRect(canvas, game.pack, view.cs);
      const rect = canvas.getBoundingClientRect();
      const px = ((cx - rect.left) * canvas.width) / rect.width;
      const py = ((cy - rect.top) * canvas.height) / rect.height;
      const x = Math.floor((px - r.x) / r.tile);
      const y = Math.floor((py - r.y) / r.tile);
      if (x < 0 || y < 0 || x >= r.cols || y >= r.rows) return false;
      if (game.isPackRoom(x, y)) ui.slot = { x, y };
      return true;
    },
    gesture: () => voice.unlock(),
  });

  /** The world cell under the mouse, if the hands reach it. */
  const aimCell = (): { x: number; y: number } | null => {
    if (ui.inShip) return null;
    const c = view.cellAt(controls.mouseX, controls.mouseY);
    return game.inReach(c.x, c.y) ? c : null;
  };

  let prevVx = 0;
  let prevVy = 0;
  const tick = (): void => {
    let inp: Input = input();
    if (!ui.inShip) {
      const move = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
      const aim = aimCell();
      inp = input({
        move: move as -1 | 0 | 1,
        jump: controls.jump,
        swing: controls.swing && aim ? { x: aim.x, y: aim.y } : null,
        place: controls.place && aim && ui.slot ? { x: aim.x, y: aim.y, slotX: ui.slot.x, slotY: ui.slot.y } : null,
      });
      if (move !== 0) ui.facing = move as -1 | 1;
    }
    game.step(inp);
    for (const e of game.events) flashes.push({ x: e.x, y: e.y, life: 8, kind: e.kind === "place" ? "place" : "swing" });
    // A jolt: a sudden change of the player's velocity that is not a jump, or the pack's walls giving way.
    const b = game.body();
    if (b) {
      const dv = Math.hypot(b.vx - prevVx, b.vy - prevVy);
      if (!inp.jump && dv > 0.12) ui.jolt = Math.max(ui.jolt, Math.min(1, (dv - 0.1) * 3));
      prevVx = b.vx;
      prevVy = b.vy;
    }
    if (game.pack.events.some((e) => e.kind === "degrade") || game.world.events.some((e) => e.kind === "transfer")) ui.jolt = Math.max(ui.jolt, 0.7);
    ui.jolt *= 0.92;
  };

  let last = performance.now();
  let acc = 0;
  const frame = (now: number): void => {
    acc += Math.min(100, now - last) / TICK_MS;
    last = now;
    let n = Math.floor(acc);
    acc -= n;
    if (n > MAX_TICKS_PER_FRAME) n = MAX_TICKS_PER_FRAME;
    for (let k = 0; k < n; k++) tick();
    snapSlot();
    voice.update(listen(game, heard, heardRef));
    ui.time = now / 1000;
    for (let k = flashes.length - 1; k >= 0; k--) if (--flashes[k].life <= 0) flashes.splice(k, 1);

    if (ui.inShip) drawShip(ctx, canvas, view.cs, ui.time);
    else {
      view.follow(game);
      view.render({ game, hatch: loaded.hatch, daylight, time: ui.time, jolt: ui.jolt, aim: aimCell(), flashes, facing: ui.facing, flat: ui.dev });
      if (ui.packOpen) drawPack(ctx, game, perception, packRect(canvas, game.pack, view.cs), ui.slot);
      drawSlot(ctx, game, perception, canvas, view.cs, ui.slot);
    }
    if (ui.dev) {
      const c = view.cellAt(controls.mouseX, controls.mouseY);
      devEl.textContent = `tick ${game.world.tick}\n` + JSON.stringify(game.world.inspect(c.x, c.y) ?? { x: c.x, y: c.y }, null, 1);
    }
    requestAnimationFrame(frame);
  };
  // Developer view: raw colours, no light, and what is in the cell under the mouse. Off unless asked for.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Backquote") {
      ui.dev = !ui.dev;
      devEl.hidden = !ui.dev;
    }
  });
  requestAnimationFrame(frame);
  // For tests and tinkering: with ?debug in the address, the game and view can be reached from the console.
  if (location.search.includes("debug")) Object.assign(window, { quintessence: { game, view, ui, controls } });
}

try {
  start();
} catch (e) {
  const d = document.createElement("div");
  d.id = "fatal";
  d.textContent = `The game could not start: ${e instanceof Error ? e.message : String(e)}`;
  document.body.replaceChildren(d);
  console.error(e);
}

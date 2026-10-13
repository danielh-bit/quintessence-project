// The sandbox application: owns the world, the run loop and the panels.
//
// The UI talks to the core only through its public API (src/core/index.ts).
// The simulation advances only by world.step(), a fixed tick; the speed
// setting chooses how many ticks run per animation frame.

import { loadScene, World, type RuleSet, type WorldEvent } from "../core";
import { SCENARIOS } from "../scenarios";
import { ControlBar, HELP, installShortcuts, SPEEDS } from "./controls";
import { errorText, h } from "./dom";
import { InspectorPanel } from "./inspector";
import { acceptDrops, downloadScene, pickFile, readJsonFile, sizeProblem } from "./io";
import { Messages } from "./messages";
import { defaultOverlay, type OverlayState } from "./overlay";
import { OverlayPanel } from "./overlay-panel";
import { Perception } from "./perception";
import { Renderer } from "./renderer";
import { ScenarioPanel } from "./scenario-panel";
import { Tools } from "./tools";
import { ToolsPanel } from "./tools-panel";

/** Where the current world came from (what Reset rebuilds). */
export type Source =
  | { kind: "scenario"; id: string; params: Record<string, number> }
  | { kind: "file"; name: string; json: unknown }
  | { kind: "blank"; width: number; height: number };

export interface Selection {
  x: number;
  y: number;
  /** Body followed while it moves (0 = a fixed position). */
  bodyId: number;
  /** Index of the selected cell within the body's (sorted) cells. */
  k: number;
}

export type AppEvent = "world" | "run" | "overlay" | "tool" | "frame";

/** Stop stepping within one frame after this long (keeps the page responsive). */
const FRAME_BUDGET_MS = 40;
const EVENT_LOG_MAX = 200;
const PREFS_KEY = "quintessence-sandbox-ui";

export class App {
  readonly rules: RuleSet;
  readonly perception: Perception;
  readonly messages = new Messages();
  readonly overlay: OverlayState;
  readonly tools: Tools;
  readonly renderer: Renderer;
  readonly root: HTMLElement;

  world: World;
  source: Source;
  sceneName = "scene";
  running = true;
  /** Ticks per animation frame (fractions: one tick every N frames). */
  speed = 1;
  /** Cell size in px; 0 = fit the view. */
  zoom = 0;
  selection: Selection | null = null;
  /** Events collected after every step (the core keeps only the last step's). */
  readonly eventLog: WorldEvent[] = [];
  eventSerial = 0;
  eventCounts: Record<WorldEvent["kind"], number> = { degrade: 0, loosen: 0 };
  tps = 0;

  private acc = 0;
  private stepsDone = 0;
  private tpsSample = { time: 0, steps: 0 };
  private readonly listeners = new Map<AppEvent, Array<() => void>>();
  private readonly scenarioPanel: ScenarioPanel;
  private renderFailed = false;

  constructor(mount: HTMLElement, rules: RuleSet) {
    this.rules = rules;
    this.perception = new Perception(rules);
    this.overlay = defaultOverlay(rules);
    this.loadPrefs();

    // A placeholder world until the first scenario is built.
    this.world = new World(rules, 16, 16);
    this.source = { kind: "blank", width: 16, height: 16 };
    this.tools = new Tools(this);

    const stage = h("main", { class: "stage" });
    this.renderer = new Renderer(this, stage);
    this.tools.attach(this.renderer.canvas);
    acceptDrops(stage, (f) => void this.loadFile(f));

    const controls = new ControlBar(this);
    const toolsPanel = new ToolsPanel(this);
    this.scenarioPanel = new ScenarioPanel(this);
    const overlayPanel = new OverlayPanel(this);
    const inspector = new InspectorPanel(this);
    const right = h("aside", { class: "panel right" }, [this.scenarioPanel.el, overlayPanel.el, inspector.el]);
    const help = h("footer", { class: "help", text: HELP });

    this.root = h("div", { class: "app" }, [controls.el, toolsPanel.el, stage, this.messages.el, right, help]);
    mount.replaceChildren(this.root);
    installShortcuts(this);

    const first = SCENARIOS[0];
    if (!first || !this.loadScenario(first.id, this.scenarioPanel.valuesFor(first.id) ?? {})) this.newBlank(96, 64);
  }

  // ------------------------------------------------------------------ events

  on(event: AppEvent, fn: () => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(fn);
    this.listeners.set(event, list);
  }

  emit(event: AppEvent): void {
    for (const fn of this.listeners.get(event) ?? []) fn();
  }

  // ------------------------------------------------------------------ worlds

  private setWorld(world: World, source: Source, name: string): void {
    this.world = world;
    this.source = source;
    this.sceneName = name;
    this.acc = 0;
    this.selection = null;
    this.eventLog.length = 0;
    this.eventCounts = { degrade: 0, loosen: 0 };
    this.tools.cancel();
    this.renderer.fit();
    this.emit("world");
  }

  /** Build a scenario; shows an error and keeps the current world on failure. */
  loadScenario(id: string, params: Record<string, number>): boolean {
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) {
      this.messages.error(`Unknown scenario "${id}".`);
      return false;
    }
    try {
      const world = s.build(this.rules, params);
      this.setWorld(world, { kind: "scenario", id, params: { ...params } }, s.name);
      this.messages.clear();
      return true;
    } catch (e) {
      this.messages.error(`Could not build "${s.name}": ${errorText(e)}`);
      return false;
    }
  }

  /** Build a world from parsed scene JSON (a loaded file). */
  loadSceneJson(json: unknown, fallbackName: string): boolean {
    try {
      if (typeof json !== "object" || json === null) throw new Error("scene: expected an object");
      const o = json as Record<string, unknown>;
      const problem = sizeProblem(o.width, o.height);
      if (problem) throw new Error(`scene: ${problem}`);
      const world = loadScene(this.rules, json);
      const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : fallbackName;
      this.setWorld(world, { kind: "file", name, json }, name);
      return true;
    } catch (e) {
      this.messages.error(`Could not load ${fallbackName}: ${errorText(e)}`);
      return false;
    }
  }

  async loadFile(file: File): Promise<void> {
    let json: unknown;
    try {
      json = await readJsonFile(file);
    } catch (e) {
      this.messages.error(errorText(e));
      return;
    }
    const base = file.name.replace(/\.json$/i, "") || "scene";
    if (this.loadSceneJson(json, base)) this.messages.info(`Loaded ${file.name} (tick ${this.world.tick}).`);
  }

  openFile(): void {
    pickFile((f) => void this.loadFile(f));
  }

  save(): void {
    try {
      const file = downloadScene(this.world, this.sceneName);
      this.messages.info(`Saved ${file}.`);
    } catch (e) {
      this.messages.error(`Could not save: ${errorText(e)}`);
    }
  }

  newBlank(width: number, height: number): void {
    const problem = sizeProblem(width, height);
    if (problem) {
      this.messages.error(`New world: ${problem}.`);
      return;
    }
    this.setWorld(new World(this.rules, width, height), { kind: "blank", width, height }, "blank");
  }

  /** Rebuild the current scenario (with the params shown), reload the last file, or a new blank. */
  reset(): void {
    const src = this.source;
    switch (src.kind) {
      case "scenario":
        this.loadScenario(src.id, this.scenarioPanel.valuesFor(src.id) ?? src.params);
        break;
      case "file":
        this.loadSceneJson(src.json, src.name);
        break;
      case "blank":
        this.newBlank(src.width, src.height);
        break;
    }
  }

  // ------------------------------------------------------------------ running

  setRunning(on: boolean): void {
    this.running = on;
    this.acc = 0;
    this.emit("run");
  }

  toggleRunning(): void {
    this.setRunning(!this.running);
  }

  /** One tick; pauses first if running. */
  stepOnce(): void {
    if (this.running) this.setRunning(false);
    this.advance(1);
  }

  setSpeed(speed: number): void {
    if (!SPEEDS.some((s) => s.value === speed)) return;
    this.speed = speed;
    this.acc = 0;
    this.savePrefs();
    this.emit("run");
  }

  setZoom(px: number): void {
    this.zoom = px;
    this.renderer.fit();
    this.emit("run");
  }

  /** Run n ticks, collecting events after each. */
  private advance(n: number): void {
    const t0 = performance.now();
    try {
      for (let k = 0; k < n; k++) {
        this.world.step();
        this.stepsDone++;
        for (const e of this.world.events) {
          this.eventLog.push(e);
          this.eventSerial++;
          this.eventCounts[e.kind] = (this.eventCounts[e.kind] ?? 0) + 1;
        }
        if (this.eventLog.length > EVENT_LOG_MAX) this.eventLog.splice(0, this.eventLog.length - EVENT_LOG_MAX);
        if (performance.now() - t0 > FRAME_BUDGET_MS) {
          this.acc = 0;
          break;
        }
      }
    } catch (e) {
      this.setRunning(false);
      this.messages.error(`Simulation error at tick ${this.world.tick}: ${errorText(e)}`);
    }
  }

  start(): void {
    const frame = (now: number) => {
      if (this.running) {
        this.acc += this.speed;
        const n = Math.floor(this.acc);
        this.acc -= n;
        if (n > 0) this.advance(n);
      }
      this.followSelection();
      try {
        this.renderer.render();
        this.renderFailed = false;
      } catch (e) {
        if (!this.renderFailed) this.messages.error(`Render error: ${errorText(e)}`);
        this.renderFailed = true;
      }
      this.measureTps(now);
      this.emit("frame");
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private measureTps(now: number): void {
    const s = this.tpsSample;
    if (s.time === 0) {
      s.time = now;
      s.steps = this.stepsDone;
      return;
    }
    const dt = now - s.time;
    if (dt >= 500) {
      this.tps = ((this.stepsDone - s.steps) * 1000) / dt;
      s.time = now;
      s.steps = this.stepsDone;
    }
  }

  // ------------------------------------------------------------------ overlay & selection

  setOverlay(on: boolean): void {
    this.overlay.enabled = on;
    this.root.classList.toggle("dev", on);
    if (!on && this.tools.tool === "inspect") this.tools.setTool("paint");
    this.emit("overlay");
  }

  setOverlayLayer(energy: number, on: boolean): void {
    this.overlay.energies[energy] = on;
    this.savePrefs();
    this.emit("overlay");
  }

  setOverlayFlag(key: Exclude<keyof OverlayState, "enabled" | "energies">, on: boolean): void {
    this.overlay[key] = on;
    this.savePrefs();
    this.emit("overlay");
  }

  /** Select a cell for the inspector; a loose cell is followed as its body moves. */
  select(x: number, y: number): void {
    const w = this.world;
    if (!w.inBounds(x, y)) return;
    const b = w.bodyAt(x, y);
    this.selection = { x, y, bodyId: b ? b.id : 0, k: b ? b.cells.indexOf(w.idx(x, y)) : -1 };
  }

  private followSelection(): void {
    const s = this.selection;
    if (!s || s.bodyId === 0) return;
    const b = this.world.bodies.get(s.bodyId);
    if (b && s.k >= 0 && s.k < b.cells.length) {
      const c = b.cells[s.k];
      s.x = this.world.xOf(c);
      s.y = this.world.yOf(c);
    } else s.bodyId = 0;
  }

  // ------------------------------------------------------------------ preferences (per viewer, optional)

  private loadPrefs(): void {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { speed?: number; energies?: boolean[]; flags?: Record<string, boolean> };
      if (typeof p.speed === "number" && SPEEDS.some((s) => s.value === p.speed)) this.speed = p.speed;
      if (Array.isArray(p.energies) && p.energies.length === this.overlay.energies.length) {
        this.overlay.energies = p.energies.map((v) => v === true);
      }
      if (p.flags) {
        for (const k of ["arrows", "strain", "velocity", "outlines", "anchors", "load", "events", "flat"] as const) {
          if (typeof p.flags[k] === "boolean") this.overlay[k] = p.flags[k];
        }
      }
    } catch {
      // Storage may be unavailable; defaults are fine.
    }
  }

  private savePrefs(): void {
    try {
      const { enabled: _enabled, energies, ...flags } = this.overlay;
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ speed: this.speed, energies, flags }));
    } catch {
      // Ignore: preferences are a convenience.
    }
  }
}

// Top bar (play/pause, step, speed, reset, new, save/load, tick counter) and
// the keyboard shortcuts.
//
// Speed is in ticks per animation frame. Fractions mean one tick every N
// frames. The simulation only ever advances by world.step(): the UI never
// passes time into the core.

import type { App } from "./app";
import { button, checkbox, h, setText } from "./dom";
import { MAX_SIDE } from "./io";

export const SPEEDS: Array<{ value: number; label: string }> = [
  { value: 1 / 8, label: "1/8" },
  { value: 1 / 4, label: "1/4" },
  { value: 1 / 2, label: "1/2" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 4, label: "4" },
  { value: 8, label: "8" },
  { value: 16, label: "16" },
];

/** Cell sizes offered by the zoom menu (0 = fit the view). */
export const ZOOMS = [0, 2, 3, 4, 6, 8, 12, 16, 24];

export const HELP =
  "Space play/pause · S or . step · R reset · D developer overlay · " +
  "P paint · E erase · B bond · U unbond · V shove · I inspect (overlay) · " +
  "1–9 element · F fixed/loose · [ ] brush · right-click or Alt-drag erases · drop a .json scene on the page to load it";

export class ControlBar {
  readonly el: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly speedSelect: HTMLSelectElement;
  private readonly zoomSelect: HTMLSelectElement;
  private readonly followInput: HTMLInputElement;
  private readonly tickLabel: HTMLElement;
  private readonly newW: HTMLInputElement;
  private readonly newH: HTMLInputElement;

  constructor(private readonly app: App) {
    this.playButton = button("Play", () => app.toggleRunning(), { class: "primary", title: "Play / pause (Space)" });
    const step = button("Step", () => app.stepOnce(), { title: "Advance one tick (S or .)" });

    this.speedSelect = h("select", { title: "Ticks per animation frame" });
    for (const s of SPEEDS) {
      const o = h("option", { text: s.label, attrs: { value: String(s.value) } });
      this.speedSelect.append(o);
    }
    this.speedSelect.addEventListener("change", () => {
      app.setSpeed(Number(this.speedSelect.value));
      this.speedSelect.blur();
    });

    this.zoomSelect = h("select", { title: "Cell size in pixels (fit = scale to the view)" });
    for (const z of ZOOMS) this.zoomSelect.append(h("option", { text: z === 0 ? "fit" : `${z} px`, attrs: { value: String(z) } }));
    this.zoomSelect.addEventListener("change", () => {
      app.setZoom(Number(this.zoomSelect.value));
      this.zoomSelect.blur();
    });

    const follow = checkbox("follow", app.followView, (on) => app.setFollowView(on), {
      class: "follow",
      title: "When the world is larger than the view, keep the largest moving body in sight",
    });
    this.followInput = follow.input;

    const reset = button("Reset", () => app.reset(), { title: "Rebuild the current scenario or reload the last file (R)" });

    const numberInput = (value: number, title: string) =>
      h("input", { class: "num", title, attrs: { type: "number", min: "1", max: String(MAX_SIDE), step: "1", value: String(value) } });
    this.newW = numberInput(app.world.width, "Width of a new blank world");
    this.newH = numberInput(app.world.height, "Height of a new blank world");
    const blank = button("New", () => app.newBlank(Number(this.newW.value), Number(this.newH.value)), {
      title: "A new blank world of this size",
    });

    const save = button("Save", () => app.save(), { title: "Download the world as a scene file" });
    const load = button("Load", () => app.openFile(), { title: "Load a scene file (or drop one on the world)" });

    this.tickLabel = h("span", { class: "tick" });

    this.el = h("header", { class: "topbar" }, [
      h("span", { class: "brand", text: "Quintessence sandbox" }),
      h("div", { class: "group" }, [this.playButton, step]),
      h("label", { class: "group lbl" }, [h("span", { text: "ticks/frame" }), this.speedSelect]),
      h("label", { class: "group lbl" }, [h("span", { text: "zoom" }), this.zoomSelect]),
      h("div", { class: "group" }, [follow.row]),
      h("div", { class: "group" }, [reset]),
      h("div", { class: "group" }, [this.newW, h("span", { class: "x", text: "×" }), this.newH, blank]),
      h("div", { class: "group" }, [save, load]),
      this.tickLabel,
    ]);

    app.on("run", () => this.sync());
    app.on("world", () => {
      this.newW.value = String(app.world.width);
      this.newH.value = String(app.world.height);
    });
    app.on("frame", () => setText(this.tickLabel, `tick ${app.world.tick}`));
    this.sync();
  }

  private sync(): void {
    const app = this.app;
    setText(this.playButton, app.running ? "Pause" : "Play");
    this.playButton.classList.toggle("running", app.running);
    this.speedSelect.value = String(app.speed);
    this.zoomSelect.value = String(app.zoom);
    this.followInput.checked = app.followView;
  }
}

function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return target.type !== "checkbox" && target.type !== "button";
  return false;
}

/** Keys that act once per press, never on auto-repeat. */
const TOGGLE_KEYS = new Set([" ", "d", "f", "r"]);

/** Global keyboard shortcuts (ignored while typing in a field). */
export function installShortcuts(app: App): void {
  // Buttons and checkboxes should not keep focus after a click, or Space
  // would both press them and toggle play.
  // (Mouse clicks only: e.detail is 0 for clicks made with the keyboard.)
  document.addEventListener("click", (e) => {
    if (e.detail === 0) return;
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement || (active instanceof HTMLInputElement && active.type === "checkbox")) active.blur();
  });

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape" && e.target instanceof HTMLElement) {
      e.target.blur();
      return;
    }
    if (typingInto(e.target)) return;
    const focused = e.target instanceof HTMLButtonElement || (e.target instanceof HTMLInputElement && e.target.type === "checkbox");
    if (focused && (e.key === " " || e.key === "Enter")) return;

    const tools = app.tools;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // Held keys repeat: toggles and reset act once per press (stepping and
    // the brush keys may repeat).
    if (e.repeat && TOGGLE_KEYS.has(key)) {
      e.preventDefault();
      return;
    }
    let handled = true;
    switch (key) {
      case " ":
        app.toggleRunning();
        break;
      case ".":
      case "s":
        app.stepOnce();
        break;
      case "r":
        app.reset();
        break;
      case "d":
        app.setOverlay(!app.overlay.enabled);
        break;
      case "p":
        tools.setTool("paint");
        break;
      case "e":
      case "0":
        tools.setTool("erase");
        break;
      case "b":
        tools.setTool("bond");
        break;
      case "u":
        tools.setTool("unbond");
        break;
      case "v":
        tools.setTool("shove");
        break;
      case "i":
        tools.setTool("inspect");
        break;
      case "f":
        tools.setAnchored(!tools.anchored);
        break;
      case "[":
        tools.stepBrush(-1);
        break;
      case "]":
        tools.stepBrush(1);
        break;
      default:
        if (/^[1-9]$/.test(key) && Number(key) < app.rules.elements.length) tools.setElement(Number(key));
        else handled = false;
    }
    if (handled) e.preventDefault();
  });
}

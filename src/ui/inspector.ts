// Inspector (developer overlay only): world.inspect(x, y) of the selected cell,
// refreshed every frame, plus the events of the last step and a short log.
// Its content is in the page only while the overlay is on (rule 11.2: nothing
// diagnostic for the player, not even hidden).

import type { WorldEvent } from "../core";
import type { App } from "./app";
import { fmt, h, setText } from "./dom";

const LOG_ROWS = 12;
const LIST_MAX = 30;

export class InspectorPanel {
  readonly el: HTMLElement;
  private readonly table: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly rows = new Map<string, HTMLElement>();
  private readonly lastEvents: HTMLElement;
  private readonly log: HTMLElement;
  private readonly content: HTMLElement[];
  private lastEventsKey = "";
  private logKey = "";

  constructor(private readonly app: App) {
    this.hint = h("p", { class: "desc", text: "Choose Inspect (I) and click a cell." });
    this.table = h("div", { class: "kv" });
    const keys = ["Cell", "Element", "Anchored", "Body", "Velocity", "Offset", "Support", "Strain", "Output", "Impact", "Load"];
    for (const k of keys) this.addRow(k, k);
    for (const en of app.rules.energies) this.addRow(`field:${en.id}`, en.name, "field");
    this.lastEvents = h("ul", { class: "events" });
    this.log = h("ul", { class: "events log" });
    this.content = [
      h("h3", { text: "Inspector" }),
      this.hint,
      this.table,
      h("h4", { text: "Events of the last step" }),
      this.lastEvents,
      h("h4", { text: "Recent events" }),
      this.log,
    ];
    this.el = h("section", { class: "section inspector" });
    app.on("frame", () => this.update());
    app.on("overlay", () => this.sync());
    // A new world: both event lists redraw.
    app.on("world", () => {
      this.lastEventsKey = "";
      this.logKey = "";
    });
    this.sync();
  }

  /** Attach the content while the overlay is on; empty it when it goes off. */
  private sync(): void {
    const on = this.app.overlay.enabled;
    this.el.hidden = !on;
    if (on) {
      if (this.el.childElementCount === 0) this.el.replaceChildren(...this.content);
      return;
    }
    this.el.replaceChildren();
    for (const v of this.rows.values()) v.textContent = "";
    this.lastEvents.replaceChildren();
    this.log.replaceChildren();
    this.lastEventsKey = "";
    this.logKey = "";
  }

  private addRow(key: string, label: string, cls = ""): void {
    const v = h("span", { class: "v" });
    this.rows.set(key, v);
    this.table.append(h("span", { class: `k ${cls}`.trim(), text: label }), v);
  }

  private set(key: string, text: string): void {
    const el = this.rows.get(key);
    if (el) setText(el, text);
  }

  private update(): void {
    const app = this.app;
    if (!app.overlay.enabled) return;
    const w = app.world;
    const sel = app.selection;
    const info = sel ? w.inspect(sel.x, sel.y) : null;
    this.table.hidden = !info;
    this.hint.hidden = !!info;
    if (info) {
      const els = w.rules.elements;
      const elIndex = info.element === null ? 0 : w.rules.elementIndex[info.element];
      const i = w.idx(info.x, info.y);
      this.set("Cell", `(${info.x}, ${info.y})${sel?.bodyId ? " following body" : ""}`);
      this.set("Element", info.element === null ? "empty" : `${els[elIndex].name} (${info.element})`);
      this.set("Anchored", info.element === null ? "-" : info.anchored ? "yes" : "no (loose)");
      const b = info.body;
      this.set("Body", b ? `#${b.id} · ${b.cells} cell${b.cells === 1 ? "" : "s"} · mass ${fmt(b.mass)}` : "-");
      this.set("Velocity", b ? `(${fmt(b.vx)}, ${fmt(b.vy)}) |v| ${fmt(Math.hypot(b.vx, b.vy))}` : "-");
      this.set("Offset", b ? `(${fmt(b.ox)}, ${fmt(b.oy)})` : "-");
      this.set("Support", b ? `${b.supported ? "supported" : "unsupported"}, ${b.resting ? "resting" : "not resting"}` : "-");
      const pct = Number.isFinite(info.strainMax) && info.strainMax > 0 ? ` (${((100 * info.strain) / info.strainMax).toFixed(1)}%)` : "";
      this.set("Strain", info.element === null ? "-" : `${fmt(info.strain)} / ${fmt(info.strainMax)}${pct}`);
      this.set("Output", fmt(info.output));
      this.set("Impact", fmt(info.impact));
      this.set("Load", fmt(info.load));
      for (const en of w.rules.energies) {
        let text = fmt(info.fields[en.id] ?? 0);
        const dx = w.dirX[en.index];
        const dy = w.dirY[en.index];
        if (dx && dy && (dx[i] !== 0 || dy[i] !== 0)) text += `  dir (${fmt(dx[i])}, ${fmt(dy[i])})`;
        const pitch = w.pitch[en.index];
        if (pitch && pitch[i] !== 0) text += `  pitch ${fmt(pitch[i])}`;
        if (w.ownField[en.index][i] !== 0) text += `  own ${fmt(w.ownField[en.index][i])}`;
        this.set(`field:${en.id}`, text);
      }
    }

    const lastKey = `${w.tick}:${w.events.length}`;
    if (lastKey !== this.lastEventsKey) {
      this.lastEventsKey = lastKey;
      this.fill(this.lastEvents, w.events, "none");
    }
    const recent = app.eventLog.slice(-LOG_ROWS).reverse();
    const logKey = String(app.eventSerial);
    if (logKey !== this.logKey) {
      this.logKey = logKey;
      this.fill(this.log, recent, "none yet");
    }
  }

  private fill(list: HTMLElement, events: readonly WorldEvent[], empty: string): void {
    const els = this.app.rules.elements;
    const shown = events.slice(0, LIST_MAX);
    const items = shown.map((e) =>
      h("li", {
        text: `t${e.tick} ${e.kind} ${els[e.element]?.name ?? "?"} → ${e.into === 0 ? "empty" : (els[e.into]?.name ?? "?")} at (${e.x}, ${e.y})`,
      }),
    );
    if (events.length === 0) items.push(h("li", { class: "none", text: empty }));
    if (events.length > shown.length) items.push(h("li", { class: "none", text: `+${events.length - shown.length} more` }));
    list.replaceChildren(...items);
  }
}

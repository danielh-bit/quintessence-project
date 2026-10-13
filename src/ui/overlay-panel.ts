// Right-panel section for the developer overlay: the on/off checkbox (also
// key D), one layer checkbox per energy from the rules with its colour and the
// current maximum, the other diagnostic layers, and a stats line.
// Everything except the on/off checkbox is out of the page while the overlay
// is off.

import type { App } from "./app";
import { css, overlayColor, STRAIN_RGB } from "./colors";
import { checkbox, fmt, h, setText } from "./dom";
import type { OverlayState } from "./overlay";

type Flag = Exclude<keyof OverlayState, "enabled" | "energies">;

const FLAGS: Array<{ key: Flag; label: string; title: string }> = [
  { key: "arrows", label: "Direction arrows", title: "Direction of directional energies whose layer is on" },
  { key: "strain", label: "Strain", title: "Cells tinted by strain / strain max" },
  { key: "velocity", label: "Velocity", title: "Line per moving body (10 ticks of motion)" },
  { key: "outlines", label: "Body outlines", title: "Bonded bodies outlined; faint outline on one-cell loose bodies" },
  { key: "anchors", label: "Anchored marks", title: "Dot on anchored cells" },
  { key: "load", label: "Load", title: "Weight resting on each cell" },
  { key: "events", label: "Event marks", title: "Recent degrade / loosen events" },
  { key: "flat", label: "Flat colours", title: "Raw element colours, no lighting" },
];

export class OverlayPanel {
  readonly el: HTMLElement;
  private readonly toggle: HTMLInputElement;
  private readonly body: HTMLElement;
  private readonly maxLabels: HTMLElement[] = [];
  private readonly stats: HTMLElement;
  private readonly energyInputs: HTMLInputElement[] = [];
  private readonly flagInputs = new Map<Flag, HTMLInputElement>();

  constructor(private readonly app: App) {
    const s = app.overlay;
    const main = checkbox("Developer overlay (D)", s.enabled, (on) => app.setOverlay(on), {
      class: "dev-toggle",
      title: "Diagnostics the player never sees. Off by default.",
    });
    this.toggle = main.input;

    const layers = h("div", { class: "layers" });
    for (const en of app.rules.energies) {
      const c = overlayColor(en.index);
      const cb = checkbox("", s.energies[en.index] ?? false, (on) => app.setOverlayLayer(en.index, on), {
        title: `${en.name}: ${en.spread} spread`,
      });
      const label = cb.row.querySelector("span")!;
      label.replaceChildren(
        h("span", { class: "swatch", attrs: { style: `background:${css(c)}` } }),
        h("span", { text: `${en.name} ` }),
        h("span", { class: "spread", text: en.spread }),
      );
      const max = h("span", { class: "max" });
      this.maxLabels[en.index] = max;
      this.energyInputs[en.index] = cb.input;
      layers.append(h("div", { class: "layer" }, [cb.row, max]));
    }

    const flags = h("div", { class: "flags" });
    for (const f of FLAGS) {
      const cb = checkbox(f.label, s[f.key], (on) => app.setOverlayFlag(f.key, on), { title: f.title });
      if (f.key === "strain") {
        cb.row.querySelector("span")!.prepend(h("span", { class: "swatch", attrs: { style: `background:${css(STRAIN_RGB)}` } }));
      }
      this.flagInputs.set(f.key, cb.input);
      flags.append(cb.row);
    }

    this.stats = h("div", { class: "stats" });
    this.body = h("div", { class: "dev-body" }, [h("h4", { text: "Fields (colour = intensity, legend = max)" }), layers, h("h4", { text: "Layers" }), flags, this.stats]);
    this.el = h("section", { class: "section" }, [h("h3", { text: "Developer" }), main.row, this.body]);

    app.on("overlay", () => this.sync());
    app.on("frame", () => this.update());
    this.sync();
  }

  private sync(): void {
    const s = this.app.overlay;
    this.toggle.checked = s.enabled;
    if (s.enabled && this.body.parentNode !== this.el) this.el.append(this.body);
    if (!s.enabled && this.body.parentNode === this.el) {
      this.body.remove();
      this.stats.textContent = "";
      for (const m of this.maxLabels) if (m) m.textContent = "";
    }
    s.energies.forEach((on, i) => {
      if (this.energyInputs[i]) this.energyInputs[i].checked = on;
    });
    for (const [k, input] of this.flagInputs) input.checked = s[k];
  }

  private update(): void {
    const app = this.app;
    if (!app.overlay.enabled) return;
    const maxes = app.renderer.overlay.maxField;
    for (const en of app.rules.energies) setText(this.maxLabels[en.index], `max ${fmt(maxes[en.index])}`);
    const counts = Object.entries(app.eventCounts)
      .map(([k, n]) => `${n} ${k}`)
      .join(", ");
    setText(
      this.stats,
      `tick ${app.world.tick} · ${app.tps.toFixed(1)} ticks/s · ${app.world.bodies.size} bodies · events: ${counts || "none"} · rules ${app.rules.version}`,
    );
  }
}

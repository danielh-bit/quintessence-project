// Left panel: tools, placement (fixed/loose), brush size and the element
// palette. The palette is generated from the loaded rule set.
//
// In the player view the palette shows only a swatch and a name (no property
// is stated, not even in hidden markup). With the developer overlay on, each
// entry also shows its mass and a tooltip with its trigger and response from
// the rules; both are added when the overlay turns on and removed when it
// turns off.

import type { RuleSet } from "../core";
import type { App } from "./app";
import { button, h } from "./dom";
import { BRUSH_SIZES, TOOLS, type ToolId } from "./tools";

function describeElement(rules: RuleSet, index: number): string {
  const el = rules.elements[index];
  const t = el.trigger;
  const r = el.response;
  const trig = t.kind === "exposure" ? `exposure to ${rules.energies[t.energy].name}` : t.kind;
  const resp = r.kind === "emit" ? `emit ${rules.energies[r.energy].name}` : r.kind;
  const blocks = rules.energies.filter((e) => el.blocks[e.index]).map((e) => e.name);
  const into = el.degradesTo === 0 ? "crumbles" : `turns into ${rules.elements[el.degradesTo].name}`;
  return [
    `${el.name} (${el.id})`,
    `mass ${el.mass}`,
    `trigger: ${trig}`,
    `response: ${resp}`,
    `blocks: ${blocks.length ? blocks.join(", ") : "nothing"}`,
    `strain max ${el.strain.max}, then ${into}`,
  ].join("\n");
}

export class ToolsPanel {
  readonly el: HTMLElement;
  private readonly toolButtons = new Map<ToolId, HTMLButtonElement>();
  private readonly elementButtons: HTMLButtonElement[] = [];
  private devShown = false;
  private readonly eraserButton: HTMLButtonElement;
  private readonly fixedButton: HTMLButtonElement;
  private readonly looseButton: HTMLButtonElement;
  private readonly brushButtons = new Map<number, HTMLButtonElement>();

  constructor(private readonly app: App) {
    const tools = app.tools;
    const rules = app.rules;

    const toolGrid = h("div", { class: "grid2" });
    for (const t of TOOLS) {
      const b = button(t.label, () => tools.setTool(t.id), { class: "tool", title: `${t.hint} (${t.key})` });
      if (t.devOnly) b.classList.add("dev-only");
      this.toolButtons.set(t.id, b);
      toolGrid.append(b);
    }

    this.fixedButton = button("Fixed", () => tools.setAnchored(true), { title: "Place anchored cells (F toggles)" });
    this.looseButton = button("Loose", () => tools.setAnchored(false), { title: "Place loose cells that fall (F toggles)" });
    const placement = h("div", { class: "seg" }, [this.fixedButton, this.looseButton]);

    const brushes = h("div", { class: "seg" });
    for (const n of BRUSH_SIZES) {
      const b = button(String(n), () => tools.setBrush(n), { title: `Brush ${n}x${n} ([ and ] change it)` });
      this.brushButtons.set(n, b);
      brushes.append(b);
    }

    const palette = h("div", { class: "palette" });
    rules.elements.forEach((el, index) => {
      if (index === 0) return;
      const key = index <= 9 ? h("span", { class: "key", text: String(index) }) : h("span", { class: "key" });
      const b = button("", () => tools.setElement(index), { class: "elem" });
      b.append(h("span", { class: "swatch", attrs: { style: `background:${el.color}` } }), h("span", { class: "name", text: el.name }), key);
      this.elementButtons[index] = b;
      palette.append(b);
    });
    this.eraserButton = button("", () => tools.setTool("erase"), { class: "elem" });
    this.eraserButton.append(
      h("span", { class: "swatch eraser" }),
      h("span", { class: "name", text: "Eraser" }),
      h("span", { class: "key", text: "E" }),
    );
    palette.append(this.eraserButton);

    this.el = h("aside", { class: "panel left" }, [
      h("h3", { text: "Tools" }),
      toolGrid,
      h("h3", { text: "Placement" }),
      placement,
      h("h3", { text: "Brush" }),
      brushes,
      h("h3", { text: "Elements" }),
      palette,
    ]);

    app.on("tool", () => this.sync());
    app.on("overlay", () => this.sync());
    this.sync();
  }

  private sync(): void {
    const t = this.app.tools;
    const dev = this.app.overlay.enabled;
    for (const [id, b] of this.toolButtons) b.classList.toggle("active", t.tool === id);
    this.elementButtons.forEach((b, index) => {
      if (b) b.classList.toggle("active", t.tool === "paint" && t.element === index);
    });
    if (dev !== this.devShown) this.showProperties(dev);
    this.eraserButton.classList.toggle("active", t.tool === "erase");
    this.fixedButton.classList.toggle("active", t.anchored);
    this.looseButton.classList.toggle("active", !t.anchored);
    for (const [n, b] of this.brushButtons) b.classList.toggle("active", t.brush === n);
  }

  /** Element properties (mass, tooltip) exist only in the developer view. */
  private showProperties(on: boolean): void {
    this.devShown = on;
    const rules = this.app.rules;
    this.elementButtons.forEach((b, index) => {
      if (!b) return;
      b.querySelector(".mass")?.remove();
      if (on) {
        b.title = describeElement(rules, index);
        b.querySelector(".key")?.before(h("span", { class: "mass", text: `m ${rules.elements[index].mass}` }));
      } else b.removeAttribute("title");
    });
  }
}

// Scenario picker: every entry of SCENARIOS, its description, a number input
// per parameter and a Load button. New scenarios appear here automatically.

import { SCENARIOS, type Scenario } from "../scenarios";
import type { App } from "./app";
import { button, h } from "./dom";

export class ScenarioPanel {
  readonly el: HTMLElement;
  private readonly select: HTMLSelectElement;
  private readonly desc: HTMLElement;
  private readonly params: HTMLElement;
  private inputs = new Map<string, HTMLInputElement>();
  private shown: Scenario | undefined;

  constructor(private readonly app: App) {
    this.select = h("select", { class: "wide" });
    for (const s of SCENARIOS) this.select.append(h("option", { text: s.name, attrs: { value: s.id } }));
    this.select.addEventListener("change", () => {
      this.show(this.select.value);
      this.select.blur();
    });
    this.desc = h("p", { class: "desc" });
    this.params = h("div", { class: "params" });
    const load = button("Load scenario", () => this.load(), { class: "primary wide", title: "Build this scenario with these parameters" });

    this.el = h("section", { class: "section" }, [h("h3", { text: "Scenario" }), this.select, this.desc, this.params, load]);
    if (SCENARIOS.length === 0) {
      this.select.disabled = true;
      load.disabled = true;
      this.desc.textContent = "No scenarios registered.";
    } else this.show(SCENARIOS[0].id);

    app.on("world", () => {
      const src = app.source;
      if (src.kind === "scenario" && src.id !== this.shown?.id) this.show(src.id, src.params);
    });
  }

  /** Show a scenario's description and parameter inputs. */
  show(id: string, values?: Record<string, number>): void {
    const s = SCENARIOS.find((x) => x.id === id);
    this.shown = s;
    this.params.replaceChildren();
    this.inputs = new Map();
    if (!s) return;
    this.select.value = s.id;
    this.desc.textContent = s.description;
    for (const [key, p] of Object.entries(s.params)) {
      const input = h("input", {
        class: "num",
        attrs: {
          type: "number",
          min: String(p.min),
          max: String(p.max),
          step: String(p.step ?? 1),
          value: String(values?.[key] ?? p.default),
        },
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.load();
      });
      this.inputs.set(key, input);
      this.params.append(h("label", { class: "param", title: `${p.min} to ${p.max}` }, [h("span", { text: p.label }), input]));
    }
  }

  /** Current input values for a scenario if it is the one shown, else null. Clamped to each param's range. */
  valuesFor(id: string): Record<string, number> | null {
    const s = this.shown;
    if (!s || s.id !== id) return null;
    const out: Record<string, number> = {};
    for (const [key, p] of Object.entries(s.params)) {
      const raw = Number(this.inputs.get(key)?.value);
      let v = Number.isFinite(raw) ? raw : p.default;
      if (v < p.min) v = p.min;
      if (v > p.max) v = p.max;
      out[key] = v;
      const input = this.inputs.get(key);
      if (input && Number(input.value) !== v) input.value = String(v);
    }
    return out;
  }

  private load(): void {
    const s = this.shown;
    if (!s) return;
    this.app.loadScenario(s.id, this.valuesFor(s.id) ?? {});
  }
}

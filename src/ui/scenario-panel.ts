// Scenario picker: every entry of SCENARIOS, its description, a number input
// per parameter and a Load button. New scenarios appear here automatically.
// The section folds away while the developer overlay is on (to make room for
// the inspector); its header still names the scenario and opens it again.

import { SCENARIOS, type Scenario, type ScenarioParam } from "../scenarios";
import type { App } from "./app";
import { button, h } from "./dom";

export class ScenarioPanel {
  readonly el: HTMLDetailsElement;
  private readonly current: HTMLElement;
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

    this.current = h("span", { class: "current" });
    const summary = h("summary", { title: "Show or hide the scenario picker" }, [h("h3", { text: "Scenario" }), this.current]);
    this.el = h("details", { class: "section scenario" }, [summary, this.select, this.desc, this.params, load]);
    this.el.open = !app.overlay.enabled;
    app.on("overlay", () => {
      this.el.open = !app.overlay.enabled;
    });
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
    this.current.textContent = s.name;
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

  /**
   * Current input values for a scenario if it is the one shown, else null.
   * An empty or unreadable box means the default; values are rounded to the
   * param's step and clamped to its range, and the boxes show what is used.
   */
  valuesFor(id: string): Record<string, number> | null {
    const s = this.shown;
    if (!s || s.id !== id) return null;
    const out: Record<string, number> = {};
    for (const [key, p] of Object.entries(s.params)) {
      const input = this.inputs.get(key);
      const v = paramValue(input?.value ?? "", p);
      out[key] = v;
      if (input && input.value !== String(v)) input.value = String(v);
    }
    return out;
  }

  private load(): void {
    const s = this.shown;
    if (!s) return;
    this.app.loadScenario(s.id, this.valuesFor(s.id) ?? {});
  }
}

/** A param box's text as the value to build with: default if empty, on the step grid, in range. */
export function paramValue(text: string, p: ScenarioParam): number {
  const raw = text.trim() === "" ? NaN : Number(text);
  let v = Number.isFinite(raw) ? raw : p.default;
  const step = p.step !== undefined && p.step > 0 ? p.step : 1;
  // Round to the step grid that starts at min (e.g. min 0, step 0.05).
  v = p.min + Math.round((v - p.min) / step) * step;
  // Drop float noise (0.1 + 0.2 ...) at the step's precision.
  v = Number(v.toFixed(decimals(step) + decimals(p.min)));
  if (v < p.min) v = p.min;
  if (v > p.max) v = p.max;
  return v;
}

/** Digits after the decimal point of a number as written (1e-7 counts 7). */
function decimals(n: number): number {
  const [mant, exp] = String(n).split("e");
  const dot = mant.indexOf(".");
  const d = (dot < 0 ? 0 : mant.length - dot - 1) - (exp ? Number(exp) : 0);
  return Math.max(0, Math.min(20, d));
}

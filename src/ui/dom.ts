// Tiny DOM helpers. No framework: the sandbox UI is plain DOM + canvas.

type Listeners = { [E in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[E]) => void };

export interface HOpts {
  class?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string>;
  on?: Listeners;
}

/** Create an element with a class, text, attributes, listeners and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: HOpts = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (opts.class) el.className = opts.class;
  if (opts.text !== undefined) el.textContent = opts.text;
  if (opts.title) el.title = opts.title;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
  if (opts.on) {
    for (const [k, fn] of Object.entries(opts.on)) el.addEventListener(k, fn as EventListener);
  }
  for (const c of children) el.append(c);
  return el;
}

/** Set text only when it changed (cheap to call every frame). */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function button(label: string, onClick: () => void, opts: HOpts = {}): HTMLButtonElement {
  const b = h("button", { ...opts, text: label, attrs: { type: "button", ...(opts.attrs ?? {}) } });
  b.addEventListener("click", onClick);
  return b;
}

export function checkbox(label: string, checked: boolean, onChange: (on: boolean) => void, opts: HOpts = {}): {
  row: HTMLLabelElement;
  input: HTMLInputElement;
} {
  const input = h("input", { attrs: { type: "checkbox" } });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const row = h("label", { class: `check ${opts.class ?? ""}`.trim(), title: opts.title }, [input, h("span", { text: label })]);
  return { row, input };
}

/** Compact number formatting for diagnostics. */
export function fmt(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(3);
  if (a >= 0.001) return v.toFixed(4);
  return v.toExponential(2);
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

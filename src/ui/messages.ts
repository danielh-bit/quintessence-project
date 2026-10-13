// A visible message area for errors and short notices. Errors stay until
// dismissed or replaced; notices fade after a few seconds.

import { h } from "./dom";

export class Messages {
  readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private timer = 0;

  constructor() {
    this.text = h("span", { class: "msg-text" });
    const close = h("button", { class: "msg-close", text: "×", title: "Dismiss", attrs: { type: "button" } });
    close.addEventListener("click", () => this.clear());
    this.el = h("div", { class: "msg", attrs: { role: "status", "aria-live": "polite" } }, [this.text, close]);
  }

  info(message: string): void {
    this.show(message, "info");
    this.timer = window.setTimeout(() => this.clear(), 4000);
  }

  error(message: string): void {
    this.show(message, "error");
    console.warn(message);
  }

  clear(): void {
    window.clearTimeout(this.timer);
    this.el.className = "msg";
    this.text.textContent = "";
  }

  private show(message: string, kind: "info" | "error"): void {
    window.clearTimeout(this.timer);
    this.text.textContent = message;
    this.el.title = message;
    this.el.className = `msg show ${kind}`;
  }
}

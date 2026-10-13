// The world view: plain coloured squares, one per cell, scaled to fit.
//
// Player view (overlay off): only what can be perceived (see perception.ts).
// Still cells are drawn into a one-pixel-per-cell image that is scaled up
// without smoothing; loose bodies with a sub-cell offset are drawn on top at
// their offset so motion looks smooth. The developer overlay, the inspector
// highlight and the tool affordances (brush, rectangle, shove arrow) follow.

import type { App } from "./app";
import { hexOf } from "./colors";
import { h } from "./dom";
import { OverlayDrawer } from "./overlay";

export const MIN_CELL_PX = 2;
export const MAX_CELL_PX = 24;

export interface CellPoint {
  /** Integer cell (may be outside the world). */
  x: number;
  y: number;
  /** Position in cell units (fractional). */
  fx: number;
  fy: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly overlay: OverlayDrawer;
  /** Cell size in CSS pixels. */
  cs = 8;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base = document.createElement("canvas");
  private readonly baseCtx: CanvasRenderingContext2D;
  private baseImg: ImageData | null = null;
  private readonly rgb = new Float64Array(3);
  private dpr = 1;

  constructor(
    private readonly app: App,
    private readonly stage: HTMLElement,
  ) {
    this.canvas = h("canvas", { class: "world" });
    this.stage.append(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.baseCtx = this.base.getContext("2d")!;
    this.overlay = new OverlayDrawer(app.rules);
    new ResizeObserver(() => this.fit()).observe(this.stage);
  }

  /**
   * Pick the largest integer cell size that fits the stage (2..24 px), or the
   * fixed size chosen in the zoom menu (the stage then scrolls).
   */
  fit(): void {
    const w = this.app.world;
    const aw = Math.max(0, this.stage.clientWidth - 16);
    const ah = Math.max(0, this.stage.clientHeight - 16);
    let cs = this.app.zoom > 0 ? this.app.zoom : Math.floor(Math.min(aw / w.width, ah / w.height));
    if (!Number.isFinite(cs) || cs < MIN_CELL_PX) cs = MIN_CELL_PX;
    if (cs > MAX_CELL_PX) cs = MAX_CELL_PX;
    const dpr = window.devicePixelRatio || 1;
    const cssW = w.width * cs;
    const cssH = w.height * cs;
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (cs === this.cs && dpr === this.dpr && this.canvas.width === bw && this.canvas.height === bh) return;
    this.cs = cs;
    this.dpr = dpr;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = bw;
    this.canvas.height = bh;
  }

  /** The cell under a client (mouse) position. */
  cellAt(clientX: number, clientY: number): CellPoint {
    const w = this.app.world;
    const r = this.canvas.getBoundingClientRect();
    const fx = r.width > 0 ? ((clientX - r.left) / r.width) * w.width : 0;
    const fy = r.height > 0 ? ((clientY - r.top) / r.height) * w.height : 0;
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
  }

  render(): void {
    const app = this.app;
    const w = app.world;
    const s = app.overlay;
    const p = app.perception;
    const ctx = this.ctx;
    const cs = this.cs;
    const flat = s.enabled && s.flat;
    const rgb = this.rgb;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w.width * cs + 2, w.height * cs + 2);
    ctx.imageSmoothingEnabled = false;

    // Bodies drawn at a sub-cell offset are painted separately, on top.
    const moving = new Set<number>();
    for (const b of w.bodies.values()) if (b.ox !== 0 || b.oy !== 0) moving.add(b.id);

    // 1. Still cells (and the air behind moving bodies), one pixel per cell.
    if (!this.baseImg || this.baseImg.width !== w.width || this.baseImg.height !== w.height) {
      this.base.width = w.width;
      this.base.height = w.height;
      this.baseImg = this.baseCtx.createImageData(w.width, w.height);
    }
    const d = this.baseImg.data;
    const anyMoving = moving.size > 0;
    for (let i = 0; i < w.size; i++) {
      const asEmpty = anyMoving && w.elem[i] !== 0 && w.body[i] !== 0 && moving.has(w.body[i]);
      p.shade(w, i, rgb, flat, asEmpty);
      const o = i * 4;
      d[o] = rgb[0];
      d[o + 1] = rgb[1];
      d[o + 2] = rgb[2];
      d[o + 3] = 255;
    }
    this.baseCtx.putImageData(this.baseImg, 0, 0);
    ctx.drawImage(this.base, 0, 0, w.width * cs, w.height * cs);

    // 2. Moving loose bodies at their sub-cell offset.
    if (anyMoving) {
      for (const id of moving) {
        const b = w.bodies.get(id)!;
        for (const c of b.cells) {
          p.shade(w, c, rgb, flat);
          ctx.fillStyle = hexOf(rgb[0], rgb[1], rgb[2]);
          ctx.fillRect((w.xOf(c) + b.ox) * cs, (w.yOf(c) + b.oy) * cs, cs, cs);
        }
      }
    }

    // 3. Developer overlay (only when switched on).
    if (s.enabled) {
      this.overlay.draw(ctx, w, s, cs, app.eventLog);
      this.drawSelection(ctx, cs);
    }

    // 4. Tool affordances: brush outline, bond rectangle, shove arrow.
    app.tools.drawAffordances(ctx, cs);

    if (s.enabled) this.keepSelectionInView();
  }

  /** When the world is larger than the view, scroll to keep a followed body visible. */
  private keepSelectionInView(): void {
    const sel = this.app.selection;
    const st = this.stage;
    if (!sel || sel.bodyId === 0) return;
    if (st.scrollWidth <= st.clientWidth && st.scrollHeight <= st.clientHeight) return;
    const cx = this.canvas.offsetLeft + (sel.x + 0.5) * this.cs;
    const cy = this.canvas.offsetTop + (sel.y + 0.5) * this.cs;
    const mx = st.clientWidth * 0.2;
    const my = st.clientHeight * 0.2;
    if (cx < st.scrollLeft + mx || cx > st.scrollLeft + st.clientWidth - mx) st.scrollLeft = cx - st.clientWidth / 2;
    if (cy < st.scrollTop + my || cy > st.scrollTop + st.clientHeight - my) st.scrollTop = cy - st.clientHeight / 2;
  }

  private drawSelection(ctx: CanvasRenderingContext2D, cs: number): void {
    const sel = this.app.selection;
    if (!sel) return;
    const w = this.app.world;
    let ox = 0;
    let oy = 0;
    const b = w.bodyAt(sel.x, sel.y);
    if (b) {
      ox = b.ox;
      oy = b.oy;
    }
    const x = (sel.x + ox) * cs;
    const y = (sel.y + oy) * cs;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x - 1, y - 1, cs + 2, cs + 2);
    ctx.strokeStyle = "#ffe14d";
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(x - 1, y - 1, cs + 2, cs + 2);
    ctx.setLineDash([]);
  }
}

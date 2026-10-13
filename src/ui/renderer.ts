// The world view: plain coloured squares, one per cell, scaled to fit.
//
// Player view (overlay off): only what can be perceived (see perception.ts).
// Still cells are drawn into a one-pixel-per-cell image that is scaled up
// without smoothing; loose bodies with a sub-cell offset are drawn on top at
// their offset so motion looks smooth. The developer overlay, the inspector
// highlight and the tool affordances (brush, rectangle, shove arrow) follow.
//
// The canvas is only as large as the visible part of the stage and draws the
// visible cells only. A sizer element gives the stage the world's full size,
// so the stage scrolls natively; the canvas sticks to the visible area and
// draws at the scroll offset. Long worlds at large zoom stay cheap.

import type { Body } from "../core";
import type { App } from "./app";
import { hexOf } from "./colors";
import { h } from "./dom";
import { OverlayDrawer, type View } from "./overlay";

export const MIN_CELL_PX = 2;
export const MAX_CELL_PX = 24;
/** Margin around the world inside the stage (CSS px). */
const PAD = 8;
/**
 * Below this cell size a whole world is hard to read. A long, thin world then
 * fits its short side instead (up to LONG_FIT_PX) and scrolls along the long one.
 */
const READABLE_PX = 4;
const LONG_FIT_PX = 12;
/** A followed body is kept inside this fraction of the view from each edge. */
const FOLLOW_MARGIN = 0.25;
/** After the user scrolls or edits, the view does not follow for this long (ms). */
const FOLLOW_PAUSE_MS = 2500;
/** Bodies slower than this (cells/tick) are not followed in the player view. */
const FOLLOW_MIN_SPEED = 0.02;

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
  private readonly sizer: HTMLElement;
  private readonly base = document.createElement("canvas");
  private readonly baseCtx: CanvasRenderingContext2D;
  private baseImg: ImageData | null = null;
  private readonly rgb = new Float64Array(3);
  private dpr = 1;
  /** Visible area of the stage (CSS px). */
  private viewW = 0;
  private viewH = 0;
  /** Canvas position (CSS px) of the world's top-left corner in the last frame. */
  private originX = 0;
  private originY = 0;
  /** Last scroll position set by following (to tell the user's scrolling apart). */
  private autoScroll = { left: -1, top: -1 };
  private followPausedUntil = 0;

  constructor(
    private readonly app: App,
    private readonly stage: HTMLElement,
  ) {
    this.canvas = h("canvas", { class: "world" });
    this.sizer = h("div", { class: "sizer" }, [this.canvas]);
    this.stage.append(this.sizer);
    this.ctx = this.canvas.getContext("2d")!;
    this.baseCtx = this.base.getContext("2d")!;
    this.overlay = new OverlayDrawer(app.rules);
    new ResizeObserver(() => this.fit()).observe(this.stage);
    this.stage.addEventListener("scroll", () => {
      const a = this.autoScroll;
      if (Math.abs(this.stage.scrollLeft - a.left) > 1 || Math.abs(this.stage.scrollTop - a.top) > 1) this.pauseFollow();
    });
  }

  /** Scroll back to the world's top-left corner (a new world). */
  home(): void {
    this.stage.scrollLeft = 0;
    this.stage.scrollTop = 0;
    this.autoScroll = { left: this.stage.scrollLeft, top: this.stage.scrollTop };
    this.followPausedUntil = 0;
  }

  /** Stop following for a moment (the user scrolled, or is editing). */
  pauseFollow(ms = FOLLOW_PAUSE_MS): void {
    this.followPausedUntil = Math.max(this.followPausedUntil, performance.now() + ms);
  }

  /**
   * Choose the cell size: the zoom menu's, or the largest integer size that
   * fits the whole world (2..24 px). A long, thin world that would be tiny
   * fits its short side and scrolls along its length.
   */
  fit(): void {
    const w = this.app.world;
    const st = this.stage;
    const vw = st.clientWidth;
    const vh = st.clientHeight;
    const aw = Math.max(0, vw - 2 * PAD);
    const ah = Math.max(0, vh - 2 * PAD);
    let cs: number;
    if (this.app.zoom > 0) cs = this.app.zoom;
    else {
      cs = Math.floor(Math.min(aw / w.width, ah / w.height));
      if (cs < READABLE_PX) {
        const shortSide = Math.floor(Math.max(aw / w.width, ah / w.height));
        cs = Math.max(cs, Math.min(shortSide, LONG_FIT_PX));
      }
    }
    if (!Number.isFinite(cs) || cs < MIN_CELL_PX) cs = MIN_CELL_PX;
    if (cs > MAX_CELL_PX) cs = MAX_CELL_PX;
    const dpr = window.devicePixelRatio || 1;

    this.cs = cs;
    this.viewW = vw;
    this.viewH = vh;
    // The scrollable size: the world plus its margin, at least the view.
    const contentW = w.width * cs + 2 * PAD;
    const contentH = w.height * cs + 2 * PAD;
    this.sizer.style.width = `${contentW > vw ? contentW : vw}px`;
    this.sizer.style.height = `${contentH > vh ? contentH : vh}px`;
    this.canvas.style.width = `${vw}px`;
    this.canvas.style.height = `${vh}px`;
    const bw = Math.max(1, Math.round(vw * dpr));
    const bh = Math.max(1, Math.round(vh * dpr));
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    this.dpr = dpr;
  }

  /** The cell under a client (mouse) position. */
  cellAt(clientX: number, clientY: number): CellPoint {
    const r = this.canvas.getBoundingClientRect();
    const fx = (clientX - r.left - this.originX) / this.cs;
    const fy = (clientY - r.top - this.originY) / this.cs;
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
  }

  render(): void {
    const app = this.app;
    const w = app.world;
    const s = app.overlay;
    const p = app.perception;
    const st = this.stage;
    if (st.clientWidth !== this.viewW || st.clientHeight !== this.viewH || (window.devicePixelRatio || 1) !== this.dpr) this.fit();

    this.follow();

    const ctx = this.ctx;
    const cs = this.cs;
    const dpr = this.dpr;
    const flat = s.enabled && s.flat;
    const rgb = this.rgb;
    const vw = this.viewW;
    const vh = this.viewH;

    // Where the world's corner is on the canvas: centred when it fits, else
    // at the scroll offset. Rounded to whole device pixels for crisp cells.
    const worldW = w.width * cs;
    const worldH = w.height * cs;
    const ox = worldW + 2 * PAD <= vw ? Math.floor((vw - worldW) / 2) : Math.round((PAD - st.scrollLeft) * dpr) / dpr;
    const oy = worldH + 2 * PAD <= vh ? Math.floor((vh - worldH) / 2) : Math.round((PAD - st.scrollTop) * dpr) / dpr;
    this.originX = ox;
    this.originY = oy;
    const view: View = {
      x0: clamp(Math.floor(-ox / cs), 0, w.width),
      y0: clamp(Math.floor(-oy / cs), 0, w.height),
      x1: clamp(Math.ceil((vw - ox) / cs), 0, w.width),
      y1: clamp(Math.ceil((vh - oy) / cs), 0, w.height),
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (view.x1 <= view.x0 || view.y1 <= view.y0) return;
    // From here on, drawing is in world CSS pixels (cell * cs).
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    ctx.imageSmoothingEnabled = false;

    // Bodies drawn at a sub-cell offset are painted separately, on top.
    const moving: Body[] = [];
    const movingIds = new Set<number>();
    for (const b of w.bodies.values()) {
      if (b.ox !== 0 || b.oy !== 0) {
        moving.push(b);
        movingIds.add(b.id);
      }
    }

    // 1. Still cells (and the air behind moving bodies), one pixel per cell.
    const nx = view.x1 - view.x0;
    const ny = view.y1 - view.y0;
    if (!this.baseImg || this.baseImg.width < nx || this.baseImg.height < ny) {
      const bw = Math.min(w.width, Math.max(nx, Math.ceil(vw / cs) + 2));
      const bh = Math.min(w.height, Math.max(ny, Math.ceil(vh / cs) + 2));
      this.base.width = bw;
      this.base.height = bh;
      this.baseImg = this.baseCtx.createImageData(bw, bh);
    }
    const img = this.baseImg;
    const d = img.data;
    const anyMoving = moving.length > 0;
    for (let y = view.y0; y < view.y1; y++) {
      let i = y * w.width + view.x0;
      let o = (y - view.y0) * img.width * 4;
      for (let x = view.x0; x < view.x1; x++, i++, o += 4) {
        const asEmpty = anyMoving && w.body[i] !== 0 && w.elem[i] !== 0 && movingIds.has(w.body[i]);
        p.shade(w, i, rgb, flat, asEmpty);
        d[o] = rgb[0];
        d[o + 1] = rgb[1];
        d[o + 2] = rgb[2];
        d[o + 3] = 255;
      }
    }
    this.baseCtx.putImageData(img, 0, 0, 0, 0, nx, ny);
    ctx.drawImage(this.base, 0, 0, nx, ny, view.x0 * cs, view.y0 * cs, nx * cs, ny * cs);

    // 2. Moving loose bodies at their sub-cell offset.
    for (const b of moving) {
      for (const c of b.cells) {
        const x = w.xOf(c);
        const y = w.yOf(c);
        if (x < view.x0 - 1 || x > view.x1 || y < view.y0 - 1 || y > view.y1) continue;
        p.shade(w, c, rgb, flat);
        ctx.fillStyle = hexOf(rgb[0], rgb[1], rgb[2]);
        ctx.fillRect((x + b.ox) * cs, (y + b.oy) * cs, cs, cs);
      }
    }

    // 3. Developer overlay (only when switched on).
    if (s.enabled) {
      this.overlay.draw(ctx, w, s, cs, view, app.eventLog);
      this.drawSelection(ctx, cs);
    }

    // 4. Tool affordances: brush outline, bond rectangle, shove arrow.
    app.tools.drawAffordances(ctx, cs);

    // The world's edge.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#1d212a";
    ctx.strokeRect(-0.5, -0.5, worldW + 1, worldH + 1);
  }

  /**
   * When the world is larger than the view, keep a moving thing in sight:
   * the inspected body (developer overlay), else the largest moving body.
   */
  private follow(): void {
    const app = this.app;
    const st = this.stage;
    const scrollsX = st.scrollWidth > st.clientWidth + 1;
    const scrollsY = st.scrollHeight > st.clientHeight + 1;
    if (!scrollsX && !scrollsY) return;
    if (app.tools.dragging || performance.now() < this.followPausedUntil) return;

    let tx: number;
    let ty: number;
    let vx = 0;
    let vy = 0;
    const sel = app.selection;
    const w = app.world;
    if (app.overlay.enabled && sel) {
      // An inspected cell takes over: follow its body, or stay put if it is fixed.
      if (sel.bodyId === 0) return;
      const b = w.bodies.get(sel.bodyId);
      tx = sel.x + 0.5 + (b?.ox ?? 0);
      ty = sel.y + 0.5 + (b?.oy ?? 0);
      vx = b?.vx ?? 0;
      vy = b?.vy ?? 0;
    } else {
      if (!app.followView) return;
      const b = leadBody(app.world.bodies.values());
      if (!b) return;
      let sx = 0;
      let sy = 0;
      for (const c of b.cells) {
        sx += w.xOf(c);
        sy += w.yOf(c);
      }
      tx = sx / b.cells.length + 0.5 + b.ox;
      ty = sy / b.cells.length + 0.5 + b.oy;
      vx = b.vx;
      vy = b.vy;
    }

    // Lazy follow: once the target leaves the middle band, scroll so that it
    // sits at the trailing edge of the band (the most room ahead of it).
    const cs = this.cs;
    let left = st.scrollLeft;
    let top = st.scrollTop;
    if (scrollsX) {
      const cx = PAD + tx * cs;
      const m = st.clientWidth * FOLLOW_MARGIN;
      if (cx < left + m || cx > left + st.clientWidth - m) left = vx >= 0 ? cx - m : cx - (st.clientWidth - m);
    }
    if (scrollsY) {
      const cy = PAD + ty * cs;
      const m = st.clientHeight * FOLLOW_MARGIN;
      if (cy < top + m || cy > top + st.clientHeight - m) top = vy >= 0 ? cy - m : cy - (st.clientHeight - m);
    }
    left = clamp(Math.round(left), 0, st.scrollWidth - st.clientWidth);
    top = clamp(Math.round(top), 0, st.scrollHeight - st.clientHeight);
    if (Math.abs(left - st.scrollLeft) >= 1 || Math.abs(top - st.scrollTop) >= 1) {
      st.scrollLeft = left;
      st.scrollTop = top;
      this.autoScroll = { left: st.scrollLeft, top: st.scrollTop };
    }
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

/** The body worth following: the largest one that moves (ties: the fastest). */
function leadBody(bodies: Iterable<Body>): Body | null {
  let best: Body | null = null;
  let bestSpeed = 0;
  for (const b of bodies) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed < FOLLOW_MIN_SPEED) continue;
    if (!best || b.cells.length > best.cells.length || (b.cells.length === best.cells.length && speed > bestSpeed)) {
      best = b;
      bestSpeed = speed;
    }
  }
  return best;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

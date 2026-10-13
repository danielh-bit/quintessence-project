// Developer overlay: everything diagnostic (energy fields, directions, strain,
// velocities, body outlines, anchors, load, events). Off by default; it never
// draws anything unless `enabled` is set (key D or the checkbox).
//
// Layers are generated from the rule set: one per energy, coloured by index.

import type { RuleSet, World } from "../core";
import { bodyColor, overlayColor, STRAIN_RGB, type RGB } from "./colors";

export interface OverlayState {
  enabled: boolean;
  /** Field layer per energy index. */
  energies: boolean[];
  /** Direction arrows for directional energies whose layer is on. */
  arrows: boolean;
  strain: boolean;
  velocity: boolean;
  outlines: boolean;
  anchors: boolean;
  load: boolean;
  events: boolean;
  /** Raw element colours, no lighting (diagnostic). */
  flat: boolean;
}

export function defaultOverlay(rules: RuleSet): OverlayState {
  return {
    enabled: false,
    energies: rules.energies.map(() => true),
    arrows: false,
    strain: true,
    velocity: true,
    outlines: true,
    anchors: true,
    load: false,
    events: true,
    flat: false,
  };
}

/** Event marks stay visible for this many ticks. */
const EVENT_TICKS = 90;
/** A velocity line shows where the body would be after this many ticks. */
const VELOCITY_TICKS = 10;
/** Maximum opacity of one field layer. */
const FIELD_ALPHA = 0.55;

export interface MarkedEvent {
  tick: number;
  x: number;
  y: number;
}

export class OverlayDrawer {
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  /** Largest field value per energy in the current frame (for the legend). */
  maxField: Float64Array;
  maxLoad = 0;

  constructor(rules: RuleSet) {
    this.ctx = this.canvas.getContext("2d")!;
    this.maxField = new Float64Array(rules.energies.length);
  }

  /** Field maxima, computed every frame while the overlay is on. */
  measure(w: World): void {
    for (const en of w.rules.energies) {
      const f = w.field[en.index];
      let m = 0;
      for (let i = 0; i < f.length; i++) if (f[i] > m) m = f[i];
      this.maxField[en.index] = m;
    }
    let ml = 0;
    for (let i = 0; i < w.size; i++) if (w.load[i] > ml) ml = w.load[i];
    this.maxLoad = ml;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    w: World,
    s: OverlayState,
    cs: number,
    recentEvents: readonly MarkedEvent[],
  ): void {
    this.measure(w);
    this.drawCellLayers(ctx, w, s, cs);
    if (s.anchors && cs >= 4) this.drawAnchors(ctx, w, cs);
    if (s.outlines) this.drawOutlines(ctx, w, cs);
    if (s.load) this.drawLoad(ctx, w, cs);
    if (s.arrows) this.drawArrows(ctx, w, s, cs);
    if (s.velocity) this.drawVelocities(ctx, w, cs);
    if (s.events) this.drawEvents(ctx, w, cs, recentEvents);
  }

  // Field intensities and strain, as translucent colour per cell.
  private drawCellLayers(ctx: CanvasRenderingContext2D, w: World, s: OverlayState, cs: number): void {
    const layers: Array<{ f: Float64Array; inv: number; c: RGB }> = [];
    for (const en of w.rules.energies) {
      const m = this.maxField[en.index];
      if (s.energies[en.index] && m > 0) layers.push({ f: w.field[en.index], inv: 1 / m, c: overlayColor(en.index) });
    }
    if (layers.length === 0 && !s.strain) return;
    if (!this.img || this.img.width !== w.width || this.img.height !== w.height) {
      this.canvas.width = w.width;
      this.canvas.height = w.height;
      this.img = this.ctx.createImageData(w.width, w.height);
    }
    const d = this.img.data;
    const els = w.rules.elements;
    for (let i = 0; i < w.size; i++) {
      let R = 0;
      let G = 0;
      let B = 0;
      let A = 0;
      for (const L of layers) {
        const v = L.f[i];
        if (v <= 0) continue;
        let a = Math.sqrt(v * L.inv) * FIELD_ALPHA;
        if (a > FIELD_ALPHA) a = FIELD_ALPHA;
        R = L.c[0] * a + R * (1 - a);
        G = L.c[1] * a + G * (1 - a);
        B = L.c[2] * a + B * (1 - a);
        A = a + A * (1 - a);
      }
      if (s.strain) {
        const el = w.elem[i];
        const st = w.strain[i];
        if (el !== 0 && st > 0) {
          let a = (st / els[el].strain.max) * 0.85;
          if (a > 0.85) a = 0.85;
          R = STRAIN_RGB[0] * a + R * (1 - a);
          G = STRAIN_RGB[1] * a + G * (1 - a);
          B = STRAIN_RGB[2] * a + B * (1 - a);
          A = a + A * (1 - a);
        }
      }
      const o = i * 4;
      if (A > 0) {
        d[o] = R / A;
        d[o + 1] = G / A;
        d[o + 2] = B / A;
        d[o + 3] = A * 255;
      } else d[o + 3] = 0;
    }
    this.ctx.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, w.width * cs, w.height * cs);
  }

  private drawAnchors(ctx: CanvasRenderingContext2D, w: World, cs: number): void {
    const r = Math.max(1, Math.round(cs / 6));
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    for (let i = 0; i < w.size; i++) {
      if (w.elem[i] === 0 || w.body[i] !== 0) continue;
      const cx = (w.xOf(i) + 0.5) * cs;
      const cy = (w.yOf(i) + 0.5) * cs;
      ctx.rect(cx - r, cy - r, 2 * r, 2 * r);
    }
    ctx.fill();
  }

  // Multi-cell bodies get a coloured outline; one-cell loose bodies a faint one.
  private drawOutlines(ctx: CanvasRenderingContext2D, w: World, cs: number): void {
    const W = w.width;
    for (const b of w.bodies.values()) {
      const multi = b.cells.length > 1;
      if (!multi && cs < 5) continue;
      const ox = b.ox * cs;
      const oy = b.oy * cs;
      ctx.beginPath();
      for (const c of b.cells) {
        const x = w.xOf(c);
        const y = w.yOf(c);
        const x0 = x * cs + ox;
        const y0 = y * cs + oy;
        const same = (nx: number, ny: number) =>
          nx >= 0 && ny >= 0 && nx < W && ny < w.height && w.body[ny * W + nx] === b.id && w.elem[ny * W + nx] !== 0;
        if (!same(x, y - 1)) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + cs, y0);
        }
        if (!same(x, y + 1)) {
          ctx.moveTo(x0, y0 + cs);
          ctx.lineTo(x0 + cs, y0 + cs);
        }
        if (!same(x - 1, y)) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0, y0 + cs);
        }
        if (!same(x + 1, y)) {
          ctx.moveTo(x0 + cs, y0);
          ctx.lineTo(x0 + cs, y0 + cs);
        }
      }
      ctx.strokeStyle = multi ? bodyColor(b.id) : "rgba(255,255,255,0.28)";
      ctx.lineWidth = multi ? Math.max(1, Math.min(2, cs / 6)) : 1;
      ctx.stroke();
    }
  }

  private drawLoad(ctx: CanvasRenderingContext2D, w: World, cs: number): void {
    if (this.maxLoad <= 0) return;
    if (cs >= 12) {
      ctx.font = `${Math.max(7, Math.floor(cs * 0.42))}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < w.size; i++) {
        const L = w.load[i];
        if (L <= 0) continue;
        const text = L >= 100 ? L.toFixed(0) : L >= 10 ? L.toFixed(0) : L.toFixed(1);
        const cx = (w.xOf(i) + 0.5) * cs;
        const cy = (w.yOf(i) + 0.5) * cs;
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillText(text, cx + 1, cy + 1);
        ctx.fillStyle = "#e6f0ff";
        ctx.fillText(text, cx, cy);
      }
    } else {
      // Too small for numbers: a small bar per loaded cell, scaled to the max.
      ctx.fillStyle = "rgba(230,240,255,0.85)";
      for (let i = 0; i < w.size; i++) {
        const L = w.load[i];
        if (L <= 0) continue;
        const hpx = Math.max(1, (L / this.maxLoad) * cs);
        ctx.fillRect(w.xOf(i) * cs, (w.yOf(i) + 1) * cs - hpx, Math.max(1, cs / 3), hpx);
      }
    }
  }

  // Direction of directional energies ("away from the source"), on a sparse grid.
  private drawArrows(ctx: CanvasRenderingContext2D, w: World, s: OverlayState, cs: number): void {
    const step = Math.max(1, Math.ceil(14 / cs));
    for (const en of w.rules.energies) {
      if (!en.directional || !s.energies[en.index]) continue;
      const dx = w.dirX[en.index];
      const dy = w.dirY[en.index];
      const f = w.field[en.index];
      const max = this.maxField[en.index];
      if (!dx || !dy || max <= 0) continue;
      const c = overlayColor(en.index);
      ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const full = step * cs * 0.9;
      for (let y = Math.floor(step / 2); y < w.height; y += step) {
        for (let x = Math.floor(step / 2); x < w.width; x += step) {
          const i = y * w.width + x;
          const v = f[i];
          if (v <= max * 0.01) continue;
          const vx = dx[i];
          const vy = dy[i];
          const mag = Math.sqrt(vx * vx + vy * vy);
          if (mag <= 1e-9) continue;
          // Length: strength (relative to the max) times how one-sided the field is.
          const len = full * Math.sqrt(v / max) * Math.min(1, mag / v);
          if (len < 2) continue;
          const ux = vx / mag;
          const uy = vy / mag;
          const sx = (x + 0.5) * cs - (ux * len) / 2;
          const sy = (y + 0.5) * cs - (uy * len) / 2;
          const ex = sx + ux * len;
          const ey = sy + uy * len;
          const hl = Math.min(5, len * 0.4);
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - hl * (ux * 0.87 - uy * 0.5), ey - hl * (uy * 0.87 + ux * 0.5));
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - hl * (ux * 0.87 + uy * 0.5), ey - hl * (uy * 0.87 - ux * 0.5));
        }
      }
      ctx.stroke();
    }
  }

  // A line per moving loose body, from its centroid along (vx, vy).
  private drawVelocities(ctx: CanvasRenderingContext2D, w: World, cs: number): void {
    ctx.strokeStyle = "#7dfcff";
    ctx.fillStyle = "#7dfcff";
    ctx.lineWidth = 1.5;
    for (const b of w.bodies.values()) {
      if (Math.abs(b.vx) < 1e-4 && Math.abs(b.vy) < 1e-4) continue;
      let sx = 0;
      let sy = 0;
      for (const c of b.cells) {
        sx += w.xOf(c);
        sy += w.yOf(c);
      }
      const n = b.cells.length;
      const cx = (sx / n + 0.5 + b.ox) * cs;
      const cy = (sy / n + 0.5 + b.oy) * cs;
      const ex = cx + b.vx * VELOCITY_TICKS * cs;
      const ey = cy + b.vy * VELOCITY_TICKS * cs;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawEvents(ctx: CanvasRenderingContext2D, w: World, cs: number, events: readonly MarkedEvent[]): void {
    ctx.lineWidth = 1.5;
    for (const e of events) {
      const age = w.tick - e.tick;
      if (age < 0 || age > EVENT_TICKS) continue;
      const a = 1 - age / (EVENT_TICKS + 1);
      ctx.strokeStyle = `rgba(255,80,200,${a.toFixed(3)})`;
      const x0 = e.x * cs;
      const y0 = e.y * cs;
      const p = Math.max(1, cs * 0.15);
      ctx.beginPath();
      ctx.moveTo(x0 + p, y0 + p);
      ctx.lineTo(x0 + cs - p, y0 + cs - p);
      ctx.moveTo(x0 + cs - p, y0 + p);
      ctx.lineTo(x0 + p, y0 + cs - p);
      ctx.stroke();
    }
  }
}

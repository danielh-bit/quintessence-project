// Editing tools and pointer handling on the world canvas.
//
//   paint   place the selected element (anchored or loose), brush 1/2/3/5;
//           dragging draws lines without gaps
//   erase   empty cells (also: right-click or Alt-drag with any tool)
//   bond    drag a rectangle; the loose cells in it are bonded (world.bond)
//   unbond  click a body to break it into one-cell bodies (world.unbond)
//   shove   press on a loose body and drag; on release its velocity is the
//           drag vector times SHOVE_FACTOR, capped at the rules' maxSpeed
//   inspect select a cell for the inspector (developer overlay only)

import type { App } from "./app";
import type { CellPoint } from "./renderer";

export type ToolId = "paint" | "erase" | "bond" | "unbond" | "shove" | "inspect";

export const TOOLS: Array<{ id: ToolId; label: string; key: string; devOnly?: boolean; hint: string }> = [
  { id: "paint", label: "Paint", key: "P", hint: "Place the selected element; drag to draw" },
  { id: "erase", label: "Erase", key: "E", hint: "Empty cells; drag to erase" },
  { id: "bond", label: "Bond", key: "B", hint: "Drag a rectangle to bond the loose cells in it" },
  { id: "unbond", label: "Unbond", key: "U", hint: "Click a body to break it apart" },
  { id: "shove", label: "Shove", key: "V", hint: "Press on a loose thing and drag to throw it" },
  { id: "inspect", label: "Inspect", key: "I", devOnly: true, hint: "Click a cell to inspect it" },
];

export const BRUSH_SIZES = [1, 2, 3, 5];

/** Velocity per cell of drag, in cells per tick. */
export const SHOVE_FACTOR = 0.1;

type Drag =
  | { kind: "stroke"; erase: boolean; lastX: number; lastY: number }
  | { kind: "rect"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "shove"; bodyId: number; fx0: number; fy0: number; fx1: number; fy1: number }
  | { kind: "inspect" };

export class Tools {
  tool: ToolId = "paint";
  /** Element index to paint (>= 1). */
  element = 1;
  /** Placement: anchored (fixed) or loose. */
  anchored = true;
  brush = 1;
  private hover: CellPoint | null = null;
  private drag: Drag | null = null;
  private altHeld = false;

  constructor(private readonly app: App) {}

  setTool(t: ToolId): void {
    if (t === "inspect" && !this.app.overlay.enabled) return;
    this.tool = t;
    this.drag = null;
    this.app.emit("tool");
  }

  setElement(index: number): void {
    if (index < 1 || index >= this.app.rules.elements.length) return;
    this.element = index;
    this.tool = "paint";
    this.app.emit("tool");
  }

  setAnchored(on: boolean): void {
    this.anchored = on;
    this.app.emit("tool");
  }

  setBrush(n: number): void {
    if (!BRUSH_SIZES.includes(n)) return;
    this.brush = n;
    this.app.emit("tool");
  }

  /** Step the brush size up or down the list. */
  stepBrush(dir: 1 | -1): void {
    const k = BRUSH_SIZES.indexOf(this.brush);
    this.setBrush(BRUSH_SIZES[Math.max(0, Math.min(BRUSH_SIZES.length - 1, k + dir))]);
  }

  /** Forget any drag in progress (e.g. the world was replaced). */
  cancel(): void {
    this.drag = null;
  }

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => this.down(e, canvas));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e, canvas));
    canvas.addEventListener("pointercancel", () => (this.drag = null));
    canvas.addEventListener("pointerleave", () => (this.hover = null));
    window.addEventListener("keydown", (e) => (this.altHeld = e.altKey));
    window.addEventListener("keyup", (e) => (this.altHeld = e.altKey));
    window.addEventListener("blur", () => (this.altHeld = false));
  }

  private down(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = this.app.renderer.cellAt(e.clientX, e.clientY);
    this.hover = p;
    const w = this.app.world;
    const eraseStroke = e.button === 2 || e.altKey;
    if (eraseStroke || this.tool === "paint" || this.tool === "erase") {
      const erase = eraseStroke || this.tool === "erase";
      this.drag = { kind: "stroke", erase, lastX: p.x, lastY: p.y };
      this.applyBrush(p.x, p.y, erase);
      return;
    }
    switch (this.tool) {
      case "bond":
        this.drag = { kind: "rect", x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        break;
      case "unbond":
        if (w.bodyAt(p.x, p.y)) w.unbond(p.x, p.y);
        break;
      case "shove": {
        const b = w.bodyAt(p.x, p.y);
        if (b) this.drag = { kind: "shove", bodyId: b.id, fx0: p.fx, fy0: p.fy, fx1: p.fx, fy1: p.fy };
        break;
      }
      case "inspect":
        if (this.app.overlay.enabled) {
          this.app.select(p.x, p.y);
          this.drag = { kind: "inspect" };
        }
        break;
      default:
        break;
    }
  }

  private move(e: PointerEvent): void {
    const p = this.app.renderer.cellAt(e.clientX, e.clientY);
    this.hover = p;
    this.altHeld = e.altKey;
    const d = this.drag;
    if (!d) return;
    switch (d.kind) {
      case "stroke":
        if (p.x !== d.lastX || p.y !== d.lastY) {
          line(d.lastX, d.lastY, p.x, p.y, (x, y) => this.applyBrush(x, y, d.erase));
          d.lastX = p.x;
          d.lastY = p.y;
        }
        break;
      case "rect":
        d.x1 = p.x;
        d.y1 = p.y;
        break;
      case "shove":
        d.fx1 = p.fx;
        d.fy1 = p.fy;
        break;
      case "inspect":
        this.app.select(p.x, p.y);
        break;
    }
  }

  private up(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const w = this.app.world;
    if (d.kind === "rect") {
      const cells: Array<[number, number]> = [];
      const [xa, xb] = [Math.max(0, Math.min(d.x0, d.x1)), Math.min(w.width - 1, Math.max(d.x0, d.x1))];
      const [ya, yb] = [Math.max(0, Math.min(d.y0, d.y1)), Math.min(w.height - 1, Math.max(d.y0, d.y1))];
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) cells.push([x, y]);
      if (cells.length > 0) w.bond(cells);
    } else if (d.kind === "shove") {
      const b = w.bodies.get(d.bodyId);
      if (!b || b.cells.length === 0) return;
      let vx = (d.fx1 - d.fx0) * SHOVE_FACTOR;
      let vy = (d.fy1 - d.fy0) * SHOVE_FACTOR;
      const cap = w.rules.world.maxSpeed;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > cap && speed > 0) {
        vx *= cap / speed;
        vy *= cap / speed;
      }
      const c = b.cells[0];
      w.setVelocity(w.xOf(c), w.yOf(c), vx, vy);
    }
  }

  /** Paint or erase a brush-sized square at (cx, cy). */
  private applyBrush(cx: number, cy: number, erase: boolean): void {
    const w = this.app.world;
    const n = this.brush;
    const off = Math.floor((n - 1) / 2);
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        const x = cx - off + dx;
        const y = cy - off + dy;
        if (!w.inBounds(x, y)) continue;
        const i = w.idx(x, y);
        if (erase) {
          if (w.elem[i] !== 0) w.erase(x, y);
          continue;
        }
        // Re-painting the same thing would reset its state: leave it.
        const anchoredHere = w.elem[i] !== 0 && w.body[i] === 0;
        if (w.elem[i] === this.element && anchoredHere === this.anchored) continue;
        w.place(x, y, this.element, { anchored: this.anchored });
      }
    }
  }

  /** Brush outline, bond rectangle and shove arrow (screen space, CSS px). */
  drawAffordances(ctx: CanvasRenderingContext2D, cs: number): void {
    const w = this.app.world;
    const d = this.drag;
    if (d?.kind === "rect") {
      const x = Math.min(d.x0, d.x1);
      const y = Math.min(d.y0, d.y1);
      const ww = Math.abs(d.x1 - d.x0) + 1;
      const hh = Math.abs(d.y1 - d.y0) + 1;
      ctx.fillStyle = "rgba(120,180,255,0.12)";
      ctx.fillRect(x * cs, y * cs, ww * cs, hh * cs);
      ctx.strokeStyle = "#8cc4ff";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x * cs + 0.5, y * cs + 0.5, ww * cs - 1, hh * cs - 1);
      ctx.setLineDash([]);
      return;
    }
    if (d?.kind === "shove") {
      const sx = d.fx0 * cs;
      const sy = d.fy0 * cs;
      const ex = d.fx1 * cs;
      const ey = d.fy1 * cs;
      const len = Math.hypot(ex - sx, ey - sy);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (len > 4) {
        const ux = (ex - sx) / len;
        const uy = (ey - sy) / len;
        const hl = Math.min(10, len * 0.4);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - hl * (ux * 0.87 - uy * 0.5), ey - hl * (uy * 0.87 + ux * 0.5));
        ctx.lineTo(ex - hl * (ux * 0.87 + uy * 0.5), ey - hl * (uy * 0.87 - ux * 0.5));
        ctx.closePath();
        ctx.fill();
      }
      return;
    }
    const p = this.hover;
    if (!p || !w.inBounds(p.x, p.y)) return;
    const brushTool = this.tool === "paint" || this.tool === "erase" || this.altHeld;
    const n = brushTool ? this.brush : 1;
    const off = Math.floor((n - 1) / 2);
    const erase = this.tool === "erase" || this.altHeld || (d?.kind === "stroke" && d.erase);
    ctx.lineWidth = 1;
    ctx.strokeStyle = erase ? "rgba(255,120,120,0.9)" : "rgba(255,255,255,0.75)";
    ctx.strokeRect((p.x - off) * cs + 0.5, (p.y - off) * cs + 0.5, n * cs - 1, n * cs - 1);
  }
}

/** Bresenham line from (x0, y0) to (x1, y1), excluding the start point. */
function line(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x1 > x0 ? 1 : -1;
  const sy = y1 > y0 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    plot(x, y);
  }
}

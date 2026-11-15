// The game view: plain coloured squares at block scale, a camera that follows
// the player, and nothing that states a property (pillar 2). Everything drawn is
// matter (its colour), light, the colour and shimmer of hot matter, and motion.
// This file only reads the simulation.

import type { World } from "../core";
import type { Game, HatchBox } from "../game";
import { hexOf } from "../ui/colors";
import { Perception } from "../ui/perception";

/** Roughly how many cells wide the view shows. */
const VIEW_CELLS_X = 56;
const VIEW_CELLS_Y = 32;
/** Unlit matter shows this much of its colour on the surface and deep underground. */
const AMBIENT_DAY = 0.5;
const AMBIENT_NIGHT = 0.035;
const SKY: [number, number, number] = [22, 30, 50];
/** Air that Glow lights is only visible against the dark; open sky washes it out. */
const HAZE_WASH = 0.95;
const AIR_BASE = [6, 7, 10];
/** Light on matter: a warm brightening on top of the lit colour, so a glow reads as light, not just less dark. */
const LIGHT_BOOST = [78, 58, 30];
/** Camera: share of the distance to the target covered per frame, and look-ahead in cells per cell/tick. */
const FOLLOW = 0.12;
const LOOK_AHEAD = 18;

export interface Flash {
  x: number;
  y: number;
  /** Frames left. */
  life: number;
  kind: "swing" | "place";
}

export interface ViewState {
  game: Game;
  hatch: HatchBox | null;
  daylight: Float32Array;
  /** Seconds, for shimmer only. */
  time: number;
  /** 0..1: how hard the last jolt was. */
  jolt: number;
  /** World cell under the mouse if the hands reach it. */
  aim: { x: number; y: number } | null;
  flashes: Flash[];
  facing: -1 | 1;
  /** Developer view: raw colours without light. Off for players. */
  flat: boolean;
}

export class View {
  readonly canvas: HTMLCanvasElement;
  /** Cell size in device pixels. */
  cs = 16;
  /** Camera centre in world cells. */
  camX = 0;
  camY = 0;
  /** Canvas position (device px) of the world's top-left corner in the last frame. */
  originX = 0;
  originY = 0;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base = document.createElement("canvas");
  private readonly baseCtx: CanvasRenderingContext2D;
  private baseImg: ImageData | null = null;
  private readonly rgb = new Float64Array(3);
  private snapped = false;
  readonly perception: Perception;

  constructor(canvas: HTMLCanvasElement, perception: Perception) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.baseCtx = this.base.getContext("2d")!;
    this.perception = perception;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.cs = Math.max(6, Math.min(40, Math.floor(Math.min(w / VIEW_CELLS_X, h / VIEW_CELLS_Y))));
  }

  /** World cell under a client (mouse) position. */
  cellAt(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const px = ((clientX - r.left) * this.canvas.width) / r.width;
    const py = ((clientY - r.top) * this.canvas.height) / r.height;
    return { x: Math.floor((px - this.originX) / this.cs), y: Math.floor((py - this.originY) / this.cs) };
  }

  /** Client (mouse) position of the middle of a world cell: the inverse of cellAt. */
  clientOf(x: number, y: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: r.left + (((x + 0.5) * this.cs + this.originX) * r.width) / this.canvas.width,
      y: r.top + (((y + 0.5) * this.cs + this.originY) * r.height) / this.canvas.height,
    };
  }

  /** Move the camera towards the player. `frames` is how many display frames have passed. */
  follow(game: Game): void {
    const b = game.body();
    const bb = game.bounds();
    if (!b || !bb) return;
    const world = game.world;
    const tx = bb.x + bb.width / 2 + b.ox + b.vx * LOOK_AHEAD;
    const ty = bb.y + bb.height / 2 + b.oy - 1;
    if (!this.snapped) {
      this.camX = tx;
      this.camY = ty;
      this.snapped = true;
    } else {
      this.camX += (tx - this.camX) * FOLLOW;
      this.camY += (ty - this.camY) * FOLLOW;
    }
    // Keep the view inside the world when the world is bigger than the view.
    const vw = this.canvas.width / this.cs;
    const vh = this.canvas.height / this.cs;
    this.camX = vw >= world.width ? world.width / 2 : Math.min(Math.max(this.camX, vw / 2), world.width - vw / 2);
    this.camY = vh >= world.height ? world.height / 2 : Math.min(Math.max(this.camY, vh / 2), world.height - vh / 2);
  }

  render(s: ViewState): void {
    const { game } = s;
    const w = game.world;
    const p = this.perception;
    const ctx = this.ctx;
    const cs = this.cs;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const shake = s.jolt * s.jolt;
    const sx = shake * Math.sin(s.time * 83) * cs * 0.5;
    const sy = shake * Math.cos(s.time * 71) * cs * 0.5;
    this.originX = Math.round(cw / 2 - this.camX * cs + sx);
    this.originY = Math.round(ch / 2 - this.camY * cs + sy);
    const ox = this.originX;
    const oy = this.originY;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#050608";
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;

    const x0 = clamp(Math.floor(-ox / cs), 0, w.width);
    const y0 = clamp(Math.floor(-oy / cs), 0, w.height);
    const x1 = clamp(Math.ceil((cw - ox) / cs), 0, w.width);
    const y1 = clamp(Math.ceil((ch - oy) / cs), 0, w.height);
    const nx = x1 - x0;
    const ny = y1 - y0;
    if (nx <= 0 || ny <= 0) return;

    // Loose bodies that sit off their cell are painted separately, on top.
    const moving = [];
    const movingIds = new Set<number>();
    for (const b of w.bodies.values()) {
      if (b.ox !== 0 || b.oy !== 0) {
        moving.push(b);
        movingIds.add(b.id);
      }
    }

    if (!this.baseImg || this.baseImg.width < nx || this.baseImg.height < ny) {
      this.base.width = nx + 4;
      this.base.height = ny + 4;
      this.baseImg = this.baseCtx.createImageData(this.base.width, this.base.height);
    }
    const img = this.baseImg;
    const d = img.data;
    const rgb = this.rgb;
    const heat = w.rules.energies.filter((e) => e.spread === "diffusion").map((e) => e.index);
    const hotCells: number[] = [];
    const hotLimit = p.heatRef / 10;
    for (let y = y0; y < y1; y++) {
      let i = y * w.width + x0;
      let o = (y - y0) * img.width * 4;
      for (let x = x0; x < x1; x++, i++, o += 4) {
        const day = s.daylight[i];
        const asEmpty = movingIds.size > 0 && w.body[i] !== 0 && w.elem[i] !== 0 && movingIds.has(w.body[i]);
        p.shade(w, i, rgb, s.flat, asEmpty, AMBIENT_NIGHT + (AMBIENT_DAY - AMBIENT_NIGHT) * day);
        if (!s.flat && (w.elem[i] === 0 || asEmpty)) {
          // Open air carries the colour of the sky; deeper air is black. Lit haze fades in daylight.
          const wash = 1 - HAZE_WASH * day;
          // (Air with no light and no sky is as black as the rock around it.)
          rgb[0] = AIR_BASE[0] * day + (rgb[0] - AIR_BASE[0]) * wash + SKY[0] * day;
          rgb[1] = AIR_BASE[1] * day + (rgb[1] - AIR_BASE[1]) * wash + SKY[1] * day;
          rgb[2] = AIR_BASE[2] * day + (rgb[2] - AIR_BASE[2]) * wash + SKY[2] * day;
        }
        if (!s.flat && w.elem[i] !== 0 && !asEmpty) {
          const l = p.light(w, i);
          if (l > 0) {
            rgb[0] += LIGHT_BOOST[0] * l;
            rgb[1] += LIGHT_BOOST[1] * l;
            rgb[2] += LIGHT_BOOST[2] * l;
          }
        }
        d[o] = rgb[0];
        d[o + 1] = rgb[1];
        d[o + 2] = rgb[2];
        d[o + 3] = 255;
        if (heat.length > 0 && w.elem[i] !== 0) {
          let H = 0;
          for (const e of heat) H += w.field[e][i];
          if (H > hotLimit) hotCells.push(i);
        }
      }
    }
    this.baseCtx.putImageData(img, 0, 0, 0, 0, nx, ny);
    ctx.drawImage(this.base, 0, 0, nx, ny, ox + x0 * cs, oy + y0 * cs, nx * cs, ny * cs);

    for (const b of moving) {
      for (const c of b.cells) {
        const x = w.xOf(c);
        const y = w.yOf(c);
        if (x < x0 - 1 || x > x1 || y < y0 - 1 || y > y1) continue;
        const day = s.daylight[c];
        p.shade(w, c, rgb, s.flat, false, AMBIENT_NIGHT + (AMBIENT_DAY - AMBIENT_NIGHT) * day);
        ctx.fillStyle = hexOf(rgb[0], rgb[1], rgb[2]);
        ctx.fillRect(Math.round(ox + (x + b.ox) * cs), Math.round(oy + (y + b.oy) * cs), cs, cs);
      }
    }

    this.drawHatch(ctx, s, cs, ox, oy);
    this.drawShimmer(ctx, w, hotCells, s.time, cs, ox, oy);
    this.drawPlayer(ctx, s, cs, ox, oy);
    this.drawHands(ctx, s, cs, ox, oy);
  }

  /** The ship's hatch: a door set into the hull, darker than the hull around it. */
  private drawHatch(ctx: CanvasRenderingContext2D, s: ViewState, cs: number, ox: number, oy: number): void {
    const h = s.hatch;
    if (!h) return;
    const x = ox + h.x * cs;
    const y = oy + h.y * cs;
    // The back wall of the doorway and a frame around the opening.
    ctx.fillStyle = "#2a2f3a";
    ctx.fillRect(x, y, cs, h.height * cs);
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(x, y - Math.max(1, cs >> 2), h.width * cs, Math.max(1, cs >> 2));
    ctx.fillStyle = "#9aa1af";
    ctx.fillRect(x + (cs >> 2), y + cs, Math.max(2, cs >> 1), Math.max(2, cs >> 1));
  }

  /** Heat seen as air shimmer over hot matter. Hot cells themselves change colour in the shader. */
  private drawShimmer(ctx: CanvasRenderingContext2D, w: World, hot: number[], time: number, cs: number, ox: number, oy: number): void {
    for (const i of hot) {
      const x = w.xOf(i);
      const y = w.yOf(i);
      for (let k = 1; k <= 3; k++) {
        if (y - k < 0 || w.elem[i - k * w.width] !== 0) break;
        const wave = Math.sin(time * 7 + x * 1.9 + k * 1.3);
        ctx.fillStyle = `rgba(255,214,160,${(0.11 * (4 - k)) / 3 * (0.5 + 0.5 * wave)})`;
        ctx.fillRect(Math.round(ox + (x + 0.15 * wave) * cs), Math.round(oy + (y - k) * cs), cs, cs);
      }
    }
  }

  /** The player: a visor on the body's top cell, on the side it faces. */
  private drawPlayer(ctx: CanvasRenderingContext2D, s: ViewState, cs: number, ox: number, oy: number): void {
    const g = s.game;
    const b = g.body();
    const bb = g.bounds();
    if (!b || !bb) return;
    const vx = bb.x + (s.facing > 0 ? bb.width - 1 : 0) + b.ox;
    const vy = bb.y + b.oy;
    ctx.fillStyle = "#1d212b";
    ctx.fillRect(Math.round(ox + (vx + 0.2) * cs), Math.round(oy + (vy + 0.25) * cs), Math.round(cs * 0.6), Math.round(cs * 0.35));
  }

  /** What the hands just did, and where they aim. */
  private drawHands(ctx: CanvasRenderingContext2D, s: ViewState, cs: number, ox: number, oy: number): void {
    for (const f of s.flashes) {
      const a = f.life / 8;
      ctx.strokeStyle = f.kind === "swing" ? `rgba(255,255,255,${a})` : `rgba(180,220,255,${a})`;
      ctx.lineWidth = Math.max(1, cs >> 3);
      ctx.strokeRect(ox + f.x * cs + 1, oy + f.y * cs + 1, cs - 2, cs - 2);
    }
    if (s.aim) {
      ctx.lineWidth = Math.max(1, cs >> 4);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.strokeRect(ox + s.aim.x * cs + 0.5, oy + s.aim.y * cs + 0.5, cs - 1, cs - 1);
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

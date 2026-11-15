// The only HUD: the selected pack slot, and the pack view when it is open.
// No numbers, names or bars: just the colours of what is there.

import type { World } from "../core";
import type { Game } from "../game";
import { hexOf } from "../ui/colors";
import type { Perception } from "../ui/perception";

export interface Slot {
  x: number;
  y: number;
}

/** Pack cells that hold a single loose cell, in reading order (what a right click could put down). */
export function occupiedSlots(game: Game): Slot[] {
  const pack = game.pack;
  const out: Slot[] = [];
  for (let y = 0; y < pack.height; y++) {
    for (let x = 0; x < pack.width; x++) {
      if (!game.isPackRoom(x, y)) continue;
      const b = pack.bodyAt(x, y);
      if (b && b.cells.length === 1) out.push({ x, y });
    }
  }
  return out;
}

/** Where the pack view is drawn (device px), so clicks can be mapped to cells. */
export interface PackRect {
  x: number;
  y: number;
  tile: number;
  cols: number;
  rows: number;
}

export function packRect(canvas: HTMLCanvasElement, pack: World, cs: number): PackRect {
  const tile = Math.max(20, Math.round(cs * 1.7));
  const w = pack.width * tile;
  const h = pack.height * tile;
  return { x: Math.round((canvas.width - w) / 2), y: Math.round(canvas.height - h - cs * 2.5), tile, cols: pack.width, rows: pack.height };
}

const rgb = new Float64Array(3);

/** The pack opened: its cells as squares, the selected one outlined. */
export function drawPack(ctx: CanvasRenderingContext2D, game: Game, p: Perception, r: PackRect, slot: Slot | null): void {
  const pack = game.pack;
  const t = r.tile;
  ctx.fillStyle = "rgba(8,9,12,0.82)";
  ctx.fillRect(r.x - t / 2, r.y - t / 2, r.cols * t + t, r.rows * t + t);
  const moving = new Set<number>();
  for (const b of pack.bodies.values()) if (b.ox !== 0 || b.oy !== 0) moving.add(b.id);
  for (let y = 0; y < pack.height; y++) {
    for (let x = 0; x < pack.width; x++) {
      const i = pack.idx(x, y);
      const inRoom = game.isPackRoom(x, y);
      // The room behind the contents.
      ctx.fillStyle = inRoom ? "#171a21" : "#0d0f13";
      ctx.fillRect(r.x + x * t, r.y + y * t, t, t);
      if (pack.elem[i] === 0 || moving.has(pack.body[i])) continue;
      p.shade(pack, i, rgb, false, false, 0.85);
      ctx.fillStyle = hexOf(rgb[0], rgb[1], rgb[2]);
      ctx.fillRect(r.x + x * t, r.y + y * t, t, t);
    }
  }
  for (const b of moving) {
    for (const c of pack.bodies.get(b)!.cells) {
      const bd = pack.bodies.get(b)!;
      p.shade(pack, c, rgb, false, false, 0.85);
      ctx.fillStyle = hexOf(rgb[0], rgb[1], rgb[2]);
      ctx.fillRect(Math.round(r.x + (pack.xOf(c) + bd.ox) * t), Math.round(r.y + (pack.yOf(c) + bd.oy) * t), t, t);
    }
  }
  // Thin gridlines between the cells of the room.
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let y = 0; y < pack.height; y++) for (let x = 0; x < pack.width; x++) if (game.isPackRoom(x, y)) ctx.strokeRect(r.x + x * t + 0.5, r.y + y * t + 0.5, t - 1, t - 1);
  if (slot) outline(ctx, r.x + slot.x * t, r.y + slot.y * t, t);
}

/** The selected slot, always visible: a square of what it holds (an empty frame if nothing). */
export function drawSlot(ctx: CanvasRenderingContext2D, game: Game, p: Perception, canvas: HTMLCanvasElement, cs: number, slot: Slot | null): void {
  const size = Math.round(cs * 2.2);
  const x = Math.round(cs * 1.2);
  const y = canvas.height - size - Math.round(cs * 1.2);
  ctx.fillStyle = "rgba(8,9,12,0.7)";
  ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
  ctx.fillStyle = "#171a21";
  ctx.fillRect(x, y, size, size);
  if (slot) {
    const pack = game.pack;
    const i = pack.idx(slot.x, slot.y);
    if (pack.elem[i] !== 0) {
      p.shade(pack, i, rgb, false, false, 0.85);
      ctx.fillStyle = hexOf(rgb[0], rgb[1], rgb[2]);
      ctx.fillRect(x + size * 0.15, y + size * 0.15, size * 0.7, size * 0.7);
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);
}

function outline(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#000";
  ctx.strokeRect(x + 1, y + 1, t - 2, t - 2);
  ctx.strokeStyle = "#fff";
  ctx.strokeRect(x + 3, y + 3, t - 6, t - 6);
}

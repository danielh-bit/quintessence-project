// The ship's interior screen: an empty, safe room, for now. Lama's console
// arrives in milestone 2. Drawn from plain squares; nothing is labelled.

const ROOM_W = 26;
const ROOM_H = 12;

export function drawShip(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, cs: number, time: number): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#07080b";
  ctx.fillRect(0, 0, w, h);
  const c = Math.max(8, Math.min(Math.floor(w / (ROOM_W + 4)), Math.floor(h / (ROOM_H + 4)), cs * 2));
  const x0 = Math.round((w - ROOM_W * c) / 2);
  const y0 = Math.round((h - ROOM_H * c) / 2);
  const cell = (x: number, y: number, cw: number, ch: number, col: string): void => {
    ctx.fillStyle = col;
    ctx.fillRect(x0 + x * c, y0 + y * c, cw * c, ch * c);
  };
  cell(0, 0, ROOM_W, ROOM_H, "#565b69"); // the hull seen from inside
  cell(1, 1, ROOM_W - 2, ROOM_H - 3, "#2b303b"); // the wall
  cell(1, ROOM_H - 2, ROOM_W - 2, 1, "#3a404d"); // the floor
  // Ceiling strip: a steady, soft light that is not a source in the simulation.
  cell(3, 1, ROOM_W - 6, 1, "#4a5160");
  // The door out, on the right, a little ajar with the outside beyond it.
  cell(ROOM_W - 4, ROOM_H - 6, 2, 4, "#1d2129");
  cell(ROOM_W - 3, ROOM_H - 6, 1, 4, "#2a3042");
  // A bench along the back wall.
  cell(4, ROOM_H - 4, 6, 1, "#4b4540");
  cell(4, ROOM_H - 3, 1, 1, "#4b4540");
  cell(9, ROOM_H - 3, 1, 1, "#4b4540");
  // The player, standing by the door.
  const px = ROOM_W - 8;
  cell(px, ROOM_H - 6, 2, 4, "#c9ccd6");
  cell(px + 1, ROOM_H - 6, 1, 1, "#1d212b");
  // A faint breathing of the light, so the room is not a still picture.
  ctx.fillStyle = `rgba(255,255,255,${0.012 + 0.006 * Math.sin(time * 1.3)})`;
  ctx.fillRect(x0, y0, ROOM_W * c, ROOM_H * c);
}

// Colour helpers for the renderer and the developer overlay.

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [255, 0, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function css(c: RGB, alpha = 1): string {
  const [r, g, b] = c;
  return alpha >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

/** #rrggbb from 0..255 floats (clamped). */
export function hexOf(r: number, g: number, b: number): string {
  const c = (v: number) => HEX[v <= 0 ? 0 : v >= 255 ? 255 : v | 0];
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Distinct overlay colours, assigned to energies by their index in the rule
 * set (never by id). Past the list, hues follow the golden angle.
 */
const OVERLAY_PALETTE: RGB[] = [
  [56, 189, 248],
  [250, 204, 21],
  [251, 146, 60],
  [163, 230, 53],
  [192, 132, 252],
  [45, 212, 191],
  [244, 114, 182],
  [148, 163, 184],
];

export function overlayColor(index: number): RGB {
  if (index < OVERLAY_PALETTE.length) return OVERLAY_PALETTE[index];
  return hslToRgb((index * 137.508) % 360, 0.75, 0.6);
}

/** Strain overlay colour (kept apart from the energy palette). */
export const STRAIN_RGB: RGB = [255, 48, 48];

/** A distinct outline colour per body id. */
export function bodyColor(id: number): string {
  return `hsl(${Math.round((id * 137.508) % 360)} 85% 66%)`;
}

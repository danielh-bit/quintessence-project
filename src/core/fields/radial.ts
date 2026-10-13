// Radial spread: short range in all directions, around obstacles but not
// through cells that block the energy. Distance is the shortest path over the
// 8 neighbours (steps of 1 and sqrt 2); a diagonal step may not squeeze
// between two blocking cells. Each source adds S * falloff(d) to every cell it
// reaches, and a direction "away from the source" (the straight line from the
// source to the cell), weighted by that value. Opposite sources cancel.

import type { World } from "../world";
import { falloff, type Scratch } from "./scratch";

const SQRT2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const COST = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];

export function spreadRadial(
  w: World,
  s: Scratch,
  energy: number,
  range: number,
  sources: number[],
  field: Float64Array,
  own: Float64Array,
  dirX: Float64Array,
  dirY: Float64Array,
): void {
  const els = w.rules.elements;
  const elem = w.elem;
  const W = w.width;
  const H = w.height;
  const blocks = (c: number) => elem[c] !== 0 && els[elem[c]].blocks[energy];
  const dist = s.dist;
  const hc = s.heapCell;
  const hk = s.heapKey;

  for (const src of sources) {
    const S = w.output[src];
    const sx = w.xOf(src);
    const sy = w.yOf(src);
    // Dijkstra with a binary heap (lazy deletion).
    let n = 0;
    let visitedCount = 0;
    const push = (c: number, k: number) => {
      let i = n++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hk[p] < k || (hk[p] === k && hc[p] <= c)) break;
        hc[i] = hc[p];
        hk[i] = hk[p];
        i = p;
      }
      hc[i] = c;
      hk[i] = k;
    };
    const pop = (): number => {
      const top = hc[0];
      n--;
      const lc = hc[n];
      const lk = hk[n];
      let i = 0;
      for (;;) {
        let ch = 2 * i + 1;
        if (ch >= n) break;
        if (ch + 1 < n && (hk[ch + 1] < hk[ch] || (hk[ch + 1] === hk[ch] && hc[ch + 1] < hc[ch]))) ch++;
        if (lk < hk[ch] || (lk === hk[ch] && lc <= hc[ch])) break;
        hc[i] = hc[ch];
        hk[i] = hk[ch];
        i = ch;
      }
      hc[i] = lc;
      hk[i] = lk;
      return top;
    };
    dist[src] = 0;
    s.visited[visitedCount++] = src;
    push(src, 0);
    while (n > 0) {
      const k = hk[0];
      const c = pop();
      if (k > dist[c]) continue;
      const cx = w.xOf(c);
      const cy = w.yOf(c);
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nc = ny * W + nx;
        if (blocks(nc)) continue;
        if (d >= 4 && (blocks(cy * W + nx) || blocks(ny * W + cx))) continue;
        const nd = k + COST[d];
        if (nd > range || nd >= dist[nc]) continue;
        if (dist[nc] === Infinity) s.visited[visitedCount++] = nc;
        dist[nc] = nd;
        push(nc, nd);
      }
    }
    // Add this source's contribution, then reset the distances it touched.
    for (let v = 0; v < visitedCount; v++) {
      const c = s.visited[v];
      const val = S * falloff(dist[c], range);
      field[c] += val;
      if (c === src) {
        own[c] += val;
      } else {
        const dx = w.xOf(c) - sx;
        const dy = w.yOf(c) - sy;
        const len = Math.sqrt(dx * dx + dy * dy);
        dirX[c] += (val * dx) / len;
        dirY[c] += (val * dy) / len;
      }
      dist[c] = Infinity;
    }
  }
}

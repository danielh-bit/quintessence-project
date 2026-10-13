// Observation helpers: they only read what an outside observer (or an
// instrument) could see, never internals.

/** Indices where the series crosses `level` upward (from below to at/above). */
export function risingEdges(series: number[], level: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) if (series[i - 1] < level && series[i] >= level) out.push(i);
  return out;
}

export function intervals(times: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < times.length; i++) out.push(times[i] - times[i - 1]);
  return out;
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Mean period of a pulse train after skipping the first `skip` pulses (warm-up). */
export function period(edges: number[], skip = 2): { period: number; cv: number; count: number } {
  const iv = intervals(edges.slice(skip));
  if (iv.length === 0) return { period: NaN, cv: NaN, count: edges.length };
  const m = mean(iv);
  return { period: m, cv: stdev(iv) / m, count: edges.length };
}

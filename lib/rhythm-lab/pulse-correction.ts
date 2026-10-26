/** A repeated, near-grid pulse is stronger evidence than a single off-grid
 * attack. This is engraving correction only; it never changes raw timestamps
 * or estimates a device offset. The caller supplies at most one measure. */
export function pulseTolerance(grid: number, ms: number, shortestMs: number, strength: number) {
  return Math.min(75, ms * (0.04 + strength * 0.24), shortestMs * 0.2, 4 / grid * ms * 0.22);
}

export function contextualPulseGrid(times: number[], ms: number, strength: number): number | undefined {
  const ordered = [...new Set(times)].sort((a, b) => a - b);
  if (ordered.length < 3) return;
  const shortest = Math.min(...ordered.slice(1).map((time, i) => (time - ordered[i]) * ms));
  for (const grid of [4, 8, 16]) {
    const step = 4 / grid;
    const snapped = ordered.map((time) => Math.max(0, Math.round(time / step) * step));
    if (new Set(snapped).size !== ordered.length) continue;
    // Bound against both adjacent attacks and the proposed slot. In
    // particular, a real triplet cannot be rounded into binary sixteenths.
    const tolerance = pulseTolerance(grid, ms, shortest, strength);
    if (ordered.every((time, i) => Math.abs(time - snapped[i]) * ms <= tolerance + 1e-7)) return grid;
  }
}

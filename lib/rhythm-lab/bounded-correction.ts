import { gridRatio } from "./spans";

const GRIDS = [4, 8, 16, 32, 64, 128, 12, 24, 48, 96, 20, 40, 80, 28, 56, 112];
const snap = (q: number, grid: number) => Math.max(0, Math.round(q * grid / 4) * 4 / grid);

/** Bounded engraving correction, not a device/input offset. Context must stay
 * inside the current beat; raw attacks and keyboard gates are never modified. */
export function rankBoundedRhythm(times: number[], context: number[], ms: number, simplification: number) {
  const distinct = [...new Set(context)].sort((a, b) => a - b);
  const gaps = distinct.slice(1).map((q, i) => (q - distinct[i]) * ms);
  const tolerance = Math.max(2, Math.min(20, ms * 0.04, Math.min(Infinity, ...gaps) * 0.12,
    12 + simplification * 24));
  const ranked = GRIDS.filter((grid) => {
    const ratio = gridRatio(grid);
    if (!ratio || ratio.actual === 3) return true;
    // An isolated off-beat is not evidence for a quintuplet/septuplet family.
    const matched = distinct.filter((q) => Math.abs(snap(q, grid) - q) * ms <= tolerance);
    const binary = 2 ** Math.floor(Math.log2(grid));
    return new Set(matched.map((q) => snap(q, grid))).size >= 3 &&
      matched.filter((q) => Math.abs(snap(q, binary) - q) * ms > tolerance).length >= 2;
  }).map((grid) => {
    const errors = times.map((q) => Math.abs(snap(q, grid) - q) * ms);
    const collapsed = new Set(times).size - new Set(times.map((q) => snap(q, grid))).size;
    const excess = Math.max(0, ...errors.map((e) => e - tolerance));
    const ratio = gridRatio(grid);
    const complexity = Math.log2(grid / 4 + 1) + (ratio ? ratio.actual === 3 ? 0.3 : 0.6 : 0);
    return { grid, collapsed, maxError: Math.max(0, ...errors),
      score: collapsed * ms ** 2 * 100 + excess ** 2 * 100 +
      complexity * (ms * 0.025) ** 2 +
      errors.reduce((sum, e) => sum + e ** 2, 0) / Math.max(1, errors.length) * 0.025 };
  }).sort((a, b) => a.score - b.score);
  const bounded = ranked.filter((choice) => choice.collapsed === 0 && choice.maxError <= tolerance + 1e-7);
  return (bounded.length ? bounded : ranked).map(({ grid, score }) => ({ grid, score }));
}

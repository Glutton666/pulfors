import type { PolygonPlaybackRate } from "./polygon-clock";

export function clampPolygonOffset(offset: number): number {
  return Number.isFinite(offset) ? Math.max(-0.5, Math.min(0.5, offset)) : 0;
}

export function polygonSlotDurationMs(
  bpm: number, rate: PolygonPlaybackRate, beatsPerMeasure: number, sides: number,
): number {
  return 60000 * beatsPerMeasure / (bpm * rate * Math.max(1, sides));
}

export function formatPolygonOffsetMs(value: number): string {
  const ms = Math.round(value);
  return `${ms > 0 ? "+" : ""}${ms} ms`;
}

export function clampPolygonOffsetMs(value: number, slotMs: number): number {
  const limit = Math.floor(slotMs / 2);
  return Math.max(-limit, Math.min(limit, Math.round(value)));
}

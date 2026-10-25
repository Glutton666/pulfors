import { reconstructNotation, verifyDraft } from "./verification";
import type { Interpretation, RhythmDocument } from "./types";

export interface TapTimingComparison {
  hitId: string;
  number: number;
  actualMs: number;
  notationMs: number | null;
  /** Signed: score minus performance; unlike the raw timestamps, offset cancels. */
  errorMs: number | null;
  onsetErrorMs: number | null;
}

/** Compare successive original attacks with independently reconstructed score
 * attacks. Equal hit counts alone are never treated as a timing match. */
export function compareTapTiming(document: RhythmDocument, interpretation: Interpretation) {
  const report = verifyDraft(document, interpretation);
  const recovered = new Map(reconstructNotation(document, interpretation.events).map((hit) => [hit.id, hit]));
  const ordered = [...document.hits].sort((a, b) => a.onsetMs - b.onsetMs);
  const intervals: TapTimingComparison[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1], current = ordered[i];
    const a = recovered.get(previous.id), b = recovered.get(current.id);
    const actualMs = current.onsetMs - previous.onsetMs;
    const notationMs = a && b ? b.timeMs - a.timeMs : null;
    intervals.push({
      hitId: current.id, number: i + 1, actualMs, notationMs,
      errorMs: notationMs === null ? null : notationMs - actualMs,
      onsetErrorMs: b ? b.timeMs - Math.max(0, current.onsetMs - document.offsetMs) : null,
    });
  }
  const compared = intervals.filter((row) => row.errorMs !== null);
  return {
    intervals, report,
    meanIntervalErrorMs: compared.length
      ? compared.reduce((total, row) => total + Math.abs(row.errorMs!), 0) / compared.length : null,
    maxIntervalErrorMs: compared.length ? Math.max(...compared.map((row) => Math.abs(row.errorMs!))) : null,
    /** Both onset displacement and spacing must fit; a constant late sequence
     * must not pass merely because its successive intervals are identical. */
    matches: ordered.length >= 2 && report.valid && report.comparedCount === ordered.length
      && report.regions.every((region) => region.status !== "invalid" && region.status !== "unresolved")
      && compared.every((row) => Math.abs(row.errorMs!) <= Math.max(4, Math.min(30, row.actualMs * 0.1))
        && Math.abs(row.onsetErrorMs!) <= Math.min(30, 60000 / document.bpm * 0.05)),
  };
}

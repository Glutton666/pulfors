import type { NotationEvent } from "@/lib/rhythm-lab/types";
import { toNumber } from "@/lib/rhythm-lab/engine";

export const NOTATION_SCALE = 0.8;
export const STAFF_LEFT = 28;

// One pass over the document, rather than one full scan for every measure.
export function indexStaffEvents(events: NotationEvent[]) {
  const byMeasure = new Map<number, NotationEvent[]>();
  const ties = new Map<string, NotationEvent[]>();
  let measureCount = 1;
  for (const event of events) {
    const bucket = byMeasure.get(event.measureIndex) ?? [];
    bucket.push(event);
    byMeasure.set(event.measureIndex, bucket);
    measureCount = Math.max(measureCount, event.measureIndex + 1);
    if (event.tie) {
      const chain = ties.get(event.tie.id) ?? [];
      chain.push(event);
      ties.set(event.tie.id, chain);
    }
  }
  return { byMeasure, ties, measureCount };
}

export function layoutStaffMeasures(
  byMeasure: Map<number, NotationEvent[]>, count: number, spanQ: number, perRow: number,
) {
  const widths: number[] = [], starts: number[] = [], rowEnds: number[] = [];
  let x = STAFF_LEFT;
  for (let i = 0; i < count; i++) {
    if (i % perRow === 0) x = STAFF_LEFT;
    const onsets = [...new Set((byMeasure.get(i) ?? []).map((event) => toNumber(event.startQ)))].sort((a, b) => a - b);
    let minimumGap = Infinity;
    for (let j = 1; j < onsets.length; j++) {
      const gap = onsets[j] - onsets[j - 1];
      if (gap > 0.001) minimumGap = Math.min(minimumGap, gap);
    }
    if (!Number.isFinite(minimumGap)) minimumGap = spanQ;
    const width = Math.max(260, spanQ * 58, (spanQ / minimumGap) * 23);
    starts.push(x);
    widths.push(width);
    x += width;
    rowEnds[Math.floor(i / perRow)] = x;
  }
  return { widths, starts, rowEnds };
}

// Binary search in engraving coordinates; include complete boundary measures
// and one extra measure on each side for flags, ties and fast scrolling.
export function staffWindow(starts: number[], widths: number[], scrollX: number, viewportWidth: number) {
  const measureAt = (x: number) => {
    let lo = 0, hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (starts[mid] + widths[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(starts.length - 1, lo);
  };
  return {
    first: Math.max(0, measureAt(scrollX / NOTATION_SCALE) - 1),
    last: Math.min(starts.length - 1, measureAt((scrollX + viewportWidth) / NOTATION_SCALE) + 1),
  };
}

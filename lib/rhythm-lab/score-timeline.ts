import { notationSpelling } from "./notation";
import { num } from "./spans";
import type { NotationEvent, PlaybackHit, RhythmDocument } from "./types";

/** This decoder reads score glyphs and connection metadata only. Raw hits
 * supply identity/pitch, never onset or release timing. */
export function scoreTimeline(doc: RhythmDocument, events: NotationEvent[]): PlaybackHit[] {
  const ms = 60000 / doc.bpm;
  const sources = new Map(doc.hits.map((hit) => [hit.id, hit]));
  const ties = new Map<string, NotationEvent[]>();
  for (const event of events) if (event.kind === "note" && event.tie) {
    const list = ties.get(event.tie.id) ?? []; list.push(event); ties.set(event.tie.id, list);
  }
  const result: PlaybackHit[] = [];
  for (const event of events) {
    if (event.kind !== "note" || event.tie && event.tie.part !== 0) continue;
    const pieces = event.tie ? ties.get(event.tie.id)! : [event];
    const durationMs = pieces.reduce((sum, piece) => sum + notationSpelling(piece).durationQ * ms, 0);
    const timeMs = num(event.startQ) * ms;
    if (event.hitIds.length) {
      for (const id of event.hitIds) {
        const source = sources.get(id);
        result.push({ id, timeMs, durationMs, midi: source?.midi, drum: source?.drum ?? event.drum, accent: event.accent });
      }
    } else for (const [index, midi] of (event.midi?.length ? event.midi : [undefined]).entries()) {
      result.push({ id: `${event.id}-${index}`, timeMs, durationMs, midi, drum: event.drum, accent: event.accent });
    }
    const grace = event.graceHitIds ?? [];
    grace.forEach((id, index) => {
      const source = sources.get(id);
      result.push({ id, timeMs: timeMs - (grace.length - index) * Math.min(ms / 16, 35),
        durationMs: Math.min(ms / 32, 20), midi: source?.midi, drum: source?.drum });
    });
  }
  return result.sort((a, b) => a.timeMs - b.timeMs);
}

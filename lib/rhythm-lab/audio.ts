import { prepareDrumAudio, prepareScoreAudio, scheduleMeasureNotes } from "../score-audio";
import type { PlayNoteEvent } from "../score-playback";
import type { PlaybackHit } from "./types";

/** A workspace owns its pending preparation as well as its audible output.
 * Never use the monophonic note-preview API to replay chords or dense rhythms. */
export function createRhythmAudioSession() {
  let generation = 0;
  let stopNotes: (() => void) | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    generation++;
    if (endTimer !== undefined) clearTimeout(endTimer);
    endTimer = undefined;
    stopNotes?.();
    stopNotes = undefined;
  };
  return {
    stop,
    async play(hits: PlaybackHit[], onStarted?: () => void, onEnded?: () => void): Promise<void> {
      stop();
      const owner = generation;
      const midiHits = hits.filter((h) => h.midi !== undefined);
      const drumHits = hits.filter((h) => h.midi === undefined);
      await Promise.all([
        prepareScoreAudio(midiHits.map((h) => h.midi!), undefined, 4, "piano"),
        prepareDrumAudio(drumHits.map((h) => h.drum ?? "snare")),
      ]);
      if (owner !== generation) return;
      const events: PlayNoteEvent[] = hits.map((h) => ({
        midiNote: h.midi ?? 0, startOffsetMs: Math.max(0, h.timeMs),
        durationMs: Math.max(10, h.durationMs ?? 100), instrumentId: "piano",
        velocity: h.accent ? 1 : 0.7,
        ...(h.midi === undefined ? { drumType: h.drum ?? "snare" } : {}),
      }));
      stopNotes = scheduleMeasureNotes(events, 0.7, "piano");
      onStarted?.();
      const length = Math.max(0, ...hits.map((h) => h.timeMs + (h.durationMs ?? 100)));
      endTimer = setTimeout(() => {
        if (owner !== generation) return;
        stop();
        onEnded?.();
      }, length + 30);
    },
  };
}

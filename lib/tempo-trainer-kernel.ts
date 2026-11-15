import type { TempoTrainerConfig } from "./tempo-trainer";

export type TrainerVoice = { at: number; left: Float32Array; right: Float32Array };
export type TrainerTemplates = { normal: TrainerVoice[]; accent: TrainerVoice[]; baseBpm: number; periodSeconds: number };
export type TrainerCommand = { revision: number; reset: number; active: boolean; endsAt: number; rule: TempoTrainerConfig };
export type TrainerPosition = { measure: number; bpm: number; start: number; duration: number };
type VoiceCursor = { voice: TrainerVoice; index: number };
export type TrainerKernel = {
  position: TrainerPosition; nextBoundary: number; frame: number; nextEvent: number;
  voices: VoiceCursor[]; accent: boolean; revision: number; reset: number;
  active: boolean; since: number; elapsed: number; measures: number; fullMeasure: boolean;
};

export function createTrainerKernel(bpm: number): TrainerKernel {
  return {
    position: { measure: -1, bpm, start: 0, duration: 0 }, nextBoundary: 0, frame: 0, nextEvent: 0,
    voices: [], accent: false, revision: -1, reset: -1, active: false, since: 0,
    elapsed: 0, measures: 0, fullMeasure: false,
  };
}

/**
 * Same sample-frame kernel in native AudioRuntime and the web reservation
 * renderer. Never reads Date.now, React, a display callback or an async player.
 * PCM tails retain their pitch/duration as tick positions change with tempo.
 */
export function renderTrainerFrames(
  state: TrainerKernel, command: TrainerCommand, templates: TrainerTemplates,
  left: Float32Array, right: Float32Array, frames: number, sampleRate: number, firstFrame: number,
): void {
  "worklet";
  const now = firstFrame / sampleRate;
  if (state.revision !== command.revision) {
    if (state.active) state.elapsed += Math.max(0, now - state.since);
    state.since = now;
    if (state.reset !== command.reset) {
      state.elapsed = 0;
      state.measures = 0;
      state.fullMeasure = false;
      state.reset = command.reset;
    }
    state.active = command.active;
    if (!state.active) state.fullMeasure = false;
    state.revision = command.revision;
  }
  // A delayed web reservation must not burst-play missed ticks/tempo steps.
  if (state.position.measure >= 0 && firstFrame > state.frame + 1) {
    state.voices.length = 0;
    state.nextEvent = templates.normal.length;
    state.fullMeasure = false;
    state.measures = 0;
    state.elapsed = 0;
    state.since = now;
    state.nextBoundary = Math.max(firstFrame, state.nextBoundary);
  }
  for (let i = 0; i < frames; i++) {
    const frame = firstFrame + i;
    const seconds = frame / sampleRate;
    const active = state.active && (command.endsAt <= 0 || seconds < command.endsAt);
    if (frame >= state.nextBoundary) {
      let bpm = state.position.bpm;
      if (active && state.fullMeasure) state.measures++;
      const elapsed = state.elapsed + (state.active ? Math.max(0, seconds - state.since) : 0);
      const due = active && state.position.measure >= 0 && (
        command.rule.basis === "time"
          ? elapsed + 0.5 / sampleRate >= command.rule.intervalSeconds
          : state.measures >= command.rule.intervalMeasures
      );
      const next = due ? Math.min(300, Math.max(20, bpm + command.rule.bpmDelta)) : bpm;
      state.accent = next > bpm && command.rule.accentOnIncrease;
      if (due) {
        state.elapsed = 0;
        state.since = seconds;
        state.measures = 0;
      }
      bpm = next;
      const duration = templates.periodSeconds * templates.baseBpm / bpm;
      state.position = { measure: state.position.measure + 1, bpm, start: seconds, duration };
      state.nextBoundary = frame + Math.max(1, Math.round(duration * sampleRate));
      state.nextEvent = 0;
      state.fullMeasure = active;
    }
    const events = state.accent ? templates.accent : templates.normal;
    const phase = (seconds - state.position.start) / state.position.duration;
    while (state.nextEvent < events.length && events[state.nextEvent].at <= phase + 0.5 / sampleRate / state.position.duration) {
      state.voices.push({ voice: events[state.nextEvent++], index: 0 });
    }
    let l = 0;
    let r = 0;
    for (let v = state.voices.length - 1; v >= 0; v--) {
      const cursor = state.voices[v];
      l += cursor.voice.left[cursor.index] ?? 0;
      r += cursor.voice.right[cursor.index] ?? 0;
      cursor.index++;
      if (cursor.index >= cursor.voice.left.length) state.voices.splice(v, 1);
    }
    // Equal stereo limiter, not independent per-channel clipping.
    const gain = 1 / Math.max(1, Math.abs(l), Math.abs(r));
    left[i] = l * gain;
    right[i] = r * gain;
  }
  state.frame = firstFrame + frames;
}

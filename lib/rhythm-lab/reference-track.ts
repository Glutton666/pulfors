import { Platform } from "react-native";
import {
  getRenderSampleRate, getWebAudioContext, loadAssetPCM, playWebRenderedLoop,
  releaseRenderedWav, renderMeasure, saveRenderedWav,
} from "../audio-renderer";

const now = () => performance.now();
let fileSequence = 0;
const once = (action: () => void) => {
  let disposed = false;
  return () => { if (!disposed) { disposed = true; action(); } };
};

/** These are software observations, NOT physical speaker/DAC timestamps. */
export interface RhythmReferenceTiming {
  requestedAtMs: number;
  preparedAtMs: number;
  playRequestedAtMs: number;
  observedAtMs: number;
  observedPositionMs: number;
  originMs: number;
  intervalMs: number;
  clock: "web-presentation" | "native-position-observation";
}

export interface RhythmReferenceOptions {
  intervalMs: number;
  beats?: number;
  onStarted?: (timing: RhythmReferenceTiming) => void;
  /** Presentation only: timestamp is the grid deadline, never callback arrival. */
  onBeat?: (index: number, referenceAtMs: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
}

/**
 * An independent Score/Rhythm owner, not part of the global metronome owner.
 * Audio loops in the player; the JS timer ONLY updates presentation/completion.
 * Freeze a single observed origin so late UI callbacks cannot move raw inputs.
 */
export function createRhythmReferenceTrack() {
  let generation = 0;
  let cleanup: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timing: RhythmReferenceTiming | undefined;
  const stop = () => {
    generation++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    cleanup?.(); cleanup = undefined;
    timing = undefined;
  };
  return {
    stop,
    getTiming: () => timing,
    async start(options: RhythmReferenceOptions): Promise<void> {
      stop();
      const owner = generation;
      const requestedAtMs = now();
      let dispose: (() => void) | undefined;
      const current = () => owner === generation;
      const check = () => { if (!current()) throw new Error("REFERENCE_CANCELLED"); };
      const waitUntil = async (ready: () => boolean) => {
        const deadline = now() + 5000;
        while (!ready()) {
          check();
          if (now() >= deadline) throw new Error("Rhythm reference playback timed out");
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
        check();
      };
      try {
        if (!Number.isFinite(options.intervalMs) || options.intervalMs < 20 || options.intervalMs > 8000 ||
          (options.beats !== undefined && (!Number.isInteger(options.beats) || options.beats < 1))) {
          throw new Error("Invalid rhythm reference duration");
        }
        // Match the PCM grid exactly, including non-integral BPM sample lengths.
        const sr = getRenderSampleRate();
        let intervalMs = Math.round(options.intervalMs * sr / 1000) / sr * 1000;
        const click = await loadAssetPCM(require("@/assets/sounds/click-low.wav"));
        check();
        // Keep the file small at slow tempi, but longer than the startup
        // observation timeout (the renderer makes two copies).
        const beatsPerPass = options.beats ?? Math.max(1, Math.ceil(4000 / intervalMs));
        const rendered = renderMeasure({
          schedule: Array.from({ length: beatsPerPass }, (_, beat) => ({
            time: beat * intervalMs, beat, subBeat: 0, type: "normal" as const,
            repeatIteration: 0, barRepeatIteration: 0,
          })),
          measureDurationMs: beatsPerPass * intervalMs,
          clickPCMs: { strong: click, high: click, low: click },
          samplePCMs: new Map(), clickVolume: 0.7, sampleVolume: 0,
        });
        // The shared renderer emits two copies for seamless tail wrapping.
        const fullLength = rendered instanceof Float32Array ? rendered.length : rendered.left.length;
        intervalMs = fullLength / sr * 1000 / (2 * beatsPerPass);
        // Finite count-in/calibration stops IN the audio player, even when JS
        // is stalled at the end. Capture keeps the same continuous loop.
        const pcm = options.beats === undefined ? rendered
          : rendered instanceof Float32Array ? rendered.subarray(0, fullLength / 2)
            : { left: rendered.left.subarray(0, fullLength / 2), right: rendered.right.subarray(0, fullLength / 2) };
        const finiteDurationMs = options.beats === undefined ? Infinity : options.beats * intervalMs;
        check();
        let position: () => number;
        let running: () => boolean;
        let playRequestedAtMs: number;
        let preparedAtMs: number;
        if (Platform.OS === "web") {
          const ctx = getWebAudioContext();
          if (!ctx) throw new Error("Web Audio is unavailable");
          if (ctx.state === "suspended") await ctx.resume();
          check();
          if (ctx.state !== "running") throw new Error("Web Audio did not start");
          preparedAtMs = now();
          playRequestedAtMs = now();
          const loop = playWebRenderedLoop(pcm, undefined, "both", 1, ctx.currentTime + 0.04, options.beats === undefined);
          dispose = once(() => loop.stop());
          cleanup = dispose;
          position = () => {
            const seconds = loop.getPresentedPositionSeconds?.();
            if (seconds === undefined) throw new Error("Reference presentation clock unavailable");
            return seconds * 1000;
          };
          running = () => loop.isRunning() || (options.beats !== undefined && ctx.state === "running" &&
            (loop.getPositionSeconds?.() ?? 0) * 1000 >= finiteDurationMs);
          await waitUntil(() => position() >= 0 && running());
        } else {
          // Unique per invocation: cancellation must never delete a newer file.
          const uri = await saveRenderedWav(pcm, `rhythm_reference_${Date.now()}_${++fileSequence}.wav`);
          dispose = once(() => releaseRenderedWav(uri));
          check();
          const { createAudioPlayer } = require("expo-audio") as typeof import("expo-audio");
          const player = createAudioPlayer({ uri }, { updateInterval: 20 });
          dispose = once(() => {
            try { player.pause(); } catch {}
            try { player.remove(); } catch {}
            releaseRenderedWav(uri);
          });
          cleanup = dispose;
          player.loop = options.beats === undefined;
          player.volume = 1;
          await waitUntil(() => player.isLoaded);
          preparedAtMs = now();
          playRequestedAtMs = now();
          player.play();
          position = () => player.currentTime * 1000;
          running = () => player.playing || (options.beats !== undefined && position() >= finiteDurationMs - 1);
          // Acceptance alone says nothing about playback position. Anchor only
          // after a positive position is observed. Bridge/status latency remains.
          await waitUntil(() => running() && position() > 0);
        }
        check();
        const observedAtMs = now(), observedPositionMs = position();
        if (!Number.isFinite(observedPositionMs)) throw new Error("Invalid reference playback position");
        timing = {
          requestedAtMs, preparedAtMs, playRequestedAtMs, observedAtMs, observedPositionMs,
          originMs: observedAtMs - observedPositionMs, intervalMs,
          clock: Platform.OS === "web" ? "web-presentation" : "native-position-observation",
        };
        const anchor = timing;
        options.onStarted?.(anchor);
        if (!current()) return;
        let previousBeat = -1;
        const update = () => {
          if (!current()) return;
          try {
            const elapsed = now() - anchor.originMs;
            const beat = Math.floor(elapsed / intervalMs);
            if (options.beats !== undefined && beat >= options.beats) {
              stop(); options.onEnded?.(); return;
            }
            if (!running()) throw new Error("Rhythm reference playback interrupted");
            if (beat >= 0 && beat !== previousBeat) {
              previousBeat = beat;
              options.onBeat?.(beat, anchor.originMs + beat * intervalMs);
            }
            if (current()) timer = setTimeout(update, 20);
          } catch (error) {
            if (!current()) return;
            stop(); options.onError?.(error instanceof Error ? error : new Error(String(error)));
          }
        };
        update();
      } catch (error) {
        // A stale preparation owns only its own resources.
        dispose?.();
        if (!current()) return;
        stop();
        throw error;
      }
    },
  };
}

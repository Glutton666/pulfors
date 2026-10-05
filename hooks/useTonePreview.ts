import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { createAudioPlayer } from "expo-audio";
import { getWebAudioContext, releaseRenderedWav, saveRenderedWav } from "@/lib/audio-renderer";
import { logger } from "@/lib/logger";
import { limitLinkedPCM } from "@/lib/metronome-tone-dsp";
import type { SoundSet } from "@/lib/storage";
import type { AudioToneSnapshot } from "@/lib/audio-tone-snapshot";
import type { ClickPCMs } from "@/lib/audio-renderer";

export interface PreparedTonePreview {
  pcm: Float32Array;
  outputGain: number;
}

export type PrepareTonePreview = (
  set: string, role: number, signal: AbortSignal,
) => Promise<PreparedTonePreview>;

let previewFileSequence = 0;

/** Use the same immutable tone/gain settings and shaped click cache as playback. */
export function usePrepareTonePreview(
  getClickPCMs: (set: SoundSet, signal?: AbortSignal, snapshot?: AudioToneSnapshot) => Promise<ClickPCMs>,
  captureAudioToneSnapshot: () => AudioToneSnapshot,
): PrepareTonePreview {
  return useCallback(async (set: string, role: number, signal: AbortSignal) => {
    const snapshot = captureAudioToneSnapshot();
    const pcms = await getClickPCMs(set as SoundSet, signal, snapshot);
    const source = [pcms.strong, pcms.high, pcms.low][role % 3];
    return {
      pcm: limitLinkedPCM(Float32Array.from(source, sample => sample * snapshot.renderGain), snapshot.ceiling) as Float32Array,
      outputGain: snapshot.outputGain,
    };
  }, [captureAudioToneSnapshot, getClickPCMs]);
}

/** One-shot output, separate from the metronome owner, with latest-request ownership. */
export function useTonePreview(prepare: PrepareTonePreview, identity: string) {
  const pendingRef = useRef<AbortController | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    pendingRef.current?.abort();
    pendingRef.current = null;
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  useEffect(() => {
    stop();
    return stop;
  }, [identity, prepare, stop]);

  const unlock = useCallback(() => {
    // Selection previews start after commit, but Safari requires the first
    // resume request to remain inside the original trusted pointer event.
    if (Platform.OS !== "web") return;
    const context = getWebAudioContext();
    if (context?.state === "suspended") {
      void context.resume().catch(error => logger.warn("Preview audio unlock failed:", error));
    }
  }, []);

  const play = useCallback(async (set: string, role: number) => {
    stop();
    const request = new AbortController();
    pendingRef.current = request;
    const current = () => pendingRef.current === request && !request.signal.aborted;
    // The caller unlocks in the user gesture; await readiness before output.
    const context = Platform.OS === "web" ? getWebAudioContext() : null;
    const resume = context?.state === "suspended" ? context.resume() : Promise.resolve();
    try {
      const [{ pcm, outputGain }] = await Promise.all([prepare(set, role, request.signal), resume]);
      if (!current()) return;
      if (Platform.OS === "web") {
        if (!context) throw new Error("Preview AudioContext unavailable");
        const buffer = context.createBuffer(1, pcm.length, 44_100);
        buffer.getChannelData(0).set(pcm);
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        gain.gain.value = outputGain;
        source.connect(gain);
        gain.connect(context.destination);
        const cleanup = () => {
          source.onended = null;
          try { source.stop(); } catch {}
          source.disconnect();
          gain.disconnect();
          if (stopRef.current === cleanup) stopRef.current = null;
        };
        stopRef.current = cleanup;
        source.onended = cleanup;
        source.start();
      } else {
        const uri = await saveRenderedWav(pcm, `tone_preview_${++previewFileSequence}.wav`);
        if (!current()) {
          releaseRenderedWav(uri);
          return;
        }
        let player: ReturnType<typeof createAudioPlayer>;
        try {
          player = createAudioPlayer({ uri });
        } catch (error) {
          releaseRenderedWav(uri);
          throw error;
        }
        let timer: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          try { player.pause(); } catch {}
          try { player.remove(); } catch {}
          releaseRenderedWav(uri);
          if (stopRef.current === cleanup) stopRef.current = null;
        };
        stopRef.current = cleanup;
        try {
          player.volume = outputGain;
          const deadline = Date.now() + 1500;
          while (!player.isLoaded && !(player.duration > 0)) {
            if (!current()) return;
            if (Date.now() >= deadline) throw new Error("Preview player did not load");
            await new Promise(resolve => setTimeout(resolve, 30));
          }
          if (!current()) return;
          await player.seekTo(0);
          if (!current()) return;
          player.play();
          timer = setTimeout(cleanup, pcm.length / 44.1 + 150);
        } catch (error) {
          cleanup();
          throw error;
        }
      }
    } catch (error) {
      if (current()) logger.warn("Tone preview failed:", error);
    }
  }, [prepare, stop]);

  return { play, stop, unlock };
}

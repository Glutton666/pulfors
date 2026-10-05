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
        // Android's cold AudioTrack/focus startup can consume the entire onset
        // of a very short click. Keep its voice intact inside a padded one-shot,
        // rather than releasing the player on a JS estimate of clip duration.
        let nativePCM = pcm;
        if (Platform.OS === "android") {
          const lead = Math.round(0.1 * 44_100);
          nativePCM = new Float32Array(lead + pcm.length + Math.round(0.25 * 44_100));
          nativePCM.set(pcm, lead);
        }
        const uri = await saveRenderedWav(nativePCM, `tone_preview_${++previewFileSequence}.wav`);
        if (!current()) {
          releaseRenderedWav(uri);
          return;
        }
        let player: ReturnType<typeof createAudioPlayer>;
        try {
          player = createAudioPlayer({ uri }, { updateInterval: 50, keepAudioSessionActive: Platform.OS === "android" });
        } catch (error) {
          releaseRenderedWav(uri);
          throw error;
        }
        let timer: ReturnType<typeof setTimeout> | null = null;
        let subscription: { remove(): void } | null = null;
        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          if (timer) clearTimeout(timer);
          subscription?.remove();
          try { player.pause(); } catch {}
          try { player.remove(); } catch {}
          releaseRenderedWav(uri);
          if (stopRef.current === cleanup) stopRef.current = null;
          if (pendingRef.current === request) pendingRef.current = null;
        };
        stopRef.current = cleanup;
        try {
          player.volume = outputGain;
          if (typeof player.addListener === "function") {
            subscription = player.addListener("playbackStatusUpdate", status => {
              if (current() && status.didJustFinish) cleanup();
            });
          }
          const deadline = Date.now() + 3000;
          // Known metadata duration is not proof that Android has buffered.
          while (!player.isLoaded) {
            if (!current()) return;
            if (Date.now() >= deadline) throw new Error("Preview player did not load");
            await new Promise(resolve => setTimeout(resolve, 30));
          }
          if (!current()) return;
          await player.seekTo(0);
          if (!current()) return;
          await Promise.resolve(player.play());
          if (!current()) return;
          // Completion status owns normal release. Bound resources if the
          // native module never reports completion, without clipping startup.
          timer = setTimeout(cleanup, Math.max(5000, nativePCM.length / 44.1 + 3000));
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

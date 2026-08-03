import React, { useRef, useImperativeHandle } from "react";
import { useAudioPlayer, createAudioPlayer, type AudioPlayer as ExpoAudioPlayer } from "expo-audio";
import type { SoundSet, BuiltinSoundSet, SoundRole, CustomSoundSetConfig } from "@/lib/storage";
import { soundSets } from "@/lib/metronome-engine";
import { safePlay } from "@/lib/audio-utils";
import { logger } from "@/lib/logger";

export interface SoundPreviewHandle {
  playSoundPreview: (set: SoundSet) => void;
  previewCustomSample: (sourceSet: BuiltinSoundSet, sourceRole: SoundRole) => void;
  playCustomSampleUri: (uri: string, duration: number) => Promise<void>;
}

interface SoundPreviewPlayersProps {
  customSoundSets: Record<string, CustomSoundSetConfig>;
}

export const SoundPreviewPlayers = React.forwardRef<SoundPreviewHandle, SoundPreviewPlayersProps>(
  function SoundPreviewPlayers({ customSoundSets }, ref) {
    const classicStrong = useAudioPlayer(soundSets.classic.strong);
    const classicHigh = useAudioPlayer(soundSets.classic.high);
    const classicLow = useAudioPlayer(soundSets.classic.low);
    const woodblockStrong = useAudioPlayer(soundSets.woodblock.strong);
    const woodblockHigh = useAudioPlayer(soundSets.woodblock.high);
    const woodblockLow = useAudioPlayer(soundSets.woodblock.low);
    const cowbellStrong = useAudioPlayer(soundSets.cowbell.strong);
    const cowbellHigh = useAudioPlayer(soundSets.cowbell.high);
    const cowbellLow = useAudioPlayer(soundSets.cowbell.low);
    const digitalStrong = useAudioPlayer(soundSets.digital.strong);
    const digitalHigh = useAudioPlayer(soundSets.digital.high);
    const digitalLow = useAudioPlayer(soundSets.digital.low);
    const jamblockStrong = useAudioPlayer(soundSets.jamblock.strong);
    const jamblockHigh = useAudioPlayer(soundSets.jamblock.high);
    const jamblockLow = useAudioPlayer(soundSets.jamblock.low);
    const sineStrong = useAudioPlayer(soundSets.sine.strong);
    const sineHigh = useAudioPlayer(soundSets.sine.high);
    const sineLow = useAudioPlayer(soundSets.sine.low);
    const blipStrong = useAudioPlayer(soundSets.blip.strong);
    const blipHigh = useAudioPlayer(soundSets.blip.high);
    const blipLow = useAudioPlayer(soundSets.blip.low);
    const claveStrong = useAudioPlayer(soundSets.clave.strong);
    const claveHigh = useAudioPlayer(soundSets.clave.high);
    const claveLow = useAudioPlayer(soundSets.clave.low);
    const cajonStrong = useAudioPlayer(soundSets.cajon.strong);
    const cajonHigh = useAudioPlayer(soundSets.cajon.high);
    const cajonLow = useAudioPlayer(soundSets.cajon.low);
    const marimbaStrong = useAudioPlayer(soundSets.marimba.strong);
    const marimbaHigh = useAudioPlayer(soundSets.marimba.high);
    const marimbaLow = useAudioPlayer(soundSets.marimba.low);
    const stickStrong = useAudioPlayer(soundSets.stick.strong);
    const stickHigh = useAudioPlayer(soundSets.stick.high);
    const stickLow = useAudioPlayer(soundSets.stick.low);
    const previewIndexRef = useRef<Record<string, number>>({});
    const previewProbePlayerRef = useRef<ExpoAudioPlayer | null>(null);
    const previewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    type PlayerList = typeof classicStrong[];
    const players: Partial<Record<string, PlayerList>> = {
      classic: [classicStrong, classicHigh, classicLow],
      woodblock: [woodblockStrong, woodblockHigh, woodblockLow],
      cowbell: [cowbellStrong, cowbellHigh, cowbellLow],
      digital: [digitalStrong, digitalHigh, digitalLow],
      jamblock: [jamblockStrong, jamblockHigh, jamblockLow],
      sine: [sineStrong, sineHigh, sineLow],
      blip: [blipStrong, blipHigh, blipLow],
      clave: [claveStrong, claveHigh, claveLow],
      cajon: [cajonStrong, cajonHigh, cajonLow],
      marimba: [marimbaStrong, marimbaHigh, marimbaLow],
      stick: [stickStrong, stickHigh, stickLow],
    };

    useImperativeHandle(ref, () => ({
      playSoundPreview(set: SoundSet) {
        const idx = previewIndexRef.current[set] ?? 0;
        let list = players[set];
        if (!list) {
          const cfg = customSoundSets[set];
          if (cfg) {
            const samples = [cfg.strong, cfg.accent, cfg.normal];
            const sample = samples[idx % 3];
            if (sample.type === "custom" && sample.sampleUri) {
              void this.playCustomSampleUri(sample.sampleUri, sample.duration);
              previewIndexRef.current[set] = (idx + 1) % 3;
              return;
            }
            const srcSet = sample.sourceSet || "classic";
            const srcRole = sample.sourceRole || "strong";
            list = players[srcSet];
            if (list) {
              const roleIdx = srcRole === "strong" ? 0 : srcRole === "high" ? 1 : 2;
              try { list[roleIdx].seekTo(0); } catch {}
              safePlay(list[roleIdx], "settings.previewSample.custom");
              previewIndexRef.current[set] = (idx + 1) % 3;
              return;
            }
          }
          list = players.classic;
        }
        if (!list) return;
        const player = list[idx];
        try { player.seekTo(0); } catch {}
        safePlay(player, "settings.previewSample.builtin");
        previewIndexRef.current[set] = (idx + 1) % 3;
      },
      previewCustomSample(sourceSet: BuiltinSoundSet, sourceRole: SoundRole) {
        const list = players[sourceSet];
        if (!list) return;
        const idx = sourceRole === "strong" ? 0 : sourceRole === "high" ? 1 : 2;
        try { list[idx].seekTo(0); } catch {}
        safePlay(list[idx], "settings.previewCustomSource");
      },
      async playCustomSampleUri(uri: string, duration: number) {
        if (previewStopTimerRef.current) {
          clearTimeout(previewStopTimerRef.current);
          previewStopTimerRef.current = null;
        }
        if (previewProbePlayerRef.current) {
          try { previewProbePlayerRef.current.pause(); } catch {}
          try { previewProbePlayerRef.current.remove(); } catch {}
          previewProbePlayerRef.current = null;
        }
        try {
          const rawUri = uri.split("#")[0];
          const isSafeUri =
            rawUri.startsWith("file://") ||
            rawUri.startsWith("asset://") ||
            rawUri.startsWith("blob:") ||
            rawUri.startsWith("data:");
          if (!isSafeUri) {
            logger.warn("[SoundPreviewPlayers] Blocked unsafe custom sound URI:", rawUri.slice(0, 80));
            return;
          }
          const player = createAudioPlayer({ uri: rawUri });
          previewProbePlayerRef.current = player;
          const hashParts = uri.split("#t=")[1];
          let startMs = 0;
          if (hashParts) {
            const parts = hashParts.split(",").map(Number);
            if (!isNaN(parts[0])) startMs = parts[0];
          }
          const start = Date.now();
          while (Date.now() - start < 800) {
            const d = player.duration;
            if (typeof d === "number" && d > 0 && isFinite(d)) break;
            await new Promise((r) => setTimeout(r, 30));
          }
          try { if (startMs > 0) await player.seekTo(startMs / 1000); } catch {}
          safePlay(player, "settings.previewProbe");
          previewStopTimerRef.current = setTimeout(() => {
            try { player.pause(); } catch {}
            try { player.remove(); } catch {}
            if (previewProbePlayerRef.current === player) previewProbePlayerRef.current = null;
            previewStopTimerRef.current = null;
          }, Math.max(150, duration * 1000));
        } catch (e) {
          logger.warn("Preview failed:", e);
        }
      },
    }));

    return null;
  }
);

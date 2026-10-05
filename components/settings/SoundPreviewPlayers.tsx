import React, { useRef, useImperativeHandle, useEffect, useState, useCallback } from "react";
import { createAudioPlayer, type AudioPlayer as ExpoAudioPlayer } from "expo-audio";
import type { SoundSet, BuiltinSoundSet, SoundRole, CustomSoundSetConfig } from "@/lib/storage";
import { soundSets } from "@/lib/metronome-engine";
import { safePlay } from "@/lib/audio-utils";
import { logger } from "@/lib/logger";
import { useTonePreview, type PrepareTonePreview } from "@/hooks/useTonePreview";
import { loadPCM } from "@/lib/pcm-loader";
import { getDecodedPCM } from "@/lib/pcm-cache";

export interface SoundPreviewHandle {
  playSoundPreview: (set: SoundSet) => void;
  previewCustomSample: (sourceSet: BuiltinSoundSet, sourceRole: SoundRole) => void;
  playCustomSampleUri: (uri: string, duration: number) => Promise<void>;
}

interface SoundPreviewPlayersProps {
  customSoundSets: Record<string, CustomSoundSetConfig>;
  prepareTonePreview: PrepareTonePreview;
  toneIdentity: string;
}

export const SoundPreviewPlayers = React.forwardRef<SoundPreviewHandle, SoundPreviewPlayersProps>(
  function SoundPreviewPlayers({ customSoundSets, prepareTonePreview, toneIdentity }, ref) {
    const tonePreview = useTonePreview(prepareTonePreview, toneIdentity);
    const prepareSourcePreview = useCallback<PrepareTonePreview>(async (set, role, signal) => {
      const sources = soundSets[set as keyof typeof soundSets];
      if (!sources) throw new Error(`Unknown preview source: ${set}`);
      const asset = [sources.strong, sources.high, sources.low][role % 3];
      const pcm = await getDecodedPCM(
        `raw:asset:${String(asset)}`,
        loadSignal => loadPCM({ kind: "asset", source: asset }, loadSignal),
        signal,
      );
      return { pcm, outputGain: 1 };
    }, []);
    const sourcePreview = useTonePreview(prepareSourcePreview, toneIdentity);
    const [previewRequest, setPreviewRequest] = useState<{ set: SoundSet; role: number } | null>(null);
    useEffect(() => {
      // Sound selection and preview happen in the same event. Start only after
      // that selection commits, so identity invalidation cannot cancel the
      // new preview or leave it using the outgoing sound's position.
      if (previewRequest) void tonePreview.play(previewRequest.set, previewRequest.role);
    }, [previewRequest, tonePreview.play]);
    const previewIndexRef = useRef<Record<string, number>>({});
    const previewProbePlayerRef = useRef<ExpoAudioPlayer | null>(null);
    const previewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(ref, () => ({
      playSoundPreview(set: SoundSet) {
        sourcePreview.stop();
        const idx = previewIndexRef.current[set] ?? 0;
        tonePreview.unlock();
        setPreviewRequest({ set, role: idx });
        previewIndexRef.current[set] = (idx + 1) % 3;
      },
      previewCustomSample(sourceSet: BuiltinSoundSet, sourceRole: SoundRole) {
        const idx = sourceRole === "strong" ? 0 : sourceRole === "high" ? 1 : 2;
        setPreviewRequest(null);
        tonePreview.stop();
        sourcePreview.unlock();
        void sourcePreview.play(sourceSet, idx);
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

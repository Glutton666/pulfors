import { useRef, useEffect } from "react";
import { Platform } from "react-native";
import { AudioModule } from "expo-audio";
import type { AudioPlayer as ExpoAudioPlayer } from "expo-audio";
import {
  addNotificationActionListener,
  showPlayingNotification,
  showPausedNotification,
  updateNotificationBpm,
} from "@/lib/notification-controls";
import { safePlay } from "@/lib/audio-utils";
import { captureBreadcrumb } from "@/lib/error-tracking";
import type { MetronomeEngine } from "@/lib/metronome-engine";
import type { BarConfig, DialConfig } from "@/app/index.helpers";

interface UseNotificationBridgeParams {
  engineRef: React.MutableRefObject<MetronomeEngine | null>;
  barModeRef: React.MutableRefObject<boolean>;
  barConfigRef: React.MutableRefObject<BarConfig>;
  dialConfigRef: React.MutableRefObject<DialConfig>;
  barLoopModeRef: React.MutableRefObject<"loop" | "once">;
  blockPlayModeRef: React.MutableRefObject<"sequential" | "loop" | "random">;
  barStartBeatRef: React.MutableRefObject<number | null>;
  bpmRef: React.MutableRefObject<number>;
  updateBpmRef: React.MutableRefObject<(bpm: number) => void>;
  languageRef: React.MutableRefObject<"ko" | "en" | string>;
  renderedPlayerRef: React.MutableRefObject<ExpoAudioPlayer | null>;
  buildRenderedPlayer: () => Promise<ExpoAudioPlayer | null>;
  stopRenderedAudio: () => void;
  clearSamplePlayStates: () => void;
  resetPlaybackVisuals: () => void;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPreparing: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Listens to lock-screen / notification-center media control actions
 * (TOGGLE_PLAY, BPM_UP, BPM_DOWN) and applies them to the engine.
 *
 * Extracted from useMetronomeScreen to keep notification-bridge logic isolated.
 * The hook has no return value — it is a pure side-effect registration.
 */
export function useNotificationBridge(params: UseNotificationBridgeParams): void {
  const {
    engineRef, barModeRef, barConfigRef, dialConfigRef, barLoopModeRef,
    blockPlayModeRef, barStartBeatRef, bpmRef, updateBpmRef, languageRef,
    renderedPlayerRef, buildRenderedPlayer, stopRenderedAudio, clearSamplePlayStates,
    resetPlaybackVisuals, setIsPlaying, setIsPreparing,
  } = params;

  // Double-tap accumulator for BPM_UP / BPM_DOWN: single tap → ±1, double → ±5.
  const bpmTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmTapCountRef = useRef<{ direction: string; count: number }>({ direction: "", count: 0 });

  useEffect(() => {
    const sub = addNotificationActionListener((actionId) => {
      const handleAsync = async () => {
        if (actionId === "TOGGLE_PLAY") {
          const engine = engineRef.current;
          if (!engine) return;

          const modeLabel = barModeRef.current ? "Bar" : "Dial";

          if (engine.getIsRunning()) {
            engine.stop();
            stopRenderedAudio();
            clearSamplePlayStates();
            setIsPreparing(false);
            setIsPlaying(false);
            resetPlaybackVisuals();
            showPausedNotification(bpmRef.current, modeLabel, languageRef.current as "ko" | "en" | undefined);
          } else {
            stopRenderedAudio();
            engine.setPreRenderedAudio(false);
            setIsPreparing(false);

            if (barModeRef.current) {
              engine.setBeatTypes([...(barConfigRef.current.beatTypes || [])]);
              engine.setAllBeatSubdivisions(barConfigRef.current.beatSubdivisions || {});
              engine.setAllBarRepeats(barConfigRef.current.barRepeats || {});
              engine.setLoopBlocks(barConfigRef.current.loopBlocks || []);
              engine.setBlockPlayMode(blockPlayModeRef.current);
              const bpmOverrides: Record<number, number> = {};
              for (const [k, v] of Object.entries(barConfigRef.current.barRepeats || {})) {
                if (v.bpm) bpmOverrides[Number(k)] = v.bpm;
              }
              engine.setAllBarBpmOverrides(bpmOverrides);
            } else {
              engine.setBeatTypes([...(dialConfigRef.current.beatTypes || [])]);
              engine.setAllBeatSubdivisions(dialConfigRef.current.beatSubdivisions || {});
            }
            engine.buildScheduleOnly();

            resetPlaybackVisuals();

            if (Platform.OS !== "web") {
              try {
                await AudioModule.setAudioModeAsync({
                  playsInSilentMode: true,
                  interruptionMode: "mixWithOthers",
                  shouldPlayInBackground: true,
                });
              } catch {}
            }

            const renderedPlayer = await buildRenderedPlayer();
            if (renderedPlayer) {
              stopRenderedAudio();
              renderedPlayerRef.current = renderedPlayer;
              renderedPlayer.volume = 1.0;
              engine.setPreRenderedAudio(true);
            }

            setIsPlaying(true);
            engine.start(barModeRef.current ? (barStartBeatRef.current ?? undefined) : undefined);

            if (renderedPlayer) {
              safePlay(renderedPlayer, "metronome.start.barMode");
            }

            showPlayingNotification(bpmRef.current, modeLabel, languageRef.current as "ko" | "en" | undefined);

            if (barModeRef.current && barLoopModeRef.current === "once") {
              engine.requestStopAfterMeasure();
            }
          }
          return;
        }

        if (actionId === "BPM_DOWN" || actionId === "BPM_UP") {
          const dir = actionId;
          const engine = engineRef.current;

          if (bpmTapCountRef.current.direction === dir && bpmTapTimerRef.current) {
            clearTimeout(bpmTapTimerRef.current);
            bpmTapTimerRef.current = null;
            bpmTapCountRef.current = { direction: "", count: 0 };

            const delta = dir === "BPM_DOWN" ? -5 : 5;
            const newBpm = Math.max(20, Math.min(300, bpmRef.current + delta));
            updateBpmRef.current(newBpm);
            const isCurrentlyPlaying = engine?.getIsRunning() ?? false;
            if (isCurrentlyPlaying) {
              stopRenderedAudio();
            }
            const modeLabel = barModeRef.current ? "Bar" : "Dial";
            updateNotificationBpm(newBpm, modeLabel, isCurrentlyPlaying, languageRef.current as "ko" | "en" | undefined);
          } else {
            if (bpmTapTimerRef.current) {
              clearTimeout(bpmTapTimerRef.current);
            }
            bpmTapCountRef.current = { direction: dir, count: 1 };

            bpmTapTimerRef.current = setTimeout(() => {
              bpmTapTimerRef.current = null;
              bpmTapCountRef.current = { direction: "", count: 0 };

              const delta = dir === "BPM_DOWN" ? -1 : 1;
              const newBpm = Math.max(20, Math.min(300, bpmRef.current + delta));
              updateBpmRef.current(newBpm);
              const isNowPlaying = engineRef.current?.getIsRunning() ?? false;
              if (isNowPlaying) {
                stopRenderedAudio();
              }
              const modeLabel = barModeRef.current ? "Bar" : "Dial";
              updateNotificationBpm(newBpm, modeLabel, isNowPlaying, languageRef.current as "ko" | "en" | undefined);
            }, 300);
          }
        }
      };
      handleAsync().catch((e) => captureBreadcrumb({ category: "notification", message: "알림 버튼 핸들러 에러", level: "warning", data: { error: String(e) } }));
    });
    return () => {
      sub.remove();
      if (bpmTapTimerRef.current) clearTimeout(bpmTapTimerRef.current);
    };
  }, []);
}

import { useRef, useEffect } from "react";
import { Platform } from "react-native";
import type { AudioPlayer as ExpoAudioPlayer } from "expo-audio";
import { applyAudioModeIfChanged } from "@/lib/audio-mode-cache";
import {
  addNotificationActionListener,
  showPlayingNotification,
  showPausedNotification,
  updateNotificationBpm,
} from "@/lib/notification-controls";
import { safePlay } from "@/lib/audio-utils";
import { captureBreadcrumb } from "@/lib/error-tracking";
import { toEngineBpm } from "@/lib/metronome-engine";
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
  beatDenominatorRef: React.MutableRefObject<2 | 4 | 8>;
  updateBpmRef: React.MutableRefObject<(bpm: number) => void>;
  languageRef: React.MutableRefObject<"ko" | "en" | string>;
  renderedPlayerRef: React.MutableRefObject<ExpoAudioPlayer | null>;
  buildRenderedPlayer: () => Promise<ExpoAudioPlayer | null>;
  stopRenderedAudio: () => void;
  clearSamplePlayStates: () => void;
  resetPlaybackVisuals: () => void;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPreparing: React.Dispatch<React.SetStateAction<boolean>>;
  togglePlaybackRef: React.MutableRefObject<(() => Promise<boolean | undefined>) | null>;
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
    resetPlaybackVisuals, setIsPlaying, setIsPreparing, togglePlaybackRef,
  } = params;

  // Double-tap accumulator for BPM_UP / BPM_DOWN: single tap → ±1, double → ±5.
  const bpmTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmTapCountRef = useRef<{ direction: string; count: number }>({ direction: "", count: 0 });

  useEffect(() => {
    const sub = addNotificationActionListener((actionId) => {
      const handleAsync = async () => {
        if (actionId === "TOGGLE_PLAY") {
          // Keep notification controls on the same lifecycle path as the main
          // control so pause/resume remains one accurately timed session.
          await togglePlaybackRef.current?.();
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

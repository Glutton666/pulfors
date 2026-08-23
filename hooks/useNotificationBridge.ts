import { useRef, useEffect } from "react";
import {
  addNotificationActionListener,
  updateNotificationBpm,
} from "@/lib/notification-controls";
import { captureBreadcrumb } from "@/lib/error-tracking";
import type { MetronomeEngine } from "@/lib/metronome-engine";
import type { PlaybackContext } from "@/lib/playback-context";

interface UseNotificationBridgeParams {
  engineRef: React.MutableRefObject<MetronomeEngine | null>;
  languageRef: React.MutableRefObject<"ko" | "en" | string>;
  getPlaybackContextRef: React.MutableRefObject<() => PlaybackContext>;
  setPlaybackBpmRef: React.MutableRefObject<(bpm: number, context: PlaybackContext) => void>;
  stopRenderedAudio: () => void;
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
    engineRef, languageRef, getPlaybackContextRef, setPlaybackBpmRef,
    stopRenderedAudio, togglePlaybackRef,
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
          const applyBpmDelta = (delta: number) => {
            const playback = getPlaybackContextRef.current();
            const newBpm = Math.max(20, Math.min(300, playback.bpm + delta));
            setPlaybackBpmRef.current(newBpm, playback);
            const isPlaying = engineRef.current?.getIsRunning() ?? false;
            if (isPlaying) stopRenderedAudio();
            updateNotificationBpm(
              newBpm,
              playback.modeLabel,
              isPlaying,
              languageRef.current as "ko" | "en" | undefined,
            );
          };

          if (bpmTapCountRef.current.direction === dir && bpmTapTimerRef.current) {
            clearTimeout(bpmTapTimerRef.current);
            bpmTapTimerRef.current = null;
            bpmTapCountRef.current = { direction: "", count: 0 };

            applyBpmDelta(dir === "BPM_DOWN" ? -5 : 5);
          } else {
            if (bpmTapTimerRef.current) {
              clearTimeout(bpmTapTimerRef.current);
            }
            bpmTapCountRef.current = { direction: dir, count: 1 };

            bpmTapTimerRef.current = setTimeout(() => {
              bpmTapTimerRef.current = null;
              bpmTapCountRef.current = { direction: "", count: 0 };

              applyBpmDelta(dir === "BPM_DOWN" ? -1 : 1);
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

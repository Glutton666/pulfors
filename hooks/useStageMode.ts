import { useState, useRef, useCallback, useEffect } from "react";
import { Platform } from "react-native";

/**
 * 무대 모드 관리 훅.
 * - 진입 시: 화면 꺼짐 방지(expo-keep-awake), 밝기 최대(expo-brightness)
 * - 종료 시: 이전 밝기 복원, 화면 꺼짐 방지 해제
 */
export function useStageMode() {
  const [stageModeActive, setStageModeActive] = useState(false);
  const stageModeActiveRef = useRef(false);
  useEffect(() => { stageModeActiveRef.current = stageModeActive; }, [stageModeActive]);

  const savedBrightnessRef = useRef<number | null>(null);

  const enterStageMode = useCallback(() => {
    // Flip the UI state first — keep-awake/brightness are best-effort side
    // effects that can take real wall-clock time on Android (permission
    // checks etc.), and stageModeActive must not wait on them or the screen
    // visibly stays on "beat" until they resolve.
    setStageModeActive(true);
    if (Platform.OS !== "web") {
      (async () => {
        try {
          const KeepAwake = await import("expo-keep-awake");
          await KeepAwake.activateKeepAwakeAsync("stage-mode");
        } catch {}
        try {
          const Brightness = await import("expo-brightness");
          const brightness = await Brightness.getBrightnessAsync();
          savedBrightnessRef.current = brightness;
          await Brightness.setBrightnessAsync(1.0);
        } catch {}
      })();
    }
  }, []);

  const exitStageMode = useCallback(async () => {
    setStageModeActive(false);
    if (Platform.OS !== "web") {
      try {
        const KeepAwake = await import("expo-keep-awake");
        await KeepAwake.deactivateKeepAwake("stage-mode");
      } catch {}
      try {
        const Brightness = await import("expo-brightness");
        if (savedBrightnessRef.current !== null) {
          await Brightness.setBrightnessAsync(savedBrightnessRef.current);
          savedBrightnessRef.current = null;
        }
      } catch {}
    }
  }, []);

  // 언마운트 안전 정리: 무대 모드가 활성 상태에서 컴포넌트가 해제될 경우
  // keep-awake 및 밝기를 복원해 시스템 상태가 남지 않도록 한다.
  useEffect(() => {
    return () => {
      if (!stageModeActiveRef.current) return;
      if (Platform.OS === "web") return;
      import("expo-keep-awake").then((m) => m.deactivateKeepAwake("stage-mode")).catch(() => {});
      if (savedBrightnessRef.current !== null) {
        const saved = savedBrightnessRef.current;
        savedBrightnessRef.current = null;
        import("expo-brightness").then((m) => m.setBrightnessAsync(saved)).catch(() => {});
      }
    };
  }, []);

  return { stageModeActive, enterStageMode, exitStageMode };
}

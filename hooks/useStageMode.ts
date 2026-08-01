import { useState, useRef, useCallback, useEffect } from "react";
import { InteractionManager, Platform } from "react-native";

/**
 * 무대 모드 관리 훅.
 * - 진입 시: 화면 꺼짐 방지(expo-keep-awake), 밝기 최대(expo-brightness)
 * - 종료 시: 이전 밝기 복원, 화면 꺼짐 방지 해제
 * - 무대 모드 중 볼륨 버튼으로 BPM ±1(단타) / ±10(홀드 자동반복) 조절
 *   (react-native-volume-manager 사용 가능한 경우; 없으면 조용히 스킵)
 *
 * 중요: native 사이드이펙트(keep-awake, brightness, volume-manager)는
 * InteractionManager.runAfterInteractions 로 React 렌더/트랜지션 완료
 * 이후에 실행한다. 렌더 도중 native 호출이 발생하면 일부 Android 기기에서
 * bridge 크래시가 발생할 수 있다.
 */
export function useStageMode(
  bpmRef: React.MutableRefObject<number>,
  onBpmChange: (bpm: number) => void,
) {
  const [stageModeActive, setStageModeActive] = useState(false);
  const stageModeActiveRef = useRef(false);
  useEffect(() => { stageModeActiveRef.current = stageModeActive; }, [stageModeActive]);

  const savedBrightnessRef = useRef<number | null>(null);
  const onBpmChangeRef = useRef(onBpmChange);
  useEffect(() => { onBpmChangeRef.current = onBpmChange; }, [onBpmChange]);

  const enterStageMode = useCallback(() => {
    // UI 상태를 먼저 뒤집는다. keep-awake/brightness는 Android에서 권한
    // 확인 등으로 실제 시간이 걸릴 수 있으며 stageModeActive가 이들을
    // 기다려선 안 된다.
    setStageModeActive(true);

    if (Platform.OS !== "web") {
      // InteractionManager.runAfterInteractions: React 렌더/애니메이션이
      // 완전히 끝난 뒤 native 호출을 실행해 bridge 크래시를 방지한다.
      InteractionManager.runAfterInteractions(() => {
        void (async () => {
          try {
            const KeepAwake = await import("expo-keep-awake");
            await KeepAwake.activateKeepAwakeAsync("stage-mode");
          } catch {
            // expo-keep-awake 미지원 환경 — 조용히 무시
          }
          try {
            const Brightness = await import("expo-brightness");
            // isAvailableAsync 확인 후에만 호출 (Android 권한 없는 기기에서
            // getBrightnessAsync 가 native exception 을 발생시킬 수 있다)
            const available = await Brightness.isAvailableAsync();
            if (available) {
              const brightness = await Brightness.getBrightnessAsync();
              savedBrightnessRef.current = brightness;
              await Brightness.setBrightnessAsync(1.0);
            }
          } catch {
            // expo-brightness 미지원/권한 없음 — 조용히 무시
          }
        })();
      });
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
          const available = await Brightness.isAvailableAsync();
          if (available) {
            await Brightness.setBrightnessAsync(savedBrightnessRef.current);
          }
          savedBrightnessRef.current = null;
        }
      } catch {}
    }
  }, []);

  // 볼륨 버튼 BPM 조절 (react-native-volume-manager 사용 가능한 경우에만)
  // 단타 → ±1, 홀드 자동반복(이벤트 간격 < 400ms) → ±10
  // InteractionManager.runAfterInteractions 로 등록을 지연해
  // 무대 모드 진입 애니메이션 중 native 모듈 초기화를 피한다.
  useEffect(() => {
    if (Platform.OS === "web" || !stageModeActive) return;

    let cancelled = false;
    let subscription: { remove?: () => void } | null = null;
    let prevVolume: number | null = null;
    let isRestoring = false;
    let lastEventTime = 0;

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;

      const setup = async () => {
        try {
          const mod = require("react-native-volume-manager") as {
            VolumeManager: {
              getVolume: () => Promise<{ volume: number }>;
              setVolume: (v: number, opts?: { showUI?: boolean }) => void;
              addVolumeListener: (cb: (r: { volume: number }) => void) => { remove: () => void };
            };
          };
          const { VolumeManager } = mod;

          if (cancelled) return;
          const initial = await VolumeManager.getVolume();
          if (cancelled) return;
          prevVolume = initial.volume;

          subscription = VolumeManager.addVolumeListener((result) => {
            if (!stageModeActiveRef.current) return;

            if (isRestoring) {
              isRestoring = false;
              prevVolume = result.volume;
              return;
            }

            const now = Date.now();
            const interval = now - lastEventTime;
            // 이전 이벤트 이후 400ms 미만이면 홀드(자동반복) → ±10
            const delta = lastEventTime > 0 && interval < 400 ? 10 : 1;
            lastEventTime = now;

            const direction = prevVolume !== null && result.volume > prevVolume ? 1 : -1;
            const snapshotVolume = prevVolume ?? result.volume;
            prevVolume = snapshotVolume;

            const current = bpmRef.current ?? 120;
            const newBpm = Math.min(300, Math.max(20, current + delta * direction));
            onBpmChangeRef.current(newBpm);

            // 시스템 볼륨 원상복구 (UI 없이)
            isRestoring = true;
            VolumeManager.setVolume(snapshotVolume, { showUI: false });
          });
        } catch {
          // react-native-volume-manager 미설치 또는 native 예외 — 볼륨 버튼 BPM 기능 비활성
        }
      };

      void setup();
    });

    return () => {
      cancelled = true;
      task.cancel();
      subscription?.remove?.();
    };
  }, [stageModeActive, bpmRef]);

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
        import("expo-brightness").then(async (m) => {
          try {
            const available = await m.isAvailableAsync();
            if (available) await m.setBrightnessAsync(saved);
          } catch {}
        }).catch(() => {});
      }
    };
  }, []);

  return { stageModeActive, enterStageMode, exitStageMode };
}

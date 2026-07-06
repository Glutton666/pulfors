import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TranslationFn } from "@/lib/i18n";

type FadeOutPhase = "audible1" | "muted" | "audible2" | null;

/**
 * app/index.tsx에서 분리한 "페이드아웃" 세션 상태.
 * 재생이 멈추면 자동으로 세션을 정리하고, 진행 상태 텍스트를 계산해 반환한다.
 * 실제 페이드아웃 스케줄링(엔진 틱 콜백 안에서 mute 여부 판단)은 여전히
 * app/index.tsx에서 fadeOutSessionRef/fadeOutMutedRef를 직접 참조해 처리한다.
 */
export function useFadeOutSession(isPlaying: boolean, t: TranslationFn) {
  const fadeOutSessionRef = useRef<{ N: number; M: number; K: number } | null>(null);
  const fadeOutMutedRef = useRef(false);
  const [fadeOutPhase, setFadeOutPhase] = useState<FadeOutPhase>(null);
  const [fadeOutMeasureInPhase, setFadeOutMeasureInPhase] = useState(0);
  const fadeOutMeasureCountRef = useRef(0);

  const clearFadeOutSession = useCallback(() => {
    fadeOutSessionRef.current = null;
    fadeOutMutedRef.current = false;
    fadeOutMeasureCountRef.current = 0;
    setFadeOutPhase(null);
    setFadeOutMeasureInPhase(0);
  }, []);

  useEffect(() => {
    if (!isPlaying && fadeOutSessionRef.current) {
      clearFadeOutSession();
    }
  }, [isPlaying, clearFadeOutSession]);

  const fadeOutStatusText = useMemo(() => {
    const sess = fadeOutSessionRef.current;
    if (!sess || !fadeOutPhase) return null;
    const cur = fadeOutMeasureInPhase + 1;
    if (fadeOutPhase === "audible1") {
      return t("fadeOut", "statusAudible1").replace("%cur", String(cur)).replace("%n", String(sess.N));
    }
    if (fadeOutPhase === "muted") {
      return t("fadeOut", "statusMuted").replace("%cur", String(cur)).replace("%m", String(sess.M));
    }
    return t("fadeOut", "statusAudible2").replace("%cur", String(cur)).replace("%k", String(sess.K));
  }, [fadeOutPhase, fadeOutMeasureInPhase, t]);

  return {
    fadeOutSessionRef,
    fadeOutMutedRef,
    fadeOutPhase,
    setFadeOutPhase,
    fadeOutMeasureInPhase,
    setFadeOutMeasureInPhase,
    fadeOutMeasureCountRef,
    clearFadeOutSession,
    fadeOutStatusText,
  };
}

export type FadeOutSession = ReturnType<typeof useFadeOutSession>;

import { useState, useEffect, useRef, useCallback } from "react";
import { Platform, AppState } from "react-native";
import {
  hasAnyPendingPermissionAction,
  tryRecoverPermissionActions,
  runPermissionRecoveryLoop,
} from "@/lib/permissions";
import type { TranslationFn } from "@/lib/i18n";

/**
 * 권한 복구 토스트 상태 + 백그라운드 복구 루프.
 *
 * - `permissionRecoveryToast`: 화면에 표시할 메시지 (null이면 숨김).
 * - `showRecoveryToast`: 2.5초 후 자동 소멸하는 토스트 메시지를 표시한다.
 *
 * 복구 루프는 앱이 포그라운드로 돌아올 때(AppState "active" / 웹 visibilitychange)
 * 한 번씩 실행되며, 권한이 복구되면 번역된 토스트를 보여준다.
 *
 * useAudioPipeline이 showRecoveryToast를 파라미터로 받으므로, 이 훅은
 * useAudioPipeline보다 먼저 호출해야 한다.
 */
export interface PermissionRecoveryToastResult {
  permissionRecoveryToast: string | null;
  showRecoveryToast: (msg: string) => void;
}

type RecoveryToastState =
  | { type: "message"; message: string }
  | { type: "permission"; kind: "mic" | "photo" }
  | null;

/**
 * Resolve permission recovery copy at render time, rather than when a recovery
 * event fires. This keeps a visible toast in sync if the app language changes
 * while it is on screen (for example after returning from Settings).
 */
export function resolveRecoveryToast(
  toast: RecoveryToastState,
  t: TranslationFn,
): string | null {
  if (!toast) return null;
  if (toast.type === "message") return toast.message;
  return t("permissions", toast.kind === "mic" ? "recoveredMic" : "recoveredPhoto");
}

export function usePermissionRecoveryToast(
  t: TranslationFn,
): PermissionRecoveryToastResult {
  const [toastState, setToastState] = useState<RecoveryToastState>(null);
  const recoveryToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showRecoveryToast = useCallback((msg: string) => {
    if (recoveryToastTimerRef.current) clearTimeout(recoveryToastTimerRef.current);
    setToastState({ type: "message", message: msg });
    recoveryToastTimerRef.current = setTimeout(() => setToastState(null), 2500);
  }, []);

  const showRecoveredPermissionToast = useCallback((kind: "mic" | "photo") => {
    if (recoveryToastTimerRef.current) clearTimeout(recoveryToastTimerRef.current);
    setToastState({ type: "permission", kind });
    recoveryToastTimerRef.current = setTimeout(() => setToastState(null), 2500);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const runRecovery = () => runPermissionRecoveryLoop({
      hasPending: hasAnyPendingPermissionAction,
      recover: tryRecoverPermissionActions,
      isCancelled: () => cancelled,
      onRecovered: (kind) => {
        showRecoveredPermissionToast(kind === "mic" ? "mic" : "photo");
      },
    });
    if (Platform.OS === "web") {
      const onVis = () => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          void runRecovery();
        }
      };
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVis);
        return () => {
          cancelled = true;
          document.removeEventListener("visibilitychange", onVis);
        };
      }
      return () => { cancelled = true; };
    }
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void runRecovery();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [showRecoveredPermissionToast]);

  // 타이머 정리
  useEffect(() => {
    return () => {
      if (recoveryToastTimerRef.current) clearTimeout(recoveryToastTimerRef.current);
    };
  }, []);

  return {
    permissionRecoveryToast: resolveRecoveryToast(toastState, t),
    showRecoveryToast,
  };
}

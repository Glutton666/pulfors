// ============================================================
// confirm.ts — Alert 유틸 (웹/네이티브 분기 통합)
// 웹: 앱 내부의 WebAlertHost
// 네이티브: Alert.alert
// ============================================================

import { Alert } from "./alert";

export interface ConfirmDestructiveOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * 파괴적 작업(삭제·초기화 등) 확인 다이얼로그
 * 웹에서는 앱 내부 확인창, 네이티브에서는 Alert.alert()를 사용한다.
 */
export function confirmDestructive(
  message: string,
  options: ConfirmDestructiveOptions,
): void {
  const {
    title = "",
    confirmText = "삭제",
    cancelText = "취소",
    onConfirm,
  } = options;

  const alertTitle = title || message;
  const alertMsg = title ? message : undefined;
  Alert.alert(alertTitle, alertMsg, [
    { text: cancelText, style: "cancel" },
    { text: confirmText, style: "destructive", onPress: () => void Promise.resolve(onConfirm()) },
  ]);
}

/**
 * 단순 정보 알림 (확인 버튼 1개)
 */
export function alertInfo(title: string, message?: string): void {
  Alert.alert(title, message);
}

/**
 * 에러 알림
 */
export function alertError(title: string, message?: string): void {
  alertInfo(title, message);
}

/**
 * AsyncStorage 실패를 앱 전역에 알리는 단순 이벤트 버스.
 *
 * 이전에는 storage.ts 의 save/load 실패가 logger.warn 으로만 묵살되어
 * 사용자가 "내 설정이 사라졌다" 같은 신뢰 손상을 겪었습니다. 이제 실패가
 * 발생하면 등록된 리스너(앱 루트의 Alert 핸들러 등)에 전달됩니다.
 */

import { captureBreadcrumb } from "./error-tracking";
import { logger } from "./logger";

export interface StorageErrorInfo {
  key: string;
  operation: "save" | "load";
  error: unknown;
}

type Listener = (info: StorageErrorInfo) => void;

const listeners = new Set<Listener>();

export function notifyStorageError(info: StorageErrorInfo): void {
  logger.warn(`[storage] ${info.operation} failed for ${info.key}:`, info.error);
  captureBreadcrumb({
    category: "storage",
    message: `${info.operation} failed: ${info.key}`,
    level: "warning",
    data: { error: String(info.error) },
  });
  for (const listener of listeners) {
    try {
      listener(info);
    } catch (e) {
      logger.warn("[storage-notifier] listener threw:", e);
    }
  }
}

export function onStorageError(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearStorageErrorListeners(): void {
  listeners.clear();
}

import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { requestRecordingPermissionsAsync } from "expo-audio";
import type { TranslationFn } from "@/lib/i18n";
import { captureBreadcrumb } from "@/lib/error-tracking";

export type PermissionKind = "mic" | "photo" | "location";

export interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

type RequestImpl = (kind: PermissionKind) => Promise<PermissionResult>;

const defaultRequestImpl: RequestImpl = async (kind) => {
  if (kind === "mic") {
    const { status, canAskAgain } = await requestRecordingPermissionsAsync();
    return { granted: status === "granted", canAskAgain: canAskAgain ?? true };
  }
  if (kind === "location") {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    return { granted: status === "granted", canAskAgain: canAskAgain ?? true };
  }
  const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return { granted: status === "granted", canAskAgain: canAskAgain ?? true };
};

let requestImpl: RequestImpl = defaultRequestImpl;

export function _setPermissionRequestImplForTest(fn: RequestImpl | null): void {
  requestImpl = fn ?? defaultRequestImpl;
}

async function requestRaw(kind: PermissionKind): Promise<PermissionResult> {
  return requestImpl(kind);
}

interface PendingEntry {
  run: () => void | Promise<void>;
  attempts: number;
  /** entry.run() 일시 실패 시 다음 active 한 번 더 재시도할 카운터. 0이 되면 cleanup. */
  runRetriesLeft: number;
  registeredAt: number;
}

const DEFAULT_RUN_RETRIES = 1;

const MAX_RECOVERY_ATTEMPTS = 2;
const PENDING_TTL_MS = 5 * 60 * 1000;
const pendingByKind = new Map<PermissionKind, PendingEntry>();

export function hasAnyPendingPermissionAction(): boolean {
  return pendingByKind.size > 0;
}

export function clearPendingPermissionAction(kind: PermissionKind): void {
  pendingByKind.delete(kind);
}

export function _resetPendingPermissionsForTest(): void {
  pendingByKind.clear();
}

export type PermissionRecoveryStatus = "recovered" | "still-denied" | "abandoned";
export interface PermissionRecoveryEvent {
  kind: PermissionKind;
  status: PermissionRecoveryStatus;
}

/**
 * runRecovery 루프의 컴포넌트 의존성 없는 헬퍼. await 사이마다 isCancelled를
 * 확인해 언마운트된 컴포넌트의 setState 콜이 일어나지 않도록 보장한다.
 * recovered 이벤트마다 onRecovered 콜백을 호출한다.
 */
export async function runPermissionRecoveryLoop(opts: {
  hasPending: () => boolean;
  recover: () => Promise<PermissionRecoveryEvent[]>;
  isCancelled: () => boolean;
  onRecovered: (kind: PermissionKind) => void;
}): Promise<void> {
  if (opts.isCancelled()) return;
  if (!opts.hasPending()) return;
  const events = await opts.recover();
  if (opts.isCancelled()) return;
  for (const ev of events) {
    if (opts.isCancelled()) return;
    if (ev.status === "recovered") opts.onRecovered(ev.kind);
  }
}

// AppState 'active'/visibilitychange가 여러 번 연속으로 발생할 수 있어
// 동일 pending 액션이 중복 실행되는 것을 방지한다. probe 자체는 idempotent
// 하지만 entry.run() 사이드이펙트(녹음 시작 등)는 1회만 일어나야 한다.
let recoveryInProgress: Promise<PermissionRecoveryEvent[]> | null = null;

export async function tryRecoverPermissionActions(now: number = Date.now()): Promise<PermissionRecoveryEvent[]> {
  if (recoveryInProgress) return recoveryInProgress;
  recoveryInProgress = runRecoveryOnce(now).finally(() => {
    recoveryInProgress = null;
  });
  return recoveryInProgress;
}

async function runRecoveryOnce(now: number): Promise<PermissionRecoveryEvent[]> {
  const events: PermissionRecoveryEvent[] = [];
  for (const kind of Array.from(pendingByKind.keys())) {
    const entry = pendingByKind.get(kind);
    if (!entry) continue;
    if (now - entry.registeredAt > PENDING_TTL_MS) {
      pendingByKind.delete(kind);
      events.push({ kind, status: "abandoned" });
      continue;
    }
    let res: PermissionResult;
    try {
      res = await requestImpl(kind);
    } catch (e) {
      captureBreadcrumb({ category: "permissions", message: "recovery probe failed", level: "warning", data: { kind, error: String(e) } });
      res = { granted: false, canAskAgain: true };
    }
    if (res.granted) {
      let runOk = true;
      try {
        await entry.run();
      } catch (e) {
        runOk = false;
        captureBreadcrumb({ category: "permissions", message: "recovery action threw", level: "warning", data: { kind, error: String(e) } });
      }
      if (runOk) {
        pendingByKind.delete(kind);
        events.push({ kind, status: "recovered" });
      } else if (entry.runRetriesLeft > 0) {
        // 권한은 받았지만 entry.run()이 일시 실패 → pending 유지하고 다음 active에 재시도.
        entry.runRetriesLeft -= 1;
        events.push({ kind, status: "still-denied" });
      } else {
        // 재시도까지 실패 → 정리.
        pendingByKind.delete(kind);
        events.push({ kind, status: "abandoned" });
      }
    } else {
      entry.attempts += 1;
      if (entry.attempts >= MAX_RECOVERY_ATTEMPTS) {
        pendingByKind.delete(kind);
        events.push({ kind, status: "abandoned" });
      } else {
        events.push({ kind, status: "still-denied" });
      }
    }
  }
  return events;
}

function deniedKeys(kind: PermissionKind) {
  if (kind === "mic") return { denied: "micDenied" as const, deepLink: "micDeniedOpenSettings" as const };
  if (kind === "location") return { denied: "locationDenied" as const, deepLink: "locationDeniedOpenSettings" as const };
  return { denied: "photoDenied" as const, deepLink: "photoDeniedOpenSettings" as const };
}

export async function ensurePermission(
  kind: PermissionKind,
  t: TranslationFn,
  options: {
    showAlertOnDeny?: boolean;
    pendingAction?: () => void | Promise<void>;
  } = {},
): Promise<boolean> {
  const showAlert = options.showAlertOnDeny ?? true;
  try {
    const res = await requestRaw(kind);
    if (res.granted) {
      pendingByKind.delete(kind);
      return true;
    }
    // 취소 시 pending이 stale하게 남아 다음 foreground에서 의도치 않게 실행되는
    // 것을 막기 위해, 알림 없는 경로에서만 즉시 등록한다. 알림이 표시되는 경우
    // "설정 열기"를 누른 시점에만 pending을 등록한다.
    const registerPending = () => {
      if (options.pendingAction) {
        pendingByKind.set(kind, {
          run: options.pendingAction,
          attempts: 0,
          runRetriesLeft: DEFAULT_RUN_RETRIES,
          registeredAt: Date.now(),
        });
      }
    };
    if (!showAlert) {
      if (!res.canAskAgain) registerPending();
      return false;
    }

    const keys = deniedKeys(kind);
    const title = t("permissions", "title");
    const cancel = t("permissions", "cancel");
    const openSettings = t("permissions", "openSettings");

    if (!res.canAskAgain && Platform.OS !== "web") {
      Alert.alert(title, t("permissions", keys.deepLink), [
        { text: cancel, style: "cancel" },
        {
          text: openSettings,
          onPress: () => {
            registerPending();
            Linking.openSettings();
          },
        },
      ]);
    } else {
      Alert.alert(title, t("permissions", keys.denied));
    }
    return false;
  } catch (e) {
    captureBreadcrumb({
      category: "permissions",
      message: "request failed",
      level: "warning",
      data: { kind, error: String(e) },
    });
    return false;
  }
}

import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { requestRecordingPermissionsAsync } from "expo-audio";
import type { TranslationFn } from "@/lib/i18n";
import { captureBreadcrumb } from "@/lib/error-tracking";

export type PermissionKind = "mic" | "photo";

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
  registeredAt: number;
}

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
      pendingByKind.delete(kind);
      try {
        await entry.run();
      } catch (e) {
        captureBreadcrumb({ category: "permissions", message: "recovery action threw", level: "warning", data: { kind, error: String(e) } });
      }
      events.push({ kind, status: "recovered" });
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
  return kind === "mic"
    ? { denied: "micDenied" as const, deepLink: "micDeniedOpenSettings" as const }
    : { denied: "photoDenied" as const, deepLink: "photoDeniedOpenSettings" as const };
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
    if (options.pendingAction && !res.canAskAgain) {
      pendingByKind.set(kind, { run: options.pendingAction, attempts: 0, registeredAt: Date.now() });
    }
    if (!showAlert) return false;

    const keys = deniedKeys(kind);
    const title = t("permissions", "title");
    const cancel = t("permissions", "cancel");
    const openSettings = t("permissions", "openSettings");

    if (!res.canAskAgain && Platform.OS !== "web") {
      Alert.alert(title, t("permissions", keys.deepLink), [
        { text: cancel, style: "cancel" },
        { text: openSettings, onPress: () => Linking.openSettings() },
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

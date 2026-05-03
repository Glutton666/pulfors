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

async function requestRaw(kind: PermissionKind): Promise<PermissionResult> {
  if (kind === "mic") {
    const { status, canAskAgain } = await requestRecordingPermissionsAsync();
    return { granted: status === "granted", canAskAgain: canAskAgain ?? true };
  }
  const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return { granted: status === "granted", canAskAgain: canAskAgain ?? true };
}

function deniedKeys(kind: PermissionKind) {
  return kind === "mic"
    ? { denied: "micDenied" as const, deepLink: "micDeniedOpenSettings" as const }
    : { denied: "photoDenied" as const, deepLink: "photoDeniedOpenSettings" as const };
}

export async function ensurePermission(
  kind: PermissionKind,
  t: TranslationFn,
  options: { showAlertOnDeny?: boolean } = {},
): Promise<boolean> {
  const showAlert = options.showAlertOnDeny ?? true;
  try {
    const res = await requestRaw(kind);
    if (res.granted) return true;
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

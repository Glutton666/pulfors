import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { onStorageError, type StorageErrorInfo } from "@/lib/storage-notifier";
import { useLanguage } from "@/contexts/LanguageContext";
import { createT } from "@/lib/i18n";
import { logger } from "@/lib/logger";

/**
 * AsyncStorage 실패가 발생하면 사용자에게 한 번 알림(Alert)을 띄웁니다.
 * 짧은 시간 내 중복 알림을 방지하기 위해 5초 쿨다운을 둡니다.
 *
 * 이 컴포넌트는 UI를 그리지 않습니다 (purely subscriber).
 */
export function StorageErrorAlert(): null {
  const { language } = useLanguage();
  const lastAlertRef = useRef(0);
  const langRef = useRef(language);

  useEffect(() => { langRef.current = language; }, [language]);

  useEffect(() => {
    const off = onStorageError((info: StorageErrorInfo) => {
      const now = Date.now();
      if (now - lastAlertRef.current < 5000) return;
      lastAlertRef.current = now;

      const t = createT(langRef.current);
      const isSave = info.operation === "save";
      const title = isSave
        ? t("storage" as any, "saveFailedTitle" as any)
        : t("storage" as any, "loadFailedTitle" as any);
      const body = isSave
        ? t("storage" as any, "saveFailedBody" as any)
        : t("storage" as any, "loadFailedBody" as any);

      // i18n 키가 없을 경우 fallback (번역 추가 전 안전 동작)
      const safeTitle = typeof title === "string" && title.length > 0
        ? title
        : (langRef.current === "ko"
            ? (isSave ? "저장 실패" : "불러오기 실패")
            : (isSave ? "Save failed" : "Load failed"));
      const safeBody = typeof body === "string" && body.length > 0
        ? body
        : (langRef.current === "ko"
            ? (isSave
                ? "기기 저장소에 설정을 저장하지 못했습니다. 저장 공간이 부족하거나 권한이 제한되었을 수 있습니다."
                : "기기 저장소에서 설정을 불러오지 못해 기본값으로 복귀했습니다.")
            : (isSave
                ? "Could not save settings to device storage. The device may be out of space or permissions are restricted."
                : "Could not load settings from device storage. Defaults are being used."));

      if (Platform.OS === "web") {
        // 웹에서는 Alert가 차단될 수 있으니 console만 보장.
        logger.warn(`[storage-alert] ${safeTitle}: ${safeBody}`);
        return;
      }
      Alert.alert(safeTitle, safeBody);
    });
    return off;
  }, []);

  return null;
}

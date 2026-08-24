import { Platform } from "react-native";
import Constants from "expo-constants";
import { createT, type Language } from "@/lib/i18n";
import { logger } from "./logger";
import {
  requestForegroundPlayback,
  relinquishForegroundPlayback,
} from "./android-foreground-service";

const CATEGORY_ID = "metronome_controls";
const NOTIFICATION_ID = "metronome_playback";

let isSetup = false;
let Notifications: typeof import("expo-notifications") | null = null;

// Expo SDK 54에서 appOwnership이 deprecated — executionEnvironment도 함께 확인
const isExpoGo =
  Constants.appOwnership === "expo" ||
  (Constants as any).executionEnvironment === "storeClient";

async function getNotifications() {
  if (Notifications) return Notifications;
  if (Platform.OS === "web") return null;
  if (isExpoGo) return null;
  try {
    Notifications = await import("expo-notifications");
    return Notifications;
  } catch {
    // Jest's CommonJS runtime cannot execute dynamic import callbacks without
    // experimental VM modules. Native bundlers support the import above; this
    // fallback keeps the same optional-module behavior testable in Jest.
    try {
      Notifications = require("expo-notifications") as typeof import("expo-notifications");
      return Notifications;
    } catch {
      return null;
    }
  }
}

async function initHandler() {
  const N = await getNotifications();
  if (!N) return;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {}
}

initHandler();

export function buildNotificationActions(isPlaying: boolean, lang: Language = "ko") {
  const t = createT(lang);
  return [
    {
      identifier: "BPM_DOWN",
      buttonTitle: "− BPM",
      // BPM adjustments are intentionally handled while the app stays
      // backgrounded. The response listener still receives live and cold-start
      // actions even when the platform does not foreground the UI.
      options: { opensAppToForeground: false },
    },
    {
      identifier: "TOGGLE_PLAY",
      buttonTitle: isPlaying
        ? `⏸ ${t("notification", "pause")}`
        : `▶ ${t("notification", "play")}`,
      // BPM 버튼과 동일하게 백그라운드에서 처리한다 — 다른 미디어 앱처럼
      // 잠금화면/알림에서 재생·일시정지가 앱을 열지 않고 반영돼야 한다
      // (2026-08-24 사용자 요청). 포그라운드 서비스가 살아있는 재생 중
      // 상태에서는 안정적으로 처리되지만, 완전히 종료된 프로세스에서
      // 콜드스타트로 처리되는 경우 반응이 늦을 수 있다 — 폰에서 확인 필요.
      options: { opensAppToForeground: false },
    },
    {
      identifier: "BPM_UP",
      buttonTitle: "+ BPM",
      options: { opensAppToForeground: false },
    },
  ];
}

function buildContent(
  bpm: number,
  _mode: string,
  isPlaying: boolean,
  lang: Language = "ko"
) {
  const t = createT(lang);
  return {
    title: `${isPlaying ? "▶" : "⏸"} ${bpm} BPM`,
    body: `${_mode} · ${isPlaying ? t("notification", "playing") : t("notification", "paused")}`,
    categoryIdentifier: CATEGORY_ID,
    sticky: true,
    autoDismiss: false,
    ...(Platform.OS === "android"
      ? {
          channelId: "metronome",
          priority: "max" as const,
        }
      : {}),
  };
}

export async function setupNotificationControls(lang: Language = "ko") {
  if (isSetup) return;
  if (Platform.OS === "web") return;
  if (isExpoGo) return;

  const N = await getNotifications();
  if (!N) return;

  try {
    const { status } = await N.requestPermissionsAsync();
    if (status !== "granted") return;

    const t = createT(lang);
    if (Platform.OS === "android") {
      // Delete and recreate channel so importance change takes effect.
      // MAX importance is required for the notification to be treated as
      // a foreground-service notification on Android 8+ (API 26+).
      try { await N.deleteNotificationChannelAsync("metronome"); } catch {}
      await N.setNotificationChannelAsync("metronome", {
        name: t("notification", "channelName"),
        importance: N.AndroidImportance.MAX,
        sound: undefined,
        vibrationPattern: [],
        enableVibrate: false,
        lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
        showBadge: false,
      });
    }

    await N.setNotificationCategoryAsync(CATEGORY_ID, buildNotificationActions(false, lang));

    isSetup = true;
  } catch (e) {
    logger.warn("Notification setup error:", e);
  }
}

export async function showPlayingNotification(
  bpm: number,
  mode: string,
  lang: Language = "ko"
) {
  if (Platform.OS === "web") return;
  if (isExpoGo) return;
  if (!isSetup) {
    await setupNotificationControls(lang);
    if (!isSetup) return;
  }

  // Android: AudioControlsService(foreground service)가 백그라운드에서
  // 오디오를 유지하도록 AudioModule을 설정합니다.
  // 알림 표시와 병렬로 실행해 지연을 최소화합니다.
  void requestForegroundPlayback();

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildNotificationActions(true, lang)
    );

    await N.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, true, lang),
      trigger: null,
    });
  } catch (e) {
    logger.warn("Show notification error:", e);
  }
}

export async function updateNotificationBpm(
  bpm: number,
  mode: string,
  isPlaying: boolean = true,
  lang: Language = "ko"
) {
  if (Platform.OS === "web" || !isSetup) return;
  if (isExpoGo) return;

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, isPlaying, lang),
      trigger: null,
    });
  } catch (e) {
    logger.warn("Update notification BPM error:", e);
  }
}

export async function showPausedNotification(
  bpm: number,
  mode: string,
  lang: Language = "ko"
) {
  if (Platform.OS === "web" || !isSetup) return;
  if (isExpoGo) return;

  // Android: 메트로놈이 정지되면 포그라운드 서비스 상태를 초기화합니다.
  // AudioPlayer가 정지되면 AudioControlsService가 자동으로 stopForeground()를
  // 호출하므로 JS 레벨 상태만 초기화합니다.
  relinquishForegroundPlayback();

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildNotificationActions(false, lang)
    );

    await N.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, false, lang),
      trigger: null,
    });
  } catch (e) {
    logger.warn("Show paused notification error:", e);
  }
}

export async function dismissNotification() {
  if (Platform.OS === "web") return;
  if (isExpoGo) return;

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.dismissNotificationAsync(NOTIFICATION_ID);
  } catch (e) {
    logger.warn("Dismiss notification error:", e);
  }
}

export function addNotificationActionListener(
  callback: (actionId: string) => void
) {
  if (Platform.OS === "web") {
    return { remove: () => {} };
  }
  if (isExpoGo) {
    return { remove: () => {} };
  }

  let sub: { remove: () => void } | null = null;
  let removed = false;

  // 앱이 종료 상태에서 알림 버튼으로 실행된 경우를 처리
  getNotifications().then(async (N) => {
    if (!N || removed) return;

    // 앱 실행 시 이미 대기 중인 알림 응답 처리
    try {
      const lastResponse = await N.getLastNotificationResponseAsync();
      if (lastResponse && !removed) {
        const actionId = lastResponse.actionIdentifier;
        if (
          actionId === "TOGGLE_PLAY" ||
          actionId === "BPM_DOWN" ||
          actionId === "BPM_UP"
        ) {
          // 앱이 완전히 마운트된 후 처리
          setTimeout(() => {
            if (!removed) callback(actionId);
          }, 500);
        }
      }
    } catch {}

    if (removed) return;

    sub = N.addNotificationResponseReceivedListener((response) => {
      const actionId = response.actionIdentifier;
      if (
        actionId === "TOGGLE_PLAY" ||
        actionId === "BPM_DOWN" ||
        actionId === "BPM_UP"
      ) {
        callback(actionId);
      }
    });
  });

  return {
    remove: () => {
      removed = true;
      sub?.remove();
    },
  };
}

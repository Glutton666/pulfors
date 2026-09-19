import { Platform } from "react-native";
import Constants from "expo-constants";
import { createT, type Language } from "@/lib/i18n";
import { logger } from "./logger";
import {
  holdForegroundForPausedNotification,
  releasePausedNotificationHold,
} from "./android-foreground-service";
import {
  arePlaybackNotificationsEnabled,
  getPlaybackNotificationsRevision,
  setPlaybackNotificationsEnabled as setPlaybackNotificationsPreference,
} from "./notification-preferences";

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
      // 재생 중과 정지 알림 유지 중 모두 MediaSessionService가 살아 있으므로
      // 앱 화면을 열지 않고 알림 안에서 처리한다.
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
  if (!arePlaybackNotificationsEnabled()) return;
  const preferenceRevision = getPlaybackNotificationsRevision();
  if (Platform.OS === "web") return;
  if (isExpoGo) return;
  if (!isSetup) {
    await setupNotificationControls(lang);
    if (!isSetup) return;
  }

  // Detailed notification state is optional. The actual playback lifecycle
  // owns the mandatory foreground MediaSession notification independently.
  releasePausedNotificationHold();

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildNotificationActions(true, lang)
    );
    if (
      !arePlaybackNotificationsEnabled() ||
      getPlaybackNotificationsRevision() !== preferenceRevision
    ) return;

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
  if (!arePlaybackNotificationsEnabled() || Platform.OS === "web" || !isSetup) return;
  const preferenceRevision = getPlaybackNotificationsRevision();
  if (isExpoGo) return;

  const N = await getNotifications();
  if (!N) return;
  if (
    !arePlaybackNotificationsEnabled() ||
    getPlaybackNotificationsRevision() !== preferenceRevision
  ) return;

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
  if (!arePlaybackNotificationsEnabled()) {
    await dismissNotification();
    return;
  }
  if (Platform.OS === "web" || !isSetup) return;
  if (isExpoGo) return;
  const preferenceRevision = getPlaybackNotificationsRevision();

  const N = await getNotifications();
  if (!N) return;

  try {
    // 정지 상태에서도 무음 플레이어로 MediaSessionService를 유지해야 알림의
    // 재생 액션을 앱 화면을 띄우지 않고 받을 수 있다.
    await holdForegroundForPausedNotification();
    await N.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildNotificationActions(false, lang)
    );
    if (
      !arePlaybackNotificationsEnabled() ||
      getPlaybackNotificationsRevision() !== preferenceRevision
    ) {
      releasePausedNotificationHold();
      return;
    }

    await N.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, false, lang),
      trigger: null,
    });
  } catch (e) {
    releasePausedNotificationHold();
    logger.warn("Show paused notification error:", e);
  }
}

export async function dismissNotification() {
  if (Platform.OS === "web") return;
  if (isExpoGo) return;
  releasePausedNotificationHold();

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.dismissNotificationAsync(NOTIFICATION_ID);
  } catch (e) {
    logger.warn("Dismiss notification error:", e);
  }
}

export function setPlaybackNotificationsEnabled(enabled: boolean): void {
  setPlaybackNotificationsPreference(enabled);
  if (!enabled) void dismissNotification();
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

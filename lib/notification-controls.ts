import { Platform } from "react-native";
import Constants from "expo-constants";
import { createT, type Language } from "@/lib/i18n";

const CATEGORY_ID = "metronome_controls";
const NOTIFICATION_ID = "metronome_playback";

let isSetup = false;
let Notifications: typeof import("expo-notifications") | null = null;

const isExpoGo = Constants.appOwnership === "expo";

async function getNotifications() {
  if (Notifications) return Notifications;
  if (Platform.OS === "web") return null;
  if (isExpoGo) return null;
  try {
    Notifications = await import("expo-notifications");
    return Notifications;
  } catch {
    return null;
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

function buildActions(isPlaying: boolean, lang: Language = "ko") {
  const t = createT(lang);
  return [
    {
      identifier: "BPM_DOWN",
      buttonTitle: "− BPM",
      options: { opensAppToForeground: false },
    },
    {
      identifier: "TOGGLE_PLAY",
      buttonTitle: isPlaying ? `⏸ ${t("notification", "pause")}` : `▶ ${t("notification", "play")}`,
      options: { opensAppToForeground: true },
    },
    {
      identifier: "BPM_UP",
      buttonTitle: "+ BPM",
      options: { opensAppToForeground: false },
    },
  ];
}

function buildContent(bpm: number, _mode: string, isPlaying: boolean, lang: Language = "ko") {
  const t = createT(lang);
  return {
    title: `${isPlaying ? "▶" : "⏸"} ${bpm} BPM`,
    body: isPlaying ? t("notification", "playing") : t("notification", "paused"),
    categoryIdentifier: CATEGORY_ID,
    sticky: true,
    autoDismiss: false,
    ...(Platform.OS === "android" ? { channelId: "metronome" } : {}),
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
      await N.setNotificationChannelAsync("metronome", {
        name: t("notification", "channelName"),
        importance: N.AndroidImportance.LOW,
        sound: undefined,
        vibrationPattern: [],
        enableVibrate: false,
      });
    }

    await N.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildActions(false, lang)
    );

    isSetup = true;
  } catch (e) {
    console.warn("Notification setup error:", e);
  }
}

export async function showPlayingNotification(bpm: number, mode: string, lang: Language = "ko") {
  if (Platform.OS === "web") return;
  if (isExpoGo) return;
  if (!isSetup) {
    await setupNotificationControls(lang);
    if (!isSetup) return;
  }

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildActions(true, lang)
    );

    await N.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, true, lang),
      trigger: null,
    });
  } catch (e) {
    console.warn("Show notification error:", e);
  }
}

export async function updateNotificationBpm(bpm: number, mode: string, isPlaying: boolean = true, lang: Language = "ko") {
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
    console.warn("Update notification BPM error:", e);
  }
}

export async function showPausedNotification(bpm: number, mode: string, lang: Language = "ko") {
  if (Platform.OS === "web" || !isSetup) return;
  if (isExpoGo) return;

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildActions(false, lang)
    );

    await N.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, false, lang),
      trigger: null,
    });
  } catch (e) {
    console.warn("Show paused notification error:", e);
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
    console.warn("Dismiss notification error:", e);
  }
}

export function addNotificationActionListener(
  callback: (actionId: string) => void
) {
  if (Platform.OS === "web" || !Notifications) {
    return { remove: () => {} };
  }
  if (isExpoGo) {
    return { remove: () => {} };
  }

  return Notifications.addNotificationResponseReceivedListener((response) => {
    const actionId = response.actionIdentifier;
    if (
      actionId === "TOGGLE_PLAY" ||
      actionId === "BPM_DOWN" ||
      actionId === "BPM_UP"
    ) {
      callback(actionId);
    }
  });
}

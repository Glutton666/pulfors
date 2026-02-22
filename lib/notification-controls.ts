import { Platform } from "react-native";
import Constants from "expo-constants";

const CATEGORY_ID = "metronome_controls";
const NOTIFICATION_ID = "metronome_playback";

let isSetup = false;
let Notifications: typeof import("expo-notifications") | null = null;

const isExpoGo = Constants.appOwnership === "expo";

async function getNotifications() {
  if (Notifications) return Notifications;
  if (Platform.OS === "web" || isExpoGo) return null;
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

function buildActions(isPlaying: boolean) {
  return [
    {
      identifier: "BPM_DOWN",
      buttonTitle: "− BPM",
      options: { opensAppToForeground: false },
    },
    {
      identifier: "TOGGLE_PLAY",
      buttonTitle: isPlaying ? "⏸ Pause" : "▶ Play",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "BPM_UP",
      buttonTitle: "+ BPM",
      options: { opensAppToForeground: false },
    },
  ];
}

function buildContent(bpm: number, _mode: string, isPlaying: boolean) {
  return {
    title: `${isPlaying ? "▶" : "⏸"} ${bpm} BPM`,
    body: isPlaying ? "Playing" : "Paused",
    categoryIdentifier: CATEGORY_ID,
    sticky: true,
    autoDismiss: false,
    ...(Platform.OS === "android" ? { channelId: "metronome" } : {}),
  };
}

export async function setupNotificationControls() {
  if (isSetup || Platform.OS === "web" || isExpoGo) return;

  const N = await getNotifications();
  if (!N) return;

  try {
    const { status } = await N.requestPermissionsAsync();
    if (status !== "granted") return;

    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync("metronome", {
        name: "Metronome Controls",
        importance: N.AndroidImportance.LOW,
        sound: undefined,
        vibrationPattern: [],
        enableVibrate: false,
      });
    }

    await N.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildActions(false)
    );

    isSetup = true;
  } catch (e) {
    console.warn("Notification setup error:", e);
  }
}

export async function showPlayingNotification(bpm: number, mode: string) {
  if (Platform.OS === "web" || isExpoGo) return;
  if (!isSetup) {
    await setupNotificationControls();
    if (!isSetup) return;
  }

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildActions(true)
    );

    await N.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, true),
      trigger: null,
    });
  } catch (e) {
    console.warn("Show notification error:", e);
  }
}

export async function updateNotificationBpm(bpm: number, mode: string, isPlaying: boolean = true) {
  if (Platform.OS === "web" || !isSetup || isExpoGo) return;

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, isPlaying),
      trigger: null,
    });
  } catch (e) {
    console.warn("Update notification BPM error:", e);
  }
}

export async function showPausedNotification(bpm: number, mode: string) {
  if (Platform.OS === "web" || !isSetup || isExpoGo) return;

  const N = await getNotifications();
  if (!N) return;

  try {
    await N.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildActions(false)
    );

    await N.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, false),
      trigger: null,
    });
  } catch (e) {
    console.warn("Show paused notification error:", e);
  }
}

export async function dismissNotification() {
  if (Platform.OS === "web" || isExpoGo) return;

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
  if (Platform.OS === "web" || isExpoGo || !Notifications) {
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

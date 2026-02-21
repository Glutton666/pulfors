import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const CATEGORY_ID = "metronome_controls";
const NOTIFICATION_ID = "metronome_playback";

let isSetup = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

export async function setupNotificationControls() {
  if (isSetup || Platform.OS === "web") return;

  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("metronome", {
        name: "Metronome Controls",
        importance: Notifications.AndroidImportance.LOW,
        sound: undefined,
        vibrationPattern: [],
        enableVibrate: false,
      });
    }

    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: "TOGGLE_PLAY",
        buttonTitle: "⏸ 정지",
        options: { opensAppToForeground: false },
      },
    ]);

    isSetup = true;
  } catch (e) {
    console.warn("Notification setup error:", e);
  }
}

export async function showPlayingNotification(bpm: number, mode: string) {
  if (Platform.OS === "web" || !isSetup) return;

  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: "TOGGLE_PLAY",
        buttonTitle: "⏸ 정지",
        options: { opensAppToForeground: false },
      },
    ]);

    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: `🎵 ${bpm} BPM`,
        body: `${mode} 모드 재생 중`,
        categoryIdentifier: CATEGORY_ID,
        sticky: true,
        ...(Platform.OS === "android"
          ? { channelId: "metronome" }
          : {}),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn("Show notification error:", e);
  }
}

export async function showPausedNotification(bpm: number, mode: string) {
  if (Platform.OS === "web" || !isSetup) return;

  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: "TOGGLE_PLAY",
        buttonTitle: "▶ 재생",
        options: { opensAppToForeground: false },
      },
    ]);

    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: `🎵 ${bpm} BPM`,
        body: `${mode} 모드 일시정지`,
        categoryIdentifier: CATEGORY_ID,
        sticky: true,
        ...(Platform.OS === "android"
          ? { channelId: "metronome" }
          : {}),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn("Update notification error:", e);
  }
}

export async function dismissNotification() {
  if (Platform.OS === "web") return;

  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch (e) {
    console.warn("Dismiss notification error:", e);
  }
}

export function addNotificationActionListener(
  callback: (actionId: string) => void
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const actionId = response.actionIdentifier;
    if (actionId === "TOGGLE_PLAY" || actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      callback(actionId === "TOGGLE_PLAY" ? "TOGGLE_PLAY" : "OPEN_APP");
    }
  });
}

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const CATEGORY_ID = "metronome_controls";
const NOTIFICATION_ID = "metronome_playback";

let isSetup = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
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
        buttonTitle: "⏸ Stop",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "BPM_DOWN",
        buttonTitle: "BPM -5",
        options: { opensAppToForeground: false },
      },
      {
        identifier: "BPM_UP",
        buttonTitle: "BPM +5",
        options: { opensAppToForeground: false },
      },
    ]);

    isSetup = true;
  } catch (e) {
    console.warn("Notification setup error:", e);
  }
}

export async function showPlayingNotification(bpm: number, mode: string) {
  if (Platform.OS === "web") return;
  if (!isSetup) {
    await setupNotificationControls();
    if (!isSetup) return;
  }

  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: "TOGGLE_PLAY",
        buttonTitle: "⏸ Stop",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "BPM_DOWN",
        buttonTitle: "-5 BPM",
        options: { opensAppToForeground: false },
      },
      {
        identifier: "BPM_UP",
        buttonTitle: "+5 BPM",
        options: { opensAppToForeground: false },
      },
    ]);

    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: `🎵 ${bpm} BPM - Playing`,
        body: `${mode} mode`,
        categoryIdentifier: CATEGORY_ID,
        sticky: true,
        autoDismiss: false,
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

export async function updateNotificationBpm(bpm: number, mode: string) {
  if (Platform.OS === "web" || !isSetup) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: `🎵 ${bpm} BPM - Playing`,
        body: `${mode} mode`,
        categoryIdentifier: CATEGORY_ID,
        sticky: true,
        autoDismiss: false,
        ...(Platform.OS === "android"
          ? { channelId: "metronome" }
          : {}),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn("Update notification BPM error:", e);
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
    if (actionId === "TOGGLE_PLAY") {
      callback("TOGGLE_PLAY");
    } else if (actionId === "BPM_DOWN") {
      callback("BPM_DOWN");
    } else if (actionId === "BPM_UP") {
      callback("BPM_UP");
    }
  });
}

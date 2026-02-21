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

    await Notifications.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildActions(false)
    );

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
    await Notifications.setNotificationCategoryAsync(
      CATEGORY_ID,
      buildActions(true)
    );

    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, true),
      trigger: null,
    });
  } catch (e) {
    console.warn("Show notification error:", e);
  }
}

export async function updateNotificationBpm(bpm: number, mode: string, isPlaying: boolean = true) {
  if (Platform.OS === "web" || !isSetup) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: buildContent(bpm, mode, isPlaying),
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
    if (
      actionId === "TOGGLE_PLAY" ||
      actionId === "BPM_DOWN" ||
      actionId === "BPM_UP"
    ) {
      callback(actionId);
    }
  });
}

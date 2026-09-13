jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    appOwnership: "expo",
    executionEnvironment: "storeClient",
  },
}));

import { buildNotificationActions } from "@/lib/notification-controls";

describe("notification playback actions", () => {
  it("keeps pause in the background while playback is active", () => {
    const toggle = buildNotificationActions(true).find(
      (action) => action.identifier === "TOGGLE_PLAY",
    );

    expect(toggle?.options.opensAppToForeground).toBe(false);
  });

  it("opens the app for play after the foreground service has stopped", () => {
    const toggle = buildNotificationActions(false).find(
      (action) => action.identifier === "TOGGLE_PLAY",
    );

    expect(toggle?.options.opensAppToForeground).toBe(true);
  });
});
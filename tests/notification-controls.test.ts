import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const mockSetNotificationHandler = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockDeleteNotificationChannelAsync = jest.fn();
const mockSetNotificationCategoryAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockGetLastNotificationResponseAsync = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    appOwnership: null,
    executionEnvironment: "standalone",
  },
}));

jest.mock("expo-notifications", () => ({
  __esModule: true,
  setNotificationHandler: mockSetNotificationHandler,
  requestPermissionsAsync: mockRequestPermissionsAsync,
  setNotificationChannelAsync: mockSetNotificationChannelAsync,
  deleteNotificationChannelAsync: mockDeleteNotificationChannelAsync,
  setNotificationCategoryAsync: mockSetNotificationCategoryAsync,
  scheduleNotificationAsync: mockScheduleNotificationAsync,
  getLastNotificationResponseAsync: mockGetLastNotificationResponseAsync,
  addNotificationResponseReceivedListener: mockAddNotificationResponseReceivedListener,
  AndroidImportance: { MAX: "max" },
  AndroidNotificationVisibility: { PUBLIC: "public" },
}));

import {
  addNotificationActionListener,
  buildNotificationActions,
  setupNotificationControls,
} from "../lib/notification-controls";

let liveResponseListener: ((response: { actionIdentifier: string }) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestPermissionsAsync.mockResolvedValue({ status: "granted" });
  mockDeleteNotificationChannelAsync.mockResolvedValue(undefined);
  mockSetNotificationChannelAsync.mockResolvedValue(undefined);
  mockSetNotificationCategoryAsync.mockResolvedValue(undefined);
  mockScheduleNotificationAsync.mockResolvedValue("notification-id");
  mockGetLastNotificationResponseAsync.mockResolvedValue(null);
  liveResponseListener = null;
  mockAddNotificationResponseReceivedListener.mockImplementation((listener) => {
    liveResponseListener = listener;
    return { remove: jest.fn() };
  });
});

afterEach(() => {
  jest.useRealTimers();
});

test("BPM actions stay backgrounded while TOGGLE_PLAY keeps its own foreground policy", () => {
  const actions = buildNotificationActions(false, "en");
  const byId = Object.fromEntries(actions.map((action) => [action.identifier, action]));

  assert.equal(byId.BPM_UP.options.opensAppToForeground, false);
  assert.equal(byId.BPM_DOWN.options.opensAppToForeground, false);
  assert.equal(byId.TOGGLE_PLAY.options.opensAppToForeground, true);
});

test("notification category registration preserves action options", async () => {
  await setupNotificationControls("en");

  const categoryCall = mockSetNotificationCategoryAsync.mock.calls.at(-1);
  assert.equal(categoryCall?.[0], "metronome_controls");
  const actions = categoryCall?.[1] as ReturnType<typeof buildNotificationActions>;
  const byId = Object.fromEntries(actions.map((action) => [action.identifier, action]));
  assert.equal(byId.BPM_UP.options.opensAppToForeground, false);
  assert.equal(byId.BPM_DOWN.options.opensAppToForeground, false);
  assert.equal(byId.TOGGLE_PLAY.options.opensAppToForeground, true);
});

test("live notification responses dispatch supported actions without changing the listener flow", async () => {
  const callback = jest.fn();
  addNotificationActionListener(callback);
  await Promise.resolve();
  await Promise.resolve();

  liveResponseListener?.({ actionIdentifier: "BPM_UP" });
  liveResponseListener?.({ actionIdentifier: "BPM_DOWN" });
  liveResponseListener?.({ actionIdentifier: "TOGGLE_PLAY" });
  liveResponseListener?.({ actionIdentifier: "UNSUPPORTED" });

  assert.deepEqual(callback.mock.calls.map(([action]) => action), [
    "BPM_UP",
    "BPM_DOWN",
    "TOGGLE_PLAY",
  ]);
});

test("cold-start notification responses dispatch after the app mount delay", async () => {
  jest.useFakeTimers();
  mockGetLastNotificationResponseAsync.mockResolvedValue({
    actionIdentifier: "BPM_DOWN",
  });
  const callback = jest.fn();

  addNotificationActionListener(callback);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(callback.mock.calls.length, 0);

  jest.advanceTimersByTime(500);
  assert.deepEqual(callback.mock.calls.map(([action]) => action), ["BPM_DOWN"]);
});
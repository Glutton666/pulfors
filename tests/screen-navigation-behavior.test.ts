/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { BackHandler } from "react-native";
import { useScreenNavigation, type UseScreenNavigationParams } from "@/hooks/useScreenNavigation";

jest.mock("react-native", () => ({
  ...jest.requireActual("react-native"),
  Platform: { OS: "android" },
  BackHandler: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    exitApp: jest.fn(),
  },
}));
jest.mock("@/lib/storage", () => ({
  TUTORIAL_CONTENT_VERSION: 1,
  saveTutorialState: jest.fn(async () => undefined),
  resetTutorialState: jest.fn(async () => ({})),
}));

function makeParams(): UseScreenNavigationParams {
  return {
    setActiveModal: jest.fn(),
    showSettings: false, showProfile: false, showAssistant: false,
    showTuningGuide: false, showSignalGen: false, showPracticeBook: false,
    showWorkUp: false, showFadeOut: false, showScheduledStart: false,
    showDrumKit: false, showPolygon: false, showMenu: false,
    showOnboarding: false, showReboot: false,
    setShowReboot: jest.fn(), coreMode: "beat",
    barModeRef: { current: false },
    handleBarModeChangeRef: { current: jest.fn() },
    reopenSignalGenAfterTuningGuideRef: { current: false },
    tuningGuideOnSelectRef: { current: null },
    playbackModeRef: { current: "beat" },
    setScoreEditorDoc: jest.fn(), setScoreMode: jest.fn(),
    setTutorialState: jest.fn(), tutorialModeRef: { current: null },
    tutorialStateRef: { current: {} as UseScreenNavigationParams["tutorialStateRef"]["current"] },
    setTutorialMode: jest.fn(), setTutorialLastAction: jest.fn(),
  };
}

beforeEach(() => { jest.clearAllMocks(); });

it("does not reinstall Android back handling for an unrelated parent render", () => {
  const params = makeParams();
  const { rerender, unmount } = renderHook(p => useScreenNavigation(p), { initialProps: params });
  const addListener = jest.mocked(BackHandler.addEventListener);
  const subscription = addListener.mock.results[0].value;
  rerender({ ...params });
  expect(addListener).toHaveBeenCalledTimes(1);
  expect(subscription.remove).not.toHaveBeenCalled();
  unmount();
  expect(subscription.remove).toHaveBeenCalledTimes(1);
});

it("replaces back handling when the visible surface changes and uses the latest state", () => {
  const params = makeParams();
  const { rerender } = renderHook(p => useScreenNavigation(p), { initialProps: params });
  const addListener = jest.mocked(BackHandler.addEventListener);
  const first = addListener.mock.results[0].value;
  rerender({ ...params, coreMode: "score" });
  expect(first.remove).toHaveBeenCalledTimes(1);
  expect(addListener).toHaveBeenCalledTimes(2);
  const onBack = addListener.mock.calls[1][1];
  act(() => { expect(onBack()).toBe(true); });
  expect(params.setScoreEditorDoc).toHaveBeenCalledWith(null);
  expect(params.setScoreMode).toHaveBeenCalledWith(null);
  expect(params.setActiveModal).toHaveBeenLastCalledWith("menu");
});

it("reads the current return-to-generator flag without resubscribing", () => {
  const params = { ...makeParams(), showTuningGuide: true };
  const { rerender } = renderHook(p => useScreenNavigation(p), { initialProps: params });
  const addListener = jest.mocked(BackHandler.addEventListener);
  params.reopenSignalGenAfterTuningGuideRef.current = true;
  rerender({ ...params });
  act(() => { addListener.mock.calls[0][1](); });
  expect(params.setActiveModal).toHaveBeenLastCalledWith("signalGen");
  expect(params.reopenSignalGenAfterTuningGuideRef.current).toBe(false);
  expect(addListener).toHaveBeenCalledTimes(1);
});

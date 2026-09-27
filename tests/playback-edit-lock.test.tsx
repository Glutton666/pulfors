/** @jest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { Platform } from "react-native";
import { DEFAULT_BINDINGS, type KeyBindingsMap } from "@/lib/keyboard-bindings";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

function renderLockedKeyboard(state: {
  running: { current: boolean };
  preparing: { current: boolean };
  updateBpm: jest.Mock;
  updateTimeSignature: jest.Mock;
  togglePlayPause: jest.Mock;
}) {
  return renderHook(() => useKeyboardShortcuts({
    keyBindingsRef: { current: DEFAULT_BINDINGS as KeyBindingsMap },
    bpmRef: { current: 120 },
    barBpmRef: { current: 120 },
    updateBpmRef: { current: state.updateBpm },
    handleBarBpmChangeRef: { current: jest.fn() },
    beatsPerMeasureRef: { current: 4 },
    updateTimeSignatureRef: { current: state.updateTimeSignature },
    barModeRef: { current: false },
    barStartBeatRef: { current: null },
    noteModeRef: { current: false },
    stopwatchTimerRef: { current: null },
    stopwatchTimerLandscapeRef: { current: null },
    subdivisionPatternRef: { current: ["normal"] },
    beatTypesRef: { current: ["strong", "normal", "normal", "normal"] },
    dialConfigRef: { current: {} as never },
    handleNoteTogglePlayRef: { current: null },
    anyModalOpenRef: { current: false },
    showKbShortcutsRef: { current: false },
    showNativeKbHintRef: { current: false },
    engineRef: { current: { getIsRunning: () => state.running.current } as never },
    isPreparingRef: state.preparing,
    togglePlayPauseRef: { current: state.togglePlayPause },
    handleBarModeChangeRef: { current: jest.fn() },
    handleAddBarRef: { current: jest.fn() },
    applyCurrentBeatSubdivisionRef: { current: jest.fn(() => true) },
    appendBarSubdivisionRef: { current: jest.fn(() => true) },
    removeBarSubdivisionRef: { current: jest.fn(() => true) },
    barKeyboardActionsRef: {
      current: {
        selectAdjacent: jest.fn(),
        completeBlock: jest.fn(),
        applySymbol: jest.fn(),
        copy: jest.fn(),
        paste: jest.fn(),
        toggleRepeatMode: jest.fn(),
        getRepeatMode: jest.fn(() => "count" as const),
        setRepeatValue: jest.fn(),
        addLayer: jest.fn(),
        quickSave: jest.fn(),
        openAudio: jest.fn(),
      },
    },
    noteNextRef: { current: jest.fn() },
    recorderKeyboardActionsRef: { current: null },
    setNoteMode: jest.fn(),
    setBarStartBeat: jest.fn(),
    setShowKbShortcuts: jest.fn(),
    setShowNativeKbHint: jest.fn(),
    setActiveModal: jest.fn(),
    setBarLoopMode: jest.fn(),
    setBlockPlayMode: jest.fn(),
    setBeatsPerMeasure: jest.fn(),
    setBeatTypes: jest.fn(),
    setBeatSubdivisions: jest.fn(),
    setSubdivisionPattern: jest.fn(),
    persistSettings: {
      flush: jest.fn(),
      cancel: jest.fn(),
      getStatus: jest.fn(),
      subscribeStatus: jest.fn(),
    } as never,
  }));
}

function press(code: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      code,
      key: code === "Space" ? " " : code,
      bubbles: true,
      cancelable: true,
    }));
  });
}

describe("playback edit lock", () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    Platform.OS = "web";
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    jest.useRealTimers();
  });

  it("ignores BPM and beat-count shortcuts during preparation/playback but keeps transport available", () => {
    const state = {
      running: { current: false },
      preparing: { current: true },
      updateBpm: jest.fn(),
      updateTimeSignature: jest.fn(),
      togglePlayPause: jest.fn(),
    };
    const { unmount } = renderLockedKeyboard(state);

    press("ArrowLeft");
    press("ArrowUp");
    press("Space");
    expect(state.updateBpm).not.toHaveBeenCalled();
    expect(state.updateTimeSignature).not.toHaveBeenCalled();
    expect(state.togglePlayPause).toHaveBeenCalledTimes(1);

    state.preparing.current = false;
    state.running.current = true;
    press("ArrowLeft");
    press("ArrowUp");
    expect(state.updateBpm).not.toHaveBeenCalled();
    expect(state.updateTimeSignature).not.toHaveBeenCalled();

    state.running.current = false;
    press("ArrowLeft");
    press("ArrowUp");
    expect(state.updateBpm).toHaveBeenCalledTimes(1);
    expect(state.updateTimeSignature).toHaveBeenCalledWith(5);
    unmount();
  });

  it("stops a held BPM key from repeating as soon as playback begins", () => {
    jest.useFakeTimers();
    const state = {
      running: { current: false },
      preparing: { current: false },
      updateBpm: jest.fn(),
      updateTimeSignature: jest.fn(),
      togglePlayPause: jest.fn(),
    };
    const { unmount } = renderLockedKeyboard(state);

    press("ArrowLeft");
    expect(state.updateBpm).toHaveBeenCalledTimes(1);
    state.running.current = true;
    act(() => jest.advanceTimersByTime(500));
    expect(state.updateBpm).toHaveBeenCalledTimes(1);
    unmount();
  });
});
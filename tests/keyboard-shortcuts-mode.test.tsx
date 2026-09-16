/** @jest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { Platform } from "react-native";
import { DEFAULT_BINDINGS, type KeyBindingsMap } from "@/lib/keyboard-bindings";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

type TestState = {
  barMode: { current: boolean };
  barStartBeat: { current: number | null };
  engine: { current: { getIsRunning: () => boolean } | null };
  addBar: jest.Mock;
  applyBeatSubdivision: jest.Mock;
  appendBarSubdivision: jest.Mock;
  removeBarSubdivision: jest.Mock;
  setBarStartBeat: jest.Mock;
  tapTempo: jest.Mock;
};

function makeTestState(): TestState {
  return {
    barMode: { current: true },
    barStartBeat: { current: 2 },
    engine: { current: { getIsRunning: () => false } },
    addBar: jest.fn(),
    applyBeatSubdivision: jest.fn(),
    appendBarSubdivision: jest.fn(),
    removeBarSubdivision: jest.fn(),
    setBarStartBeat: jest.fn(),
    tapTempo: jest.fn(),
  };
}

function renderShortcuts(state: TestState) {
  const keyBindingsRef = { current: DEFAULT_BINDINGS as KeyBindingsMap };
  const noteModeRef = { current: false };
  const noopRef = { current: jest.fn() };
  const stateSetter = jest.fn();

  return renderHook(() =>
    useKeyboardShortcuts({
      keyBindingsRef,
      bpmRef: { current: 120 },
      barBpmRef: { current: 120 },
      updateBpmRef: noopRef,
      handleBarBpmChangeRef: noopRef,
      beatsPerMeasureRef: { current: 4 },
      updateTimeSignatureRef: noopRef,
      barModeRef: state.barMode,
      barStartBeatRef: state.barStartBeat,
      noteModeRef,
      stopwatchTimerRef: { current: null },
      stopwatchTimerLandscapeRef: { current: null },
      subdivisionPatternRef: { current: ["normal"] },
      beatTypesRef: { current: ["strong", "normal", "normal", "normal"] },
      dialConfigRef: { current: {} as never },
      handleNoteTogglePlayRef: { current: null },
      anyModalOpenRef: { current: false },
      showKbShortcutsRef: { current: false },
      showNativeKbHintRef: { current: false },
      engineRef: state.engine as never,
      togglePlayPauseRef: noopRef,
      handleBarModeChangeRef: noopRef,
      handleAddBarRef: { current: state.addBar },
      applyCurrentBeatSubdivisionRef: { current: state.applyBeatSubdivision },
      appendBarSubdivisionRef: { current: state.appendBarSubdivision },
      removeBarSubdivisionRef: { current: state.removeBarSubdivision },
      setNoteMode: stateSetter,
      setBarStartBeat: state.setBarStartBeat,
      setShowKbShortcuts: stateSetter,
      setShowNativeKbHint: stateSetter,
      setActiveModal: stateSetter,
      setBarLoopMode: stateSetter,
      setBlockPlayMode: stateSetter,
      setBeatsPerMeasure: stateSetter,
      setBeatTypes: stateSetter,
      setBeatSubdivisions: stateSetter,
      setSubdivisionPattern: stateSetter,
      persistSettings: {
        flush: jest.fn(),
        cancel: jest.fn(),
        getStatus: jest.fn(),
        subscribeStatus: jest.fn(),
      } as never,
    }),
  );
}

function press(code: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code,
        key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
}

describe("mode-specific keyboard shortcuts", () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    Platform.OS = "web";
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
  });

  it("adds subdivision cells in bar mode and ignores the removed Shift variants", () => {
    const state = makeTestState();
    const { unmount } = renderShortcuts(state);

    press("KeyS");
    expect(state.appendBarSubdivision).toHaveBeenCalledWith("strong");

    state.appendBarSubdivision.mockClear();
    press("KeyS", { shiftKey: true });
    expect(state.appendBarSubdivision).not.toHaveBeenCalled();

    unmount();
  });

  it("uses Backspace for the selected bar's final subdivision", () => {
    const state = makeTestState();
    const { unmount } = renderShortcuts(state);

    press("Backspace");
    expect(state.removeBarSubdivision).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("adds a bar with Enter when none is selected and finishes editing otherwise", () => {
    const state = makeTestState();
    const { unmount } = renderShortcuts(state);

    press("Enter");
    expect(state.setBarStartBeat).toHaveBeenCalledWith(null);
    expect(state.addBar).not.toHaveBeenCalled();
    expect(state.tapTempo).not.toHaveBeenCalled();

    state.setBarStartBeat.mockClear();
    state.barStartBeat.current = null;
    press("Enter");
    expect(state.addBar).toHaveBeenCalledTimes(1);
    expect(state.setBarStartBeat).not.toHaveBeenCalled();

    unmount();
  });

  it("keeps Shift+Enter as the beat-mode subdivision apply action", () => {
    const state = makeTestState();
    state.barMode.current = false;
    state.barStartBeat.current = null;
    const { unmount } = renderShortcuts(state);

    press("Enter", { shiftKey: true });
    expect(state.applyBeatSubdivision).toHaveBeenCalledTimes(1);
    expect(state.tapTempo).not.toHaveBeenCalled();

    unmount();
  });
});
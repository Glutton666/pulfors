/** @jest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { Platform } from "react-native";
import {
  DEFAULT_BINDINGS,
  type KeyBindingsMap,
  type RecorderKeyboardActions,
} from "@/lib/keyboard-bindings";
import {
  useKeyboardShortcuts,
  type BarKeyboardActions,
} from "@/hooks/useKeyboardShortcuts";

type TestState = {
  barMode: { current: boolean };
  noteMode: { current: boolean };
  barStartBeat: { current: number | null };
  engine: { current: { getIsRunning: () => boolean } | null };
  addBar: jest.Mock;
  applyBeatSubdivision: jest.Mock;
  appendBarSubdivision: jest.Mock;
  removeBarSubdivision: jest.Mock;
  setBarStartBeat: jest.Mock;
  tapTempo: jest.Mock;
  noteNext: jest.Mock;
  modalOpen: { current: boolean };
  recorderKeyboard: { current: RecorderKeyboardActions | null };
};

function makeTestState(): TestState {
  return {
    barMode: { current: true },
    noteMode: { current: false },
    barStartBeat: { current: 2 },
    engine: { current: { getIsRunning: () => false } },
    addBar: jest.fn(),
    applyBeatSubdivision: jest.fn(),
    appendBarSubdivision: jest.fn(),
    removeBarSubdivision: jest.fn(),
    setBarStartBeat: jest.fn(),
    tapTempo: jest.fn(),
    noteNext: jest.fn(),
    modalOpen: { current: false },
    recorderKeyboard: { current: null },
  };
}

function renderShortcuts(state: TestState) {
  const keyBindingsRef = { current: DEFAULT_BINDINGS as KeyBindingsMap };
  const noopRef = { current: jest.fn() };
  const stateSetter = jest.fn();
  const barKeyboardActions: BarKeyboardActions = {
    selectAdjacent: jest.fn(),
    completeBlock: jest.fn(),
    applySymbol: jest.fn(),
    copy: jest.fn(),
    paste: jest.fn(),
    toggleRepeatMode: jest.fn(),
    getRepeatMode: jest.fn(() => "count"),
    setRepeatValue: jest.fn(),
    addLayer: jest.fn(),
    quickSave: jest.fn(),
    openAudio: jest.fn(),
  };

  const hook = renderHook(() =>
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
      noteModeRef: state.noteMode,
      stopwatchTimerRef: { current: null },
      stopwatchTimerLandscapeRef: { current: null },
      subdivisionPatternRef: { current: ["normal"] },
      beatTypesRef: { current: ["strong", "normal", "normal", "normal"] },
      dialConfigRef: { current: {} as never },
      handleNoteTogglePlayRef: { current: null },
      anyModalOpenRef: state.modalOpen,
      showKbShortcutsRef: { current: false },
      showNativeKbHintRef: { current: false },
      engineRef: state.engine as never,
      togglePlayPauseRef: noopRef,
      handleBarModeChangeRef: noopRef,
      handleAddBarRef: { current: state.addBar },
      applyCurrentBeatSubdivisionRef: { current: state.applyBeatSubdivision },
      appendBarSubdivisionRef: { current: state.appendBarSubdivision },
      removeBarSubdivisionRef: { current: state.removeBarSubdivision },
      barKeyboardActionsRef: { current: barKeyboardActions },
      noteNextRef: { current: state.noteNext },
      recorderKeyboardActionsRef: state.recorderKeyboard,
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
  return { ...hook, barKeyboardActions };
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

  it("selects adjacent bars with minus and equal", () => {
    const state = makeTestState();
    const { unmount, barKeyboardActions } = renderShortcuts(state);

    press("Minus", { key: "-" });
    press("Equal", { key: "=" });

    expect(barKeyboardActions.selectAdjacent).toHaveBeenNthCalledWith(1, -1);
    expect(barKeyboardActions.selectAdjacent).toHaveBeenNthCalledWith(2, 1);
    unmount();
  });

  it("routes block and symbol keys to the selected bar", () => {
    const state = makeTestState();
    const { unmount, barKeyboardActions } = renderShortcuts(state);

    press("BracketLeft", { key: "[" });
    state.barStartBeat.current = 4;
    press("BracketLeft", { key: "[" });
    expect(barKeyboardActions.completeBlock).toHaveBeenCalledWith(2, 4);

    const symbols = [
      ["KeyR", "repeat"],
      ["KeyJ", "jump_from"],
      ["KeyK", "jump_to"],
      ["KeyC", "volta"],
      ["KeyE", "end"],
    ] as const;
    for (const [code, symbol] of symbols) {
      press(code);
      expect(barKeyboardActions.applySymbol).toHaveBeenCalledWith(symbol);
    }
    unmount();
  });

  it("routes clipboard, layer, save, and audio shortcuts without colliding with S/C", () => {
    const state = makeTestState();
    const { unmount, barKeyboardActions } = renderShortcuts(state);

    press("KeyC", { ctrlKey: true });
    press("KeyV", { ctrlKey: true });
    press("Slash", { key: "/" });
    press("KeyS", { ctrlKey: true });
    press("KeyO");

    expect(barKeyboardActions.copy).toHaveBeenCalledTimes(1);
    expect(barKeyboardActions.paste).toHaveBeenCalledTimes(1);
    expect(barKeyboardActions.addLayer).toHaveBeenCalledTimes(1);
    expect(barKeyboardActions.quickSave).toHaveBeenCalledTimes(1);
    expect(barKeyboardActions.openAudio).toHaveBeenCalledTimes(1);
    expect(state.appendBarSubdivision).not.toHaveBeenCalled();
    unmount();
  });

  it("uses Tab and Shift+digits for count and four-digit MMSS input", () => {
    const state = makeTestState();
    const { unmount, barKeyboardActions } = renderShortcuts(state);

    press("Tab");
    expect(barKeyboardActions.toggleRepeatMode).toHaveBeenCalledTimes(1);

    press("Digit7", { key: "&", shiftKey: true });
    expect(barKeyboardActions.setRepeatValue).toHaveBeenLastCalledWith(7);

    (barKeyboardActions.getRepeatMode as jest.Mock).mockReturnValue("duration");
    (barKeyboardActions.setRepeatValue as jest.Mock).mockClear();
    for (const digit of ["0", "1", "3", "0"]) {
      press(`Digit${digit}`, { key: digit, shiftKey: true });
    }
    expect(barKeyboardActions.setRepeatValue).toHaveBeenCalledWith(90);

    for (const digit of ["0", "1", "6", "0"]) {
      press(`Digit${digit}`, { key: digit, shiftKey: true });
    }
    expect(barKeyboardActions.setRepeatValue).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("advances the note queue with Enter instead of tapping tempo", () => {
    const state = makeTestState();
    state.barMode.current = false;
    state.noteMode.current = true;
    const { unmount } = renderShortcuts(state);

    press("Enter");
    expect(state.noteNext).toHaveBeenCalledTimes(1);
    expect(state.tapTempo).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps recorder-modal keys ahead of bar-mode shortcuts in every phase", () => {
    const state = makeTestState();
    const cancel = jest.fn();
    const confirm = jest.fn();
    const moveSelection = jest.fn();
    state.modalOpen.current = true;
    state.recorderKeyboard.current = {
      isActive: () => true,
      moveSelection,
      confirm,
      cancel,
    };
    const { unmount, barKeyboardActions } = renderShortcuts(state);

    press("ArrowLeft");
    press("Enter");
    press("Escape");

    expect(moveSelection).toHaveBeenCalledWith(-1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(barKeyboardActions.selectAdjacent).not.toHaveBeenCalled();
    unmount();
  });
});
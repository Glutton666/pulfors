/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RhythmWorkspace } from "../components/lab-score/RhythmWorkspace";
import { createRhythmDocument } from "../lib/rhythm-lab/engine";
import { saveRhythmDocument } from "../lib/rhythm-lab/storage";
import { playChord, previewScoreDrum, stopPreviewNote } from "../lib/score-audio";
import { Alert } from "../lib/alert";

const mockAudio = { play: jest.fn(async (_hits: unknown, _start?: () => void, _end?: () => void) => { _start?.(); }), stop: jest.fn() };
const mockClick = { play: jest.fn(), stop: jest.fn() };
let mockPad: { onDown: () => void; onUp: () => void };
let mockKey: { onDown: (midi: number) => void; onUp: (midi: number) => void };
let mockStaff: any;

jest.mock("react-native", () => {
  const React = require("react");
  const actual = jest.requireActual("react-native");
  return { ...actual,
    AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
    Modal: ({ visible, children }: any) => visible ? React.createElement("div", null, children) : null,
  };
});
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../contexts/ThemeContext", () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock("../contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en" }) }));
jest.mock("../lib/alert", () => ({ Alert: { alert: jest.fn() } }));
jest.mock("../lib/rhythm-lab/storage", () => ({
  listRhythmDocuments: jest.fn(async () => []), saveRhythmDocument: jest.fn(async () => {}), deleteRhythmDocument: jest.fn(),
}));
jest.mock("../lib/score-audio", () => ({
  createScoreClickSession: () => mockClick,
  playChord: jest.fn(), previewScoreDrum: jest.fn(), stopPreviewNote: jest.fn(),
}));
jest.mock("../lib/rhythm-lab/audio", () => ({ createRhythmAudioSession: () => mockAudio }));
jest.mock("../components/lab-score/RhythmStaff", () => ({
  RhythmStaff: (props: any) => { mockStaff = props; return <div data-testid="rhythm-staff">{JSON.stringify(props.events)}</div>; },
}));
jest.mock("../components/lab-score/RhythmSymbolEditor", () => ({ RhythmSymbolEditor: () => null }));
jest.mock("../components/lab-score/RhythmLiveFeedback", () => ({ RhythmLiveFeedback: () => null }));
jest.mock("../components/lab-score/RhythmValidationPanel", () => ({ RhythmValidationPanel: () => null }));
jest.mock("../components/lab-score/RhythmInputSurface", () => ({
  RhythmInputSurface: (props: any) => { mockPad = props; return <button data-testid="rhythm-pad" disabled={props.disabled} onMouseDown={props.onDown} onMouseUp={props.onUp} />; },
}));
jest.mock("../components/lab-score/RhythmKeyboard", () => ({
  RhythmKeyboard: (props: any) => { mockKey = props; return <div data-testid="rhythm-keyboard" />; },
}));

const notes = () => mockStaff.events.filter((event: any) => event.kind === "note");
const pressPad = () => act(() => { mockPad.onDown(); mockPad.onUp(); });
const alertButtons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)![2] ?? []) as { text: string; onPress?: () => void }[];
const doc = () => ({
  ...createRhythmDocument({ title: "Existing", bpm: 120 }),
  hits: [{ id: "existing", onsetMs: 0, releaseMs: 100, drum: "snare" as const }],
});
const tick = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };

describe("RhythmWorkspace state-specific input", () => {
  beforeEach(async () => {
    jest.clearAllMocks(); await AsyncStorage.clear();
    Element.prototype.scrollTo = jest.fn();
    global.requestAnimationFrame = (callback) => { callback(0); return 1; };
  });
  afterEach(() => { jest.useRealTimers(); });
  const mount = async (initialDocument?: ReturnType<typeof doc>) => {
    const screen = render(<RhythmWorkspace initialDocument={initialDocument} />);
    await waitFor(() => expect(screen.getByTestId("rhythm-record-status")).toBeTruthy());
    // A saved take starts in review, so callers explicitly enter input.
    return screen;
  };

  test("video reproduction: tapping before Record sounds once, shows a one-time hint, and never inserts a hit or note", async () => {
    const screen = await mount();
    await waitFor(() => expect(screen.getByTestId("rhythm-pad").hasAttribute("disabled")).toBe(false));
    jest.useFakeTimers();
    pressPad();
    expect(previewScoreDrum).toHaveBeenCalledTimes(1);
    expect(notes()).toHaveLength(0);
    expect(screen.getByTestId("rhythm-stopped-hint")).toBeTruthy();
    await tick(2700); pressPad();
    expect(screen.queryByTestId("rhythm-stopped-hint")).toBeNull();
    expect(notes()).toHaveLength(0);
    fireEvent.click(screen.getByTestId("rhythm-flow-review"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    await act(async () => {});
    expect(jest.mocked(saveRhythmDocument).mock.calls[0][0].hits).toEqual([]);
  });

  test("only explicit direct entry inserts the chosen value; changing modes preserves notation and raw hits", async () => {
    const screen = await mount();
    fireEvent.click(screen.getByTestId("rhythm-entry-notation"));
    fireEvent.click(screen.getByTestId("rhythm-entry-value-8"));
    pressPad();
    expect(notes()).toHaveLength(1);
    expect(notes()[0].durationQ).toEqual({ n: 1, d: 2 });
    expect(previewScoreDrum).toHaveBeenCalledTimes(1);
    const before = JSON.stringify(notes());
    fireEvent.click(screen.getByTestId("rhythm-entry-capture"));
    pressPad();
    expect(JSON.stringify(notes())).toBe(before);
    fireEvent.click(screen.getByTestId("rhythm-flow-review"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    await act(async () => {});
    expect(jest.mocked(saveRhythmDocument).mock.calls[0][0].hits).toEqual([]);
  });

  test("stopped drums preview the selected instrument without mutating the score", async () => {
    const screen = await mount();
    fireEvent.click(screen.getByText("Drums"));
    fireEvent.click(screen.getByText("kick"));
    pressPad();
    expect(previewScoreDrum).toHaveBeenLastCalledWith("kick");
    expect(notes()).toHaveLength(0);
    fireEvent.click(screen.getByTestId("rhythm-entry-notation"));
    pressPad();
    expect(previewScoreDrum).toHaveBeenCalledTimes(2);
    expect(notes()[0].drum).toBe("kick");
  });

  test("switching entry modes preserves an existing raw take and its stored down/up times", async () => {
    const initial = doc();
    const screen = render(<RhythmWorkspace initialDocument={initial} />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("rhythm-flow-input"));
    fireEvent.click(screen.getByTestId("rhythm-entry-notation"));
    fireEvent.click(screen.getByTestId("rhythm-entry-capture"));
    pressPad();
    fireEvent.click(screen.getByTestId("rhythm-flow-review"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    await act(async () => {});
    expect(jest.mocked(saveRhythmDocument).mock.calls[0][0].hits).toEqual(initial.hits);
  });

  test("direct-entry record Cancel and failed Save preserve both document and entry mode; Discard switches and starts", async () => {
    const screen = await mount();
    fireEvent.click(screen.getByTestId("rhythm-entry-notation")); pressPad();
    const before = JSON.stringify(notes());
    fireEvent.click(screen.getByTestId("rhythm-record"));
    act(() => alertButtons().find((button) => button.text === "Cancel")!.onPress!());
    expect(JSON.stringify(notes())).toBe(before);
    expect(screen.getByTestId("rhythm-record").textContent).toContain("Switch to tap");
    jest.mocked(saveRhythmDocument).mockRejectedValueOnce(new Error("disk full"));
    fireEvent.click(screen.getByTestId("rhythm-record"));
    await act(async () => { alertButtons().find((button) => button.text === "Save & start")!.onPress!(); });
    expect(JSON.stringify(notes())).toBe(before);
    expect(screen.getByTestId("rhythm-record").textContent).toContain("Switch to tap");
    expect(screen.getByTestId("rhythm-record-status").textContent).toBe("Stopped");
    jest.useFakeTimers();
    fireEvent.click(screen.getByTestId("rhythm-record"));
    act(() => alertButtons().find((button) => button.text === "Discard & start")!.onPress!());
    expect(screen.getByTestId("rhythm-record-status").textContent).toBe("Count-in");
    expect(notes()).toHaveLength(0);
    expect(screen.getByTestId("rhythm-entry-notation").hasAttribute("disabled")).toBe(true);
    pressPad();
    expect(notes()).toHaveLength(0);
    await tick(2700);
    expect(screen.getByTestId("rhythm-record-status").textContent).toBe("Recording");
    pressPad(); await tick(100); pressPad();
    fireEvent.click(screen.getByTestId("rhythm-record"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    await act(async () => {});
    const saved = jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0];
    expect(saved.hits).toHaveLength(2);
    expect(saved.hits.every((hit) => hit.releaseMs! >= hit.onsetMs)).toBe(true);
  });

  test("successful Save & start saves the existing manual document before switching", async () => {
    const screen = await mount();
    fireEvent.click(screen.getByTestId("rhythm-entry-notation")); pressPad();
    jest.useFakeTimers();
    fireEvent.click(screen.getByTestId("rhythm-record"));
    await act(async () => { alertButtons().find((button) => button.text === "Save & start")!.onPress!(); });
    expect(jest.mocked(saveRhythmDocument).mock.calls[0][0].manualEvents).toHaveLength(1);
    expect(screen.getByTestId("rhythm-record-status").textContent).toBe("Count-in");
    expect(await AsyncStorage.getItem("rhythm_lab_entry_mode_v1")).toBe("capture");
  });

  test("keyboard chords preview once per down and keep independently released recorded hits while clicks sound", async () => {
    const screen = await mount();
    fireEvent.click(screen.getByText("Keys"));
    act(() => mockKey.onDown(60)); act(() => mockKey.onDown(64));
    expect(jest.mocked(playChord).mock.calls.map((call) => call[0])).toEqual([[60], [60, 64]]);
    expect(notes()).toHaveLength(0);
    jest.useFakeTimers();
    fireEvent.click(screen.getByTestId("rhythm-record")); await tick(2700);
    act(() => mockKey.onDown(60)); act(() => mockKey.onDown(64));
    await tick(200); act(() => mockKey.onUp(60));
    expect(jest.mocked(playChord).mock.calls.at(-1)![0]).toEqual([64]);
    const stops = jest.mocked(stopPreviewNote).mock.calls.length;
    await tick(700);
    expect(mockClick.play).toHaveBeenCalled();
    expect(stopPreviewNote).toHaveBeenCalledTimes(stops);
    act(() => mockKey.onUp(64));
    fireEvent.click(screen.getByTestId("rhythm-record"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    await act(async () => {});
    const hits = jest.mocked(saveRhythmDocument).mock.calls[0][0].hits;
    expect(hits.map((hit) => hit.midi)).toEqual([60, 64]);
    expect(hits[1].releaseMs! - hits[1].onsetMs).toBeGreaterThan(hits[0].releaseMs! - hits[0].onsetMs);
  });

  test("original/notation playback locks stale input and staff edit callbacks even while audio is preparing; practice still accepts taps", async () => {
    const screen = render(<RhythmWorkspace initialDocument={doc()} />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("rhythm-flow-input"));
    await waitFor(() => expect(screen.getByTestId("rhythm-pad").hasAttribute("disabled")).toBe(false));
    const stalePad = mockPad!;
    fireEvent.click(screen.getByTestId("rhythm-flow-review"));
    for (const kind of ["original", "notation"]) {
      fireEvent.click(screen.getByTestId(`rhythm-play-${kind}`));
      const before = JSON.stringify(notes());
      jest.mocked(previewScoreDrum).mockClear();
      act(() => { stalePad.onDown(); stalePad.onUp(); mockStaff.onMoveCommit("note-existing", 2); });
      expect(JSON.stringify(notes())).toBe(before);
      expect(previewScoreDrum).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId(`rhythm-play-${kind}`));
    }
    fireEvent.click(screen.getByTestId("rhythm-flow-practice"));
    jest.useFakeTimers();
    fireEvent.click(screen.getByText("Start practice")); await tick(2100);
    pressPad();
    expect(previewScoreDrum).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/1 \/ 1/)).toBeTruthy();
    fireEvent.click(screen.getByText("Finish practice"));
    fireEvent.click(screen.getByTestId("rhythm-flow-review"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    await act(async () => {});
    expect(jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0].hits).toHaveLength(1);
  });
});

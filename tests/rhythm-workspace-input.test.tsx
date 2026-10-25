/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RhythmWorkspace } from "../components/lab-score/RhythmWorkspace";
import { createRhythmDocument } from "../lib/rhythm-lab/engine";
import { listRhythmDocuments, saveRhythmDocument } from "../lib/rhythm-lab/storage";
import { playChord, previewScoreDrum, stopPreviewNote } from "../lib/score-audio";
import { Alert } from "../lib/alert";
import { createRhythmRecovery, rhythmRecovery, RHYTHM_RECOVERY_KEY } from "../lib/rhythm-lab/recovery";

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
    jest.mocked(listRhythmDocuments).mockResolvedValue([]);
    Object.assign(rhythmRecovery, createRhythmRecovery());
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

  test("video reproduction: the first down starts immediately and preserves batched down/up events exactly once", async () => {
    const screen = await mount();
    await waitFor(() => expect(screen.getByTestId("rhythm-pad").hasAttribute("disabled")).toBe(false));
    jest.useFakeTimers();
    act(() => { mockPad.onDown(); jest.advanceTimersByTime(10); mockPad.onUp();
      jest.advanceTimersByTime(90); mockPad.onDown(); jest.advanceTimersByTime(20); mockPad.onUp(); });
    expect(previewScoreDrum).toHaveBeenCalledTimes(2);
    expect(notes()).toHaveLength(2);
    expect(screen.getByTestId("rhythm-record-status").textContent).toBe("Recording");
    expect(screen.queryByTestId("rhythm-stopped-hint")).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("rhythm-record"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    await act(async () => {});
    const hits = jest.mocked(saveRhythmDocument).mock.calls[0][0].hits;
    expect(hits.map((hit) => [hit.onsetMs, hit.releaseMs])).toEqual([[0, 10], [100, 120]]);
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
    fireEvent.click(screen.getByTestId("rhythm-entry-notation"));
    pressPad();
    expect(previewScoreDrum).toHaveBeenLastCalledWith("kick");
    expect(notes()).toHaveLength(1);
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
    fireEvent.click(screen.getByTestId("rhythm-entry-notation"));
    act(() => mockKey.onDown(60)); act(() => mockKey.onDown(64));
    expect(jest.mocked(playChord).mock.calls.map((call) => call[0])).toEqual([[60], [60, 64]]);
    expect(notes()).toHaveLength(2);
    jest.useFakeTimers();
    fireEvent.click(screen.getByTestId("rhythm-record"));
    act(() => alertButtons().find((button) => button.text === "Discard & start")!.onPress!());
    await tick(2700);
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

  test("automatic keyboard start retains all fingers in one event and independent releases", async () => {
    const screen = await mount();
    await waitFor(() => expect(screen.getByTestId("rhythm-pad").hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByText("Keys"));
    jest.useFakeTimers();
    act(() => { mockKey.onDown(60); mockKey.onDown(64); mockKey.onDown(67);
      jest.advanceTimersByTime(80); mockKey.onUp(60);
      jest.advanceTimersByTime(120); mockKey.onUp(64); mockKey.onUp(67); });
    fireEvent.click(screen.getByTestId("rhythm-record"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    await act(async () => {});
    const hits = jest.mocked(saveRhythmDocument).mock.calls[0][0].hits;
    expect(hits.map((hit) => [hit.midi, hit.onsetMs, hit.releaseMs])).toEqual([[60, 0, 80], [64, 0, 200], [67, 0, 200]]);
  });

  test("starting over automatically preserves the previous take and restoring can swap both ways", async () => {
    const original = doc();
    const screen = render(<RhythmWorkspace initialDocument={original} />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("rhythm-flow-input"));
    jest.useFakeTimers();
    pressPad();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByTestId("rhythm-record-status").textContent).toBe("Recording");
    fireEvent.click(screen.getByTestId("rhythm-record"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    const newTake = jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0];
    expect(newTake.id).not.toBe(original.id);
    fireEvent.click(screen.getByTestId("rhythm-recovery-restore"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    expect(jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0].hits).toEqual(original.hits);
    fireEvent.click(screen.getByTestId("rhythm-recovery-restore"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    expect(jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0]).toEqual(newTake);
    await act(async () => { await rhythmRecovery.flush(); });
    expect(JSON.parse((await AsyncStorage.getItem(RHYTHM_RECOVERY_KEY))!).documents.map((item: any) => item.id))
      .toEqual(expect.arrayContaining([original.id, newTake.id]));
  });

  test("a recovery write failure is nonblocking, keeps the memory copy and offers retry", async () => {
    const original = doc();
    const screen = render(<RhythmWorkspace initialDocument={original} />);
    await act(async () => {});
    const setItem = AsyncStorage.setItem.bind(AsyncStorage);
    const failing = jest.spyOn(AsyncStorage, "setItem").mockImplementation((key, value) =>
      key === RHYTHM_RECOVERY_KEY ? Promise.reject(new Error("full")) : setItem(key, value));
    fireEvent.click(screen.getByTestId("rhythm-flow-input"));
    pressPad();
    await act(async () => { await rhythmRecovery.flush(); });
    expect(screen.getByTestId("rhythm-recovery-error").textContent).toContain("copy kept");
    expect(screen.getByTestId("rhythm-record-status").textContent).toBe("Recording");
    failing.mockRestore();
    await act(async () => { fireEvent.click(screen.getByTestId("rhythm-recovery-retry")); await rhythmRecovery.flush(); });
    expect(screen.queryByTestId("rhythm-recovery-error")).toBeNull();
    fireEvent.click(screen.getByTestId("rhythm-record"));
    fireEvent.click(screen.getByTestId("rhythm-recovery-restore"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    expect(jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0].hits).toEqual(original.hits);
  });

  test("leaving during a held first tap closes it in recovery and offers it after re-entry", async () => {
    const screen = await mount();
    await waitFor(() => expect(screen.getByTestId("rhythm-pad").hasAttribute("disabled")).toBe(false));
    jest.useFakeTimers();
    act(() => { mockPad.onDown(); jest.advanceTimersByTime(80); });
    screen.unmount();
    await act(async () => { await rhythmRecovery.flush(); });
    const documents = JSON.parse((await AsyncStorage.getItem(RHYTHM_RECOVERY_KEY))!).documents;
    expect(documents.at(-1).hits[0]).toMatchObject({ onsetMs: 0, releaseMs: 80 });
    jest.useRealTimers();
    const second = render(<RhythmWorkspace />);
    await waitFor(() => expect(second.getByTestId("rhythm-recovery-restore")).toBeTruthy());
    fireEvent.click(second.getByTestId("rhythm-recovery-restore"));
    fireEvent.click(second.getByTestId("rhythm-save"));
    expect(jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0].hits[0].releaseMs).toBe(80);
  });

  test("A -> automatic B -> leave -> cold re-entry still makes both A and B reachable", async () => {
    const original = doc();
    const first = render(<RhythmWorkspace initialDocument={original} />);
    await act(async () => {});
    fireEvent.click(first.getByTestId("rhythm-flow-input"));
    pressPad();
    fireEvent.click(first.getByTestId("rhythm-record"));
    first.unmount();
    await act(async () => { await rhythmRecovery.flush(); });
    Object.assign(rhythmRecovery, createRhythmRecovery());
    const next = render(<RhythmWorkspace />);
    await waitFor(() => expect(next.getByTestId("rhythm-recovery-next")).toBeTruthy());
    // Current default is B (the last checkpoint); cycle to A, not an
    // inaccessible document left only in the serialized collection.
    fireEvent.click(next.getByTestId("rhythm-recovery-next"));
    fireEvent.click(next.getByTestId("rhythm-recovery-restore"));
    fireEvent.click(next.getByTestId("rhythm-save"));
    expect(jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0].hits).toEqual(original.hits);
    fireEvent.click(next.getByTestId("rhythm-recovery-restore"));
    fireEvent.click(next.getByTestId("rhythm-save"));
    expect(jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0].hits[0].id).not.toBe("existing");
  });

  test("opening an older practice-book copy cannot hide the newer recovery of the same document ID", async () => {
    const original = doc();
    const newer = { ...original, hits: [{ ...original.hits[0], releaseMs: 900 }] };
    rhythmRecovery.remember(newer, true);
    await rhythmRecovery.flush();
    Object.assign(rhythmRecovery, createRhythmRecovery());
    const screen = render(<RhythmWorkspace initialDocument={original} />);
    await waitFor(() => expect(screen.getByTestId("rhythm-recovery-restore")).toBeTruthy());
    fireEvent.click(screen.getByTestId("rhythm-recovery-restore"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    expect(jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0].hits).toEqual(newer.hits);
  });

  test("reopening an older same-ID book copy within the existing workspace also preserves newer edits", async () => {
    const original = doc();
    const newer = { ...original, hits: [{ ...original.hits[0], releaseMs: 900 }] };
    jest.mocked(listRhythmDocuments).mockResolvedValue([original]);
    const screen = render(<RhythmWorkspace initialDocument={newer} />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("rhythm-library-open-review"));
    await waitFor(() => expect(screen.getByTestId(`rhythm-saved-open-${original.id}`)).toBeTruthy());
    fireEvent.click(screen.getByTestId(`rhythm-saved-open-${original.id}`));
    fireEvent.click(screen.getByTestId("rhythm-recovery-restore"));
    fireEvent.click(screen.getByTestId("rhythm-save"));
    expect(jest.mocked(saveRhythmDocument).mock.calls.at(-1)![0].hits).toEqual(newer.hits);
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

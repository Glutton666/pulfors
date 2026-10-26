/** @jest-environment jsdom */
// Opt-in: RHYTHM_BENCHMARK=1 npx jest --runInBand --runTestsByPath tests/rhythm-input-benchmark.test.tsx
// RHYTHM_BASELINE_DIR may point to a git-exported lib/rhythm-lab directory.
// Measures the actual workspace callback -> React DOM commit with the real
// staff/feedback logic and SVG DOM adapters. Not a browser-paint/device metric.
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as engine from "../lib/rhythm-lab/engine";
import { RhythmWorkspace } from "../components/lab-score/RhythmWorkspace";
import { createRhythmRecovery, rhythmRecovery } from "../lib/rhythm-lab/recovery";

// Export the old component, not a feature flag in production code.
jest.mock("../components/lab-score/RhythmStaff", () => jest.requireActual(
  process.env.RHYTHM_STAFF_BASELINE ? process.env.RHYTHM_STAFF_BASELINE : "../components/lab-score/RhythmStaff"));
jest.mock("../lib/rhythm-lab/engine", () => jest.requireActual(
  process.env.RHYTHM_BASELINE_DIR ? `${process.env.RHYTHM_BASELINE_DIR}/engine.ts` : "../lib/rhythm-lab/engine"));
jest.mock("../lib/rhythm-lab/verification", () => jest.requireActual(
  process.env.RHYTHM_BASELINE_DIR ? `${process.env.RHYTHM_BASELINE_DIR}/verification.ts` : "../lib/rhythm-lab/verification"));
jest.mock("../lib/rhythm-lab/timing-feedback", () => jest.requireActual(
  process.env.RHYTHM_BASELINE_DIR ? `${process.env.RHYTHM_BASELINE_DIR}/timing-feedback.ts` : "../lib/rhythm-lab/timing-feedback"));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../contexts/ThemeContext", () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock("../contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en" }) }));
jest.mock("../lib/alert", () => ({ Alert: { alert: jest.fn() } }));
jest.mock("../lib/rhythm-lab/storage", () => ({
  listRhythmDocuments: jest.fn(async () => []), saveRhythmDocument: jest.fn(async () => {}), deleteRhythmDocument: jest.fn(),
}));
jest.mock("../lib/score-audio", () => ({
  createScoreClickSession: () => ({ play: jest.fn(), stop: jest.fn() }),
  playChord: jest.fn(), previewScoreDrum: jest.fn(), stopPreviewNote: jest.fn(),
}));
jest.mock("../lib/rhythm-lab/audio", () => ({
  createRhythmAudioSession: () => ({ play: jest.fn(), stop: jest.fn() }),
}));
jest.mock("../components/lab-score/RhythmSymbolEditor", () => ({ RhythmSymbolEditor: () => null }));
jest.mock("../components/lab-score/RhythmValidationPanel", () => ({ RhythmValidationPanel: () => null }));
jest.mock("../components/lab-score/RhythmKeyboard", () => ({ RhythmKeyboard: () => null }));
jest.mock("react-native-svg", () => {
  const React = require("react");
  return { __esModule: true, ...Object.fromEntries([["default", "svg"], ["Svg", "svg"], ["Circle", "circle"], ["Ellipse", "ellipse"],
    ["G", "g"], ["Line", "line"], ["Path", "path"], ["Rect", "rect"], ["Text", "text"]]
    .map(([name, tag]) => [name, ({ children, testID, ...props }: any) =>
      React.createElement(tag, { ...props, "data-testid": testID }, children)])) };
});
let mockPad: { onDown: () => void; onUp: () => void };
jest.mock("../components/lab-score/RhythmInputSurface", () => ({
  RhythmInputSurface: (props: any) => { mockPad = props; return <button data-testid="rhythm-pad" disabled={props.disabled} />; },
}));
jest.mock("react-native", () => {
  const React = require("react");
  return { ...jest.requireActual("react-native"),
    ScrollView: React.forwardRef(({ children, testID, onLayout, onScroll }: any, ref: any) => React.createElement("div", {
      "data-testid": testID, ref: (node: any) => {
        if (node) { node.__onLayout = onLayout; node.__onScroll = onScroll; node.scrollTo = jest.fn(); }
        if (typeof ref === "function") ref(node); else if (ref) ref.current = node;
      },
    }, children)),
    AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
    Modal: ({ visible, children }: any) => visible ? React.createElement("div", null, children) : null,
  };
});

const benchmark = process.env.RHYTHM_BENCHMARK === "1" ? test : test.skip;
benchmark.each([300, 1000])("input to DOM commit with %i existing hits", async (size) => {
  await AsyncStorage.clear();
  Object.assign(rhythmRecovery, createRhythmRecovery());
  Element.prototype.scrollTo = jest.fn();
  const screen = render(<RhythmWorkspace />);
  try {
    await waitFor(() => expect(screen.getByTestId("rhythm-activate-pad")).toBeTruthy());
    const seed = { ...engine.createRhythmDocument(), hits: Array.from({ length: size }, (_, i) => ({
      id: `h${i}`, onsetMs: i * 250 + [0, 8, -4, 3][i % 4], releaseMs: i * 250 + 30,
      drum: "snare" as const,
    })) };
    const create = jest.spyOn(engine, "createRhythmDocument").mockReturnValueOnce(seed);
    jest.useFakeTimers({ doNotFake: ["hrtime"] });
    fireEvent.click(screen.getByTestId("rhythm-record"));
    await act(async () => { jest.advanceTimersByTime(2700); });
    create.mockRestore();
    expect(screen.getByTestId("rhythm-record-status").textContent).toBe("Recording");
    const staff = screen.getByTestId("rhythm-staff");
    act(() => (staff as any).__onLayout({ nativeEvent: { layout: { width: 360 } } }));
    const scroll = screen.getByTestId("rhythm-workspace-scroll") as any;
    act(() => scroll.__onLayout({ nativeEvent: { layout: { width: 375, height: 400 } } }));
    const startedAt = performance.now();
    const clock = jest.spyOn(performance, "now");
    const samples: number[] = [];
    let previousIds = [...staff.querySelectorAll('[data-testid^="rhythm-notehead-note-"]')].map((node) => node.getAttribute("data-testid"));
    for (let i = 0; i < 9; i++) {
      const positionMs = (size + i + 1) * 250;
      clock.mockReturnValue(startedAt + positionMs);
      // Keep the independent 80ms recording ticker near the next attack, as
      // during real capture, rather than freezing the viewport at time zero.
      act(() => jest.advanceTimersByTime(80));
      const row = Math.floor(positionMs * seed.bpm / 60000 / 8);
      act(() => scroll.__onScroll({ nativeEvent: { contentOffset: { y: Math.max(0, row - 1) * 118 * 0.8 }, layoutMeasurement: { height: 400 } } }));
      const start = process.hrtime.bigint();
      act(() => mockPad.onDown());
      const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
      // The newest attack must be engraved, not just committed to hidden state.
      const noteheads = [...staff.querySelectorAll('[data-testid^="rhythm-notehead-note-"]')];
      expect(noteheads.length).toBeGreaterThan(0);
      const ids = noteheads.map((node) => node.getAttribute("data-testid"));
      expect(ids).not.toEqual(previousIds);
      previousIds = ids;
      if (i >= 2) samples.push(elapsed);
      act(() => mockPad.onUp());
    }
    samples.sort((a, b) => a - b);
    if (!process.env.RHYTHM_STAFF_BASELINE) {
      expect(staff.querySelectorAll('[data-testid^="rhythm-note-target-"]').length).toBeLessThan(100);
      expect(staff.querySelectorAll("*").length).toBeLessThan(600);
    }
    console.log(JSON.stringify({ size, callbackToDOMCommitMedianMs: +samples[3].toFixed(2),
      callbackToDOMCommitMaxMs: +samples.at(-1)!.toFixed(2), baseline: !!process.env.RHYTHM_BASELINE_DIR,
      staffBaseline: !!process.env.RHYTHM_STAFF_BASELINE, staffDOMNodes: staff.querySelectorAll("*").length,
      svgNodes: staff.querySelectorAll("svg *").length, targets: staff.querySelectorAll('[data-testid^="rhythm-note-target-"]').length }));
    clock.mockRestore();
  } finally {
    screen.unmount();
    jest.useRealTimers();
  }
}, 120000);

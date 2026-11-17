/** @jest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { BarEditorPanel, type BarEditorPanelProps } from "@/components/bar-mode/BarEditorPanel";
import { getBarPlaybackInfo } from "@/lib/bar-playback-info";
import { translations } from "@/lib/i18n.data";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/CustomSoundSetEditor", () => ({ CustomSoundSetEditor: () => null }));
jest.mock("@/components/SubdivisionBar", () => ({ SubdivisionBar: () => null }));
jest.mock("@/components/BarPlayButton", () => ({
  BarPlayButton: ({ testID, isPlaying, onTogglePlay }: any) =>
    <button data-testid={testID} onClick={onTogglePlay}>{isPlaying ? "Stop" : "Play"}</button>,
}));
jest.mock("react-native", () => {
  const base = jest.requireActual("react-native");
  return { ...base,
    TextInput: ({ testID, value }: any) => <input data-testid={testID} value={value} readOnly />,
    Animated: { ...base.Animated,
    Value: function (this: any, value: number) {
      this._v = value;
      this.stopAnimation = jest.fn();
    },
  }};
});

afterEach(cleanup);

function props(extra: Partial<BarEditorPanelProps> = {}): BarEditorPanelProps {
  return {
    editingBeat: 0, currentBeat: 1, beatsPerMeasure: 3, isPlaying: false, isPreparing: false,
    barRepeats: {
      0: { type: "count", value: 7, bpm: 88 },
      1: { type: "duration", value: 30, bpm: 132, meterDenominator: 8,
        layers: [{ beatType: "normal", soundSet: "cowbell" }, { beatType: "strong" }] },
    },
    beatSubdivisions: { "1": ["strong", "normal", "normal"] },
    bpm: 100, beatDenominator: 4, soundSet: "woodblock", layerSoundSets: { 2: "digital" },
    customSoundSets: {}, loopBlocks: [], barLoopMode: "once", blockPlayMode: "sequential", isDragging: false,
    colors: {
      background: "#101116", backgroundSecondary: "#1a1c22", text: "#ffffff",
      textSecondary: "#c4c6ce", textTertiary: "#8a8d98", accent: "#e0b34d",
      accentMuted: "#af8f42", danger: "#e25f5f", overlay06: "#222222",
      overlay08: "#333333", overlay10: "#444444", white: "#ffffff",
    },
    ms: n => n,
    t: ((section: string, key: string) => (translations as any)[section]?.[key]?.en ?? key) as any,
    onBarRepeatChange: jest.fn(), onBarStartBeatSelect: jest.fn(), onAddBar: jest.fn(),
    onTogglePlay: jest.fn(), onBarLoopModeChange: jest.fn(), onBlockPlayModeChange: jest.fn(),
    onLoopBlocksChange: jest.fn(), onBarQuickSave: jest.fn(), onOpenSettings: jest.fn(),
    ...extra,
  };
}

test("playing shows the audible source bar, hides editing and keeps Stop functional", () => {
  const p = props({ isPlaying: true });
  const ui = render(<BarEditorPanel {...p} />);
  expect(ui.getByTestId("bar-playback-source").textContent).toBe("Playing bar 2");
  expect(ui.getByTestId("bar-playback-meter").textContent).toBe("3/8");
  expect(ui.getByTestId("bar-playback-bpm").textContent).toBe("BPM132");
  expect(ui.getByTestId("bar-playback-repeat").textContent).toContain("00:30");
  expect(ui.getByTestId("bar-playback-sounds").textContent).toContain(p.t("barModeView", "ssCowbell"));
  expect(ui.getByTestId("bar-playback-sounds").textContent).toContain(p.t("barModeView", "ssDigital"));
  expect(ui.queryByTestId("bar-bpm-minus")).toBeNull();
  expect(ui.queryByTestId("bar-count-plus")).toBeNull();
  expect(ui.queryByTestId("bar-save-reset")).toBeNull();
  expect(ui.queryByTestId("open-bar-settings")).toBeNull();
  expect(ui.container.querySelector("input")).toBeNull();
  expect(ui.getAllByRole("button")).toHaveLength(1);
  fireEvent.click(ui.getByText("Stop"));
  expect(p.onTogglePlay).toHaveBeenCalledTimes(1);
  expect(p.onBarStartBeatSelect).not.toHaveBeenCalled();
  expect(p.onBarRepeatChange).not.toHaveBeenCalled();
});

test("bar transitions and natural stop restore the previous editor without writing selection", () => {
  const p = props();
  const ui = render(<BarEditorPanel {...p} />);
  expect(ui.getByTestId("bar-count-value").textContent).toBe("×7");
  ui.rerender(<BarEditorPanel {...p} isPlaying />);
  ui.rerender(<BarEditorPanel {...p} isPlaying currentBeat={2} />);
  expect(ui.getByTestId("bar-playback-source").textContent).toBe("Playing bar 3");
  expect(ui.getByTestId("bar-playback-bpm").textContent).toBe("BPM100");
  ui.rerender(<BarEditorPanel {...p} />);
  expect(ui.queryByTestId("bar-playback-panel")).toBeNull();
  expect(ui.getByTestId("bar-count-value").textContent).toBe("×7");
  expect(ui.getByTestId("bar-bpm-value").getAttribute("value")).toBe("88");
  expect(p.onBarStartBeatSelect).not.toHaveBeenCalled();
  expect(p.onBarRepeatChange).not.toHaveBeenCalled();
});

test("preparation hides editing without pretending the old beat is playing; no-selection stays unselected", () => {
  const p = props({ editingBeat: null, isPreparing: true });
  const ui = render(<BarEditorPanel {...p} />);
  expect(ui.getByTestId("bar-playback-source").textContent).toBe("Preparing playback");
  expect(ui.queryByTestId("bar-save-reset")).toBeNull();
  ui.rerender(<BarEditorPanel {...p} isPreparing={false} isPlaying />);
  ui.rerender(<BarEditorPanel {...p} isPreparing={false} />);
  expect(ui.getByTestId("bar-bpm-value").getAttribute("value")).toBe("100");
  expect(p.onBarStartBeatSelect).not.toHaveBeenCalled();
});

test("source resolution ignores display/random positions, inherits block BPM and honors bar overrides", () => {
  const p = props();
  const blocks = [
    { startBeat: 0, endBeat: 2, type: "count" as const, value: 2, bpm: 150, soundSet: "clave" as const },
    { startBeat: 1, endBeat: 1, type: "count" as const, value: 2 },
  ];
  expect(getBarPlaybackInfo({ ...p, currentBeat: 1, loopBlocks: blocks }).bpm).toBe(132);
  const info = getBarPlaybackInfo({ ...p, currentBeat: 1, barRepeats: {}, loopBlocks: blocks });
  expect(info.sourceBeat).toBe(1);
  expect(info.bpm).toBe(150);
  expect(getBarPlaybackInfo({ ...p, currentBeat: -1 }).sourceBeat).toBeNull();
  expect(getBarPlaybackInfo({ ...p, currentBeat: 3 }).sourceBeat).toBeNull();
});

test("all six layers remain readable and a custom sound name is shown without selectors", () => {
  const p = props({ isPlaying: true, currentBeat: 0,
    barRepeats: { 0: { type: "count", value: 3,
      layers: Array.from({ length: 6 }, () => ({ beatType: "normal" as const })) } },
    customSoundSets: { custom1: { name: "My long personal practice sound" } as any },
    layerSoundSets: { 6: "custom1" },
  });
  const ui = render(<BarEditorPanel {...p} />);
  const sounds = ui.getByTestId("bar-playback-sounds");
  expect(sounds.textContent).toContain("Layer6");
  expect(sounds.textContent).toContain("My long personal practice sound");
  expect(ui.getAllByRole("button")).toHaveLength(1);
});

/** @jest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { BarBlockEditModal } from "../components/bar-mode/BarBlockEditModal";
import type { LoopBlock } from "../components/beat-indicator.types";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/lib/scale", () => ({ useScale: () => ({ isTablet: false }) }));
jest.mock("@/components/AnimatedModal", () => ({
  AnimatedModal: ({ visible, children }: any) => visible ? children : null,
}));
jest.mock("react-native", () => {
  const base = jest.requireActual("react-native");
  const React = require("react");
  return { ...base, TextInput: ({ testID, value, onChangeText, onSubmitEditing }: any) => React.createElement("input", {
    "data-testid": testID, value,
    onChange: (e: any) => onChangeText?.(e.target.value),
    onKeyDown: (e: any) => { if (e.key === "Enter") onSubmitEditing?.({ nativeEvent: { text: e.currentTarget.value } }); },
  }) };
});
afterEach(cleanup);
const block: LoopBlock = { startBeat: 0, endBeat: 2, type: "count", value: 2, bpm: 120 };
const props = (extra = {}) => ({
  visible: true, blockIndex: 0, loopBlocks: [block], customSoundSets: {},
  onSave: jest.fn(), onDelete: jest.fn(), onClose: jest.fn(),
  colors: { accent: "#e0b34d", overlay08: "#222222", overlay10: "#333333", backgroundSecondary: "#111111", text: "#ffffff", textSecondary: "#aaaaaa" } as any,
  ms: (n: number) => n, t: ((_scope: string, key: string) => key) as any, ...extra,
});

test("typing a BPM and immediately applying saves the typed value", () => {
  const p = props(), ui = render(<BarBlockEditModal {...p} />);
  fireEvent.change(ui.getByTestId("bar-block-bpm-input"), { target: { value: "87" } });
  expect((ui.getByTestId("bar-block-bpm-input") as HTMLInputElement).value).toBe("87");
  fireEvent.click(ui.getByTestId("bar-block-save"));
  expect(p.onSave).toHaveBeenCalledWith(0, { ...block, bpm: 87 });
});
test("keyboard submission uses the event text instead of an older render", () => {
  const p = props(), ui = render(<BarBlockEditModal {...p} />);
  fireEvent.keyDown(ui.getByTestId("bar-block-bpm-input"), { key: "Enter", target: { value: "93" } });
  expect(p.onSave).toHaveBeenCalledWith(0, { ...block, bpm: 93 });
});
test("cancel and reopening the same block starts from the saved repeat and BPM", () => {
  const p = props(), ui = render(<BarBlockEditModal {...p} />);
  fireEvent.change(ui.getByTestId("bar-block-bpm-input"), { target: { value: "75" } });
  fireEvent.click(ui.getByTestId("bar-block-count-increase"));
  fireEvent.click(ui.getByTestId("bar-block-cancel"));
  expect(p.onSave).not.toHaveBeenCalled();
  ui.rerender(<BarBlockEditModal {...p} visible={false} />);
  ui.rerender(<BarBlockEditModal {...p} />);
  expect((ui.getByTestId("bar-block-bpm-input") as HTMLInputElement).value).toBe("120");
  fireEvent.click(ui.getByTestId("bar-block-save"));
  expect(p.onSave).toHaveBeenCalledWith(0, block);
});
test("a newly created block can arrive after opening without later updates erasing draft edits", () => {
  const p = props(), ui = render(<BarBlockEditModal {...p} loopBlocks={[]} />);
  ui.rerender(<BarBlockEditModal {...p} loopBlocks={[{ ...block, bpm: 70, value: 4 }]} />);
  expect((ui.getByTestId("bar-block-bpm-input") as HTMLInputElement).value).toBe("70");
  fireEvent.change(ui.getByTestId("bar-block-bpm-input"), { target: { value: "85" } });
  ui.rerender(<BarBlockEditModal {...p} loopBlocks={[{ ...block, bpm: 70, value: 4 }]} />);
  fireEvent.click(ui.getByTestId("bar-block-save"));
  expect(p.onSave).toHaveBeenCalledWith(0, { ...block, bpm: 85, value: 4 });
});
test("repeat changes save, invalid BPM stays open, and clearing removes the override", () => {
  const p = props(), ui = render(<BarBlockEditModal {...p} />);
  fireEvent.click(ui.getByTestId("bar-block-count-increase"));
  fireEvent.change(ui.getByTestId("bar-block-bpm-input"), { target: { value: "999" } });
  fireEvent.click(ui.getByTestId("bar-block-save"));
  expect(p.onSave).not.toHaveBeenCalled();
  expect(ui.getByText("BPM 20–300")).toBeTruthy();
  fireEvent.click(ui.getByTestId("bar-block-bpm-reset"));
  fireEvent.click(ui.getByTestId("bar-block-save"));
  const { bpm, ...withoutOverride } = block;
  expect(p.onSave).toHaveBeenCalledWith(0, { ...withoutOverride, value: 3 });
});
test("duration and sound choices are saved along with the block boundaries", () => {
  const p = props(), ui = render(<BarBlockEditModal {...p} />);
  fireEvent.click(ui.getByTestId("bar-block-type-duration"));
  fireEvent.click(ui.getByTestId("bar-block-sound-woodblock"));
  fireEvent.click(ui.getByTestId("bar-block-save"));
  expect(p.onSave).toHaveBeenCalledWith(0, { ...block, type: "duration", value: 30, soundSet: "woodblock" });
});

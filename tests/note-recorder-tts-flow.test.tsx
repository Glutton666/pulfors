/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { Platform } from "react-native";
import { NoteRecorderModal } from "@/components/NoteRecorderModal";
import { noteTtsNative } from "@/lib/note-tts-runtime";
import type { NoteTtsNative, NoteTtsResult } from "@/lib/note-tts";

jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  const React = require("react");
  return {
    ...actual, KeyboardAvoidingView: actual.View,
    TextInput: ({ value, onChangeText, testID }: any) => React.createElement("input", {
      value, "data-testid": testID,
      onChange: (event: any) => onChangeText?.(event.target.value),
    }),
  };
});
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-reanimated", () => ({
  __esModule: true, default: { View: require("react-native").View },
  useSharedValue: (value: unknown) => ({ value }), useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (value: unknown) => value, withSpring: (value: unknown) => value,
}));
jest.mock("@/components/AnimatedModal", () => ({
  AnimatedModal: ({ visible, children }: any) => visible ? children : null,
}));
jest.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ colors: require("@/constants/colors").default }) }));
jest.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({
  language: "ko", t: (section: string, key: string) => `${section}.${key}`,
}) }));
jest.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true, motionDuration: (ms: number) => ms }));
jest.mock("@/lib/metronome-engine", () => ({ soundSets: { classic: { low: 0 } } }));
jest.mock("@/lib/audio-session", () => ({ acquireAudioSession: jest.fn(), releaseAudioSession: jest.fn() }));
jest.mock("@/lib/audio-renderer", () => ({ decodeSampleFile: jest.fn().mockResolvedValue([]) }));
jest.mock("@/lib/error-tracking", () => ({ captureBreadcrumb: jest.fn() }));
jest.mock("@/lib/note-tts-runtime", () => ({
  noteTtsNative: { getVoices: jest.fn(), generate: jest.fn(), cancel: jest.fn(), discard: jest.fn() },
}));
jest.mock("expo-audio", () => {
  const player = { pause: jest.fn(), play: jest.fn(), replace: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined), duration: 1.2, currentTime: 0, remove: jest.fn() };
  return {
    useAudioRecorder: () => ({}), useAudioPlayer: () => player, createAudioPlayer: () => player,
    RecordingPresets: { HIGH_QUALITY: {} }, IOSOutputFormat: {}, AudioQuality: {},
    __player: player,
  };
});
const native = noteTtsNative as jest.Mocked<NoteTtsNative>;
const output = { uri: "file:///app/tts-samples/9c6eff9b-7071-413b-b958-b36f07a0d678.wav", duration: 1.2 };
function props() {
  return { allowTts: true, visible: true, onClose: jest.fn(), onSave: jest.fn(), onDelete: jest.fn(),
    beatIndex: 4, subIndex: 1, slotIndex: 2 as const, hasExisting: false, bpm: 100,
    existingMetronomeChannel: "off" as const };
}
beforeEach(() => {
  jest.clearAllMocks(); Platform.OS = "ios";
  native.getVoices.mockResolvedValue([{ id: "f", name: "여성", gender: "female", language: "ko-KR" }]);
  native.generate.mockResolvedValue(output); native.cancel.mockResolvedValue(undefined); native.discard.mockResolvedValue(undefined);
});
test("native text → file → preview/stop → trimmed import sample save preserves ownership", async () => {
  const p = props(); const ui = render(<NoteRecorderModal {...p} />);
  await act(async () => { fireEvent.click(ui.getByTestId("note-recorder-tts")); });
  fireEvent.change(ui.getByTestId("note-tts-text"), { target: { value: "시작" } });
  await act(async () => { fireEvent.click(ui.getByTestId("note-tts-generate")); });
  expect(ui.getByTestId("note-tts-edit")).toBeTruthy();
  await act(async () => { fireEvent.click(ui.getByTestId("note-recorder-preview")); });
  const player = require("expo-audio").__player;
  expect(player.replace).toHaveBeenCalledWith({ uri: output.uri });
  expect(player.play).toHaveBeenCalled();
  fireEvent.click(ui.getByTestId("note-recorder-preview"));
  expect(player.pause).toHaveBeenCalled();
  fireEvent.click(ui.getByTestId("note-recorder-save"));
  expect(p.onSave).toHaveBeenCalledWith(`${output.uri}#t=0,1200`, "시작", "import", "both", "off", 1, 1);
  ui.unmount();
  expect(native.discard).not.toHaveBeenCalled();
});
test("slot switch while generating rejects the old file and returns to source selection", async () => {
  let resolve!: (value: NoteTtsResult) => void;
  native.generate.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  const p = props(); const ui = render(<NoteRecorderModal {...p} />);
  await act(async () => { fireEvent.click(ui.getByTestId("note-recorder-tts")); });
  fireEvent.change(ui.getByTestId("note-tts-text"), { target: { value: "시작" } });
  fireEvent.click(ui.getByTestId("note-tts-generate"));
  ui.rerender(<NoteRecorderModal {...p} slotIndex={0} />);
  await act(async () => { resolve(output); });
  expect(ui.queryByTestId("note-recorder-save")).toBeNull();
  expect(ui.getByTestId("note-recorder-tts")).toBeTruthy();
  expect(native.discard).toHaveBeenCalledWith(output.uri);
  expect(p.onSave).not.toHaveBeenCalled();
});
test("web offers unsupported notice without disrupting source or existing-sample controls", async () => {
  Platform.OS = "web"; const p = props(); const ui = render(<NoteRecorderModal {...p} />);
  expect(ui.getByText("noteRecorder.record")).toBeTruthy();
  expect(ui.getByText("noteRecorder.import")).toBeTruthy();
  fireEvent.click(ui.getByTestId("note-recorder-tts"));
  expect(ui.getByTestId("note-tts-web-notice")).toBeTruthy();
  expect(ui.queryByTestId("note-tts-generate")).toBeNull();
  fireEvent.click(ui.getByTestId("note-tts-back"));
  ui.rerender(<NoteRecorderModal {...p} hasExisting existingUri={output.uri} />);
  expect(ui.getByText("noteRecorder.editSample")).toBeTruthy();
  expect(ui.getByText("noteRecorder.removeSample")).toBeTruthy();
  expect(native.generate).not.toHaveBeenCalled(); expect(native.getVoices).not.toHaveBeenCalled();
});

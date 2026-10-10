/** @jest-environment jsdom */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { Platform } from "react-native";
import { NoteTtsPanel, type NoteTtsPanelProps } from "@/components/NoteTtsPanel";
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ colors: require("@/constants/colors").default }) }));
jest.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "ko" }) }));
function props(): NoteTtsPanelProps {
  return {
    text: "시작", onTextChange: jest.fn(), voices: [{ id: "ko", name: "한국어 설치 음성", gender: "unknown", language: "ko-KR" }],
    voiceId: "ko", onVoiceChange: jest.fn(), status: "ready", error: null,
    onGenerate: jest.fn(), onCancel: jest.fn(), onRetry: jest.fn(), onBack: jest.fn(),
  };
}
beforeEach(() => { Platform.OS = "ios"; });
test("web only explains unsupported generation and leaves a back action", () => {
  Platform.OS = "web"; const p = props(); const ui = render(<NoteTtsPanel {...p} />);
  expect(ui.getByTestId("note-tts-web-notice")).toBeTruthy();
  expect(ui.getByText(/웹에서는/)).toBeTruthy();
  expect(ui.queryByTestId("note-tts-text")).toBeNull();
  expect(ui.queryByTestId("note-tts-generate")).toBeNull();
  fireEvent.click(ui.getByTestId("note-tts-back"));
  expect(p.onBack).toHaveBeenCalledTimes(1);
  expect(p.onGenerate).not.toHaveBeenCalled();
});
test("unknown Android gender is not relabeled as male or female", () => {
  const ui = render(<NoteTtsPanel {...props()} />);
  expect(ui.getByText(/성별 메타데이터를 제공하지 않습니다/)).toBeTruthy();
  expect(ui.getByTestId("note-tts-filter-male").getAttribute("disabled")).not.toBeNull();
  expect(ui.getByTestId("note-tts-filter-female").getAttribute("disabled")).not.toBeNull();
});
test("blank text and absent selected voice cannot generate", () => {
  const p = props(); const ui = render(<NoteTtsPanel {...p} text="  " />);
  fireEvent.click(ui.getByTestId("note-tts-generate"));
  expect(p.onGenerate).not.toHaveBeenCalled();
  ui.rerender(<NoteTtsPanel {...p} voiceId="" />);
  fireEvent.click(ui.getByTestId("note-tts-generate"));
  expect(p.onGenerate).not.toHaveBeenCalled();
});
test("explicit generate/cancel use parent callbacks, absent native module is explained", () => {
  const p = props(); const ui = render(<NoteTtsPanel {...p} />);
  fireEvent.click(ui.getByTestId("note-tts-generate"));
  expect(p.onGenerate).toHaveBeenCalledTimes(1);
  ui.rerender(<NoteTtsPanel {...p} status="generating" />);
  fireEvent.click(ui.getByTestId("note-tts-cancel"));
  expect(p.onCancel).toHaveBeenCalledTimes(1);
  ui.rerender(<NoteTtsPanel {...p} status="unavailable" />);
  expect(ui.getByTestId("note-tts-unavailable")).toBeTruthy();
  expect(ui.queryByTestId("note-tts-generate")).toBeNull();
});

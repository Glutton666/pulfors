/**
 * @jest-environment jsdom
 *
 * PolygonModeView — 비트 모드 BPM 컨트롤 연결 테스트
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { PolygonModeView } from "@/components/PolygonModeView";
import type { UsePolygonModeResult } from "@/hooks/usePolygonMode";

// ── 의존성 모킹 ──────────────────────────────────────────────────────────────

jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#000", surface: "#111", text: "#fff", textSecondary: "#aaa",
      textTertiary: "#666", accent: "#3af", border: "#333", danger: "#f44",
    },
  }),
}));
jest.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    t: (ns: string, key: string) => key,
    language: "ko",
  }),
}));
jest.mock("@/lib/scale", () => ({
  useScale: () => ({ ms: (v: number) => v }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));
jest.mock("@/components/polygon-mode/PolygonCanvas", () => ({
  PolygonCanvas: () => null,
}));
jest.mock("@/components/polygon-mode/PolygonLayerEditor", () => ({
  PolygonLayerEditor: () => null,
}));
jest.mock("@/components/polygon-mode/PolygonOffsetPopup", () => ({
  PolygonOffsetPopup: () => null,
}));
jest.mock("@/components/BpmSlider", () => {
  const React = require("react");
  return {
    BpmSlider: ({ bpm, onBpmChange, onTapTempo }: any) => React.createElement(
      "div",
      { "data-testid": "bpm-slider" },
      React.createElement("button", { "data-testid": "bpm-slider-tap", onClick: onTapTempo }, "TAP"),
      React.createElement("button", { "data-testid": "bpm-slider-increment", onClick: () => onBpmChange(bpm + 1) }, "+"),
      React.createElement("span", { "data-testid": "bpm-display" }, String(bpm)),
      React.createElement("span", null, "BPM"),
    ),
  };
});
jest.mock("@/lib/audio-renderer", () => ({
  getWebAudioContext: jest.fn(() => null),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "test-uuid",
}));

// ── 테스트용 최소 polygonMode stub ───────────────────────────────────────────

function makePolygonMode(): UsePolygonModeResult {
  return {
    layers: [],
    editingLayerId: null,
    setEditingLayerId: jest.fn(),
    activeVertices: {},
    offsetPopup: null,
    setOffsetPopup: jest.fn(),
    handleAddLayer: jest.fn(),
    handleDeleteLayer: jest.fn(),
    handleUpdateLayer: jest.fn(),
    handleSetOffset: jest.fn(),
    handleVertexBeatTypeCycle: jest.fn(),
    setLayerCustomSound: jest.fn(),
  };
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe("PolygonModeView — beat-mode BPM controller", () => {
  it("renders the shared beat-mode BPM controller with its BPM label", () => {
    const { queryByText } = render(
      <PolygonModeView
        polygonMode={makePolygonMode()}
        isPlaying={false}
        onClose={jest.fn()}
        bpm={120}
        onBpmChange={jest.fn()}
      />,
    );

    expect(queryByText("BPM")).not.toBeNull();
    expect(queryByText("120")).not.toBeNull();
  });

  it("keeps the BPM controller tap connected to play toggle", () => {
    const onTogglePlay = jest.fn();
    const { getByTestId } = render(
      <PolygonModeView
        polygonMode={makePolygonMode()}
        isPlaying={false}
        onClose={jest.fn()}
        onTogglePlay={onTogglePlay}
        bpm={120}
        onBpmChange={jest.fn()}
      />,
    );

    fireEvent.click(getByTestId("bpm-slider-tap"));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("forwards BPM changes through the shared controller", () => {
    const onBpmChange = jest.fn();
    const { getByTestId } = render(
      <PolygonModeView
        polygonMode={makePolygonMode()}
        isPlaying={false}
        onClose={jest.fn()}
        bpm={120}
        onBpmChange={onBpmChange}
      />,
    );
    fireEvent.click(getByTestId("bpm-slider-increment"));
    expect(onBpmChange).toHaveBeenCalledWith(121);
  });
});

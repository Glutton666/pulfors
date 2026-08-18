/**
 * @jest-environment jsdom
 *
 * PolygonModeView — BPM ± 컨트롤 상호작용 테스트
 *
 * 검증 항목:
 *   1. 짧게 누르면 -1 / +1 BPM
 *   2. 길게 누르면 -10 / +10 BPM
 *   3. 길게 누른 직후 짧게 누르면 -1 / +1 BPM (억제되지 않음)
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

describe("PolygonModeView — BPM ± controls", () => {
  // ── 단축키: click = 짧게 누름, contextMenu = 길게 누름 (stub 매핑) ──

  it("short press on − calls onBpmChange(bpm - 1)", () => {
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
    fireEvent.click(getByTestId("bpm-minus"));
    expect(onBpmChange).toHaveBeenCalledWith(119);
  });

  it("short press on + calls onBpmChange(bpm + 1)", () => {
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
    fireEvent.click(getByTestId("bpm-plus"));
    expect(onBpmChange).toHaveBeenCalledWith(121);
  });

  it("long press on − calls onBpmChange(bpm - 10)", () => {
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
    // contextMenu fires onContextMenu → onLongPress (stub 매핑)
    fireEvent.contextMenu(getByTestId("bpm-minus"));
    expect(onBpmChange).toHaveBeenCalledWith(110);
  });

  it("long press on + calls onBpmChange(bpm + 10)", () => {
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
    fireEvent.contextMenu(getByTestId("bpm-plus"));
    expect(onBpmChange).toHaveBeenCalledWith(130);
  });

  it("short press after long press on − still calls onBpmChange(bpm - 1)", () => {
    // bpmLongPressRef를 제거했으므로 다음 짧은 탭이 억제되지 않아야 한다.
    // React Native Pressability가 longPress 직후 릴리즈 onPress를 억제하지만,
    // 이후의 독립적인 짧은 탭(새 제스처)은 정상적으로 -1을 발화해야 한다.
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
    fireEvent.contextMenu(getByTestId("bpm-minus")); // -10
    fireEvent.click(getByTestId("bpm-minus"));        // -1 (억제되지 않음)
    expect(onBpmChange).toHaveBeenCalledTimes(2);
    expect(onBpmChange).toHaveBeenNthCalledWith(1, 110);
    expect(onBpmChange).toHaveBeenNthCalledWith(2, 119);
  });

  it("short press after long press on + still calls onBpmChange(bpm + 1)", () => {
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
    fireEvent.contextMenu(getByTestId("bpm-plus")); // +10
    fireEvent.click(getByTestId("bpm-plus"));       // +1
    expect(onBpmChange).toHaveBeenCalledTimes(2);
    expect(onBpmChange).toHaveBeenNthCalledWith(1, 130);
    expect(onBpmChange).toHaveBeenNthCalledWith(2, 121);
  });

  it("clamps − at BPM_MIN (20)", () => {
    const onBpmChange = jest.fn();
    const { getByTestId } = render(
      <PolygonModeView
        polygonMode={makePolygonMode()}
        isPlaying={false}
        onClose={jest.fn()}
        bpm={25}
        onBpmChange={onBpmChange}
      />,
    );
    fireEvent.contextMenu(getByTestId("bpm-minus")); // 25 - 10 = 15 → clamped to 20
    expect(onBpmChange).toHaveBeenCalledWith(20);
  });

  it("clamps + at BPM_MAX (300)", () => {
    const onBpmChange = jest.fn();
    const { getByTestId } = render(
      <PolygonModeView
        polygonMode={makePolygonMode()}
        isPlaying={false}
        onClose={jest.fn()}
        bpm={295}
        onBpmChange={onBpmChange}
      />,
    );
    fireEvent.contextMenu(getByTestId("bpm-plus")); // 295 + 10 = 305 → clamped to 300
    expect(onBpmChange).toHaveBeenCalledWith(300);
  });
});

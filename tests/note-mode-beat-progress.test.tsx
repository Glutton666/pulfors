/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { Image } from "react-native";
import type { PracticeEntry } from "@/lib/storage";

let mockDimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };

jest.mock("react-native", () => {
  const React = require("react");
  const actual = jest.requireActual("react-native");
  return {
    ...actual,
    useWindowDimensions: () => mockDimensions,
    ScrollView: actual.ScrollView ?? actual.View,
    Modal: actual.Modal ?? (({ visible, children }: any) =>
      visible ? React.createElement(actual.View, null, children) : null),
  };
});

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock("expo-linear-gradient", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    LinearGradient: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
  };
});

jest.mock("@/components/ScoreRenderer", () => ({
  ScoreRenderer: () => null,
}));

jest.mock("@/lib/score-storage", () => ({
  loadScore: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/confirm", () => ({
  confirmDestructive: jest.fn(),
}));

jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      accent: "#D4A846",
      background: "#0D1117",
      border: "#30363D",
      danger: "#F85149",
      surface: "#161B22",
      surfaceLight: "#21262D",
      text: "#F0F6FC",
      textSecondary: "#C9D1D9",
      textTertiary: "#8B949E",
    },
  }),
}));

jest.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    t: (_section: string, key: string) => key === "beatUnit" ? "Beat" : key,
  }),
}));

jest.mock("@/lib/scale", () => ({
  useScale: () => ({
    ms: (value: number) => value,
  }),
}));

import { NoteModeView } from "@/components/NoteModeView";
import { ImageFramingModal } from "@/components/NoteModeModals";

const entry: PracticeEntry = {
  id: "entry-1",
  label: "Odd meter",
  createdAt: 1,
  mode: "beat",
  bpm: 120,
  beatsPerMeasure: 3,
  beatTypes: ["strong", "normal", "accent"],
  beatSubdivisions: {
    "1": ["strong", "normal", "mute"],
  },
  barRepeats: {},
  barLoopMode: "once",
  subdivisionPattern: ["accent"],
};

const handlers = {
  onAddToQueue: jest.fn(),
  onRemoveFromQueue: jest.fn(),
  onReorderQueue: jest.fn(),
  onInsertNext: jest.fn(),
  onPlayModeChange: jest.fn(),
  onTogglePlay: jest.fn(),
  onSave: jest.fn().mockResolvedValue(true),
  onReset: jest.fn(),
  onExitNoteMode: jest.fn(),
};

describe("Note mode beat progress", () => {
  it("shows the current entry beat and active subdivision, then resets for a new item", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <NoteModeView
        {...handlers}
        queue={[entry]}
        barEntries={[]}
        playMode="once"
        currentIndex={0}
        isPlaying
        currentBeat={1}
        activeSubNote={2}
      />,
    );

    expect(getByTestId("note-current-beat").textContent).toBe("2");
    expect(getByTestId("note-subdivision-2")).toBeTruthy();
    expect(queryByTestId("note-subdivision-3")).toBeNull();

    const nextEntry = { ...entry, id: "entry-2", beatsPerMeasure: 5, beatSubdivisions: {} };
    rerender(
      <NoteModeView
        {...handlers}
        queue={[nextEntry]}
        barEntries={[]}
        playMode="once"
        currentIndex={0}
        isPlaying
        currentBeat={-1}
        activeSubNote={-1}
      />,
    );

    expect(getByTestId("note-current-beat").textContent).toBe("—");
    expect(getByTestId("note-beat-progress").textContent).toContain("/ 5");
    expect(queryByTestId("note-subdivision-0")).toBeNull();
  });

  it("keeps the compact progress visible over a photo in landscape", () => {
    mockDimensions = { width: 844, height: 390, scale: 1, fontScale: 1 };
    const photoEntry = { ...entry, imageUri: "file:///practice.jpg" };
    const { getByTestId } = render(
      <NoteModeView
        {...handlers}
        queue={[photoEntry]}
        barEntries={[]}
        playMode="once"
        currentIndex={0}
        isPlaying
        currentBeat={0}
        activeSubNote={0}
      />,
    );

    expect(getByTestId("note-beat-progress")).toBeTruthy();
    expect(getByTestId("note-current-beat").textContent).toBe("1");
    mockDimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  });
});

describe("Note image framing lifecycle", () => {
  it("preserves an existing crop while image dimensions resolve asynchronously", () => {
    let resolveSize: ((width: number, height: number) => void) | undefined;
    (Image as any).getSize = jest.fn((
      _uri: string,
      onSuccess: (width: number, height: number) => void,
    ) => {
      resolveSize = onSuccess;
    });
    const onConfirm = jest.fn();
    const crop = { scale: 1, x: 0.4, y: 0 };
    const { getByText } = render(
      <ImageFramingModal
        visible
        uri="file:///panorama.jpg"
        crop={crop}
        onCancel={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    act(() => {
      resolveSize?.(1000, 500);
    });
    fireEvent.click(getByText("applyFrame").closest("button")!);

    expect(onConfirm).toHaveBeenCalledWith(crop);
  });
});
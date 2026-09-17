/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import * as ReactNative from "react-native";
import { Image } from "react-native";
import type { PracticeEntry } from "@/lib/storage";

let mockDimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };

jest.mock("react-native", () => {
  const React = require("react");
  const actual = jest.requireActual("react-native");
  return {
    ...actual,
    Animated: actual.Animated,
    PanResponder: actual.PanResponder,
    useWindowDimensions: () => mockDimensions,
    FlatList: ({ data = [], renderItem, ...props }: any) =>
      React.createElement(
        actual.View,
        props,
        data.map((item: any, index: number) =>
          React.createElement(
            React.Fragment,
            { key: item?.id ?? index },
            renderItem({ item, index }),
          ),
        ),
      ),
    ScrollView: actual.ScrollView ?? actual.View,
    Modal: actual.Modal ?? (({ visible, children }: any) =>
      visible ? React.createElement(actual.View, null, children) : null),
  };
});

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name, color }: { name: string; color: string }) => {
    const React = require("react");
    return React.createElement("i", {
      "data-testid": `icon-${name}`,
      "data-color": color,
    });
  },
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

jest.mock("@/components/HintTooltip", () => ({
  HintBanner: () => null,
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

const getLastPanResponderConfig = (
  ReactNative as unknown as { __getLastPanResponderConfig: () => any }
).__getLastPanResponderConfig;

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

describe("Note mode play gestures and actions", () => {
  const renderIdleNoteMode = (overrides: Partial<React.ComponentProps<typeof NoteModeView>> = {}) => {
    const nextHandlers = {
      ...handlers,
      onPlayModeChange: jest.fn(),
      onTogglePlay: jest.fn(),
      onOpenSettings: jest.fn(),
      onSave: jest.fn().mockResolvedValue(true),
      ...overrides,
    };
    const view = render(
      <NoteModeView
        {...nextHandlers}
        queue={[entry]}
        barEntries={[]}
        playMode="once"
        currentIndex={0}
        isPlaying={false}
        currentBeat={-1}
        activeSubNote={-1}
      />,
    );
    return { ...view, handlers: nextHandlers };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const Animated = ReactNative.Animated as any;
    Animated.Value.prototype.stopAnimation = jest.fn();
    Animated.sequence = jest.fn(() => ({ start: jest.fn() }));
    Animated.parallel = jest.fn(() => ({ start: jest.fn() }));
  });

  it("keeps tap playback and changes once mode to loop on long press", () => {
    const { getByTestId, handlers: nextHandlers } = renderIdleNoteMode();
    const button = getByTestId("note-play-button");

    fireEvent.click(button);
    fireEvent.contextMenu(button);

    expect(nextHandlers.onTogglePlay).toHaveBeenCalledTimes(1);
    expect(nextHandlers.onPlayModeChange).toHaveBeenCalledWith("loop");
  });

  it("keeps the idle play icon visible on the accent background and uses a stop icon while playing", () => {
    const { getByTestId, rerender } = renderIdleNoteMode();
    const button = getByTestId("note-play-button");

    const idleIconColor = getByTestId("icon-play").getAttribute("data-color");
    expect(idleIconColor).toBe("#fff");
    expect(idleIconColor).not.toBe("#D4A846");

    rerender(
      <NoteModeView
        {...handlers}
        queue={[entry]}
        barEntries={[]}
        playMode="once"
        currentIndex={0}
        isPlaying
        currentBeat={0}
        activeSubNote={0}
      />,
    );

    expect(getByTestId("note-play-button")).toBeTruthy();
    expect(getByTestId("icon-stop").getAttribute("data-color")).toBe("#fff");
  });

  it("switches to random and starts once after four shake round trips", () => {
    const { handlers: nextHandlers } = renderIdleNoteMode();
    const pan = getLastPanResponderConfig();
    const event = { nativeEvent: {} };

    pan.onPanResponderGrant(event, {});
    [-20, 20, -20, 20, -20, 20, -20, 20, -20].forEach((dx) => {
      pan.onPanResponderMove(event, { dx, dy: 0 });
    });
    pan.onPanResponderMove(event, { dx: 20, dy: 0 });

    expect(nextHandlers.onPlayModeChange).toHaveBeenCalledTimes(1);
    expect(nextHandlers.onPlayModeChange).toHaveBeenCalledWith("random");
    expect(nextHandlers.onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("places settings, save, and reset actions beside the play button", async () => {
    const { getByTestId, handlers: nextHandlers } = renderIdleNoteMode();

    fireEvent.click(getByTestId("open-note-settings"));
    await act(async () => {
      fireEvent.click(getByTestId("save-note-mode"));
    });
    fireEvent.click(getByTestId("reset-note-mode"));

    expect(nextHandlers.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(nextHandlers.onSave).toHaveBeenCalledTimes(1);
    expect(require("@/lib/confirm").confirmDestructive).toHaveBeenCalledTimes(1);
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
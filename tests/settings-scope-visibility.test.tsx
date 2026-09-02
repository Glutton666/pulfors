/** @jest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";

import { SettingsThemeTab } from "@/components/settings/SettingsThemeTab";
import { SettingsSoundTab } from "@/components/settings/SettingsSoundTab";
import type { SettingsScope } from "@/components/SettingsModal";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: () => null,
}));

jest.mock("@/components/settings/SettingsStageSection", () => ({
  SettingsStageSection: () => null,
}));

jest.mock("@/components/AnimatedModal", () => ({
  AnimatedModal: () => null,
}));

jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    themeColor: "gold",
    customHex: "#D9A441",
    themeMode: "night",
    setThemeColor: jest.fn(),
    setCustomHex: jest.fn(),
    setThemeMode: jest.fn(),
    colors: {
      accent: "#D9A441",
      accentDim: "#332A18",
      accentMuted: "#806728",
      backgroundSecondary: "#151820",
      border: "#30343D",
      danger: "#FF4444",
      overlay06: "rgba(255,255,255,0.06)",
      overlay08: "rgba(255,255,255,0.08)",
      surface: "#1A1D24",
      surfaceLight: "#252A34",
      text: "#FFFFFF",
      textSecondary: "#C4C8D0",
      textTertiary: "#8A8F9C",
      white: "#FFFFFF",
    },
    hubImages: [],
    addHubImage: jest.fn(),
    removeHubImage: jest.fn(),
    updateHubImageBeatTypes: jest.fn(),
  }),
}));

jest.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    language: "en",
    setLanguage: jest.fn(),
    t: (_section: string, key: string) => key,
  }),
}));

jest.mock("@/lib/scale", () => ({
  useScale: () => ({
    isLandscape: false,
    isTablet: false,
    ms: (value: number) => value,
  }),
}));

const themeProps: Omit<React.ComponentProps<typeof SettingsThemeTab>, "scope"> = {
  loggingEnabled: false,
  onLoggingEnabledChange: jest.fn(),
  landscapeReversed: false,
  onLandscapeReversedChange: jest.fn(),
  showLandscapeImage: true,
  onShowLandscapeImageChange: jest.fn(),
  beatDirection: "cw",
  onBeatDirectionChange: jest.fn(),
  barMetronomeChannel: "both",
  onBarMetronomeChannelChange: jest.fn(),
  barCellOpacity: 0.5,
  onBarCellOpacityChange: jest.fn(),
  barRowHeight: 72,
  onBarRowHeightChange: jest.fn(),
  randomBarConfig: {
    strategy: "independent",
    bundleSize: 2,
    bundleRepeats: 2,
  },
  onRandomBarConfigChange: jest.fn(),
  flashMode: "off",
  onFlashModeChange: jest.fn(),
  hapticMode: "off",
  onHapticModeChange: jest.fn(),
  stagePracticeBook: [],
};

const soundProps: Omit<React.ComponentProps<typeof SettingsSoundTab>, "scope"> = {
  volume: 1,
  onVolumeChange: jest.fn(),
  sampleVolume: 0.5,
  onSampleVolumeChange: jest.fn(),
  soundSet: "classic",
  onSoundSetChange: jest.fn(),
  layerSoundSets: {},
  onLayerSoundSetsChange: jest.fn(),
  customSoundSets: {},
  onCustomSoundSetsChange: jest.fn(),
  audioOffsetMs: 0,
  onAudioOffsetChange: jest.fn(),
  timerStopMode: "immediate",
  onTimerStopModeChange: jest.fn(),
  backgroundPlay: false,
  onBackgroundPlayChange: jest.fn(),
  autoResumeAfterInterruption: true,
  onAutoResumeAfterInterruptionChange: jest.fn(),
  playSoundPreview: jest.fn(),
  previewCustomSample: jest.fn(),
  playCustomSampleUri: jest.fn(async () => undefined),
};

const renderTheme = (scope: SettingsScope) =>
  render(<SettingsThemeTab scope={scope} {...themeProps} />);

const renderSound = (scope: SettingsScope) =>
  render(<SettingsSoundTab scope={scope} {...soundProps} />);

afterEach(cleanup);

describe("theme settings scope visibility", () => {
  test("global settings contain shared appearance controls only", () => {
    const view = renderTheme("global");

    expect(view.getByText("themeMode")).toBeTruthy();
    expect(view.getByText("language")).toBeTruthy();
    expect(view.getByText("themeColor")).toBeTruthy();
    expect(view.queryByText("hubImages")).toBeNull();
    expect(view.queryByText("barMetronomeChannel")).toBeNull();
    expect(view.queryByText("barCellOpacity")).toBeNull();
  });

  test("beat settings contain only beat-specific appearance controls", () => {
    const view = renderTheme("beat");

    expect(view.getByText("hubImages")).toBeTruthy();
    expect(view.getByText("landscapeReversed")).toBeTruthy();
    expect(view.getByText("showLandscapeImage")).toBeTruthy();
    expect(view.getByText("beatDirection")).toBeTruthy();
    expect(view.queryByText("themeMode")).toBeNull();
    expect(view.queryByText("barMetronomeChannel")).toBeNull();
    expect(view.queryByText("barCellOpacity")).toBeNull();
  });

  test("bar settings contain channel and bar-specific appearance controls", () => {
    const view = renderTheme("bar");

    expect(view.getByText("barMetronomeChannel")).toBeTruthy();
    expect(view.getByText("barCellOpacity")).toBeTruthy();
    expect(view.getByText("barRowHeight")).toBeTruthy();
    expect(view.getByText("barRandomStrategy")).toBeTruthy();
    expect(view.queryByText("hubImages")).toBeNull();
    expect(view.queryByText("themeMode")).toBeNull();
  });

  test("note settings do not expose beat or bar appearance controls", () => {
    const view = renderTheme("note");

    expect(view.queryByText("themeMode")).toBeNull();
    expect(view.queryByText("hubImages")).toBeNull();
    expect(view.queryByText("barMetronomeChannel")).toBeNull();
    expect(view.queryByText("barCellOpacity")).toBeNull();
  });
});

describe("sound settings scope visibility", () => {
  test("sample volume is hidden globally and in note settings", () => {
    expect(renderSound("global").queryByText("sampleVolume")).toBeNull();
    cleanup();
    expect(renderSound("note").queryByText("sampleVolume")).toBeNull();
  });

  test("sample volume remains available in bar settings", () => {
    expect(renderSound("bar").getByText("sampleVolume")).toBeTruthy();
  });
});
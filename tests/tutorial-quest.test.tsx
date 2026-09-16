/** @jest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { ModeTutorialModal } from "@/components/ModeTutorialModal";
import { SettingsModal } from "@/components/SettingsModal";
import { SettingsProfileTab } from "@/components/settings/SettingsProfileTab";

let mockLanguage: "en" | "ko" = "en";

const tutorialTranslations = {
  en: {
    modeTitle: "Mode tutorial",
    beat: "Beat",
    skip: "Skip",
    stepCompleted: "Step complete",
    tryItNow: "Try it on the highlighted screen",
    beatBpmTitle: "Change the BPM",
    beatBpmBody: "Move the BPM slider or tap the number to change the tempo.",
    beatTapTitle: "Try tap tempo",
    beatTapBody: "Tap steadily several times to measure the current tempo.",
    beatPlayTitle: "Start playback",
    beatPlayBody: "Press Play to hear and see the beat in action.",
  },
  ko: {
    modeTitle: "모드 튜토리얼",
    beat: "비트",
    skip: "건너뛰기",
    stepCompleted: "단계 완료",
    tryItNow: "강조된 화면에서 직접 해보세요",
    beatBpmTitle: "BPM을 바꿔보세요",
    beatBpmBody: "BPM 슬라이더를 움직이거나 숫자를 눌러 템포를 바꿔보세요.",
    beatTapTitle: "탭 템포를 사용해보세요",
    beatTapBody: "손가락으로 일정하게 여러 번 탭해 현재 템포를 측정해보세요.",
    beatPlayTitle: "재생을 시작해보세요",
    beatPlayBody: "재생 버튼을 눌러 비트가 어떻게 들리고 표시되는지 확인해보세요.",
  },
} as const;

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    language: mockLanguage,
    setLanguage: jest.fn(),
    t: (section: string, key: string) => {
      if (section === "tutorial") {
        return tutorialTranslations[mockLanguage][key as keyof typeof tutorialTranslations.en] ?? key;
      }
      const settings: Record<string, { en: string; ko: string }> = {
        showTutorialAgain: { en: "Show tutorial again", ko: "튜토리얼 다시 보기" },
        showTutorialAgainHint: { en: "Replay the tutorial for the current mode", ko: "현재 화면의 기능 안내를 다시 봅니다" },
        resetTutorials: { en: "Reset tutorials", ko: "튜토리얼 초기화" },
        title: { en: "Settings", ko: "설정" },
        themeTab: { en: "Theme", ko: "테마" },
        soundTab: { en: "Sound", ko: "사운드" },
        profileTab: { en: "Profile", ko: "프로필" },
        nickname: { en: "Nickname", ko: "닉네임" },
        primaryInstrument: { en: "Primary instrument", ko: "주 악기" },
        primaryInstrumentHint: { en: "Choose your instrument", ko: "악기를 선택하세요" },
        primaryInstrumentSearchPlaceholder: { en: "Search instruments", ko: "악기 검색" },
        primaryInstrumentNone: { en: "None", ko: "없음" },
        noRooms: { en: "No practice rooms", ko: "연습실이 없습니다" },
        labUnlockedTitle: { en: "Lab Unlocked", ko: "실험실 해금" },
        labUnlockedMessage: { en: "The Lab menu is now unlocked.", ko: "실험실 메뉴가 해금되었습니다." },
      };
      return settings[key]?.[mockLanguage] ?? key;
    },
  }),
}));

jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
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
    themeColor: "gold",
    customHex: "#D9A441",
    themeMode: "night",
    setThemeColor: jest.fn(),
    setCustomHex: jest.fn(),
    setThemeMode: jest.fn(),
    hubImages: [],
    addHubImage: jest.fn(),
    removeHubImage: jest.fn(),
    updateHubImageBeatTypes: jest.fn(),
  }),
}));

jest.mock("@/lib/scale", () => ({
  useScale: () => ({
    isLandscape: false,
    isTablet: false,
    ms: (value: number) => value,
  }),
}));

jest.mock("@/components/AnimatedModal", () => ({
  AnimatedModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? <div>{children}</div> : null,
}));

jest.mock("@/components/settings/SettingsThemeTab", () => ({
  SettingsThemeTab: ({ scope }: { scope: string }) => <div data-testid={`theme-tab-${scope}`} />,
}));

jest.mock("@/components/settings/SettingsSoundTab", () => ({
  SettingsSoundTab: () => <div data-testid="sound-tab" />,
}));

jest.mock("@/components/settings/SettingsKeyboardTab", () => ({
  SettingsKeyboardTab: () => <div data-testid="keyboard-tab" />,
}));

jest.mock("@/components/settings/SoundPreviewPlayers", () => ({
  SoundPreviewPlayers: () => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => undefined),
}));

jest.mock("@/lib/practice-room", () => ({
  loadPracticeRooms: jest.fn(async () => []),
  loadLabUnlocked: jest.fn(async () => false),
  addPracticeRoom: jest.fn(async () => null),
  deletePracticeRoom: jest.fn(async () => undefined),
  renamePracticeRoom: jest.fn(async () => undefined),
  isLabPracticeRoomName: jest.fn((name: string) => name.trim().toLowerCase() === "lab"),
  requestLocationPermission: jest.fn(async () => false),
}));

jest.mock("@/lib/activity-log", () => ({
  loadGoals: jest.fn(async () => []),
  saveGoals: jest.fn(async () => undefined),
}));

const tutorialProps = (overrides: Partial<React.ComponentProps<typeof ModeTutorialModal>> = {}) => ({
  visible: true,
  mode: "beat" as const,
  completedSteps: [],
  lastAction: null,
  onStepComplete: jest.fn(),
  onSkip: jest.fn(),
  onComplete: jest.fn(),
  ...overrides,
});

const settingsProps = (overrides: Record<string, unknown> = {}) => ({
  visible: true,
  onClose: jest.fn(),
  volume: 1,
  onVolumeChange: jest.fn(),
  sampleVolume: 0.5,
  onSampleVolumeChange: jest.fn(),
  backgroundPlay: false,
  onBackgroundPlayChange: jest.fn(),
  playbackNotifications: false,
  onPlaybackNotificationsChange: jest.fn(),
  autoResumeAfterInterruption: true,
  onAutoResumeAfterInterruptionChange: jest.fn(),
  soundSet: "classic" as const,
  onSoundSetChange: jest.fn(),
  tonePosition: { x: 0, y: 0 },
  onTonePositionChange: jest.fn(),
  layerSoundSets: {},
  onLayerSoundSetsChange: jest.fn(),
  flashMode: "off" as const,
  onFlashModeChange: jest.fn(),
  hapticMode: "off" as const,
  onHapticModeChange: jest.fn(),
  audioOffsetMs: 0,
  onAudioOffsetChange: jest.fn(),
  timerStopMode: "immediate" as const,
  onTimerStopModeChange: jest.fn(),
  loggingEnabled: false,
  onLoggingEnabledChange: jest.fn(),
  username: "",
  onUsernameChange: jest.fn(),
  roomTrackingActive: false,
  trackingRoomName: null,
  onStartRoomTracking: jest.fn(),
  onStopRoomTracking: jest.fn(),
  customSoundSets: {},
  onCustomSoundSetsChange: jest.fn(),
  landscapeReversed: false,
  onLandscapeReversedChange: jest.fn(),
  showLandscapeImage: true,
  onShowLandscapeImageChange: jest.fn(),
  beatDirection: "cw" as const,
  onBeatDirectionChange: jest.fn(),
  barMetronomeChannel: "both" as const,
  onBarMetronomeChannelChange: jest.fn(),
  barCellOpacity: 0.5,
  onBarCellOpacityChange: jest.fn(),
  barRowHeight: 72,
  onBarRowHeightChange: jest.fn(),
  barStaffNotation: false,
  onBarStaffNotationChange: jest.fn(),
  beatStaffNotation: false,
  onBeatStaffNotationChange: jest.fn(),
  randomBarConfig: { strategy: "independent" as const, bundleSize: 2, bundleRepeats: 2 },
  onRandomBarConfigChange: jest.fn(),
  ...overrides,
});

const profileProps = (overrides: Record<string, unknown> = {}) => ({
  visible: true,
  username: "",
  onUsernameChange: jest.fn(),
  primaryInstrumentId: null,
  onPrimaryInstrumentChange: jest.fn(),
  roomTrackingActive: false,
  trackingRoomName: null,
  onStartRoomTracking: jest.fn(),
  onStopRoomTracking: jest.fn(),
  ...overrides,
});

afterEach(() => {
  cleanup();
  mockLanguage = "en";
});

describe("rendered mode tutorial quests", () => {
  test("shows bilingual labels and a progress indicator", () => {
    const view = render(<ModeTutorialModal {...tutorialProps()} />);

    expect(view.getByText("Mode tutorial · Beat")).toBeTruthy();
    expect(view.getByText("1/3")).toBeTruthy();
    expect(view.getByText("Change the BPM")).toBeTruthy();
    expect(view.getByText("Skip")).toBeTruthy();

    mockLanguage = "ko";
    view.rerender(<ModeTutorialModal {...tutorialProps()} />);
    expect(view.getByText("모드 튜토리얼 · 비트")).toBeTruthy();
    expect(view.getByText("BPM을 바꿔보세요")).toBeTruthy();
    expect(view.getByText("건너뛰기")).toBeTruthy();
  });

  test("does not advance for unrelated actions, then completes each matching step", () => {
    jest.useFakeTimers();
    const onStepComplete = jest.fn();
    const onComplete = jest.fn();
    const view = render(
      <ModeTutorialModal
        {...tutorialProps({ onStepComplete, onComplete, lastAction: "toggle_play" })}
      />,
    );

    expect(view.getByText("1/3")).toBeTruthy();
    expect(onStepComplete).not.toHaveBeenCalled();

    act(() => {
      view.rerender(
        <ModeTutorialModal
          {...tutorialProps({ onStepComplete, onComplete, lastAction: "bpm_change" })}
        />,
      );
    });
    expect(onStepComplete).toHaveBeenLastCalledWith("bpm");
    expect(view.getByText("✓ Step complete")).toBeTruthy();
    act(() => jest.advanceTimersByTime(650));
    expect(view.getByText("2/3")).toBeTruthy();

    act(() => {
      view.rerender(
        <ModeTutorialModal
          {...tutorialProps({ onStepComplete, onComplete, lastAction: "tap_tempo" })}
        />,
      );
    });
    expect(onStepComplete).toHaveBeenLastCalledWith("tap");
    expect(view.getByText("✓ Step complete")).toBeTruthy();
    act(() => jest.advanceTimersByTime(650));
    expect(view.getByText("3/3")).toBeTruthy();

    act(() => {
      view.rerender(
        <ModeTutorialModal
          {...tutorialProps({ onStepComplete, onComplete, lastAction: "toggle_play" })}
        />,
      );
    });
    expect(onStepComplete).toHaveBeenLastCalledWith("play");
    expect(view.getByText("✓ Step complete")).toBeTruthy();
    act(() => jest.advanceTimersByTime(650));
    expect(onComplete).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test("skip invokes the skip callback without requiring audio or microphone setup", () => {
    const onSkip = jest.fn();
    const view = render(<ModeTutorialModal {...tutorialProps({ onSkip })} />);

    fireEvent.click(view.getByText("Skip"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe("tutorial replay and reset settings", () => {
  test.each(["global", "beat"] as const)("does not render disabled tutorial controls in %s settings", (scope) => {
    const view = render(
      <SettingsModal
        {...settingsProps({ scope })}
      />,
    );

    expect(view.queryByText("Show tutorial again")).toBeNull();
    expect(view.queryByText("Reset tutorials")).toBeNull();
    expect(view.getByTestId(`theme-tab-${scope}`)).toBeTruthy();
  });

  test("does not show mode tutorial controls for stage-scoped settings", () => {
    const view = render(<SettingsModal {...settingsProps({ scope: "stage" })} />);

    expect(view.queryByText("Show tutorial again")).toBeNull();
    expect(view.queryByText("Reset tutorials")).toBeNull();
  });

  test("profile settings do not expose disabled tutorial controls", async () => {
    const view = render(
      <SettingsProfileTab
        {...profileProps()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(view.queryByText("Show tutorial again")).toBeNull();
    expect(view.queryByText("Reset tutorials")).toBeNull();
  });
});
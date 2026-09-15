/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";

type AudioRecordListener = (data: string) => void;

const mockAudioRecordListeners = new Set<AudioRecordListener>();

jest.mock("react-native", () => {
  const React = require("react");
  const actual = jest.requireActual("react-native");
  const FlatList = ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => unknown;
  }) => React.createElement(
    "div",
    null,
    data.map((item, index) => React.cloneElement(
      renderItem({ item, index }) as React.ReactElement,
      { key: index },
    )),
  );
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
    FlatList,
  };
});

jest.mock("react-native-audio-record", () => {
  const audioRecord = {
    init: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    on: jest.fn((_event: string, listener: AudioRecordListener) => {
      mockAudioRecordListeners.add(listener);
      return {
        remove: jest.fn(() => mockAudioRecordListeners.delete(listener)),
      };
    }),
    __emit(data: string) {
      mockAudioRecordListeners.forEach((listener: AudioRecordListener) => listener(data));
    },
    __reset() {
      mockAudioRecordListeners.clear();
    },
  };
  return { __esModule: true, default: audioRecord };
});

jest.mock("@expo/vector-icons", () => {
  const Icon = () => null;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});

jest.mock("@/components/AnimatedModal", () => {
  const React = require("react");
  return {
    AnimatedModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement("div", null, children) : null,
  };
});

jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: require("@/constants/colors").default,
  }),
}));

jest.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    language: "en",
    t: (section: string, key: string) => `${section}.${key}`,
  }),
}));

jest.mock("@/lib/scale", () => ({
  useScale: () => ({
    screenWidth: 375,
    screenHeight: 812,
    minDim: 375,
    isTablet: false,
    ms: (value: number) => value,
  }),
}));

jest.mock("@/lib/signal-generator-engine", () => ({
  SignalGeneratorEngine: class {
    stopWeb = jest.fn();
  },
  generateToneBase64: jest.fn(() => ""),
}));

jest.mock("@/lib/error-tracking", () => ({
  captureBreadcrumb: jest.fn(),
}));

jest.mock("expo-audio", () => ({
  __esModule: true,
  AudioModule: {},
  createAudioPlayer: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(async () => ({
    status: "granted",
    canAskAgain: true,
  })),
}));

const AudioRecord = require("react-native-audio-record").default as {
  init: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  on: jest.Mock;
  __emit: (data: string) => void;
  __reset: () => void;
};
const { SignalGeneratorModal } = require("@/components/SignalGeneratorModal") as typeof import("@/components/SignalGeneratorModal");

function makeProps() {
  return {
    visible: true,
    onClose: jest.fn(),
    onOpenTuningGuide: jest.fn(),
    onOpenBpmDetect: jest.fn(),
  };
}

function validPcm440Base64() {
  const sampleRate = 44100;
  const samples = Buffer.alloc(8192 * 2);
  for (let i = 0; i < 8192; i++) {
    const value = Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 12000);
    samples.writeInt16LE(value, i * 2);
  }
  return samples.toString("base64");
}

async function startNativeMic() {
  const view = render(<SignalGeneratorModal {...makeProps()} />);
  await act(async () => {
    fireEvent.click(view.getByTestId("signal-mic-toggle"));
    jest.advanceTimersByTime(260);
    await Promise.resolve();
  });
  return view;
}

describe("SignalGeneratorModal native microphone lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    AudioRecord.__reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("initialization failure reports startFailed and cleans the native recorder", async () => {
    AudioRecord.init.mockImplementationOnce(() => {
      throw new Error("native init failed");
    });

    const view = await startNativeMic();

    expect(AudioRecord.init).toHaveBeenCalledTimes(1);
    expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
    expect(view.getByText("signalGenerator.micStartFailed")).toBeTruthy();
  });

  test("missing native callbacks reach the watchdog state and stop removes the subscription", async () => {
    const view = await startNativeMic();

    expect(AudioRecord.start).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(view.getByText("signalGenerator.micNoInput")).toBeTruthy();

    await act(async () => {
      fireEvent.click(view.getByTestId("signal-mic-toggle"));
      jest.advanceTimersByTime(260);
      await Promise.resolve();
    });
    expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
    expect(mockAudioRecordListeners.size).toBe(0);
  });

  test("malformed PCM does not poison the next normal chunk", async () => {
    const view = await startNativeMic();

    act(() => {
      AudioRecord.__emit("not-valid-base64");
    });
    expect(view.queryByText(/signalGenerator\.\d+ hzUnit/)).toBeNull();

    act(() => {
      AudioRecord.__emit(validPcm440Base64());
    });
    expect(view.getByText(/440(\.0)? signalGenerator\.hzUnit/)).toBeTruthy();
    expect(view.getAllByText("A4").length).toBeGreaterThanOrEqual(1);
  });
});
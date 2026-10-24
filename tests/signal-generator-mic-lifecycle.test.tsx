/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";

type AudioRecordListener = (data: { buffer: { sampleRate: number; getChannelData: () => Float32Array } }) => void;

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

jest.mock("@/lib/audio-session", () => ({
  acquireAudioSession: jest.fn(async () => {}),
  releaseAudioSession: jest.fn(async () => {}),
}));

jest.mock("react-native-audio-api", () => {
  const audioRecord = {
    start: jest.fn(async () => ({ status: "success" })),
    stop: jest.fn(async () => ({ status: "success" })),
    onError: jest.fn(),
    clearOnError: jest.fn(),
    clearOnAudioReady: jest.fn(),
    onAudioReady: jest.fn((_options: unknown, listener: AudioRecordListener) => {
      mockAudioRecordListeners.add(listener);
      return { status: "success" };
    }),
    __emit(samples: Float32Array, sampleRate = 44100) {
      mockAudioRecordListeners.forEach((listener) => listener({
        buffer: { sampleRate, getChannelData: () => samples },
      }));
    },
    __reset() {
      mockAudioRecordListeners.clear();
    },
  };
  return {
    __esModule: true,
    AudioRecorder: jest.fn(() => {
      let ownListener: AudioRecordListener | null = null;
      return {
        ...audioRecord,
        onAudioReady: (options: unknown, listener: AudioRecordListener) => {
          ownListener = listener;
          return audioRecord.onAudioReady(options, listener);
        },
        clearOnAudioReady: () => {
          audioRecord.clearOnAudioReady();
          if (ownListener) mockAudioRecordListeners.delete(ownListener);
          ownListener = null;
        },
      };
    }),
    AudioManager: { setAudioSessionOptions: jest.fn() },
    __recorder: audioRecord,
  };
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

const NativeApi = require("react-native-audio-api");
const AudioRecord = NativeApi.__recorder as {
  start: jest.Mock;
  stop: jest.Mock;
  onAudioReady: jest.Mock;
  onError: jest.Mock;
  __emit: (samples: Float32Array, sampleRate?: number) => void;
  __reset: () => void;
};
const { SignalGeneratorModal } = require("@/components/SignalGeneratorModal") as typeof import("@/components/SignalGeneratorModal");

function makeProps() {
  return {
    visible: true,
    onClose: jest.fn(),
    onOpenTuningGuide: jest.fn(),
  };
}

function validPcm440(sampleRate = 44100) {
  const samples = new Float32Array(8192);
  for (let i = 0; i < 8192; i++) {
    samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.4;
  }
  return samples;
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

  test("a rejected native start result reports failure and releases the recording session", async () => {
    AudioRecord.start.mockResolvedValueOnce({ status: "error", message: "native init failed" });

    const view = await startNativeMic();

    expect(NativeApi.AudioRecorder).toHaveBeenCalledTimes(1);
    expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
    expect(require("@/lib/audio-session").releaseAudioSession).toHaveBeenCalledTimes(1);
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
      AudioRecord.__emit(new Float32Array([NaN]));
    });
    expect(view.queryByTestId("signal-mic-frequency")).toBeNull();

    act(() => {
      AudioRecord.__emit(validPcm440());
    });
    expect(Number(view.getByTestId("signal-mic-frequency").textContent!.split(" ")[0])).toBeCloseTo(440, -1);
    expect(view.getByTestId("signal-mic-note").textContent).toBe("A4");
  });

  test("long-pressing the microphone opens the analysis session without starting the tuner", () => {
    const view = render(<SignalGeneratorModal {...makeProps()} />);

    fireEvent.contextMenu(view.getByTestId("signal-mic-toggle"));

    expect(view.getByTestId("signal-analysis-panel")).toBeTruthy();
    expect(view.getByTestId("signal-analysis-start")).toBeTruthy();
    expect(NativeApi.AudioRecorder).not.toHaveBeenCalled();
  });

  test("analysis start uses the existing microphone lifecycle", async () => {
    const view = render(<SignalGeneratorModal {...makeProps()} />);

    fireEvent.contextMenu(view.getByTestId("signal-mic-toggle"));
    await act(async () => {
      fireEvent.click(view.getByTestId("signal-analysis-start"));
      await Promise.resolve();
    });

    expect(NativeApi.AudioRecorder).toHaveBeenCalledTimes(1);
    expect(AudioRecord.start).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("signal-analysis-finish")).toBeTruthy();
  });

  test("a missing native binary shows a rebuild message, not a permission error", async () => {
    NativeApi.AudioRecorder.mockImplementationOnce(() => { throw new Error("native module not found"); });
    const view = await startNativeMic();
    expect(view.getByText("signalGenerator.micNativeUnavailable")).toBeTruthy();
    expect(view.queryByText("signalGenerator.micPermissionRequired")).toBeNull();
  });

  test("pitch detection follows the actual 48kHz hardware buffer rate", async () => {
    const view = await startNativeMic();
    act(() => AudioRecord.__emit(validPcm440(48000), 48000));
    expect(Number(view.getByTestId("signal-mic-frequency").textContent!.split(" ")[0])).toBeCloseTo(440, -1);
    expect(view.getByTestId("signal-mic-note").textContent).toBe("A4");
    expect(NativeApi.AudioManager.setAudioSessionOptions).toHaveBeenCalledWith(expect.objectContaining({
      iosCategory: "playAndRecord", iosMode: "measurement",
    }));
  });

  test("closing during native startup cancels the late recorder and callbacks", async () => {
    let resolveStart!: (result: { status: string }) => void;
    AudioRecord.start.mockImplementationOnce(() => new Promise((resolve) => { resolveStart = resolve; }));
    const view = await startNativeMic();
    view.unmount();
    await act(async () => { resolveStart({ status: "success" }); });
    expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
    expect(mockAudioRecordListeners.size).toBe(0);
  });

  test("a callback setup failure also stops and releases the session", async () => {
    AudioRecord.onAudioReady.mockReturnValueOnce({ status: "error", message: "input callback unavailable" });
    const view = await startNativeMic();
    expect(AudioRecord.start).not.toHaveBeenCalled();
    expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
    expect(require("@/lib/audio-session").releaseAudioSession).toHaveBeenCalledTimes(1);
    expect(view.getByText("signalGenerator.micStartFailed")).toBeTruthy();
  });

  test("capture errors stop the recorder instead of leaving a listening UI", async () => {
    const view = await startNativeMic();
    await act(async () => {
      AudioRecord.onError.mock.calls[0][0]({ message: "input disconnected" });
    });
    expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
    expect(view.getByText("signalGenerator.micStartFailed")).toBeTruthy();
    expect(mockAudioRecordListeners.size).toBe(0);
  });

  test("old lifetime callbacks cannot change a restarted tuner's result", async () => {
    const view = await startNativeMic();
    const oldCallback = AudioRecord.onAudioReady.mock.calls[0][1];
    await act(async () => {
      fireEvent.click(view.getByTestId("signal-mic-toggle"));
      jest.advanceTimersByTime(260);
    });
    await act(async () => {
      fireEvent.click(view.getByTestId("signal-mic-toggle"));
      jest.advanceTimersByTime(260);
    });
    act(() => {
      oldCallback({ buffer: { sampleRate: 44100, getChannelData: () => validPcm440() } });
    });
    expect(view.queryByTestId("signal-mic-frequency")).toBeNull();
    act(() => AudioRecord.__emit(validPcm440()));
    expect(view.getByTestId("signal-mic-note").textContent).toBe("A4");
  });

  test("a restart waits for a cancelled pending native start to be fully stopped", async () => {
    let resolveStart!: (result: { status: string }) => void;
    AudioRecord.start.mockImplementationOnce(() => new Promise((resolve) => { resolveStart = resolve; }));
    const view = await startNativeMic();
    await act(async () => {
      fireEvent.click(view.getByTestId("signal-mic-toggle"));
      jest.advanceTimersByTime(260);
    });
    await act(async () => {
      fireEvent.click(view.getByTestId("signal-mic-toggle"));
      jest.advanceTimersByTime(260);
    });
    expect(NativeApi.AudioRecorder).toHaveBeenCalledTimes(1);
    await act(async () => { resolveStart({ status: "success" }); });
    expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
    expect(NativeApi.AudioRecorder).toHaveBeenCalledTimes(2);
    act(() => AudioRecord.__emit(validPcm440()));
    expect(view.getByTestId("signal-mic-note").textContent).toBe("A4");
  });
});
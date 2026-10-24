/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";

type AudioRecordListener = (data: { buffer: { sampleRate: number; getChannelData: () => Float32Array } }) => void;

const mockAudioRecordListeners = new Set<AudioRecordListener>();

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

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
    Pressable: React.forwardRef(({
      children, testID, onPress, onPressIn, onPressOut, onLongPress, disabled,
      accessibilityLabel,
    }: any, ref: React.Ref<HTMLButtonElement>) => React.createElement("button", {
      ref,
      "data-testid": testID,
      "aria-label": accessibilityLabel,
      disabled,
      onClick: onPress,
      onMouseDown: onPressIn,
      onMouseUp: onPressOut,
      onContextMenu: (event: React.MouseEvent) => { event.preventDefault(); onLongPress?.(); },
    }, typeof children === "function" ? children({ pressed: false }) : children)),
    TextInput: React.forwardRef(({
      value, onChangeText, onBlur, onSubmitEditing, testID,
    }: {
      value: string;
      onChangeText: (value: string) => void;
      onBlur?: () => void;
      onSubmitEditing?: (event: { nativeEvent: { text: string } }) => void;
      testID?: string;
    }, ref: React.Ref<HTMLInputElement>) => React.createElement("input", {
      ref,
      value,
      "data-testid": testID,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value),
      onBlur,
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") onSubmitEditing?.({ nativeEvent: { text: event.currentTarget.value } });
      },
    })),
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

function validPcm440(sampleRate = 44100, frequency = 440) {
  const samples = new Float32Array(8192);
  for (let i = 0; i < 8192; i++) {
    samples[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.4;
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

  test("analysis is available directly without a details panel or automatic microphone start", () => {
    const view = render(<SignalGeneratorModal {...makeProps()} />);

    expect(view.queryByTestId("signal-details-toggle")).toBeNull();
    expect(view.queryByTestId("signal-analysis-panel")).toBeNull();
    expect(view.getByTestId("signal-target-note-picker")).toBeTruthy();
    expect(view.getByTestId("signal-target-octave-picker")).toBeTruthy();
    expect(NativeApi.AudioRecorder).not.toHaveBeenCalled();
  });

  test("holding the microphone captures past ten seconds and releasing shows results below the tuner", async () => {
    const view = render(<SignalGeneratorModal {...makeProps()} />);

    await act(async () => {
      fireEvent.mouseDown(view.getByTestId("signal-mic-toggle"));
      fireEvent.contextMenu(view.getByTestId("signal-mic-toggle"));
      await Promise.resolve();
    });

    expect(NativeApi.AudioRecorder).toHaveBeenCalledTimes(1);
    expect(AudioRecord.start).toHaveBeenCalledTimes(1);
    act(() => {
      AudioRecord.__emit(validPcm440());
      jest.advanceTimersByTime(12_000);
    });
    expect(view.queryByTestId("signal-analysis-timeline")).toBeNull();
    expect(AudioRecord.stop).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.mouseUp(view.getByTestId("signal-mic-toggle"));
      await Promise.resolve();
    });
    expect(view.getByTestId("signal-analysis-timeline")).toBeTruthy();
    expect(view.getByTestId("signal-tuner-panel")).toBeTruthy();
    expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("signal-analysis-panel").textContent).toContain("12.0s");
    act(() => {
      fireEvent.click(view.getByTestId("signal-mic-toggle"));
      jest.advanceTimersByTime(300);
    });
    expect(NativeApi.AudioRecorder).toHaveBeenCalledTimes(1);
  });

  test("release before microphone permission completes never starts recording", async () => {
    const audio = require("expo-audio");
    let grant!: (value: unknown) => void;
    audio.requestRecordingPermissionsAsync.mockImplementationOnce(() => new Promise((resolve) => { grant = resolve; }));
    const view = render(<SignalGeneratorModal {...makeProps()} />);
    await act(async () => {
      fireEvent.mouseDown(view.getByTestId("signal-mic-toggle"));
      fireEvent.contextMenu(view.getByTestId("signal-mic-toggle"));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.mouseUp(view.getByTestId("signal-mic-toggle"));
      grant({ status: "granted", canAskAgain: true });
      await Promise.resolve();
    });
    expect(NativeApi.AudioRecorder).not.toHaveBeenCalled();
    expect(view.queryByTestId("signal-analysis-panel")).toBeNull();
  });

  test("closing while held stops capture and discards late results", async () => {
    const props = makeProps();
    const view = render(<SignalGeneratorModal {...props} />);
    await act(async () => {
      fireEvent.mouseDown(view.getByTestId("signal-mic-toggle"));
      fireEvent.contextMenu(view.getByTestId("signal-mic-toggle"));
      await Promise.resolve();
    });
    act(() => { AudioRecord.__emit(validPcm440()); });
    view.rerender(<SignalGeneratorModal {...props} visible={false} />);
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
    view.rerender(<SignalGeneratorModal {...props} />);
    expect(view.queryByTestId("signal-analysis-panel")).toBeNull();
    expect(view.queryByTestId("signal-mic-frequency")).toBeNull();
  });

  test("releasing a reference hold during file preparation prevents late playback", async () => {
    const audio = require("expo-audio");
    const fs = require("expo-file-system/legacy");
    let finishWrite!: () => void;
    const write = jest.spyOn(fs, "writeAsStringAsync").mockImplementationOnce(() => new Promise<void>((resolve) => { finishWrite = resolve; }));
    const view = render(<SignalGeneratorModal {...makeProps()} />);
    await act(async () => {
      fireEvent.mouseDown(view.getByTestId("signal-target-edit"));
      fireEvent.contextMenu(view.getByTestId("signal-target-edit"));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.mouseUp(view.getByTestId("signal-target-edit"));
      finishWrite();
      await Promise.resolve();
    });
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
    expect(view.queryByTestId("signal-frequency-input")).toBeNull();
    write.mockRestore();
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

  test("the default tuner has a target but never auto-starts recording", () => {
    const view = render(<SignalGeneratorModal {...makeProps()} />);
    expect(view.getByTestId("signal-target-frequency").textContent).toContain("440.0");
    expect(view.getByTestId("signal-tuner-cents").textContent).toBe("—");
    expect(view.queryByTestId("signal-details")).toBeNull();
    expect(view.queryByTestId("signal-mic-frequency")).toBeNull();
    expect(NativeApi.AudioRecorder).not.toHaveBeenCalled();
    expect(require("expo-audio").requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });

  test("target step controls and direct input keep one target with bounded adjustment", () => {
    const view = render(<SignalGeneratorModal {...makeProps()} />);
    fireEvent.click(view.getByTestId("signal-target-increase"));
    expect(view.getByTestId("signal-target-frequency").textContent).toContain("441.0");
    fireEvent.click(view.getByTestId("signal-target-decrease"));
    expect(view.getByTestId("signal-target-frequency").textContent).toContain("440.0");
    fireEvent.click(view.getByTestId("signal-target-edit"));
    const input = view.getByTestId("signal-frequency-input");
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((view.getByTestId("signal-target-decrease") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByTestId("signal-target-edit"));
    fireEvent.change(view.getByTestId("signal-frequency-input"), { target: { value: "20000" } });
    fireEvent.keyDown(view.getByTestId("signal-frequency-input"), { key: "Enter" });
    expect((view.getByTestId("signal-target-increase") as HTMLButtonElement).disabled).toBe(true);
  });

  test("live cents have both signs, target capture yields zero, and silence clears the result", async () => {
    const view = await startNativeMic();
    act(() => AudioRecord.__emit(validPcm440(44100, 450)));
    expect(view.getByTestId("signal-tuner-cents").textContent).toMatch(/^\+/);
    act(() => AudioRecord.__emit(validPcm440(44100, 430)));
    expect(view.getByTestId("signal-tuner-cents").textContent).toMatch(/^-/);
    fireEvent.click(view.getByTestId("signal-use-detected"));
    expect(view.getByTestId("signal-tuner-cents").textContent).toBe("0¢");
    expect(view.getByTestId("signal-target-frequency").textContent).toContain(view.getByTestId("signal-mic-frequency").textContent!);
    act(() => AudioRecord.__emit(new Float32Array(8192)));
    expect(view.queryByTestId("signal-mic-frequency")).toBeNull();
    expect(view.getByTestId("signal-tuner-cents").textContent).toBe("—");
    expect(view.getAllByText("signalGenerator.noSignal").length).toBeGreaterThan(0);
  });

  test("guide selection changes the same visible target used for pitch comparison", async () => {
    const props = makeProps();
    const view = render(<SignalGeneratorModal {...props} />);
    fireEvent.click(view.getByTestId("signal-tuning-guide"));
    const [initialFrequency, onSelect] = props.onOpenTuningGuide.mock.calls[0];
    expect(initialFrequency).toBe(440);
    act(() => onSelect(432));
    expect(view.getByTestId("signal-target-frequency").textContent).toContain("432.0");
    await act(async () => {
      fireEvent.click(view.getByTestId("signal-mic-toggle"));
      jest.advanceTimersByTime(260);
    });
    act(() => AudioRecord.__emit(validPcm440()));
    const detected = Number(view.getByTestId("signal-mic-frequency").textContent);
    expect(view.getByTestId("signal-tuner-cents").textContent).toBe(`+${Math.round(1200 * Math.log2(detected / 432))}¢`);
  });

  test("reference playback and its updates use the visible target frequency", async () => {
    const audio = require("expo-audio");
    const tone = require("@/lib/signal-generator-engine").generateToneBase64;
    audio.createAudioPlayer.mockImplementation(() => ({
      pause: jest.fn(), play: jest.fn(), remove: jest.fn(), loop: false, volume: 1,
    }));
    const view = render(<SignalGeneratorModal {...makeProps()} />);
    fireEvent.click(view.getByTestId("signal-target-increase"));
    await act(async () => { fireEvent.click(view.getByTestId("signal-toggle")); });
    expect(tone).toHaveBeenLastCalledWith(441, "sine", expect.any(Number));
    expect(view.getByText("signalGenerator.referenceStop")).toBeTruthy();
    fireEvent.click(view.getByTestId("signal-target-increase"));
    await act(async () => { jest.advanceTimersByTime(80); });
    expect(tone).toHaveBeenLastCalledWith(442, "sine", expect.any(Number));
    fireEvent.click(view.getByTestId("signal-toggle"));
    expect(view.getByText("signalGenerator.referencePlay")).toBeTruthy();
  });
});
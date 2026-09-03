/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first */

import { act, renderHook } from "@testing-library/react";
import { Platform } from "react-native";

const mockPlayer = {
  volume: 1,
  loop: false,
  play: jest.fn(),
  pause: jest.fn(),
  release: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
};
const mockRenderMeasure = jest.fn((_params: any) => new Float32Array([0.25, 0.1]));
const mockPlayWebRenderedLoop = jest.fn(
  (_pcm: unknown, _onEnded?: () => void, _channel?: string, _volume?: number) => ({
    stop: jest.fn(),
    isRunning: jest.fn(() => true),
  }),
);
const mockDecodeSampleFile = jest.fn(async (_uri: string) => new Float32Array([0.8, 0.4, 0.2]));
const mockCreateAudioPlayer = jest.fn((_source: unknown) => ({ ...mockPlayer }));

jest.mock("expo-audio", () => ({
  createAudioPlayer: (source: unknown) => mockCreateAudioPlayer(source),
}));

jest.mock("@/lib/audio-renderer", () => ({
  decodeSampleFile: (uri: string) => mockDecodeSampleFile(uri),
  loadAssetPCM: jest.fn(async () => new Float32Array([0.5])),
  parseTrimInfo: jest.fn(() => ({ trimStartMs: 0, trimDurationMs: 0 })),
  renderMeasure: (params: any) => mockRenderMeasure(params),
  applySoftClip: jest.fn(),
  saveRenderedWav: jest.fn(async () => "file:///rendered.wav"),
  ensureWebClickBuffers: jest.fn(async () => true),
  playWebRenderedLoop: (
    pcm: unknown,
    onEnded?: () => void,
    channel?: string,
    volume?: number,
  ) => mockPlayWebRenderedLoop(pcm, onEnded, channel, volume),
  getWebAudioContext: jest.fn(() => ({
    state: "running",
    resume: jest.fn().mockResolvedValue(undefined),
  })),
  clearWebClickBuffers: jest.fn(),
}));

jest.mock("@/hooks/useAudioPlayers", () => ({
  BUILTIN_POOL_SIZE: 4,
  useAudioPlayers: () => ({
    allPlayers: {},
    allPlayersRef: { current: {} },
    soundSetRef: { current: "classic" },
    highToggle: { current: 0 },
    lowToggle: { current: 0 },
    strongToggle: { current: 0 },
    setPoolsVolume: jest.fn(),
  }),
}));

jest.mock("@/lib/metronome-engine", () => ({
  soundSets: {
    classic: { strong: "strong.wav", high: "high.wav", low: "low.wav" },
  },
}));

jest.mock("@/lib/dial-engine-boundary", () => ({
  applyDialConfigToEngine: jest.fn(),
}));

jest.mock("@/lib/sample-cache", () => ({
  syncStereoArtifact: jest.fn(),
  releaseStereoArtifact: jest.fn(),
}));

jest.mock("@/lib/audio-session", () => ({
  setAutoResumeAfterInterruption: jest.fn(),
}));

jest.mock("@/lib/audio-utils", () => ({
  safePlay: (player: { play?: () => void }) => player.play?.(),
  notifyAudioPoolFallback: jest.fn(),
}));

jest.mock("@/app/index.helpers", () => ({
  isSafeNoteSampleUri: jest.fn(() => true),
}));

import { useAudioPipeline } from "../hooks/useAudioPipeline";
import { usePlaybackControl } from "../hooks/usePlaybackControl";

const clickPCMs = {
  strong: new Float32Array([0.5]),
  high: new Float32Array([0.4]),
  low: new Float32Array([0.3]),
};
const sampleMap = { "0-0": "file:///sample.wav" };
const sampleChannels = { "0-0": "left" as const };
const sampleVolumes = { "0-0": 0.4 };
const sampleSpeeds = { "0-0": 1.5 };
const samplePCMs = new Map([
  ["0-0", { pcm: new Float32Array([0.8, 0.4]), trimStartMs: 0, trimDurationMs: 0 }],
]);

function makeEngine() {
  let running = false;
  return {
    getScheduleInfo: jest.fn(() => ({
      ticks: [{
        time: 0,
        type: "strong",
        beat: 0,
        subBeat: 0,
        repeatIteration: 0,
        barRepeatIteration: 0,
      }],
      durationMs: 500,
    })),
    getIsRunning: jest.fn(() => running),
    start: jest.fn(() => { running = true; }),
    stop: jest.fn(() => { running = false; }),
    buildScheduleOnly: jest.fn(),
    setPreRenderedAudio: jest.fn(),
    setPendingMeasureStartAction: jest.fn(),
  };
}

describe("pre-rendered playback reliability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as unknown as { OS: string }).OS = "ios";
  });

  afterEach(() => {
    (Platform as unknown as { OS: string }).OS = "ios";
  });

  it("native builder renders note PCM with its volume, speed and channel metadata", async () => {
    const engine = makeEngine();
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: { current: {} },
      layerSoundSetsRef: { current: {} },
      noteSamplesRef: { current: sampleMap },
      noteSampleChannelsRef: { current: sampleChannels },
      noteSampleVolumesRef: { current: sampleVolumes },
      noteSampleSpeedsRef: { current: sampleSpeeds },
      barModeRef: { current: false },
      barMetronomeChannelRef: { current: "both" },
      noteSampleMetroChannelsRef: { current: {} },
      volume: 0.35,
      volumeRef: { current: 0.35 },
      sampleVolumeRef: { current: 0.7 },
      clickPCMCacheRef: { current: { classic: clickPCMs } },
      webClickReadyRef: { current: false },
      noteSampleSoundsRef: { current: {} },
      renderGenerationRef: { current: 0 },
      isPlayingRef: { current: false },
      bpmRef: { current: 120 },
      t: (key: string) => key,
      showRecoveryToast: jest.fn(),
      persistAudioSettingsCallbackRef: { current: jest.fn() },
    } as any;

    const { result } = renderHook(() => useAudioPipeline(params));
    let player: any = null;
    await act(async () => {
      player = await result.current.buildRenderedPlayer();
    });

    expect(mockDecodeSampleFile).toHaveBeenCalledWith("file:///sample.wav");
    expect(mockRenderMeasure).toHaveBeenCalledWith(expect.objectContaining({
      samplePCMs: expect.any(Map),
      sampleVolume: 0.7,
      sampleVolumes,
      sampleSpeeds,
      sampleChannels,
    }));
    expect(mockRenderMeasure.mock.calls[0][0].samplePCMs.has("0-0")).toBe(true);
    expect(player?.volume).toBe(0.35);
  });

  it("does not restore an old decoded sample into cache after the URI changes", async () => {
    const engine = makeEngine();
    const noteSamplesRef = { current: { "0-0": "file:///old.wav" } };
    let resolveOld!: (pcm: Float32Array<ArrayBuffer>) => void;
    mockDecodeSampleFile.mockImplementationOnce(
      () => new Promise<Float32Array<ArrayBuffer>>((resolve) => { resolveOld = resolve; }),
    );
    mockDecodeSampleFile.mockResolvedValueOnce(new Float32Array([0.9]));
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: { current: {} },
      layerSoundSetsRef: { current: {} },
      noteSamplesRef,
      noteSampleChannelsRef: { current: {} },
      noteSampleVolumesRef: { current: {} },
      noteSampleSpeedsRef: { current: {} },
      barModeRef: { current: false },
      barMetronomeChannelRef: { current: "both" },
      noteSampleMetroChannelsRef: { current: {} },
      volume: 0.35,
      volumeRef: { current: 0.35 },
      sampleVolumeRef: { current: 0.7 },
      clickPCMCacheRef: { current: { classic: clickPCMs } },
      webClickReadyRef: { current: false },
      noteSampleSoundsRef: { current: {} },
      renderGenerationRef: { current: 0 },
      isPlayingRef: { current: false },
      bpmRef: { current: 120 },
      t: (key: string) => key,
      showRecoveryToast: jest.fn(),
      persistAudioSettingsCallbackRef: { current: jest.fn() },
    } as any;
    const { result } = renderHook(() => useAudioPipeline(params));

    const oldLoad = result.current.getSamplePCMs(noteSamplesRef.current);
    noteSamplesRef.current = { "0-0": "file:///new.wav" };
    const newLoad = await result.current.getSamplePCMs(noteSamplesRef.current);
    resolveOld(new Float32Array([0.1]));
    await oldLoad;
    const cachedCurrent = await result.current.getSamplePCMs(noteSamplesRef.current);

    expect(newLoad.get("0-0")?.pcm[0]).toBeCloseTo(0.9);
    expect(cachedCurrent.get("0-0")?.pcm[0]).toBeCloseTo(0.9);
    expect(mockDecodeSampleFile).toHaveBeenCalledTimes(2);
  });

  it("keeps a healthy web pre-rendered loop without per-tick callbacks", () => {
    jest.useFakeTimers();
    (Platform as unknown as { OS: string }).OS = "web";
    const engine = makeEngine();
    engine.start();
    const isPlayingRef = { current: true };
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: { current: {} },
      layerSoundSetsRef: { current: {} },
      noteSamplesRef: { current: {} },
      noteSampleChannelsRef: { current: {} },
      noteSampleVolumesRef: { current: {} },
      noteSampleSpeedsRef: { current: {} },
      barModeRef: { current: true },
      barMetronomeChannelRef: { current: "both" },
      noteSampleMetroChannelsRef: { current: {} },
      volume: 0.35,
      volumeRef: { current: 0.35 },
      sampleVolumeRef: { current: 0.7 },
      clickPCMCacheRef: { current: { classic: clickPCMs } },
      webClickReadyRef: { current: true },
      noteSampleSoundsRef: { current: {} },
      renderGenerationRef: { current: 0 },
      isPlayingRef,
      bpmRef: { current: 120 },
      t: (key: string) => key,
      showRecoveryToast: jest.fn(),
      persistAudioSettingsCallbackRef: { current: jest.fn() },
    } as any;
    const { result, unmount } = renderHook(() => useAudioPipeline(params));
    const renderedStop = jest.fn();
    result.current.webRenderedLoopRef.current = {
      stop: renderedStop,
      isRunning: () => true,
    };

    act(() => {
      result.current.armAudioWatchdog();
      jest.advanceTimersByTime(4000);
    });

    expect(renderedStop).not.toHaveBeenCalled();
    expect(params.showRecoveryToast).not.toHaveBeenCalled();
    act(() => result.current.clearAudioWatchdog());
    unmount();
    jest.useRealTimers();
  });

  it.each([
    ["web", { stop: jest.fn(), isRunning: () => false }, null],
    ["ios", null, { ...mockPlayer, playing: false }],
  ] as const)("recovers a silent %s pre-rendered output", (platform, webLoop, nativePlayer) => {
    jest.useFakeTimers();
    (Platform as unknown as { OS: string }).OS = platform;
    const engine = makeEngine();
    engine.start();
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: { current: {} },
      layerSoundSetsRef: { current: {} },
      noteSamplesRef: { current: {} },
      noteSampleChannelsRef: { current: {} },
      noteSampleVolumesRef: { current: {} },
      noteSampleSpeedsRef: { current: {} },
      barModeRef: { current: true },
      barMetronomeChannelRef: { current: "both" },
      noteSampleMetroChannelsRef: { current: {} },
      volume: 0.35,
      volumeRef: { current: 0.35 },
      sampleVolumeRef: { current: 0.7 },
      clickPCMCacheRef: { current: { classic: clickPCMs } },
      webClickReadyRef: { current: true },
      noteSampleSoundsRef: { current: {} },
      renderGenerationRef: { current: 0 },
      isPlayingRef: { current: true },
      bpmRef: { current: 120 },
      t: (key: string) => key,
      showRecoveryToast: jest.fn(),
      persistAudioSettingsCallbackRef: { current: jest.fn() },
    } as any;
    const { result, unmount } = renderHook(() => useAudioPipeline(params));
    result.current.webRenderedLoopRef.current = webLoop;
    result.current.renderedPlayerRef.current = nativePlayer as any;

    act(() => {
      result.current.armAudioWatchdog();
      jest.advanceTimersByTime(4000);
    });

    expect(engine.setPreRenderedAudio).toHaveBeenCalledWith(false);
    act(() => result.current.clearAudioWatchdog());
    unmount();
    jest.useRealTimers();
  });

  it.each(["startMetronome", "togglePlayPause"] as const)(
    "native %s preserves the volume assigned by the rendered-player builder",
    async (method) => {
      const engine = makeEngine();
      const player = { ...mockPlayer, volume: 0.35 };
      const params = makePlaybackParams(engine, player);
      const { result } = renderHook(() => usePlaybackControl(params as any));

      await act(async () => {
        await result.current[method]();
        await Promise.resolve();
      });

      expect(player.volume).toBe(0.35);
      expect(player.play).toHaveBeenCalled();
    },
  );

  it("native toggle waits for the rendered loop instead of switching audio after realtime ticks start", async () => {
    const engine = makeEngine();
    const player = { ...mockPlayer, volume: 0.35 };
    let resolvePlayer!: (value: typeof player) => void;
    const params = makePlaybackParams(engine, null);
    params.buildRenderedPlayer.mockImplementation(
      () => new Promise((resolve) => { resolvePlayer = resolve; }),
    );
    const { result } = renderHook(() => usePlaybackControl(params as any));

    let pendingStart!: Promise<unknown>;
    act(() => {
      pendingStart = result.current.togglePlayPause();
    });

    expect(params.setIsPreparing).toHaveBeenCalledWith(true);
    expect(engine.start).not.toHaveBeenCalled();

    await act(async () => {
      resolvePlayer(player);
      await pendingStart;
    });

    expect(engine.setPreRenderedAudio).toHaveBeenCalledWith(true);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("keeps Android Beat mode on realtime players so accent roles and level do not change", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    const player = { ...mockPlayer, volume: 0.35 };
    const params = makePlaybackParams(engine, player);
    params.barModeRef.current = false;
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(params.buildRenderedPlayer).not.toHaveBeenCalled();
    expect(engine.setPreRenderedAudio).toHaveBeenCalledWith(false);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
  });

  it("uses the rendered player for Android Beat custom sound sets", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    const player = { ...mockPlayer, volume: 0.35, play: jest.fn() };
    const params = makePlaybackParams(engine, player);
    params.barModeRef.current = false;
    params.soundSetRef.current = "custom1";
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(params.buildRenderedPlayer).toHaveBeenCalledTimes(1);
    expect(engine.setPreRenderedAudio).toHaveBeenCalledWith(true);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("web playback renders the same note metadata and applies the user master volume", async () => {
    (Platform as unknown as { OS: string }).OS = "web";
    const engine = makeEngine();
    const params = makePlaybackParams(engine, null);
    params.soundSetRef.current = "custom1";
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.startMetronome();
    });

    expect(mockRenderMeasure).toHaveBeenCalledWith(expect.objectContaining({
      samplePCMs,
      sampleVolume: 0.7,
      sampleVolumes,
      sampleSpeeds,
      sampleChannels,
    }));
    expect(mockPlayWebRenderedLoop).toHaveBeenCalledWith(
      expect.any(Float32Array),
      undefined,
      "both",
      0.35,
    );
  });

  it("does not start an obsolete web render after a newer render begins", async () => {
    (Platform as unknown as { OS: string }).OS = "web";
    const engine = makeEngine();
    let resolveFirst!: (value: typeof samplePCMs) => void;
    const params = makePlaybackParams(engine, null);
    params.soundSetRef.current = "custom1";
    params.getSamplePCMs
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(samplePCMs);
    const { result } = renderHook(() => usePlaybackControl(params as any));

    let firstStart!: Promise<void>;
    act(() => {
      firstStart = result.current.startMetronome();
    });
    await act(async () => {
      await result.current.startMetronome();
    });
    resolveFirst(samplePCMs);
    await act(async () => {
      await firstStart;
    });

    expect(mockPlayWebRenderedLoop).toHaveBeenCalledTimes(1);
  });

  it("shared render epoch cancels an in-flight web render when settings request a re-render", async () => {
    (Platform as unknown as { OS: string }).OS = "web";
    const engine = makeEngine();
    const sharedEpoch = { current: 0 };
    let resolveSampleLoad!: (value: typeof samplePCMs) => void;
    let markSampleLoadEntered!: () => void;
    const sampleLoadEntered = new Promise<void>((resolve) => {
      markSampleLoadEntered = resolve;
    });
    const playbackParams = makePlaybackParams(engine, null);
    playbackParams.soundSetRef.current = "custom1";
    playbackParams.renderGenerationRef = sharedEpoch;
    playbackParams.getSamplePCMs.mockImplementationOnce(
      () => {
        markSampleLoadEntered();
        return new Promise((resolve) => { resolveSampleLoad = resolve; });
      },
    );
    const { result } = renderHook(() => usePlaybackControl(playbackParams as any));

    let pendingStart!: Promise<void>;
    act(() => {
      pendingStart = result.current.startMetronome();
    });
    await act(async () => {
      await sampleLoadEntered;
    });
    sharedEpoch.current += 1;
    resolveSampleLoad(samplePCMs);
    await act(async () => {
      await pendingStart;
    });

    expect(mockPlayWebRenderedLoop).not.toHaveBeenCalled();
  });

  it("keeps web Beat mode builtin sets on per-tick playback after the first measure", async () => {
    (Platform as unknown as { OS: string }).OS = "web";
    const engine = makeEngine();
    const params = makePlaybackParams(engine, null);
    params.barModeRef.current = false;
    params.soundSetRef.current = "classic";
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.setPreRenderedAudio).toHaveBeenCalledWith(false);
    expect(mockRenderMeasure).not.toHaveBeenCalled();
    expect(mockPlayWebRenderedLoop).not.toHaveBeenCalled();
  });
});

function makePlaybackParams(engine: ReturnType<typeof makeEngine>, player: typeof mockPlayer | null) {
  return {
    engineRef: { current: engine },
    isPlaying: false,
    isPreparing: false,
    setIsPlaying: jest.fn(),
    setIsPreparing: jest.fn(),
    isPlayingRef: { current: false },
    isPreparingRef: { current: false },
    preparingCancelledRef: { current: false },
    barMode: false,
    barModeRef: { current: false },
    bpm: 120,
    getPlaybackContext: jest.fn(() => ({ bpm: 120, modeLabel: "Beat", activityMode: "beat", bpmSource: "global" })),
    beatsPerMeasure: 4,
    subdivisionPattern: [],
    barConfigRef: { current: {} },
    dialConfigRef: { current: {} },
    barStartBeatRef: { current: null },
    barLoopModeRef: { current: "loop" },
    blockPlayModeRef: { current: "sequential" },
    beatDenominatorRef: { current: 4 },
    stopRenderedAudio: jest.fn(),
    clearSamplePlayStates: jest.fn(),
    resetPlaybackVisuals: jest.fn(),
    renderedPlayerRef: { current: null },
    webRenderedLoopRef: { current: null },
    renderGenerationRef: { current: 0 },
    buildRenderedPlayer: jest.fn(async () => player),
    clearAudioWatchdogRef: { current: jest.fn() },
    armAudioWatchdogRef: { current: jest.fn() },
    soundSetRef: { current: "classic" },
    volumeRef: { current: 0.35 },
    sampleVolumeRef: { current: 0.7 },
    noteSamplesRef: { current: sampleMap },
    noteSampleChannelsRef: { current: sampleChannels },
    noteSampleVolumesRef: { current: sampleVolumes },
    noteSampleSpeedsRef: { current: sampleSpeeds },
    webClickReadyRef: { current: true },
    getClickPCMs: jest.fn(async () => clickPCMs),
    getSamplePCMs: jest.fn(async () => samplePCMs),
    getLayerClickPCMsForSchedule: jest.fn(async () => new Map()),
    barMetronomeChannelRef: { current: "both" },
    noteSampleMetroChannelsRef: { current: {} },
    notifyVoicePlayState: jest.fn(),
    languageRef: { current: "en" },
    notifyUserToggle: jest.fn(),
    showPlayingNotification: jest.fn(),
    showPausedNotification: jest.fn(),
    easterEggActiveRef: { current: false },
    handleEasterEggGiveUpRef: { current: jest.fn() },
    loggingEnabled: false,
    practiceStartRef: { current: null },
    practiceSessionRef: { current: null },
    loadedPracticeNoteRef: { current: null },
    addPracticeLog: jest.fn(),
    checkCompletedGoals: jest.fn(),
    capturePlaybackError: jest.fn(),
  };
}
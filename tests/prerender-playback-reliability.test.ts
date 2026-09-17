/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first */

import { act, renderHook } from "@testing-library/react";
import { Platform } from "react-native";
import {
  releaseStereoArtifact,
  releaseStereoArtifactIfCurrent,
  syncStereoArtifact,
} from "@/lib/sample-cache";
import { createAudioRenderLifecycle } from "@/lib/audio-render-lifecycle";
import { createAudioOutputOwner } from "@/lib/audio-output-owner";

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
const mockReleaseRenderedWav = jest.fn();
const mockSaveRenderedWav = jest.fn(async (
  _pcm?: unknown,
  _filename?: string,
) => "file:///rendered.wav");
const mockApplyDialConfigToEngine = jest.fn();
const mockScheduleWebClickAt = jest.fn((..._args: unknown[]) => null as any);
const mockProcessClickPCM = jest.fn((
  pcm: Float32Array,
  _position: { x: number; y: number },
) => pcm);

jest.mock("expo-audio", () => ({
  createAudioPlayer: (source: unknown) => mockCreateAudioPlayer(source),
}));

jest.mock("@/lib/audio-renderer", () => ({
  decodeSampleFile: (uri: string) => mockDecodeSampleFile(uri),
  loadAssetPCM: jest.fn(async () => new Float32Array([0.5])),
  parseTrimInfo: jest.fn(() => ({ trimStartMs: 0, trimDurationMs: 0 })),
  renderMeasure: (params: any) => mockRenderMeasure(params),
  renderMeasureAbortable: async (params: any, signal?: AbortSignal) => {
    if (signal?.aborted) throw new Error("RENDER_ABORTED");
    return mockRenderMeasure(params);
  },
  beginAbortableRender: jest.fn(() => undefined),
  abortActiveRender: jest.fn(),
  finishAbortableRender: jest.fn(),
  isRenderAborted: jest.fn((error: unknown) => (error as Error)?.message === "RENDER_ABORTED"),
  scheduleWebClickAt: (...args: unknown[]) => mockScheduleWebClickAt(...args),
  applySoftClip: jest.fn(),
  saveRenderedWav: (...args: unknown[]) => mockSaveRenderedWav(...args),
  releaseRenderedWav: (uri: string) => {
    mockReleaseRenderedWav(uri);
    if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
  },
  ensureWebClickBuffers: jest.fn(async () => true),
  playWebRenderedLoop: (
    pcm: unknown,
    onEnded?: () => void,
    channel?: string,
    volume?: number,
  ) => mockPlayWebRenderedLoop(pcm, onEnded, channel, volume),
  getWebAudioContext: jest.fn(() => ({
    state: "running",
    currentTime: 0,
    resume: jest.fn().mockResolvedValue(undefined),
  })),
  getRealtimeClickGain: (volume: number) => Math.max(0, Math.min(1, volume)) * 3.2,
  getClickRenderVolume: (volume: number) => 3.2 * Math.max(1, Math.max(0, volume)),
  getClickOutputVolume: (volume: number) => Math.max(0, Math.min(1, volume)),
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

jest.mock("@/lib/metronome-tone-dsp", () => ({
  NEUTRAL: { x: 0, y: 0 },
  processClickPCM: (pcm: Float32Array, position: { x: number; y: number }) =>
    mockProcessClickPCM(pcm, position),
  toneEffectIntensity: ({ x, y }: { x: number; y: number }) => Math.max(Math.abs(x), Math.abs(y)),
}));

jest.mock("@/lib/dial-engine-boundary", () => ({
  applyDialConfigToEngine: (...args: unknown[]) => mockApplyDialConfigToEngine(...args),
}));

jest.mock("@/lib/sample-cache", () => ({
  syncStereoArtifact: jest.fn(),
  releaseStereoArtifact: jest.fn(),
  releaseStereoArtifactIfCurrent: jest.fn(),
}));

jest.mock("@/lib/audio-session", () => ({
  setAutoResumeAfterInterruption: jest.fn(),
}));

jest.mock("@/lib/audio-utils", () => ({
  safePlay: (player: { play?: () => void }) => player.play?.(),
  safePlayAndConfirm: async (player: { play?: () => unknown }) => {
    try {
      await Promise.resolve(player.play?.());
      return true;
    } catch {
      return false;
    }
  },
  notifyAudioPoolFallback: jest.fn(),
}));

jest.mock("@/lib/index.helpers", () => ({
  isSafeNoteSampleUri: jest.fn(() => true),
}));

import {
  NOTE_SAMPLE_PCM_CACHE_LIMIT,
  useAudioPipeline,
} from "../hooks/useAudioPipeline";
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
    setBeatTypes: jest.fn(),
    setAllBeatSubdivisions: jest.fn(),
    setAllBarRepeats: jest.fn(),
    setLoopBlocks: jest.fn(),
    setBlockPlayMode: jest.fn(),
    setAllBarBpmOverrides: jest.fn(),
    setPreRenderedAudio: jest.fn(),
    setPendingMeasureStartAction: jest.fn(),
    requestStopAfterMeasure: jest.fn(),
  };
}

describe("pre-rendered playback reliability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as unknown as { OS: string }).OS = "ios";
  });

  afterEach(() => {
    (Platform as unknown as { OS: string }).OS = "ios";
    (syncStereoArtifact as jest.Mock).mockReset();
    jest.useRealTimers();
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
      const built = await result.current.prepareRenderedPlayer();
      if (built.status === "completed") {
        built.prepared.commit((output) => { player = (output as any).player; });
      }
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

  it("uses a unique native artifact filename for consecutive render sessions", async () => {
    const engine = makeEngine();
    const params = makePipelineParams(engine);
    const { result, unmount } = renderHook(() => useAudioPipeline(params as any));

    const first = await result.current.prepareRenderedPlayer();
    const second = await result.current.prepareRenderedPlayer();
    if (second.status === "completed") second.prepared.discard();
    if (first.status === "completed") first.prepared.discard();

    const filenames = mockSaveRenderedWav.mock.calls.map((call) => call[1]);
    expect(filenames).toHaveLength(2);
    expect(filenames[0]).toMatch(/^rendered_measure_\d+\.wav$/);
    expect(filenames[1]).toMatch(/^rendered_measure_\d+\.wav$/);
    expect(filenames[0]).not.toBe(filenames[1]);
    unmount();
  });

  it("uses distinct native artifact filenames across concurrent pipeline instances", async () => {
    const firstEngine = makeEngine();
    const secondEngine = makeEngine();
    const first = renderHook(() => useAudioPipeline(makePipelineParams(firstEngine) as any));
    const second = renderHook(() => useAudioPipeline(makePipelineParams(secondEngine) as any));

    const firstResult = await first.result.current.prepareRenderedPlayer();
    const secondResult = await second.result.current.prepareRenderedPlayer();
    if (firstResult.status === "completed") firstResult.prepared.discard();
    if (secondResult.status === "completed") secondResult.prepared.discard();

    const filenames = mockSaveRenderedWav.mock.calls.map((call) => call[1]);
    expect(filenames).toHaveLength(2);
    expect(filenames[0]).not.toBe(filenames[1]);
    first.unmount();
    second.unmount();
  });

  it("native builder keeps the supplied start snapshot while refs change during decoding", async () => {
    const engine = makeEngine();
    let resolveDecode!: (pcm: Float32Array<ArrayBuffer>) => void;
    mockDecodeSampleFile.mockImplementationOnce(
      () => new Promise<Float32Array<ArrayBuffer>>((resolve) => { resolveDecode = resolve; }),
    );
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: { current: {} },
      layerSoundSetsRef: { current: {} },
      noteSamplesRef: { current: { "0-0": "file:///start.wav" } },
      noteSampleChannelsRef: { current: { "0-0": "left" } },
      noteSampleVolumesRef: { current: { "0-0": 0.25 } },
      noteSampleSpeedsRef: { current: { "0-0": 0.75 } },
      barModeRef: { current: true },
      barMetronomeChannelRef: { current: "right" },
      noteSampleMetroChannelsRef: { current: { "0": "left" } },
      volume: 0.4,
      volumeRef: { current: 0.4 },
      tonePositionRef: { current: { x: 0, y: 0 } },
      sampleVolumeRef: { current: 0.6 },
      clickPCMCacheRef: { current: {} },
      webClickReadyRef: { current: false },
      noteSampleSoundsRef: { current: {} },
      renderGenerationRef: { current: 0 },
      isPlayingRef: { current: false },
      bpmRef: { current: 120 },
      t: (key: string) => key,
      showRecoveryToast: jest.fn(),
      persistAudioSettingsCallbackRef: { current: jest.fn() },
    } as any;
    const snapshot = {
      soundSet: "classic",
      volume: 0.4,
      sampleVolume: 0.6,
      tonePosition: { x: 0, y: 0 },
      tonePositions: { classic: { x: 0, y: 0 } },
      customSoundSets: {},
      noteSamples: { "0-0": "file:///start.wav" },
      noteSampleChannels: { "0-0": "left" },
      noteSampleVolumes: { "0-0": 0.25 },
      noteSampleSpeeds: { "0-0": 0.75 },
      metronomeChannel: "both",
      noteSampleMetroChannels: { "0": "left" },
      layerSoundSets: { "1": "classic" },
    } as any;
    const { result } = renderHook(() => useAudioPipeline(params));

    let building!: Promise<unknown>;
    act(() => {
      building = result.current.prepareRenderedPlayer({ mode: "bar", audio: snapshot } as any);
    });
    params.volumeRef.current = 0.95;
    params.sampleVolumeRef.current = 1;
    params.noteSampleChannelsRef.current = { "0-0": "right" };
    params.noteSampleVolumesRef.current = { "0-0": 1 };
    params.noteSampleSpeedsRef.current = { "0-0": 2 };
    params.barMetronomeChannelRef.current = "left";
    resolveDecode(new Float32Array([0.8, 0.4]));
    await act(async () => { await building; });

    expect(mockRenderMeasure).toHaveBeenCalledWith(expect.objectContaining({
      clickVolume: 3.2,
      sampleVolume: 0.6,
      sampleChannels: { "0-0": "left" },
      sampleVolumes: { "0-0": 0.25 },
      sampleSpeeds: { "0-0": 0.75 },
      metronomeChannel: "both",
      metroChannelsByBeat: { "0": "left" },
    }));
    expect(mockCreateAudioPlayer.mock.results.at(-1)?.value.volume).toBe(0.4);
  });

  it("resolves legacy layer sound fallbacks from the supplied start snapshot", async () => {
    const engine = makeEngine();
    const customRole = (uri: string) => ({
      type: "custom",
      sampleUri: uri,
      duration: 1,
    });
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: {
        current: {
          "custom-start": {
            strong: customRole("file:///start-strong.wav"),
            accent: customRole("file:///start-accent.wav"),
            normal: customRole("file:///start-normal.wav"),
          },
          "custom-live": {
            strong: customRole("file:///live-strong.wav"),
            accent: customRole("file:///live-accent.wav"),
            normal: customRole("file:///live-normal.wav"),
          },
        },
      },
      layerSoundSetsRef: { current: { 1: "custom-live" } },
      noteSamplesRef: { current: {} },
      noteSampleChannelsRef: { current: {} },
      noteSampleVolumesRef: { current: {} },
      noteSampleSpeedsRef: { current: {} },
      barModeRef: { current: true },
      barMetronomeChannelRef: { current: "both" },
      noteSampleMetroChannelsRef: { current: {} },
      volume: 0.4,
      volumeRef: { current: 0.4 },
      sampleVolumeRef: { current: 0.6 },
      clickPCMCacheRef: { current: {} },
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
    const capturedCustomSoundSets = JSON.parse(
      JSON.stringify(params.customSoundSetsRef.current),
    );
    params.customSoundSetsRef.current["custom-start"] =
      params.customSoundSetsRef.current["custom-live"];

    await result.current.getLayerClickPCMsForSchedule(
      [{ layerIndex: 1 } as any],
      undefined,
      {
        defaultSoundSet: "classic",
        layerSoundSets: { 1: "custom-start" as any },
        tonePositions: { ["custom-start" as any]: { x: 0.6, y: -0.2 } },
        customSoundSets: capturedCustomSoundSets,
      },
    );

    expect(mockDecodeSampleFile).toHaveBeenCalledWith("file:///start-strong.wav");
    expect(mockDecodeSampleFile).toHaveBeenCalledWith("file:///start-accent.wav");
    expect(mockDecodeSampleFile).toHaveBeenCalledWith("file:///start-normal.wav");
    expect(mockDecodeSampleFile).not.toHaveBeenCalledWith("file:///live-strong.wav");
    expect(mockProcessClickPCM).toHaveBeenCalledWith(
      expect.any(Float32Array),
      { x: 0.6, y: -0.2 },
    );
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

  it("reuses a queue-warmed sample by URI when that sample becomes current", async () => {
    const engine = makeEngine();
    const noteSamplesRef = { current: { "0-0": "file:///current.wav" } };
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

    await result.current.getSamplePCMs({ "0-0": "file:///next.wav" });
    noteSamplesRef.current = { "0-0": "file:///next.wav" };
    await result.current.getSamplePCMs(noteSamplesRef.current);

    expect(mockDecodeSampleFile).toHaveBeenCalledTimes(1);
    expect(mockDecodeSampleFile).toHaveBeenCalledWith("file:///next.wav");
  });

  it("bounds queue-warmed PCM entries while keeping the current and next samples hot", async () => {
    const engine = makeEngine();
    const noteSamplesRef = { current: { "0-0": "file:///current.wav" } };
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

    await result.current.getSamplePCMs(noteSamplesRef.current);
    for (let index = 0; index < NOTE_SAMPLE_PCM_CACHE_LIMIT; index += 1) {
      await result.current.getSamplePCMs({ "0-0": `file:///queued-${index}.wav` });
    }
    await result.current.getSamplePCMs(noteSamplesRef.current);
    await result.current.getSamplePCMs({ "0-0": "file:///next.wav" });
    const decodeCountAfterWarmup = mockDecodeSampleFile.mock.calls.length;

    await result.current.getSamplePCMs(noteSamplesRef.current);
    await result.current.getSamplePCMs({ "0-0": "file:///next.wav" });
    expect(mockDecodeSampleFile).toHaveBeenCalledTimes(decodeCountAfterWarmup);

    await result.current.getSamplePCMs({ "0-0": "file:///queued-0.wav" });
    expect(mockDecodeSampleFile).toHaveBeenCalledTimes(decodeCountAfterWarmup + 1);
  });

  it("does not publish a queue warm-up that finishes after cache invalidation", async () => {
    const engine = makeEngine();
    const noteSamplesRef = { current: { "0-0": "file:///next.wav" } };
    let resolveDecode!: (pcm: Float32Array<ArrayBuffer>) => void;
    mockDecodeSampleFile.mockImplementationOnce(
      () => new Promise<Float32Array<ArrayBuffer>>((resolve) => { resolveDecode = resolve; }),
    );
    mockDecodeSampleFile.mockResolvedValueOnce(new Float32Array([0.6]));
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

    const staleWarmup = result.current.getSamplePCMs(noteSamplesRef.current);
    result.current.invalidateSamplePCMCache();
    resolveDecode(new Float32Array([0.1]));
    await staleWarmup;
    await result.current.getSamplePCMs(noteSamplesRef.current);

    expect(mockDecodeSampleFile).toHaveBeenCalledTimes(2);
  });

  it("does not publish a decoded sample after the audio pipeline unmounts", async () => {
    const engine = makeEngine();
    const noteSamplesRef = { current: { "0-0": "file:///late.wav" } };
    let resolveDecode!: (pcm: Float32Array<ArrayBuffer>) => void;
    mockDecodeSampleFile.mockImplementationOnce(
      () => new Promise<Float32Array<ArrayBuffer>>((resolve) => { resolveDecode = resolve; }),
    );
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
    const { result, unmount } = renderHook(() => useAudioPipeline(params));

    const staleWarmup = result.current.getSamplePCMs(noteSamplesRef.current);
    unmount();
    resolveDecode(new Float32Array([0.1]));
    await staleWarmup;

    expect(result.current.samplePCMCacheRef.current.size).toBe(0);
  });

  it("releases a native player whose pending boundary handoff is superseded", async () => {
    jest.useFakeTimers();
    const engine = makeEngine();
    engine.start();
    let pendingAction: (() => void) | null = null;
    engine.setPendingMeasureStartAction.mockImplementation((action: (() => void) | null) => {
      pendingAction = action;
    });
    const firstPendingPlayer = {
      ...mockPlayer,
      pause: jest.fn(),
      release: jest.fn(),
    };
    mockCreateAudioPlayer.mockReturnValueOnce(firstPendingPlayer);
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
      isPlayingRef: { current: true },
      bpmRef: { current: 120 },
      t: (key: string) => key,
      showRecoveryToast: jest.fn(),
      persistAudioSettingsCallbackRef: { current: jest.fn() },
    } as any;
    const { result } = renderHook(() => useAudioPipeline(params));

    act(() => {
      result.current.scheduleReRender();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
      await jest.runOnlyPendingTimersAsync();
    });
    expect(pendingAction).toEqual(expect.any(Function));
    expect(firstPendingPlayer.release).not.toHaveBeenCalled();

    act(() => {
      result.current.scheduleReRender();
    });

    expect(engine.setPendingMeasureStartAction).toHaveBeenLastCalledWith(null);
    expect(firstPendingPlayer.pause).toHaveBeenCalledTimes(1);
    expect(firstPendingPlayer.release).toHaveBeenCalledTimes(1);
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
    result.current.outputOwner.publish({
      stop: renderedStop,
      release: renderedStop,
      isRunning: () => true,
    });

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
    if (webLoop) {
      result.current.outputOwner.publish({
        ...webLoop,
        release: webLoop.stop,
      });
    } else if (nativePlayer) {
      result.current.outputOwner.publish({
        isRunning: () => nativePlayer.playing,
        release: () => {
          nativePlayer.pause();
          nativePlayer.release();
        },
      });
    }

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
    params.prepareRenderedPlayer.mockImplementation(() => {
      const session = params.audioRenderLifecycle.start();
      return new Promise((resolve) => {
        resolvePlayer = (readyPlayer) => resolve(completePreparedPlayer(session, readyPlayer));
      });
    });
    const { result } = renderHook(() => usePlaybackControl(params as any));

    let pendingStart!: Promise<unknown>;
    act(() => {
      pendingStart = result.current.togglePlayPause();
    });

    expect(params.setIsPreparing).toHaveBeenCalledWith(true);
    expect(params.setIsPlaying).not.toHaveBeenCalledWith(true);
    expect(params.showPlayingNotification).not.toHaveBeenCalled();
    expect(engine.start).not.toHaveBeenCalled();

    await act(async () => {
      resolvePlayer(player);
      await pendingStart;
    });

    expect(engine.setPreRenderedAudio).toHaveBeenCalledWith(true);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(params.setIsPlaying).toHaveBeenCalledWith(true);
    expect(params.flushPlaybackVisuals).toHaveBeenCalledTimes(1);
    expect(params.flushPlaybackVisuals.mock.invocationCallOrder[0])
      .toBeGreaterThan(params.setIsPlaying.mock.invocationCallOrder.at(-1)!);
    expect(params.showPlayingNotification).toHaveBeenCalledTimes(1);
  });

  it("starts a preconfigured Note queue schedule without replacing it with Beat settings", async () => {
    const engine = makeEngine();
    const player = { ...mockPlayer, volume: 0.35 };
    const params = makePlaybackParams(engine, player);
    params.getPlaybackContext.mockReturnValue({
      bpm: 120,
      modeLabel: "Note",
      activityMode: "note",
      bpmSource: "global",
    });
    const { result } = renderHook(() => usePlaybackControl(params as any));

    let started = false;
    await act(async () => {
      started = await result.current.startConfiguredPlayback(true);
    });

    expect(started).toBe(true);
    expect(mockApplyDialConfigToEngine).not.toHaveBeenCalled();
    expect(engine.buildScheduleOnly).not.toHaveBeenCalled();
    expect(params.stopRenderedAudio).toHaveBeenCalledTimes(1);
    expect(params.stopRenderedAudio.mock.invocationCallOrder[0])
      .toBeLessThan(player.play.mock.invocationCallOrder[0]);
    expect(engine.requestStopAfterMeasure).toHaveBeenCalledTimes(1);
    expect(params.showPlayingNotification).toHaveBeenCalledWith(120, "Note", "en");
  });

  it("releases a stale Note queue player when a newer entry starts preparing", async () => {
    const engine = makeEngine();
    const stalePlayer = {
      ...mockPlayer,
      play: jest.fn(),
      pause: jest.fn(),
      release: jest.fn(),
    };
    const currentPlayer = {
      ...mockPlayer,
      play: jest.fn(),
      pause: jest.fn(),
      release: jest.fn(),
    };
    let resolveStale!: (player: typeof stalePlayer) => void;
    const params = makePlaybackParams(engine, null);
    params.prepareRenderedPlayer
      .mockImplementationOnce(() => {
        const session = params.audioRenderLifecycle.start();
        return new Promise((resolve) => {
          resolveStale = (readyPlayer) => resolve(completePreparedPlayer(session, readyPlayer));
        });
      })
      .mockImplementationOnce(async () =>
        completePreparedPlayer(params.audioRenderLifecycle.start(), currentPlayer));
    const { result } = renderHook(() => usePlaybackControl(params as any));

    let staleStart!: Promise<boolean>;
    act(() => {
      staleStart = result.current.startConfiguredPlayback(true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    let currentStart!: Promise<boolean>;
    act(() => {
      currentStart = result.current.startConfiguredPlayback(true);
    });
    await act(async () => {
      await currentStart;
      resolveStale(stalePlayer);
      await staleStart;
    });

    expect(currentPlayer.play).toHaveBeenCalledTimes(1);
    expect(stalePlayer.play).not.toHaveBeenCalled();
    expect(stalePlayer.pause).toHaveBeenCalledTimes(1);
    expect(stalePlayer.release).toHaveBeenCalledTimes(1);
  });

  it("cannot finish a configured Note queue start after the screen cancels preparation", async () => {
    const engine = makeEngine();
    const player = {
      ...mockPlayer,
      play: jest.fn(),
      pause: jest.fn(),
      release: jest.fn(),
    };
    let resolvePlayer!: (value: typeof mockPlayer) => void;
    const params = makePlaybackParams(engine, null);
    params.prepareRenderedPlayer.mockImplementationOnce(() => {
      const session = params.audioRenderLifecycle.start();
      return new Promise((resolve) => {
        resolvePlayer = (readyPlayer) => resolve(completePreparedPlayer(session, readyPlayer));
      });
    });
    const { result } = renderHook(() => usePlaybackControl(params as any));

    let pendingStart!: Promise<boolean>;
    act(() => {
      pendingStart = result.current.startConfiguredPlayback(true);
    });
    await act(async () => {
      await Promise.resolve();
      result.current.cancelPlaybackAttempt(false);
    });
    resolvePlayer(player);
    let started = true;
    await act(async () => {
      started = await pendingStart;
    });

    expect(started).toBe(false);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.release).toHaveBeenCalledTimes(1);
    expect(engine.start).not.toHaveBeenCalled();
    expect(params.isPreparingRef.current).toBe(false);
    expect(params.isPlayingRef.current).toBe(false);
  });

  it("cannot resume a pending native startup after playback control unmounts", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    const params = makePlaybackParams(engine, { ...mockPlayer });
    let resolveFocus!: () => void;
    params.notifyUserToggle.mockReturnValue(
      new Promise<void>((resolve) => { resolveFocus = resolve; }),
    );
    const { result, unmount } = renderHook(() => usePlaybackControl(params as any));

    let pendingStart!: Promise<boolean | void>;
    act(() => {
      pendingStart = result.current.togglePlayPause();
    });
    await act(async () => { await Promise.resolve(); });
    unmount();
    resolveFocus();
    let started: boolean | void = true;
    await act(async () => {
      started = await pendingStart;
    });

    expect(started).toBe(false);
    expect(engine.start).not.toHaveBeenCalled();
    expect(params.setIsPlaying).not.toHaveBeenCalledWith(true);
    expect(params.showPlayingNotification).not.toHaveBeenCalled();
  });

  it("releases configured Note playback ownership when the queue finishes", async () => {
    const engine = makeEngine();
    const player = { ...mockPlayer };
    const session = {
      resume: jest.fn(),
      updateBpm: jest.fn(),
      complete: jest.fn((..._args: any[]) => ({ duration: 0 })),
    };
    const params = makePlaybackParams(engine, player);
    params.loggingEnabled = true;
    (params.practiceSessionRef as any).current = session;
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.startConfiguredPlayback(true);
    });
    act(() => {
      result.current.stopMetronome("measure_complete");
    });

    expect(params.clearAudioWatchdogRef.current).toHaveBeenCalled();
    expect(params.stopRenderedAudio).toHaveBeenCalledTimes(2);
    expect(params.notifyVoicePlayState).toHaveBeenLastCalledWith(false);
    expect(params.isPlayingRef.current).toBe(false);
    expect(params.isPreparingRef.current).toBe(false);
    expect(params.practiceSessionRef.current).toBeNull();
    expect(session.complete.mock.calls[0][1]).toBe("measure_complete");
  });

  it("pauses the active practice session when configured Note playback is paused", async () => {
    const engine = makeEngine();
    const player = { ...mockPlayer };
    const session = {
      resume: jest.fn(),
      updateBpm: jest.fn(),
      pause: jest.fn(),
    };
    const params = makePlaybackParams(engine, player);
    (params.practiceSessionRef as any).current = session;
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.startConfiguredPlayback(true);
      await result.current.togglePlayPause();
    });

    expect(session.pause).toHaveBeenCalledTimes(1);
    expect(params.notifyVoicePlayState).toHaveBeenLastCalledWith(false);
    expect(params.clearAudioWatchdogRef.current).toHaveBeenCalled();
    expect(params.isPlayingRef.current).toBe(false);
  });

  it("releases a native player built after startup was cancelled before publication", async () => {
    const engine = makeEngine();
    const player = {
      ...mockPlayer,
      pause: jest.fn(),
      release: jest.fn(),
    };
    let resolvePlayer!: (value: typeof player) => void;
    const params = makePlaybackParams(engine, null);
    params.prepareRenderedPlayer.mockImplementation(() => {
      const session = params.audioRenderLifecycle.start();
      return new Promise((resolve) => {
        resolvePlayer = (readyPlayer) => resolve(completePreparedPlayer(session, readyPlayer));
      });
    });
    const { result } = renderHook(() => usePlaybackControl(params as any));

    let pendingStart!: Promise<unknown>;
    act(() => {
      pendingStart = result.current.togglePlayPause();
    });
    await act(async () => {
      await Promise.resolve();
      await result.current.togglePlayPause();
    });

    resolvePlayer(player);
    await act(async () => {
      await pendingStart;
    });

    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.release).toHaveBeenCalledTimes(1);
    expect(params.outputOwner.active()).toBeNull();
    expect(engine.start).not.toHaveBeenCalled();
  });

  it("rolls back and explains the failure when the first native play request rejects", async () => {
    const engine = makeEngine();
    const player = {
      ...mockPlayer,
      play: jest.fn().mockRejectedValue(new Error("decoder unavailable")),
    };
    const params = makePlaybackParams(engine, player as any);
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.stop).toHaveBeenCalled();
    expect(params.setIsPlaying).not.toHaveBeenCalledWith(true);
    expect(params.showPlayingNotification).not.toHaveBeenCalled();
    expect(params.showPlaybackStartFailure).toHaveBeenCalledTimes(1);
    expect(params.outputOwner.active()).toBeNull();
  });

  it("unmount cleanup releases rendered and note-sample players and cancels the watchdog", () => {
    jest.useFakeTimers();
    const engine = makeEngine();
    engine.start();
    const renderedPlayer = { ...mockPlayer, pause: jest.fn(), release: jest.fn() };
    const notePlayer = { ...mockPlayer, pause: jest.fn(), release: jest.fn() };
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: { current: {} },
      layerSoundSetsRef: { current: {} },
      noteSamplesRef: { current: sampleMap },
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
      noteSampleSoundsRef: { current: { "0-0": notePlayer } },
      renderGenerationRef: { current: 0 },
      isPlayingRef: { current: true },
      bpmRef: { current: 120 },
      t: (key: string) => key,
      showRecoveryToast: jest.fn(),
      persistAudioSettingsCallbackRef: { current: jest.fn() },
    } as any;
    const { result, unmount } = renderHook(() => useAudioPipeline(params));
    result.current.outputOwner.publish({
      isRunning: () => false,
      release: () => {
        renderedPlayer.pause();
        renderedPlayer.release();
      },
    });
    act(() => result.current.armAudioWatchdog());

    unmount();
    act(() => { jest.advanceTimersByTime(5000); });

    expect(renderedPlayer.pause).toHaveBeenCalledTimes(1);
    expect(renderedPlayer.release).toHaveBeenCalledTimes(1);
    expect(notePlayer.pause).toHaveBeenCalledTimes(1);
    expect(notePlayer.release).toHaveBeenCalledTimes(1);
    expect(releaseStereoArtifact).toHaveBeenCalledWith("0-0");
    expect(params.showRecoveryToast).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("permanently rejects a new render started through an escaped callback after unmount", async () => {
    const engine = makeEngine();
    const params = makePipelineParams(engine);
    const { result, unmount } = renderHook(() => useAudioPipeline(params as any));
    const escapedPrepare = result.current.prepareRenderedPlayer;

    unmount();
    const outcome = await escapedPrepare();

    expect(outcome.status).toBe("cancelled");
    expect(mockSaveRenderedWav).not.toHaveBeenCalled();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
  });

  it("complete playback stop clears rendered, sampled, realtime, watchdog, and blob ownership", () => {
    jest.useFakeTimers();
    (Platform as unknown as { OS: string }).OS = "web";
    const engine = makeEngine();
    engine.start();
    const renderedPlayer = { ...mockPlayer, pause: jest.fn(), release: jest.fn() };
    const notePlayer = { ...mockPlayer, pause: jest.fn(), release: jest.fn(), seekTo: jest.fn() };
    const renderedLoop = { stop: jest.fn(), isRunning: () => true };
    const realtimeSource = { cancel: jest.fn(), onEnded: jest.fn() };
    mockScheduleWebClickAt.mockReturnValueOnce(realtimeSource);
    const revokeObjectURL = jest.fn();
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: { current: {} },
      layerSoundSetsRef: { current: {} },
      noteSamplesRef: { current: sampleMap },
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
      webClickReadyRef: { current: true },
      noteSampleSoundsRef: { current: { "0-0": notePlayer } },
      renderGenerationRef: { current: 0 },
      isPlayingRef: { current: true },
      bpmRef: { current: 120 },
      t: (key: string) => key,
      showRecoveryToast: jest.fn(),
      persistAudioSettingsCallbackRef: { current: jest.fn() },
    } as any;
    const { result, unmount } = renderHook(() => useAudioPipeline(params));
    result.current.outputOwner.publish({
      release: () => {
        renderedPlayer.pause();
        renderedPlayer.release();
      },
    });
    result.current.outputOwner.publish({
      ...renderedLoop,
      release: () => {
        URL.revokeObjectURL("blob:https://example.test/rendered");
      },
    });
    result.current.samplePlayStateRef.current = {
      "0-0": { playing: true, endTimer: setTimeout(jest.fn(), 1000) },
    };
    act(() => result.current.armAudioWatchdog());
    expect(result.current.scheduleRealtimeWebClick("strong", "both", performance.now())).toBe(true);
    act(() => result.current.scheduleReRender());

    act(() => result.current.stopPlaybackAudio());
    engine.start();
    act(() => { jest.advanceTimersByTime(5000); });

    expect(renderedLoop.stop).toHaveBeenCalledTimes(1);
    expect(renderedPlayer.pause).toHaveBeenCalledTimes(1);
    expect(renderedPlayer.release).toHaveBeenCalledTimes(1);
    expect(notePlayer.pause).toHaveBeenCalledTimes(1);
    expect(notePlayer.release).not.toHaveBeenCalled();
    expect(result.current.samplePlayStateRef.current).toEqual({});
    expect(realtimeSource.cancel).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:https://example.test/rendered");
    expect(params.showRecoveryToast).not.toHaveBeenCalled();
    expect(mockRenderMeasure).not.toHaveBeenCalled();

    unmount();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
    jest.useRealTimers();
  });

  it("complete stop cancels a Note sample queued for the next timer turn", async () => {
    jest.useFakeTimers();
    (Platform as unknown as { OS: string }).OS = "ios";
    const engine = makeEngine();
    const player = {
      ...mockPlayer,
      play: jest.fn(),
      pause: jest.fn(),
      release: jest.fn(),
      seekTo: jest.fn().mockResolvedValue(undefined),
      duration: 1,
    };
    const params = makePipelineParams(engine, { "0-0": player });
    const { result, unmount } = renderHook(() => useAudioPipeline(params as any));

    expect(result.current.queueNoteSamplePlayback("0-0", player as any, 0, 500)).toBe(true);
    act(() => result.current.stopPlaybackAudio());
    const seekCallsAfterStop = player.seekTo.mock.calls.length;
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(player.seekTo).toHaveBeenCalledTimes(seekCallsAfterStop);
    expect(player.play).not.toHaveBeenCalled();
    unmount();
    jest.useRealTimers();
  });

  it("complete stop prevents Note sample play after a native seek resolves", async () => {
    jest.useFakeTimers();
    (Platform as unknown as { OS: string }).OS = "ios";
    const engine = makeEngine();
    let resolveSeek!: () => void;
    const seekPromise = new Promise<void>((resolve) => { resolveSeek = resolve; });
    const player = {
      ...mockPlayer,
      play: jest.fn(),
      pause: jest.fn(),
      release: jest.fn(),
      seekTo: jest.fn(() => seekPromise),
      duration: 1,
    };
    const params = makePipelineParams(engine, { "0-0": player });
    const { result, unmount } = renderHook(() => useAudioPipeline(params as any));

    result.current.queueNoteSamplePlayback("0-0", player as any, 0, 500);
    act(() => { jest.advanceTimersByTime(0); });
    expect(player.seekTo).toHaveBeenCalled();
    act(() => result.current.stopPlaybackAudio());
    await act(async () => {
      resolveSeek();
      await seekPromise;
      await Promise.resolve();
    });

    expect(player.play).not.toHaveBeenCalled();
    unmount();
    jest.useRealTimers();
  });

  it("releases an individual Note sample through pipeline ownership exactly once", async () => {
    jest.useFakeTimers();
    const engine = makeEngine();
    const notePlayer = { ...mockPlayer, pause: jest.fn(), release: jest.fn() };
    let resolveArtifact!: (value: { uri: string; changed: boolean }) => void;
    (syncStereoArtifact as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => { resolveArtifact = resolve; }),
    );
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: { current: {} },
      layerSoundSetsRef: { current: {} },
      noteSamplesRef: { current: sampleMap },
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
      noteSampleSoundsRef: { current: { "0-0": notePlayer } },
      renderGenerationRef: { current: 0 },
      isPlayingRef: { current: false },
      bpmRef: { current: 120 },
      t: (key: string) => key,
      showRecoveryToast: jest.fn(),
      persistAudioSettingsCallbackRef: { current: jest.fn() },
    } as any;
    const { result, unmount } = renderHook(() => useAudioPipeline(params));
    result.current.samplePlayStateRef.current = {
      "0-0": { playing: true, endTimer: setTimeout(jest.fn(), 1000) },
    };
    let pendingPreload!: Promise<void>;
    act(() => {
      pendingPreload = result.current.preloadNoteSampleSounds(sampleMap);
    });
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.releaseNoteSampleResource("0-0");
    });
    await act(async () => {
      resolveArtifact({ uri: "file:///stereo.wav", changed: true });
      await pendingPreload;
    });

    expect(notePlayer.pause).toHaveBeenCalledTimes(1);
    expect(notePlayer.release).toHaveBeenCalledTimes(1);
    expect(params.noteSampleSoundsRef.current).toEqual({});
    expect(result.current.samplePlayStateRef.current).toEqual({});
    expect(releaseStereoArtifact).toHaveBeenCalledWith("0-0");
    expect(releaseStereoArtifactIfCurrent).toHaveBeenCalledWith("0-0", "file:///stereo.wav");
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();

    unmount();
    expect(notePlayer.release).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("deleting one Note sample preserves another sample's end timer and next playback", async () => {
    jest.useFakeTimers();
    (Platform as unknown as { OS: string }).OS = "ios";
    const engine = makeEngine();
    const deletedPlayer = {
      ...mockPlayer,
      play: jest.fn(),
      pause: jest.fn(),
      release: jest.fn(),
      seekTo: jest.fn().mockResolvedValue(undefined),
      duration: 1,
    };
    const retainedPlayer = {
      ...mockPlayer,
      play: jest.fn(),
      pause: jest.fn(),
      release: jest.fn(),
      seekTo: jest.fn().mockResolvedValue(undefined),
      duration: 1,
    };
    const params = makePipelineParams(engine, {
      "0-0": deletedPlayer,
      "1-0": retainedPlayer,
    });
    const { result, unmount } = renderHook(() => useAudioPipeline(params as any));

    result.current.queueNoteSamplePlayback("1-0", retainedPlayer as any, 0, 100);
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(retainedPlayer.play).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.releaseNoteSampleResource("0-0");
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(result.current.samplePlayStateRef.current["1-0"]?.playing).toBe(false);
    expect(retainedPlayer.pause).toHaveBeenCalledTimes(2);
    expect(retainedPlayer.release).not.toHaveBeenCalled();

    result.current.queueNoteSamplePlayback("1-0", retainedPlayer as any, 0, 100);
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(retainedPlayer.play).toHaveBeenCalledTimes(2);

    unmount();
    jest.useRealTimers();
  });

  it("full app reset stops and releases audio ownership before clearing persisted state", () => {
    const source = require("node:fs").readFileSync("hooks/useMetronomeScreen.ts", "utf8") as string;
    const resetStart = source.indexOf("const handleResetApp = useCallback");
    const resetEnd = source.indexOf("\\n  const ", resetStart + 1);
    const resetBody = source.slice(resetStart, resetEnd);

    expect(resetBody).toContain("stopPlaybackAudio();");
    expect(resetBody).toContain("releaseNoteSampleResources(true);");
    expect(resetBody).toContain("isPreparingRef.current = false;");
    expect(resetBody).toContain("isPlayingRef.current = false;");
    expect(resetBody.indexOf("stopPlaybackAudio();"))
      .toBeLessThan(resetBody.indexOf("await clearAllAppStorage();"));
    expect(resetBody.indexOf("releaseNoteSampleResources(true);"))
      .toBeLessThan(resetBody.indexOf("noteSamplesRef.current = {};"));
    expect(resetBody).not.toMatch(/engine\\?\\.getIsRunning\\(\\)[\\s\\S]*engine\\.stop\\(\\)/);
  });

  it("releases only the owning artifact when overlapping preloads finish after unmount", async () => {
    let resolveOld!: (result: { uri: string; changed: boolean }) => void;
    let resolveNew!: (result: { uri: string; changed: boolean }) => void;
    (syncStereoArtifact as jest.Mock)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));

    const engine = makeEngine();
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: { current: {} },
      layerSoundSetsRef: { current: {} },
      noteSamplesRef: { current: sampleMap },
      noteSampleChannelsRef: { current: sampleChannels },
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
    const { result, unmount } = renderHook(() => useAudioPipeline(params));

    const oldPreload = result.current.preloadNoteSampleSounds({
      "0-0": "file:///old.wav",
    });
    await act(async () => { await Promise.resolve(); });
    const newPreload = result.current.preloadNoteSampleSounds({
      "0-0": "file:///new.wav",
    });
    await act(async () => { await Promise.resolve(); });

    unmount();
    resolveOld({ uri: "file:///old-stereo.wav", changed: true });
    resolveNew({ uri: "file:///new-stereo.wav", changed: true });
    await act(async () => {
      await Promise.all([oldPreload, newPreload]);
    });

    expect(releaseStereoArtifactIfCurrent).toHaveBeenCalledTimes(1);
    expect(releaseStereoArtifactIfCurrent).toHaveBeenCalledWith(
      "0-0",
      "file:///new-stereo.wav",
    );
    expect(releaseStereoArtifactIfCurrent).not.toHaveBeenCalledWith(
      "0-0",
      "file:///old-stereo.wav",
    );
  });

  it("cancels an in-flight Note sample preload before it can publish a player", async () => {
    let resolveArtifact!: (result: { uri: string; changed: boolean }) => void;
    (syncStereoArtifact as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => { resolveArtifact = resolve; }),
    );
    const engine = makeEngine();
    const params = {
      engineRef: { current: engine },
      soundSet: "classic",
      soundSetRef: { current: "classic" },
      customSoundSetsRef: { current: {} },
      layerSoundSetsRef: { current: {} },
      noteSamplesRef: { current: sampleMap },
      noteSampleChannelsRef: { current: sampleChannels },
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

    const preload = result.current.preloadNoteSampleSounds({
      "0-0": "file:///delayed.wav",
    });
    await act(async () => { await Promise.resolve(); });
    act(() => result.current.cancelNoteSamplePreload());
    resolveArtifact({ uri: "file:///delayed-stereo.wav", changed: true });
    await act(async () => { await preload; });

    expect(params.noteSampleSoundsRef.current).toEqual({});
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(releaseStereoArtifactIfCurrent).toHaveBeenCalledWith(
      "0-0",
      "file:///delayed-stereo.wav",
    );
  });

  it("keeps realtime startup in preparing until the first audio activity arrives", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    let confirmActivity!: (value: boolean) => void;
    const params = makePlaybackParams(engine, null);
    params.waitForFirstAudioActivity.mockImplementation(
      (_epoch: number) => new Promise((resolve) => { confirmActivity = resolve; }),
    );
    const { result } = renderHook(() => usePlaybackControl(params as any));

    let pendingStart!: Promise<unknown>;
    act(() => {
      pendingStart = result.current.togglePlayPause();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(params.setIsPreparing).toHaveBeenCalledWith(true);
    expect(params.setIsPlaying).not.toHaveBeenCalledWith(true);
    expect(params.showPlayingNotification).not.toHaveBeenCalled();

    await act(async () => {
      confirmActivity(true);
      await pendingStart;
    });

    expect(params.setIsPlaying).toHaveBeenCalledWith(true);
    expect(params.showPlayingNotification).toHaveBeenCalledTimes(1);
  });

  it("stops a realtime fallback engine when the user cancels during first-audio confirmation", async () => {
    (Platform as unknown as { OS: string }).OS = "ios";
    const engine = makeEngine();
    let confirmActivity!: (value: boolean) => void;
    let activityWaitStarted!: () => void;
    const activityWait = new Promise<void>((resolve) => {
      activityWaitStarted = resolve;
    });
    const params = makePlaybackParams(engine, null);
    params.waitForFirstAudioActivity.mockImplementation(
      (_epoch: number) => new Promise((resolve) => {
        confirmActivity = resolve;
        activityWaitStarted();
      }),
    );
    const { result } = renderHook(() => usePlaybackControl(params as any));

    let pendingStart!: Promise<unknown>;
    act(() => {
      pendingStart = result.current.togglePlayPause();
    });
    await act(async () => {
      await activityWait;
      await result.current.togglePlayPause();
    });

    expect(engine.stop).toHaveBeenCalled();
    expect(params.setIsPlaying).not.toHaveBeenCalledWith(true);
    expect(params.showPlayingNotification).not.toHaveBeenCalled();

    await act(async () => {
      confirmActivity(false);
      await pendingStart;
    });
    expect(params.showPlaybackStartFailure).not.toHaveBeenCalled();
  });

  it("invalidates pending native audio activity before pausing active playback", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    engine.start();
    const params = makePlaybackParams(engine, null);
    params.isPlaying = true;
    params.isPlayingRef.current = true;
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(params.invalidateAudioStartupProbe).toHaveBeenCalledTimes(1);
    expect(params.invalidateAudioStartupProbe.mock.invocationCallOrder[0])
      .toBeLessThan(engine.stop.mock.invocationCallOrder.at(-1)!);
    expect(params.setIsPlaying).toHaveBeenCalledWith(false);
  });

  it("returns to stopped state when realtime startup has no audio activity", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    const params = makePlaybackParams(engine, null);
    params.waitForFirstAudioActivity.mockResolvedValue(false);
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.stop).toHaveBeenCalled();
    expect(params.setIsPlaying).not.toHaveBeenCalledWith(true);
    expect(params.showPlaybackStartFailure).toHaveBeenCalledTimes(1);
  });

  it("does not treat an intentionally all-muted realtime schedule as startup failure", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    engine.getScheduleInfo.mockReturnValue({
      ticks: [{
        time: 0,
        type: "mute",
        beat: 0,
        subBeat: 0,
        repeatIteration: 0,
        barRepeatIteration: 0,
      }],
      durationMs: 500,
    });
    const params = makePlaybackParams(engine, null);
    params.noteSamplesRef.current = {} as typeof sampleMap;
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(params.waitForFirstAudioActivity).not.toHaveBeenCalled();
    expect(params.setIsPlaying).toHaveBeenCalledWith(true);
    expect(params.showPlaybackStartFailure).not.toHaveBeenCalled();
  });

  it("does not report a startup failure when the rendered player is superseded by another render, even while boosted", async () => {
    // Regression test: buildRenderedPlayer() collapsed "superseded by another
    // render" (aborted) and "genuinely failed to render" (failed) into the
    // same null, so a boosted/tone-shaped start racing an unrelated
    // stopRenderedAudio() call used to surface a false "startup failed" toast.
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    const params = makePlaybackParams(engine, null);
    params.volumeRef.current = 1.5; // boosted — old code always threw when player was null
    (params as any).prepareRenderedPlayer = jest.fn(async () => ({ status: "superseded" as const }));
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(params.showPlaybackStartFailure).not.toHaveBeenCalled();
    expect(engine.start).not.toHaveBeenCalled();
    expect(params.setIsPlaying).not.toHaveBeenCalledWith(true);
    // The stale attempt must still release isPreparing — a bare early return
    // without cleanup would leave the UI stuck showing "preparing" forever.
    expect(params.setIsPreparing).toHaveBeenCalledWith(false);
  });

  it("still reports a startup failure for a genuine render failure while boosted", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    const params = makePlaybackParams(engine, null);
    params.volumeRef.current = 1.5;
    (params as any).prepareRenderedPlayer = jest.fn(async () => ({
      status: "failed" as const,
      error: new Error("render failed"),
    }));
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(params.showPlaybackStartFailure).toHaveBeenCalledTimes(1);
    expect(engine.start).not.toHaveBeenCalled();
  });

  it("applies one deadline to Android focus preparation before audio startup", async () => {
    jest.useFakeTimers();
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    const params = makePlaybackParams(engine, null);
    params.notifyUserToggle.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePlaybackControl(params as any));

    let pendingStart!: Promise<unknown>;
    act(() => {
      pendingStart = result.current.togglePlayPause();
    });
    await act(async () => {
      jest.advanceTimersByTime(8001);
      await pendingStart;
    });

    expect(engine.start).not.toHaveBeenCalled();
    expect(params.setIsPlaying).not.toHaveBeenCalledWith(true);
    expect(params.showPlaybackStartFailure).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("uses a rendered loop for Android Beat mode so dense accent roles stay ordered", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    const player = { ...mockPlayer, volume: 0.35 };
    const params = makePlaybackParams(engine, player);
    params.barModeRef.current = false;
    const { result } = renderHook(() => usePlaybackControl(params as any));

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(params.prepareRenderedPlayer).toHaveBeenCalledTimes(1);
    expect(engine.setPreRenderedAudio).toHaveBeenCalledWith(true);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.play.mock.invocationCallOrder[0])
      .toBeLessThan(engine.start.mock.invocationCallOrder[0]);
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

    expect(params.prepareRenderedPlayer).toHaveBeenCalledTimes(1);
    expect(engine.setPreRenderedAudio).toHaveBeenCalledWith(true);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("configures immediate Bar playback only from the Bar-owned snapshot", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    const player = { ...mockPlayer, play: jest.fn() };
    const params = makePlaybackParams(engine, player);
    params.barModeRef.current = true;
    params.beatTypes = ["strong", "normal", "normal", "normal"];
    params.beatSubdivisions = {
      "0": ["strong", "normal"],
    };
    params.barConfigRef.current = {
      beatTypes: ["mute", "accent"],
      beatSubdivisions: {
        "1": ["accent", "normal", "normal"],
      },
      barRepeats: {
        1: { type: "count", value: 2 },
      },
      loopBlocks: [],
    };

    const { result } = renderHook(() => usePlaybackControl(params as any));
    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(engine.setBeatTypes).toHaveBeenCalledWith(["mute", "accent"]);
    expect(engine.setAllBeatSubdivisions).toHaveBeenCalledWith({
      "1": ["accent", "normal", "normal"],
    });
    expect(engine.setAllBeatSubdivisions).not.toHaveBeenCalledWith(
      params.beatSubdivisions,
    );
  });

  it("configures immediate Beat playback from dialConfigRef after leaving Bar", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const engine = makeEngine();
    const player = { ...mockPlayer, play: jest.fn() };
    const params = makePlaybackParams(engine, player);
    params.barModeRef.current = false;
    params.beatTypes = ["mute", "mute"];
    params.beatSubdivisions = {
      "0": ["mute", "mute"],
    };
    params.dialConfigRef.current = {
      beatsPerMeasure: 3,
      beatTypes: ["strong", "accent", "normal"],
      beatSubdivisions: {
        "2": ["normal", "accent", "normal"],
      },
    };

    const { result } = renderHook(() => usePlaybackControl(params as any));
    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(mockApplyDialConfigToEngine).toHaveBeenCalledWith(engine, {
      beatsPerMeasure: 3,
      beatTypes: ["strong", "accent", "normal"],
      beatSubdivisions: {
        "2": ["normal", "accent", "normal"],
      },
    });
    expect(mockApplyDialConfigToEngine).not.toHaveBeenCalledWith(
      engine,
      expect.objectContaining({ beatTypes: params.beatTypes }),
    );
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
      expect.any(Function),
      "both",
      0.35,
    );
  });

  it("prepares scheduled native playback before the target but starts at the target", async () => {
    jest.useFakeTimers();
    (Platform as unknown as { OS: string }).OS = "ios";
    const engine = makeEngine();
    const player = { ...mockPlayer, play: jest.fn() };
    const params = makePlaybackParams(engine, player);
    const { result } = renderHook(() => usePlaybackControl(params as any));
    const target = performance.now() + 5000;
    let pendingStart!: Promise<boolean | undefined>;

    act(() => {
      pendingStart = result.current.startScheduledMetronome(target);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(params.prepareRenderedPlayer).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
    expect(engine.start).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(4999);
      await Promise.resolve();
    });
    expect(player.play).not.toHaveBeenCalled();
    expect(engine.start).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await pendingStart;
    });
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(params.setIsPlaying).toHaveBeenLastCalledWith(true);
  });

  it("replaces already-playing audio when scheduled preparation begins", async () => {
    jest.useFakeTimers();
    (Platform as unknown as { OS: string }).OS = "ios";
    const engine = makeEngine();
    engine.start();
    engine.start.mockClear();
    const player = { ...mockPlayer, play: jest.fn() };
    const params = makePlaybackParams(engine, player);
    params.isPlayingRef.current = true;
    const { result } = renderHook(() => usePlaybackControl(params as any));
    const target = performance.now() + 5000;
    let pendingStart!: Promise<boolean | undefined>;

    act(() => {
      pendingStart = result.current.startScheduledMetronome(target);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(params.stopRenderedAudio).toHaveBeenCalled();
    expect(params.prepareRenderedPlayer).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await pendingStart;
    });

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(engine.start).toHaveBeenCalledTimes(1);
  });

  it("only cancels audio owned by an active scheduled start", async () => {
    jest.useFakeTimers();
    (Platform as unknown as { OS: string }).OS = "ios";
    const engine = makeEngine();
    const player = { ...mockPlayer, play: jest.fn() };
    const params = makePlaybackParams(engine, player);
    params.isPlayingRef.current = true;
    const { result } = renderHook(() => usePlaybackControl(params as any));

    act(() => {
      result.current.cancelScheduledMetronome();
    });
    expect(engine.stop).not.toHaveBeenCalled();
    expect(params.setIsPlaying).not.toHaveBeenCalled();

    params.isPlayingRef.current = false;
    const target = performance.now() + 5000;
    let pendingStart!: Promise<boolean | undefined>;
    act(() => {
      pendingStart = result.current.startScheduledMetronome(target);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.cancelScheduledMetronome();
      jest.advanceTimersByTime(5000);
    });
    await act(async () => {
      await pendingStart;
    });

    expect(player.play).not.toHaveBeenCalled();
    expect(engine.start).not.toHaveBeenCalled();
    expect(params.setIsPreparing).toHaveBeenLastCalledWith(false);
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
    let resolveSampleLoad!: (value: typeof samplePCMs) => void;
    let markSampleLoadEntered!: () => void;
    const sampleLoadEntered = new Promise<void>((resolve) => {
      markSampleLoadEntered = resolve;
    });
    const playbackParams = makePlaybackParams(engine, null);
    playbackParams.soundSetRef.current = "custom1";
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
    playbackParams.audioRenderLifecycle.cancel();
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

function completePreparedPlayer(session: any, player: any) {
  return session.complete(
    {
      player,
      uri: "file:///rendered.wav",
      stop: () => player.pause(),
      release: () => player.release(),
      isRunning: () => true,
      playAndConfirm: async () => {
        await player.play();
        return true;
      },
    },
    (output: { stop: () => void; release: () => void }) => {
      output.stop();
      output.release();
    },
  );
}

function makePlaybackParams(engine: ReturnType<typeof makeEngine>, player: typeof mockPlayer | null) {
  const audioRenderLifecycle = createAudioRenderLifecycle();
  const outputOwner = createAudioOutputOwner();
  const stopRenderedAudio = jest.fn(() => {
    audioRenderLifecycle.cancel();
    outputOwner.stop();
  });
  const clearSamplePlayStates = jest.fn();
  const invalidateAudioStartupProbe = jest.fn();
  const clearAudioWatchdog = jest.fn();
  const stopPlaybackAudio = jest.fn(() => {
    invalidateAudioStartupProbe();
    clearAudioWatchdog();
    engine.stop();
    stopRenderedAudio();
    clearSamplePlayStates();
  });
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
    beatTypes: ["strong", "accent", "normal", "mute"],
    beatSubdivisions: {},
    subdivisionPattern: [],
    barConfigRef: { current: {} },
    dialConfigRef: {
      current: {
        beatsPerMeasure: 4,
        beatTypes: ["strong", "normal", "normal", "normal"],
        beatSubdivisions: {},
      },
    },
    barStartBeatRef: { current: null },
    barLoopModeRef: { current: "loop" },
    blockPlayModeRef: { current: "sequential" },
    beatDenominatorRef: { current: 4 },
    stopRenderedAudio,
    stopPlaybackAudio,
    clearSamplePlayStates,
    resetPlaybackVisuals: jest.fn(),
    flushPlaybackVisuals: jest.fn(),
    outputOwner,
    beginAudioStartupProbe: jest.fn(() => 1),
    invalidateAudioStartupProbe,
    waitForFirstAudioActivity: jest.fn(async (_epoch: number) => true),
    audioRenderLifecycle,
    prepareRenderedPlayer: jest.fn(async () => {
      const session = audioRenderLifecycle.start();
      return player
        ? completePreparedPlayer(session, player)
        : session.fail(new Error("render failed"));
    }),
    clearAudioWatchdogRef: { current: clearAudioWatchdog },
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
    showPlaybackStartFailure: jest.fn(),
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

function makePipelineParams(
  engine: ReturnType<typeof makeEngine>,
  noteSampleSounds: Record<string, any> = {},
) {
  return {
    engineRef: { current: engine },
    soundSet: "classic",
    soundSetRef: { current: "classic" },
    customSoundSetsRef: { current: {} },
    layerSoundSetsRef: { current: {} },
    noteSamplesRef: { current: sampleMap },
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
    noteSampleSoundsRef: { current: noteSampleSounds },
    renderGenerationRef: { current: 0 },
    isPlayingRef: { current: true },
    bpmRef: { current: 120 },
    t: (key: string) => key,
    showRecoveryToast: jest.fn(),
    persistAudioSettingsCallbackRef: { current: jest.fn() },
  };
}
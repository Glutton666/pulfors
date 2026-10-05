/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { fireEvent, render } from "@testing-library/react";
import React, { useRef, useState } from "react";
import { Platform } from "react-native";
import { useTonePreview } from "@/hooks/useTonePreview";
import { SoundPreviewPlayers, type SoundPreviewHandle } from "@/components/settings/SoundPreviewPlayers";

const mockSave = jest.fn();
const mockRelease = jest.fn();
const mockCreate = jest.fn();
const mockContext = {
  state: "running", destination: {},
  resume: jest.fn().mockResolvedValue(undefined),
  createBuffer: jest.fn((_channels, length) => ({ getChannelData: () => new Float32Array(length) })),
  createBufferSource: jest.fn(),
  createGain: jest.fn(),
};
jest.mock("@/lib/audio-renderer", () => ({
  getWebAudioContext: () => mockContext,
  saveRenderedWav: (...args: any[]) => mockSave(...args),
  releaseRenderedWav: (...args: any[]) => mockRelease(...args),
}));
jest.mock("expo-audio", () => ({
  createAudioPlayer: (...args: any[]) => mockCreate(...args),
  useAudioPlayer: jest.fn(() => ({ seekTo: jest.fn(), play: jest.fn() })),
}));
jest.mock("@/lib/metronome-engine", () => ({
  soundSets: Object.fromEntries(
    ["classic", "tempo", "woodblock", "cowbell", "digital", "jamblock", "sine", "blip", "clave", "cajon", "marimba", "stick"]
      .map(set => [set, { strong: 1, high: 2, low: 3 }]),
  ),
}));
jest.mock("@/lib/logger", () => ({ logger: { warn: jest.fn() } }));
const prepared = { pcm: new Float32Array([0.1, -0.2]), outputGain: 0.4 };
const deferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(r => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockContext.state = "running";
  mockSave.mockResolvedValue("file:///preview.wav");
  mockCreate.mockImplementation(() => ({
    isLoaded: true, duration: 0.01, volume: 1,
    seekTo: jest.fn().mockResolvedValue(undefined), play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
  }));
  mockContext.createBufferSource.mockImplementation(() => ({
    buffer: null, onended: null, connect: jest.fn(), start: jest.fn(), stop: jest.fn(), disconnect: jest.fn(),
  }));
  mockContext.createGain.mockImplementation(() => ({ gain: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() }));
});

test("late web preparation cannot overwrite a newer request, and tone changes stop output", async () => {
  Platform.OS = "web";
  const first = deferred();
  const prepare = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue(prepared);
  const hook = renderHook(({ identity }) => useTonePreview(prepare, identity), { initialProps: { identity: "old" } });
  let old!: Promise<void>;
  await act(async () => {
    old = hook.result.current.play("classic", 0);
    await hook.result.current.play("classic", 1);
  });
  expect(prepare.mock.calls[0][2].aborted).toBe(true);
  expect(mockContext.createBufferSource).toHaveBeenCalledTimes(1);
  expect(mockContext.createGain.mock.results[0].value.gain.value).toBe(0.4);
  await act(async () => { first.resolve(prepared); await old; });
  expect(mockContext.createBufferSource).toHaveBeenCalledTimes(1);
  hook.rerender({ identity: "new-position" });
  expect(mockContext.createBufferSource.mock.results[0].value.stop).toHaveBeenCalledTimes(1);
});

test("closing while native WAV preparation finishes releases it without creating a player", async () => {
  Platform.OS = "ios";
  const saved = deferred();
  mockSave.mockReturnValue(saved.promise);
  const prepare = jest.fn().mockResolvedValue(prepared);
  const hook = renderHook(() => useTonePreview(prepare, "tone"));
  let playing!: Promise<void>;
  await act(async () => { playing = hook.result.current.play("classic", 0); });
  hook.unmount();
  await act(async () => { saved.resolve("file:///late.wav"); await playing; });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockRelease).toHaveBeenCalledWith("file:///late.wav");
});

test("a delayed native seek cannot play after unmount and resources are released", async () => {
  Platform.OS = "android";
  const seek = deferred();
  const player = { isLoaded: true, duration: 0.1, volume: 1, seekTo: jest.fn(() => seek.promise), play: jest.fn(), pause: jest.fn(), remove: jest.fn() };
  mockCreate.mockReturnValue(player);
  const prepare = jest.fn().mockResolvedValue(prepared);
  const hook = renderHook(() => useTonePreview(prepare, "tone"));
  let playing!: Promise<void>;
  await act(async () => { playing = hook.result.current.play("classic", 0); });
  hook.unmount();
  await act(async () => { seek.resolve(undefined); await playing; });
  expect(player.play).not.toHaveBeenCalled();
  expect(player.remove).toHaveBeenCalledTimes(1);
  expect(mockRelease).toHaveBeenCalledTimes(1);
});

test("native output uses captured volume, stops on identity change, and uses unique WAV names", async () => {
  Platform.OS = "android";
  const prepare = jest.fn().mockResolvedValue(prepared);
  const hook = renderHook(({ identity }) => useTonePreview(prepare, identity), { initialProps: { identity: "tone" } });
  await act(async () => { await hook.result.current.play("classic", 0); });
  const first = mockCreate.mock.results[0].value;
  expect(first.volume).toBe(0.4);
  expect(first.play).toHaveBeenCalledTimes(1);
  hook.rerender({ identity: "neutral" });
  expect(first.remove).toHaveBeenCalledTimes(1);
  await act(async () => { await hook.result.current.play("classic", 0); });
  expect(mockSave.mock.calls[0][1]).not.toBe(mockSave.mock.calls[1][1]);
  hook.unmount();
});

test("Android short clicks keep their PCM intact and release on real completion, not an early duration timer", async () => {
  Platform.OS = "android";
  jest.useFakeTimers();
  let status!: (value: { didJustFinish: boolean }) => void;
  const subscription = { remove: jest.fn() };
  const player = {
    isLoaded: true, duration: 0.35, volume: 1,
    seekTo: jest.fn().mockResolvedValue(undefined), play: jest.fn(),
    pause: jest.fn(), remove: jest.fn(),
    addListener: jest.fn((_event, callback) => { status = callback; return subscription; }),
  };
  mockCreate.mockReturnValue(player);
  const prepare = jest.fn().mockResolvedValue(prepared);
  const hook = renderHook(() => useTonePreview(prepare, "android-click"));
  try {
    await act(async () => { await hook.result.current.play("tempo", 0); });
    const written: Float32Array = mockSave.mock.calls[0][0];
    expect(written.length).toBe(4410 + prepared.pcm.length + 11025);
    expect(written.slice(0, 4410).every(sample => sample === 0)).toBe(true);
    expect(Array.from(written.slice(4410, 4410 + prepared.pcm.length))).toEqual(Array.from(prepared.pcm));
    expect(mockCreate).toHaveBeenCalledWith(
      { uri: "file:///preview.wav" }, { updateInterval: 50, keepAudioSessionActive: true },
    );
    await act(async () => { await jest.advanceTimersByTimeAsync(200); });
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.remove).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
    act(() => { status({ didJustFinish: true }); status({ didJustFinish: true }); });
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(subscription.remove).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  } finally {
    hook.unmount();
    jest.useRealTimers();
  }
});

test("Android metadata duration alone cannot start an unbuffered preview", async () => {
  Platform.OS = "android";
  jest.useFakeTimers();
  const player = {
    isLoaded: false, duration: 0.35, volume: 1,
    seekTo: jest.fn().mockResolvedValue(undefined), play: jest.fn(),
    pause: jest.fn(), remove: jest.fn(),
  };
  mockCreate.mockReturnValue(player);
  const prepare = jest.fn().mockResolvedValue(prepared);
  const hook = renderHook(() => useTonePreview(prepare, "loading"));
  let playing!: Promise<void>;
  try {
    await act(async () => { playing = hook.result.current.play("classic", 0); });
    await act(async () => { await jest.advanceTimersByTimeAsync(180); });
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    player.isLoaded = true;
    await act(async () => { await jest.advanceTimersByTimeAsync(30); await playing; });
    expect(player.play).toHaveBeenCalledTimes(1);
  } finally {
    hook.unmount();
    jest.useRealTimers();
  }
});

test("settings previews do not preload thirty-six native players before a click", async () => {
  Platform.OS = "android";
  const handle = React.createRef<SoundPreviewHandle>();
  const view = render(React.createElement(SoundPreviewPlayers, {
    ref: handle, customSoundSets: {}, prepareTonePreview: jest.fn().mockResolvedValue(prepared), toneIdentity: "classic",
  }));
  expect(jest.requireMock("expo-audio").useAudioPlayer).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
  await act(async () => { handle.current!.playSoundPreview("classic"); });
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockCreate.mock.results[0].value.play).toHaveBeenCalledTimes(1);
  view.unmount();
});

test("selecting a different sound and previewing in the same event survives identity invalidation", async () => {
  Platform.OS = "web";
  mockContext.state = "suspended";
  const latest = { identity: "classic:neutral" };
  const prepare = jest.fn(async (_set: string, _role: number, _signal: AbortSignal) => {
    expect(latest.identity).toBe("woodblock:diagonal");
    return prepared;
  });
  function Harness() {
    const handle = useRef<SoundPreviewHandle>(null);
    const [identity, setIdentity] = useState(latest.identity);
    return React.createElement(React.Fragment, null,
      React.createElement("button", { onClick: () => {
        latest.identity = "woodblock:diagonal";
        setIdentity(latest.identity);
        handle.current!.playSoundPreview("woodblock");
        expect(mockContext.resume).toHaveBeenCalled();
        expect(prepare).not.toHaveBeenCalled();
      } }, "Select and preview"),
      React.createElement(SoundPreviewPlayers, {
        ref: handle, customSoundSets: {}, prepareTonePreview: prepare, toneIdentity: identity,
      }),
    );
  }
  const view = render(React.createElement(Harness));
  await act(async () => { fireEvent.click(view.getByText("Select and preview")); });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(prepare.mock.calls[0][2].aborted).toBe(false);
  expect(mockContext.createBufferSource.mock.results[0].value.start).toHaveBeenCalledTimes(1);
  view.unmount();
});

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
  useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn() }),
}));
jest.mock("@/lib/metronome-engine", () => ({
  soundSets: Object.fromEntries(
    ["classic", "woodblock", "cowbell", "digital", "jamblock", "sine", "blip", "clave", "cajon", "marimba", "stick"]
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

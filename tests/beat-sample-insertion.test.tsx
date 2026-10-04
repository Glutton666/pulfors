/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { useNoteSamples } from "../hooks/useNoteSamples";
import { useBeatSampleInsertion } from "../hooks/useBeatSampleInsertion";
import { createInitialDialConfig } from "../lib/bar-config-helpers";
import * as storage from "../lib/note-samples";

jest.mock("@/lib/note-samples", () => ({
  saveNoteSamples: jest.fn().mockResolvedValue(undefined),
  saveNoteSampleNames: jest.fn().mockResolvedValue(undefined),
  saveNoteSampleSources: jest.fn().mockResolvedValue(undefined),
  saveNoteSampleChannels: jest.fn().mockResolvedValue(undefined),
  saveNoteSampleVolumes: jest.fn().mockResolvedValue(undefined),
  saveNoteSampleSpeeds: jest.fn().mockResolvedValue(undefined),
  saveNoteSampleMetroChannels: jest.fn().mockResolvedValue(undefined),
}));

test("insertion moves live state, refs, dial snapshot and all seven persisted metadata maps", () => {
  const dialConfigRef = { current: createInitialDialConfig() };
  const metroChannelsRef = { current: { "2-0": "right" } as storage.NoteSampleMetroChannelMap };
  const setMetroChannels = jest.fn();
  const releaseResources = jest.fn();
  const hook = renderHook(() => {
    const samples = useNoteSamples();
    const insert = useBeatSampleInsertion({ samples, dialConfigRef, metroChannelsRef, setMetroChannels, releaseResources });
    return { samples, insert };
  });
  act(() => hook.result.current.samples.replaceAll({
    samples: { "0-0": "keep.wav", "2-0": "a.wav", "2-0~1": "b.wav", "3-8~2": "c.wav" },
    names: { "2-0": "a", "3-8~2": "c" },
    sources: { "2-0": "recording" },
    channels: { "2-0": "left" },
    volumes: { "2-0": 0.4 },
    speeds: { "2-0": 1.5 },
  }));
  act(() => hook.result.current.insert(2));
  const { samples } = hook.result.current;
  expect(samples.samples).toEqual({ "0-0": "keep.wav", "3-0": "a.wav", "3-0~1": "b.wav", "4-8~2": "c.wav" });
  expect(samples.samplesRef.current).toBe(samples.samples);
  expect(samples.names).toEqual({ "3-0": "a", "4-8~2": "c" });
  expect(samples.sources).toEqual({ "3-0": "recording" });
  expect(samples.channels).toEqual({ "3-0": "left" });
  expect(samples.volumes).toEqual({ "3-0": 0.4 });
  expect(samples.speeds).toEqual({ "3-0": 1.5 });
  expect(dialConfigRef.current.noteSamples).toBe(samples.samples);
  expect(dialConfigRef.current.noteSampleNames).toBe(samples.names);
  expect(dialConfigRef.current.noteSampleSources).toBe(samples.sources);
  expect(dialConfigRef.current.noteSampleChannels).toBe(samples.channels);
  expect(dialConfigRef.current.noteSampleVolumes).toBe(samples.volumes);
  expect(dialConfigRef.current.noteSampleSpeeds).toBe(samples.speeds);
  expect(metroChannelsRef.current).toEqual({ "3-0": "right" });
  expect(setMetroChannels).toHaveBeenCalledWith({ "3-0": "right" });
  expect(storage.saveNoteSamples).toHaveBeenCalledWith(samples.samples);
  expect(storage.saveNoteSampleNames).toHaveBeenCalledWith(samples.names);
  expect(storage.saveNoteSampleSources).toHaveBeenCalledWith(samples.sources);
  expect(storage.saveNoteSampleChannels).toHaveBeenCalledWith(samples.channels);
  expect(storage.saveNoteSampleVolumes).toHaveBeenCalledWith(samples.volumes);
  expect(storage.saveNoteSampleSpeeds).toHaveBeenCalledWith(samples.speeds);
  expect(storage.saveNoteSampleMetroChannels).toHaveBeenCalledWith({ "3-0": "right" });
  expect(releaseResources).toHaveBeenCalledTimes(1);
});
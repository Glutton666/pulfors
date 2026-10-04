import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { DialConfig } from "@/lib/bar-config-helpers";
import type { NoteSamplesHook } from "./useNoteSamples";
import {
  saveNoteSamples, saveNoteSampleNames, saveNoteSampleSources, saveNoteSampleChannels,
  saveNoteSampleVolumes, saveNoteSampleSpeeds, saveNoteSampleMetroChannels,
  type NoteSampleMetroChannelMap,
} from "@/lib/note-samples";
import { shiftSampleBeatKeys } from "@/lib/circular-beat-insertion";

/** Move all live sample metadata together, before the engine/UI publishes the inserted beat. */
export function useBeatSampleInsertion({
  samples, dialConfigRef, metroChannelsRef, setMetroChannels, releaseResources,
}: {
  samples: NoteSamplesHook;
  dialConfigRef: RefObject<DialConfig>;
  metroChannelsRef: RefObject<NoteSampleMetroChannelMap>;
  setMetroChannels: Dispatch<SetStateAction<NoteSampleMetroChannelMap>>;
  releaseResources: () => void;
}) {
  const { samplesRef, namesRef, sourcesRef, channelsRef, volumesRef, speedsRef, replaceAll } = samples;
  return useCallback((insertAt: number) => {
    // Invalidate pending preloads and old key-owned players before re-keying.
    releaseResources();
    const next = {
      samples: shiftSampleBeatKeys(samplesRef.current, insertAt),
      names: shiftSampleBeatKeys(namesRef.current, insertAt),
      sources: shiftSampleBeatKeys(sourcesRef.current, insertAt),
      channels: shiftSampleBeatKeys(channelsRef.current, insertAt),
      volumes: shiftSampleBeatKeys(volumesRef.current, insertAt),
      speeds: shiftSampleBeatKeys(speedsRef.current, insertAt),
    };
    replaceAll(next);
    Object.assign(dialConfigRef.current, {
      noteSamples: next.samples, noteSampleNames: next.names, noteSampleSources: next.sources,
      noteSampleChannels: next.channels, noteSampleVolumes: next.volumes, noteSampleSpeeds: next.speeds,
    });
    const metroChannels = shiftSampleBeatKeys(metroChannelsRef.current, insertAt);
    metroChannelsRef.current = metroChannels;
    setMetroChannels(metroChannels);
    // These writers own retries and publish failures to the existing storage banner.
    void saveNoteSamples(next.samples);
    void saveNoteSampleNames(next.names);
    void saveNoteSampleSources(next.sources);
    void saveNoteSampleChannels(next.channels);
    void saveNoteSampleVolumes(next.volumes);
    void saveNoteSampleSpeeds(next.speeds);
    void saveNoteSampleMetroChannels(metroChannels);
  }, [samplesRef, namesRef, sourcesRef, channelsRef, volumesRef, speedsRef, replaceAll,
    dialConfigRef, metroChannelsRef, setMetroChannels, releaseResources]);
}
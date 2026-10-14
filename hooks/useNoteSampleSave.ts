import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { captureBreadcrumb } from "@/lib/error-tracking";
import type { BarConfig, DialConfig } from "@/lib/bar-config-helpers";
import type { NoteSampleMetroChannelMap, SampleSource } from "@/lib/note-samples";
import {
  saveNoteSampleChannels,
  saveNoteSampleNames,
  saveNoteSampleSources,
  saveNoteSampleSpeeds,
  saveNoteSampleVolumes,
  saveNoteSamplesDurably,
  setNoteSampleMetroChannel,
} from "@/lib/note-samples";
import type { SampleChannel, MetroChannel } from "@/lib/stereo-channel";
import type { NoteSamplesHook } from "@/hooks/useNoteSamples";

type RecorderTarget = { beat: number; sub: number; slot?: 0 | 1 | 2 };

interface Params {
  recorderTarget: RecorderTarget | null;
  barModeRef: MutableRefObject<boolean>;
  barConfigRef: MutableRefObject<BarConfig>;
  dialConfigRef: MutableRefObject<DialConfig>;
  noteSamples: NoteSamplesHook;
  noteSampleMetroChannelsRef: MutableRefObject<NoteSampleMetroChannelMap>;
  setNoteSampleMetroChannels: Dispatch<SetStateAction<NoteSampleMetroChannelMap>>;
  setRecorderTarget: Dispatch<SetStateAction<RecorderTarget | null>>;
  invalidateSamplePCMCache: (key?: string) => void;
  preloadNoteSampleSounds: (samples: Record<string, string>, keepExisting?: boolean) => Promise<void>;
  scheduleReRender: () => void;
}

export function useNoteSampleSave({
  recorderTarget,
  barModeRef,
  barConfigRef,
  dialConfigRef,
  noteSamples,
  noteSampleMetroChannelsRef,
  setNoteSampleMetroChannels,
  setRecorderTarget,
  invalidateSamplePCMCache,
  preloadNoteSampleSounds,
  scheduleReRender,
}: Params) {
  const {
    samplesRef, setSamplesAll,
    namesRef, setNamesAll,
    sourcesRef, setSourcesAll,
    channelsRef, setChannelsAll,
    volumesRef, setVolumesAll,
    speedsRef, setSpeedsAll,
  } = noteSamples;

  return useCallback(async (
    uri: string,
    name: string,
    source: SampleSource,
    channel: SampleChannel,
    metronomeChannel: MetroChannel,
    sampleGain = 1,
    sampleSpeed = 1,
    onDurablySaved?: (saved: boolean) => void,
  ) => {
    if (!recorderTarget) return false;
    const targetConfig = barModeRef.current ? barConfigRef.current : dialConfigRef.current;
    const baseKey = `${recorderTarget.beat}-${recorderTarget.sub}`;
    const key = recorderTarget.slot ? `${baseKey}~${recorderTarget.slot}` : baseKey;
    invalidateSamplePCMCache(key);

    const updated = { ...samplesRef.current, [key]: uri };
    const sampleMapSaved = await saveNoteSamplesDurably(updated);
    onDurablySaved?.(sampleMapSaved);
    if (!sampleMapSaved) return false;
    setSamplesAll(updated);

    const updatedNames = { ...namesRef.current, [key]: name };
    await saveNoteSampleNames(updatedNames);
    setNamesAll(updatedNames);
    const updatedSources = { ...sourcesRef.current, [key]: source };
    await saveNoteSampleSources(updatedSources);
    setSourcesAll(updatedSources);
    const updatedChannels = { ...channelsRef.current };
    if (channel === "both") delete updatedChannels[key]; else updatedChannels[key] = channel;
    await saveNoteSampleChannels(updatedChannels);
    setChannelsAll(updatedChannels);
    const updatedVolumes = { ...volumesRef.current, [key]: Math.max(0, Math.min(1, sampleGain)) };
    await saveNoteSampleVolumes(updatedVolumes);
    setVolumesAll(updatedVolumes);
    const updatedSpeeds = { ...speedsRef.current, [key]: Math.max(0.5, Math.min(2, sampleSpeed)) };
    await saveNoteSampleSpeeds(updatedSpeeds);
    setSpeedsAll(updatedSpeeds);

    Object.assign(targetConfig, {
      noteSamples: { ...updated },
      noteSampleNames: { ...updatedNames },
      noteSampleSources: { ...updatedSources },
      noteSampleChannels: { ...updatedChannels },
      noteSampleVolumes: { ...updatedVolumes },
      noteSampleSpeeds: { ...updatedSpeeds },
    });
    const updatedMetroChannels = await setNoteSampleMetroChannel(
      recorderTarget.beat,
      metronomeChannel,
      noteSampleMetroChannelsRef.current,
    );
    setNoteSampleMetroChannels(updatedMetroChannels);
    noteSampleMetroChannelsRef.current = updatedMetroChannels;
    if (barModeRef.current) barConfigRef.current.noteSampleMetroChannels = { ...updatedMetroChannels };
    try {
      await preloadNoteSampleSounds(updated, true);
    } catch (error) {
      captureBreadcrumb({ category: "sample.preload", message: "Saved sample preload failed", level: "warning", data: { error: String(error) } });
    }
    scheduleReRender();
    setRecorderTarget(null);
    return true;
  }, [
    recorderTarget, barModeRef, barConfigRef, dialConfigRef,
    samplesRef, setSamplesAll, namesRef, setNamesAll, sourcesRef, setSourcesAll,
    channelsRef, setChannelsAll, volumesRef, setVolumesAll, speedsRef, setSpeedsAll,
    noteSampleMetroChannelsRef, setNoteSampleMetroChannels, setRecorderTarget,
    invalidateSamplePCMCache, preloadNoteSampleSounds, scheduleReRender,
  ]);
}

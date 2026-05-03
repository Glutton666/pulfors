import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeSampleChannel, type SampleChannel } from "./stereo-channel";

const STORAGE_KEY = "@note_samples";
const NAMES_STORAGE_KEY = "@note_sample_names";
const SOURCES_STORAGE_KEY = "@note_sample_sources";
const CHANNELS_STORAGE_KEY = "@note_sample_channels";

/**
 * Per-storage-key serialized writer.
 *
 * 빠른 연속 호출이 일어나도 마지막에 들어온 값이 결정적으로 디스크에 남도록
 * AsyncStorage.setItem 호출을 직렬화한다. 진행 중인 write 동안 들어온 호출은
 * 마지막 값으로 합쳐져(last-write-wins) 한 번만 추가 write가 발생한다.
 *
 * 호출자가 await한 Promise는 자기 값 또는 자기 이후의 값이 디스크에 기록된
 * 시점에 resolve된다.
 */
function createSerializedWriter<T>(
  key: string,
): (value: T) => Promise<void> {
  let pendingValue: T | undefined;
  let hasPending = false;
  let pendingResolvers: Array<() => void> = [];
  let pendingRejecters: Array<(e: unknown) => void> = [];
  let running = false;

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (hasPending) {
        const value = pendingValue as T;
        const resolvers = pendingResolvers;
        const rejecters = pendingRejecters;
        hasPending = false;
        pendingValue = undefined;
        pendingResolvers = [];
        pendingRejecters = [];
        try {
          await AsyncStorage.setItem(key, JSON.stringify(value));
          for (const r of resolvers) r();
        } catch (e) {
          for (const r of rejecters) r(e);
        }
      }
    } finally {
      running = false;
    }
  }

  return (value: T) =>
    new Promise<void>((resolve, reject) => {
      pendingValue = value;
      hasPending = true;
      pendingResolvers.push(resolve);
      pendingRejecters.push(reject);
      void drain();
    });
}

const samplesWriter = createSerializedWriter<NoteSampleMap>(STORAGE_KEY);
const namesWriter = createSerializedWriter<NoteSampleNameMap>(NAMES_STORAGE_KEY);
const sourcesWriter = createSerializedWriter<NoteSampleSourceMap>(SOURCES_STORAGE_KEY);
const channelsWriter = createSerializedWriter<NoteSampleChannelMap>(CHANNELS_STORAGE_KEY);

export type NoteSampleMap = Record<string, string>;
export type NoteSampleNameMap = Record<string, string>;
export type SampleSource = "recording" | "import";
export type NoteSampleSourceMap = Record<string, SampleSource>;
export type NoteSampleChannelMap = Record<string, SampleChannel>;

function sampleKey(beatIndex: number, subIndex: number): string {
  return `${beatIndex}-${subIndex}`;
}

export async function loadNoteSamples(): Promise<NoteSampleMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export async function saveNoteSamples(samples: NoteSampleMap): Promise<void> {
  try {
    await samplesWriter(samples);
  } catch {}
}

export async function loadNoteSampleNames(): Promise<NoteSampleNameMap> {
  try {
    const raw = await AsyncStorage.getItem(NAMES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export async function saveNoteSampleNames(names: NoteSampleNameMap): Promise<void> {
  try {
    await namesWriter(names);
  } catch {}
}

export async function loadNoteSampleSources(): Promise<NoteSampleSourceMap> {
  try {
    const raw = await AsyncStorage.getItem(SOURCES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export async function saveNoteSampleSources(sources: NoteSampleSourceMap): Promise<void> {
  try {
    await sourcesWriter(sources);
  } catch {}
}

export async function setNoteSampleSource(
  beatIndex: number,
  subIndex: number,
  source: SampleSource,
  existing: NoteSampleSourceMap
): Promise<NoteSampleSourceMap> {
  const updated = { ...existing, [sampleKey(beatIndex, subIndex)]: source };
  await saveNoteSampleSources(updated);
  return updated;
}

export async function removeNoteSampleSource(
  beatIndex: number,
  subIndex: number,
  existing: NoteSampleSourceMap
): Promise<NoteSampleSourceMap> {
  const key = sampleKey(beatIndex, subIndex);
  if (!(key in existing)) return existing;
  const updated = { ...existing };
  delete updated[key];
  await saveNoteSampleSources(updated);
  return updated;
}

export async function setNoteSample(
  beatIndex: number,
  subIndex: number,
  uri: string,
  existing: NoteSampleMap
): Promise<NoteSampleMap> {
  const updated = { ...existing, [sampleKey(beatIndex, subIndex)]: uri };
  await saveNoteSamples(updated);
  return updated;
}

export async function setNoteSampleName(
  beatIndex: number,
  subIndex: number,
  name: string,
  existing: NoteSampleNameMap
): Promise<NoteSampleNameMap> {
  const key = sampleKey(beatIndex, subIndex);
  if (name.trim()) {
    const updated = { ...existing, [key]: name.trim() };
    await saveNoteSampleNames(updated);
    return updated;
  } else {
    const updated = { ...existing };
    delete updated[key];
    await saveNoteSampleNames(updated);
    return updated;
  }
}

export async function removeNoteSample(
  beatIndex: number,
  subIndex: number,
  existing: NoteSampleMap
): Promise<NoteSampleMap> {
  const key = sampleKey(beatIndex, subIndex);
  if (!(key in existing)) return existing;
  const updated = { ...existing };
  delete updated[key];
  await saveNoteSamples(updated);
  return updated;
}

export async function removeNoteSampleName(
  beatIndex: number,
  subIndex: number,
  existing: NoteSampleNameMap
): Promise<NoteSampleNameMap> {
  const key = sampleKey(beatIndex, subIndex);
  if (!(key in existing)) return existing;
  const updated = { ...existing };
  delete updated[key];
  await saveNoteSampleNames(updated);
  return updated;
}

export async function loadNoteSampleChannels(): Promise<NoteSampleChannelMap> {
  try {
    const raw = await AsyncStorage.getItem(CHANNELS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const out: NoteSampleChannelMap = {};
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          out[k] = normalizeSampleChannel(v);
        }
      }
      return out;
    }
  } catch {}
  return {};
}

export async function saveNoteSampleChannels(channels: NoteSampleChannelMap): Promise<void> {
  try {
    await channelsWriter(channels);
  } catch {}
}

export async function setNoteSampleChannel(
  beatIndex: number,
  subIndex: number,
  channel: SampleChannel,
  existing: NoteSampleChannelMap,
): Promise<NoteSampleChannelMap> {
  const key = sampleKey(beatIndex, subIndex);
  const updated: NoteSampleChannelMap = { ...existing };
  if (channel === "both") {
    delete updated[key];
  } else {
    updated[key] = channel;
  }
  await saveNoteSampleChannels(updated);
  return updated;
}

export async function removeNoteSampleChannel(
  beatIndex: number,
  subIndex: number,
  existing: NoteSampleChannelMap,
): Promise<NoteSampleChannelMap> {
  const key = sampleKey(beatIndex, subIndex);
  if (!(key in existing)) return existing;
  const updated = { ...existing };
  delete updated[key];
  await saveNoteSampleChannels(updated);
  return updated;
}

export function getNoteSampleChannel(
  beatIndex: number,
  subIndex: number,
  channels: NoteSampleChannelMap,
): SampleChannel {
  return channels[sampleKey(beatIndex, subIndex)] ?? "both";
}

export function hasNoteSample(
  beatIndex: number,
  subIndex: number,
  samples: NoteSampleMap
): boolean {
  return sampleKey(beatIndex, subIndex) in samples;
}

export function getNoteSampleUri(
  beatIndex: number,
  subIndex: number,
  samples: NoteSampleMap
): string | null {
  return samples[sampleKey(beatIndex, subIndex)] || null;
}

export { sampleKey };

import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeSampleChannel, type SampleChannel } from "./stereo-channel";

const STORAGE_KEY = "@note_samples";
const NAMES_STORAGE_KEY = "@note_sample_names";
const SOURCES_STORAGE_KEY = "@note_sample_sources";
const CHANNELS_STORAGE_KEY = "@note_sample_channels";

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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
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
    await AsyncStorage.setItem(NAMES_STORAGE_KEY, JSON.stringify(names));
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
    await AsyncStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(sources));
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
    await AsyncStorage.setItem(CHANNELS_STORAGE_KEY, JSON.stringify(channels));
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

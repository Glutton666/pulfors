import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeSampleChannel, type SampleChannel } from "./stereo-channel";
import { createDebouncedPersister } from "./persist";

const STORAGE_KEY = "@note_samples";
const NAMES_STORAGE_KEY = "@note_sample_names";
const SOURCES_STORAGE_KEY = "@note_sample_sources";
const CHANNELS_STORAGE_KEY = "@note_sample_channels";
const METRO_CHANNELS_STORAGE_KEY = "@note_sample_metro_channels_beat";

/**
 * Per-storage-key serialized writer built on top of `createDebouncedPersister`.
 *
 * 빠른 연속 호출은 디바운스 윈도우 안에서 하나의 write로 합쳐지고(IO 절감),
 * 진행 중 write 도중 들어온 호출은 다시 last-write-wins로 합쳐져 한 번만 추가
 * write가 발생한다. 동일 키에 대한 동시 쓰기가 직렬로 처리되므로 마지막 호출의
 * 값이 결정적으로 디스크에 남는다.
 *
 * 호출자가 await한 Promise는 자기 값(또는 자기 이후 값)이 디스크에 기록된
 * 시점에 resolve된다.
 */
const NOTE_SAMPLES_DEBOUNCE_MS = 50;

function createSerializedWriter<T>(
  key: string,
  debounceMs: number = NOTE_SAMPLES_DEBOUNCE_MS,
): (value: T) => Promise<void> {
  // getSnapshot은 항상 마지막으로 들어온 값을 반환하고, 호출자별 resolver는
  // 다음 write 사이클이 끝날 때 한꺼번에 resolve된다.
  let snapshot: T | null = null;
  let waiters: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

  const persister = createDebouncedPersister<{ value: T }>(
    () => ({ value: snapshot as T }),
    async (merged) => {
      // write 진입 시점에 대기 중이던 호출자들을 캡처. write 동안 들어온
      // 새 호출자는 다음 사이클에서 settle 된다.
      const current = waiters;
      waiters = [];
      try {
        await AsyncStorage.setItem(key, JSON.stringify(merged.value));
        for (const w of current) w.resolve();
      } catch (e) {
        // 현재 사이클의 호출자는 즉시 reject. 단, write 콜백 자체에서는
        // throw하지 않는다 — persister의 onSuccess가 호출되어 writing=false
        // 로 풀리고, 도중에 들어와 pending에 쌓인 값이 있으면 자동으로
        // 다음 cycle을 시작해 그 호출자들이 hang 없이 이어서 settle된다.
        // (만약 throw하면 maxAttempts:1 + cycleFailed=true 경로로 빠져,
        //  in-flight 동안 들어온 호출자의 debounceTimer가 writing=true로
        //  소진된 케이스에서 영구 hang이 발생함.)
        for (const w of current) w.reject(e);
      }
    },
    debounceMs,
    // 재시도는 본 writer 책임 밖 (호출자/상위 레이어에서 처리). 단일 시도.
    { maxAttempts: 1 },
  );

  return (value: T): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      snapshot = value;
      waiters.push({ resolve, reject });
      persister({ value });
    });
}

const samplesWriter = createSerializedWriter<NoteSampleMap>(STORAGE_KEY);
const namesWriter = createSerializedWriter<NoteSampleNameMap>(NAMES_STORAGE_KEY);
const sourcesWriter = createSerializedWriter<NoteSampleSourceMap>(SOURCES_STORAGE_KEY);
const channelsWriter = createSerializedWriter<NoteSampleChannelMap>(CHANNELS_STORAGE_KEY);
const metroChannelsWriter = createSerializedWriter<NoteSampleMetroChannelMap>(METRO_CHANNELS_STORAGE_KEY);

export type NoteSampleMap = Record<string, string>;
export type NoteSampleNameMap = Record<string, string>;
export type SampleSource = "recording" | "import";
export type NoteSampleSourceMap = Record<string, SampleSource>;
export type NoteSampleChannelMap = Record<string, SampleChannel>;
export type NoteSampleMetroChannelMap = Record<string, SampleChannel>;

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

export async function loadNoteSampleMetroChannels(): Promise<NoteSampleMetroChannelMap> {
  try {
    const raw = await AsyncStorage.getItem(METRO_CHANNELS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const out: NoteSampleMetroChannelMap = {};
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

export async function saveNoteSampleMetroChannels(channels: NoteSampleMetroChannelMap): Promise<void> {
  try {
    await metroChannelsWriter(channels);
  } catch {}
}

export async function setNoteSampleMetroChannel(
  beatIndex: number,
  channel: SampleChannel,
  existing: NoteSampleMetroChannelMap,
): Promise<NoteSampleMetroChannelMap> {
  const key = String(beatIndex);
  const updated: NoteSampleMetroChannelMap = { ...existing };
  if (channel === "both") {
    delete updated[key];
  } else {
    updated[key] = channel;
  }
  await saveNoteSampleMetroChannels(updated);
  return updated;
}

export async function removeNoteSampleMetroChannel(
  beatIndex: number,
  existing: NoteSampleMetroChannelMap,
): Promise<NoteSampleMetroChannelMap> {
  const key = String(beatIndex);
  if (!(key in existing)) return existing;
  const updated = { ...existing };
  delete updated[key];
  await saveNoteSampleMetroChannels(updated);
  return updated;
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

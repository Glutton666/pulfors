import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeSampleChannel, normalizeMetroChannel, type SampleChannel, type MetroChannel } from "./stereo-channel";
import { createDebouncedPersister } from "./persist";
import type { PersisterStatus } from "./persist";

const STORAGE_KEY = "@note_samples";
const NAMES_STORAGE_KEY = "@note_sample_names";
const SOURCES_STORAGE_KEY = "@note_sample_sources";
const CHANNELS_STORAGE_KEY = "@note_sample_channels";
const VOLUMES_STORAGE_KEY = "@note_sample_volumes";
const SPEEDS_STORAGE_KEY = "@note_sample_speeds";
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
const NOTE_SAMPLES_RETRY = { maxAttempts: 3, baseDelayMs: 10 } as const;

type SerializedWriter<T> = ((value: T) => Promise<void>) & {
  getStatus: () => PersisterStatus;
  subscribeStatus: (listener: (status: PersisterStatus) => void) => () => void;
};

function createSerializedWriter<T>(
  key: string,
  debounceMs: number = NOTE_SAMPLES_DEBOUNCE_MS,
): SerializedWriter<T> {
  // getSnapshot은 항상 마지막으로 들어온 값을 반환하고, 호출자별 resolver는
  // 다음 write 사이클이 끝날 때 한꺼번에 resolve된다.
  let snapshot: T | null = null;
  let snapshotVersion = 0;
  type Waiter = { version: number; resolve: () => void; reject: (e: unknown) => void };
  let queuedWaiters: Waiter[] = [];
  // 한 cycle의 첫 write에서 캡처한 호출자는 재시도 내내 유지한다. write 도중
  // 들어온 호출자는 별도 큐에 남겨 다음 last-write-wins cycle에서 처리한다.
  let cycleWaiters: Waiter[] = [];

  const persister = createDebouncedPersister<{ value: T; version: number }>(
    () => ({ value: snapshot as T, version: snapshotVersion }),
    async (merged) => {
      if (cycleWaiters.length === 0) {
        cycleWaiters = queuedWaiters.filter((w) => w.version <= merged.version);
        queuedWaiters = queuedWaiters.filter((w) => w.version > merged.version);
      }
      await AsyncStorage.setItem(key, JSON.stringify(merged.value));
      // Retry 중 들어온 값도 해당 retry의 merged.version에 포함됐다면 이번
      // 성공으로 저장된 것이므로 바로 resolve한다.
      const mergedWaiters = queuedWaiters.filter((w) => w.version <= merged.version);
      queuedWaiters = queuedWaiters.filter((w) => w.version > merged.version);
      const settled = [...cycleWaiters, ...mergedWaiters];
      cycleWaiters = [];
      for (const w of settled) w.resolve();
    },
    debounceMs,
    {
      ...NOTE_SAMPLES_RETRY,
      onCycleFailed: (error) => {
        const failed = cycleWaiters;
        cycleWaiters = [];
        for (const w of failed) w.reject(error);
        // 실패한 cycle 중 새 값이 들어왔다면 그 값은 별도 cycle에서 즉시
        // 시도한다. 새 호출이 없으면 pending은 남고 다음 호출이 cycle을 연다.
        if (queuedWaiters.length > 0) persister();
      },
    },
  );

  const writer = ((value: T): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      snapshot = value;
      snapshotVersion += 1;
      queuedWaiters.push({ version: snapshotVersion, resolve, reject });
      persister({ value, version: snapshotVersion });
    })) as SerializedWriter<T>;
  writer.getStatus = persister.getStatus;
  writer.subscribeStatus = persister.subscribeStatus;
  return writer;
}

const samplesWriter = createSerializedWriter<NoteSampleMap>(STORAGE_KEY);
const namesWriter = createSerializedWriter<NoteSampleNameMap>(NAMES_STORAGE_KEY);
const sourcesWriter = createSerializedWriter<NoteSampleSourceMap>(SOURCES_STORAGE_KEY);
const channelsWriter = createSerializedWriter<NoteSampleChannelMap>(CHANNELS_STORAGE_KEY);
const volumesWriter = createSerializedWriter<NoteSampleVolumeMap>(VOLUMES_STORAGE_KEY);
const speedsWriter = createSerializedWriter<NoteSampleSpeedMap>(SPEEDS_STORAGE_KEY);
const metroChannelsWriter = createSerializedWriter<NoteSampleMetroChannelMap>(METRO_CHANNELS_STORAGE_KEY);

export type NoteSampleMap = Record<string, string>;
export type NoteSampleNameMap = Record<string, string>;
export type SampleSource = "recording" | "import";
export type NoteSampleSourceMap = Record<string, SampleSource>;
export type NoteSampleChannelMap = Record<string, SampleChannel>;
/** Per-sample gain (0–1). Missing values deliberately mean 100% for old saves. */
export type NoteSampleVolumeMap = Record<string, number>;
/** Per-sample playback rate (0.5–2). Missing values deliberately mean 100%. */
export type NoteSampleSpeedMap = Record<string, number>;
export type NoteSampleMetroChannelMap = Record<string, MetroChannel>;

/**
 * Exposes the aggregate storage health of all note-sample maps. UI code polls
 * this just like settings persistence so swallowed save errors remain visible.
 */
export function getNoteSamplePersistenceStatus(): PersisterStatus {
  const statuses = [
    samplesWriter.getStatus(),
    namesWriter.getStatus(),
    sourcesWriter.getStatus(),
    channelsWriter.getStatus(),
    volumesWriter.getStatus(),
    speedsWriter.getStatus(),
    metroChannelsWriter.getStatus(),
  ];
  return {
    lastSaveAt: statuses.reduce<number | null>(
      (latest, status) => Math.max(latest ?? 0, status.lastSaveAt ?? 0) || null,
      null,
    ),
    lastErrorAt: statuses.reduce<number | null>(
      (latest, status) => Math.max(latest ?? 0, status.lastErrorAt ?? 0) || null,
      null,
    ),
    consecutiveFailures: Math.max(...statuses.map((status) => status.consecutiveFailures)),
    pendingChanges: statuses.reduce((total, status) => total + status.pendingChanges, 0),
    cycleFailed: statuses.some((status) => status.cycleFailed),
  };
}

/** Delivers note-sample save state immediately, including brief retry windows. */
export function subscribeNoteSamplePersistenceStatus(
  listener: (status: PersisterStatus) => void,
): () => void {
  const writers = [samplesWriter, namesWriter, sourcesWriter, channelsWriter, volumesWriter, speedsWriter, metroChannelsWriter];
  const notify = () => listener(getNoteSamplePersistenceStatus());
  const unsubscribers = writers.map((writer) => writer.subscribeStatus(notify));
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

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

export async function loadNoteSampleVolumes(): Promise<NoteSampleVolumeMap> {
  try {
    const raw = await AsyncStorage.getItem(VOLUMES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const volumes: NoteSampleVolumeMap = {};
      if (parsed && typeof parsed === "object") {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === "number" && Number.isFinite(value)) {
            volumes[key] = Math.max(0, Math.min(1, value));
          }
        }
      }
      return volumes;
    }
  } catch {}
  return {};
}

export async function saveNoteSampleVolumes(volumes: NoteSampleVolumeMap): Promise<void> {
  try {
    await volumesWriter(volumes);
  } catch {}
}

export async function setNoteSampleVolume(
  beatIndex: number,
  subIndex: number,
  volume: number,
  existing: NoteSampleVolumeMap,
): Promise<NoteSampleVolumeMap> {
  const key = sampleKey(beatIndex, subIndex);
  const updated = { ...existing, [key]: Math.max(0, Math.min(1, volume)) };
  await saveNoteSampleVolumes(updated);
  return updated;
}

export async function removeNoteSampleVolume(
  beatIndex: number,
  subIndex: number,
  existing: NoteSampleVolumeMap,
): Promise<NoteSampleVolumeMap> {
  const key = sampleKey(beatIndex, subIndex);
  if (!(key in existing)) return existing;
  const updated = { ...existing };
  delete updated[key];
  await saveNoteSampleVolumes(updated);
  return updated;
}

export async function loadNoteSampleSpeeds(): Promise<NoteSampleSpeedMap> {
  try {
    const raw = await AsyncStorage.getItem(SPEEDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const speeds: NoteSampleSpeedMap = {};
      if (parsed && typeof parsed === "object") {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === "number" && Number.isFinite(value)) {
            speeds[key] = Math.max(0.5, Math.min(2, value));
          }
        }
      }
      return speeds;
    }
  } catch {}
  return {};
}

export async function saveNoteSampleSpeeds(speeds: NoteSampleSpeedMap): Promise<void> {
  try {
    await speedsWriter(speeds);
  } catch {}
}

export async function setNoteSampleSpeed(
  beatIndex: number,
  subIndex: number,
  speed: number,
  existing: NoteSampleSpeedMap,
): Promise<NoteSampleSpeedMap> {
  const key = sampleKey(beatIndex, subIndex);
  const updated = { ...existing, [key]: Math.max(0.5, Math.min(2, speed)) };
  await saveNoteSampleSpeeds(updated);
  return updated;
}

export async function removeNoteSampleSpeed(
  beatIndex: number,
  subIndex: number,
  existing: NoteSampleSpeedMap,
): Promise<NoteSampleSpeedMap> {
  const key = sampleKey(beatIndex, subIndex);
  if (!(key in existing)) return existing;
  const updated = { ...existing };
  delete updated[key];
  await saveNoteSampleSpeeds(updated);
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
          out[k] = normalizeMetroChannel(v);
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
  channel: MetroChannel,
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

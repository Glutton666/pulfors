import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@note_samples";
const NAMES_STORAGE_KEY = "@note_sample_names";
const SOURCES_STORAGE_KEY = "@note_sample_sources";

export type NoteSampleMap = Record<string, string>;
export type NoteSampleNameMap = Record<string, string>;
export type SampleSource = "recording" | "import";
export type NoteSampleSourceMap = Record<string, SampleSource>;

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

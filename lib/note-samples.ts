import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@note_samples";

export type NoteSampleMap = Record<string, string>;

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

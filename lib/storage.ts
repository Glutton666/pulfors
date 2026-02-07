import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "metronome_settings";
const PRESETS_KEY = "metronome_tempo_presets";

export interface TempoPreset {
  label: string;
  min: number;
  max: number;
  bpm: number;
}

export interface AppSettings {
  bpm: number;
  beatsPerMeasure: number;
  beatSubdivision: number;
  volume: number;
  backgroundPlayback: boolean;
  theme: "analog" | "digital";
  beatLightMode: "all" | "accent" | "none";
  rapidTapWindowMs: number;
  timeSignatureIndex: number;
  tempoPresetIndex: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  bpm: 120,
  beatsPerMeasure: 4,
  beatSubdivision: 1,
  volume: 0.8,
  backgroundPlayback: true,
  theme: "digital",
  beatLightMode: "all",
  rapidTapWindowMs: 300,
  timeSignatureIndex: 2,
  tempoPresetIndex: 3,
};

export const DEFAULT_PRESETS: TempoPreset[] = [
  { label: "Grave", min: 20, max: 40, bpm: 35 },
  { label: "Largo", min: 40, max: 60, bpm: 50 },
  { label: "Adagio", min: 60, max: 76, bpm: 68 },
  { label: "Andante", min: 76, max: 100, bpm: 88 },
  { label: "Moderato", min: 100, max: 120, bpm: 110 },
  { label: "Allegro", min: 120, max: 156, bpm: 138 },
  { label: "Vivace", min: 156, max: 176, bpm: 166 },
  { label: "Presto", min: 176, max: 240, bpm: 200 },
  { label: "Prestissimo", min: 240, max: 300, bpm: 260 },
];

export const TIME_SIGNATURES = [
  { top: 1, bottom: 4, label: "1/4", beats: 1 },
  { top: 2, bottom: 4, label: "2/4", beats: 2 },
  { top: 3, bottom: 4, label: "3/4", beats: 3 },
  { top: 4, bottom: 4, label: "4/4", beats: 4 },
  { top: 5, bottom: 4, label: "5/4", beats: 5 },
  { top: 6, bottom: 4, label: "6/4", beats: 6 },
  { top: 7, bottom: 4, label: "7/4", beats: 7 },
  { top: 3, bottom: 8, label: "3/8", beats: 3 },
  { top: 6, bottom: 8, label: "6/8", beats: 6 },
  { top: 9, bottom: 8, label: "9/8", beats: 9 },
  { top: 12, bottom: 8, label: "12/8", beats: 12 },
  { top: 5, bottom: 8, label: "5/8", beats: 5 },
  { top: 7, bottom: 8, label: "7/8", beats: 7 },
];

export const BEAT_SUBDIVISIONS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 6, label: "6" },
];

export async function loadSettings(): Promise<AppSettings> {
  try {
    const data = await AsyncStorage.getItem(SETTINGS_KEY);
    if (data) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (e) {
    console.warn("Failed to load settings:", e);
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  try {
    const current = await loadSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Failed to save settings:", e);
  }
}

export async function loadPresets(): Promise<TempoPreset[]> {
  try {
    const data = await AsyncStorage.getItem(PRESETS_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn("Failed to load presets:", e);
  }
  return DEFAULT_PRESETS;
}

export async function savePresets(presets: TempoPreset[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch (e) {
    console.warn("Failed to save presets:", e);
  }
}

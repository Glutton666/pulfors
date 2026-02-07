import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "metronome_settings";

export interface MetronomeSettings {
  bpm: number;
  beatsPerMeasure: number;
  subdivisions: number;
}

const DEFAULT_SETTINGS: MetronomeSettings = {
  bpm: 120,
  beatsPerMeasure: 4,
  subdivisions: 1,
};

export async function loadSettings(): Promise<MetronomeSettings> {
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

export async function saveSettings(settings: MetronomeSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save settings:", e);
  }
}

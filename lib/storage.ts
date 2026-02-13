import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BeatType } from "./metronome-engine";
import type { ThemeColor } from "@/constants/colors";

const SETTINGS_KEY = "metronome_settings";

export type FlashMode = "all" | "accent" | "off";
export type HapticMode = "all" | "accent" | "off";
export type SoundSet = "classic" | "woodblock" | "digital" | "rimshot";

export interface MetronomeSettings {
  bpm: number;
  beatsPerMeasure: number;
  subdivisions: number;
  subdivisionPattern?: BeatType[];
  beatSubdivisions?: Record<string, BeatType[]>;
  volume?: number;
  backgroundPlay?: boolean;
  soundSet?: SoundSet;
  flashMode?: FlashMode;
  hapticMode?: HapticMode;
  audioOffsetMs?: number;
  themeColor?: ThemeColor;
}

const DEFAULT_SETTINGS: MetronomeSettings = {
  bpm: 120,
  beatsPerMeasure: 4,
  subdivisions: 1,
  subdivisionPattern: ["accent"],
  beatSubdivisions: {},
  volume: 0.8,
  backgroundPlay: false,
  soundSet: "classic",
  flashMode: "accent",
  hapticMode: "all",
  audioOffsetMs: 0,
  themeColor: "gold",
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

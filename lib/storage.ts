import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { BeatType } from "./metronome-engine";
import type { ThemeColor } from "@/constants/colors";

const SETTINGS_KEY = "metronome_settings";
const PRACTICE_BOOK_KEY = "practice_book";

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
  sampleVolume?: number;
  backgroundPlay?: boolean;
  soundSet?: SoundSet;
  flashMode?: FlashMode;
  hapticMode?: HapticMode;
  audioOffsetMs?: number;
  themeColor?: ThemeColor;
  timerStopMode?: "immediate" | "end-of-cycle";
  username?: string;
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
  timerStopMode: "end-of-cycle",
  username: "",
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

export interface BarRepeatEntry {
  type: "count" | "duration";
  value: number;
}

export interface LoopBlockEntry {
  startBeat: number;
  endBeat: number;
  type: "count" | "duration";
  value: number;
}

export interface PracticeEntry {
  id: string;
  label: string;
  createdAt: number;
  createdBy?: string;
  bpm: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeatEntry>;
  loopBlocks?: LoopBlockEntry[];
  barLoopMode: "loop" | "once";
  subdivisionPattern: BeatType[];
  barClockMode?: "stopwatch" | "timer";
  barTimerDuration?: number;
}

export async function loadPracticeBook(): Promise<PracticeEntry[]> {
  try {
    const data = await AsyncStorage.getItem(PRACTICE_BOOK_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.warn("Failed to load practice book:", e);
  }
  return [];
}

export async function savePracticeBook(entries: PracticeEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRACTICE_BOOK_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn("Failed to save practice book:", e);
  }
}

export function createPracticeEntry(
  label: string,
  config: Omit<PracticeEntry, "id" | "label" | "createdAt">,
  createdBy?: string
): PracticeEntry {
  return {
    id: Crypto.randomUUID(),
    label,
    createdAt: Date.now(),
    ...(createdBy ? { createdBy } : {}),
    ...config,
  };
}

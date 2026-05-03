import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { BeatType } from "./metronome-engine";
import type { ThemeColor } from "@/constants/colors";
import { notifyStorageError } from "./storage-notifier";
import { logger } from "./logger";

const SETTINGS_KEY = "metronome_settings";
const PRACTICE_BOOK_KEY = "practice_book";
const FADE_OUT_KEY = "metronome_fade_out";

export interface FadeOutSettings {
  enabled: boolean;
  audibleN: number;
  mutedM: number;
  audibleK: number;
}

const DEFAULT_FADE_OUT: FadeOutSettings = {
  enabled: false,
  audibleN: 8,
  mutedM: 4,
  audibleK: 4,
};

export function clampFadeOutMeasures(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(64, Math.floor(v)));
}

export async function loadFadeOutSettings(): Promise<FadeOutSettings> {
  try {
    const data = await AsyncStorage.getItem(FADE_OUT_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return {
        enabled: !!parsed.enabled,
        audibleN: clampFadeOutMeasures(parsed.audibleN ?? DEFAULT_FADE_OUT.audibleN),
        mutedM: clampFadeOutMeasures(parsed.mutedM ?? DEFAULT_FADE_OUT.mutedM),
        audibleK: clampFadeOutMeasures(parsed.audibleK ?? DEFAULT_FADE_OUT.audibleK),
      };
    }
  } catch (e) {
    notifyStorageError({ key: FADE_OUT_KEY, operation: "load", error: e });
  }
  return DEFAULT_FADE_OUT;
}

export async function saveFadeOutSettings(s: FadeOutSettings): Promise<void> {
  try {
    const safe: FadeOutSettings = {
      enabled: !!s.enabled,
      audibleN: clampFadeOutMeasures(s.audibleN),
      mutedM: clampFadeOutMeasures(s.mutedM),
      audibleK: clampFadeOutMeasures(s.audibleK),
    };
    await AsyncStorage.setItem(FADE_OUT_KEY, JSON.stringify(safe));
  } catch (e) {
    notifyStorageError({ key: FADE_OUT_KEY, operation: "save", error: e });
  }
}

export type FlashMode = "all" | "accent" | "off";
export type HapticMode = "all" | "accent" | "off";
export type BuiltinSoundSet = "classic" | "woodblock" | "cowbell" | "digital" | "rimshot";
export type SoundSet = BuiltinSoundSet | "custom1" | "custom2" | "custom3";

export type SoundRole = "strong" | "high" | "low";

export interface CustomSoundSample {
  type: "builtin" | "custom";
  sourceSet?: BuiltinSoundSet;
  sourceRole?: SoundRole;
  sampleUri?: string;
  sampleName?: string;
  duration: number;
}

export interface CustomSoundSetConfig {
  name: string;
  strong: CustomSoundSample;
  accent: CustomSoundSample;
  normal: CustomSoundSample;
}

const CUSTOM_SOUND_SETS_KEY = "metronome_custom_sound_sets";

export async function loadCustomSoundSets(): Promise<Record<string, CustomSoundSetConfig>> {
  try {
    const data = await AsyncStorage.getItem(CUSTOM_SOUND_SETS_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    notifyStorageError({ key: CUSTOM_SOUND_SETS_KEY, operation: "load", error: e });
  }
  return {};
}

export async function saveCustomSoundSets(configs: Record<string, CustomSoundSetConfig>): Promise<void> {
  try {
    await AsyncStorage.setItem(CUSTOM_SOUND_SETS_KEY, JSON.stringify(configs));
  } catch (e) {
    notifyStorageError({ key: CUSTOM_SOUND_SETS_KEY, operation: "save", error: e });
  }
}

export const BUILTIN_SOUND_SETS: BuiltinSoundSet[] = ["classic", "woodblock", "cowbell", "digital", "rimshot"];
export const CUSTOM_SOUND_SET_SLOTS: SoundSet[] = ["custom1", "custom2", "custom3"];

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
  landscapeReversed?: boolean;
  showLandscapeImage?: boolean;
  landscapeContentType?: "photo" | "stats";
  beatDirection?: "cw" | "ccw";
  layerSoundSets?: Record<number, SoundSet>;
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
  landscapeReversed: false,
  showLandscapeImage: true,
  landscapeContentType: "photo",
  beatDirection: "cw",
};

export async function loadSettings(): Promise<MetronomeSettings> {
  try {
    const data = await AsyncStorage.getItem(SETTINGS_KEY);
    if (data) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (e) {
    notifyStorageError({ key: SETTINGS_KEY, operation: "load", error: e });
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: MetronomeSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    notifyStorageError({ key: SETTINGS_KEY, operation: "save", error: e });
    throw e;
  }
}

let pendingSettings: MetronomeSettings | null = null;
let settingsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SETTINGS_DEBOUNCE_MS = 400;

export function saveSettingsDebounced(settings: MetronomeSettings): void {
  pendingSettings = settings;
  if (settingsDebounceTimer) clearTimeout(settingsDebounceTimer);
  settingsDebounceTimer = setTimeout(() => {
    const toWrite = pendingSettings;
    pendingSettings = null;
    settingsDebounceTimer = null;
    if (toWrite) {
      saveSettings(toWrite).catch(() => {});
    }
  }, SETTINGS_DEBOUNCE_MS);
}

export async function flushPendingSettings(): Promise<void> {
  if (settingsDebounceTimer) {
    clearTimeout(settingsDebounceTimer);
    settingsDebounceTimer = null;
  }
  if (pendingSettings) {
    const toWrite = pendingSettings;
    pendingSettings = null;
    try {
      await saveSettings(toWrite);
    } catch {}
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
  soundSet?: SoundSet;
  layerOf?: number;
  ownBeatTypes?: Record<number, BeatType>;
  ownSubdivisions?: Record<string, BeatType[]>;
}

export interface PracticeEntry {
  id: string;
  label: string;
  createdAt: number;
  createdBy?: string;
  mode?: "beat" | "bar" | "note";
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
  noteSamples?: Record<string, string>;
  noteSampleNames?: Record<string, string>;
  noteSampleSources?: Record<string, "recording" | "import">;
  noteQueueEntryIds?: string[];
  notePlayMode?: "once" | "loop" | "random";
  noteQueueEntries?: PracticeEntry[];
  imageUri?: string;
}

export async function loadPracticeBook(): Promise<PracticeEntry[]> {
  try {
    const data = await AsyncStorage.getItem(PRACTICE_BOOK_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    logger.warn("Failed to load practice book:", e);
  }
  return [];
}

export async function savePracticeBook(entries: PracticeEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRACTICE_BOOK_KEY, JSON.stringify(entries));
  } catch (e) {
    logger.warn("Failed to save practice book:", e);
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

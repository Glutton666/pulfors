import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { BeatType } from "./metronome-engine";
import type { ThemeColor } from "@/constants/colors";
import type { SampleChannel } from "./stereo-channel";
import { normalizeSampleChannel } from "./stereo-channel";
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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function loadFadeOutSettings(): Promise<FadeOutSettings> {
  try {
    const data = await AsyncStorage.getItem(FADE_OUT_KEY);
    if (data) {
      const parsed: unknown = JSON.parse(data);
      if (!isPlainObject(parsed)) return DEFAULT_FADE_OUT;
      return {
        enabled: !!parsed.enabled,
        audibleN: clampFadeOutMeasures(
          typeof parsed.audibleN === "number" ? parsed.audibleN : DEFAULT_FADE_OUT.audibleN,
        ),
        mutedM: clampFadeOutMeasures(
          typeof parsed.mutedM === "number" ? parsed.mutedM : DEFAULT_FADE_OUT.mutedM,
        ),
        audibleK: clampFadeOutMeasures(
          typeof parsed.audibleK === "number" ? parsed.audibleK : DEFAULT_FADE_OUT.audibleK,
        ),
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
export type BuiltinSoundSet = "classic" | "woodblock" | "cowbell" | "digital" | "rimshot" | "triangle" | "hihat" | "jamblock"
  | "kick" | "snare" | "clap" | "openhat" | "tom" | "crash";
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

function isSafeCustomSoundUri(uri: string): boolean {
  const raw = uri.split("#")[0];
  return (
    raw.startsWith("file://") ||
    raw.startsWith("asset://") ||
    raw.startsWith("blob:") ||
    raw.startsWith("data:")
  );
}

function sanitizeCustomSoundSample(sample: unknown): CustomSoundSample | null {
  if (typeof sample !== "object" || sample === null || Array.isArray(sample)) return null;
  const s = sample as Record<string, unknown>;
  const type = s.type === "builtin" || s.type === "custom" ? s.type : "builtin";
  const out: CustomSoundSample = {
    type,
    duration: typeof s.duration === "number" && isFinite(s.duration) ? s.duration : 0,
  };
  if (typeof s.sourceSet === "string") out.sourceSet = s.sourceSet as BuiltinSoundSet;
  if (typeof s.sourceRole === "string") out.sourceRole = s.sourceRole as SoundRole;
  if (typeof s.sampleUri === "string") {
    if (isSafeCustomSoundUri(s.sampleUri)) {
      out.sampleUri = s.sampleUri;
      if (typeof s.sampleName === "string") out.sampleName = s.sampleName;
    } else {
      out.type = "builtin";
    }
  } else if (typeof s.sampleName === "string") {
    out.sampleName = s.sampleName;
  }
  return out;
}

function sanitizeCustomSoundSetConfig(raw: unknown): CustomSoundSetConfig | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const strong = sanitizeCustomSoundSample(r.strong);
  const accent = sanitizeCustomSoundSample(r.accent);
  const normal = sanitizeCustomSoundSample(r.normal);
  if (!strong || !accent || !normal) return null;
  return {
    name: typeof r.name === "string" ? r.name : "",
    strong,
    accent,
    normal,
  };
}

export async function loadCustomSoundSets(): Promise<Record<string, CustomSoundSetConfig>> {
  try {
    const data = await AsyncStorage.getItem(CUSTOM_SOUND_SETS_KEY);
    if (data) {
      const parsed: unknown = JSON.parse(data);
      if (isPlainObject(parsed)) {
        const result: Record<string, CustomSoundSetConfig> = {};
        for (const [key, value] of Object.entries(parsed)) {
          const sanitized = sanitizeCustomSoundSetConfig(value);
          if (sanitized) result[key] = sanitized;
        }
        return result;
      }
    }
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

export const BUILTIN_SOUND_SETS: BuiltinSoundSet[] = ["classic", "woodblock", "cowbell", "digital", "rimshot", "triangle", "hihat", "jamblock"];
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
  barMetronomeChannel?: SampleChannel;
  autoResumeAfterInterruption?: boolean;
  barCellOpacity?: number;
  barRowHeight?: number;
  beatDenominator?: 2 | 4 | 8;
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
  barMetronomeChannel: "both",
  autoResumeAfterInterruption: true,
  barCellOpacity: 0.55,
  barRowHeight: 44,
};

export async function loadSettings(): Promise<MetronomeSettings> {
  try {
    const data = await AsyncStorage.getItem(SETTINGS_KEY);
    if (data) {
      const parsed: unknown = JSON.parse(data);
      if (!isPlainObject(parsed)) return DEFAULT_SETTINGS;
      const merged: MetronomeSettings = { ...DEFAULT_SETTINGS, ...parsed } as MetronomeSettings;
      merged.barMetronomeChannel = normalizeSampleChannel(merged.barMetronomeChannel);
      return merged;
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

export interface BarLayer {
  beatType: BeatType;
  subdivisions?: BeatType[];
  soundSet?: SoundSet;
}

export interface BarRepeatEntry {
  type: "count" | "duration";
  value: number;
  /** Optional per-bar BPM override picked up by engine.setAllBarBpmOverrides. */
  bpm?: number;
  /** N회 부호: 최대 N번까지만 재생, 소진 후 건너뜀 */
  voltaMax?: number;
  /** 끝 부호: 모든 N회 조건 소진 시 정지 지점 */
  isEnd?: boolean;
  /** →N 점프 출발지 쌍 ID */
  jumpFromId?: number;
  /** ←N 점프 목적지 쌍 ID */
  jumpToId?: number;
  /** 바 단위 레이어 목록 */
  layers?: BarLayer[];
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
  /** Block playback mode used in bar mode practice. */
  blockPlayMode?: "sequential" | "loop" | "random";
  barLoopMode: "loop" | "once";
  subdivisionPattern: BeatType[];
  barClockMode?: "stopwatch" | "timer";
  barTimerDuration?: number;
  noteSamples?: Record<string, string>;
  noteSampleNames?: Record<string, string>;
  noteSampleSources?: Record<string, "recording" | "import">;
  noteSampleChannels?: Record<string, "both" | "left" | "right">;
  noteQueueEntryIds?: string[];
  notePlayMode?: "once" | "loop" | "random";
  noteQueueEntries?: PracticeEntry[];
  imageUri?: string;
  scoreId?: string;
}

// === 컨트롤 패드 매핑 ============================================
// 노트 모드의 3x3 컨트롤 패드 슬롯 → PracticeEntry.id 매핑.
// 빈 칸은 null. 매핑된 ID가 더 이상 존재하지 않으면 UI에서 "missing"으로 표시한다.
const CONTROL_PAD_MAPPING_KEY = "metronome_control_pad_mapping_v1";
export const CONTROL_PAD_SLOT_COUNT = 9;
export type ControlPadMapping = (string | null)[];

export function createEmptyControlPadMapping(): ControlPadMapping {
  return Array(CONTROL_PAD_SLOT_COUNT).fill(null);
}

function normalizeControlPadMapping(input: unknown): ControlPadMapping {
  const out = createEmptyControlPadMapping();
  if (Array.isArray(input)) {
    for (let i = 0; i < CONTROL_PAD_SLOT_COUNT; i++) {
      const v = input[i];
      out[i] = typeof v === "string" && v.length > 0 ? v : null;
    }
  }
  return out;
}

export async function loadControlPadMapping(): Promise<ControlPadMapping> {
  try {
    const data = await AsyncStorage.getItem(CONTROL_PAD_MAPPING_KEY);
    if (data) return normalizeControlPadMapping(JSON.parse(data));
  } catch (e) {
    notifyStorageError({ key: CONTROL_PAD_MAPPING_KEY, operation: "load", error: e });
  }
  return createEmptyControlPadMapping();
}

export async function saveControlPadMapping(mapping: ControlPadMapping): Promise<void> {
  try {
    await AsyncStorage.setItem(CONTROL_PAD_MAPPING_KEY, JSON.stringify(normalizeControlPadMapping(mapping)));
  } catch (e) {
    notifyStorageError({ key: CONTROL_PAD_MAPPING_KEY, operation: "save", error: e });
  }
}

const QUICK_ADD_KEY = "metronome_quick_add_v1";

export async function loadQuickAddList(): Promise<PracticeEntry[]> {
  try {
    const data = await AsyncStorage.getItem(QUICK_ADD_KEY);
    if (data) {
      const parsed: unknown = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed.filter((e) => isPlainObject(e)) as unknown as PracticeEntry[];
    }
  } catch (e) {
    notifyStorageError({ key: QUICK_ADD_KEY, operation: "load", error: e });
  }
  return [];
}

export async function saveQuickAddList(list: PracticeEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUICK_ADD_KEY, JSON.stringify(list));
  } catch (e) {
    notifyStorageError({ key: QUICK_ADD_KEY, operation: "save", error: e });
  }
}

export async function loadPracticeBook(): Promise<PracticeEntry[]> {
  try {
    const data = await AsyncStorage.getItem(PRACTICE_BOOK_KEY);
    if (data) {
      const parsed: unknown = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.filter((e) => isPlainObject(e)) as unknown as PracticeEntry[];
      }
    }
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

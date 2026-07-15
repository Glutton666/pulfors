import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { Asset } from "expo-asset";
import { soundSets, drumPadSounds } from "./metronome-engine";
import { resolveWebAssetUrl } from "./audio-renderer";
import type { BuiltinSoundSet, SoundRole } from "./storage";
import { notifyStorageError } from "./storage-notifier";

export const DRUM_PAD_COUNT = 16;
export const DRUM_KIT_ROWS = 4;
export const DRUM_KIT_COLS = 4;

const STORAGE_KEY = "@drum_kit_mapping_v1";

export type DrumPadSource =
  | { type: "builtin"; setName: BuiltinSoundSet; role: SoundRole }
  | { type: "import"; uri: string; name: string }
  | { type: "recording"; uri: string; name: string };

export interface DrumPadConfig {
  source: DrumPadSource;
}

export type DrumKitMapping = (DrumPadConfig | null)[];

/**
 * Default order for the 16-pad drum kit.
 * Drum-machine sounds come first so the out-of-the-box mapping feels
 * like a real drum machine (kick, snare, hi-hat, clap, toms, crash).
 * Metronome click sounds follow as additional options.
 */
const BUILTIN_ORDER: Array<{ setName: BuiltinSoundSet; role: SoundRole }> = [
  { setName: "kick",    role: "strong" },  // 1  hard kick
  { setName: "kick",    role: "high"   },  // 2  soft kick
  { setName: "snare",   role: "strong" },  // 3  hard snare
  { setName: "snare",   role: "high"   },  // 4  normal snare
  { setName: "snare",   role: "low"    },  // 5  ghost snare
  { setName: "hihat",   role: "strong" },  // 6  closed hat accent
  { setName: "hihat",   role: "high"   },  // 7  closed hat normal
  { setName: "openhat", role: "strong" },  // 8  open hat long
  { setName: "openhat", role: "high"   },  // 9  open hat medium
  { setName: "clap",    role: "strong" },  // 10 hard clap
  { setName: "clap",    role: "high"   },  // 11 normal clap
  { setName: "tom",     role: "low"    },  // 12 hi-tom
  { setName: "tom",     role: "high"   },  // 13 mid tom
  { setName: "tom",     role: "strong" },  // 14 floor tom
  { setName: "crash",   role: "strong" },  // 15 full crash
  { setName: "crash",   role: "high"   },  // 16 medium crash
];

/** All options available in the pad-picker (drum sounds first, then metronome clicks). */
const ALL_BUILTIN_OPTIONS: Array<{ setName: BuiltinSoundSet; role: SoundRole }> = [
  ...BUILTIN_ORDER,
  { setName: "kick",    role: "low"    },
  { setName: "openhat", role: "low"    },
  { setName: "clap",    role: "low"    },
  { setName: "crash",   role: "low"    },
  { setName: "classic", role: "strong" },
  { setName: "classic", role: "high"   },
  { setName: "classic", role: "low"    },
  { setName: "woodblock", role: "strong" },
  { setName: "woodblock", role: "high"   },
  { setName: "woodblock", role: "low"    },
  { setName: "cowbell", role: "strong" },
  { setName: "cowbell", role: "high"   },
  { setName: "cowbell", role: "low"    },
  { setName: "digital", role: "strong" },
  { setName: "digital", role: "high"   },
  { setName: "digital", role: "low"    },
  { setName: "rimshot", role: "strong" },
  { setName: "rimshot", role: "high"   },
  { setName: "rimshot", role: "low"    },
  { setName: "triangle", role: "strong" },
  { setName: "triangle", role: "high"   },
  { setName: "triangle", role: "low"    },
  { setName: "hihat",   role: "low"    },
];

export function createDefaultDrumKitMapping(): DrumKitMapping {
  const mapping: DrumKitMapping = Array(DRUM_PAD_COUNT).fill(null);
  for (let i = 0; i < BUILTIN_ORDER.length && i < DRUM_PAD_COUNT; i++) {
    const b = BUILTIN_ORDER[i];
    mapping[i] = { source: { type: "builtin", setName: b.setName, role: b.role } };
  }
  return mapping;
}

export function listBuiltinPadOptions(): Array<{ setName: BuiltinSoundSet; role: SoundRole }> {
  return ALL_BUILTIN_OPTIONS;
}

const DRUM_PAD_SET_NAMES = new Set<string>(["kick", "snare", "clap", "openhat", "tom", "crash"]);
const METRONOME_SET_NAMES = new Set<string>(["classic", "woodblock", "cowbell", "digital", "rimshot", "triangle", "hihat"]);

function isBuiltinSetName(v: unknown): v is BuiltinSoundSet {
  return typeof v === "string" && (DRUM_PAD_SET_NAMES.has(v) || METRONOME_SET_NAMES.has(v));
}
function isRole(v: unknown): v is SoundRole {
  return v === "strong" || v === "high" || v === "low";
}

function normalizePad(input: unknown): DrumPadConfig | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as { source?: unknown };
  const src = obj.source;
  if (!src || typeof src !== "object") return null;
  const s = src as { type?: unknown; setName?: unknown; role?: unknown; uri?: unknown; name?: unknown };
  if (s.type === "builtin" && isBuiltinSetName(s.setName) && isRole(s.role)) {
    return { source: { type: "builtin", setName: s.setName, role: s.role } };
  }
  if ((s.type === "import" || s.type === "recording") && typeof s.uri === "string" && s.uri.length > 0) {
    const name = typeof s.name === "string" ? s.name : "";
    return { source: { type: s.type, uri: s.uri, name } };
  }
  return null;
}

export function normalizeDrumKitMapping(input: unknown): DrumKitMapping {
  const out: DrumKitMapping = Array(DRUM_PAD_COUNT).fill(null);
  if (Array.isArray(input)) {
    for (let i = 0; i < DRUM_PAD_COUNT; i++) {
      out[i] = normalizePad(input[i]);
    }
  }
  return out;
}

export async function loadDrumKitMapping(): Promise<DrumKitMapping> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      return normalizeDrumKitMapping(parsed);
    }
  } catch (e) {
    notifyStorageError({ key: STORAGE_KEY, operation: "load", error: e });
  }
  return createDefaultDrumKitMapping();
}

export async function saveDrumKitMapping(mapping: DrumKitMapping): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeDrumKitMapping(mapping)));
  } catch (e) {
    notifyStorageError({ key: STORAGE_KEY, operation: "save", error: e });
  }
}

export function getBuiltinPadModule(setName: BuiltinSoundSet, role: SoundRole): number {
  if (setName in drumPadSounds) {
    return drumPadSounds[setName as keyof typeof drumPadSounds][role] as unknown as number;
  }
  return (soundSets as Record<string, Record<string, unknown>>)[setName]?.[role] as unknown as number;
}

export function describePad(pad: DrumPadConfig | null): { label: string; sub: string } {
  if (!pad) return { label: "", sub: "" };
  if (pad.source.type === "builtin") {
    return { label: pad.source.setName, sub: pad.source.role };
  }
  return { label: pad.source.name || pad.source.type, sub: pad.source.type };
}

export async function resolveBuiltinAssetUri(setName: BuiltinSoundSet, role: SoundRole): Promise<string | null> {
  try {
    const allSounds: Record<string, Record<string, unknown>> = { ...soundSets, ...drumPadSounds };
    const mod = allSounds[setName]?.[role] as number;
    const asset = Asset.fromModule(mod);
    if (!asset.localUri) {
      try { await asset.downloadAsync(); } catch {}
    }
    const uri = asset.localUri || asset.uri || null;
    if (uri) return uri;
    // On web, Asset.fromModule().uri can be empty; fall back to Metro's unstable_path API
    if (Platform.OS === "web") {
      return resolveWebAssetUrl(mod) || null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolvePadUri(pad: DrumPadConfig | null): Promise<{ uri: string; name: string; source: "recording" | "import" } | null> {
  if (!pad) return null;
  if (pad.source.type === "builtin") {
    const uri = await resolveBuiltinAssetUri(pad.source.setName, pad.source.role);
    if (!uri) return null;
    return { uri, name: `${pad.source.setName}-${pad.source.role}`, source: "import" };
  }
  return { uri: pad.source.uri, name: pad.source.name || pad.source.type, source: pad.source.type };
}

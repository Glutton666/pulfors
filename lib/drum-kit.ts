import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import { soundSets } from "./metronome-engine";
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

const BUILTIN_ORDER: Array<{ setName: BuiltinSoundSet; role: SoundRole }> = [
  { setName: "classic", role: "strong" },
  { setName: "classic", role: "high" },
  { setName: "classic", role: "low" },
  { setName: "woodblock", role: "strong" },
  { setName: "woodblock", role: "high" },
  { setName: "woodblock", role: "low" },
  { setName: "cowbell", role: "strong" },
  { setName: "cowbell", role: "high" },
  { setName: "cowbell", role: "low" },
  { setName: "digital", role: "strong" },
  { setName: "digital", role: "high" },
  { setName: "digital", role: "low" },
  { setName: "rimshot", role: "strong" },
  { setName: "rimshot", role: "high" },
  { setName: "rimshot", role: "low" },
  { setName: "classic", role: "strong" },
];

export function createDefaultDrumKitMapping(): DrumKitMapping {
  return BUILTIN_ORDER.map((b) => ({ source: { type: "builtin", setName: b.setName, role: b.role } }));
}

export function listBuiltinPadOptions(): Array<{ setName: BuiltinSoundSet; role: SoundRole }> {
  return BUILTIN_ORDER.slice(0, 15);
}

function isBuiltinSetName(v: unknown): v is BuiltinSoundSet {
  return v === "classic" || v === "woodblock" || v === "cowbell" || v === "digital" || v === "rimshot";
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
    if (raw) {
      const parsed = JSON.parse(raw);
      const norm = normalizeDrumKitMapping(parsed);
      if (norm.some((p) => p !== null)) return norm;
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
  return soundSets[setName][role] as unknown as number;
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
    const mod = soundSets[setName][role];
    const asset = Asset.fromModule(mod);
    if (!asset.localUri) {
      try { await asset.downloadAsync(); } catch {}
    }
    return asset.localUri || asset.uri || null;
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

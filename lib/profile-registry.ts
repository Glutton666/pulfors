import Raw from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { PracticeRoom } from "./practice-room";
import { PROFILE_PREFIX, PROFILE_REGISTRY_KEY, isLegacyDataKey, profileKey } from "./profile-storage";

export interface LocalProfile {
  id: string;
  name: string;
  photoUri?: string;
  primaryInstrumentId?: string | null;
  rooms?: PracticeRoom[];
  /** Only the explicitly chosen, unmigrated original profile uses root keys. */
  storage?: "legacy";
  issue?: string;
}
export interface ProfileRegistry { version: 1; activeId: string; profiles: LocalProfile[] }
export const REGISTRY_BACKUP_KEY = "local_profiles_registry_backup_v1";
export const DELETED_PROFILES_KEY = "local_profiles_deleted_v1";
let queue: Promise<unknown> = Promise.resolve();

export function withProfileLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    if (typeof navigator !== "undefined" && Platform.OS === "web" && navigator.locks) {
      return await navigator.locks.request("metronome-local-profiles", operation);
    }
    return operation();
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
export function validProfileId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}
export function parseRegistry(raw: string | null): ProfileRegistry {
  if (!raw) throw new Error("Profile registry is not ready");
  const value = JSON.parse(raw);
  if (!value || value.version !== 1 || !Array.isArray(value.profiles) || !value.profiles.length
    || value.profiles.some((p: LocalProfile) => !p || !validProfileId(p.id) || typeof p.name !== "string"
      || p.storage !== undefined && (p.storage !== "legacy" || p.id !== "legacy"))
    || new Set(value.profiles.map((p: LocalProfile) => p.id)).size !== value.profiles.length
    || !value.profiles.some((p: LocalProfile) => p.id === value.activeId)) {
    throw new Error("Invalid profile registry. Original data has not been removed.");
  }
  return value;
}
export async function registry(): Promise<ProfileRegistry> {
  return parseRegistry(await Raw.getItem(PROFILE_REGISTRY_KEY));
}
export async function writeRegistry(value: ProfileRegistry): Promise<void> {
  const old = await Raw.getItem(PROFILE_REGISTRY_KEY);
  if (old) {
    // Preserve the exact previous registry, including malformed text, before repair.
    await Raw.setItem(REGISTRY_BACKUP_KEY, old);
    if (await Raw.getItem(REGISTRY_BACKUP_KEY) !== old) throw new Error("Registry recovery copy could not be verified");
  }
  await Raw.setItem(PROFILE_REGISTRY_KEY, JSON.stringify(value));
}
export function dataKey(profile: LocalProfile, key: string): string {
  if (profile.storage === "legacy") {
    if (!isLegacyDataKey(key)) throw new Error("Reserved device metadata is not profile data");
    return key;
  }
  return profileKey(profile.id, key);
}
export async function profileData(profile: LocalProfile): Promise<Record<string, string | null>> {
  const prefix = profileKey(profile.id, "");
  const keys = (await Raw.getAllKeys()).filter(key =>
    profile.storage === "legacy" ? isLegacyDataKey(key) : key.startsWith(prefix));
  return Object.fromEntries((await Raw.multiGet(keys)).map(([key, value]) =>
    [profile.storage === "legacy" ? key : key.slice(prefix.length), value]));
}
export function parseSettings(raw: string | null): Record<string, unknown> {
  const value = raw === null ? {} : JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.username !== undefined && typeof value.username !== "string"
    || value.primaryInstrumentId != null && typeof value.primaryInstrumentId !== "string"
    || value.profilePhoto != null && typeof value.profilePhoto !== "string") {
    throw new Error("Profile settings are damaged");
  }
  if (value.profileRooms !== undefined) parseRooms(JSON.stringify(value.profileRooms));
  return value;
}
export function parseRooms(raw: string | null): PracticeRoom[] {
  const rooms = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(rooms) || rooms.some(r => !r || typeof r.id !== "string"
    || typeof r.name !== "string" || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude))) {
    throw new Error("Practice-room settings are damaged");
  }
  return rooms;
}
export async function inspectProfile(profile: LocalProfile): Promise<LocalProfile> {
  try {
    const settings = parseSettings(await Raw.getItem(dataKey(profile, "metronome_settings")));
    const rooms = parseRooms(await Raw.getItem(dataKey(profile, "metronome_practice_rooms")));
    return {
      ...profile, issue: undefined,
      name: typeof settings.username === "string" ? settings.username : profile.name,
      primaryInstrumentId: typeof settings.primaryInstrumentId === "string" ? settings.primaryInstrumentId : null,
      photoUri: Object.hasOwn(settings, "profilePhoto")
        ? typeof settings.profilePhoto === "string" ? settings.profilePhoto : undefined : profile.photoUri,
      rooms: settings.profileRooms as PracticeRoom[] | undefined ?? rooms,
    };
  } catch (error) {
    // An inaccessible/corrupt profile never prevents healthy siblings from rendering.
    return { ...profile, rooms: [], issue: error instanceof Error ? error.message : String(error) };
  }
}
export async function deletedProfileIds(): Promise<string[]> {
  const raw = await Raw.getItem(DELETED_PROFILES_KEY);
  if (raw === null) return [];
  const ids = JSON.parse(raw);
  if (!Array.isArray(ids) || ids.some(id => !validProfileId(id))) throw new Error("Profile deletion journal is damaged");
  return ids;
}
export async function discoverProfiles(): Promise<LocalProfile[]> {
  const removed = new Set(await deletedProfileIds());
  const ids = new Set<string>();
  for (const key of await Raw.getAllKeys()) {
    if (!key.startsWith(PROFILE_PREFIX)) continue;
    const id = key.slice(PROFILE_PREFIX.length).split(":")[0];
    if (validProfileId(id) && !removed.has(id)) ids.add(id);
  }
  return Promise.all([...ids].map(id => inspectProfile({ id, name: id })));
}

/** Explicit recovery only; never silently replace a broken list with a blank one. */
export async function recoveryProfiles(): Promise<LocalProfile[]> {
  try { return Promise.all((await registry()).profiles.map(inspectProfile)); }
  catch {
    const found = await discoverProfiles();
    let saved: LocalProfile[] = [];
    try { saved = parseRegistry(await Raw.getItem(REGISTRY_BACKUP_KEY)).profiles; }
    catch { /* Namespaces and original keys remain independently discoverable. */ }
    const candidates = new Map(found.map(profile => [profile.id, profile]));
    for (const profile of saved) candidates.set(profile.id, await inspectProfile(profile));
    if (!saved.some(p => p.id === "legacy")
      && (await Raw.getAllKeys()).some(isLegacyDataKey)) {
      // With no committed registry, a partially copied legacy namespace is not
      // evidence of a complete migration. Prefer the untouched originals.
      candidates.set("legacy", await inspectProfile({ id: "legacy", name: "", storage: "legacy" }));
    }
    const removed = new Set(await deletedProfileIds());
    return [...candidates.values()].filter(p => !removed.has(p.id));
  }
}

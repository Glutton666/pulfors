import RawStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import type { PracticeRoom } from "./practice-room";
import {
  activeStorageProfile, bindProfileStorage, drainProfileWrites, PROFILE_PREFIX,
  PROFILE_REGISTRY_KEY, profileKey, reopenProfileStorage, sealProfileStorage,
} from "./profile-storage";

export interface LocalProfile {
  id: string;
  name: string;
  photoUri?: string;
  primaryInstrumentId?: string | null;
  rooms?: PracticeRoom[];
}
interface Registry { version: 1; activeId: string; profiles: LocalProfile[] }
let queue: Promise<unknown> = Promise.resolve();
let beforeSwitch: (() => Promise<void>) | null = null;
let switching = false;
const RESET_PENDING_KEY = "local_profiles_reset_pending_v1";

/** A reset interrupted by the OS must not remigrate the retained originals. */
async function finishPendingReset(id: string): Promise<void> {
  const keys = (await RawStorage.getAllKeys()).filter(key => key !== RESET_PENDING_KEY);
  await RawStorage.multiRemove(keys);
  await RawStorage.setItem(PROFILE_REGISTRY_KEY, JSON.stringify({
    version: 1, activeId: id, profiles: [{ id, name: "" }],
  }));
  await RawStorage.removeItem(RESET_PENDING_KEY);
}

/** Web Locks coordinates import/create/switch across tabs, not just this module. */
export function withProfileLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = async () => {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.locks) {
      return navigator.locks.request("metronome-local-profiles", operation);
    }
    return operation();
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
async function registry(): Promise<Registry> {
  const raw = await RawStorage.getItem(PROFILE_REGISTRY_KEY);
  if (!raw) throw new Error("Profile registry is not ready");
  const value = JSON.parse(raw) as Registry;
  if (value.version !== 1 || !Array.isArray(value.profiles)
    || !value.profiles.some(p => p.id === value.activeId)) throw new Error("Invalid profile registry");
  return value;
}
export const getActiveProfileId = activeStorageProfile;

/** Commit registry last. Interrupted copies are safely overwritten on retry. */
export async function initializeProfiles(): Promise<void> {
  await withProfileLock(async () => {
    const pendingReset = await RawStorage.getItem(RESET_PENDING_KEY);
    if (pendingReset) await finishPendingReset(pendingReset);
    if (!(await RawStorage.getItem(PROFILE_REGISTRY_KEY))) {
      if (await RawStorage.getItem("metronome_restore_snapshot_v1")) {
        throw new Error("Previous backup recovery must finish before profile migration");
      }
      const keys = (await RawStorage.getAllKeys()).filter(key =>
        !key.startsWith(PROFILE_PREFIX) && key !== PROFILE_REGISTRY_KEY);
      const values = await RawStorage.multiGet(keys);
      const id = "legacy";
      const pairs = values.filter((p): p is [string, string] => p[1] !== null);
      await RawStorage.multiSet(pairs.map(([key, value]) => [profileKey(id, key), value]));
      const copied = await RawStorage.multiGet(pairs.map(([key]) => profileKey(id, key)));
      if (copied.some(([, value], index) => value !== pairs[index][1])) throw new Error("Profile migration verification failed");
      let settings: Record<string, unknown> = {};
      const rawSettings = values.find(([key]) => key === "metronome_settings")?.[1];
      if (rawSettings) settings = JSON.parse(rawSettings);
      const first: LocalProfile = {
        id, name: typeof settings.username === "string" ? settings.username : "",
      };
      await RawStorage.setItem(PROFILE_REGISTRY_KEY, JSON.stringify({ version: 1, activeId: id, profiles: [first] }));
      // Legacy source keys intentionally remain intact as recovery data.
    }
    bindProfileStorage((await registry()).activeId);
  });
}
export async function readProfileData(id: string): Promise<Record<string, string | null>> {
  const reg = await registry();
  if (!reg.profiles.some(p => p.id === id)) throw new Error("Unknown profile");
  const prefix = profileKey(id, "");
  const keys = (await RawStorage.getAllKeys()).filter(key => key.startsWith(prefix));
  return Object.fromEntries((await RawStorage.multiGet(keys)).map(([key, value]) => [key.slice(prefix.length), value]));
}
export async function listProfiles(): Promise<LocalProfile[]> {
  const reg = await registry();
  return Promise.all(reg.profiles.map(async profile => {
    const raw = await RawStorage.getItem(profileKey(profile.id, "metronome_settings"));
    const settings = raw ? JSON.parse(raw) : {};
    const roomsRaw = await RawStorage.getItem(profileKey(profile.id, "metronome_practice_rooms"));
    return {
      ...profile, name: settings.username ?? profile.name,
      primaryInstrumentId: settings.primaryInstrumentId ?? null,
      photoUri: Object.hasOwn(settings, "profilePhoto")
        ? (typeof settings.profilePhoto === "string" ? settings.profilePhoto : undefined)
        : profile.photoUri,
      rooms: settings.profileRooms ?? (roomsRaw ? JSON.parse(roomsRaw) : []),
    };
  }));
}
export type ProfileInput = Omit<LocalProfile, "id">;

/** Unpublished namespaces are harmless on interruption; existing profiles are never touched. */
export async function addProfileData(data: Record<string, string | null>, input: ProfileInput): Promise<LocalProfile> {
  return withProfileLock(async () => {
    const reg = await registry();
    // Media and rooms live in the namespace, not duplicated in the shared registry.
    const profile: LocalProfile = { name: input.name, id: Crypto.randomUUID() };
    const entries = Object.entries(data).filter((p): p is [string, string] => typeof p[1] === "string");
    const pairs: [string, string][] = entries.map(([key, value]) => [profileKey(profile.id, key), value]);
    let publishing = false;
    try {
      if (pairs.length) await RawStorage.multiSet(pairs);
      const check = await RawStorage.multiGet(pairs.map(([key]) => key));
      if (check.some(([, value], i) => value !== pairs[i][1])) throw new Error("Profile write verification failed");
      publishing = true;
      await RawStorage.setItem(PROFILE_REGISTRY_KEY, JSON.stringify({ ...reg, profiles: [...reg.profiles, profile] }));
      return profile;
    } catch (error) {
      // Never remove any key from a published/existing profile.
      if (!publishing) await RawStorage.multiRemove(pairs.map(([key]) => key)).catch(() => {});
      throw error;
    }
  });
}
export function createProfile(input: ProfileInput): Promise<LocalProfile> {
  return addProfileData({
    metronome_settings: JSON.stringify({ bpm: 120, beatsPerMeasure: 4, subdivisions: 1, username: input.name, primaryInstrumentId: input.primaryInstrumentId ?? undefined, profilePhoto: input.photoUri ?? null }),
    metronome_practice_rooms: JSON.stringify(input.rooms ?? []),
    metronome_onboarding_done: "1",
    metronome_onboarding_lang_done: "1",
  }, input);
}
export async function updateProfile(id: string, input: ProfileInput): Promise<void> {
  if (id === getActiveProfileId() && beforeSwitch) await beforeSwitch();
  await withProfileLock(async () => {
    const reg = await registry();
    if (!reg.profiles.some(p => p.id === id)) throw new Error("Unknown profile");
    // A single key holds all identity fields to avoid partially applied edits.
    const key = profileKey(id, "metronome_settings");
    const raw = await RawStorage.getItem(key);
    await RawStorage.setItem(key, JSON.stringify({
      ...(raw ? JSON.parse(raw) : {}), username: input.name,
      primaryInstrumentId: input.primaryInstrumentId ?? undefined,
      profilePhoto: input.photoUri ?? null,
      profileRooms: input.rooms ?? [],
    }));
  });
  if (id === getActiveProfileId()) {
    sealProfileStorage();
    try { await reloadProfileRuntime(); }
    catch (error) { reopenProfileStorage(); throw error; }
  }
}
export function registerProfileSwitchGuard(guard: () => Promise<void>): () => void {
  beforeSwitch = guard;
  return () => { if (beforeSwitch === guard) beforeSwitch = null; };
}
export async function reloadProfileRuntime(): Promise<void> {
  if (Platform.OS === "web") window.location.reload();
  else await (await import("expo")).reloadAppAsync();
}
export async function restartActiveProfile(): Promise<void> {
  if (!beforeSwitch) throw new Error("App is not ready");
  await beforeSwitch();
  sealProfileStorage();
  try { await reloadProfileRuntime(); }
  catch (error) { reopenProfileStorage(); throw error; }
}
export async function switchProfile(id: string): Promise<void> {
  if (switching) throw new Error("Profile switch already in progress");
  if (id === getActiveProfileId()) return;
  switching = true;
  try {
    if (!beforeSwitch) throw new Error("Profile switch is not ready");
    await beforeSwitch();
    sealProfileStorage();
    await drainProfileWrites();
    await withProfileLock(async () => {
      const reg = await registry();
      if (!reg.profiles.some(p => p.id === id)) throw new Error("Unknown profile");
      await RawStorage.setItem(PROFILE_REGISTRY_KEY, JSON.stringify({ ...reg, activeId: id }));
    });
    await reloadProfileRuntime();
  } catch (error) {
    reopenProfileStorage();
    throw error;
  } finally { switching = false; }
}

/** Caller must obtain explicit confirmation naming the all-profile scope. */
export async function resetAllProfiles(): Promise<void> {
  if (!beforeSwitch) throw new Error("App is not ready");
  await beforeSwitch();
  sealProfileStorage();
  try {
    await drainProfileWrites();
    await withProfileLock(async () => {
      const id = Crypto.randomUUID();
      await RawStorage.setItem(RESET_PENDING_KEY, id);
      // New identity prevents a surviving old tab from writing into the new profile.
      await finishPendingReset(id);
    });
    await reloadProfileRuntime();
  } catch (error) {
    // A destructive reset may have partially succeeded. Keep stale writers
    // closed; the next boot safely completes the durable reset journal.
    throw error;
  }
}

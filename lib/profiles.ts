import RawStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { enqueueSettingsStorageOperation, publishProfileIdentity } from "./profile-identity";
import {
  registry, writeRegistry, withProfileLock, dataKey, inspectProfile, profileData,
  parseSettings, parseRooms, discoverProfiles, recoveryProfiles, deletedProfileIds, DELETED_PROFILES_KEY,
  type LocalProfile,
} from "./profile-registry";
import {
  activeStorageProfile, bindProfileStorage, drainProfileWrites,
  PROFILE_REGISTRY_KEY, profileKey, reopenProfileStorage, sealProfileStorage, isLegacyDataKey,
} from "./profile-storage";

export type { LocalProfile } from "./profile-registry";
export { withProfileLock } from "./profile-registry";
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
      const discovered = await discoverProfiles();
      if (discovered.some(p => p.id !== "legacy")) {
        throw new Error("Saved profiles were found without a registry. Choose a recovery profile.");
      }
      const keys = (await RawStorage.getAllKeys()).filter(key =>
        isLegacyDataKey(key));
      if (discovered.length && !keys.length) throw new Error("Saved profile data needs registry recovery");
      const values = await RawStorage.multiGet(keys);
      const id = "legacy";
      const pairs = values.filter((p): p is [string, string] => p[1] !== null);
      await RawStorage.multiSet(pairs.map(([key, value]) => [profileKey(id, key), value]));
      const copied = await RawStorage.multiGet(pairs.map(([key]) => profileKey(id, key)));
      if (copied.some(([, value], index) => value !== pairs[index][1])) throw new Error("Profile migration verification failed");
      let settings: Record<string, unknown> = {};
      const rawSettings = values.find(([key]) => key === "metronome_settings")?.[1];
      if (rawSettings) settings = parseSettings(rawSettings);
      const first: LocalProfile = {
        id, name: typeof settings.username === "string" ? settings.username : "",
      };
      await RawStorage.setItem(PROFILE_REGISTRY_KEY, JSON.stringify({ version: 1, activeId: id, profiles: [first] }));
      // Legacy source keys intentionally remain intact as recovery data.
    }
    const reg = await registry();
    const profile = reg.profiles.find(p => p.id === reg.activeId)!;
    const checked = await inspectProfile(profile);
    if (checked.issue) throw new Error(checked.issue);
    bindProfileStorage(reg.activeId, profile.storage === "legacy");
  });
}
export async function readProfileData(id: string): Promise<Record<string, string | null>> {
  const reg = await registry();
  if (!reg.profiles.some(p => p.id === id)) throw new Error("Unknown profile");
  return profileData(reg.profiles.find(p => p.id === id)!);
}
export async function listProfiles(): Promise<LocalProfile[]> {
  const reg = await registry();
  return Promise.all(reg.profiles.map(inspectProfile));
}
export type ProfileInput = Pick<LocalProfile, "name" | "photoUri" | "primaryInstrumentId" | "rooms">;

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
      await writeRegistry({ ...reg, profiles: [...reg.profiles, profile] });
      return profile;
    } catch (error) {
      // Never remove any key from a published/existing profile.
      const definitelyUnpublished = !publishing || await registry()
        .then(current => !current.profiles.some(p => p.id === profile.id)).catch(() => false);
      if (definitelyUnpublished) await RawStorage.multiRemove(pairs.map(([key]) => key)).catch(() => {});
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
  // Acquire the same settings queue BEFORE the registry lock (normal saves use
  // this order too). No playback shutdown is needed: the owner is unchanged.
  await enqueueSettingsStorageOperation(() => withProfileLock(async () => {
    const reg = await registry();
    const profile = reg.profiles.find(p => p.id === id);
    if (!profile) throw new Error("Unknown profile");
    // A single key holds all identity fields to avoid partially applied edits.
    const key = dataKey(profile, "metronome_settings");
    const raw = await RawStorage.getItem(key);
    const revision = Crypto.randomUUID();
    await RawStorage.setItem(key, JSON.stringify({
      ...parseSettings(raw), username: input.name,
      primaryInstrumentId: input.primaryInstrumentId ?? undefined,
      profilePhoto: input.photoUri ?? null,
      profileRooms: input.rooms ?? [],
      profileIdentityRevision: revision,
    }));
    if (id === getActiveProfileId()) publishProfileIdentity({
      username: input.name, primaryInstrumentId: input.primaryInstrumentId ?? undefined,
      profileIdentityRevision: revision,
    });
  }));
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
    const destination = (await listProfiles()).find(p => p.id === id);
    if (!destination || destination.issue) throw new Error("This profile needs recovery before switching");
    await beforeSwitch();
    sealProfileStorage();
    await drainProfileWrites();
    await withProfileLock(async () => {
      const reg = await registry();
      if (!reg.profiles.some(p => p.id === id)) throw new Error("Unknown profile");
      await writeRegistry({ ...reg, activeId: id });
    });
    await reloadProfileRuntime();
  } catch (error) {
    reopenProfileStorage();
    throw error;
  } finally { switching = false; }
}

/** UI requires a confirmation naming the inactive profile and permanent scope. */
export async function deleteProfile(id: string): Promise<void> {
  if (id === getActiveProfileId()) throw new Error("Switch to another profile before deleting this one");
  await withProfileLock(async () => {
    const reg = await registry();
    const profile = reg.profiles.find(p => p.id === id);
    const removed = await deletedProfileIds();
    if (!profile) {
      // A remove interrupted after publication can be retried from its open UI.
      if (!removed.includes(id)) throw new Error("Unknown profile");
      const keys = (await RawStorage.getAllKeys()).filter(key =>
        key.startsWith(profileKey(id, "")) || id === "legacy" && isLegacyDataKey(key));
      await RawStorage.multiRemove(keys);
      return;
    }
    if (reg.profiles.length <= 1) throw new Error("The last profile cannot be deleted");
    if (!reg.profiles.some(p => p.id === getActiveProfileId())) throw new Error("Reload before deleting profiles");
    await RawStorage.setItem(DELETED_PROFILES_KEY, JSON.stringify([...new Set([...removed, id])]));
    // Publish removal before clearing. Old browser tabs now fail their write gate.
    await writeRegistry({
      ...reg, activeId: reg.activeId === id ? getActiveProfileId() : reg.activeId,
      profiles: reg.profiles.filter(p => p.id !== id),
    });
    const keys = new Set(Object.keys(await profileData(profile)).map(key => dataKey(profile, key)));
    if (id === "legacy") (await RawStorage.getAllKeys()).filter(isLegacyDataKey).forEach(key => keys.add(key));
    await RawStorage.multiRemove([...keys]);
  });
}

/** Quarantine only malformed identity/settings values; music data is untouched. */
export async function repairProfile(id: string): Promise<void> {
  let active = false;
  try { active = id === getActiveProfileId(); } catch { /* Startup has no bound owner yet. */ }
  try {
    if (active) {
      if (!beforeSwitch) throw new Error("Profile repair is not ready");
      await beforeSwitch();
      sealProfileStorage();
      await drainProfileWrites();
    }
    await enqueueSettingsStorageOperation(() => withProfileLock(async () => {
      const profile = (await recoveryProfiles()).find(p => p.id === id);
      if (!profile) throw new Error("Recover the profile list first");
      for (const key of ["metronome_settings", "metronome_practice_rooms"]) {
        const physical = dataKey(profile, key);
        const raw = await RawStorage.getItem(physical);
        try { if (key === "metronome_settings") parseSettings(raw); else parseRooms(raw); }
        catch {
          const archive = `local_profiles_damaged_${id}_${Crypto.randomUUID()}`;
          await RawStorage.setItem(archive, JSON.stringify({ key: physical, raw }));
          const saved = JSON.parse((await RawStorage.getItem(archive))!);
          if (saved.raw !== raw || saved.key !== physical) throw new Error("Damaged original could not be preserved");
          await RawStorage.setItem(physical, key === "metronome_settings"
            ? JSON.stringify({ username: profile.name }) : "[]");
        }
      }
    }));
    if (active) await reloadProfileRuntime();
  } catch (error) {
    if (active) reopenProfileStorage();
    throw error;
  }
}

async function identicalLegacyKeys(): Promise<string[]> {
  const reg = await registry();
  const legacy = reg.profiles.find(p => p.id === "legacy");
  if (!legacy || legacy.storage === "legacy") return [];
  const originals = await RawStorage.multiGet((await RawStorage.getAllKeys()).filter(isLegacyDataKey));
  const copies = await RawStorage.multiGet(originals.map(([key]) => profileKey("legacy", key)));
  return originals.filter(([, value], i) => value !== null && copies[i][1] === value).map(([key]) => key);
}
export async function getLegacyCleanupCount(): Promise<number> {
  return (await identicalLegacyKeys()).length;
}
/** Caller confirms. Recheck equality under lock; never delete changed or missing copies. */
export async function cleanupLegacyOriginals(): Promise<number> {
  return withProfileLock(async () => {
    const keys = await identicalLegacyKeys();
    await RawStorage.multiRemove(keys);
    return keys.length;
  });
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

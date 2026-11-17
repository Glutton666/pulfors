/* eslint-disable import/first */
jest.unmock("@/lib/profile-storage");
import Raw from "@react-native-async-storage/async-storage";
import Scoped, { PROFILE_REGISTRY_KEY, profileKey, drainProfileWrites } from "../lib/profile-storage";
import {
  initializeProfiles, createProfile, listProfiles, deleteProfile, repairProfile,
  cleanupLegacyOriginals, getLegacyCleanupCount, updateProfile, registerProfileSwitchGuard,
} from "../lib/profiles";
import { getProfileRecoveryCandidates, recoverProfileRegistry, openLegacyDataInPlace } from "../lib/profile-recovery";
import { DELETED_PROFILES_KEY, REGISTRY_BACKUP_KEY } from "../lib/profile-registry";
import { subscribeProfileIdentity } from "../lib/profile-identity";
import { loadSettings, saveSettings } from "../lib/storage";

const reset = () => (Raw as unknown as { __reset(): void }).__reset();
beforeEach(async () => { reset(); await initializeProfiles(); });
afterEach(() => jest.restoreAllMocks());

test("one damaged inactive profile cannot hide healthy siblings", async () => {
  const bad = await createProfile({ name: "Damaged" });
  await Raw.setItem(profileKey(bad.id, "metronome_settings"), "broken");
  const profiles = await listProfiles();
  expect(profiles).toHaveLength(2);
  expect(profiles.find(p => p.id === "legacy")?.issue).toBeUndefined();
  expect(profiles.find(p => p.id === bad.id)?.issue).toBeTruthy();
});

test("malformed active settings fail visibly rather than being replaced at boot", async () => {
  await Scoped.setItem("metronome_settings", "null");
  await expect(initializeProfiles()).rejects.toThrow("damaged");
  expect(await Scoped.getItem("metronome_settings")).toBe("null");
});

test("repair archives exact malformed values and leaves music and other profiles untouched", async () => {
  const bad = await createProfile({ name: "Damaged" });
  await Raw.setItem(profileKey(bad.id, "metronome_settings"), "{bad");
  await Raw.setItem(profileKey(bad.id, "metronome_practice_rooms"), "{}");
  await Raw.setItem(profileKey(bad.id, "practice_book"), '[{"id":"keep"}]');
  await repairProfile(bad.id);
  expect((await listProfiles()).find(p => p.id === bad.id)?.issue).toBeUndefined();
  expect(await Raw.getItem(profileKey(bad.id, "practice_book"))).toBe('[{"id":"keep"}]');
  const archived = await Raw.multiGet((await Raw.getAllKeys()).filter(k => k.startsWith("local_profiles_damaged_")));
  expect(archived.map(([, value]) => JSON.parse(value!).raw).sort()).toEqual(["{bad", "{}"].sort());
  expect((await listProfiles()).find(p => p.id === "legacy")).toBeDefined();
});

test("failed quarantine write never destroys the malformed original", async () => {
  const bad = await createProfile({ name: "Damaged" });
  await Raw.setItem(profileKey(bad.id, "metronome_settings"), "{bad");
  jest.spyOn(Raw, "setItem").mockRejectedValueOnce(new Error("quota"));
  await expect(repairProfile(bad.id)).rejects.toThrow("quota");
  expect(await Raw.getItem(profileKey(bad.id, "metronome_settings"))).toBe("{bad");
});

test("registry recovery discovers real namespaces and preserves the damaged list", async () => {
  const saved = await createProfile({ name: "Still here" });
  await Raw.setItem(PROFILE_REGISTRY_KEY, "{broken registry");
  await expect(initializeProfiles()).rejects.toThrow();
  expect((await getProfileRecoveryCandidates()).some(p => p.id === saved.id)).toBe(true);
  await recoverProfileRegistry(saved.id);
  expect(await Raw.getItem(REGISTRY_BACKUP_KEY)).toBe("{broken registry");
  expect(JSON.parse((await Raw.getItem(PROFILE_REGISTRY_KEY))!).activeId).toBe(saved.id);
  expect((await listProfiles()).find(p => p.id === saved.id)?.name).toBe("Still here");
});

test("recovery cannot silently invent an empty profile", async () => {
  reset();
  await Raw.setItem(PROFILE_REGISTRY_KEY, "bad");
  await expect(recoverProfileRegistry("unknown")).rejects.toThrow("No saved profile");
  expect(await Raw.getItem(PROFILE_REGISTRY_KEY)).toBe("bad");
});

test("cleanup removes only byte-identical originals and never changed or uncopied data", async () => {
  await Raw.setItem("practice_book", "original");
  await Raw.setItem(profileKey("legacy", "practice_book"), "original");
  await Raw.setItem("metronome_settings", '{"bpm":80}');
  await Raw.setItem(profileKey("legacy", "metronome_settings"), '{"bpm":90}');
  await Raw.setItem("uncopied", "keep");
  expect(await getLegacyCleanupCount()).toBe(1);
  expect(await cleanupLegacyOriginals()).toBe(1);
  expect(await Raw.getItem("practice_book")).toBeNull();
  expect(await Raw.getItem(profileKey("legacy", "practice_book"))).toBe("original");
  expect(await Raw.getItem("metronome_settings")).toBe('{"bpm":80}');
  expect(await Raw.getItem("uncopied")).toBe("keep");
});

test("only inactive profiles can be deleted and their namespaces cannot be rediscovered", async () => {
  const other = await createProfile({ name: "Delete me" });
  await Raw.setItem(profileKey(other.id, "practice_book"), "private");
  await expect(deleteProfile("legacy")).rejects.toThrow("Switch");
  await deleteProfile(other.id);
  expect(await Raw.getItem(profileKey(other.id, "practice_book"))).toBeNull();
  expect((await listProfiles()).map(p => p.id)).toEqual(["legacy"]);
  expect(JSON.parse((await Raw.getItem(DELETED_PROFILES_KEY))!)).toContain(other.id);
  // Even residual keys after an interrupted remove must not revive a deleted profile.
  await Raw.setItem(profileKey(other.id, "residual"), "leftover");
  await Raw.setItem(PROFILE_REGISTRY_KEY, "bad");
  expect((await getProfileRecoveryCandidates()).some(p => p.id === other.id)).toBe(false);
});

test("an old browser session cannot recreate a deleted profile by writing", async () => {
  const reg = JSON.parse((await Raw.getItem(PROFILE_REGISTRY_KEY))!);
  await Raw.setItem(PROFILE_REGISTRY_KEY, JSON.stringify({ ...reg, profiles: [] }));
  await expect(Scoped.setItem("late", "no")).rejects.toThrow("removed");
  expect(await Raw.getItem(profileKey("legacy", "late"))).toBeNull();
  await expect(drainProfileWrites()).rejects.toThrow("removed");
});

test("active identity edit does not stop playback and stale saves preserve the new identity", async () => {
  const guard = jest.fn(async () => {});
  const removeGuard = registerProfileSwitchGuard(guard);
  const event = jest.fn();
  const unsubscribe = subscribeProfileIdentity(event);
  try {
    const old = await loadSettings();
    await updateProfile("legacy", { name: "New name", primaryInstrumentId: "violin" });
    expect(guard).not.toHaveBeenCalled();
    expect(event).toHaveBeenCalledWith(expect.objectContaining({ username: "New name" }));
    await saveSettings({ ...old, username: "Old name", bpm: 150 });
    const value = await loadSettings();
    expect(value.username).toBe("New name");
    expect(value.primaryInstrumentId).toBe("violin");
    expect(value.bpm).toBe(150);
  } finally { removeGuard(); unsubscribe(); }
});

test("normal identity edits using the current revision remain possible", async () => {
  await updateProfile("legacy", { name: "First" });
  const value = await loadSettings();
  await saveSettings({ ...value, username: "Second" });
  expect((await loadSettings()).username).toBe("Second");
});

test("an explicit quota fallback uses untouched originals without cloning them", async () => {
  reset();
  await Raw.setItem("metronome_settings", '{"bpm":92,"username":"Original"}');
  await Raw.setItem("practice_book", "music");
  await Raw.setItem(profileKey("legacy", "practice_book"), "music");
  // A new runtime is required for a different backing, just like a profile switch.
  await openLegacyDataInPlace();
  expect(await Raw.getItem(profileKey("legacy", "practice_book"))).toBeNull();
  await jest.isolateModulesAsync(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Fresh runtime without Jest's unsupported dynamic-import VM path.
    const freshProfiles = require("../lib/profiles") as typeof import("../lib/profiles");
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- The backing must be bound only in the isolated runtime.
    const freshStore = (require("../lib/profile-storage") as typeof import("../lib/profile-storage")).default;
    // The isolated module registry also creates an isolated AsyncStorage mock.
    // Seed that runtime explicitly rather than reading the outer mock's Map.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const freshRaw = require("@react-native-async-storage/async-storage").default as typeof Raw;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const freshRecovery = require("../lib/profile-recovery") as typeof import("../lib/profile-recovery");
    await freshRaw.setItem("metronome_settings", '{"bpm":92,"username":"Original"}');
    await freshRaw.setItem("practice_book", "music");
    await freshRecovery.openLegacyDataInPlace();
    await freshProfiles.initializeProfiles();
    expect(await freshStore.getItem("practice_book")).toBe("music");
    await freshStore.setItem("new_music", "new");
    expect(await freshRaw.getItem("new_music")).toBe("new");
    expect(await freshStore.getAllKeys()).not.toContain(PROFILE_REGISTRY_KEY);
    expect(await freshProfiles.cleanupLegacyOriginals()).toBe(0);
  });
  expect(await Raw.getItem("metronome_settings")).toBe('{"bpm":92,"username":"Original"}');
});

test("in-place fallback never replaces an existing registered profile", async () => {
  const before = await Raw.getItem(PROFILE_REGISTRY_KEY);
  await Raw.setItem("practice_book", "retained old original");
  await expect(openLegacyDataInPlace()).rejects.toThrow("Profiles already");
  expect(await Raw.getItem(PROFILE_REGISTRY_KEY)).toBe(before);
});

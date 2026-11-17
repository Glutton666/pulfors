/* eslint-disable import/first */
jest.unmock("@/lib/profile-storage");
import Raw from "@react-native-async-storage/async-storage";
import Scoped, { drainProfileWrites, profileKey, PROFILE_REGISTRY_KEY, sealProfileStorage } from "../lib/profile-storage";
import { initializeProfiles, createProfile, readProfileData, listProfiles, registerProfileSwitchGuard, switchProfile } from "../lib/profiles";
import { restoreFromJson, rollbackPendingRestoreIfAny } from "../lib/backup/full";
import { RESTORE_SNAPSHOT_KEY } from "../lib/backup/shared";
import { createScoreDocument } from "../lib/score-storage";
import { saveSettings, loadSettings } from "../lib/storage";
import { updateProfile } from "../lib/profiles";

const reset = () => (Raw as unknown as { __reset(): void }).__reset();
const backup = (data: Record<string, string | null>, schemaVersion?: number) => JSON.stringify({
  _meta: { app: "metronome", version: 2, createdAt: "2026-01-01", keyCount: Object.keys(data).length },
  ...(schemaVersion !== undefined ? { schemaVersion } : {}), data,
});
beforeEach(async () => { reset(); await initializeProfiles(); });
afterEach(() => { jest.restoreAllMocks(); });

test("imports legacy and current backups as distinct profiles, preserving names and active data", async () => {
  await Scoped.setItem("metronome_settings", JSON.stringify({ bpm: 77, username: "Same" }));
  const input = { metronome_settings: JSON.stringify({ bpm: 130, username: "Same" }), practice_book: "[]" };
  const old = await restoreFromJson(backup(input));
  const current = await restoreFromJson(backup(input, 1));
  expect(old.success).toBe(true); expect(current.success).toBe(true);
  expect(old.profileId).not.toBe(current.profileId);
  expect((await listProfiles()).length).toBe(3);
  expect(await readProfileData(old.profileId!)).toEqual(input);
  expect(JSON.parse((await Scoped.getItem("metronome_settings"))!).bpm).toBe(77);
});

test("duplicate document IDs remain independent because their profile namespaces differ", async () => {
  const doc = createScoreDocument({ title: "original", parts: [{ instrumentId: "piano" }] });
  const key = `metronome_score_${doc.id}`;
  await Scoped.setItem(key, JSON.stringify(doc));
  const incoming = { ...doc, metadata: { ...doc.metadata, title: "import" } };
  const result = await restoreFromJson(backup({ metronome_scores_v1: JSON.stringify([doc.id]), [key]: JSON.stringify(incoming) }));
  expect(result.success).toBe(true);
  expect(JSON.parse((await Scoped.getItem(key))!).metadata.title).toBe("original");
  expect(JSON.parse((await readProfileData(result.profileId!))[key]!).metadata.title).toBe("import");
});

test("partial import write failure never changes an existing profile or publishes a broken one", async () => {
  await Scoped.setItem("practice_book", '[{"id":"original"}]');
  const original = Raw.multiSet.bind(Raw);
  jest.spyOn(Raw, "multiSet").mockImplementationOnce(async pairs => {
    await original(pairs.slice(0, 1));
    throw new Error("disk full");
  });
  const result = await restoreFromJson(backup({ metronome_settings: '{"bpm":200}', practice_book: "[]" }));
  expect(result).toMatchObject({ success: false, errorCode: "io" });
  expect(await Scoped.getItem("practice_book")).toBe('[{"id":"original"}]');
  expect((await listProfiles()).length).toBe(1);
});

test("failed registry publication cannot remove another profile", async () => {
  const original = Raw.setItem.bind(Raw);
  jest.spyOn(Raw, "setItem").mockImplementation(async (key, value) => {
    if (key === PROFILE_REGISTRY_KEY) throw new Error("registry unavailable");
    return original(key, value);
  });
  const result = await restoreFromJson(backup({ metronome_settings: '{"bpm":200}' }));
  expect(result.success).toBe(false);
  expect((await listProfiles()).length).toBe(1);
});

test("parallel imports each add their own new profile", async () => {
  const results = await Promise.all([91, 132, 160].map(bpm => restoreFromJson(backup({ metronome_settings: JSON.stringify({ bpm }) }))));
  expect(results.every(result => result.success)).toBe(true);
  expect(new Set(results.map(result => result.profileId)).size).toBe(3);
  expect((await listProfiles()).length).toBe(4);
});

test("broken JSON, corrupt score documents and unknown future versions leave registry unchanged", async () => {
  const before = await Raw.getItem(PROFILE_REGISTRY_KEY);
  for (const json of ["broken", backup({ "metronome_score_bad": '{"id":"bad"}' }), backup({ practice_book: "{}" }),
    backup({ metronome_settings: '{"bpm":"bad"}' }), backup({}, 999)]) {
    expect((await restoreFromJson(json)).success).toBe(false);
  }
  expect(await Raw.getItem(PROFILE_REGISTRY_KEY)).toBe(before);
});

test("unrecognized backup keys cannot write device metadata", async () => {
  const result = await restoreFromJson(backup({ metronome_settings: '{"bpm":100}', [PROFILE_REGISTRY_KEY]: "malicious" }));
  expect(result.success).toBe(true);
  expect((await readProfileData(result.profileId!))[PROFILE_REGISTRY_KEY]).toBeUndefined();
});

test("pending legacy restore snapshots are recovered before migration and retained on I/O failure", async () => {
  const snapshot = JSON.stringify({ keys: ["metronome_settings"], data: { metronome_settings: '{"bpm":88}' } });
  await Raw.setItem(RESTORE_SNAPSHOT_KEY, snapshot);
  const result = await restoreFromJson(backup({ metronome_settings: '{"bpm":200}' }));
  expect(result).toMatchObject({ success: false, recoveryStatus: "rollback_pending" });
  const spy = jest.spyOn(Raw, "multiSet").mockRejectedValueOnce(new Error("disk"));
  expect(await rollbackPendingRestoreIfAny()).toBe(false);
  expect(await Raw.getItem(RESTORE_SNAPSHOT_KEY)).toBe(snapshot);
  spy.mockRestore();
  expect(await rollbackPendingRestoreIfAny()).toBe(true);
  expect(await Raw.getItem("metronome_settings")).toBe('{"bpm":88}');
  expect(await Raw.getItem(RESTORE_SNAPSHOT_KEY)).toBeNull();
});

test("legacy snapshot without an envelope still recovers and corrupt snapshots do not loop", async () => {
  await Raw.setItem(RESTORE_SNAPSHOT_KEY, '{"metronome_settings":"{\\"bpm\\":90}"}');
  expect(await rollbackPendingRestoreIfAny()).toBe(true);
  await Raw.setItem(RESTORE_SNAPSHOT_KEY, "broken");
  expect(await rollbackPendingRestoreIfAny()).toBe(false);
  expect(await Raw.getItem(RESTORE_SNAPSHOT_KEY)).toBeNull();
});

test("migration interrupted before publication retries from untouched originals", async () => {
  reset();
  await Raw.setItem("practice_book", '[{"id":"legacy"}]');
  const original = Raw.multiSet.bind(Raw);
  jest.spyOn(Raw, "multiSet").mockImplementationOnce(async pairs => {
    await original(pairs.slice(0, 1)); throw new Error("interrupted");
  });
  await expect(initializeProfiles()).rejects.toThrow("interrupted");
  expect(await Raw.getItem(PROFILE_REGISTRY_KEY)).toBeNull();
  expect(await Raw.getItem("practice_book")).toBe('[{"id":"legacy"}]');
  await initializeProfiles();
  expect(await Scoped.getItem("practice_book")).toBe('[{"id":"legacy"}]');
});

test("all content domains use separate physical keys including settings, sample maps and logs", async () => {
  const second = await createProfile({ name: "Second" });
  const keys = ["practice_book", "metronome_settings", "metronome_activity_log", "metronome_practice_rooms", "metronome_scores_v1",
    "lab_staff_notebooks_v1", "@note_samples", "@note_sample_names", "@note_sample_sources", "@note_sample_channels",
    "@note_sample_volumes", "@note_sample_speeds", "@note_sample_metro_channels_beat", "metronome_keyboard_bindings_by_mode_v1"];
  for (const key of keys) await Scoped.setItem(key, JSON.stringify({ owner: "first" }));
  const data = await readProfileData(second.id);
  for (const key of keys) {
    expect(await Raw.getItem(profileKey("legacy", key))).toBe('{"owner":"first"}');
    expect(data[key]).not.toBe('{"owner":"first"}');
  }
});

test("delayed writes retain their original owner; closed sessions reject rather than rebind", async () => {
  const second = await createProfile({ name: "Second" });
  let release!: () => void;
  const original = Raw.setItem.bind(Raw);
  jest.spyOn(Raw, "setItem").mockImplementationOnce(async (key, value) => {
    await new Promise<void>(resolve => { release = resolve; }); await original(key, value);
  });
  const writing = Scoped.setItem("late", "first");
  sealProfileStorage();
  await expect(Scoped.setItem("after", "no")).rejects.toThrow("closed");
  release(); await writing; await drainProfileWrites();
  expect(await Raw.getItem(profileKey("legacy", "late"))).toBe("first");
  expect((await readProfileData(second.id)).late).toBeUndefined();
});

test("a failed outgoing save blocks a switch before the registry can change", async () => {
  const second = await createProfile({ name: "Second" });
  const before = await Raw.getItem(PROFILE_REGISTRY_KEY);
  const remove = registerProfileSwitchGuard(async () => { throw new Error("unsaved"); });
  try { await expect(switchProfile(second.id)).rejects.toThrow("unsaved"); }
  finally { remove(); }
  expect(await Raw.getItem(PROFILE_REGISTRY_KEY)).toBe(before);
});

test("removing a photo survives a later settings snapshot and never changes the active profile", async () => {
  const second = await createProfile({ name: "Photo", photoUri: "file:///photo.jpg" });
  await updateProfile(second.id, { name: "Photo", photoUri: undefined });
  const updated = (await listProfiles()).find(p => p.id === second.id)!;
  expect(updated.photoUri).toBeUndefined();
  await Scoped.setItem("metronome_settings", '{"bpm":100,"profilePhoto":null}');
  const settings = await loadSettings();
  await saveSettings({ ...settings, profilePhoto: "file:///stale.jpg" });
  expect(JSON.parse((await Scoped.getItem("metronome_settings"))!).profilePhoto).toBeNull();
});

test("pending all-profile reset erases retained originals instead of migrating them again", async () => {
  await Raw.setItem("practice_book", '[{"id":"legacy-original"}]');
  await Raw.setItem("local_profiles_reset_pending_v1", "legacy");
  await initializeProfiles();
  expect(await Raw.getItem("practice_book")).toBeNull();
  expect(await Scoped.getItem("practice_book")).toBeNull();
  expect((await listProfiles()).length).toBe(1);
  expect(await Raw.getItem("local_profiles_reset_pending_v1")).toBeNull();
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CUSTOM_TUNING_SETS_KEY, loadCustomTuningSets, saveCustomTuningSets,
  updateCustomTuningTarget, parseTuningNote, validateCustomTuningSets, validateTuningFrequency,
  type CustomTuningSet,
} from "@/lib/custom-tuning-sets";
import { SIGNAL_SENSITIVITY_KEY } from "@/lib/signal-noise-gate";
import { ALL_KEYS, sanitizeBackupData } from "@/lib/backup/shared";

const sets = (): CustomTuningSet[] => [{
  id: "drums", name: "드럼", groups: [{ id: "tom", name: "스몰탐", targets: [
    { id: "top", name: "상피", frequency: 220 },
    { id: "bottom", name: "하피", frequency: null },
  ] }],
}];
beforeEach(async () => { await AsyncStorage.clear(); });
test("set/group/head hierarchy persists, updates a captured head, and supports deletions", async () => {
  await saveCustomTuningSets(sets());
  await updateCustomTuningTarget("drums", "tom", "bottom", 246.94);
  expect((await loadCustomTuningSets())[0].groups[0].targets[1].frequency).toBe(246.94);
  const changed = await loadCustomTuningSets();
  changed[0].name = "My drum kit";
  changed[0].groups[0].targets.splice(0, 1);
  await saveCustomTuningSets(changed);
  expect((await loadCustomTuningSets())[0].groups[0].targets).toHaveLength(1);
  await saveCustomTuningSets([]);
  expect(await loadCustomTuningSets()).toEqual([]);
});
test("capture patches only its target and does not resurrect deleted parts", async () => {
  const first = sets();
  const queued = saveCustomTuningSets(first);
  const captured = updateCustomTuningTarget("drums", "tom", "bottom", 300);
  await Promise.all([queued, captured]);
  expect((await loadCustomTuningSets())[0].groups[0].targets[1].frequency).toBe(300);
  await saveCustomTuningSets([]);
  await expect(updateCustomTuningTarget("drums", "tom", "bottom", 400)).rejects.toThrow();
  expect(await loadCustomTuningSets()).toEqual([]);
});
test("failed storage writes reject and leave the previous saved document usable", async () => {
  await saveCustomTuningSets(sets());
  const write = jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("full"));
  await expect(saveCustomTuningSets([])).rejects.toThrow("full");
  write.mockRestore();
  expect((await loadCustomTuningSets())[0].name).toBe("드럼");
  await updateCustomTuningTarget("drums", "tom", "bottom", 240);
});
test("note/octave input supports sharps and flats; invalid or out-of-range data is rejected", () => {
  expect(parseTuningNote("A4")).toBe(440);
  expect(parseTuningNote("F#2")).toBeCloseTo(92.5, 1);
  expect(parseTuningNote("Bb3")).toBeCloseTo(233.08, 1);
  for (const value of ["Am", "C", "H3", "A100", "C-2"]) expect(parseTuningNote(value)).toBeNull();
  for (const value of ["0", "NaN", "20001", "-440"]) expect(validateTuningFrequency(value)).toBeNull();
  const bad = sets(); bad[0].groups[0].targets[0].frequency = Infinity;
  expect(() => validateCustomTuningSets(bad)).toThrow();
  bad[0].groups[0].targets[0].frequency = 440;
  bad[0].groups[0].targets[0].id = "tom";
  expect(() => validateCustomTuningSets(bad)).toThrow();
});
test("manual backup carries custom sets and sensitivity, rejecting corrupt imports", async () => {
  expect(ALL_KEYS).toContain(CUSTOM_TUNING_SETS_KEY);
  expect(ALL_KEYS).toContain(SIGNAL_SENSITIVITY_KEY);
  const backup = sanitizeBackupData({
    [CUSTOM_TUNING_SETS_KEY]: JSON.stringify(sets()), [SIGNAL_SENSITIVITY_KEY]: "0.5",
  });
  expect(JSON.parse(backup[CUSTOM_TUNING_SETS_KEY]!)).toEqual(sets());
  expect(backup[SIGNAL_SENSITIVITY_KEY]).toBe("0.5");
  expect(() => sanitizeBackupData({ [CUSTOM_TUNING_SETS_KEY]: "{}" })).toThrow();
});

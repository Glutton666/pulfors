import { test } from "node:test";
import assert from "node:assert/strict";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createStaffNotebook, DEFAULT_NOTEBOOK_SETTINGS, listStaffNotebooks, saveStaffNotebook } from "../lib/staff-notebook";

test("legacy ink-only notebooks remain readable and keep their exact points", async () => {
  const legacy = { id: "legacy", title: "Ink", updatedAt: 10, pages: [{ id: "page", strokes: [{ id: "s", width: 3, points: [{ x: 60, y: 102 }] }] }] };
  await AsyncStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([legacy]));
  const restored = await listStaffNotebooks();
  assert.deepEqual(restored, [legacy]);
  await saveStaffNotebook({ ...restored[0], settings: { ...DEFAULT_NOTEBOOK_SETTINGS } });
  assert.deepEqual((await listStaffNotebooks())[0].pages, legacy.pages);
});
test("symbols, current writing anchor and follow settings round-trip without touching other notebooks", async () => {
  const untouched = createStaffNotebook("Untouched");
  await AsyncStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([untouched]));
  const note = createStaffNotebook("Symbols");
  note.pages[0].stamps = [{ id: "mark", glyph: "repeat_end", x: 220, y: 257, size: 44 }];
  note.pages[0].anchor = { x: 220, y: 257 };
  note.settings = { ...DEFAULT_NOTEBOOK_SETTINGS, lineUnit: "phrase", playbackZoom: 1.75, random: true, follow: true };
  await saveStaffNotebook(note);
  const result = await listStaffNotebooks();
  assert.deepEqual(result[0].pages, note.pages);
  assert.deepEqual(result[0].settings, note.settings);
  assert.deepEqual(result[1], untouched);
});
test("malformed geometry is refused and does not overwrite the previous saved library", async () => {
  const note = createStaffNotebook("Safe");
  await AsyncStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([note]));
  const before = await AsyncStorage.getItem("lab_staff_notebooks_v1");
  await assert.rejects(() => saveStaffNotebook({ ...note, pages: [{ id: "bad", strokes: [], stamps: [{ id: "bad", glyph: "sharp", x: NaN, y: 5, size: 26 }] }] }));
  assert.equal(await AsyncStorage.getItem("lab_staff_notebooks_v1"), before);
});

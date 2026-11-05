import { test } from "node:test";
import assert from "node:assert/strict";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createStaffNotebook, DEFAULT_NOTEBOOK_SETTINGS, listStaffNotebooks, saveStaffNotebook } from "../lib/staff-notebook";
import { eraseNotebookGesture } from "../lib/notebook-erasing";

test("notation meter survives save and restore separately from playback meter", async () => {
  await AsyncStorage.setItem("lab_staff_notebooks_v1", "[]");
  const note = createStaffNotebook("6/8 notation");
  note.settings = { ...DEFAULT_NOTEBOOK_SETTINGS, beatsPerMeasure: 4, notationMeter: { beats: 6, unit: 8 } };
  await saveStaffNotebook(note);
  assert.deepEqual((await listStaffNotebooks())[0].settings, note.settings);
  for (const notationMeter of [{ beats: 0, unit: 8 }, { beats: 13, unit: 8 }, { beats: 6, unit: 3 }, { beats: 1.5, unit: 4 }]) {
    const before = await AsyncStorage.getItem("lab_staff_notebooks_v1");
    await assert.rejects(() => saveStaffNotebook({ ...note, settings: { ...note.settings, notationMeter } as any }));
    assert.equal(await AsyncStorage.getItem("lab_staff_notebooks_v1"), before);
  }
});

test("dotted thirty-second rests round-trip inside a tuplet", async () => {
  await AsyncStorage.setItem("lab_staff_notebooks_v1", "[]");
  const note = createStaffNotebook("Rest tuplet");
  note.pages[0].stamps = [
    { id: "r", glyph: "rest-thirty_second", x: 55, y: 102, size: 26, dotted: true },
    { id: "n", glyph: "quarter", x: 90, y: 102, size: 26 },
  ];
  note.pages[0].tuplets = [{ id: "t", stampIds: ["r", "n"] }];
  await saveStaffNotebook(note);
  assert.deepEqual((await listStaffNotebooks())[0].pages, note.pages);
});

test("legacy ink-only notebooks remain readable and keep their exact points", async () => {
  const legacy = { id: "legacy", title: "Ink", updatedAt: 10, pages: [{ id: "page", strokes: [{ id: "s", width: 3, points: [{ x: 60, y: 102 }] }] }] };
  await AsyncStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([legacy]));
  const restored = await listStaffNotebooks();
  assert.deepEqual(restored, [legacy]);
  await saveStaffNotebook({ ...restored[0], settings: { ...DEFAULT_NOTEBOOK_SETTINGS } });
  assert.deepEqual((await listStaffNotebooks())[0].pages, legacy.pages);
});
test("colored ink, thickness and visual vector/ink cuts survive save/reopen; invalid styles are rejected", async () => {
  await AsyncStorage.setItem("lab_staff_notebooks_v1", "[]");
  const note = createStaffNotebook("Color and cuts");
  note.pages[0].strokes = [{ id: "s", width: 6, color: "#2468c4", points: [{ x: 100, y: 110 }, { x: 300, y: 110 }] }];
  note.pages[0].stamps = [{ id: "n", glyph: "quarter", x: 200, y: 110, size: 26 }];
  note.pages[0] = eraseNotebookGesture(note.pages[0], [{ x: 200, y: 110 }], "partial");
  await saveStaffNotebook(note);
  assert.deepEqual((await listStaffNotebooks())[0].pages, note.pages);
  const before = await AsyncStorage.getItem("lab_staff_notebooks_v1");
  for (const patch of [{ color: "url(unsafe)" }, { erasures: [{ width: -1, points: [{ x: 0, y: 0 }] }] },
    { erasures: [{ width: 1, points: [] }] }, { erasures: [{ width: 1, points: [{ x: Infinity, y: 0 }] }] }]) {
    await assert.rejects(() => saveStaffNotebook({ ...note, pages: [{ ...note.pages[0], strokes: [{ ...note.pages[0].strokes[0], ...patch }] }] }));
    assert.equal(await AsyncStorage.getItem("lab_staff_notebooks_v1"), before);
  }
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
test("roles, dots, attachments, tuplets, explicit rows and navigation settings survive save/load", async () => {
  await AsyncStorage.setItem("lab_staff_notebooks_v1", "[]");
  const note = createStaffNotebook("New notation");
  note.settings = { ...DEFAULT_NOTEBOOK_SETTINGS, rowsPerPage: 3, beatsPerMeasure: 4, followSymbols: true, snap: false };
  note.pages[0].staffCount = 3;
  note.pages[0].stamps = [
    { id: "n", glyph: "eighth", x: 100, y: 102, size: 26, role: "strong", dotted: true },
    { id: "r", glyph: "rest-quarter", x: 150, y: 102, size: 26 },
    { id: "a", glyph: "sharp", x: 90, y: 95, size: 26, attachTo: "n" },
  ];
  note.pages[0].tuplets = [{ id: "t", stampIds: ["n", "r"] }];
  note.lastNote = { pageId: note.pages[0].id, stampId: "n" };
  await saveStaffNotebook(note);
  const loaded = (await listStaffNotebooks())[0];
  assert.deepEqual(loaded.pages, note.pages);
  assert.deepEqual(loaded.settings, note.settings);
  assert.deepEqual(loaded.lastNote, note.lastNote);
  const before = await AsyncStorage.getItem("lab_staff_notebooks_v1");
  await assert.rejects(() => saveStaffNotebook({ ...note, lastNote: { pageId: "missing", stampId: "n" } }));
  await assert.rejects(() => saveStaffNotebook({ ...note, pages: [{ ...note.pages[0], tuplets: [{ id: "broken", stampIds: ["n", "absent"] }] }] }));
  assert.equal(await AsyncStorage.getItem("lab_staff_notebooks_v1"), before);
});

import { captureSelection, removeSelection, transformSelection } from "../lib/notebook-editing";
import { layoutNotebookMusic } from "../lib/notebook-music-layout";
import { defaultSticking, flamOffset, notebookPercussionOrder, stickingCharacter, updateSticking } from "../lib/notebook-percussion";
import { buildNotebookNotationPlan } from "../lib/notebook-playback-plan";
import { projectNotebookPortrait } from "../lib/notebook-portrait-layout";
import { DEFAULT_NOTEBOOK_SETTINGS, isNotebook, type StaffNotebook, type StaffStamp } from "../lib/staff-notebook";

jest.mock("@/lib/profile-storage", () => ({ __esModule: true, default: {} }));

const stamp = (id: string, glyph: string, x: number, y = 102): StaffStamp => ({ id, glyph, x, y, size: 26 });
const value = { ...defaultSticking, lines: ["R", "손"] as [string, string] };
const source = (stamps: StaffStamp[]): StaffNotebook => ({
  id: "test", title: "Percussion", updatedAt: 1, settings: { ...DEFAULT_NOTEBOOK_SETTINGS, measuresPerRow: 1, rowsPerPage: 1 },
  pages: [{ id: "p", staffCount: 1, strokes: [], stamps }],
});

test("two independent lines and sizes stay with their note or grace note after reflow, folding, movement and copy", () => {
  const withFlam = { ...stamp("b", "half", 240), sticking: value, flam: { offset: -23, sticking: { size: 18, lines: ["L", ""] as [string, string] } } };
  const document = source([{ ...stamp("a", "half", 130), dotted: true }, withFlam]);
  const spread = layoutNotebookMusic(document, { allowCrowded: true }).note;
  expect(isNotebook(JSON.parse(JSON.stringify(spread)))).toBe(true);
  const parts = spread.pages.flatMap((p) => p.stamps ?? []).filter((s) => s.split?.sourceId === "b");
  expect(parts).toHaveLength(2);
  expect(parts[0]).toMatchObject({ id: "b", sticking: value, flam: withFlam.flam });
  expect(parts[1]).toMatchObject({ flam: undefined, sticking: undefined });
  expect(notebookPercussionOrder(spread).map(({ id, part }) => `${id}:${part}`)).toEqual(["a:note", "b:flam", "b:note"]);
  const tailPage = spread.pages.find((p) => p.stamps?.includes(parts[1]))!;
  const copy = captureSelection(tailPage, { stampIds: [parts[1].id], strokeIds: [] }, spread);
  expect(copy.stamps).toEqual([expect.objectContaining({ id: "b", glyph: "half", sticking: value, flam: withFlam.flam })]);
  const add = transformSelection(copy, { stampIds: ["b"], strokeIds: [] }, { x: 180, y: 102 }, true, () => "copy");
  expect(add.page.stamps?.find((s) => s.id === "copy")).toMatchObject({ x: expect.any(Number), flam: withFlam.flam, sticking: value });
  const owner = spread.pages.find((p) => p.stamps?.includes(parts[0]))!;
  const projection = projectNotebookPortrait(owner, spread.settings!, 1, .8, 2);
  expect(projection.page.stamps?.find((s) => s.id === "b")).toMatchObject({ flam: withFlam.flam, sticking: value });
  const moved = transformSelection(owner, { stampIds: ["b"], strokeIds: [] }, { x: 23, y: 0 });
  expect(moved.page.stamps?.find((s) => s.id === "b")).toMatchObject({ x: parts[0].x + 23, flam: withFlam.flam, sticking: value });
  expect(removeSelection(owner, { stampIds: ["b"], strokeIds: [] }).stamps?.some((s) => s.id === "b")).toBe(false);
});

test("rests, generated notation and symbols are skipped without affecting playback timing", () => {
  const clean = source([stamp("one", "eighth", 120), stamp("rest", "rest-eighth", 160), stamp("cue", "accent", 200), stamp("two", "eighth", 245)]);
  clean.pages[0].tuplets = [{ id: "group", stampIds: ["one", "rest", "two"] }];
  const marked = { ...clean, pages: [{ ...clean.pages[0], stamps: clean.pages[0].stamps!.map((s) => s.id === "one"
    ? updateSticking({ ...s, flam: { offset: 20 }, sticking: value }, "flam", { size: 14, lines: ["L", ""] }) : s) }] };
  expect(buildNotebookNotationPlan(marked)).toEqual(buildNotebookNotationPlan(clean));
  expect(notebookPercussionOrder(marked).map(({ id, part }) => [id, part])).toEqual([["one", "note"], ["one", "flam"], ["two", "note"]]);
  expect(marked.pages[0].stamps![0].sticking).toEqual(value);
});

test("flam offset and single-character labels reject malformed persisted entries", () => {
  expect([flamOffset(-140, 21), flamOffset(8, -21), flamOffset(0, -21)]).toEqual([-60, 16, -16]);
  expect(stickingCharacter(" 손 ")).toBe("손");
  expect(stickingCharacter("RL")).toBeNull();
  expect(stickingCharacter("\u200D")).toBeNull();
  expect(isNotebook(source([{ ...stamp("r", "rest-half", 30), flam: { offset: 20 } }]))).toBe(false);
  expect(isNotebook(source([{ ...stamp("n", "half", 30), flam: { offset: 0 } }]))).toBe(false);
  expect(isNotebook(source([{ ...stamp("n", "half", 30), sticking: { size: 18, lines: ["RL", ""] } }]))).toBe(false);
});

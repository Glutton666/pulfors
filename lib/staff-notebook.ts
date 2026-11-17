import AsyncStorage from "@/lib/profile-storage";
import type { PracticeEntry } from "./storage";

export type StaffPoint = { x: number; y: number };
/** Erasure coordinates are local to the object (stamp size / ink width units).
 * Visual cuts travel with an object; they never change musical duration. */
export type StaffErasure = { points: StaffPoint[]; width: number };
export type StaffStroke = { id: string; points: StaffPoint[]; width: number; color?: string; erasures?: StaffErasure[] };
export type NotebookNoteRole = "normal" | "ghost" | "strong";
export type StaffStamp = { id: string; glyph: string; x: number; y: number; size: number; role?: NotebookNoteRole; dotted?: boolean; attachTo?: string; erasures?: StaffErasure[];
  durationBeats?: number; tieTo?: string; tieFrom?: string; chordId?: string; generated?: boolean; measure?: number; order?: number };
export type StaffTuplet = { id: string; stampIds: string[]; ratio?: { actual: number; normal: number } };
export type StaffPage = { id: string; strokes: StaffStroke[]; staffCount?: number; stamps?: StaffStamp[]; anchor?: StaffPoint; tuplets?: StaffTuplet[];
  layoutScale?: number; completedRows?: number[]; blankRows?: number[]; measureCounts?: number[] };
export type NotebookSettings = {
  follow: boolean;
  lineUnit: "measure" | "phrase";
  playbackZoom: number;
  bpm: number;
  random: boolean;
  offsetX: number;
  offsetY: number;
  snap: boolean;
  source?: PracticeEntry;
  beatsPerMeasure?: number;
  notationMeter?: { beats: number; unit: 2 | 4 | 8 | 16 };
  rowsPerPage?: number;
  followSymbols?: boolean;
  measuresPerRow?: number;
  autoSpacing?: boolean;
  autoScale?: boolean;
  showBarlines?: boolean;
  minScale?: number;
  randomUnit?: "measure" | "row";
  randomSigns?: boolean;
  randomInside?: boolean;
  randomSeed?: number;
};
export const DEFAULT_NOTEBOOK_SETTINGS: NotebookSettings = {
  follow: false, lineUnit: "measure", playbackZoom: 1, bpm: 84,
  random: false, offsetX: 0, offsetY: 0, snap: true, beatsPerMeasure: 1, followSymbols: false,
  autoSpacing: false, autoScale: false, showBarlines: false, minScale: 0.65,
  randomUnit: "row", randomSigns: false, randomInside: false, randomSeed: 1,
};
export type StaffNotebook = { id: string; title: string; updatedAt: number; pages: StaffPage[]; settings?: NotebookSettings; lastNote?: { pageId: string; stampId: string } };

const KEY = "lab_staff_notebooks_v1";
const id = () => `staff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const validPoint = (point: StaffPoint) => !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
const validErasures = (value?: StaffErasure[]) => value === undefined || Array.isArray(value) && value.every((cut) =>
  !!cut && Number.isFinite(cut.width) && cut.width > 0 && Array.isArray(cut.points) && cut.points.length > 0 && cut.points.every(validPoint));

export function isNotebook(value: unknown): value is StaffNotebook {
  if (!value || typeof value !== "object") return false;
  const note = value as StaffNotebook;
  const settings = note.settings;
  if (note.lastNote !== undefined && (!note.lastNote || typeof note.lastNote.pageId !== "string" || typeof note.lastNote.stampId !== "string" ||
    !Array.isArray(note.pages) || !note.pages.some((page) => page?.id === note.lastNote!.pageId && Array.isArray(page.stamps) && page.stamps.some((s) => s?.id === note.lastNote!.stampId && /^(whole|half|quarter|eighth|sixteenth|thirty_second)$/.test(s.glyph))))) return false;
  if (settings && (typeof settings !== "object" ||
    !["measure", "phrase"].includes(settings.lineUnit) ||
    ![settings.playbackZoom, settings.bpm, settings.offsetX, settings.offsetY].every(Number.isFinite) ||
    settings.playbackZoom < 0.25 || settings.playbackZoom > 4 || settings.bpm < 20 || settings.bpm > 300 ||
    typeof settings.follow !== "boolean" || typeof settings.random !== "boolean" || typeof settings.snap !== "boolean" ||
    settings.beatsPerMeasure !== undefined && (!Number.isInteger(settings.beatsPerMeasure) || settings.beatsPerMeasure < 1 || settings.beatsPerMeasure > 12) ||
    settings.notationMeter !== undefined && (!settings.notationMeter || typeof settings.notationMeter !== "object" ||
      !Number.isInteger(settings.notationMeter.beats) || settings.notationMeter.beats < 1 || settings.notationMeter.beats > 12 ||
      ![2, 4, 8, 16].includes(settings.notationMeter.unit)) ||
    settings.rowsPerPage !== undefined && (!Number.isInteger(settings.rowsPerPage) || settings.rowsPerPage < 1 || settings.rowsPerPage > 200) ||
    settings.followSymbols !== undefined && typeof settings.followSymbols !== "boolean" ||
    ["autoSpacing", "autoScale", "showBarlines", "randomSigns", "randomInside"].some((key) => settings[key as keyof NotebookSettings] !== undefined && typeof settings[key as keyof NotebookSettings] !== "boolean") ||
    settings.measuresPerRow !== undefined && (!Number.isInteger(settings.measuresPerRow) || settings.measuresPerRow < 1 || settings.measuresPerRow > 32) ||
    settings.minScale !== undefined && (!Number.isFinite(settings.minScale) || settings.minScale < 0.2 || settings.minScale > 1) ||
    settings.randomUnit !== undefined && !["measure", "row"].includes(settings.randomUnit) ||
    settings.randomSeed !== undefined && (!Number.isInteger(settings.randomSeed) || settings.randomSeed < 0))) return false;
  return typeof note.id === "string" && typeof note.title === "string" && Number.isFinite(note.updatedAt) &&
    Array.isArray(note.pages) && note.pages.length > 0 && note.pages.every((page) => !!page && typeof page === "object" &&
      (page.anchor === undefined || !!page.anchor && Number.isFinite(page.anchor.x) && Number.isFinite(page.anchor.y)) &&
      (page.staffCount === undefined || Number.isInteger(page.staffCount) && page.staffCount > 0 && page.staffCount <= 200) &&
      (page.layoutScale === undefined || Number.isFinite(page.layoutScale) && page.layoutScale >= 0.2 && page.layoutScale <= 1) &&
      (page.measureCounts === undefined || Array.isArray(page.measureCounts) && page.measureCounts.length <= (page.staffCount ?? 7) && page.measureCounts.every((n) => Number.isInteger(n) && n >= 1 && n <= 32)) &&
      [page.completedRows, page.blankRows].every((rows) => rows === undefined || Array.isArray(rows) && rows.every((row) => Number.isInteger(row) && row >= 0 && row < (page.staffCount ?? 7))) &&
      (page.stamps === undefined || Array.isArray(page.stamps) && page.stamps.every((stamp) =>
        !!stamp && typeof stamp.id === "string" && typeof stamp.glyph === "string" && stamp.glyph.length <= 40 &&
        [stamp.x, stamp.y, stamp.size].every(Number.isFinite) && stamp.size >= 4 && stamp.size <= 200 &&
         validErasures(stamp.erasures) && (stamp.role === undefined || ["normal", "ghost", "strong"].includes(stamp.role)) &&
         (stamp.dotted === undefined || typeof stamp.dotted === "boolean") &&
         (stamp.durationBeats === undefined || Number.isFinite(stamp.durationBeats) && stamp.durationBeats > 0 && stamp.durationBeats <= 128) &&
         (stamp.tieTo === undefined || typeof stamp.tieTo === "string") &&
         (stamp.tieFrom === undefined || typeof stamp.tieFrom === "string") &&
         (stamp.chordId === undefined || typeof stamp.chordId === "string") &&
         (stamp.generated === undefined || typeof stamp.generated === "boolean") &&
         (stamp.measure === undefined || Number.isInteger(stamp.measure) && stamp.measure >= 0 && stamp.measure <= 100000) &&
         (stamp.order === undefined || Number.isFinite(stamp.order)) &&
        (stamp.attachTo === undefined || typeof stamp.attachTo === "string" && page.stamps?.some((target) => target.id === stamp.attachTo && target.id !== stamp.id)))) &&
      (page.tuplets === undefined || Array.isArray(page.tuplets) && page.tuplets.every((group) =>
        !!group && typeof group.id === "string" && Array.isArray(group.stampIds) && group.stampIds.length >= 2 &&
        (group.ratio === undefined || !!group.ratio && Number.isInteger(group.ratio.actual) && Number.isInteger(group.ratio.normal) && group.ratio.actual >= 1 && group.ratio.actual <= 128 && group.ratio.normal >= 1 && group.ratio.normal <= 128) &&
        new Set(group.stampIds).size === group.stampIds.length &&
        group.stampIds.every((stampId) => page.stamps?.some((stamp) => stamp.id === stampId &&
          /^(whole|half|quarter|eighth|sixteenth|thirty_second|rest-(whole|half|quarter|eighth|sixteenth|thirty_second))$/.test(stamp.glyph))))) &&
      typeof page.id === "string" && Array.isArray(page.strokes) && page.strokes.every((stroke) => !!stroke && typeof stroke === "object" &&
         typeof stroke.id === "string" && Number.isFinite(stroke.width) && stroke.width > 0 && validErasures(stroke.erasures) &&
         (stroke.color === undefined || typeof stroke.color === "string" && /^#[0-9a-f]{6}$/i.test(stroke.color)) &&
        Array.isArray(stroke.points) && stroke.points.every((point) => !!point && typeof point === "object" && Number.isFinite(point.x) && Number.isFinite(point.y))));
}

export function createStaffNotebook(title = "Untitled notebook"): StaffNotebook {
  return { id: id(), title, updatedAt: Date.now(), pages: [{ id: id(), strokes: [], staffCount: 7 }] };
}

export async function listStaffNotebooks(): Promise<StaffNotebook[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Saved notebook data is not a list.");
    if (!parsed.every(isNotebook)) throw new Error("Saved notebook data is malformed.");
    return parsed;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Could not read saved notebooks.");
  }
}

export async function saveStaffNotebook(note: StaffNotebook): Promise<void> {
  try {
    if (!isNotebook(note)) throw new Error("This notebook cannot be saved because its drawing data is malformed.");
    const notes = await listStaffNotebooks();
    const next = { ...note, updatedAt: Date.now() };
    const updated = [next, ...notes.filter((item) => item.id !== note.id)];
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Could not save this notebook.");
  }
}

export async function deleteStaffNotebook(noteId: string): Promise<void> {
  try {
    const notes = await listStaffNotebooks();
    await AsyncStorage.setItem(KEY, JSON.stringify(notes.filter((note) => note.id !== noteId)));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Could not delete this notebook.");
  }
}

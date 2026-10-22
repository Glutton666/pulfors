import AsyncStorage from "@react-native-async-storage/async-storage";

export type StaffPoint = { x: number; y: number };
export type StaffStroke = { id: string; points: StaffPoint[]; width: number };
export type StaffPage = { id: string; strokes: StaffStroke[]; staffCount?: number };
export type StaffNotebook = { id: string; title: string; updatedAt: number; pages: StaffPage[] };

const KEY = "lab_staff_notebooks_v1";
const id = () => `staff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function isNotebook(value: unknown): value is StaffNotebook {
  if (!value || typeof value !== "object") return false;
  const note = value as StaffNotebook;
  return typeof note.id === "string" && typeof note.title === "string" && Number.isFinite(note.updatedAt) &&
    Array.isArray(note.pages) && note.pages.every((page) => !!page && typeof page === "object" &&
      typeof page.id === "string" && Array.isArray(page.strokes) && page.strokes.every((stroke) => !!stroke && typeof stroke === "object" &&
        typeof stroke.id === "string" && Number.isFinite(stroke.width) && stroke.width > 0 &&
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

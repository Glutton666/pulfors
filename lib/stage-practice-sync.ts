import type { PracticeEntry, StageSettings } from "./storage";

export function getOriginalStageEntryId(id: string): string {
  return id.includes("__slot__") ? id.split("__slot__")[0]! : id;
}

export function reconcileStageSetlist(
  saved: PracticeEntry[],
  practiceBook: PracticeEntry[],
  protectedSlotId?: string,
): PracticeEntry[] {
  return saved.flatMap((slot) => {
    if (slot.id === protectedSlotId) return [slot];
    const latest = practiceBook.find(
      (entry) => entry.id === getOriginalStageEntryId(slot.id),
    );
    return latest ? [{ ...latest, id: slot.id }] : [];
  });
}

export async function loadCurrentStageSetlist(
  loadSaved: () => Promise<PracticeEntry[]>,
  getCurrent: () => {
    practiceBook: PracticeEntry[];
    practiceBookReady: boolean;
    protectedSlotId?: string;
  },
): Promise<PracticeEntry[]> {
  const saved = await loadSaved();
  const current = getCurrent();
  return current.practiceBookReady
    ? reconcileStageSetlist(
        saved,
        current.practiceBook,
        current.protectedSlotId,
      )
    : saved;
}

export function pruneStageKeyMappings(
  keyMappings: StageSettings["keyMappings"],
  practiceBook: PracticeEntry[],
): StageSettings["keyMappings"] {
  const validIds = new Set(practiceBook.map((entry) => entry.id));
  return Object.fromEntries(
    Object.entries(keyMappings).filter(
      ([, entryId]) => typeof entryId === "string" && validIds.has(entryId),
    ),
  );
}
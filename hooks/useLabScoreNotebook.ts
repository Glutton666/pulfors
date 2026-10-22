import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { createScoreClickSession } from "@/lib/score-audio";
import { createStaffNotebook, deleteStaffNotebook, listStaffNotebooks, saveStaffNotebook, type StaffNotebook } from "@/lib/staff-notebook";

export function useLabScoreNotebook() {
  const [notebooks, setNotebooks] = useState<StaffNotebook[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { setNotebooks(await listStaffNotebooks()); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load notebooks."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = useCallback(async (note: StaffNotebook) => {
    try { await saveStaffNotebook(note); await refresh(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save notebook."); return false; }
  }, [refresh]);
  const remove = useCallback(async (id: string) => {
    try { await deleteStaffNotebook(id); await refresh(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to delete notebook."); return false; }
  }, [refresh]);
  return { notebooks, error, refresh, save, remove, create: createStaffNotebook };
}

export function useLabNotebookMetronome(bpm: number) {
  const click = useRef<ReturnType<typeof createScoreClickSession> | null>(null);
  if (!click.current) click.current = createScoreClickSession();
  const [running, setRunning] = useState(false);
  const start = useCallback(() => setRunning(true), []);
  const stop = useCallback(() => { setRunning(false); click.current?.stop(); }, []);
  useEffect(() => {
    if (!running) return;
    let alive = true;
    click.current?.play();
    const interval = setInterval(() => { if (alive) click.current?.play(); }, 60000 / Math.max(30, bpm));
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") { alive = false; clearInterval(interval); click.current?.stop(); setRunning(false); }
    });
    return () => { alive = false; clearInterval(interval); sub.remove(); click.current?.stop(); };
  }, [running, bpm]);
  return { running, start, stop };
}

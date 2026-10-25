import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type RhythmEntryMode = "capture" | "notation";
export const RHYTHM_ENTRY_MODE_KEY = "rhythm_lab_entry_mode_v1";

// Serialize writes across workspace visits so a slow older save cannot win.
let writes: Promise<unknown> = Promise.resolve();
export function useRhythmEntryMode() {
  const [entryMode, setEntryMode] = useState<RhythmEntryMode>("capture");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const changed = useRef(false);
  const mounted = useRef(true);
  const revision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    let live = true;
    void writes.then(() => AsyncStorage.getItem(RHYTHM_ENTRY_MODE_KEY)).then((value) => {
      if (live && !changed.current && (value === "capture" || value === "notation")) setEntryMode(value);
    }).catch(() => { if (live && !changed.current) setError(true); })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; mounted.current = false; };
  }, []);
  const chooseEntryMode = (value: RhythmEntryMode) => {
    changed.current = true;
    setEntryMode(value);
    setReady(true);
    setError(false);
    const ownRevision = ++revision.current;
    writes = writes.catch(() => {}).then(() => AsyncStorage.setItem(RHYTHM_ENTRY_MODE_KEY, value))
      .catch(() => { if (mounted.current && revision.current === ownRevision) setError(true); });
  };
  return { entryMode, chooseEntryMode, entryModeReady: ready, entryModeError: error };
}

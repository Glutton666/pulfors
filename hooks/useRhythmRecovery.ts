import { useEffect, useRef, useState } from "react";
import { rhythmRecovery } from "@/lib/rhythm-lab/recovery";
import type { RhythmDocument } from "@/lib/rhythm-lab/types";

export function useRhythmRecovery(doc: RhythmDocument) {
  const [snapshot, setSnapshot] = useState(rhythmRecovery.snapshot);
  const seeded = useRef(false);
  useEffect(() => {
    const unsubscribe = rhythmRecovery.subscribe(() => setSnapshot(rhythmRecovery.snapshot()));
    void rhythmRecovery.load();
    return unsubscribe;
  }, []);
  useEffect(() => {
    // The snapshot itself is immediate; only storage IO is debounced.
    rhythmRecovery.remember(doc, false, !seeded.current);
    seeded.current = true;
    const timer = setTimeout(() => { void rhythmRecovery.flush(); }, 250);
    return () => clearTimeout(timer);
  }, [doc]);
  return { ...snapshot, retry: () => { void rhythmRecovery.flush(); } };
}

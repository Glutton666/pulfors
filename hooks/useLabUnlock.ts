import { useCallback, useEffect, useRef, useState } from "react";
import { loadLabUnlocked } from "@/lib/practice-room";

/** One persisted Lab gate shared by controls and asynchronous audio producers. */
export function useLabUnlock() {
  const [labUnlocked, setLabUnlocked] = useState(false);
  const labUnlockedRef = useRef(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const unlockLab = useCallback(() => {
    ++generationRef.current;
    labUnlockedRef.current = true;
    setLabUnlocked(true);
  }, []);
  const resetLabUnlock = useCallback(() => {
    ++generationRef.current;
    labUnlockedRef.current = false;
    setLabUnlocked(false);
  }, []);
  const refreshLabUnlock = useCallback(async () => {
    const generation = generationRef.current;
    const unlocked = await loadLabUnlocked();
    if (!mountedRef.current || generation !== generationRef.current) return;
    labUnlockedRef.current = unlocked || labUnlockedRef.current;
    setLabUnlocked(labUnlockedRef.current);
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    void refreshLabUnlock();
    return () => {
      mountedRef.current = false;
      ++generationRef.current;
    };
  }, [refreshLabUnlock]);
  return { labUnlocked, labUnlockedRef, unlockLab, resetLabUnlock, refreshLabUnlock };
}

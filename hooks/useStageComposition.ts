import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useStageMode } from "@/hooks/useStageMode";
import { exitStageWithMenuReturn, getMenuItemCloseTarget } from "@/lib/modal-routing";
import { pruneStageKeyMappings } from "@/lib/stage-practice-sync";
import { loadPracticeBook, subscribePracticeBook } from "@/lib/storage";
import type { PracticeEntry, MetronomeMode } from "@/lib/storage";

type CoreMode = "beat" | "bar" | "note" | "score";
type StageKeyMappings = Partial<Record<string, string>>;

export interface UseStageCompositionParams {
  activeModeRef: MutableRefObject<CoreMode>;
  playbackModeRef: MutableRefObject<string>;
  menuItemReturnRef: MutableRefObject<boolean>;
  menuItemReturnGenerationRef: MutableRefObject<number>;
  setActiveModal: (modal: string | null) => void;
  setSettingsMode: (mode: MetronomeMode) => void;
  setPlaybackMode?: (mode: string) => void;
  coreMode: CoreMode;
  showPolygon: boolean;
  stageSettings: {
    keyMappings: StageKeyMappings;
  };
  updateStageSettings: (patch: { keyMappings: StageKeyMappings }) => void;
}

export interface UseStageCompositionResult {
  stageModeActive: boolean;
  enterStageMode: () => void;
  exitStageModeForPlayback: () => Promise<void>;
  stagePracticeEntries: PracticeEntry[];
  stagePracticeEntriesReady: boolean;
  setStagePracticeEntries: (entries: PracticeEntry[]) => void;
  activeStagePracticeEntryId: string | undefined;
  setActiveStagePracticeEntryId: (id: string | undefined) => void;
}

/**
 * Stage is an overlay around the core metronome modes. This hook owns the
 * overlay lifecycle and its practice-book snapshot; playback itself remains
 * owned by usePlaybackControl in the screen orchestrator.
 */
export function useStageComposition(
  p: UseStageCompositionParams,
): UseStageCompositionResult {
  const { stageModeActive, enterStageMode, exitStageMode } = useStageMode();
  const [stagePracticeEntries, setStagePracticeEntries] = useState<PracticeEntry[]>([]);
  const [stagePracticeEntriesReady, setStagePracticeEntriesReady] = useState(false);
  const stagePracticeEventVersionRef = useRef(0);
  const [activeStagePracticeEntryId, setActiveStagePracticeEntryId] =
    useState<string | undefined>(undefined);

  const enterStageModeForPlayback = useCallback(() => {
    p.playbackModeRef.current = "stage";
    p.setSettingsMode("stage");
    p.setPlaybackMode?.("stage");
    enterStageMode();
  }, [enterStageMode, p]);

  const exitStageModeForPlayback = useCallback(async () => {
    const returnLease = {
      openedFromMenu: p.menuItemReturnRef.current,
      generation: p.menuItemReturnGenerationRef.current,
    };
    p.menuItemReturnRef.current = false;
    p.playbackModeRef.current = p.activeModeRef.current;
    p.setSettingsMode(
      p.activeModeRef.current === "bar"
        ? "bar"
        : p.activeModeRef.current === "note" || p.activeModeRef.current === "score"
          ? "note"
          : "beat",
    );
    await exitStageWithMenuReturn(
      returnLease,
      exitStageMode,
      () => p.menuItemReturnGenerationRef.current,
      () => p.setActiveModal(getMenuItemCloseTarget(returnLease.openedFromMenu)),
    );
  }, [exitStageMode, p]);

  useEffect(() => {
    p.playbackModeRef.current = stageModeActive
      ? "stage"
      : p.showPolygon
        ? "polygon"
        : p.activeModeRef.current;
  }, [p, stageModeActive]);

  useEffect(() => {
    if (!stageModeActive) return;
    let active = true;
    const loadVersion = stagePracticeEventVersionRef.current;
    loadPracticeBook()
      .then((entries) => {
        if (active && stagePracticeEventVersionRef.current === loadVersion) {
          setStagePracticeEntries(entries);
          setStagePracticeEntriesReady(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [stageModeActive]);

  useEffect(() => {
    if (!stageModeActive) setStagePracticeEntriesReady(false);
  }, [stageModeActive]);

  useEffect(() => {
    if (!stageModeActive) return;
    return subscribePracticeBook((entries) => {
      stagePracticeEventVersionRef.current += 1;
      setStagePracticeEntries(entries);
      setStagePracticeEntriesReady(true);
    });
  }, [stageModeActive]);

  useEffect(() => {
    if (!stageModeActive || !stagePracticeEntriesReady) return;
    const keyMappings = pruneStageKeyMappings(
      p.stageSettings.keyMappings,
      stagePracticeEntries,
    );
    if (
      Object.keys(keyMappings).length !==
      Object.keys(p.stageSettings.keyMappings).length
    ) {
      p.updateStageSettings({ keyMappings });
    }
  }, [
    p,
    stageModeActive,
    stagePracticeEntries,
    stagePracticeEntriesReady,
  ]);

  return {
    stageModeActive,
    enterStageMode: enterStageModeForPlayback,
    exitStageModeForPlayback,
    stagePracticeEntries,
    stagePracticeEntriesReady,
    setStagePracticeEntries,
    activeStagePracticeEntryId,
    setActiveStagePracticeEntryId,
  };
}
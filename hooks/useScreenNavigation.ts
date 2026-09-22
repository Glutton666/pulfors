import { useCallback, useEffect, useRef } from "react";
import { Alert, BackHandler, Platform } from "react-native";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  getMenuItemCloseTarget,
  type ActiveModal,
} from "@/lib/modal-routing";
import {
  DEFAULT_TUTORIAL_STATE,
  TUTORIAL_CONTENT_VERSION,
  resetTutorialState,
  saveTutorialState,
  type TutorialAction,
  type TutorialMode,
  type TutorialState,
} from "@/lib/storage";
import type { ScoreDocument } from "@/lib/score-types";
import { MODE_TUTORIALS_ENABLED } from "@/lib/tutorial-config";

type CoreMode = "beat" | "bar" | "note" | "score";

export interface UseScreenNavigationParams {
  setActiveModal: Dispatch<SetStateAction<ActiveModal>>;
  showSettings: boolean;
  showProfile: boolean;
  showAssistant: boolean;
  showTuningGuide: boolean;
  showSignalGen: boolean;
  showPracticeBook: boolean;
  showWorkUp: boolean;
  showFadeOut: boolean;
  showScheduledStart: boolean;
  showDrumKit: boolean;
  showPolygon: boolean;
  showMenu: boolean;
  showOnboarding: boolean;
  showReboot: boolean;
  setShowReboot: Dispatch<SetStateAction<boolean>>;
  coreMode: CoreMode;
  barModeRef: MutableRefObject<boolean>;
  handleBarModeChangeRef: MutableRefObject<(toBarMode: boolean) => void>;
  reopenSignalGenAfterTuningGuideRef: MutableRefObject<boolean>;
  tuningGuideOnSelectRef: MutableRefObject<((frequency: number) => void) | null>;
  playbackModeRef: MutableRefObject<string>;
  setScoreEditorDoc: Dispatch<SetStateAction<ScoreDocument | null>>;
  setScoreMode: (mode: "list" | "editor" | null) => void;
  setTutorialState: Dispatch<SetStateAction<TutorialState>>;
  tutorialModeRef: MutableRefObject<TutorialMode | null>;
  tutorialStateRef: MutableRefObject<TutorialState>;
  setTutorialMode: Dispatch<SetStateAction<TutorialMode | null>>;
  setTutorialLastAction: Dispatch<SetStateAction<TutorialAction | null>>;
}

export function useScreenNavigation(p: UseScreenNavigationParams) {
  const settingsReturnModalRef = useRef<ActiveModal>(null);
  const menuItemReturnRef = useRef(false);
  const menuItemReturnGenerationRef = useRef(0);

  const markMenuItemReturn = useCallback(() => {
    menuItemReturnGenerationRef.current += 1;
    menuItemReturnRef.current = true;
  }, []);
  const clearMenuItemReturn = useCallback(() => {
    menuItemReturnGenerationRef.current += 1;
    menuItemReturnRef.current = false;
  }, []);
  const closeMenuItem = useCallback(() => {
    const target = getMenuItemCloseTarget(menuItemReturnRef.current);
    menuItemReturnGenerationRef.current += 1;
    menuItemReturnRef.current = false;
    p.setActiveModal(target);
  }, [p.setActiveModal]);
  const closeScoreMode = useCallback(() => {
    p.setScoreEditorDoc(null);
    p.setScoreMode(null);
    clearMenuItemReturn();
    p.setActiveModal("menu");
  }, [clearMenuItemReturn, p.setActiveModal, p.setScoreEditorDoc, p.setScoreMode]);
  const openExclusive = useCallback((modal: ActiveModal) => {
    p.tuningGuideOnSelectRef.current = null;
    if (modal === "polygon") p.playbackModeRef.current = "polygon";
    p.setActiveModal(modal);
  }, [p.playbackModeRef, p.setActiveModal, p.tuningGuideOnSelectRef]);

  const tutorialShouldShow = useCallback((mode: TutorialMode, state = p.tutorialStateRef.current) => {
    const entry = state[mode];
    return entry.contentVersion < TUTORIAL_CONTENT_VERSION
      || (entry.status !== "completed" && entry.status !== "skipped");
  }, [p.tutorialStateRef]);
  const openModeTutorial = useCallback((mode: TutorialMode, restart = false) => {
    if (!MODE_TUTORIALS_ENABLED) return;
    if (restart) {
      const next = {
        ...p.tutorialStateRef.current,
        [mode]: { contentVersion: TUTORIAL_CONTENT_VERSION, status: "in_progress" as const, completedSteps: [] },
      };
      p.tutorialStateRef.current = next;
      p.setTutorialState(next);
      void saveTutorialState(next).catch(() => {});
    }
    p.tutorialModeRef.current = mode;
    p.setTutorialMode(mode);
    p.setTutorialLastAction(null);
  }, [p.setTutorialLastAction, p.setTutorialMode, p.setTutorialState, p.tutorialModeRef, p.tutorialStateRef]);
  const recordTutorialAction = useCallback((action: TutorialAction) => {
    if (p.tutorialModeRef.current) p.setTutorialLastAction(action);
  }, [p.setTutorialLastAction, p.tutorialModeRef]);
  const completeTutorialStep = useCallback((stepId: string) => {
    const mode = p.tutorialModeRef.current;
    if (!mode) return;
    const current = p.tutorialStateRef.current;
    const next = { ...current, [mode]: { ...current[mode], status: "in_progress" as const, contentVersion: TUTORIAL_CONTENT_VERSION, completedSteps: [...new Set([...current[mode].completedSteps, stepId])] } };
    p.tutorialStateRef.current = next;
    p.setTutorialState(next);
    p.setTutorialLastAction(null);
    void saveTutorialState(next).catch(() => {});
  }, [p.setTutorialLastAction, p.setTutorialState, p.tutorialModeRef, p.tutorialStateRef]);
  const finishModeTutorial = useCallback(() => {
    const mode = p.tutorialModeRef.current;
    if (!mode) return;
    const next = { ...p.tutorialStateRef.current, [mode]: { contentVersion: TUTORIAL_CONTENT_VERSION, status: "completed" as const, completedSteps: [...p.tutorialStateRef.current[mode].completedSteps] } };
    p.tutorialStateRef.current = next;
    p.setTutorialState(next);
    p.tutorialModeRef.current = null;
    p.setTutorialMode(null);
    p.setTutorialLastAction(null);
    void saveTutorialState(next).catch(() => {});
  }, [p.setTutorialLastAction, p.setTutorialMode, p.setTutorialState, p.tutorialModeRef, p.tutorialStateRef]);
  const skipModeTutorial = useCallback(() => {
    const mode = p.tutorialModeRef.current;
    if (!mode) return;
    const next = { ...p.tutorialStateRef.current, [mode]: { contentVersion: TUTORIAL_CONTENT_VERSION, status: "skipped" as const, completedSteps: [...p.tutorialStateRef.current[mode].completedSteps] } };
    p.tutorialStateRef.current = next;
    p.setTutorialState(next);
    p.tutorialModeRef.current = null;
    p.setTutorialMode(null);
    p.setTutorialLastAction(null);
    void saveTutorialState(next).catch(() => {});
  }, [p.setTutorialLastAction, p.setTutorialMode, p.setTutorialState, p.tutorialModeRef, p.tutorialStateRef]);
  const resetModeTutorials = useCallback(async () => {
    const next = await resetTutorialState();
    p.tutorialStateRef.current = next;
    p.setTutorialState(next);
    p.setTutorialLastAction(null);
  }, [p.setTutorialLastAction, p.setTutorialState, p.tutorialStateRef]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const onBack = () => {
      if (p.showSettings) { p.setActiveModal(null); return true; }
      if (p.showProfile || p.showAssistant) { closeMenuItem(); return true; }
      if (p.showTuningGuide) {
        p.tuningGuideOnSelectRef.current = null;
        if (p.reopenSignalGenAfterTuningGuideRef.current) {
          p.reopenSignalGenAfterTuningGuideRef.current = false;
          p.setActiveModal("signalGen");
        } else p.setActiveModal(null);
        return true;
      }
      if (p.showSignalGen) { p.tuningGuideOnSelectRef.current = null; p.reopenSignalGenAfterTuningGuideRef.current = false; closeMenuItem(); return true; }
      if (p.showPracticeBook) { closeMenuItem(); return true; }
      if (p.showWorkUp) { closeMenuItem(); return true; }
      if (p.showFadeOut) { p.setActiveModal(null); return true; }
      if (p.showScheduledStart) { p.setActiveModal(null); return true; }
      if (p.showDrumKit) { closeMenuItem(); return true; }
      if (p.showPolygon) { closeMenuItem(); return true; }
      if (p.showMenu) { clearMenuItemReturn(); p.setActiveModal(null); return true; }
      if (p.showOnboarding) { p.setActiveModal(null); return true; }
      if (p.showReboot) { p.setShowReboot(false); return true; }
      if (p.coreMode === "score") { closeScoreMode(); return true; }
      if (p.barModeRef.current) { p.handleBarModeChangeRef.current(false); return true; }
      Alert.alert("앱 종료", "앱을 종료하시겠습니까?", [
        { text: "취소", style: "cancel" },
        { text: "종료", style: "destructive", onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [
    clearMenuItemReturn,
    closeMenuItem,
    closeScoreMode,
    p.barModeRef,
    p.coreMode,
    p.handleBarModeChangeRef,
    p.reopenSignalGenAfterTuningGuideRef,
    p.setActiveModal,
    p.setShowReboot,
    p.showAssistant,
    p.showDrumKit,
    p.showFadeOut,
    p.showMenu,
    p.showOnboarding,
    p.showPolygon,
    p.showPracticeBook,
    p.showProfile,
    p.showReboot,
    p.showScheduledStart,
    p.showSettings,
    p.showSignalGen,
    p.showTuningGuide,
    p.showWorkUp,
    p.tuningGuideOnSelectRef,
  ]);

  return {
    settingsReturnModalRef, menuItemReturnRef, menuItemReturnGenerationRef,
    markMenuItemReturn, clearMenuItemReturn, closeMenuItem, closeScoreMode,
    openExclusive, tutorialShouldShow, openModeTutorial, recordTutorialAction,
    completeTutorialStep, finishModeTutorial, skipModeTutorial, resetModeTutorials,
  };
}
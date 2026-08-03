import { useState, useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { captureBreadcrumb } from "@/lib/error-tracking";
import {
  loadPracticeBook,
  savePracticeBook,
  createPracticeEntry,
  type PracticeEntry,
} from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";
import type { BarRepeatEntry } from "@/lib/storage";
import type { TranslationFn } from "@/lib/i18n";

export interface UseBeatQuickSaveParams {
  bpm: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  subdivisionPattern: BeatType[];
  username: string;
  t: TranslationFn;
}

export interface UseBeatQuickSaveResult {
  beatQuickSaveModalVisible: boolean;
  setBeatQuickSaveModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  beatQuickSaveName: string;
  setBeatQuickSaveName: React.Dispatch<React.SetStateAction<string>>;
  beatQuickSaveToast: string | null;
  handleBeatQuickSaveOpen: () => void;
  handleBeatQuickSaveCancel: () => void;
  handleBeatQuickSaveConfirm: (name: string) => Promise<void>;
}

/**
 * 비트 모드 빠른 저장(QuickSave) 상태·콜백 모음.
 *
 * - 저장 모달(이름 입력), 결과 토스트(2.5초 자동 소멸)를 소유한다.
 * - BPM·박자 상태는 파라미터로 주입해 useMetronomeScreen에서 분리한다.
 */
export function useBeatQuickSave(params: UseBeatQuickSaveParams): UseBeatQuickSaveResult {
  const { bpm, beatsPerMeasure, beatTypes, beatSubdivisions, subdivisionPattern, username, t } = params;

  const [beatQuickSaveModalVisible, setBeatQuickSaveModalVisible] = useState(false);
  const [beatQuickSaveName, setBeatQuickSaveName] = useState("");
  const [beatQuickSaveToast, setBeatQuickSaveToast] = useState<string | null>(null);
  const beatQuickSaveToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBeatQuickSaveToast = useCallback((msg: string) => {
    if (beatQuickSaveToastTimerRef.current) clearTimeout(beatQuickSaveToastTimerRef.current);
    setBeatQuickSaveToast(msg);
    beatQuickSaveToastTimerRef.current = setTimeout(() => setBeatQuickSaveToast(null), 2500);
  }, []);

  const handleBeatQuickSaveOpen = useCallback(() => {
    setBeatQuickSaveName(`${bpm} BPM`);
    setBeatQuickSaveModalVisible(true);
  }, [bpm]);

  const handleBeatQuickSaveCancel = useCallback(() => {
    setBeatQuickSaveModalVisible(false);
  }, []);

  const handleBeatQuickSaveConfirm = useCallback(async (name: string) => {
    setBeatQuickSaveModalVisible(false);
    try {
      const label = name.trim() || `${bpm} BPM`;
      const config = {
        mode: "beat" as const,
        bpm,
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        barRepeats: {} as Record<number, BarRepeatEntry>,
        barLoopMode: "once" as const,
        subdivisionPattern: [...subdivisionPattern],
      };
      const entry = createPracticeEntry(label, config, username);
      const existing = await loadPracticeBook();
      await savePracticeBook([entry, ...existing]);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showBeatQuickSaveToast(t("main", "quickSavedMsg"));
    } catch (e) {
      captureBreadcrumb({
        category: "practice-book",
        message: "Beat quick save error",
        level: "warning",
        data: { error: String(e) },
      });
    }
  }, [bpm, beatsPerMeasure, beatTypes, beatSubdivisions, subdivisionPattern, username, t, showBeatQuickSaveToast]);

  // 타이머 정리
  useEffect(() => {
    return () => {
      if (beatQuickSaveToastTimerRef.current) clearTimeout(beatQuickSaveToastTimerRef.current);
    };
  }, []);

  return {
    beatQuickSaveModalVisible,
    setBeatQuickSaveModalVisible,
    beatQuickSaveName,
    setBeatQuickSaveName,
    beatQuickSaveToast,
    handleBeatQuickSaveOpen,
    handleBeatQuickSaveCancel,
    handleBeatQuickSaveConfirm,
  };
}

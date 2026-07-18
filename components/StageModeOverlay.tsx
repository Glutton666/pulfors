"use no memo";
/**
 * StageModeOverlay — 무대 모드 전면 재설계 (Task #383)
 *
 * 구조:
 *  - 상단 바: 종료 버튼(좌), 설정 버튼(우)
 *  - 메인 영역: 모드별 분기
 *      beat/bar  → StageBeatColumn + BPM 컨트롤러
 *      score     → ScoreRenderer 전체화면 + 하단 미니바
 *      note(사진) → Image 전체화면 + 하단 미니바
 *  - BPM 컨트롤러: 재생 중에는 BPM 숫자만 표시 (컨트롤 비활성)
 *  - 재생/정지 버튼
 *  - 셋 리스트: + 추가 버튼 + 가로 스크롤 카드 (전 모드 지원, 롱프레스 이동/삭제)
 *  - 설정 패널: 우측에서 슬라이드-인
 */

import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  FlatList,
  Modal,
  ScrollView,
  Switch,
  BackHandler,
  Image,
  TextInput,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/contexts/LanguageContext";
import * as Haptics from "expo-haptics";
import { StageBeatColumn } from "@/components/StageBeatColumn";
import { BpmSlider } from "@/components/BpmSlider";
import { ScoreRenderer } from "@/components/ScoreRenderer";
import { loadScore } from "@/lib/score-storage";
import { computeScoreLayout } from "@/lib/score-layout";
import { scoreScaleFactor, BASE_LINE_SPACING } from "@/lib/score-scale";
import type { ScoreDocument } from "@/lib/score-types";
import type { PracticeEntry, FlashMode, HapticMode } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";

// ─── 스테이지 설정 타입 ──────────────────────────────────────────────
const STAGE_SETTINGS_KEY = "stage_settings_v1";
const STAGE_SETLIST_KEY  = "stage_setlist_v1";

interface StageSettings {
  theme:            "dark" | "light";
  countdown:        0 | 1 | 2 | 4;
  autoAdvance:      boolean;
  keepAwake:        boolean;
  scoreHighlight:   "top" | "center" | "bottom";
  /** 블루투스 키보드 키(1~0) → practiceEntry.id 매핑 */
  keyMappings:      Partial<Record<string, string>>;
}

const DEFAULT_STAGE_SETTINGS: StageSettings = {
  theme:          "dark",
  countdown:      0,
  autoAdvance:    true,
  keepAwake:      true,
  scoreHighlight: "center",
  keyMappings:    {},
};

async function loadStageSettings(): Promise<StageSettings> {
  try {
    const raw = await AsyncStorage.getItem(STAGE_SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<StageSettings>;
      return { ...DEFAULT_STAGE_SETTINGS, ...p };
    }
  } catch {}
  return DEFAULT_STAGE_SETTINGS;
}

async function saveStageSettings(s: StageSettings): Promise<void> {
  try { await AsyncStorage.setItem(STAGE_SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

async function loadStageSetlist(): Promise<PracticeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STAGE_SETLIST_KEY);
    if (raw) return JSON.parse(raw) as PracticeEntry[];
  } catch {}
  return [];
}

async function saveStageSetlist(list: PracticeEntry[]): Promise<void> {
  try { await AsyncStorage.setItem(STAGE_SETLIST_KEY, JSON.stringify(list)); } catch {}
}

// ─── 모드 배지 ────────────────────────────────────────────────────────
const MODE_BADGE: Record<string, { label: string; color: string }> = {
  beat:  { label: "BEAT",  color: "#4A9EFF" },
  bar:   { label: "BAR",   color: "#FF9F43" },
  note:  { label: "NOTE",  color: "#A29BFE" },
  score: { label: "SCORE", color: "#55EFC4" },
};

function getEntryMode(e: PracticeEntry): string {
  if (e.scoreId) return "score";
  return e.mode ?? "beat";
}

// ─── 빈 셋리스트 전용 비트 편집기 ─────────────────────────────────────
const BEAT_TYPE_ORDER: BeatType[] = ["strong", "accent", "normal", "mute"];

function StageBeatEditor({
  beatTypes,
  onBeatTypesChange,
  beatsPerMeasure,
  onBeatsPerMeasureChange,
  text,
  faint,
  accent,
}: {
  beatTypes: BeatType[];
  onBeatTypesChange: (types: BeatType[]) => void;
  beatsPerMeasure: number;
  onBeatsPerMeasureChange: (n: number) => void;
  text: string;
  faint: string;
  accent: string;
}) {
  const beatsRef = useRef(beatsPerMeasure);
  const onBeatsRef = useRef(onBeatsPerMeasureChange);
  useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
  useEffect(() => { onBeatsRef.current = onBeatsPerMeasureChange; }, [onBeatsPerMeasureChange]);

  const swipeFired = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 12 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => {
        swipeFired.current = false;
      },
      onPanResponderMove: (_, gs) => {
        if (swipeFired.current) return;
        if (gs.dx > 40) {
          swipeFired.current = true;
          const next = Math.min(16, beatsRef.current + 1);
          if (next !== beatsRef.current) {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          onBeatsRef.current(next);
        } else if (gs.dx < -40) {
          swipeFired.current = true;
          const next = Math.max(1, beatsRef.current - 1);
          if (next !== beatsRef.current) {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          onBeatsRef.current(next);
        }
      },
      onPanResponderRelease: () => { swipeFired.current = false; },
    })
  ).current;

  const cycleType = (idx: number) => {
    const cur = beatTypes[idx] ?? "normal";
    const next = BEAT_TYPE_ORDER[(BEAT_TYPE_ORDER.indexOf(cur) + 1) % BEAT_TYPE_ORDER.length];
    const newTypes = [...beatTypes];
    newTypes[idx] = next;
    onBeatTypesChange(newTypes);
  };

  const dotColor = (type: BeatType) => {
    if (type === "strong") return accent;
    if (type === "accent") return text;
    if (type === "normal") return text + "88";
    return faint;
  };

  const dotSize = Math.max(18, Math.min(36, Math.floor(280 / Math.max(beatsPerMeasure, 1)) - 8));

  return (
    <View {...panResponder.panHandlers} style={stageBeatEditorStyle.wrap}>
      {Array.from({ length: beatsPerMeasure }).map((_, i) => {
        const type = beatTypes[i] ?? "normal";
        const isStrong = type === "strong";
        return (
          <Pressable
            key={i}
            onPress={() => cycleType(i)}
            hitSlop={6}
            style={stageBeatEditorStyle.dotBtn}
          >
            <View
              style={[
                stageBeatEditorStyle.dot,
                {
                  width: dotSize,
                  height: dotSize,
                  borderRadius: dotSize / 2,
                  backgroundColor: dotColor(type),
                  borderWidth: isStrong ? 0 : 1.5,
                  borderColor: text + "44",
                  transform: [{ scale: isStrong ? 1.15 : 1 }],
                },
              ]}
            />
            {i === 0 && (
              <View style={[stageBeatEditorStyle.badge, { backgroundColor: accent }]}>
                <Text style={[stageBeatEditorStyle.badgeText, { color: "#000" }]}>1</Text>
              </View>
            )}
          </Pressable>
        );
      })}
      <Text style={[stageBeatEditorStyle.hint, { color: faint }]}>← →</Text>
    </View>
  );
}

const stageBeatEditorStyle = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  dotBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 7,
    fontWeight: "700",
  },
  hint: {
    fontSize: 10,
    marginLeft: 4,
    opacity: 0.5,
  },
});

// ─── Props ────────────────────────────────────────────────────────────
export interface StageModeOverlayProps {
  visible:           boolean;
  bpm:               number;
  flashOpacity:      SharedValue<number>;
  beatProgress:      SharedValue<number>;
  currentBeat:       number;
  beatsPerMeasure:   number;
  beatDenominator:   2 | 4 | 8;
  subdivisionCount?: number;
  beatTypes?:        BeatType[];
  beatSubdivisions?: Record<string, BeatType[]>;
  isPlaying:         boolean;
  flashMode:         FlashMode;
  hapticMode:        HapticMode;
  onPlayPause:       () => void;
  onExit:            () => void;
  onBpmChange:       (bpm: number) => void;
  onTapTempo:        () => void;
  onBeatsPerMeasureChange: (n: number) => void;
  onBeatDenominatorCycle:  () => void;
  onFlashModeChange?:  (m: FlashMode) => void;
  onHapticModeChange?: (m: HapticMode) => void;
  onBeatTypesChange?:  (types: BeatType[]) => void;
  /** 연습장 전체 목록 (셋 리스트 추가 피커에서 사용) */
  practiceBook?: PracticeEntry[];
  /** 현재 활성(하이라이트) 셋 리스트 항목 ID */
  activeEntryId?: string;
  /** 셋 리스트 항목 선택 — 엔진 재시작 없이 즉시 전환 */
  onSelectEntry?: (entry: PracticeEntry) => void;
  /** 셋리스트 없을 때 StageBeatColumn 자리에 표시할 컨텐츠 슬롯 (BeatIndicator + SubdivisionBar 등) */
  noSetlistContent?: React.ReactNode;
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────
export function StageModeOverlay({
  visible,
  bpm,
  flashOpacity,
  beatProgress,
  currentBeat,
  beatsPerMeasure,
  beatDenominator,
  subdivisionCount = 1,
  beatTypes,
  beatSubdivisions,
  isPlaying,
  flashMode,
  hapticMode,
  onPlayPause,
  onExit,
  onBpmChange,
  onTapTempo,
  onBeatsPerMeasureChange,
  onBeatDenominatorCycle,
  onFlashModeChange,
  onHapticModeChange,
  onBeatTypesChange,
  practiceBook = [],
  activeEntryId,
  onSelectEntry,
  noSetlistContent,
}: StageModeOverlayProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();

  // ── 설정 & 셋 리스트 상태 ──────────────────────────────────────────
  const [settings, setSettings]       = useState<StageSettings>(DEFAULT_STAGE_SETTINGS);
  const [setlist,  setSetlist]        = useState<PracticeEntry[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen,   setPickerOpen]   = useState(false);
  const [confirmExit,  setConfirmExit]  = useState(false);
  /** 롱프레스로 선택된 셋 리스트 항목 ID (이동/삭제 컨텍스트 메뉴) */
  const [contextEntryId, setContextEntryId] = useState<string | null>(null);
  /** Ctrl+숫자로 예약된 점프 인덱스 (0-based) — 현재 항목 종료 시 이동 */
  const [pendingJumpIdx, setPendingJumpIdx] = useState<number | null>(null);
  const pendingJumpIdxRef = useRef<number | null>(null);
  useEffect(() => { pendingJumpIdxRef.current = pendingJumpIdx; }, [pendingJumpIdx]);
  /** 키보드 단축키 설정 중 선택 중인 키 ("1"~"0") */
  const [keyPickerTarget, setKeyPickerTarget] = useState<string | null>(null);

  const practiceBookRef = useRef<PracticeEntry[]>([]);
  useEffect(() => { practiceBookRef.current = practiceBook; }, [practiceBook]);
  const setlistRef = useRef<PracticeEntry[]>([]);
  useEffect(() => { setlistRef.current = setlist; }, [setlist]);
  const onSelectEntryRef = useRef(onSelectEntry);
  useEffect(() => { onSelectEntryRef.current = onSelectEntry; }, [onSelectEntry]);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ── 악보 문서 로드 ────────────────────────────────────────────────
  const [scoreDoc, setScoreDoc] = useState<ScoreDocument | null>(null);
  const scoreIdRef = useRef<string | undefined>(undefined);
  const scoreScrollRef = useRef<ScrollView>(null);

  // ── 내부 루프 카운터 (currentBeat 순환 감지) ─────────────────────
  const [internalLoopCount, setInternalLoopCount] = useState(0);
  const prevBeatRef2 = useRef(-1);
  useEffect(() => {
    if (isPlaying && currentBeat === 0 && prevBeatRef2.current > 0) {
      setInternalLoopCount((c) => c + 1);
    }
    prevBeatRef2.current = currentBeat;
  }, [currentBeat, isPlaying]);

  // ── 항목 전환 시 루프 카운터 초기화 ─────────────────────────────
  // prevBeatRef2 를 리셋하지 않으면 이전 항목 마지막 비트 위치가 남아
  // 새 항목 첫 비트(0)에서 internalLoopCount 가 잘못 증가한다.
  useEffect(() => {
    setInternalLoopCount(0);
    prevBeatRef2.current = -1;
  }, [activeEntryId]);

  // 슬롯 ID에서 원본 entry ID 추출 (중복 허용 포맷: "origId__slot__ts_rand")
  const getOriginalEntryId = (id: string) =>
    id.includes("__slot__") ? id.split("__slot__")[0]! : id;

  // ── practiceBook 변경 시 셋리스트 재검증 ────────────────────────
  // book이 비어 있으면 아직 로딩 중이므로 건너뜀 (visible 효과에서 이미 defer 처리)
  useEffect(() => {
    if (!visible || practiceBook.length === 0) return;
    const current = setlistRef.current;
    if (current.length === 0) return;
    const filtered = current.filter((e) => practiceBook.some((b) => b.id === getOriginalEntryId(e.id)));
    if (filtered.length !== current.length) {
      setSetlist(filtered);
      saveStageSetlist(filtered).catch(() => {});
    }
  }, [practiceBook, visible]);

  // ── 마운트 시 로드 ────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    loadStageSettings().then(setSettings).catch(() => {});
    loadStageSetlist().then((saved) => {
      // 방어: practiceBook에 없는 ID 항목 제거
      // book이 비어 있으면 아직 비동기 로딩 중이므로 필터링/저장 건너뜀 (데이터 유실 방지)
      // 나중에 practiceBook이 로드되면 아래 revalidation 효과가 자동으로 정리
      const book = practiceBookRef.current;
      const list = book.length > 0
        ? saved.filter((e) => book.some((b) => b.id === getOriginalEntryId(e.id)))
        : saved;
      if (book.length > 0 && list.length !== saved.length) {
        saveStageSetlist(list).catch(() => {});
      }
      setSetlist(list);
      // 활성 항목이 없으면 첫 번째 항목 자동 선택
      const hasActive = activeEntryId && list.some((e) => e.id === activeEntryId);
      if (!hasActive && list.length > 0) {
        onSelectEntry?.(list[0]!);
      }
    }).catch(() => {});
    setConfirmExit(false);
    setSettingsOpen(false);
    setPickerOpen(false);
    setContextEntryId(null);
  }, [visible]);

  // ── keep-awake 연동 ───────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (settings.keepAwake) {
      import("expo-keep-awake")
        .then((m) => m.activateKeepAwakeAsync("stage-mode"))
        .catch(() => {});
    } else {
      import("expo-keep-awake")
        .then((m) => m.deactivateKeepAwake("stage-mode"))
        .catch(() => {});
    }
    return () => {
      import("expo-keep-awake")
        .then((m) => m.deactivateKeepAwake("stage-mode"))
        .catch(() => {});
    };
  }, [visible, settings.keepAwake]);

  const updateSettings = useCallback((patch: Partial<StageSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveStageSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const updateSetlist = useCallback((next: PracticeEntry[]) => {
    setSetlist(next);
    saveStageSetlist(next).catch(() => {});
  }, []);

  // ── 설정 패널 슬라이드 애니메이션 ─────────────────────────────────
  const settingsPanelX = useSharedValue(320);
  useEffect(() => {
    settingsPanelX.value = withTiming(settingsOpen ? 0 : 320, {
      duration: 280,
      easing: Easing.inOut(Easing.quad),
    });
  }, [settingsOpen]);

  const settingsPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: settingsPanelX.value }],
  }));

  // ── 플래시 오버레이 ───────────────────────────────────────────────
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  // ── BPM 홀드 로직 ─────────────────────────────────────────────────
  const bpmRef         = useRef(bpm);
  const onBpmChangeRef = useRef(onBpmChange);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { onBpmChangeRef.current = onBpmChange; }, [onBpmChange]);

  const holdActiveRef   = useRef(false);
  const holdDelayRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clampBpm = (v: number) => Math.min(300, Math.max(20, v));

  const stopHold = useCallback(() => {
    if (holdDelayRef.current)    { clearTimeout(holdDelayRef.current);   holdDelayRef.current = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  }, []);
  useEffect(() => () => stopHold(), [stopHold]);

  const startHold = useCallback((delta: number) => {
    holdActiveRef.current = false;
    holdDelayRef.current = setTimeout(() => {
      holdActiveRef.current = true;
      onBpmChangeRef.current(clampBpm(bpmRef.current + delta * 5));
      holdIntervalRef.current = setInterval(() => {
        onBpmChangeRef.current(clampBpm(bpmRef.current + delta * 5));
      }, 150);
    }, 300);
  }, []);

  const handleBpmPress = useCallback((delta: number) => {
    if (holdActiveRef.current) { holdActiveRef.current = false; return; }
    onBpmChangeRef.current(clampBpm(bpmRef.current + delta));
  }, []);

  // ── 안드로이드 백 버튼 ───────────────────────────────────────────
  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (settingsOpen) { setSettingsOpen(false); return true; }
      if (pickerOpen)   { setPickerOpen(false);   return true; }
      if (contextEntryId) { setContextEntryId(null); return true; }
      setConfirmExit(true);
      return true;
    });
    return () => handler.remove();
  }, [visible, settingsOpen, pickerOpen, contextEntryId]);

  // ── 활성 항목 & 모드 결정 ────────────────────────────────────────
  const activeEntry = setlist.find((e) => e.id === activeEntryId) ?? null;
  // autoAdvance 용 ref 동기화
  useEffect(() => { activeEntryRef.current = activeEntry; }, [activeEntry]);
  const activeMode  = activeEntry ? getEntryMode(activeEntry) : "beat";
  // 악보 모드 또는 사진이 있는 노트 모드 → 전체화면 컨텐츠 표시
  const hasPhoto    = activeMode === "note" && !!activeEntry?.imageUri;
  const isFullscreen = activeMode === "score" || hasPhoto;

  // ── 악보 문서 로드 ────────────────────────────────────────────────
  useEffect(() => {
    const sid = activeEntry?.scoreId;
    if (sid && sid !== scoreIdRef.current) {
      scoreIdRef.current = sid;
      loadScore(sid).then((doc) => {
        setScoreDoc(doc);
        setInternalLoopCount(0);
      }).catch(() => setScoreDoc(null));
    } else if (!sid) {
      scoreIdRef.current = undefined;
      setScoreDoc(null);
    }
  }, [activeEntry?.scoreId]);

  // ── 악보 현재 마디 계산 (내부 루프 카운터 → measureIdx) ──────────
  const scoreMeasureCount = scoreDoc?.parts[0]?.measures?.length ?? 1;
  const currentMeasureIdx = internalLoopCount % Math.max(1, scoreMeasureCount);
  const SCORE_HIGHLIGHT_COLOR = "rgba(74,158,255,0.25)";

  // ── 악보 하이라이트 수직 위치 제어 (scoreHighlight 설정) ─────────
  // computeScoreLayout 으로 row Y 좌표를 구한 뒤 ScrollView 를 스크롤.
  useEffect(() => {
    if (!scoreDoc || !scoreScrollRef.current) return;
    const sf  = scoreScaleFactor(BASE_LINE_SPACING);
    const { rows } = computeScoreLayout(scoreDoc, winWidth / sf);
    // 현재 마디가 속한 row 의 Y 좌표 (스케일 적용)
    const rowWithMeasure = rows.find((r) => r.measureIndices.includes(currentMeasureIdx));
    if (!rowWithMeasure) return;
    const measureY = rowWithMeasure.y * sf;
    // scoreHighlight 에 따라 오프셋 조정
    // "top"    → 마디가 화면 상단 근처
    // "center" → 마디가 화면 중앙
    // "bottom" → 마디가 화면 하단 근처
    // ScrollView 높이를 모르므로 대략적인 뷰포트 높이로 추정
    const approxViewportH = 400;
    let offset = 0;
    if (settings.scoreHighlight === "center") {
      offset = approxViewportH / 2;
    } else if (settings.scoreHighlight === "bottom") {
      offset = approxViewportH - 80;
    }
    const scrollY = Math.max(0, measureY - offset);
    scoreScrollRef.current.scrollTo({ y: scrollY, animated: true });
  }, [currentMeasureIdx, scoreDoc, settings.scoreHighlight, winWidth]);

  // ── 셋 리스트 조작 ───────────────────────────────────────────────
  // 슬롯 ID = "originalId__slot__timestamp_random" — 같은 항목 중복 추가 허용
  const addToSetlist = useCallback((entry: PracticeEntry) => {
    setSetlist((prev) => {
      const slotId = `${entry.id}__slot__${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const slot: PracticeEntry = { ...entry, id: slotId };
      const next = [...prev, slot];
      saveStageSetlist(next).catch(() => {});
      return next;
    });
  }, []);

  const removeFromSetlist = useCallback((id: string) => {
    setSetlist((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveStageSetlist(next).catch(() => {});
      return next;
    });
    setContextEntryId(null);
  }, []);

  const moveInSetlist = useCallback((id: string, dir: -1 | 1) => {
    setSetlist((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx]!, next[idx]!];
      saveStageSetlist(next).catch(() => {});
      return next;
    });
  }, []);

  // ── 다음 항목으로 이동 ────────────────────────────────────────────
  const advanceSetlist = useCallback(() => {
    // 항목이 1개 이하면 이동 불필요 (같은 항목 재선택 방지)
    if (setlist.length <= 1) return;
    const idx = setlist.findIndex((e) => e.id === activeEntryId);
    // 마지막 항목이면 첫 번째 항목으로 순환
    const nextIdx = (idx + 1) % setlist.length;
    const next = setlist[nextIdx];
    if (next) onSelectEntry?.(next);
  }, [setlist, activeEntryId, onSelectEntry]);

  // ── autoAdvance: "once" 항목이 재생 완료(isPlaying false)되면 다음으로 ─
  // barLoopMode==="once" 또는 notePlayMode==="once" 항목만 자동 전환.
  // "loop" 항목은 수동 Next 전용.
  const settingsRef = useRef(settings);
  const activeEntryRef = useRef<PracticeEntry | null>(null);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const wasPlayingRef = useRef(isPlaying);
  useEffect(() => {
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = isPlaying;
    if (wasPlaying && !isPlaying) {
      // Ctrl+숫자 예약 점프가 있으면 autoAdvance보다 우선
      const jumpIdx = pendingJumpIdxRef.current;
      if (jumpIdx !== null) {
        const target = setlistRef.current[jumpIdx];
        setPendingJumpIdx(null);
        if (target) {
          onSelectEntryRef.current?.(target);
          return;
        }
      }
      if (settingsRef.current.autoAdvance) {
        const entry = activeEntryRef.current;
        if (!entry) return;
        const entryMode = getEntryMode(entry);
        const isOnce =
          (entryMode === "bar"  && entry.barLoopMode === "once") ||
          (entryMode === "note" && entry.notePlayMode === "once");
        if (isOnce) {
          advanceSetlist();
        }
      }
    }
  }, [isPlaying, advanceSetlist]);

  // ── 블루투스 키보드 이벤트 (web) ─────────────────────────────────
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const handler = (evt: globalThis.KeyboardEvent) => {
      const target = evt.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const key = evt.key;
      const isDigit = /^[0-9]$/.test(key);
      if (!isDigit) return;
      if (evt.ctrlKey || evt.metaKey) {
        evt.preventDefault();
        const pos = key === "0" ? 9 : parseInt(key, 10) - 1;
        const currentSetlist = setlistRef.current;
        // 범위 초과는 즉시 무시
        if (pos < 0 || pos >= currentSetlist.length) return;
        if (!isPlayingRef.current) {
          // 정지 중이면 즉시 이동
          const target = currentSetlist[pos];
          if (target) onSelectEntryRef.current?.(target);
        } else {
          // 재생 중이면 현재 항목 종료 시까지 예약
          setPendingJumpIdx(pos);
        }
      } else if (!evt.altKey && !evt.shiftKey) {
        const entryId = (settingsRef.current.keyMappings ?? {})[key];
        if (!entryId) return;
        const entry = practiceBookRef.current.find((e) => e.id === entryId);
        if (entry) addToSetlist(entry);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, addToSetlist]);

  // ── 레이아웃 ────────────────────────────────────────────────────
  const webTop    = Platform.OS === "web" ? 67 : 0;
  const topPad    = (insets.top || webTop) + 8;
  const bottomPad = (insets.bottom || (Platform.OS === "web" ? 34 : 0)) + 8;

  const isDark = settings.theme === "dark";
  const bg          = isDark ? "#0a0a0a" : "#f0f0f0";
  const text        = isDark ? "#ffffff" : "#111111";
  const faint       = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const cardBg      = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const cardBdr     = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const btnBg       = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  const btnBdr      = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
  const panelBg     = isDark ? "#181818" : "#e8e8e8";
  const accentColor = isDark ? "#5B9EFF" : "#2563EB";

  if (!visible) return null;

  const timeSigText = `${beatsPerMeasure}/${beatDenominator}`;

  // ── 피커에서 추가 가능한 항목 ─────────────────────────────────────
  const availableEntries = practiceBook;

  // ─ 롱프레스 컨텍스트 항목 ─
  const ctxEntry = contextEntryId ? setlist.find((e) => e.id === contextEntryId) : null;
  const ctxIdx   = contextEntryId ? setlist.findIndex((e) => e.id === contextEntryId) : -1;

  // ─ BPM 컨트롤러: 재생 중에는 BPM 숫자만, 정지 중에는 BpmSlider ──
  const BpmController = isPlaying ? (
    <View style={styles.bpmReadOnly}>
      <Text style={[styles.bpmReadOnlyLabel, { color: faint }]}>{t("stageMode", "bpmLabel")}</Text>
      <Pressable
        onLongPress={onBeatDenominatorCycle}
        delayLongPress={500}
        accessibilityLabel="Beat denominator cycle"
        hitSlop={12}
      >
        <Text style={[styles.bpmReadOnlyNumber, { color: text }]}>{bpm}</Text>
      </Pressable>
      <Text style={[styles.bpmReadOnlyTimeSig, { color: faint }]}>{beatsPerMeasure}/{beatDenominator}</Text>
    </View>
  ) : (
    <View style={styles.bpmSliderWrap}>
      <BpmSlider
        bpm={bpm}
        onBpmChange={onBpmChange}
        onTapTempo={onTapTempo}
        onDenominatorCycle={onBeatDenominatorCycle}
        isDark={isDark}
      />
      {/* 셋리스트 있을 때만 − beats + 표시 (없을 때는 noSetlistContent 슬롯에서 편집) */}
      {setlist.length > 0 && (
        <View style={styles.beatCountRow}>
          <Pressable
            style={({ pressed }) => [styles.beatCountBtn, { borderColor: btnBdr, backgroundColor: pressed ? btnBg : "transparent" }]}
            onPress={() => onBeatsPerMeasureChange(Math.max(1, beatsPerMeasure - 1))}
            accessibilityLabel="Beats minus one"
          >
            <Ionicons name="remove" size={16} color={text} />
          </Pressable>
          <Text style={[styles.beatCountText, { color: text }]}>
            {beatsPerMeasure} {t("stageMode", "beats")}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.beatCountBtn, { borderColor: btnBdr, backgroundColor: pressed ? btnBg : "transparent" }]}
            onPress={() => onBeatsPerMeasureChange(Math.min(16, beatsPerMeasure + 1))}
            accessibilityLabel="Beats plus one"
          >
            <Ionicons name="add" size={16} color={text} />
          </Pressable>
        </View>
      )}
    </View>
  );

  // ─ 재생/정지 버튼 ───────────────────────────────────────────────
  const PlayPauseBtn = (
    <Pressable
      style={({ pressed }) => [styles.playPauseBtn, pressed && { opacity: 0.6 }]}
      onPress={onPlayPause}
      testID="stage-mode-play-pause"
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? t("stageMode", "pause") : t("stageMode", "play")}
    >
      <Ionicons
        name={isPlaying ? "pause-circle" : "play-circle"}
        size={76}
        color={text}
      />
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]} testID="stage-mode-overlay">
      {/* 플래시 레이어 */}
      <Animated.View pointerEvents="none" style={[styles.flashLayer, flashStyle]} />

      {/* 설정 패널 딤 */}
      {settingsOpen && (
        <Pressable
          style={styles.settingsDim}
          onPress={() => setSettingsOpen(false)}
        />
      )}

      {/* 상단 바 */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <Pressable
          style={({ pressed }) => [styles.topBarBtn, pressed && { opacity: 0.6 }]}
          onPress={() => {
            if (Platform.OS === "web") {
              setConfirmExit(true);
            } else {
              onExit();
            }
          }}
          testID="stage-mode-exit"
          accessibilityLabel={t("stageMode", "exitButton")}
        >
          <Ionicons name="chevron-down" size={22} color={faint} />
          <Text style={[styles.topBarBtnText, { color: faint }]}>{t("stageMode", "exitButton")}</Text>
        </Pressable>

        <Text style={[styles.topTitle, { color: faint }]}>{t("stageMode", "title")}</Text>

        <Pressable
          style={({ pressed }) => [styles.topBarBtn, pressed && { opacity: 0.6 }]}
          onPress={() => setSettingsOpen((v) => !v)}
          accessibilityLabel={t("stageMode", "settings")}
        >
          <Ionicons name="settings-outline" size={20} color={settingsOpen ? text : faint} />
        </Pressable>
      </View>

      {/* ── 메인 컨텐츠: 모드별 분기 ───────────────────────────── */}
      {isFullscreen ? (
        /* ─ 전체화면 모드 (악보 / 사진) + 하단 미니바 ─ */
        <View style={styles.fullscreenLayout}>
          {/* 전체화면 컨텐츠 영역 */}
          <View style={styles.fullscreenContent}>
            {activeMode === "score" && scoreDoc ? (
              <ScrollView
                ref={scoreScrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 12 }}
              >
                <ScoreRenderer
                  doc={scoreDoc}
                  containerWidth={winWidth}
                  showPlayhead={false}
                  selectedMeasureIdx={currentMeasureIdx}
                  highlightColor={SCORE_HIGHLIGHT_COLOR}
                  showPartNames={false}
                />
              </ScrollView>
            ) : activeMode === "score" && !scoreDoc ? (
              /* 악보 로딩 중 */
              <View style={styles.fullscreenPlaceholder}>
                <Ionicons name="musical-notes-outline" size={48} color={faint} />
                <Text style={[styles.fullscreenPlaceholderText, { color: faint }]}>
                  {activeEntry?.label ?? "Score"}
                </Text>
              </View>
            ) : hasPhoto && activeEntry?.imageUri ? (
              /* 사진 노트 */
              <Image
                source={{ uri: activeEntry.imageUri }}
                style={styles.notePhoto}
                resizeMode="contain"
              />
            ) : null}
          </View>

          {/* 하단 미니바 */}
          <View style={[styles.miniBar, { backgroundColor: isDark ? "rgba(0,0,0,0.85)" : "rgba(240,240,240,0.92)" }]}>
            <View style={styles.miniBarRow}>
              {/* 비트 숫자 */}
              <Text style={[styles.miniBeat, { color: text }]}>
                {currentBeat < 0 ? "—" : String(currentBeat + 1)}
                <Text style={[styles.miniTotal, { color: faint }]}>/{beatsPerMeasure}</Text>
              </Text>

              {/* BPM (재생 중: 읽기 전용, 정지 중: 탭 템포) */}
              <Pressable
                style={({ pressed }) => [
                  styles.miniBpmArea,
                  { backgroundColor: (!isPlaying && pressed) ? btnBg : "transparent" },
                ]}
                onPress={isPlaying ? undefined : onTapTempo}
                disabled={isPlaying}
              >
                <Text style={[styles.miniBpm, { color: isPlaying ? faint : text }]}>{bpm}</Text>
                <Text style={[styles.miniBpmUnit, { color: faint }]}>BPM</Text>
              </Pressable>

              {/* 재생/정지 */}
              <Pressable
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                onPress={onPlayPause}
                testID="stage-mode-play-pause"
              >
                <Ionicons
                  name={isPlaying ? "pause-circle" : "play-circle"}
                  size={48}
                  color={text}
                />
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        /* ─ 기본 모드 (비트 / 바) ─────────────────────────────── */
        <View style={styles.mainContent}>
          {/* 재생/정지 버튼 — BeatIndicator 슬롯 없을 때만 표시 (슬롯이 자체 토글 포함) */}
          {!(setlist.length === 0 && !isPlaying && noSetlistContent) && PlayPauseBtn}

          {/* 비트 컬럼: 정지 + 셋리스트 없을 때 → noSetlistContent(BeatIndicator), 나머지 → StageBeatColumn(큰 숫자) */}
          {setlist.length === 0 && !isPlaying && noSetlistContent
            ? <View style={{ flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}>{noSetlistContent}</View>
            : (
              <StageBeatColumn
                currentBeat={currentBeat}
                beatsPerMeasure={beatsPerMeasure}
                beatTypes={beatTypes}
                theme={settings.theme}
                subdivisionTypes={
                  beatSubdivisions && currentBeat >= 0
                    ? beatSubdivisions[String(currentBeat)]
                    : undefined
                }
              />
            )
          }

          {/* BPM 컨트롤러 (재생 중: 읽기 전용 숫자, 정지 중: 풀 컨트롤러) */}
          {BpmController}
        </View>
      )}

      {/* ── 셋 리스트 ───────────────────────────────────────────── */}
      {isPlaying ? (
        /* 재생 중: "다음 →" 버튼만 표시 (셋리스트 2개 이상일 때) */
        setlist.length > 1 ? (
          <View style={styles.setlistPlayingBar}>
            <Pressable
              style={({ pressed }) => [
                styles.nextBtnLarge,
                { borderColor: btnBdr, backgroundColor: pressed ? btnBg : "transparent" },
              ]}
              onPress={advanceSetlist}
            >
              <Text style={[styles.nextBtnText, { color: text }]}>{t("stageMode", "next")} →</Text>
            </Pressable>
          </View>
        ) : null
      ) : (
        /* 정지 중: 셋리스트 전체 표시 */
        <View style={styles.setlistSection}>
          <View style={styles.setlistHeader}>
            <Text style={[styles.setlistLabel, { color: faint }]}>
              {t("stageMode", "setList")}
            </Text>
          </View>

          {setlist.length === 0 ? (
            /* 셋리스트 비어있을 때: + 버튼 가운데 정렬 */
            <View style={styles.emptySetlistCenter}>
              <Pressable
                style={({ pressed }) => [
                  styles.addBtn,
                  { borderColor: cardBdr, backgroundColor: pressed ? btnBg : cardBg },
                ]}
                onPress={() => setPickerOpen(true)}
                testID="stage-setlist-add"
              >
                <Ionicons name="add" size={22} color={faint} />
              </Pressable>
            </View>
          ) : (
          <FlatList
            data={setlist}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.setlistContent}
            ListFooterComponent={() => (
              <Pressable
                style={({ pressed }) => [
                  styles.addBtn,
                  { borderColor: cardBdr, backgroundColor: pressed ? btnBg : cardBg },
                ]}
                onPress={() => setPickerOpen(true)}
                testID="stage-setlist-add"
              >
                <Ionicons name="add" size={22} color={faint} />
              </Pressable>
            )}
            renderItem={({ item, index }) => {
              const isActive = item.id === activeEntryId;
              const mode     = getEntryMode(item);
              const badge    = MODE_BADGE[mode] ?? MODE_BADGE["beat"]!;
              const isCtx    = item.id === contextEntryId;
              const seqNum   = index + 1;

              return (
                <Pressable
                  onPress={() => {
                    if (contextEntryId) {
                      setContextEntryId(null);
                      return;
                    }
                    onSelectEntry?.(item);
                  }}
                  onLongPress={() => setContextEntryId(isCtx ? null : item.id)}
                  delayLongPress={400}
                  style={[
                    styles.setCard,
                    {
                      backgroundColor: isActive
                        ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)")
                        : cardBg,
                      borderColor: isCtx
                        ? badge.color
                        : isActive
                        ? (isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)")
                        : cardBdr,
                    },
                  ]}
                  testID={`stage-set-entry-${item.id}`}
                >
                  {/* 상단 뱃지 행 */}
                  <View style={styles.setCardTop}>
                    <View style={styles.setCardBadgeRow}>
                      {/* 순서 번호 */}
                      <View style={styles.seqBadge}>
                        <Text style={[styles.seqBadgeText, { color: faint }]}>{seqNum}</Text>
                      </View>
                      <View style={[styles.modeBadge, { backgroundColor: badge.color + "33" }]}>
                        <Text style={[styles.modeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                      {!!item.noteSamples && Object.keys(item.noteSamples).length > 0 && (
                        <View style={styles.sampleBadge}>
                          <Ionicons name="musical-note" size={8} color="#A29BFE" />
                        </View>
                      )}
                    </View>
                    <View style={styles.setCardTopRight}>
                      {isActive && !isCtx && (
                        <Ionicons name="radio-button-on" size={10} color={badge.color} />
                      )}
                      {!isCtx && (
                        <Pressable
                          onPress={(e) => { e.stopPropagation?.(); removeFromSetlist(item.id); }}
                          hitSlop={8}
                          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
                          accessibilityLabel="Remove from setlist"
                        >
                          <Ionicons name="close" size={13} color={faint} />
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* 컨텍스트 메뉴 (롱프레스) — 큰 터치 영역 */}
                  {isCtx ? (
                    <View style={styles.ctxBtns}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.ctxBtn,
                          { backgroundColor: pressed ? btnBg : "transparent" },
                          index === 0 && { opacity: 0.3 },
                        ]}
                        onPress={() => { if (index > 0) moveInSetlist(item.id, -1); }}
                        disabled={index === 0}
                      >
                        <Ionicons name="arrow-back" size={18} color={text} />
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.ctxBtn,
                          { backgroundColor: pressed ? btnBg : "transparent" },
                          index >= setlist.length - 1 && { opacity: 0.3 },
                        ]}
                        onPress={() => { if (index < setlist.length - 1) moveInSetlist(item.id, 1); }}
                        disabled={index >= setlist.length - 1}
                      >
                        <Ionicons name="arrow-forward" size={18} color={text} />
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.ctxBtn,
                          { backgroundColor: pressed ? "rgba(255,107,107,0.15)" : "transparent" },
                        ]}
                        onPress={() => removeFromSetlist(item.id)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <Text
                        style={[styles.setCardLabel, { color: isActive ? text : faint }]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                      <Text style={[styles.setCardMeta, { color: faint }]}>
                        {item.bpm} BPM · {item.beatsPerMeasure}/{beatDenominator}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            }}
          />
          )}
        </View>
      )}

      {/* 하단 패딩 */}
      <View style={{ height: bottomPad }} />

      {/* ── 설정 패널 ─────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.settingsPanel, { backgroundColor: panelBg, paddingTop: topPad + 44 }, settingsPanelStyle]}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsPanelContent}>
          <Text style={[styles.settingsPanelTitle, { color: text }]}>{t("stageMode", "settingsPanel")}</Text>

          {/* 테마 */}
          <SettingRow label={t("stageMode", "theme")} textColor={text} faintColor={faint}>
            <View style={styles.segmentRow}>
              {(["dark", "light"] as const).map((opt) => (
                <Pressable
                  key={opt}
                  style={({ pressed }) => [
                    styles.segment,
                    settings.theme === opt && styles.segmentActive,
                    { borderColor: btnBdr, backgroundColor: settings.theme === opt ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)") : "transparent" },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => updateSettings({ theme: opt })}
                >
                  <Text style={[styles.segmentText, { color: text }]}>
                    {t("stageMode", opt === "dark" ? "themeDark" : "themeLight")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SettingRow>

          {/* 화면 플래시 */}
          <SettingRow label={t("stageMode", "flash")} textColor={text} faintColor={faint}>
            <View style={styles.segmentRow}>
              {(["accent", "all", "both", "off"] as FlashMode[]).map((opt) => (
                <Pressable
                  key={opt}
                  style={({ pressed }) => [
                    styles.segment,
                    flashMode === opt && styles.segmentActive,
                    { borderColor: btnBdr, backgroundColor: flashMode === opt ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)") : "transparent" },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => onFlashModeChange?.(opt)}
                >
                  <Text style={[styles.segmentText, { color: text }]}>
                    {opt === "accent" ? t("stageMode", "flashAccent")
                     : opt === "all"  ? t("stageMode", "flashAll")
                     : opt === "both" ? t("stageMode", "flashBoth")
                     : t("stageMode", "flashOff")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SettingRow>

          {/* 햅틱 */}
          <SettingRow label={t("stageMode", "haptic")} textColor={text} faintColor={faint}>
            <Switch
              value={hapticMode !== "off"}
              onValueChange={(v) => onHapticModeChange?.(v ? "all" : "off")}
              trackColor={{ false: isDark ? "#333" : "#ccc", true: "#4A9EFF" }}
              thumbColor="#fff"
            />
          </SettingRow>

          {/* 화면 꺼짐 방지 */}
          <SettingRow label={t("stageMode", "keepAwake")} textColor={text} faintColor={faint}>
            <Switch
              value={settings.keepAwake}
              onValueChange={(v) => updateSettings({ keepAwake: v })}
              trackColor={{ false: isDark ? "#333" : "#ccc", true: "#4A9EFF" }}
              thumbColor="#fff"
            />
          </SettingRow>

          {/* 자동 진행 */}
          <SettingRow label={t("stageMode", "autoAdvance")} textColor={text} faintColor={faint}
            hint={t("stageMode", "autoAdvanceHint")}>
            <Switch
              value={settings.autoAdvance}
              onValueChange={(v) => updateSettings({ autoAdvance: v })}
              trackColor={{ false: isDark ? "#333" : "#ccc", true: "#4A9EFF" }}
              thumbColor="#fff"
            />
          </SettingRow>

          {/* 카운트다운 */}
          <SettingRow label={t("stageMode", "countdown")} textColor={text} faintColor={faint}>
            <View style={styles.segmentRow}>
              {([0, 1, 2, 4] as const).map((opt) => (
                <Pressable
                  key={opt}
                  style={({ pressed }) => [
                    styles.segment,
                    settings.countdown === opt && styles.segmentActive,
                    { borderColor: btnBdr, backgroundColor: settings.countdown === opt ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)") : "transparent" },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => updateSettings({ countdown: opt })}
                >
                  <Text style={[styles.segmentText, { color: text }]}>
                    {opt === 0 ? t("stageMode", "countdown0") : `${opt}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SettingRow>

          {/* 악보 하이라이트 위치 */}
          <SettingRow label={t("stageMode", "scoreHighlight")} textColor={text} faintColor={faint}>
            <View style={styles.segmentRow}>
              {(["top", "center", "bottom"] as const).map((opt) => (
                <Pressable
                  key={opt}
                  style={({ pressed }) => [
                    styles.segment,
                    settings.scoreHighlight === opt && styles.segmentActive,
                    { borderColor: btnBdr, backgroundColor: settings.scoreHighlight === opt ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)") : "transparent" },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => updateSettings({ scoreHighlight: opt })}
                >
                  <Text style={[styles.segmentText, { color: text }]}>
                    {t("stageMode", opt === "top" ? "scoreHighlightTop" : opt === "center" ? "scoreHighlightCenter" : "scoreHighlightBottom")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SettingRow>

          {/* 키보드 단축키 */}
          <View style={srow.row}>
            <Text style={[srow.label, { color: text }]}>{t("stageMode", "keyShortcuts")}</Text>
            <Text style={[srow.hint, { color: faint }]}>{t("stageMode", "keyShortcutsHint")}</Text>
          </View>
          {["1","2","3","4","5","6","7","8","9","0"].map((k) => {
            const mappedId = (settings.keyMappings ?? {})[k];
            const mappedEntry = mappedId ? practiceBook.find((e) => e.id === mappedId) : null;
            return (
              <View key={k} style={[srow.row, { flexDirection: "row", alignItems: "center" }]}>
                <View style={styles.keyBadge}>
                  <Text style={[styles.keyBadgeText, { color: text }]}>{k}</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.keyMappingBtn,
                    { borderColor: btnBdr, backgroundColor: pressed ? btnBg : "transparent", flex: 1 },
                  ]}
                  onPress={() => setKeyPickerTarget(k)}
                >
                  <Text style={[styles.keyMappingBtnText, { color: mappedEntry ? text : faint }]} numberOfLines={1}>
                    {mappedEntry ? mappedEntry.label : t("stageMode", "keyNone")}
                  </Text>
                </Pressable>
                {mappedEntry && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      const next = { ...(settings.keyMappings ?? {}) };
                      delete next[k];
                      updateSettings({ keyMappings: next });
                    }}
                  >
                    <Ionicons name="close-circle" size={18} color={faint} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* ── 셋 리스트 피커 모달 ───────────────────────────────────── */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: panelBg }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: text }]}>{t("stageMode", "pickerTitle")}</Text>
              <Pressable onPress={() => setPickerOpen(false)}>
                <Ionicons name="close" size={24} color={faint} />
              </Pressable>
            </View>
            {availableEntries.length === 0 ? (
              <Text style={[styles.pickerEmpty, { color: faint }]}>{t("stageMode", "pickerEmpty")}</Text>
            ) : (
              <FlatList
                data={availableEntries}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.pickerList}
                renderItem={({ item }) => {
                  const mode  = getEntryMode(item);
                  const badge = MODE_BADGE[mode] ?? MODE_BADGE["beat"]!;
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.pickerItem,
                        { borderColor: cardBdr, backgroundColor: pressed ? cardBg : "transparent" },
                      ]}
                      onPress={() => {
                        addToSetlist(item);
                        setPickerOpen(false);
                      }}
                    >
                      <View style={[styles.modeBadge, { backgroundColor: badge.color + "33" }]}>
                        <Text style={[styles.modeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                      <View style={styles.pickerItemText}>
                        <Text style={[styles.pickerItemLabel, { color: text }]} numberOfLines={1}>
                          {item.label}
                        </Text>
                        <Text style={[styles.pickerItemMeta, { color: faint }]}>
                          {item.bpm} BPM · {item.beatsPerMeasure}/{beatDenominator}
                        </Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={22} color={faint} />
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── 네이티브 숨겨진 TextInput: 블루투스 키보드 1~0 캡처 ────── */}
      {Platform.OS !== "web" && (
        <TextInput
          style={{ position: "absolute", opacity: 0, width: 1, height: 1, left: -9999 }}
          autoFocus
          blurOnSubmit={false}
          onKeyPress={({ nativeEvent }) => {
            const key = nativeEvent.key;
            if (/^[0-9]$/.test(key)) {
              const entryId = (settingsRef.current.keyMappings ?? {})[key];
              if (!entryId) return;
              const entry = practiceBookRef.current.find((e) => e.id === entryId);
              if (entry) addToSetlist(entry);
            }
          }}
        />
      )}

      {/* ── 예약 점프 토스트 (Ctrl+숫자) ─────────────────────────── */}
      {pendingJumpIdx !== null && (
        <View style={styles.pendingJumpToast} pointerEvents="none">
          <Text style={styles.pendingJumpToastText}>
            → #{pendingJumpIdx + 1}
          </Text>
        </View>
      )}

      {/* ── 키 매핑 피커 모달 ────────────────────────────────────── */}
      <Modal
        visible={keyPickerTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setKeyPickerTarget(null)}
      >
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: panelBg }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: text }]}>
                {t("stageMode", "keyPickerTitle")} [{keyPickerTarget}]
              </Text>
              <Pressable onPress={() => setKeyPickerTarget(null)}>
                <Ionicons name="close" size={24} color={faint} />
              </Pressable>
            </View>
            <FlatList
              data={practiceBook}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.pickerList}
              renderItem={({ item }) => {
                const mode  = getEntryMode(item);
                const badge = MODE_BADGE[mode] ?? MODE_BADGE["beat"]!;
                const isMapped = keyPickerTarget !== null &&
                  (settings.keyMappings ?? {})[keyPickerTarget] === item.id;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.pickerItem,
                      { borderColor: isMapped ? badge.color : cardBdr, backgroundColor: pressed ? cardBg : "transparent" },
                    ]}
                    onPress={() => {
                      if (keyPickerTarget) {
                        updateSettings({ keyMappings: { ...(settings.keyMappings ?? {}), [keyPickerTarget]: item.id } });
                        setKeyPickerTarget(null);
                      }
                    }}
                  >
                    <View style={[styles.modeBadge, { backgroundColor: badge.color + "33" }]}>
                      <Text style={[styles.modeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                    <View style={styles.pickerItemText}>
                      <Text style={[styles.pickerItemLabel, { color: text }]} numberOfLines={1}>
                        {item.label}
                      </Text>
                      <Text style={[styles.pickerItemMeta, { color: faint }]}>
                        {item.bpm} BPM · {item.beatsPerMeasure}/{beatDenominator}
                      </Text>
                    </View>
                    {isMapped && <Ionicons name="checkmark-circle" size={20} color={badge.color} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── 웹 종료 확인 ─────────────────────────────────────────── */}
      {confirmExit && (
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmSheet, { backgroundColor: panelBg }]}>
            <Text style={[styles.confirmText, { color: text }]}>{t("stageMode", "exitMessage")}</Text>
            <View style={styles.confirmButtons}>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: cardBg, borderColor: cardBdr }]}
                onPress={() => setConfirmExit(false)}
              >
                <Text style={[styles.confirmBtnText, { color: text }]}>{t("stageMode", "exitCancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: "rgba(255,68,68,0.15)", borderColor: "rgba(255,68,68,0.3)" }]}
                onPress={onExit}
              >
                <Text style={[styles.confirmBtnText, { color: "#ff4444" }]}>{t("stageMode", "exitConfirm")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── 설정 행 헬퍼 ────────────────────────────────────────────────────
function SettingRow({
  label, hint, textColor, faintColor, children,
}: {
  label: string; hint?: string; textColor: string; faintColor: string; children: React.ReactNode;
}) {
  return (
    <View style={srow.row}>
      <View style={srow.labelCol}>
        <Text style={[srow.label, { color: textColor }]}>{label}</Text>
        {hint ? <Text style={[srow.hint, { color: faintColor }]}>{hint}</Text> : null}
      </View>
      <View style={srow.control}>{children}</View>
    </View>
  );
}

const srow = StyleSheet.create({
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(128,128,128,0.2)", gap: 8 },
  labelCol: { flex: 1, marginBottom: 4 },
  label: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium" },
  hint:  { fontSize: 11, fontFamily: "SpaceGrotesk_400Regular", marginTop: 2 },
  control: { alignItems: "flex-end" },
});

// ─── 스타일 ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99998,
  },
  flashLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    pointerEvents: "none" as const,
    zIndex: 1,
  },

  // ── 상단 바 ─────────────────────────────────────────────────────
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 4,
    zIndex: 2,
  },
  topBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 44,
  },
  topBarBtnText: {
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  topTitle: {
    fontSize: 13,
    fontFamily: "SpaceGrotesk_500Medium",
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  // ── 기본 메인 컨텐츠 (비트/바 모드) ─────────────────────────────
  mainContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 20,
    zIndex: 2,
  },

  // ── 전체화면 레이아웃 (악보/사진 모드) ──────────────────────────
  fullscreenLayout: {
    flex: 1,
    zIndex: 2,
  },
  fullscreenContent: {
    flex: 1,
    overflow: "hidden",
  },
  fullscreenPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  fullscreenPlaceholderText: {
    fontSize: 16,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  notePhoto: {
    flex: 1,
    width: "100%",
  },

  // ── 미니바 (전체화면 모드 하단) ─────────────────────────────────
  miniBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  miniBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  miniBeat: {
    fontSize: 28,
    fontFamily: "SpaceGrotesk_700Bold",
    minWidth: 60,
  },
  miniTotal: {
    fontSize: 16,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  miniBpmArea: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 10,
  },
  miniBpm: {
    fontSize: 28,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  miniBpmUnit: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk_400Regular",
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  // ── BPM 읽기 전용 (재생 중) ─────────────────────────────────────
  bpmReadOnly: {
    alignItems: "center",
    paddingVertical: 16,
    width: "100%",
  },
  bpmReadOnlyLabel: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk_400Regular",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  bpmReadOnlyNumber: {
    fontSize: 56,
    fontFamily: "SpaceGrotesk_700Bold",
    lineHeight: 60,
    includeFontPadding: false,
  },

  // ── BPM 컨트롤러 ────────────────────────────────────────────────
  bpmController: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  timeSigBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
  },
  timeSigText: {
    fontSize: 17,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  timeSigSmall: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk_400Regular",
    marginTop: 2,
  },
  bpmTapArea: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  bpmTapLabel: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk_400Regular",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  bpmTapNumber: {
    fontSize: 42,
    fontFamily: "SpaceGrotesk_700Bold",
    lineHeight: 48,
    includeFontPadding: false,
  },
  bpmTapHint: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk_400Regular",
  },

  // ── BPM ±버튼 ───────────────────────────────────────────────────
  bpmButtons: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    marginTop: 4,
  },
  bpmBtn: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  bpmBtnText: {
    fontSize: 18,
    fontFamily: "SpaceGrotesk_700Bold",
  },

  // ── BPM 슬라이더 래퍼 (정지 중) ─────────────────────────────────
  bpmSliderWrap: {
    width: "100%",
    marginVertical: 4,
  },
  bpmReadOnlyTimeSig: {
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
    letterSpacing: 1,
    marginTop: 4,
  },
  beatCountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 6,
  },
  beatCountBtn: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  beatCountText: {
    fontSize: 15,
    fontFamily: "SpaceGrotesk_500Medium",
    minWidth: 80,
    textAlign: "center",
  },

  // ── 재생/정지 ────────────────────────────────────────────────────
  playPauseBtn: {
    marginTop: 4,
    padding: 4,
    borderRadius: 50,
  },

  // ── 셋 리스트 ────────────────────────────────────────────────────
  setlistSection: {
    width: "100%",
    zIndex: 2,
  },
  setlistHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  setlistLabel: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk_500Medium",
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  nextBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  nextBtnText: {
    fontSize: 12,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  setlistContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
  },
  addBtn: {
    width: 52,
    height: 72,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySetlistCenter: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  seqBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(128,128,128,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  seqBadgeText: {
    fontSize: 8,
    fontFamily: "SpaceGrotesk_700Bold",
    lineHeight: 10,
  },
  setCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 100,
    maxWidth: 160,
    height: 72,
    justifyContent: "space-between",
  },
  setCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  setCardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  setCardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sampleBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(162,155,254,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  // ── 재생 중 셋리스트 영역 ───────────────────────────────────────
  setlistPlayingBar: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  nextBtnLarge: {
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },

  // ── 컨텍스트 메뉴 버튼 ───────────────────────────────────────────
  ctxBtns: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    flex: 1,
  },
  ctxBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  modeBadgeText: {
    fontSize: 8,
    fontFamily: "SpaceGrotesk_700Bold",
    letterSpacing: 1,
  },
  setCardLabel: {
    fontSize: 12,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  setCardMeta: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  emptySetlist: {
    width: 200,
    height: 72,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emptySetlistText: {
    fontSize: 12,
    fontFamily: "SpaceGrotesk_400Regular",
    textAlign: "center",
  },

  // ── 설정 패널 ───────────────────────────────────────────────────
  settingsDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 10,
  },
  settingsPanel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 320,
    zIndex: 20,
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 20,
  },
  settingsPanelContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  settingsPanelTitle: {
    fontSize: 16,
    fontFamily: "SpaceGrotesk_700Bold",
    marginBottom: 16,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  segment: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  segmentActive: {
    // tintColor applied inline
  },
  segmentText: {
    fontSize: 12,
    fontFamily: "SpaceGrotesk_500Medium",
  },

  // ── 피커 ─────────────────────────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    paddingTop: 16,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 16,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  pickerEmpty: {
    textAlign: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    fontSize: 14,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  pickerList: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 4,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  pickerItemText: {
    flex: 1,
  },
  pickerItemLabel: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  pickerItemMeta: {
    fontSize: 11,
    fontFamily: "SpaceGrotesk_400Regular",
    marginTop: 1,
  },

  // ── 종료 확인 ─────────────────────────────────────────────────────
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
  },
  confirmSheet: {
    width: "85%",
    borderRadius: 20,
    padding: 24,
    gap: 20,
  },
  confirmText: {
    fontSize: 16,
    fontFamily: "SpaceGrotesk_400Regular",
    textAlign: "center",
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 12,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },

  // ── 키보드 단축키 설정 ─────────────────────────────────────────────
  keyBadge: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  keyBadgeText: {
    fontSize: 12,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  keyMappingBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  keyMappingBtnText: {
    fontSize: 12,
    fontFamily: "SpaceGrotesk_400Regular",
  },

  // ── 예약 점프 토스트 ────────────────────────────────────────────────
  pendingJumpToast: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 50,
  },
  pendingJumpToastText: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_700Bold",
    color: "#55EFC4",
    letterSpacing: 1,
  },

  confirmBtnText: {
    fontSize: 15,
    fontFamily: "SpaceGrotesk_500Medium",
  },
});

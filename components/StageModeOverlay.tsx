"use no memo";
/**
 * StageModeOverlay — 무대 모드 전면 재설계 (Task #383)
 *
 * 구조:
 *  - 상단 바: 종료 버튼(좌), 설정 버튼(우)
 *  - 중앙: StageBeatColumn (현재/다음 비트 수직 표시)
 *  - BPM 컨트롤러: 탭 탬포 영역 + 박자표 + ±1/±5 버튼 (일시정지 시 활성)
 *  - 재생/정지 버튼
 *  - 셋 리스트: + 추가 버튼 + 가로 스크롤 카드 (전 모드 지원)
 *  - 설정 패널: 우측에서 슬라이드-인 (플래시/햅틱/카운트다운/자동진행/테마)
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
import { StageBeatColumn } from "@/components/StageBeatColumn";
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
}

const DEFAULT_STAGE_SETTINGS: StageSettings = {
  theme:          "dark",
  countdown:      0,
  autoAdvance:    true,
  keepAwake:      true,
  scoreHighlight: "center",
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
  /** 연습장 전체 목록 (셋 리스트 추가 피커에서 사용) */
  practiceBook?: PracticeEntry[];
  /** 현재 활성(하이라이트) 셋 리스트 항목 ID */
  activeEntryId?: string;
  /** 셋 리스트 항목 선택 — 엔진 재시작 없이 즉시 전환 */
  onSelectEntry?: (entry: PracticeEntry) => void;
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
  practiceBook = [],
  activeEntryId,
  onSelectEntry,
}: StageModeOverlayProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  // ── 설정 & 셋 리스트 상태 ──────────────────────────────────────────
  const [settings, setSettings]       = useState<StageSettings>(DEFAULT_STAGE_SETTINGS);
  const [setlist,  setSetlist]        = useState<PracticeEntry[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen,   setPickerOpen]   = useState(false);
  const [confirmExit,  setConfirmExit]  = useState(false);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // ── 마운트 시 로드 ────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    loadStageSettings().then(setSettings).catch(() => {});
    loadStageSetlist().then((saved) => {
      if (saved.length > 0) {
        setSetlist(saved);
      } else {
        // 셋 리스트 비어있으면 연습장에서 자동 채우기
        setSetlist(practiceBook.slice(0, 8));
      }
    }).catch(() => {});
    setConfirmExit(false);
    setSettingsOpen(false);
    setPickerOpen(false);
  }, [visible]);

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
      setConfirmExit(true);
      return true;
    });
    return () => handler.remove();
  }, [visible, settingsOpen, pickerOpen]);

  // ── 활성 항목 ────────────────────────────────────────────────────
  const activeEntry = setlist.find((e) => e.id === activeEntryId) ?? null;

  // ── 셋 리스트 조작 ───────────────────────────────────────────────
  const addToSetlist = useCallback((entry: PracticeEntry) => {
    setSetlist((prev) => {
      if (prev.find((e) => e.id === entry.id)) return prev;
      const next = [...prev, entry];
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
  }, []);

  // ── 다음 항목으로 이동 ────────────────────────────────────────────
  const advanceSetlist = useCallback(() => {
    if (setlist.length === 0) return;
    const idx = setlist.findIndex((e) => e.id === activeEntryId);
    const nextIdx = (idx + 1) % setlist.length;
    const next = setlist[nextIdx];
    if (next) onSelectEntry?.(next);
  }, [setlist, activeEntryId, onSelectEntry]);

  // ── 레이아웃 ────────────────────────────────────────────────────
  const webTop    = Platform.OS === "web" ? 67 : 0;
  const topPad    = (insets.top || webTop) + 8;
  const bottomPad = (insets.bottom || (Platform.OS === "web" ? 34 : 0)) + 8;

  const isDark = settings.theme === "dark";
  const bg      = isDark ? "#0a0a0a" : "#f0f0f0";
  const text    = isDark ? "#ffffff" : "#111111";
  const faint   = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const cardBg  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const cardBdr = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const btnBg   = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  const btnBdr  = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
  const panelBg = isDark ? "#181818" : "#e8e8e8";

  if (!visible) return null;

  const timeSigText = `${beatsPerMeasure}/${beatDenominator}`;

  // ── 피커에서 추가 가능한 항목 ─────────────────────────────────────
  const availableEntries = practiceBook.filter((e) => !setlist.find((s) => s.id === e.id));

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

      {/* ── 메인 컨텐츠 ─────────────────────────────────────────── */}
      <View style={styles.mainContent}>
        {/* 비트 컬럼 */}
        <StageBeatColumn
          currentBeat={currentBeat}
          beatsPerMeasure={beatsPerMeasure}
          beatTypes={beatTypes}
          theme={settings.theme}
        />

        {/* BPM 컨트롤러 */}
        <View style={styles.bpmController}>
          {/* 박자표 버튼 */}
          <Pressable
            style={({ pressed }) => [styles.timeSigBtn, { borderColor: btnBdr, backgroundColor: pressed ? btnBg : "transparent" }]}
            onPress={onBeatDenominatorCycle}
            disabled={isPlaying}
            accessibilityLabel="Time signature"
          >
            <Text style={[styles.timeSigText, { color: isPlaying ? faint : text, opacity: isPlaying ? 0.5 : 1 }]}>
              {timeSigText}
            </Text>
          </Pressable>

          {/* 탭 탬포 / BPM 표시 */}
          <Pressable
            style={({ pressed }) => [
              styles.bpmTapArea,
              { backgroundColor: pressed ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)") : cardBg, borderColor: cardBdr },
            ]}
            onPress={onTapTempo}
            accessibilityLabel="Tap tempo"
            testID="stage-mode-bpm"
          >
            <Text style={[styles.bpmTapLabel, { color: faint }]}>{t("stageMode", "bpmLabel")}</Text>
            <Text style={[styles.bpmTapNumber, { color: text }]}>{bpm}</Text>
            <Text style={[styles.bpmTapHint, { color: faint }]}>{t("stageMode", "tapTempo")}</Text>
          </Pressable>

          {/* 비트 수 ±1 */}
          <Pressable
            style={({ pressed }) => [styles.timeSigBtn, { borderColor: btnBdr, backgroundColor: pressed ? btnBg : "transparent" }]}
            onPress={() => onBeatsPerMeasureChange(Math.max(1, beatsPerMeasure - 1))}
            onLongPress={() => {}}
            disabled={isPlaying}
            accessibilityLabel="Beats −1"
          >
            <Ionicons name="remove" size={16} color={isPlaying ? faint : text} style={{ opacity: isPlaying ? 0.4 : 1 }} />
            <Text style={[styles.timeSigSmall, { color: isPlaying ? faint : text, opacity: isPlaying ? 0.4 : 1 }]}>
              {t("stageMode", "beats")}
            </Text>
          </Pressable>
        </View>

        {/* BPM ±1/±5 버튼 */}
        <View style={styles.bpmButtons}>
          <Pressable
            style={({ pressed }) => [styles.bpmBtn, { borderColor: btnBdr, backgroundColor: pressed ? btnBg : cardBg }]}
            onPress={() => handleBpmPress(-5)}
            onPressIn={() => startHold(-5)}
            onPressOut={stopHold}
            testID="stage-mode-bpm-minus5"
          >
            <Text style={[styles.bpmBtnText, { color: text }]}>−5</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.bpmBtn, { borderColor: btnBdr, backgroundColor: pressed ? btnBg : cardBg }]}
            onPress={() => handleBpmPress(-1)}
            onPressIn={() => startHold(-1)}
            onPressOut={stopHold}
            testID="stage-mode-bpm-minus"
          >
            <Text style={[styles.bpmBtnText, { color: text }]}>−1</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.bpmBtn, { borderColor: btnBdr, backgroundColor: pressed ? btnBg : cardBg }]}
            onPress={() => handleBpmPress(1)}
            onPressIn={() => startHold(1)}
            onPressOut={stopHold}
            testID="stage-mode-bpm-plus"
          >
            <Text style={[styles.bpmBtnText, { color: text }]}>+1</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.bpmBtn, { borderColor: btnBdr, backgroundColor: pressed ? btnBg : cardBg }]}
            onPress={() => handleBpmPress(5)}
            onPressIn={() => startHold(5)}
            onPressOut={stopHold}
            testID="stage-mode-bpm-plus5"
          >
            <Text style={[styles.bpmBtnText, { color: text }]}>+5</Text>
          </Pressable>
        </View>

        {/* 재생/정지 버튼 */}
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
      </View>

      {/* 셋 리스트 */}
      <View style={styles.setlistSection}>
        <View style={styles.setlistHeader}>
          <Text style={[styles.setlistLabel, { color: faint }]}>
            {t("stageMode", "setList")}
          </Text>
          {isPlaying && (
            <Pressable
              style={({ pressed }) => [
                styles.nextBtn,
                { borderColor: btnBdr, backgroundColor: pressed ? btnBg : "transparent" },
              ]}
              onPress={advanceSetlist}
            >
              <Text style={[styles.nextBtnText, { color: text }]}>{t("stageMode", "next")} →</Text>
            </Pressable>
          )}
        </View>

        <FlatList
          data={setlist}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.setlistContent}
          ListHeaderComponent={() => (
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
          renderItem={({ item }) => {
            const isActive = item.id === activeEntryId;
            const mode     = getEntryMode(item);
            const badge    = MODE_BADGE[mode] ?? MODE_BADGE["beat"];
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.setCard,
                  { backgroundColor: isActive ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)") : cardBg,
                    borderColor: isActive ? (isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)") : cardBdr },
                  pressed && { opacity: 0.65 },
                ]}
                onPress={() => onSelectEntry?.(item)}
                onLongPress={() => removeFromSetlist(item.id)}
                delayLongPress={600}
                testID={`stage-set-entry-${item.id}`}
              >
                <View style={styles.setCardTop}>
                  <View style={[styles.modeBadge, { backgroundColor: badge.color + "33" }]}>
                    <Text style={[styles.modeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                  {isActive && (
                    <Ionicons name="radio-button-on" size={10} color={badge.color} />
                  )}
                </View>
                <Text
                  style={[styles.setCardLabel, { color: isActive ? text : faint }]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                <Text style={[styles.setCardMeta, { color: faint }]}>
                  {item.bpm} BPM · {item.beatsPerMeasure}/{beatDenominator}
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={() => (
            <Pressable
              style={[styles.emptySetlist, { borderColor: cardBdr }]}
              onPress={() => setPickerOpen(true)}
            >
              <Text style={[styles.emptySetlistText, { color: faint }]}>
                {t("stageMode", "setlistEmpty")}
              </Text>
            </Pressable>
          )}
        />
      </View>

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
              {(["accent", "all", "off"] as FlashMode[]).map((opt) => (
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
                    {t("stageMode", opt === "accent" ? "flashAccent" : opt === "all" ? "flashAll" : "flashOff")}
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
                  const badge = MODE_BADGE[mode] ?? MODE_BADGE["beat"];
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

  // ── 메인 컨텐츠 ─────────────────────────────────────────────────
  mainContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 20,
    zIndex: 2,
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
  confirmBtnText: {
    fontSize: 15,
    fontFamily: "SpaceGrotesk_500Medium",
  },
});

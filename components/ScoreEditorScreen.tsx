// ============================================================
// ScoreEditorScreen — 악보 편집 화면 (2단계 터치 입력 UX)
// ============================================================

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Modal,
  StyleSheet,
  Pressable,
  Switch,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import { saveScore, createEmptyMeasure } from "@/lib/score-storage";
import type {
  ScoreDocument,
  ScoreNote,
  ScoreRest,
  NoteDuration,
  Pitch,
  Accidental,
  ArticulationType,
  Dynamic,
} from "@/lib/score-types";
import { INSTRUMENTS } from "@/lib/score-types";
import { ScoreCanvas } from "@/components/ScoreCanvas";
import type { EditorTool } from "@/components/ScoreCanvas";
import { ScoreRenderer } from "@/components/ScoreRenderer";
import { ScorePalette, ALL_INSTR_SYMBOLS } from "@/components/ScorePalette";
import { useScorePlayback } from "@/hooks/useScorePlayback";

// ── 헬퍼 ──────────────────────────────────────────────────────

const MAX_HISTORY = 50;

function makeNote(
  pitch: Pitch,
  duration: NoteDuration,
  accidental?: Accidental | null,
  articulations?: ArticulationType[],
  dynamic?: Dynamic,
): ScoreNote {
  const finalPitch: Pitch = accidental
    ? { ...pitch, accidental }
    : pitch;
  return {
    id: Crypto.randomUUID(),
    type: "note",
    pitch: finalPitch,
    duration,
    articulations: articulations?.length ? articulations : undefined,
    dynamic: dynamic ?? undefined,
  };
}

function makeRest(duration: NoteDuration): ScoreRest {
  return {
    id: Crypto.randomUUID(),
    type: "rest",
    duration,
  };
}

// ── Props ─────────────────────────────────────────────────────

export interface ScoreEditorScreenProps {
  doc: ScoreDocument;
  onBack: () => void;
  onSaved: (doc: ScoreDocument) => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function ScoreEditorScreen({ doc: initialDoc, onBack, onSaved }: ScoreEditorScreenProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const { width: windowWidth } = useWindowDimensions();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topInset = insets.top || webTopInset;
  const bottomInset = insets.bottom || (Platform.OS === "web" ? 34 : 0);

  // ── 악보 상태 ────────────────────────────────────────────────
  const [doc, setDocRaw] = useState<ScoreDocument>(initialDoc);

  // ── undo/redo 스택 ────────────────────────────────────────────
  const historyRef = useRef<ScoreDocument[]>([initialDoc]);
  const histIdxRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function applyDoc(newDoc: ScoreDocument, addToHistory = true) {
    setDocRaw(newDoc);
    if (!addToHistory) return;
    // 현재 인덱스 이후 히스토리 제거
    const sliced = historyRef.current.slice(0, histIdxRef.current + 1);
    sliced.push(newDoc);
    if (sliced.length > MAX_HISTORY) sliced.shift();
    historyRef.current = sliced;
    histIdxRef.current = sliced.length - 1;
    setCanUndo(histIdxRef.current > 0);
    setCanRedo(false);
  }

  function handleUndo() {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current--;
    const prev = historyRef.current[histIdxRef.current];
    if (prev) {
      setDocRaw(prev);
      setCanUndo(histIdxRef.current > 0);
      setCanRedo(true);
    }
  }

  function handleRedo() {
    if (histIdxRef.current >= historyRef.current.length - 1) return;
    histIdxRef.current++;
    const next = historyRef.current[histIdxRef.current];
    if (next) {
      setDocRaw(next);
      setCanUndo(true);
      setCanRedo(histIdxRef.current < historyRef.current.length - 1);
    }
  }

  // ── 편집 도구 상태 ────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<EditorTool>("note");
  const [activeDuration, setActiveDuration] = useState<NoteDuration>("quarter");
  const [isDotted, setIsDotted] = useState(false);
  const [accidental, setAccidental] = useState<Accidental | null>(null);
  const [selectedArticulation, setSelectedArticulation] = useState<ArticulationType | null>(null);
  const [selectedDynamic, setSelectedDynamic] = useState<Dynamic | null>(null);

  // ── 선택 상태 ─────────────────────────────────────────────────
  const [selectedPartIdx, setSelectedPartIdx] = useState(0);
  const [selectedMeasureIdx, setSelectedMeasureIdx] = useState<number | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // ── 재생 연동 ─────────────────────────────────────────────────
  const playback = useScorePlayback(doc);
  const scoreScrollRef = useRef<ScrollView>(null);
  const measureRowYRef = useRef<Record<number, number>>({}); // measureIdx → scrollY

  // currentMeasureIdx 변경 시 자동 스크롤
  useEffect(() => {
    if (!playback.isPlaying) return;
    const y = measureRowYRef.current[playback.currentMeasureIdx];
    if (y !== undefined) {
      scoreScrollRef.current?.scrollTo({ y: Math.max(0, y - 48), animated: true });
    }
  }, [playback.currentMeasureIdx, playback.isPlaying]);

  // 재생 설정 (doc.playbackSettings 기반)
  const showPlayhead = doc.playbackSettings?.showPlayhead !== false;
  const showZoomView = doc.playbackSettings?.showZoomView !== false;

  function updatePlaybackSettings(patch: { showPlayhead?: boolean; showZoomView?: boolean }) {
    applyDoc({
      ...doc,
      playbackSettings: { ...doc.playbackSettings, ...patch },
    });
  }

  // 하이라이트 색상
  const highlightColor = C.accent + "28"; // ~16% opacity

  // ── 악기 기호 설정 모달 ──────────────────────────────────────
  const [showSymbolSettings, setShowSymbolSettings] = useState(false);

  // ── 저장 ──────────────────────────────────────────────────────
  const [savedToast, setSavedToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(async () => {
    try {
      await saveScore(doc);
      onSaved(doc);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setSavedToast(true);
      toastTimerRef.current = setTimeout(() => setSavedToast(false), 1800);
    } catch {
      Alert.alert("Error", "Could not save score.");
    }
  }, [doc, onSaved]);

  // ── 마디 추가 ─────────────────────────────────────────────────
  function handleAddMeasure() {
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((part) => ({
        ...part,
        measures: [...part.measures, createEmptyMeasure()],
      })),
    };
    applyDoc(newDoc);
    setSelectedMeasureIdx((doc.parts[selectedPartIdx]?.measures.length) ?? 0);
  }

  // ── 마디 삭제 ─────────────────────────────────────────────────
  function handleDeleteMeasure(mIdx: number) {
    const part = doc.parts[selectedPartIdx];
    if (!part || part.measures.length <= 1) return;
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p) => ({
        ...p,
        measures: p.measures.filter((_, i) => i !== mIdx),
      })),
    };
    applyDoc(newDoc);
    if (selectedMeasureIdx === mIdx) setSelectedMeasureIdx(null);
  }

  // ── 음표 추가 (터치 확정) ─────────────────────────────────────
  const handleNotePlaced = useCallback(
    (measureIdx: number, pitch: Pitch, duration: NoteDuration, insertIdx: number) => {
      const newElement = makeNote(
        pitch,
        duration,
        accidental,
        selectedArticulation ? [selectedArticulation] : [],
        selectedDynamic ?? undefined,
      );
      const newDoc: ScoreDocument = {
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((m, mi) => {
              if (mi !== measureIdx) return m;
              // X 좌표로 계산한 위치에 삽입
              const next = [...m.elements];
              next.splice(insertIdx, 0, newElement);
              return { ...m, elements: next };
            }),
          };
        }),
      };
      applyDoc(newDoc);
      setSelectedElementId(newElement.id);
      // 같은 마디 내 다음 슬롯으로 커서 이동
      // 현재 마디의 elements 수 + 1 (방금 삽입한 것)
      const curMeasure = doc.parts[selectedPartIdx]?.measures[measureIdx];
      const newLen = (curMeasure?.elements.length ?? 0) + 1;
      const nextIdx = insertIdx + 1;
      if (nextIdx >= newLen) {
        // 마디 끝 → 다음 마디로
        const totalMeasures = doc.parts[selectedPartIdx]?.measures.length ?? 1;
        if (measureIdx < totalMeasures - 1) {
          setSelectedMeasureIdx(measureIdx + 1);
        }
      } else {
        setSelectedMeasureIdx(measureIdx);
      }
    },
    [doc, selectedPartIdx, accidental, selectedArticulation, selectedDynamic],
  );

  // ── 쉼표 추가 ─────────────────────────────────────────────────
  const handleRestPlaced = useCallback(
    (measureIdx: number, duration: NoteDuration, insertIdx: number) => {
      const newElement = makeRest(duration);
      const newDoc: ScoreDocument = {
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((m, mi) => {
              if (mi !== measureIdx) return m;
              const next = [...m.elements];
              next.splice(insertIdx, 0, newElement);
              return { ...m, elements: next };
            }),
          };
        }),
      };
      applyDoc(newDoc);
      setSelectedElementId(newElement.id);
      const curMeasure = doc.parts[selectedPartIdx]?.measures[measureIdx];
      const newLen = (curMeasure?.elements.length ?? 0) + 1;
      const nextIdx = insertIdx + 1;
      if (nextIdx >= newLen) {
        const totalMeasures = doc.parts[selectedPartIdx]?.measures.length ?? 1;
        if (measureIdx < totalMeasures - 1) {
          setSelectedMeasureIdx(measureIdx + 1);
        }
      } else {
        setSelectedMeasureIdx(measureIdx);
      }
    },
    [doc, selectedPartIdx, selectedDynamic],
  );

  // ── 지우기 — hitTest로 찾은 정확한 요소 제거 ─────────────────
  const handleEraseElement = useCallback(
    (elementId: string, measureIdx: number) => {
      const newDoc: ScoreDocument = {
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((m, mi) => {
              if (mi !== measureIdx) return m;
              return {
                ...m,
                elements: m.elements.filter((el) => el.id !== elementId),
              };
            }),
          };
        }),
      };
      applyDoc(newDoc);
      if (selectedElementId === elementId) setSelectedElementId(null);
    },
    [doc, selectedPartIdx, selectedElementId],
  );

  // ── 음표 탭 선택 ──────────────────────────────────────────────
  const handleElementTap = useCallback(
    (elementId: string, measureIdx: number) => {
      setSelectedElementId((prev) => (prev === elementId ? null : elementId));
      setSelectedMeasureIdx(measureIdx);
    },
    [],
  );

  const handleMeasureTap = useCallback((measureIdx: number) => {
    setSelectedMeasureIdx(measureIdx);
    setSelectedElementId(null);
  }, []);

  // ── 선택된 음표 삭제 ──────────────────────────────────────────
  function handleDeleteSelected() {
    if (!selectedElementId) return;
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m) => ({
            ...m,
            elements: m.elements.filter((el) => el.id !== selectedElementId),
          })),
        };
      }),
    };
    applyDoc(newDoc);
    setSelectedElementId(null);
  }

  // ── 선택된 음표에 임시표 적용 ─────────────────────────────────
  function handleApplyAccidentalToSelected(acc: Accidental | null) {
    if (!selectedElementId) return;
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m) => ({
            ...m,
            elements: m.elements.map((el) => {
              if (el.id !== selectedElementId || el.type !== "note") return el;
              // accidental은 Pitch.accidental에 저장 (ScoreNote에 직접 없음)
              const newPitch: Pitch = {
                ...el.pitch,
                accidental: acc ?? undefined,
              };
              return { ...el, pitch: newPitch };
            }),
          })),
        };
      }),
    };
    applyDoc(newDoc);
  }

  // ── 선택된 음표에 아티큘레이션 적용 ───────────────────────────
  function handleApplyArticulationToSelected(art: ArticulationType | null) {
    if (!selectedElementId) return;
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m) => ({
            ...m,
            elements: m.elements.map((el) => {
              if (el.id !== selectedElementId || el.type !== "note") return el;
              const existing = el.articulations ?? [];
              const has = existing.includes(art as ArticulationType);
              const next = art === null
                ? []
                : has
                  ? existing.filter((a) => a !== art)
                  : [...existing, art];
              return { ...el, articulations: next.length ? next : undefined };
            }),
          })),
        };
      }),
    };
    applyDoc(newDoc);
  }

  // ── 음표 드래그 이동 (선택 모드에서 위아래 드래그 → 음높이 변경) ──
  function handleNoteMoved(elementId: string, measureIdx: number, newPitch: Pitch) {
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mIdx) => {
            if (mIdx !== measureIdx) return m;
            return {
              ...m,
              elements: m.elements.map((el) => {
                if (el.id !== elementId || el.type !== "note") return el;
                return { ...el, pitch: newPitch };
              }),
            };
          }),
        };
      }),
    };
    applyDoc(newDoc);
  }

  // ── 악기별 기호 ON/OFF 토글 ─────────────────────────────────
  function handleSymbolToggle(symId: string, enabled: boolean) {
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        const prevEnabled = p.enabledSymbols ?? {};
        return {
          ...p,
          enabledSymbols: { ...prevEnabled, [symId]: enabled },
        };
      }),
    };
    applyDoc(newDoc);
  }

  // ── 빠르기 기호 선택 → 현재 선택된 마디에 tempoText 저장 ────
  function handleTempoSelect(tempoText: string, bpm: number) {
    const targetIdx = selectedMeasureIdx ?? 0;
    const isGradual = tempoText === "rit." || tempoText === "accel.";
    const newDoc: ScoreDocument = {
      ...doc,
      bpm: bpm > 0 ? bpm : doc.bpm,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mIdx) => {
            if (mIdx !== targetIdx) return m;
            return {
              ...m,
              tempoText,
              bpm: bpm > 0 ? bpm : m.bpm,
              tempoChangeType: isGradual
                ? (tempoText === "rit." ? "rit" : "accel")
                : "fixed",
            };
          }),
        };
      }),
    };
    applyDoc(newDoc);
  }

  const containerWidth = windowWidth - Spacing.lg * 2;
  const currentPart = doc.parts[selectedPartIdx];

  const styles = makeStyles(C, S);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* ── 상단 툴바 ─────────────────────────────────────────── */}
      <View
        style={[
          styles.topBar,
          { paddingTop: topInset + 4, borderBottomColor: C.border, backgroundColor: C.surface },
        ]}
      >
        {/* 뒤로가기 */}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={onBack}
          hitSlop={12}
          testID="score-editor-back"
        >
          <Ionicons name="chevron-back" size={S.ms(22, 0.4)} color={C.text} />
        </Pressable>

        {/* 제목 */}
        <Text style={[styles.topTitle, { color: C.text }]} numberOfLines={1}>
          {doc.metadata.title || t("scoreMode", "untitled")}
        </Text>

        {savedToast && (
          <Text style={[styles.savedToast, { color: C.accent }]}>
            {t("scoreMode", "saved")}
          </Text>
        )}

        {/* 실행취소 */}
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            !canUndo && { opacity: 0.3 },
            pressed && canUndo && { opacity: 0.6 },
          ]}
          onPress={handleUndo}
          disabled={!canUndo}
          hitSlop={8}
          testID="score-editor-undo"
        >
          <Ionicons name="arrow-undo" size={S.ms(20, 0.4)} color={C.text} />
        </Pressable>

        {/* 다시실행 */}
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            !canRedo && { opacity: 0.3 },
            pressed && canRedo && { opacity: 0.6 },
          ]}
          onPress={handleRedo}
          disabled={!canRedo}
          hitSlop={8}
          testID="score-editor-redo"
        >
          <Ionicons name="arrow-redo" size={S.ms(20, 0.4)} color={C.text} />
        </Pressable>

        {/* 재생/정지 버튼 */}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={playback.isPlaying ? playback.pause : playback.play}
          hitSlop={8}
          testID="score-editor-play"
        >
          <Ionicons
            name={playback.isPlaying ? "pause" : "play"}
            size={S.ms(20, 0.4)}
            color={playback.isPlaying ? C.accent : C.text}
          />
        </Pressable>

        {/* 정지 버튼 (재생 중에만) */}
        {playback.isPlaying && (
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            onPress={playback.stop}
            hitSlop={8}
            testID="score-editor-stop"
          >
            <Ionicons name="stop" size={S.ms(18, 0.4)} color={C.text} />
          </Pressable>
        )}

        {/* 악기 기호 설정 */}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={() => setShowSymbolSettings(true)}
          hitSlop={8}
          testID="score-editor-symbol-settings"
        >
          <Ionicons name="ellipsis-horizontal" size={S.ms(20, 0.4)} color={C.text} />
        </Pressable>

        {/* 저장 */}
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: C.accent },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSave}
          testID="score-editor-save"
        >
          <Text style={styles.saveBtnText}>{t("scoreMode", "save")}</Text>
        </Pressable>
      </View>

      {/* ── 성부 탭 (2+ 성부 시) ───────────────────────────────── */}
      {doc.parts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.partTabsScroll, { backgroundColor: C.surface, borderBottomColor: C.border }]}
          contentContainerStyle={styles.partTabsContent}
        >
          {doc.parts.map((part, pIdx) => (
            <Pressable
              key={part.id}
              style={[
                styles.partTab,
                {
                  borderBottomColor: selectedPartIdx === pIdx ? C.accent : "transparent",
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setSelectedPartIdx(pIdx)}
              testID={`score-editor-part-tab-${pIdx}`}
            >
              <Text
                style={[
                  styles.partTabText,
                  { color: selectedPartIdx === pIdx ? C.accent : C.textSecondary },
                ]}
              >
                {part.name ?? part.instrumentId}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── 선택된 음표 액션 바 ────────────────────────────────── */}
      {selectedElementId && (
        <View style={[styles.selectionBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <Text style={[styles.selectionLabel, { color: C.textSecondary }]}>
            {t("scoreMode", "toolSelect")} ·
          </Text>

          {/* 임시표 빠른 적용 */}
          {(["♯", "♭", "♮"] as const).map((sym, i) => {
            const accVal: Array<Accidental | null> = ["sharp", "flat", null];
            return (
              <Pressable
                key={sym}
                style={[styles.selBarBtn, { borderColor: C.border }]}
                onPress={() => handleApplyAccidentalToSelected(accVal[i] ?? null)}
              >
                <Text style={[styles.selBarBtnText, { color: C.text }]}>{sym}</Text>
              </Pressable>
            );
          })}

          <View style={{ flex: 1 }} />

          {/* 삭제 */}
          <Pressable
            style={[styles.selBarBtn, { borderColor: "#FF4444" }]}
            onPress={handleDeleteSelected}
            testID="score-editor-delete-selected"
          >
            <Ionicons name="trash-outline" size={16} color="#FF4444" />
          </Pressable>
        </View>
      )}

      {/* ── 악보 스크롤 영역 ───────────────────────────────────── */}
      <ScrollView
        ref={scoreScrollRef}
        style={styles.scoreScroll}
        contentContainerStyle={[
          styles.scoreContent,
          { paddingHorizontal: Spacing.lg, paddingBottom: bottomInset + 180 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={activeTool !== "note" && activeTool !== "rest"}
      >
        {/* 악보 메타 */}
        <View style={styles.scoreHeader}>
          <Text style={[styles.scoreTitle, { color: C.text }]}>
            {doc.metadata.title || t("scoreMode", "untitled")}
          </Text>
          {doc.metadata.composer && (
            <Text style={[styles.scoreMeta, { color: C.textSecondary }]}>
              {doc.metadata.composer}
            </Text>
          )}
        </View>

        {/* 입력 힌트 */}
        {currentPart && currentPart.measures[0]?.elements.length === 0 &&
          (activeTool === "note" || activeTool === "rest") && (
          <Text style={[styles.inputHint, { color: C.textSecondary }]}>
            {t("scoreMode", "inputHint")}
          </Text>
        )}

        {/* 오선보 터치 캔버스 */}
        {currentPart ? (
          <ScoreCanvas
            doc={{ ...doc, parts: [currentPart] }}
            containerWidth={containerWidth}
            selectedElementId={selectedElementId}
            selectedPartIdx={0}
            activeTool={activeTool}
            activeDuration={activeDuration}
            isDotted={isDotted}
            accidental={accidental}
            onNotePlaced={handleNotePlaced}
            onRestPlaced={handleRestPlaced}
            onElementTap={handleElementTap}
            onMeasureTap={handleMeasureTap}
            onEraseElement={handleEraseElement}
            onNoteMoved={handleNoteMoved}
            playheadMeasureIdx={playback.isPlaying ? playback.currentMeasureIdx : undefined}
            playheadFraction={playback.playheadFraction}
            showPlayhead={showPlayhead}
            highlightColor={highlightColor}
          />
        ) : (
          <Text style={{ color: C.textSecondary, marginTop: 24 }}>
            {t("scoreMode", "noPartsHint")}
          </Text>
        )}

        {/* ── 마디 관리 탭 ─────────────────────────────────────── */}
        {currentPart && (
          <View style={[styles.measureTabsRow, { marginTop: 16 }]}>
            {currentPart.measures.map((m, mIdx) => (
              <Pressable
                key={m.id}
                style={({ pressed }) => [
                  styles.measureTab,
                  {
                    borderColor: selectedMeasureIdx === mIdx ? C.accent : C.border,
                    backgroundColor:
                      selectedMeasureIdx === mIdx ? C.accent + "22" : C.surface,
                  },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  setSelectedMeasureIdx(mIdx);
                  setSelectedElementId(null);
                }}
                onLongPress={() => {
                  Alert.alert(
                    t("scoreMode", "deleteMeasure"),
                    undefined,
                    [
                      { text: t("scoreMode", "cancel"), style: "cancel" },
                      {
                        text: t("scoreMode", "deleteMeasure"),
                        style: "destructive",
                        onPress: () => handleDeleteMeasure(mIdx),
                      },
                    ],
                  );
                }}
                testID={`score-editor-measure-${mIdx}`}
              >
                <Text
                  style={[
                    styles.measureTabNum,
                    { color: selectedMeasureIdx === mIdx ? C.accent : C.textSecondary },
                  ]}
                >
                  {mIdx + 1}
                </Text>
                <Text style={[styles.measureTabCount, { color: C.textSecondary }]}>
                  {m.elements.length > 0
                    ? `(${m.elements.length})`
                    : t("scoreMode", "measureEmpty")}
                </Text>
              </Pressable>
            ))}

            {/* 마디 추가 버튼 */}
            <Pressable
              style={[styles.addMeasureBtn, { borderColor: C.border }]}
              onPress={handleAddMeasure}
              testID="score-editor-add-measure"
            >
              <Ionicons name="add" size={16} color={C.textSecondary} />
              <Text style={[styles.addMeasureText, { color: C.textSecondary }]}>
                {t("scoreMode", "addMeasure")}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* ── 확대 뷰 (재생 중 현재 마디) ────────────────────────── */}
      {playback.isPlaying && showZoomView && currentPart && (
        <View style={[styles.zoomViewWrapper, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          <Text style={[styles.zoomViewLabel, { color: C.textSecondary }]}>
            {t("scoreMode", "zoomViewLabel")} — {playback.currentMeasureIdx + 1}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <ScoreRenderer
              doc={{
                ...doc,
                parts: doc.parts.map((p) => ({
                  ...p,
                  measures: [p.measures[playback.currentMeasureIdx]].filter(Boolean) as typeof p.measures,
                })),
              }}
              containerWidth={containerWidth * 1.4}
              playheadMeasureIdx={0}
              playheadFraction={playback.playheadFraction}
              showPlayhead={showPlayhead}
              highlightColor={highlightColor}
              showPartNames={false}
            />
          </ScrollView>
        </View>
      )}

      {/* ── 하단 팔레트 ──────────────────────────────────────────── */}
      <View
        style={[
          styles.paletteWrapper,
          {
            paddingBottom: bottomInset + 4,
            backgroundColor: C.surface,
          },
        ]}
      >
        <ScorePalette
          activeTool={activeTool}
          activeDuration={activeDuration}
          isDotted={isDotted}
          accidental={accidental}
          selectedArticulation={selectedArticulation}
          selectedDynamic={selectedDynamic}
          instrumentCategory={
            currentPart
              ? (INSTRUMENTS[currentPart.instrumentId]?.category ?? undefined)
              : undefined
          }
          enabledSymbols={currentPart?.enabledSymbols ?? {}}
          onToolChange={setActiveTool}
          onDurationChange={setActiveDuration}
          onDottedChange={setIsDotted}
          onAccidentalChange={(acc) => {
            setAccidental(acc);
            if (selectedElementId) handleApplyAccidentalToSelected(acc);
          }}
          onArticulationSelect={(art) => {
            setSelectedArticulation(art);
            if (selectedElementId) handleApplyArticulationToSelected(art);
          }}
          onDynamicSelect={setSelectedDynamic}
          onTempoSelect={handleTempoSelect}
          onSymbolToggle={handleSymbolToggle}
        />
      </View>

      {/* ── 악기 기호 설정 모달 ─────────────────────────────────── */}
      <Modal
        visible={showSymbolSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSymbolSettings(false)}
      >
        <Pressable
          style={[styles.symbolModalBackdrop]}
          onPress={() => setShowSymbolSettings(false)}
        >
          <Pressable
            style={[styles.symbolModalCard, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.symbolModalTitle, { color: C.text }]}>
              {t("scoreMode", "symbolSettingsTitle")}
            </Text>
            <Text style={[styles.symbolModalSub, { color: C.textSecondary }]}>
              {currentPart?.name ?? currentPart?.instrumentId ?? ""}
            </Text>
            {/* 재생 설정 섹션 */}
            <View style={[styles.playbackSection, { borderBottomColor: C.border }]}>
              <Text style={[styles.playbackSectionTitle, { color: C.textSecondary }]}>
                {t("scoreMode", "playbackSettings")}
              </Text>
              <View style={[styles.symbolRow, { borderBottomColor: C.border }]}>
                <Text style={[styles.symbolRowLabel, { color: C.text }]}>
                  {t("scoreMode", "showPlayhead")}
                </Text>
                <Switch
                  value={showPlayhead}
                  onValueChange={(v) => updatePlaybackSettings({ showPlayhead: v })}
                  trackColor={{ false: C.border, true: C.accent }}
                  thumbColor={showPlayhead ? "#fff" : "#ccc"}
                  testID="score-toggle-show-playhead"
                />
              </View>
              <View style={[styles.symbolRow, { borderBottomColor: C.border }]}>
                <Text style={[styles.symbolRowLabel, { color: C.text }]}>
                  {t("scoreMode", "showZoomView")}
                </Text>
                <Switch
                  value={showZoomView}
                  onValueChange={(v) => updatePlaybackSettings({ showZoomView: v })}
                  trackColor={{ false: C.border, true: C.accent }}
                  thumbColor={showZoomView ? "#fff" : "#ccc"}
                  testID="score-toggle-show-zoom-view"
                />
              </View>
            </View>

            <ScrollView style={styles.symbolModalList} showsVerticalScrollIndicator={false}>
              {ALL_INSTR_SYMBOLS.map((sym) => {
                const enabled = (currentPart?.enabledSymbols ?? {})[sym.id] !== false;
                return (
                  <View key={sym.id} style={[styles.symbolRow, { borderBottomColor: C.border }]}>
                    <Text style={[styles.symbolRowSym, { color: C.accent }]}>{sym.symbol}</Text>
                    <Text style={[styles.symbolRowLabel, { color: C.text }]}>
                      {t("scoreMode", sym.labelKey as any) || sym.id}
                    </Text>
                    <Switch
                      value={enabled}
                      onValueChange={(v) => handleSymbolToggle(sym.id, v)}
                      trackColor={{ false: C.border, true: C.accent }}
                      thumbColor={enabled ? "#fff" : "#ccc"}
                      testID={`score-symbol-toggle-${sym.id}`}
                    />
                  </View>
                );
              })}
            </ScrollView>
            <Pressable
              style={[styles.symbolModalClose, { backgroundColor: C.accent }]}
              onPress={() => setShowSymbolSettings(false)}
            >
              <Text style={styles.symbolModalCloseText}>{t("scoreMode", "done")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (C: any, S: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.md,
      paddingBottom: 10,
      borderBottomWidth: 1,
      gap: Spacing.xs ?? 4,
    },
    iconBtn: {
      padding: 4,
    },
    topTitle: {
      flex: 1,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    savedToast: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.small,
    },
    saveBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 7,
      borderRadius: Radius.md,
    },
    saveBtnText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.small,
      color: "#fff",
    },
    partTabsScroll: {
      borderBottomWidth: 1,
      maxHeight: 40,
    },
    partTabsContent: {
      paddingHorizontal: Spacing.md,
    },
    partTab: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
    },
    partTabText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.small,
    },
    selectionBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderBottomWidth: 1,
      gap: 6,
    },
    selectionLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    selBarBtn: {
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 32,
    },
    selBarBtnText: {
      fontSize: 16,
      fontFamily: "serif",
    },
    scoreScroll: {
      flex: 1,
    },
    scoreContent: {
      gap: 0,
    },
    scoreHeader: {
      alignItems: "center",
      paddingVertical: Spacing.md,
      gap: 4,
    },
    scoreTitle: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: FontSize.subtitle,
    },
    scoreMeta: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    inputHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      textAlign: "center",
      marginBottom: 8,
      opacity: 0.7,
    },
    measureTabsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    measureTab: {
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignItems: "center",
      minWidth: 44,
    },
    measureTabNum: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.small,
    },
    measureTabCount: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 10,
    },
    addMeasureBtn: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    addMeasureText: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    // ── 확대 뷰 ──────────────────────────────────────────────────
    zoomViewWrapper: {
      borderTopWidth: 1,
      paddingVertical: 6,
      paddingHorizontal: Spacing.md,
      maxHeight: 180,
    },
    zoomViewLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 10,
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    // ── 재생 설정 섹션 ────────────────────────────────────────────
    playbackSection: {
      borderBottomWidth: 1,
      paddingBottom: 8,
      marginBottom: 8,
    },
    playbackSectionTitle: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.small,
      marginBottom: 6,
      marginTop: 4,
    },
    paletteWrapper: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 4,
    },
    // ── 악기 기호 설정 모달 ─────────────────────────────────────
    symbolModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: Spacing.lg,
    },
    symbolModalCard: {
      width: "100%",
      maxWidth: 400,
      maxHeight: "70%",
      borderRadius: Radius.lg,
      borderWidth: 1,
      padding: Spacing.lg,
    },
    symbolModalTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
      marginBottom: 2,
    },
    symbolModalSub: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      marginBottom: Spacing.md,
    },
    symbolModalList: {
      maxHeight: 320,
      marginBottom: Spacing.md,
    },
    symbolRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    symbolRowSym: {
      width: 36,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
      textAlign: "center",
    },
    symbolRowLabel: {
      flex: 1,
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    symbolModalClose: {
      borderRadius: Radius.md,
      paddingVertical: 10,
      alignItems: "center",
    },
    symbolModalCloseText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.small,
      color: "#fff",
    },
  });

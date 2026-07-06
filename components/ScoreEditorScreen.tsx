// ============================================================
// ScoreEditorScreen — 악보 편집 화면 (2단계 터치 입력 UX)
// ============================================================

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Image,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { useScoreLineSpacing } from "@/lib/score-scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import { saveScore, createEmptyMeasure } from "@/lib/score-storage";
import { stopAllScoreNotes, stopPreviewNote } from "@/lib/score-audio";
import { exportScoreAsJson, exportScoreAsJpg, exportScoreAsPng, shareScoreAsScoreJson, importScoreFromJson, importReferenceImage, extractParts } from "@/lib/score-io";
import { loadPracticeBook, savePracticeBook, createPracticeEntry } from "@/lib/storage";
import type {
  ScoreDocument,
  ScoreMetadata,
  ScoreNote,
  ScoreRest,
  NoteDuration,
  Pitch,
  Accidental,
  ArticulationType,
  Dynamic,
  ClefType,
} from "@/lib/score-types";
import { INSTRUMENTS } from "@/lib/score-types";
import { ScoreCanvas } from "@/components/ScoreCanvas";
import type { EditorTool } from "@/components/ScoreCanvas";
import { ScoreRenderer } from "@/components/ScoreRenderer";
import { ScorePalette } from "@/components/ScorePalette";
import type { RepeatSignId, CrescType } from "@/components/ScorePalette";
import { useScorePlayback } from "@/hooks/useScorePlayback";
import { makeStyles } from "@/components/ScoreEditorScreen.styles";
import { confirmDestructive } from "@/lib/confirm";
import { deleteMeasureFromDoc } from "@/lib/score-measure-actions";
import {
  ScoreMoreMenuModal,
  ScoreExtractPartModal,
  ScoreSymbolSettingsModal,
  ScoreMeasureContextMenu,
  ScoreMetaModal,
  ScoreMeasureEditModal,
} from "@/components/ScoreEditorModals";
import { HintBanner } from "@/components/HintTooltip";

// ── 헬퍼 ──────────────────────────────────────────────────────

const MAX_HISTORY = 50;

function makeNote(
  pitch: Pitch,
  duration: NoteDuration,
  accidental?: Accidental | null,
  articulations?: ArticulationType[],
  dynamic?: Dynamic,
  ornament?: import("@/lib/score-types").OrnamentType | null,
  placedX?: number,
  doubleDotted?: boolean,
): ScoreNote {
  const finalPitch: Pitch = accidental
    ? { ...pitch, accidental }
    : pitch;
  return {
    id: Crypto.randomUUID(),
    type: "note",
    pitch: finalPitch,
    duration,
    doubleDotted: doubleDotted || undefined,
    articulations: articulations?.length ? articulations : undefined,
    dynamic: dynamic ?? undefined,
    ornament: ornament ?? undefined,
    placedX,
  };
}

function makeRest(duration: NoteDuration, placedX?: number): ScoreRest {
  return {
    id: Crypto.randomUUID(),
    type: "rest",
    duration,
    placedX,
  };
}

// ── Props ─────────────────────────────────────────────────────

export interface ScoreEditorScreenProps {
  doc: ScoreDocument;
  onBack: () => void;
  onSaved: (doc: ScoreDocument) => void;
  onLinkedEntryChange?: (entryId: string | undefined, scoreDefaults: { bpm: number; beatsPerMeasure: number }) => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function ScoreEditorScreen({ doc: initialDoc, onBack, onSaved, onLinkedEntryChange }: ScoreEditorScreenProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const { width: windowWidth } = useWindowDimensions();
  const lineSpacing = useScoreLineSpacing();
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
  const [isDoubleDotted, setIsDoubleDotted] = useState(false);
  const [selectedInstrumentSymbol, setSelectedInstrumentSymbol] = useState<string | null>(null);
  const [selectedSlur, setSelectedSlur] = useState(false);
  const [slurPendingStartId, setSlurPendingStartId] = useState<string | null>(null);
  const [accidental, setAccidental] = useState<Accidental | null>(null);
  const [selectedArticulation, setSelectedArticulation] = useState<ArticulationType | null>(null);
  const [selectedDynamic, setSelectedDynamic] = useState<Dynamic | null>(null);
  const [selectedRepeatSign, setSelectedRepeatSign] = useState<RepeatSignId | null>(null);
  const [selectedCrescType, setSelectedCrescType] = useState<CrescType>(null);

  // ── 마디 컨텍스트 메뉴 state ──────────────────────────────────
  const [measureContextMenu, setMeasureContextMenu] = useState<{
    measureIdx: number;
    visible: boolean;
  } | null>(null);

  // ── 마디 인라인 편집 모달 (크로스 플랫폼) ────────────────────
  const [showMeasureEditModal, setShowMeasureEditModal] = useState(false);
  const [measureEditTarget, setMeasureEditTarget] = useState<{
    measureIdx: number;
    field: "bpm" | "timeSig" | "linkedEntry";
    value: string;
    label: string;
    hint: string;
  } | null>(null);

  // ── 악보 메타데이터 편집 모달 ─────────────────────────────────
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [metaDraft, setMetaDraft] = useState<{
    title: string;
    subtitle: string;
    composer: string;
    arranger: string;
    lyricist: string;
    copyright: string;
    difficulty: ScoreMetadata["difficulty"];
    memo: string;
  } | null>(null);

  // ── 선택 상태 ─────────────────────────────────────────────────
  const [selectedPartIdx, setSelectedPartIdx] = useState(0);
  const [selectedMeasureIdx, setSelectedMeasureIdx] = useState<number | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // ── 꾸밈음 선택 ──────────────────────────────────────────────
  const [selectedOrnament, setSelectedOrnament] = useState<import("@/lib/score-types").OrnamentType | null>(null);

  // ── 마디 설정 드로어 ──────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── 재생 연동 ─────────────────────────────────────────────────
  const playback = useScorePlayback(doc);
  const scoreScrollRef = useRef<ScrollView>(null);

  // 진행 바 애니메이션 (0→1 fraction, 150ms ease)
  const progressAnimRef = useRef(new Animated.Value(0));
  useEffect(() => {
    const fraction = playback.prepareProgress
      ? playback.prepareProgress.done / playback.prepareProgress.total
      : 0;
    Animated.timing(progressAnimRef.current, {
      toValue: fraction,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [playback.prepareProgress]);
  useEffect(() => {
    if (!playback.isPreparing) {
      progressAnimRef.current.setValue(0);
    }
  }, [playback.isPreparing]);
  // 마디 연결 프리셋 전환 콜백 (연결 없는 마디는 악보 기본 BPM/박자 전달)
  useEffect(() => {
    if (onLinkedEntryChange) {
      onLinkedEntryChange(
        playback.currentLinkedEntryId,
        { bpm: doc.bpm, beatsPerMeasure: doc.timeSignature.numerator },
      );
    }
  }, [playback.currentLinkedEntryId, onLinkedEntryChange, doc.bpm, doc.timeSignature.numerator]);
  // 에디터 언마운트 시 미리 듣기 사운드를 즉시 중지
  useEffect(() => {
    return () => { stopPreviewNote(); };
  }, []);
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
  const muteAudio = doc.playbackSettings?.muteAudio === true;
  const notePreviewEnabled = doc.playbackSettings?.notePreview !== false;

  function updatePlaybackSettings(patch: { showPlayhead?: boolean; showZoomView?: boolean; muteAudio?: boolean; notePreview?: boolean }) {
    applyDoc({
      ...doc,
      playbackSettings: { ...doc.playbackSettings, ...patch },
    });
  }

  // 하이라이트 색상
  const highlightColor = C.accent + "28"; // ~16% opacity

  // ── 악기 기호 설정 모달 ──────────────────────────────────────
  const [showSymbolSettings, setShowSymbolSettings] = useState(false);

  // ── ⋯ 메뉴 ──────────────────────────────────────────────────
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // ── 공유 단축 모달 ────────────────────────────────────────────
  const [showShareModal, setShowShareModal] = useState(false);

  // ── 성부 분리 모달 ─────────────────────────────────────────────
  const [showExtractPartModal, setShowExtractPartModal] = useState(false);
  const [extractPartIndices, setExtractPartIndices] = useState<number[]>([]);

  // ── JPG 내보내기 전용 캡처 뷰 ref ───────────────────────────
  const exportViewRef = useRef<View>(null);

  // ── 저장 ──────────────────────────────────────────────────────
  const [savedToast, setSavedToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── IO 핸들러 ─────────────────────────────────────────────────

  async function handleExportJpg() {
    setShowMoreMenu(false);
    const ok = await exportScoreAsJpg(exportViewRef as React.RefObject<unknown>, doc);
    if (!ok) Alert.alert(t("scoreMode", "exportJpg"), t("scoreMode", "exportJpgFail"));
  }

  async function handleExportPng() {
    setShowMoreMenu(false);
    const ok = await exportScoreAsPng(exportViewRef as React.RefObject<unknown>, doc);
    if (!ok) Alert.alert(t("scoreMode", "exportPng"), t("scoreMode", "exportJpgFail"));
  }

  async function handleExportJson() {
    setShowMoreMenu(false);
    await exportScoreAsJson(doc);
  }

  async function handleShareScore() {
    setShowMoreMenu(false);
    await shareScoreAsScoreJson(doc);
  }

  async function handleImportReferenceImageAction() {
    setShowMoreMenu(false);
    const result = await importReferenceImage();
    if (!result) return;
    applyDoc({ ...doc, referenceImageUri: result.uri, referenceImageOpacity: 0.4 });
  }

  function handleClearReferenceImage() {
    setShowMoreMenu(false);
    const { referenceImageUri: _a, referenceImageOpacity: _b, ...rest } = doc;
    applyDoc(rest as ScoreDocument);
  }

  function handleReferenceOpacityToggle() {
    const current = doc.referenceImageOpacity ?? 0.4;
    const next = current <= 0.25 ? 0.4 : current <= 0.55 ? 0.7 : 0.2;
    applyDoc({ ...doc, referenceImageOpacity: next });
  }

  async function handleAddToPractice() {
    setShowMoreMenu(false);
    try {
      await saveScore(doc);
      onSaved(doc);
      const book = await loadPracticeBook();
      const bpm_ = doc.bpm;
      const beats = doc.timeSignature.numerator;
      const entry = createPracticeEntry(
        doc.metadata.title || t("scoreMode", "untitled"),
        {
          mode: "beat",
          bpm: bpm_,
          beatsPerMeasure: beats,
          beatTypes: (["accent", ...Array(Math.max(0, beats - 1)).fill("normal")] as any),
          beatSubdivisions: {},
          barRepeats: {},
          barLoopMode: "loop",
          subdivisionPattern: ["accent"],
          scoreId: doc.id,
        },
      );
      book.unshift(entry);
      await savePracticeBook(book);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setSavedToast(true);
      toastTimerRef.current = setTimeout(() => setSavedToast(false), 1800);
    } catch {}
  }

  async function handleImportJson() {
    setShowMoreMenu(false);
    const result = await importScoreFromJson();
    if (result.success && result.doc) {
      // 가져온 악보를 에디터에 바로 열기 (이력 초기화)
      applyDoc(result.doc, false);
      historyRef.current = [result.doc];
      histIdxRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
      onSaved(result.doc);
    } else if (result.errorCode && result.errorCode !== "cancelled") {
      Alert.alert(t("scoreMode", "importJson"), t("scoreMode", "importFail"));
    }
  }

  async function handleExtractPartOpen() {
    setShowMoreMenu(false);
    if (doc.parts.length <= 1) {
      const newDoc = await extractParts(doc, [0]);
      if (newDoc) onBack();
      return;
    }
    setExtractPartIndices([]);
    setShowExtractPartModal(true);
  }

  async function handleExtractConfirm() {
    setShowExtractPartModal(false);
    if (extractPartIndices.length === 0) return;
    const newDoc = await extractParts(doc, extractPartIndices);
    if (newDoc) onBack();
  }

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
    const newDoc = deleteMeasureFromDoc(doc, selectedPartIdx, mIdx);
    if (newDoc === doc) return;
    applyDoc(newDoc);
    if (selectedMeasureIdx === mIdx) setSelectedMeasureIdx(null);
  }

  // ── 마디 컨텍스트 메뉴: 마디 추가 ───────────────────────────
  function handleMeasureAddFromContext(_mIdx: number) {
    setMeasureContextMenu(null);
    handleAddMeasure();
  }

  // ── 마디 컨텍스트 메뉴: 연결 항목 편집 ───────────────────────
  function handleMeasureEditLink(mIdx: number) {
    setMeasureContextMenu(null);
    const curMeasure = doc.parts[selectedPartIdx]?.measures[mIdx];
    setMeasureEditTarget({
      measureIdx: mIdx,
      field: "linkedEntry",
      value: curMeasure?.linkedPracticeEntryId ?? "",
      label: t("scoreMode", "drawerLinkEntry"),
      hint: "entry ID",
    });
    setShowMeasureEditModal(true);
  }

  // ── 마디 컨텍스트 메뉴: 연결 해제 ─────────────────────────────
  function handleMeasureClearLink(mIdx: number) {
    setMeasureContextMenu(null);
    applyDoc({
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((mes, mi) =>
            mi === mIdx ? { ...mes, linkedPracticeEntryId: undefined } : mes,
          ),
        };
      }),
    });
  }

  // ── 마디 컨텍스트 메뉴: 마디 삭제 (확인 후 삭제) ─────────────
  function handleMeasureDeleteFromContext(mIdx: number) {
    setMeasureContextMenu(null);
    confirmDestructive(t("scoreMode", "deleteMeasureConfirm"), {
      title: t("scoreMode", "deleteMeasure"),
      confirmText: t("scoreMode", "delete"),
      cancelText: t("scoreMode", "cancel"),
      onConfirm: () => handleDeleteMeasure(mIdx),
    });
  }

  // ── 음표 추가 (터치 확정) ─────────────────────────────────────
  const handleNotePlaced = useCallback(
    (measureIdx: number, pitch: Pitch, duration: NoteDuration, insertIdx: number, placedX: number) => {
      let newElement = makeNote(
        pitch,
        duration,
        accidental,
        selectedArticulation ? [selectedArticulation] : [],
        selectedDynamic ?? undefined,
        selectedOrnament ?? undefined,
        placedX,
        isDoubleDotted,
      );
      // sticky 악기 기호를 새로 놓인 음표에 자동 적용
      const instrSym = _selectedInstrumentSymbolRef.current;
      if (instrSym) {
        const patch: Partial<ScoreNote> = {};
        if (instrSym === "bowUp")          patch.bowUp = true;
        else if (instrSym === "bowDown")   patch.bowDown = true;
        else if (instrSym === "harmonic")  patch.harmonic = true;
        else if (instrSym === "pizzicato") patch.pizzicato = true;
        else if (instrSym === "arco")      patch.arco = true;
        else if (instrSym === "pedal")     patch.pedal = true;
        else if (instrSym === "pedalEnd")  patch.pedalEnd = true;
        else if (instrSym === "ottava1")   patch.ottava = 1;
        else if (instrSym === "arpeggio")  patch.arpeggio = true;
        newElement = { ...newElement, ...patch };
      }

      const newDoc: ScoreDocument = {
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          const newMeasures = p.measures.map((m, mi) => {
            if (mi !== measureIdx) return m;
            const next = [...m.elements];
            next.splice(insertIdx, 0, newElement);
            return { ...m, elements: next };
          });
          return { ...p, measures: newMeasures };
        }),
      };
      applyDoc(newDoc);
      setSelectedElementId(newElement.id);
      setSelectedMeasureIdx(measureIdx);
    },
    [doc, selectedPartIdx, accidental, selectedArticulation, selectedDynamic, selectedOrnament, isDoubleDotted],
  );

  // ── 쉼표 추가 ─────────────────────────────────────────────────
  const handleRestPlaced = useCallback(
    (measureIdx: number, duration: NoteDuration, insertIdx: number, placedX: number) => {
      const newElement = makeRest(duration, placedX);

      const newDoc: ScoreDocument = {
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          const newMeasures = p.measures.map((m, mi) => {
            if (mi !== measureIdx) return m;
            const next = [...m.elements];
            next.splice(insertIdx, 0, newElement);
            return { ...m, elements: next };
          });
          return { ...p, measures: newMeasures };
        }),
      };
      applyDoc(newDoc);
      setSelectedElementId(newElement.id);
      setSelectedMeasureIdx(measureIdx);
    },
    [doc, selectedPartIdx],
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

  // ── 지우개 드래그 범위 일괄 삭제 ─────────────────────────────
  const handleEraseMultiple = useCallback(
    (elements: Array<{elementId: string; measureIdx: number}>) => {
      const byMeasure = new Map<number, Set<string>>();
      for (const { elementId, measureIdx } of elements) {
        if (!byMeasure.has(measureIdx)) byMeasure.set(measureIdx, new Set());
        byMeasure.get(measureIdx)!.add(elementId);
      }
      const newDoc: ScoreDocument = {
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((m, mi) => {
              const toDelete = byMeasure.get(mi);
              if (!toDelete) return m;
              return { ...m, elements: m.elements.filter((el) => !toDelete.has(el.id)) };
            }),
          };
        }),
      };
      applyDoc(newDoc);
      const deletedIds = new Set(elements.map((e) => e.elementId));
      if (selectedElementId && deletedIds.has(selectedElementId)) setSelectedElementId(null);
    },
    [doc, selectedPartIdx, selectedElementId],
  );

  // ── 음표 탭 선택 ──────────────────────────────────────────────
  // refs for sticky-removal in handleElementTap (no dep, always current)
  const _docRef = useRef(doc);
  _docRef.current = doc;
  const _selectedPartIdxRef = useRef(selectedPartIdx);
  _selectedPartIdxRef.current = selectedPartIdx;
  const _selectedArticulationRef = useRef(selectedArticulation);
  _selectedArticulationRef.current = selectedArticulation;
  const _selectedOrnamentRef = useRef(selectedOrnament);
  _selectedOrnamentRef.current = selectedOrnament;
  const _selectedDynamicRef = useRef(selectedDynamic);
  _selectedDynamicRef.current = selectedDynamic;
  const _selectedInstrumentSymbolRef = useRef<string | null>(null);
  _selectedInstrumentSymbolRef.current = selectedInstrumentSymbol;
  const _selectedSlurRef = useRef(false);
  _selectedSlurRef.current = selectedSlur;
  const _slurPendingStartIdRef = useRef<string | null>(null);
  _slurPendingStartIdRef.current = slurPendingStartId;
  const _selectedCrescTypeRef = useRef<CrescType>(null);
  _selectedCrescTypeRef.current = selectedCrescType;
  const _applyDocRef = useRef(applyDoc);
  _applyDocRef.current = applyDoc;

  const handleElementTap = useCallback(
    (elementId: string, measureIdx: number) => {
      setSelectedElementId((prev) => (prev === elementId ? null : elementId));
      setSelectedMeasureIdx(measureIdx);

      const curDoc = _docRef.current;
      const curPartIdx = _selectedPartIdxRef.current;
      const applyFn = _applyDocRef.current;

      // ── 슬러 두 번 탭 흐름 ──────────────────────────────────
      if (_selectedSlurRef.current) {
        const pending = _slurPendingStartIdRef.current;
        if (pending === null) {
          // 첫 번째 탭: slurStart 표시
          applyFn({
            ...curDoc,
            parts: curDoc.parts.map((p, pIdx) => {
              if (pIdx !== curPartIdx) return p;
              return {
                ...p,
                measures: p.measures.map((m, mIdx) => {
                  if (mIdx !== measureIdx) return m;
                  return { ...m, elements: m.elements.map((el) => {
                    if (el.id !== elementId || el.type !== "note") return el;
                    return { ...el, slurStart: !el.slurStart, slurEnd: undefined, slurEndNoteId: undefined };
                  })};
                }),
              };
            }),
          });
          setSlurPendingStartId(elementId);
        } else {
          // 두 번째 탭: slurEnd 표시 + 슬러 시작 노트에 slurEndNoteId 저장 + 슬러 모드 종료
          applyFn({
            ...curDoc,
            parts: curDoc.parts.map((p, pIdx) => {
              if (pIdx !== curPartIdx) return p;
              return {
                ...p,
                measures: p.measures.map((m, mIdx) => {
                  return {
                    ...m,
                    elements: m.elements.map((el) => {
                      if (el.type !== "note") return el;
                      // 종료 노트: slurEnd 설정
                      if (el.id === elementId) return { ...el, slurEnd: true };
                      // 시작 노트: slurEndNoteId 기록 (어느 마디에 있든 탐색)
                      if (el.id === pending) return { ...el, slurEndNoteId: elementId };
                      return el;
                    }),
                  };
                }),
              };
            }),
          });
          setSlurPendingStartId(null);
          setSelectedSlur(false);
        }
        return;
      }

      // ── 크레셴도/데크레셴도 노트 앵커 탭 ────────────────────
      const crescType = _selectedCrescTypeRef.current;
      if (crescType) {
        const isCrescent = crescType === "cresc";
        // i <= measureIdx: 같은 마디 내 start→end도 허용
        const hasStart = curDoc.parts[curPartIdx]?.measures.some(
          (m, i) => i <= measureIdx && (isCrescent ? m.crescStart : m.decrescStart),
        );
        applyFn({
          ...curDoc,
          parts: curDoc.parts.map((p, pIdx) => {
            if (pIdx !== curPartIdx) return p;
            return {
              ...p,
              measures: p.measures.map((m, mIdx) => {
                if (mIdx !== measureIdx) return m;
                if (isCrescent) {
                  if (hasStart) return { ...m, crescEnd: true, crescNoteEndId: elementId };
                  return { ...m, crescStart: true, crescNoteStartId: elementId, decrescStart: undefined };
                } else {
                  if (hasStart) return { ...m, decrescEnd: true, decrescNoteEndId: elementId };
                  return { ...m, decrescStart: true, decrescNoteStartId: elementId, crescStart: undefined };
                }
              }),
            };
          }),
        });
        if (hasStart) setSelectedCrescType(null);
        return;
      }

      // ── 활성 sticky 기호가 있으면 탭한 노트에 즉시 적용/해제 ─
      const art = _selectedArticulationRef.current;
      const orn = _selectedOrnamentRef.current;
      const dyn = _selectedDynamicRef.current;
      const instrSym = _selectedInstrumentSymbolRef.current;
      if (!art && !orn && !dyn && !instrSym) {
        // #317: 팔레트에 선택된 기호 없이 노트를 탭하면
        // 해당 노트의 현재 꾸밈음·아티큘레이션을 팔레트에 반영해
        // 사용자가 즉시 수정하거나 제거할 수 있도록 한다
        const part = curDoc.parts[curPartIdx];
        if (part) {
          for (const m of part.measures) {
            const el = m.elements.find((e) => e.id === elementId);
            if (el?.type === "note") {
              setSelectedOrnament(el.ornament ?? null);
              setSelectedArticulation(el.articulations?.[0] ?? null);
              break;
            }
          }
        }
        return;
      }
      const newDoc: ScoreDocument = {
        ...curDoc,
        parts: curDoc.parts.map((p, pIdx) => {
          if (pIdx !== curPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((m, mIdx) => {
              if (mIdx !== measureIdx) return m;
              return {
                ...m,
                elements: m.elements.map((el) => {
                  if (el.id !== elementId || el.type !== "note") return el;
                  let updated: typeof el = { ...el };
                  if (art) {
                    const existing = updated.articulations ?? [];
                    const hasArt = existing.includes(art);
                    const next = hasArt ? existing.filter((a) => a !== art) : [...existing, art];
                    updated = { ...updated, articulations: next.length ? next : undefined };
                  }
                  if (orn) {
                    updated = { ...updated, ornament: updated.ornament === orn ? undefined : orn };
                  }
                  // dynamic은 노트 레벨로 적용/해제 (note.dynamic)
                  if (dyn) {
                    updated = { ...updated, dynamic: updated.dynamic === dyn ? undefined : dyn };
                  }
                  // 악기 특수 기호 토글 (note 레벨)
                  if (instrSym) {
                    if (instrSym === "bowUp")     updated = { ...updated, bowUp:     updated.bowUp     ? undefined : true };
                    else if (instrSym === "bowDown")   updated = { ...updated, bowDown:   updated.bowDown   ? undefined : true };
                    else if (instrSym === "harmonic")  updated = { ...updated, harmonic:  updated.harmonic  ? undefined : true };
                    else if (instrSym === "pizzicato") updated = { ...updated, pizzicato: updated.pizzicato ? undefined : true };
                    else if (instrSym === "arco")      updated = { ...updated, arco:      updated.arco      ? undefined : true };
                    else if (instrSym === "pedal")     updated = { ...updated, pedal:     updated.pedal     ? undefined : true };
                    else if (instrSym === "pedalEnd")  updated = { ...updated, pedalEnd:  updated.pedalEnd  ? undefined : true };
                    else if (instrSym === "ottava1")   updated = { ...updated, ottava:    updated.ottava === 1 ? undefined : 1 };
                    else if (instrSym === "arpeggio")  updated = { ...updated, arpeggio:  updated.arpeggio  ? undefined : true };
                  }
                  return updated;
                }),
              };
            }),
          };
        }),
      };
      applyFn(newDoc);
    },
    [],
  );

  // ── 마디에 반복/이동 부호 적용 ────────────────────────────────
  const handleRepeatSignApply = useCallback((measureIdx: number, signId: RepeatSignId) => {
    const patch: Partial<import("@/lib/score-types").ScoreMeasure> = {};
    switch (signId) {
      case "repeat_start":
        patch.repeatStart = true; break;
      case "repeat_end":
        patch.repeatEnd = true; break;
      case "repeat_both":
        patch.repeatStart = true; patch.repeatEnd = true; break;
      case "segno":
        patch.segno = true; break;
      case "coda":
        patch.coda = true; break;
      case "da_capo":
        patch.jumpText = "D.C."; patch.jumpTo = "start"; break;
      case "dal_segno":
        patch.jumpText = "D.S."; patch.jumpTo = "segno"; break;
      case "dal_segno_coda":
        patch.jumpText = "D.S.𝄌"; patch.jumpTo = "coda"; break;
      case "da_capo_coda":
        patch.jumpText = "D.C.𝄌"; patch.jumpTo = "start"; break;
      case "fine":
        patch.jumpText = "Fine"; patch.jumpTo = "fine"; break;
      case "volta1":
        patch.voltaBracket = 1; break;
      case "volta2":
        patch.voltaBracket = 2; break;
    }
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mIdx) => {
            if (mIdx !== measureIdx) return m;
            return { ...m, ...patch };
          }),
        };
      }),
    };
    applyDoc(newDoc);
    setSelectedRepeatSign(null); // 적용 후 선택 해제
  }, [doc, selectedPartIdx, applyDoc]);

  // ── 마디 탭 ──────────────────────────────────────────────────
  const handleMeasureTap = useCallback((measureIdx: number) => {
    // 1) 반복부호 선택 중 → 부호 적용
    if (selectedRepeatSign) {
      handleRepeatSignApply(measureIdx, selectedRepeatSign);
      return;
    }
    // 2) 강약 기호 선택 중 → 마디에 dynamic 적용
    if (selectedDynamic) {
      const newDoc: ScoreDocument = {
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((m, mIdx) =>
              mIdx !== measureIdx ? m : { ...m, dynamic: selectedDynamic },
            ),
          };
        }),
      };
      applyDoc(newDoc);
      return;
    }
    // 3) cresc/decresc 선택 중 → 마디에 크레셴도 헤어핀 적용
    if (selectedCrescType) {
      const curMeasure = doc.parts[selectedPartIdx]?.measures[measureIdx];
      const isCrescent = selectedCrescType === "cresc";

      // crescStart/decrescStart 이미 설정된 마디가 있으면 현재 탭 마디를 End로 설정
      const hasStart = doc.parts[selectedPartIdx]?.measures.some(
        (m, i) => i < measureIdx && (isCrescent ? m.crescStart : m.decrescStart),
      );
      const newDoc: ScoreDocument = {
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((m, mIdx) => {
              if (mIdx !== measureIdx) return m;
              if (isCrescent) {
                if (hasStart) return { ...m, crescEnd: true };
                return { ...m, crescStart: true, decrescStart: undefined };
              } else {
                if (hasStart) return { ...m, decrescEnd: true };
                return { ...m, decrescStart: true, crescStart: undefined };
              }
            }),
          };
        }),
      };
      applyDoc(newDoc);
      // crescEnd 설정 후 선택 해제
      if (hasStart) setSelectedCrescType(null);
      return;
    }
    // 4) 기본 동작: 마디 선택
    setSelectedMeasureIdx(measureIdx);
    setSelectedElementId(null);
  }, [selectedRepeatSign, selectedDynamic, selectedCrescType, selectedPartIdx, doc, handleRepeatSignApply, applyDoc]);

  // ── 마디 롱프레스 → 컨텍스트 메뉴 ───────────────────────────
  const handleMeasureLongPress = useCallback((measureIdx: number) => {
    setMeasureContextMenu({ measureIdx, visible: true });
  }, []);

  // ── 마디 컨텍스트 메뉴: BPM 변경 (크로스 플랫폼 모달) ───────
  function handleMeasureBpmChange(measureIdx: number) {
    setMeasureContextMenu(null);
    const curMeasure = doc.parts[selectedPartIdx]?.measures[measureIdx];
    const curBpm = curMeasure?.bpm ?? doc.bpm;
    setMeasureEditTarget({
      measureIdx,
      field: "bpm",
      value: String(curBpm),
      label: t("scoreMode", "measureBpmChange"),
      hint: "20–300",
    });
    setShowMeasureEditModal(true);
  }

  // ── 마디 컨텍스트 메뉴: 박자표 변경 ─────────────────────────
  function handleMeasureTimeSigChange(measureIdx: number) {
    setMeasureContextMenu(null);
    const curMeasure = doc.parts[selectedPartIdx]?.measures[measureIdx];
    const curSig = curMeasure?.timeSignature ?? doc.timeSignature;
    setMeasureEditTarget({
      measureIdx,
      field: "timeSig",
      value: `${curSig.numerator}/${curSig.denominator}`,
      label: t("scoreMode", "measureTimeSigChange"),
      hint: "e.g. 3/4  6/8  5/4",
    });
    setShowMeasureEditModal(true);
  }

  // ── 마디 인라인 편집 저장 ─────────────────────────────────────
  function handleMeasureEditSave() {
    if (!measureEditTarget) { setShowMeasureEditModal(false); return; }
    const { measureIdx, field, value } = measureEditTarget;
    if (field === "bpm") {
      const n = parseInt(value.trim(), 10);
      if (n >= 20 && n <= 300) {
        const newDoc: ScoreDocument = {
          ...doc,
          parts: doc.parts.map((p, pIdx) => {
            if (pIdx !== selectedPartIdx) return p;
            return { ...p, measures: p.measures.map((m, mIdx) => mIdx !== measureIdx ? m : { ...m, bpm: n }) };
          }),
        };
        applyDoc(newDoc);
      }
    } else if (field === "timeSig") {
      const parts = value.trim().split("/");
      const num = parseInt(parts[0] ?? "", 10);
      const den = parseInt(parts[1] ?? "", 10);
      if (num > 0 && den > 0) {
        const newDoc: ScoreDocument = {
          ...doc,
          parts: doc.parts.map((p, pIdx) => {
            if (pIdx !== selectedPartIdx) return p;
            return {
              ...p,
              measures: p.measures.map((m, mIdx) =>
                mIdx !== measureIdx ? m : { ...m, timeSignature: { numerator: num, denominator: den } },
              ),
            };
          }),
        };
        applyDoc(newDoc);
      }
    } else if (field === "linkedEntry") {
      const newDoc: ScoreDocument = {
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((m, mIdx) =>
              mIdx === measureIdx
                ? { ...m, linkedPracticeEntryId: value.trim() || undefined }
                : m,
            ),
          };
        }),
      };
      applyDoc(newDoc);
    }
    setShowMeasureEditModal(false);
    setMeasureEditTarget(null);
  }

  // ── 마디 컨텍스트 메뉴: 마디 부호 지우기 ────────────────────
  function handleClearMeasureSigns(measureIdx: number) {
    setMeasureContextMenu(null);
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mIdx) => {
            if (mIdx !== measureIdx) return m;
            const { repeatStart, repeatEnd, segno, coda, jumpText, jumpTo, voltaBracket, voltaBracketEnd, dynamic, crescStart, decrescStart, rehearsalMark, ...rest } = m;
            return rest as typeof m;
          }),
        };
      }),
    };
    applyDoc(newDoc);
  }

  // ── 리허설 마크 추가 ──────────────────────────────────────────
  function handleAddRehearsalMark(measureIdx: number) {
    setMeasureContextMenu(null);
    const curMark = doc.parts[selectedPartIdx]?.measures[measureIdx]?.rehearsalMark ?? "";
    if (Alert.prompt) {
      Alert.prompt(
        t("scoreMode", "measureAddRehearsal"),
        t("scoreMode", "rehearsalMarkLabel"),
        (val) => {
          if (val === null) return;
          const newDoc: ScoreDocument = {
            ...doc,
            parts: doc.parts.map((p, pIdx) => {
              if (pIdx !== selectedPartIdx) return p;
              return {
                ...p,
                measures: p.measures.map((m, mIdx) =>
                  mIdx !== measureIdx ? m : { ...m, rehearsalMark: val.trim() || undefined },
                ),
              };
            }),
          };
          applyDoc(newDoc);
        },
        "plain-text",
        curMark,
      );
    }
  }

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

  // ── 선택된 음표에 타이 토글 ───────────────────────────────────
  function handleToggleTieOnSelected() {
    if (!selectedElementId) return;
    const part = doc.parts[selectedPartIdx];
    if (!part) return;

    // 선택된 음표의 마디/인덱스 탐색
    let selMeasureIdx = -1;
    let selElemIdx = -1;
    for (let mi = 0; mi < part.measures.length; mi++) {
      const idx = part.measures[mi].elements.findIndex((e) => e.id === selectedElementId);
      if (idx >= 0) { selMeasureIdx = mi; selElemIdx = idx; break; }
    }
    if (selMeasureIdx < 0) return;
    const selNote = part.measures[selMeasureIdx].elements[selElemIdx];
    if (!selNote || selNote.type !== "note") return;

    const newTie = !selNote.tieStart;

    // 다음 음표(같은 마디 또는 다음 마디 첫 번째) 탐색
    let nextMeasureIdx = selMeasureIdx;
    let nextElemIdx = selElemIdx + 1;
    if (nextElemIdx >= part.measures[selMeasureIdx].elements.length) {
      nextMeasureIdx = selMeasureIdx + 1;
      nextElemIdx = 0;
    }

    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mi) => ({
            ...m,
            elements: m.elements.map((el, ei) => {
              if (mi === selMeasureIdx && ei === selElemIdx && el.type === "note") {
                return { ...el, tieStart: newTie };
              }
              if (mi === nextMeasureIdx && ei === nextElemIdx && el.type === "note") {
                return { ...el, tieEnd: newTie };
              }
              return el;
            }),
          })),
        };
      }),
    };
    applyDoc(newDoc);
  }

  // 선택된 음표의 tieStart 상태 (팔레트 버튼 활성화용)
  const selectedTieActive = useMemo(() => {
    if (!selectedElementId) return false;
    for (const p of doc.parts) {
      for (const m of p.measures) {
        const el = m.elements.find((e) => e.id === selectedElementId);
        if (el?.type === "note") return !!el.tieStart;
      }
    }
    return false;
  }, [selectedElementId, doc]);

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

  // ── 꾸밈음 선택 노트에 적용/해제 ─────────────────────────────
  function handleApplyOrnamentToSelected(orn: import("@/lib/score-types").OrnamentType | null) {
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
              const nextOrnament = el.ornament === orn ? undefined : (orn ?? undefined);
              return { ...el, ornament: nextOrnament };
            }),
          })),
        };
      }),
    };
    applyDoc(newDoc);
  }

  // ── 악보 메타데이터 저장 ──────────────────────────────────────
  function handleMetaSave() {
    if (!metaDraft) return;
    const newDoc: ScoreDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        title: metaDraft.title.trim() || doc.metadata.title,
        subtitle: metaDraft.subtitle.trim() || undefined,
        composer: metaDraft.composer.trim() || undefined,
        arranger: metaDraft.arranger.trim() || undefined,
        lyricist: metaDraft.lyricist.trim() || undefined,
        copyright: metaDraft.copyright.trim() || undefined,
        difficulty: metaDraft.difficulty,
        memo: metaDraft.memo.trim() || undefined,
        updatedAt: Date.now(),
      },
    };
    applyDoc(newDoc);
    setShowMetaModal(false);
    setMetaDraft(null);
  }

  // ── cresc/decresc 마디에 적용 ──────────────────────────────
  function handleCrescApplyToMeasure(measureIdx: number) {
    if (!selectedCrescType) return;
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mIdx) => {
            if (mIdx !== measureIdx) return m;
            if (selectedCrescType === "cresc") return { ...m, crescStart: true, decrescStart: undefined };
            return { ...m, decrescStart: true, crescStart: undefined };
          }),
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
      <HintBanner
        hintKey="score_editor_intro"
        message={t("scoreMode", "hintInputNote")}
        icon="musical-notes-outline"
      />
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
        <View style={styles.playBtnWrapper}>
          <Pressable
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && !playback.isPreparing && { opacity: 0.6 },
              playback.isPreparing && { opacity: 0.5 },
            ]}
            onPress={playback.isPlaying ? playback.pause : playback.play}
            disabled={playback.isPreparing}
            hitSlop={8}
            testID="score-editor-play"
          >
            {playback.isPreparing ? (
              <ActivityIndicator size="small" color={C.text} />
            ) : (
              <Ionicons
                name={playback.isPlaying ? "pause" : "play"}
                size={S.ms(20, 0.4)}
                color={playback.isPlaying ? C.accent : C.text}
              />
            )}
          </Pressable>
          {playback.isPreparing && (
            <View style={styles.prepareBarTrack}>
              <Animated.View
                style={[
                  styles.prepareBarFill,
                  {
                    backgroundColor: C.accent,
                    width: progressAnimRef.current.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 32],
                    }),
                  },
                ]}
              />
            </View>
          )}
        </View>

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

        {/* 소리 끄기/켜기 버튼 */}
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            muteAudio && { backgroundColor: C.accent + "22" },
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => {
            const next = !muteAudio;
            updatePlaybackSettings({ muteAudio: next });
            if (next) stopAllScoreNotes();
          }}
          hitSlop={8}
          testID="score-editor-mute"
        >
          <Ionicons
            name={muteAudio ? "volume-mute" : "volume-high"}
            size={S.ms(20, 0.4)}
            color={muteAudio ? C.accent : C.text}
          />
        </Pressable>

        {/* 악보 정보 편집 */}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={() => {
            setMetaDraft({
              title: doc.metadata.title,
              subtitle: doc.metadata.subtitle ?? "",
              composer: doc.metadata.composer ?? "",
              arranger: doc.metadata.arranger ?? "",
              lyricist: doc.metadata.lyricist ?? "",
              copyright: doc.metadata.copyright ?? "",
              difficulty: doc.metadata.difficulty,
              memo: doc.metadata.memo ?? "",
            });
            setShowMetaModal(true);
          }}
          hitSlop={8}
          testID="score-editor-meta"
        >
          <Ionicons name="information-circle-outline" size={S.ms(20, 0.4)} color={C.text} />
        </Pressable>

        {/* 공유 버튼 */}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={() => setShowShareModal(true)}
          hitSlop={8}
          testID="score-editor-share"
        >
          <Ionicons name="share-social-outline" size={S.ms(20, 0.4)} color={C.text} />
        </Pressable>

        {/* ⋯ 더 보기 메뉴 */}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={() => setShowMoreMenu(true)}
          hitSlop={8}
          testID="score-editor-more-menu"
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
        {/* 악보 메타 — 탭하면 편집 모달 */}
        <Pressable
          style={styles.scoreHeader}
          onPress={() => {
            setMetaDraft({
              title: doc.metadata.title,
              subtitle: doc.metadata.subtitle ?? "",
              composer: doc.metadata.composer ?? "",
              arranger: doc.metadata.arranger ?? "",
              lyricist: doc.metadata.lyricist ?? "",
              copyright: doc.metadata.copyright ?? "",
              difficulty: doc.metadata.difficulty,
              memo: doc.metadata.memo ?? "",
            });
            setShowMetaModal(true);
          }}
          testID="score-header-tap"
        >
          <Text style={[styles.scoreTitle, { color: C.text }]}>
            {doc.metadata.title || t("scoreMode", "untitled")}
          </Text>
          {doc.metadata.composer && (
            <Text style={[styles.scoreMeta, { color: C.textSecondary }]}>
              {doc.metadata.composer}
            </Text>
          )}
        </Pressable>

        {/* 입력 힌트 */}
        {currentPart && currentPart.measures[0]?.elements.length === 0 &&
          (activeTool === "note" || activeTool === "rest") && (
          <Text style={[styles.inputHint, { color: C.textSecondary }]}>
            {t("scoreMode", "inputHint")}
          </Text>
        )}

        {/* 오선보 터치 캔버스 (참조 이미지 포함) */}
        {currentPart ? (
          <View style={{ position: "relative" }}>
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
              onMeasureLongPress={handleMeasureLongPress}
              onEraseElement={handleEraseElement}
              onEraseMultiple={handleEraseMultiple}
              onNoteMoved={handleNoteMoved}
              cursorMeasureIdx={null}
              isPlaying={playback.isPlaying}
              notePreviewEnabled={notePreviewEnabled}
              instrumentId={doc.parts[selectedPartIdx]?.instrumentId}
              playheadMeasureIdx={
                playback.isPlaying &&
                playback.currentMeasureIdx < (doc.parts[selectedPartIdx]?.measures.length ?? 0)
                  ? playback.currentMeasureIdx
                  : undefined
              }
              playheadFraction={playback.playheadFraction}
              showPlayhead={showPlayhead}
              highlightColor={highlightColor}
              lineSpacing={lineSpacing}
              disabled={!!measureContextMenu?.visible || showMeasureEditModal}
            />
            {/* 참조 이미지 오버레이 (편집 불가) */}
            {doc.referenceImageUri ? (
              <>
                <View
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                  pointerEvents="none"
                >
                  <Image
                    source={{ uri: doc.referenceImageUri }}
                    style={{
                      position: "absolute",
                      top: 0, left: 0, right: 0, bottom: 0,
                      opacity: doc.referenceImageOpacity ?? 0.4,
                      resizeMode: "contain",
                    }}
                  />
                </View>
                <Pressable
                  style={[styles.refOpacityBtn, { backgroundColor: C.surface + "CC", borderColor: C.border }]}
                  onPress={handleReferenceOpacityToggle}
                  hitSlop={8}
                  testID="score-ref-opacity-btn"
                >
                  <Text style={[styles.refOpacityLabel, { color: C.text }]}>
                    {Math.round((doc.referenceImageOpacity ?? 0.4) * 100)}%
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : (
          <Text style={{ color: C.textSecondary, marginTop: 24 }}>
            {t("scoreMode", "noPartsHint")}
          </Text>
        )}

        {/* ── 마디 설정 드로어 (마디는 오선지에서 탭/롱프레스로 선택) ── */}
        {currentPart && selectedMeasureIdx !== null && (
            <View style={[styles.drawerContainer, { borderColor: C.border, backgroundColor: C.surface }]}>
              <Pressable
                style={[styles.drawerHeader, { borderBottomColor: drawerOpen ? C.border : "transparent" }]}
                onPress={() => setDrawerOpen((v) => !v)}
                testID="score-editor-drawer-toggle"
              >
                <Text style={[styles.drawerHeaderText, { color: C.text }]}>
                  {t("scoreMode", "drawerMeasureSettings")} — {t("scoreMode", "addMeasure").replace("추가", "").replace("Add", "")} {selectedMeasureIdx + 1}
                </Text>
                <Ionicons
                  name={drawerOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={C.textSecondary}
                />
              </Pressable>

              {drawerOpen && (
                <View style={styles.drawerContent}>
                  {/* BPM 변경 */}
                  <View style={styles.drawerRow}>
                    <Text style={[styles.drawerFieldLabel, { color: C.textSecondary }]}>
                      {t("scoreMode", "drawerBpmLabel")}
                    </Text>
                    <Text style={[styles.drawerFieldLabel, { color: C.text, minWidth: 0 }]}>
                      {currentPart?.measures[selectedMeasureIdx]?.bpm
                        ? String(currentPart.measures[selectedMeasureIdx].bpm)
                        : `${doc.bpm} (${t("scoreMode", "drawerClear")})`}
                    </Text>
                    <Pressable
                      style={[styles.drawerApplyBtn, { backgroundColor: C.accent }]}
                      onPress={() => {
                        setDrawerOpen(false);
                        handleMeasureBpmChange(selectedMeasureIdx);
                      }}
                      testID="score-drawer-bpm-apply"
                    >
                      <Text style={styles.drawerApplyBtnText}>{t("scoreMode", "drawerApply")}</Text>
                    </Pressable>
                  </View>

                  {/* 박자표 변경 */}
                  <View style={styles.drawerRow}>
                    <Text style={[styles.drawerFieldLabel, { color: C.textSecondary }]}>
                      {t("scoreMode", "drawerTimeSigLabel")}
                    </Text>
                    <Text style={[styles.drawerFieldLabel, { color: C.text, minWidth: 0 }]}>
                      {(() => {
                        const sig = currentPart?.measures[selectedMeasureIdx]?.timeSignature ?? doc.timeSignature;
                        return `${sig.numerator}/${sig.denominator}`;
                      })()}
                    </Text>
                    <Pressable
                      style={[styles.drawerApplyBtn, { backgroundColor: C.accent }]}
                      onPress={() => {
                        setDrawerOpen(false);
                        handleMeasureTimeSigChange(selectedMeasureIdx);
                      }}
                      testID="score-drawer-timesig-apply"
                    >
                      <Text style={styles.drawerApplyBtnText}>{t("scoreMode", "drawerApply")}</Text>
                    </Pressable>
                  </View>

                  {/* 음자리표 변경 (이 마디부터 적용) */}
                  <View style={styles.drawerRow}>
                    <Text style={[styles.drawerFieldLabel, { color: C.textSecondary }]}>
                      {t("scoreMode", "drawerClefLabel")}
                    </Text>
                    <Text style={[styles.drawerFieldLabel, { color: C.text, minWidth: 0 }]}>
                      {(() => {
                        const m = currentPart?.measures[selectedMeasureIdx];
                        return m?.clef ?? currentPart?.clef ?? "treble";
                      })()}
                    </Text>
                    <Pressable
                      style={[styles.drawerApplyBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }]}
                      onPress={() => {
                        const cycle: ClefType[] = ["treble", "bass", "alto", "tenor", "percussion"];
                        const m = currentPart?.measures[selectedMeasureIdx];
                        const cur = m?.clef ?? currentPart?.clef ?? "treble";
                        const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
                        applyDoc({
                          ...doc,
                          parts: doc.parts.map((p, pIdx) => {
                            if (pIdx !== selectedPartIdx) return p;
                            return {
                              ...p,
                              measures: p.measures.map((mm, mIdx) =>
                                mIdx === selectedMeasureIdx ? { ...mm, clef: next } : mm
                              ),
                            };
                          }),
                        });
                      }}
                      testID="score-drawer-clef-cycle"
                    >
                      <Text style={[styles.drawerApplyBtnText, { color: C.text }]}>
                        {t("scoreMode", "drawerApply")}
                      </Text>
                    </Pressable>
                  </View>

                  {/* 조표 변경 (이 마디부터 적용) */}
                  <View style={styles.drawerRow}>
                    <Text style={[styles.drawerFieldLabel, { color: C.textSecondary }]}>
                      {t("scoreMode", "drawerKeyLabel")}
                    </Text>
                    <Text style={[styles.drawerFieldLabel, { color: C.text, minWidth: 0 }]}>
                      {(() => {
                        const m = currentPart?.measures[selectedMeasureIdx];
                        const sharps = m?.keySignature?.sharps ?? doc.keySignature.sharps;
                        return sharps === 0 ? "C" : sharps > 0 ? `${sharps}#` : `${Math.abs(sharps)}♭`;
                      })()}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      {([-1, 1] as const).map((delta) => (
                        <Pressable
                          key={delta}
                          style={[styles.drawerApplyBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }]}
                          onPress={() => {
                            const m = currentPart?.measures[selectedMeasureIdx];
                            const cur = m?.keySignature?.sharps ?? doc.keySignature.sharps ?? 0;
                            const next = Math.max(-7, Math.min(7, cur + delta));
                            applyDoc({
                              ...doc,
                              parts: doc.parts.map((p, pIdx) => {
                                if (pIdx !== selectedPartIdx) return p;
                                return {
                                  ...p,
                                  measures: p.measures.map((mm, mIdx) =>
                                    mIdx === selectedMeasureIdx
                                      ? { ...mm, keySignature: { sharps: next } }
                                      : mm
                                  ),
                                };
                              }),
                            });
                          }}
                          testID={`score-drawer-key-${delta > 0 ? "plus" : "minus"}`}
                        >
                          <Text style={[styles.drawerApplyBtnText, { color: C.text }]}>
                            {delta > 0 ? "+1#" : "-1♭"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* 줄당 마디 수 */}
                  <View style={styles.drawerRow}>
                    <Text style={[styles.drawerFieldLabel, { color: C.textSecondary }]}>
                      {t("scoreMode", "drawerMeasuresPerLine")}
                    </Text>
                    <Text style={[styles.drawerFieldLabel, { color: C.text, minWidth: 0 }]}>
                      {doc.measuresPerLine
                        ? String(doc.measuresPerLine)
                        : t("scoreMode", "drawerMeasuresPerLineAuto")}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      {([-1, 1] as const).map((delta) => (
                        <Pressable
                          key={delta}
                          style={[styles.drawerApplyBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }]}
                          onPress={() => {
                            const cur = doc.measuresPerLine ?? 0;
                            const next = Math.max(0, Math.min(8, cur + delta));
                            applyDoc({ ...doc, measuresPerLine: next === 0 ? undefined : next });
                          }}
                          testID={`score-drawer-mpl-${delta > 0 ? "plus" : "minus"}`}
                        >
                          <Text style={[styles.drawerApplyBtnText, { color: C.text }]}>
                            {delta > 0 ? "+1" : "-1"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              )}
            </View>
        )}
      </ScrollView>

      {/* ── 연결된 연습 항목 배지 (재생 중 linkedPracticeEntryId가 있을 때) */}
      {playback.isPlaying && !!playback.currentLinkedEntryId && (
        <View style={[styles.linkedEntryBadge, { backgroundColor: C.accent + "22", borderColor: C.accent }]}>
          <Ionicons name="link" size={S.ms(11, 0.3)} color={C.accent} />
          <Text style={[styles.linkedEntryBadgeText, { color: C.accent }]} numberOfLines={1}>
            {t("scoreMode", "linkedPresetActive")} {playback.currentLinkedEntryId}
          </Text>
        </View>
      )}

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
                  measures: (
                    playback.currentMeasureIdx < p.measures.length
                      ? [p.measures[playback.currentMeasureIdx]]
                      : []
                  ).filter(Boolean) as typeof p.measures,
                })),
              }}
              containerWidth={containerWidth * 1.4}
              playheadMeasureIdx={0}
              playheadFraction={playback.playheadFraction}
              showPlayhead={showPlayhead}
              highlightColor={highlightColor}
              showPartNames={false}
              lineSpacing={lineSpacing}
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
          isDoubleDotted={isDoubleDotted}
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
          onDottedChange={(v) => { setIsDotted(v); if (v) setIsDoubleDotted(false); }}
          onDoubleDottedChange={(v) => { setIsDoubleDotted(v); if (v) setIsDotted(false); }}
          onAccidentalChange={(acc) => {
            setAccidental(acc);
            if (selectedElementId) handleApplyAccidentalToSelected(acc);
          }}
          onArticulationSelect={(art) => {
            setSelectedArticulation(art);
            if (selectedElementId) handleApplyArticulationToSelected(art);
          }}
          onDynamicSelect={setSelectedDynamic}
          selectedOrnament={selectedOrnament}
          onOrnamentSelect={(orn) => {
            setSelectedOrnament((prev) => (prev === orn ? null : orn));
            if (selectedElementId) handleApplyOrnamentToSelected(orn);
          }}
          selectedRepeatSign={selectedRepeatSign}
          selectedCrescType={selectedCrescType}
          onRepeatSignSelect={setSelectedRepeatSign}
          onCrescTypeSelect={setSelectedCrescType}
          selectedSlur={selectedSlur}
          onSlurToggle={(v) => { setSelectedSlur(v); if (!v) setSlurPendingStartId(null); }}
          onTempoSelect={handleTempoSelect}
          selectedInstrumentSymbol={selectedInstrumentSymbol}
          onInstrumentSymbolSelect={setSelectedInstrumentSymbol}
          onSymbolToggle={handleSymbolToggle}
          isTieActive={selectedTieActive}
          onTieToggle={handleToggleTieOnSelected}
        />
      </View>

      {/* ── JPG 내보내기 전용 캡처 뷰 (화면 바깥에 렌더링) ─────── */}
      <View
        ref={exportViewRef}
        collapsable={false}
        style={{
          position: "absolute",
          left: -9999,
          top: 0,
          width: containerWidth || 400,
          backgroundColor: "#ffffff",
        }}
        pointerEvents="none"
      >
        {/* 내보내기 헤더 */}
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#000", textAlign: "center" }}>
            {doc.metadata.title || t("scoreMode", "untitled")}
          </Text>
          {doc.metadata.composer ? (
            <Text style={{ fontSize: 13, color: "#444", textAlign: "center", marginTop: 4 }}>
              {doc.metadata.composer}
            </Text>
          ) : null}
          {doc.metadata.arranger ? (
            <Text style={{ fontSize: 12, color: "#666", textAlign: "center" }}>
              Arr. {doc.metadata.arranger}
            </Text>
          ) : null}
          {doc.metadata.copyright ? (
            <Text style={{ fontSize: 11, color: "#888", textAlign: "center" }}>
              © {doc.metadata.copyright}
            </Text>
          ) : null}
        </View>
        <ScoreRenderer
          doc={doc}
          containerWidth={containerWidth || 400}
          showPartNames
        />
      </View>

      {/* ── 공유 단축 모달 ───────────────────────────────────────── */}
      {showShareModal && (
        <Pressable
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
          onPress={() => setShowShareModal(false)}
        >
          <Pressable
            style={[
              {
                position: "absolute",
                bottom: 32,
                left: 16,
                right: 16,
                backgroundColor: C.surface,
                borderRadius: Radius.lg,
                padding: Spacing.md,
                borderWidth: 1,
                borderColor: C.border,
                gap: 8,
              },
            ]}
            onPress={() => {}}
          >
            <Text style={{ fontSize: S.ms(14, 0.3), fontWeight: "600", color: C.text, marginBottom: 4 }}>
              {t("scoreMode", "shareScoreTitle")}
            </Text>
            <Pressable
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: Spacing.sm,
                  borderRadius: Radius.md,
                  borderWidth: 1,
                  borderColor: C.border,
                  backgroundColor: pressed ? C.surfaceLight : "transparent",
                },
              ]}
              onPress={async () => {
                setShowShareModal(false);
                await handleShareScore();
              }}
              testID="score-share-json"
            >
              <Ionicons name="document-text-outline" size={S.ms(20, 0.4)} color={C.text} />
              <Text style={{ fontSize: S.ms(14, 0.3), color: C.text }}>{t("scoreMode", "exportJson")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: Spacing.sm,
                  borderRadius: Radius.md,
                  borderWidth: 1,
                  borderColor: C.border,
                  backgroundColor: pressed ? C.surfaceLight : "transparent",
                },
              ]}
              onPress={async () => {
                setShowShareModal(false);
                await handleExportPng();
              }}
              testID="score-share-png"
            >
              <Ionicons name="image-outline" size={S.ms(20, 0.4)} color={C.text} />
              <Text style={{ fontSize: S.ms(14, 0.3), color: C.text }}>{t("scoreMode", "exportPng")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                {
                  marginTop: 4,
                  padding: Spacing.sm,
                  borderRadius: Radius.md,
                  alignItems: "center",
                  backgroundColor: pressed ? C.surfaceLight : "transparent",
                },
              ]}
              onPress={() => setShowShareModal(false)}
            >
              <Text style={{ fontSize: S.ms(13, 0.3), color: C.textSecondary }}>{t("scoreMode", "cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      {/* ── 모달 영역 (ScoreEditorModals.tsx로 분리) ──────────── */}
      <ScoreMoreMenuModal
        visible={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        hasReferenceImage={!!doc.referenceImageUri}
        hasMultipleParts={doc.parts.length > 1}
        onExportJpg={handleExportJpg}
        onExportJson={handleExportJson}
        onShareScore={handleShareScore}
        onImportJson={handleImportJson}
        onImportReferenceImage={handleImportReferenceImageAction}
        onClearReferenceImage={handleClearReferenceImage}
        onAddToPractice={handleAddToPractice}
        onExtractPart={handleExtractPartOpen}
        onOpenSymbolSettings={() => { setShowMoreMenu(false); setShowSymbolSettings(true); }}
      />
      <ScoreExtractPartModal
        visible={showExtractPartModal}
        onClose={() => setShowExtractPartModal(false)}
        parts={doc.parts}
        selectedIndices={extractPartIndices}
        onTogglePart={(pIdx) =>
          setExtractPartIndices((prev) =>
            prev.includes(pIdx) ? prev.filter((i) => i !== pIdx) : [...prev, pIdx],
          )
        }
        onConfirm={handleExtractConfirm}
      />
      <ScoreSymbolSettingsModal
        visible={showSymbolSettings}
        onClose={() => setShowSymbolSettings(false)}
        currentPart={currentPart}
        showPlayhead={showPlayhead}
        showZoomView={showZoomView}
        notePreviewEnabled={notePreviewEnabled}
        onUpdatePlaybackSettings={updatePlaybackSettings}
        onSymbolToggle={handleSymbolToggle}
      />
      <ScoreMeasureContextMenu
        measureIdx={measureContextMenu?.measureIdx ?? null}
        visible={!!measureContextMenu?.visible}
        hasLink={!!(measureContextMenu?.measureIdx != null && currentPart?.measures[measureContextMenu.measureIdx]?.linkedPracticeEntryId)}
        onClose={() => setMeasureContextMenu(null)}
        onBpmChange={handleMeasureBpmChange}
        onTimeSigChange={handleMeasureTimeSigChange}
        onAddRehearsal={handleAddRehearsalMark}
        onClearSigns={handleClearMeasureSigns}
        onAddMeasure={handleMeasureAddFromContext}
        onEditLink={handleMeasureEditLink}
        onClearLink={handleMeasureClearLink}
        onDelete={handleMeasureDeleteFromContext}
      />
      <ScoreMetaModal
        visible={showMetaModal}
        metaDraft={metaDraft}
        onClose={() => { setShowMetaModal(false); setMetaDraft(null); }}
        onChangeDraft={setMetaDraft}
        onSave={handleMetaSave}
      />
      <ScoreMeasureEditModal
        visible={showMeasureEditModal}
        editTarget={measureEditTarget}
        onClose={() => { setShowMeasureEditModal(false); setMeasureEditTarget(null); }}
        onChangeTarget={setMeasureEditTarget}
        onSave={handleMeasureEditSave}
      />
    </View>
  );
}


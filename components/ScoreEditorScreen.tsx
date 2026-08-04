// ============================================================
// ScoreEditorScreen — 악보 편집 화면 (셸)
// 상태·핸들러만 소유하고 서브컴포넌트를 조합한다.
// 서브컴포넌트: components/score-editor/
// ============================================================

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Alert,
  Platform,
  Animated,
  PanResponder,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { useScoreLineSpacing } from "@/lib/score-scale";
import { Spacing } from "@/constants/tokens";
import { saveScore, createEmptyMeasure } from "@/lib/score-storage";
import { stopAllScoreNotes, stopPreviewNote } from "@/lib/score-audio";
import {
  exportScoreAsJson,
  exportScoreAsJpg,
  exportScorePagesAsPng,
  shareScoreAsScoreJson,
  importScoreFromJson,
  importReferenceImage,
  extractParts,
} from "@/lib/score-io";
import { paginateScoreDoc } from "@/lib/score-layout";
import { measureBeatTotal } from "@/lib/score-playback";
import {
  createTupletGroup,
  removeTupletGroup,
  findTupletForElement,
  removeElementFromTuplets,
} from "@/lib/score-tuplet";
import { loadPracticeBook, savePracticeBook, createPracticeEntry } from "@/lib/storage";
import type {
  ScoreDocument,
  ScoreMeasure,
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
import { INSTRUMENTS, getKeySignatureLabel, DRUM_MAP } from "@/lib/score-types";
import type { EditorTool } from "@/components/ScoreCanvas";
import type { RepeatSignId, CrescType } from "@/components/ScorePalette";
import { ScorePalette } from "@/components/ScorePalette";
import { useScorePlayback } from "@/hooks/useScorePlayback";
import { detectChallengeLevel, generateChallengeScore } from "@/lib/session-challenge";
import type { ChallengeLevel } from "@/lib/session-challenge";
import { SessionChallengeModal } from "@/components/SessionChallengeModal";
import { makeStyles } from "@/components/ScoreEditorScreen.styles";
import { confirmDestructive } from "@/lib/confirm";
import {
  deleteMeasureFromDoc,
  copyMeasuresFromDoc,
  cutMeasuresFromDoc,
  pasteMeasuresIntoDoc,
} from "@/lib/score-measure-actions";
import type { MeasureClipboardEntry } from "@/lib/score-measure-actions";
import {
  ScoreMoreMenuModal,
  ScoreExtractPartModal,
  ScoreSymbolSettingsModal,
  ScoreMeasureContextMenu,
  ScoreMetaModal,
  ScoreMeasureEditModal,
  ScorePngExportOptionsModal,
} from "@/components/ScoreEditorModals";
import { HintBanner } from "@/components/HintTooltip";
import { makeNote, makeRest, withLayoutOverride, withoutLayoutOverride, MAX_HISTORY } from "@/components/score-editor/ScoreEditorTypes";
import { ScoreEditorToolbar } from "@/components/score-editor/ScoreEditorToolbar";
import { ScoreEditorSelectionBars } from "@/components/score-editor/ScoreEditorSelectionBars";
import { ScoreEditorCanvas } from "@/components/score-editor/ScoreEditorCanvas";
import { ScoreEditorMeasureDrawer } from "@/components/score-editor/ScoreEditorMeasureDrawer";
import { ScoreEditorPlaybackOverlay } from "@/components/score-editor/ScoreEditorPlaybackOverlay";
import { ScoreEditorShareModal } from "@/components/score-editor/ScoreEditorShareModal";
import { ScoreEditorExportCapture } from "@/components/score-editor/ScoreEditorExportCapture";

// ── Props ─────────────────────────────────────────────────────

export interface ScoreEditorScreenProps {
  doc: ScoreDocument;
  onBack: () => void;
  onSaved: (doc: ScoreDocument) => void;
  onLinkedEntryChange?: (
    entryId: string | undefined,
    scoreDefaults: { bpm: number; beatsPerMeasure: number },
  ) => void;
  onOpenDial?: () => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function ScoreEditorScreen({
  doc: initialDoc,
  onBack,
  onSaved,
  onLinkedEntryChange,
  onOpenDial,
}: ScoreEditorScreenProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = windowWidth - Spacing.lg * 2;
  const lineSpacing = useScoreLineSpacing();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topInset = insets.top || webTopInset;
  const bottomInset = insets.bottom || (Platform.OS === "web" ? 34 : 0);

  // ── 악보 상태 ────────────────────────────────────────────────
  const [doc, setDocRaw] = useState<ScoreDocument>(initialDoc);
  const [challengeLevel, setChallengeLevel] = useState<ChallengeLevel | null>(null);
  const [challengeDoc, setChallengeDoc] = useState<ScoreDocument | null>(null);

  // ── undo/redo 스택 ────────────────────────────────────────────
  const historyRef = useRef<ScoreDocument[]>([initialDoc]);
  const histIdxRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function applyDoc(newDoc: ScoreDocument, addToHistory = true) {
    setDocRaw(newDoc);
    if (!addToHistory) return;
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
  const [accidental, setAccidental] = useState<Accidental | null>(null);
  const [selectedArticulation, setSelectedArticulation] = useState<ArticulationType | null>(null);
  const [selectedRepeatSign, setSelectedRepeatSign] = useState<RepeatSignId | null>(null);
  const [selectedCrescType, setSelectedCrescType] = useState<CrescType>(null);
  const [selectedNoteHead, setSelectedNoteHead] = useState<import("@/lib/score-types").NoteHeadType | null>(null);

  // ── 마디 컨텍스트 메뉴 state ──────────────────────────────────
  const [measureContextMenu, setMeasureContextMenu] = useState<{
    measureIdx: number;
    visible: boolean;
  } | null>(null);

  // ── 마디 인라인 편집 모달 ─────────────────────────────────────
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
  const [measureMultiSelectIndices, setMeasureMultiSelectIndices] = useState<number[]>([]);
  const measureClipboardRef = useRef<MeasureClipboardEntry[] | null>(null);
  const [hasMeasureClipboard, setHasMeasureClipboard] = useState(false);
  const [multiSelectIds, setMultiSelectIds] = useState<string[]>([]);

  // ── 꾸밈음 선택 ──────────────────────────────────────────────
  const [selectedOrnament, setSelectedOrnament] = useState<import("@/lib/score-types").OrnamentType | null>(null);

  // ── 마디 설정 드로어 ──────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [topBarHeight, setTopBarHeight] = useState(0);
  // 선택 액션 바 영역 높이 (플로팅 도구 패널 위치 보정용, 없으면 0)
  const [selectionBarsHeight, setSelectionBarsHeight] = useState(0);
  const [draftMeasure, setDraftMeasure] = useState<{
    bpm?: number;
    timeSignature?: { numerator: number; denominator: number };
    clef?: ClefType;
    keySignature?: { sharps: number };
  }>({});

  // ── 재생 연동 ─────────────────────────────────────────────────
  const playback = useScorePlayback(doc);
  const scoreScrollRef = useRef<ScrollView>(null);

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

  useEffect(() => {
    if (onLinkedEntryChange) {
      onLinkedEntryChange(playback.currentLinkedEntryId, {
        bpm: doc.bpm,
        beatsPerMeasure: doc.timeSignature.numerator,
      });
    }
  }, [playback.currentLinkedEntryId, onLinkedEntryChange, doc.bpm, doc.timeSignature.numerator]);

  useEffect(() => {
    return () => {
      stopPreviewNote();
    };
  }, []);

  const measureRowYRef = useRef<Record<number, number>>({});

  useEffect(() => {
    if (!playback.isPlaying) return;
    const y = measureRowYRef.current[playback.currentMeasureIdx];
    if (y !== undefined) {
      scoreScrollRef.current?.scrollTo({ y: Math.max(0, y - 48), animated: true });
    }
  }, [playback.currentMeasureIdx, playback.isPlaying]);

  const showPlayhead = doc.playbackSettings?.showPlayhead !== false;
  const showZoomView = doc.playbackSettings?.showZoomView !== false;
  const muteAudio = doc.playbackSettings?.muteAudio === true;
  const notePreviewEnabled = doc.playbackSettings?.notePreview !== false;

  function updatePlaybackSettings(patch: {
    showPlayhead?: boolean;
    showZoomView?: boolean;
    muteAudio?: boolean;
    notePreview?: boolean;
  }) {
    applyDoc({ ...doc, playbackSettings: { ...doc.playbackSettings, ...patch } });
  }

  const highlightColor = C.accent + "28";

  // ── ⋯ 메뉴 ──────────────────────────────────────────────────
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // ── 성부 분리 모달 ─────────────────────────────────────────────
  const [showExtractPartModal, setShowExtractPartModal] = useState(false);
  const [extractPartIndices, setExtractPartIndices] = useState<number[]>([]);

  // ── JPG/PNG 내보내기 ─────────────────────────────────────────
  const exportViewRef = useRef<View>(null);
  const [showPngExportOptions, setShowPngExportOptions] = useState(false);
  const [pngExportMeasuresPerLine, setPngExportMeasuresPerLine] = useState<number | undefined>(doc.measuresPerLine);
  const [pngExportLinesPerPage, setPngExportLinesPerPage] = useState<number | undefined>(doc.linesPerPage);
  const pendingPngExportRef = useRef(false);
  const exportPageRefs = useRef<(View | null)[]>([]);

  const pngExportPages = useMemo(
    () =>
      paginateScoreDoc(
        pngExportMeasuresPerLine !== doc.measuresPerLine
          ? { ...doc, measuresPerLine: pngExportMeasuresPerLine }
          : doc,
        containerWidth || 400,
        pngExportMeasuresPerLine,
        pngExportLinesPerPage,
      ),
    [doc, pngExportMeasuresPerLine, pngExportLinesPerPage, containerWidth],
  );

  // ── 저장 토스트 ───────────────────────────────────────────────
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
    setPngExportMeasuresPerLine(doc.measuresPerLine);
    setPngExportLinesPerPage(doc.linesPerPage);
    setShowPngExportOptions(true);
  }

  function handleConfirmPngExport() {
    setShowPngExportOptions(false);
    pendingPngExportRef.current = true;
  }

  useEffect(() => {
    if (!pendingPngExportRef.current) return;
    pendingPngExportRef.current = false;
    const timer = setTimeout(async () => {
      const refs = pngExportPages.map((_, i) => ({
        current: exportPageRefs.current[i],
      })) as React.RefObject<unknown>[];
      const ok = await exportScorePagesAsPng(refs, doc);
      if (!ok) Alert.alert(t("scoreMode", "exportPng"), t("scoreMode", "exportJpgFail"));
    }, 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pngExportMeasuresPerLine, pngExportLinesPerPage]);

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
          mode: "score",
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
      const lvl = detectChallengeLevel(doc.metadata.title);
      if (lvl !== null) {
        setChallengeLevel(lvl);
        setChallengeDoc(generateChallengeScore(lvl));
      }
    } catch {
      Alert.alert("Error", "Could not save score.");
    }
  }, [doc, onSaved]);

  // ── 마디 추가 ─────────────────────────────────────────────────
  function handleAddMeasure() {
    const selMeasure =
      selectedMeasureIdx !== null
        ? doc.parts[selectedPartIdx]?.measures[selectedMeasureIdx]
        : undefined;
    const overrides: Partial<ScoreMeasure> = selMeasure
      ? {
          ...(selMeasure.bpm ? { bpm: selMeasure.bpm } : {}),
          ...(selMeasure.timeSignature ? { timeSignature: selMeasure.timeSignature } : {}),
          ...(selMeasure.clef ? { clef: selMeasure.clef } : {}),
          ...(selMeasure.keySignature ? { keySignature: selMeasure.keySignature } : {}),
        }
      : {
          ...(draftMeasure.bpm ? { bpm: draftMeasure.bpm } : {}),
          ...(draftMeasure.timeSignature ? { timeSignature: draftMeasure.timeSignature } : {}),
          ...(draftMeasure.clef ? { clef: draftMeasure.clef } : {}),
          ...(draftMeasure.keySignature ? { keySignature: draftMeasure.keySignature } : {}),
        };
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((part) => ({
        ...part,
        measures: [...part.measures, { ...createEmptyMeasure(), ...overrides }],
      })),
    };
    applyDoc(newDoc);
    setSelectedMeasureIdx((doc.parts[selectedPartIdx]?.measures.length) ?? 0);
    setDraftMeasure({});
  }

  // ── 마디 삭제 ─────────────────────────────────────────────────
  function handleDeleteMeasure(mIdx: number) {
    const newDoc = deleteMeasureFromDoc(doc, selectedPartIdx, mIdx);
    if (newDoc === doc) return;
    applyDoc(newDoc);
    if (selectedMeasureIdx === mIdx) setSelectedMeasureIdx(null);
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

  // ── 마디 컨텍스트 메뉴: 마디 삭제 ────────────────────────────
  function handleMeasureDeleteFromContext(mIdx: number) {
    setMeasureContextMenu(null);
    confirmDestructive(t("scoreMode", "deleteMeasureConfirm"), {
      title: t("scoreMode", "deleteMeasure"),
      confirmText: t("scoreMode", "delete"),
      cancelText: t("scoreMode", "cancel"),
      onConfirm: () => handleDeleteMeasure(mIdx),
    });
  }

  // ── 마디 복사/이동/붙여넣기 ───────────────────────────────────
  function resolveMeasureSelection(fallbackIdx: number): number[] {
    return measureMultiSelectIndices.length > 0 ? measureMultiSelectIndices : [fallbackIdx];
  }

  function handleCopyMeasures(fallbackIdx: number) {
    setMeasureContextMenu(null);
    const indices = resolveMeasureSelection(fallbackIdx);
    const clip = copyMeasuresFromDoc(doc, indices);
    if (clip.length === 0) return;
    measureClipboardRef.current = clip;
    setHasMeasureClipboard(true);
    setMeasureMultiSelectIndices([]);
  }

  function handleCutMeasures(fallbackIdx: number) {
    setMeasureContextMenu(null);
    const indices = resolveMeasureSelection(fallbackIdx);
    const result = cutMeasuresFromDoc(doc, indices);
    if (!result) return;
    measureClipboardRef.current = result.clip;
    setHasMeasureClipboard(true);
    applyDoc(result.doc);
    setMeasureMultiSelectIndices([]);
    setSelectedMeasureIdx(null);
  }

  function handleMeasurePaste(targetIdx: number) {
    setMeasureContextMenu(null);
    const clip = measureClipboardRef.current;
    if (!clip || clip.length === 0) return;
    const newDoc = pasteMeasuresIntoDoc(doc, targetIdx, clip);
    if (newDoc === doc) return;
    applyDoc(newDoc);
    setMeasureMultiSelectIndices([]);
  }

  // ── 음표 추가 ─────────────────────────────────────────────────
  const handleNotePlaced = useCallback(
    (
      measureIdx: number,
      pitch: Pitch,
      duration: NoteDuration,
      insertIdx: number,
      placedX: number,
      noteHead?: import("@/lib/score-types").NoteHeadType | null,
      drumType?: import("@/lib/score-types").DrumType,
    ) => {
      const newElement = makeNote(
        pitch,
        duration,
        accidental,
        selectedArticulation ? [selectedArticulation] : [],
        undefined,
        selectedOrnament ?? undefined,
        isDoubleDotted,
        noteHead ?? null,
        drumType,
      );
      const measureId = doc.parts[selectedPartIdx]?.measures[measureIdx]?.id;
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
        layoutOverrides: measureId
          ? withLayoutOverride(doc.layoutOverrides, measureId, newElement.id, placedX)
          : doc.layoutOverrides,
      };
      applyDoc(newDoc);
      // 초과 안내는 하단 상태 표시(beatStatusText)가 담당 — 팝업 토스트 제거됨
      setSelectedElementId(newElement.id);
      setSelectedMeasureIdx(measureIdx);
    },
    [doc, selectedPartIdx, accidental, selectedArticulation, selectedOrnament, isDoubleDotted],
  );

  // ── 쉼표 추가 ─────────────────────────────────────────────────
  const handleRestPlaced = useCallback(
    (measureIdx: number, duration: NoteDuration, insertIdx: number, placedX: number) => {
      const newElement = makeRest(duration);
      const measureId = doc.parts[selectedPartIdx]?.measures[measureIdx]?.id;
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
        layoutOverrides: measureId
          ? withLayoutOverride(doc.layoutOverrides, measureId, newElement.id, placedX)
          : doc.layoutOverrides,
      };
      applyDoc(newDoc);
      setSelectedElementId(newElement.id);
      setSelectedMeasureIdx(measureIdx);
    },
    [doc, selectedPartIdx],
  );

  // ── 지우개 ────────────────────────────────────────────────────
  const handleEraseElement = useCallback(
    (elementId: string, measureIdx: number) => {
      const measureId = doc.parts[selectedPartIdx]?.measures[measureIdx]?.id;
      const newDoc: ScoreDocument = {
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((m, mi) => {
              if (mi !== measureIdx) return m;
              const cleaned = removeElementFromTuplets(m, elementId);
              return {
                ...cleaned,
                elements: cleaned.elements.filter((el) => el.id !== elementId),
              };
            }),
          };
        }),
        layoutOverrides: measureId
          ? withoutLayoutOverride(doc.layoutOverrides, measureId, elementId)
          : doc.layoutOverrides,
      };
      applyDoc(newDoc);
      if (selectedElementId === elementId) setSelectedElementId(null);
      setMultiSelectIds((prev) =>
        prev.includes(elementId) ? prev.filter((id) => id !== elementId) : prev,
      );
    },
    [doc, selectedPartIdx, selectedElementId],
  );

  const handleEraseMultiple = useCallback(
    (elements: Array<{ elementId: string; measureIdx: number }>) => {
      const byMeasure = new Map<number, Set<string>>();
      for (const { elementId, measureIdx } of elements) {
        if (!byMeasure.has(measureIdx)) byMeasure.set(measureIdx, new Set());
        byMeasure.get(measureIdx)!.add(elementId);
      }
      let nextOverrides = doc.layoutOverrides;
      for (const [mi, ids] of byMeasure) {
        const measureId = doc.parts[selectedPartIdx]?.measures[mi]?.id;
        if (!measureId) continue;
        for (const id of ids) {
          nextOverrides = withoutLayoutOverride(nextOverrides, measureId, id);
        }
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
              let cleaned = m;
              for (const id of toDelete) {
                cleaned = removeElementFromTuplets(cleaned, id);
              }
              return { ...cleaned, elements: cleaned.elements.filter((el) => !toDelete.has(el.id)) };
            }),
          };
        }),
        layoutOverrides: nextOverrides,
      };
      applyDoc(newDoc);
      const deletedIds = new Set(elements.map((e) => e.elementId));
      if (selectedElementId && deletedIds.has(selectedElementId)) setSelectedElementId(null);
      setMultiSelectIds((prev) => prev.filter((id) => !deletedIds.has(id)));
    },
    [doc, selectedPartIdx, selectedElementId],
  );

  // ── 음표 탭 선택 ──────────────────────────────────────────────
  const _docRef = useRef(doc);
  _docRef.current = doc;
  const _selectedPartIdxRef = useRef(selectedPartIdx);
  _selectedPartIdxRef.current = selectedPartIdx;
  const _selectedArticulationRef = useRef(selectedArticulation);
  _selectedArticulationRef.current = selectedArticulation;
  const _selectedOrnamentRef = useRef(selectedOrnament);
  _selectedOrnamentRef.current = selectedOrnament;
  const _selectedCrescTypeRef = useRef<CrescType>(null);
  _selectedCrescTypeRef.current = selectedCrescType;
  const _applyDocRef = useRef(applyDoc);
  _applyDocRef.current = applyDoc;
  const _multiSelectIdsRef = useRef<string[]>([]);
  _multiSelectIdsRef.current = multiSelectIds;

  const toggleMultiSelect = useCallback((elementId: string) => {
    setMultiSelectIds((prev) => {
      const adding = !prev.includes(elementId);
      const next = adding
        ? [...prev, elementId]
        : prev.filter((id) => id !== elementId);
      setSelectedElementId(next.length === 1 ? next[0] : null);
      if (adding) setMeasureMultiSelectIndices([]);
      return next;
    });
  }, []);

  const handleTupletBracketTap = useCallback((elementIds: string[]) => {
    setSelectedElementId(null);
    setMultiSelectIds(elementIds);
    setMeasureMultiSelectIndices([]);
  }, []);

  const handleElementTap = useCallback(
    (elementId: string, measureIdx: number) => {
      toggleMultiSelect(elementId);
      setSelectedMeasureIdx(measureIdx);

      const curDoc = _docRef.current;
      const curPartIdx = _selectedPartIdxRef.current;
      const applyFn = _applyDocRef.current;

      const crescType = _selectedCrescTypeRef.current;
      if (crescType) {
        const isCrescent = crescType === "cresc";
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

      const art = _selectedArticulationRef.current;
      const orn = _selectedOrnamentRef.current;
      if (!art && !orn) {
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

  // ── 반복/이동 부호 적용 ──────────────────────────────────────
  const handleRepeatSignApply = useCallback(
    (measureIdx: number, signId: RepeatSignId) => {
      const patch: Partial<import("@/lib/score-types").ScoreMeasure> = {};
      switch (signId) {
        case "repeat_start": patch.repeatStart = true; break;
        case "repeat_end": patch.repeatEnd = true; break;
        case "repeat_both": patch.repeatStart = true; patch.repeatEnd = true; break;
        case "segno": patch.segno = true; break;
        case "coda": patch.coda = true; break;
        case "da_capo": patch.jumpText = "D.C."; patch.jumpTo = "start"; break;
        case "dal_segno": patch.jumpText = "D.S."; patch.jumpTo = "segno"; break;
        case "dal_segno_coda": patch.jumpText = "D.S.𝄌"; patch.jumpTo = "coda"; break;
        case "da_capo_coda": patch.jumpText = "D.C.𝄌"; patch.jumpTo = "start"; break;
        case "fine": patch.jumpText = "Fine"; patch.jumpTo = "fine"; break;
        case "volta1": patch.voltaBracket = 1; break;
        case "volta2": patch.voltaBracket = 2; break;
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
      setSelectedRepeatSign(null);
    },
    [doc, selectedPartIdx],
  );

  // ── 선택 초기화 ──────────────────────────────────────────────
  const handleClearSelection = useCallback(() => {
    setSelectedElementId(null);
    setSelectedMeasureIdx(null);
    setMeasureMultiSelectIndices([]);
  }, []);

  // ── 마디 탭 ──────────────────────────────────────────────────
  const handleMeasureTap = useCallback(
    (measureIdx: number) => {
      if (selectedRepeatSign) {
        handleRepeatSignApply(measureIdx, selectedRepeatSign);
        return;
      }
      if (selectedCrescType) {
        const isCrescent = selectedCrescType === "cresc";
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
        if (hasStart) setSelectedCrescType(null);
        return;
      }
      setMeasureMultiSelectIndices((prev) =>
        prev.includes(measureIdx) ? prev.filter((i) => i !== measureIdx) : [...prev, measureIdx],
      );
      setSelectedMeasureIdx(measureIdx);
      setSelectedElementId(null);
      setMultiSelectIds([]);
    },
    [selectedRepeatSign, selectedCrescType, selectedPartIdx, doc, handleRepeatSignApply],
  );

  const handleMeasureLongPress = useCallback((measureIdx: number) => {
    setMeasureContextMenu({ measureIdx, visible: true });
  }, []);

  // ── 마디 BPM/박자표 변경 모달 열기 ───────────────────────────
  function handleMeasureBpmChange(measureIdx: number | null) {
    setMeasureContextMenu(null);
    setDrawerOpen(false);
    const curBpm =
      measureIdx !== null
        ? (doc.parts[selectedPartIdx]?.measures[measureIdx]?.bpm ?? doc.bpm)
        : (draftMeasure.bpm ?? doc.bpm);
    setMeasureEditTarget({
      measureIdx: measureIdx ?? -1,
      field: "bpm",
      value: String(curBpm),
      label: t("scoreMode", "measureBpmChange"),
      hint: "20–300",
    });
    setShowMeasureEditModal(true);
  }

  function handleMeasureTimeSigChange(measureIdx: number | null) {
    setMeasureContextMenu(null);
    setDrawerOpen(false);
    const curSig =
      measureIdx !== null
        ? (doc.parts[selectedPartIdx]?.measures[measureIdx]?.timeSignature ?? doc.timeSignature)
        : (draftMeasure.timeSignature ?? doc.timeSignature);
    setMeasureEditTarget({
      measureIdx: measureIdx ?? -1,
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
    const isDraft = measureIdx === -1;
    if (field === "bpm") {
      const n = parseInt(value.trim(), 10);
      if (n >= 20 && n <= 300) {
        if (isDraft) {
          setDraftMeasure((d) => ({ ...d, bpm: n }));
        } else {
          applyDoc({
            ...doc,
            parts: doc.parts.map((p, pIdx) => {
              if (pIdx !== selectedPartIdx) return p;
              return {
                ...p,
                measures: p.measures.map((m, mIdx) =>
                  mIdx !== measureIdx ? m : { ...m, bpm: n },
                ),
              };
            }),
          });
        }
      }
    } else if (field === "timeSig") {
      const parts = value.trim().split("/");
      const num = parseInt(parts[0] ?? "", 10);
      const den = parseInt(parts[1] ?? "", 10);
      if (num > 0 && den > 0) {
        if (isDraft) {
          setDraftMeasure((d) => ({ ...d, timeSignature: { numerator: num, denominator: den } }));
        } else {
          applyDoc({
            ...doc,
            parts: doc.parts.map((p, pIdx) => {
              if (pIdx !== selectedPartIdx) return p;
              return {
                ...p,
                measures: p.measures.map((m, mIdx) =>
                  mIdx !== measureIdx
                    ? m
                    : { ...m, timeSignature: { numerator: num, denominator: den } },
                ),
              };
            }),
          });
        }
      }
    } else if (field === "linkedEntry" && !isDraft) {
      applyDoc({
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
      });
    }
    setShowMeasureEditModal(false);
    setMeasureEditTarget(null);
  }

  // ── 마디 부호 지우기 ─────────────────────────────────────────
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
            const {
              repeatStart, repeatEnd, segno, coda, jumpText, jumpTo, voltaBracket,
              voltaBracketEnd, dynamic, crescStart, decrescStart, rehearsalMark, ...rest
            } = m;
            return rest as typeof m;
          }),
        };
      }),
    };
    applyDoc(newDoc);
  }

  // ── 리허설 마크 추가 ─────────────────────────────────────────
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

  // ── 기호 지우기 (음표 유지) ─────────────────────────────────
  function handleClearSymbolsOnSelected() {
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
              return {
                ...el,
                articulations: undefined,
                ornament: undefined,
                dynamic: undefined,
                bowUp: undefined,
                bowDown: undefined,
                harmonic: undefined,
                pizzicato: undefined,
                arco: undefined,
                pedal: undefined,
                pedalEnd: undefined,
                ottava: undefined,
                arpeggio: undefined,
              };
            }),
          })),
        };
      }),
    };
    applyDoc(newDoc);
  }

  // ── 선택 음표 삭제 ────────────────────────────────────────────
  function handleDeleteSelected() {
    if (!selectedElementId) return;
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m) => {
            const cleaned = removeElementFromTuplets(m, selectedElementId);
            return {
              ...cleaned,
              elements: cleaned.elements.filter((el) => el.id !== selectedElementId),
            };
          }),
        };
      }),
    };
    applyDoc(newDoc);
    setSelectedElementId(null);
  }

  // ── 다중 선택 일괄 삭제 ──────────────────────────────────────
  function handleDeleteMultiSelected() {
    if (multiSelectIds.length === 0) return;
    const idsToDelete = new Set(multiSelectIds);
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m) => {
            let cleaned = m;
            for (const id of idsToDelete) {
              cleaned = removeElementFromTuplets(cleaned, id);
            }
            return {
              ...cleaned,
              elements: cleaned.elements.filter((el) => !idsToDelete.has(el.id)),
            };
          }),
        };
      }),
    };
    applyDoc(newDoc);
    handleClearMultiSelect();
  }

  // ── 이전/다음 음표 이동 ──────────────────────────────────────
  const navigateElementRef = useRef<(dir: "prev" | "next") => void>(() => {});
  const handleNavigateElement = useCallback(
    (dir: "prev" | "next") => {
      if (!selectedElementId) return;
      const part = doc.parts[selectedPartIdx];
      if (!part) return;
      const allEls = part.measures.flatMap((m) => m.elements);
      const idx = allEls.findIndex((el) => el.id === selectedElementId);
      if (idx === -1) return;
      const nextIdx = dir === "prev" ? idx - 1 : idx + 1;
      if (nextIdx >= 0 && nextIdx < allEls.length) {
        setSelectedElementId(allEls[nextIdx].id);
      }
    },
    [selectedElementId, doc, selectedPartIdx],
  );
  navigateElementRef.current = handleNavigateElement;

  const selectionBarPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 12 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
        onPanResponderRelease: (_, gs) => {
          if (Math.abs(gs.dx) > 35) {
            navigateElementRef.current(gs.dx < 0 ? "next" : "prev");
          }
        },
      }),
    [],
  );

  // ── 다중 선택 정렬 ────────────────────────────────────────────
  const multiSelectSortedNotes = useMemo(() => {
    const part = doc.parts[selectedPartIdx];
    if (!part) return [] as Array<{ id: string; measureIdx: number; elemIdx: number; note: ScoreNote }>;
    const found: Array<{ id: string; measureIdx: number; elemIdx: number; note: ScoreNote }> = [];
    for (const id of multiSelectIds) {
      for (let mi = 0; mi < part.measures.length; mi++) {
        const ei = part.measures[mi].elements.findIndex((e) => e.id === id);
        if (ei >= 0) {
          const el = part.measures[mi].elements[ei];
          if (el.type === "note") found.push({ id, measureIdx: mi, elemIdx: ei, note: el });
          break;
        }
      }
    }
    found.sort((a, b) => a.measureIdx - b.measureIdx || a.elemIdx - b.elemIdx);
    return found;
  }, [doc, selectedPartIdx, multiSelectIds]);

  const multiSelectSortedElements = useMemo(() => {
    const part = doc.parts[selectedPartIdx];
    if (!part) return [] as Array<{ id: string; measureIdx: number; elemIdx: number }>;
    const found: Array<{ id: string; measureIdx: number; elemIdx: number }> = [];
    for (const id of multiSelectIds) {
      for (let mi = 0; mi < part.measures.length; mi++) {
        const ei = part.measures[mi].elements.findIndex((e) => e.id === id);
        if (ei >= 0) {
          found.push({ id, measureIdx: mi, elemIdx: ei });
          break;
        }
      }
    }
    found.sort((a, b) => a.measureIdx - b.measureIdx || a.elemIdx - b.elemIdx);
    return found;
  }, [doc, selectedPartIdx, multiSelectIds]);

  const multiSelectCanTuplet = useMemo(() => {
    if (multiSelectSortedElements.length < 2) return false;
    const measureIdx = multiSelectSortedElements[0].measureIdx;
    if (!multiSelectSortedElements.every((e) => e.measureIdx === measureIdx)) return false;
    for (let i = 1; i < multiSelectSortedElements.length; i++) {
      if (multiSelectSortedElements[i].elemIdx !== multiSelectSortedElements[i - 1].elemIdx + 1) {
        return false;
      }
    }
    return true;
  }, [multiSelectSortedElements]);

  function handleApplyTupletToSelected() {
    if (!multiSelectCanTuplet) return;
    const measureIdx = multiSelectSortedElements[0].measureIdx;
    const elementIds = multiSelectSortedElements.map((e) => e.id);
    const count = elementIds.length;
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mi) =>
            mi === measureIdx ? createTupletGroup(m, elementIds, count) : m,
          ),
        };
      }),
    };
    applyDoc(newDoc);
    setMultiSelectIds([]);
    setSelectedElementId(null);
  }

  function handleRemoveTupletFromSelected(elementId: string) {
    const part = doc.parts[selectedPartIdx];
    if (!part) return;
    let measureIdx = -1;
    let groupId: string | undefined;
    for (let mi = 0; mi < part.measures.length; mi++) {
      const group = findTupletForElement(part.measures[mi], elementId);
      if (group) { measureIdx = mi; groupId = group.id; break; }
    }
    if (measureIdx === -1 || !groupId) return;
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mi) =>
            mi === measureIdx ? removeTupletGroup(m, groupId as string) : m,
          ),
        };
      }),
    };
    applyDoc(newDoc);
  }

  const multiSelectCanTie = useMemo(() => {
    if (multiSelectSortedNotes.length !== 2) return false;
    const [a, b] = multiSelectSortedNotes;
    const part = doc.parts[selectedPartIdx];
    if (!part) return false;
    if (a.measureIdx === b.measureIdx) return b.elemIdx === a.elemIdx + 1;
    if (b.measureIdx === a.measureIdx + 1) {
      return (
        a.elemIdx === part.measures[a.measureIdx].elements.length - 1 && b.elemIdx === 0
      );
    }
    return false;
  }, [multiSelectSortedNotes, doc, selectedPartIdx]);

  function handleTieMultiSelected() {
    if (!multiSelectCanTie) return;
    const [a, b] = multiSelectSortedNotes;
    const elA = doc.parts[selectedPartIdx]?.measures[a.measureIdx]?.elements[a.elemIdx];
    const alreadyTied = elA?.type === "note" && (elA as ScoreNote).tieStart;
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mi) => ({
            ...m,
            elements: m.elements.map((el, ei) => {
              if (mi === a.measureIdx && ei === a.elemIdx && el.type === "note") {
                return { ...el, tieStart: alreadyTied ? undefined : true };
              }
              if (mi === b.measureIdx && ei === b.elemIdx && el.type === "note") {
                return { ...el, tieEnd: alreadyTied ? undefined : true };
              }
              return el;
            }),
          })),
        };
      }),
    };
    applyDoc(newDoc);
    setMultiSelectIds([]);
    setSelectedElementId(null);
  }

  function handleSlurMultiSelected() {
    if (multiSelectSortedNotes.length < 2) return;
    const first = multiSelectSortedNotes[0];
    const last = multiSelectSortedNotes[multiSelectSortedNotes.length - 1];
    const firstEl = doc.parts[selectedPartIdx]?.measures
      .flatMap((m) => m.elements)
      .find((e) => e.id === first.id);
    const alreadySlurred = firstEl?.type === "note" && (firstEl as ScoreNote).slurStart;
    const newDoc: ScoreDocument = {
      ...doc,
      parts: doc.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m) => ({
            ...m,
            elements: m.elements.map((el) => {
              if (el.type !== "note") return el;
              if (el.id === first.id) {
                return alreadySlurred
                  ? { ...el, slurStart: undefined, slurEndNoteId: undefined }
                  : { ...el, slurStart: true, slurEnd: undefined, slurEndNoteId: last.id };
              }
              if (el.id === last.id) {
                return alreadySlurred
                  ? { ...el, slurEnd: undefined }
                  : { ...el, slurEnd: true, slurStart: undefined };
              }
              return el;
            }),
          })),
        };
      }),
    };
    applyDoc(newDoc);
    setMultiSelectIds([]);
    setSelectedElementId(null);
  }

  function handleClearMultiSelect() {
    setMultiSelectIds([]);
    setSelectedElementId(null);
  }

  // ── 선택 음표에 임시표/아티큘레이션/꾸밈음 적용 ────────────────
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
              return { ...el, pitch: { ...el.pitch, accidental: acc ?? undefined } };
            }),
          })),
        };
      }),
    };
    applyDoc(newDoc);
  }

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
              const next =
                art === null ? [] : has ? existing.filter((a) => a !== art) : [...existing, art];
              return { ...el, articulations: next.length ? next : undefined };
            }),
          })),
        };
      }),
    };
    applyDoc(newDoc);
  }

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
              return { ...el, ornament: el.ornament === orn ? undefined : (orn ?? undefined) };
            }),
          })),
        };
      }),
    };
    applyDoc(newDoc);
  }

  // ── 악보 메타데이터 저장 ─────────────────────────────────────
  function handleMetaSave() {
    if (!metaDraft) return;
    applyDoc({
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
    });
    setShowMetaModal(false);
    setMetaDraft(null);
  }

  // ── 음표 드래그 이동 ─────────────────────────────────────────
  function handleNoteMoved(
    elementId: string,
    measureIdx: number,
    newPitch: Pitch,
    newDrumType?: import("@/lib/score-types").DrumType,
  ) {
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
                const updated = { ...el, pitch: newPitch };
                if (newDrumType !== undefined) {
                  updated.drumType = newDrumType;
                  updated.noteHead = DRUM_MAP[newDrumType].noteHead;
                }
                return updated;
              }),
            };
          }),
        };
      }),
    };
    applyDoc(newDoc);
  }

  // ── 빠르기 기호 선택 ─────────────────────────────────────────
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

  // ── 드로어: 음자리표 순환 / 조표 변경 ───────────────────────
  function handleDrawerClefCycle() {
    const currentPart = doc.parts[selectedPartIdx];
    if (!currentPart) return;
    const cycle: ClefType[] = ["treble", "bass", "alto", "tenor", "percussion"];
    if (selectedMeasureIdx !== null) {
      const m = currentPart.measures[selectedMeasureIdx];
      const cur = m?.clef ?? currentPart.clef ?? "treble";
      const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
      applyDoc({
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((mm, mIdx) =>
              mIdx === selectedMeasureIdx ? { ...mm, clef: next } : mm,
            ),
          };
        }),
      });
    } else {
      const cur = draftMeasure.clef ?? currentPart.clef ?? "treble";
      const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
      setDraftMeasure((d) => ({ ...d, clef: next }));
    }
  }

  function handleDrawerKeyChange(delta: -1 | 1) {
    const currentPart = doc.parts[selectedPartIdx];
    if (!currentPart) return;
    if (selectedMeasureIdx !== null) {
      const m = currentPart.measures[selectedMeasureIdx];
      const cur = m?.keySignature?.sharps ?? doc.keySignature.sharps ?? 0;
      const next = Math.max(-7, Math.min(7, cur + delta));
      applyDoc({
        ...doc,
        parts: doc.parts.map((p, pIdx) => {
          if (pIdx !== selectedPartIdx) return p;
          return {
            ...p,
            measures: p.measures.map((mm, mIdx) =>
              mIdx === selectedMeasureIdx ? { ...mm, keySignature: { sharps: next } } : mm,
            ),
          };
        }),
      });
    } else {
      const cur = draftMeasure.keySignature?.sharps ?? doc.keySignature.sharps ?? 0;
      const next = Math.max(-7, Math.min(7, cur + delta));
      setDraftMeasure((d) => ({ ...d, keySignature: { sharps: next } }));
    }
  }

  // ── 계산값 ────────────────────────────────────────────────────
  const currentPart = doc.parts[selectedPartIdx];

  const effectiveClef: ClefType =
    (selectedMeasureIdx !== null
      ? currentPart?.measures[selectedMeasureIdx]?.clef
      : draftMeasure.clef) ??
    currentPart?.clef ??
    "treble";
  const isPercussionPart = effectiveClef === "percussion";

  let beatStatusText = "";
  let beatIsOverflow = false;
  if (currentPart && selectedMeasureIdx !== null) {
    const _bsm = currentPart.measures[selectedMeasureIdx];
    if (_bsm) {
      const _bsig = _bsm.timeSignature ?? doc.timeSignature;
      const _bst = measureBeatTotal(_bsm, _bsig);
      const _bfmt = (b: number) => {
        const v = Math.round(b * 1000) / 1000;
        return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
      };
      if (_bst.overflow) {
        beatIsOverflow = true;
        beatStatusText = `+${_bfmt(Math.abs(_bst.remaining))}박 초과`;
      } else if (_bst.remaining > 1e-9) {
        beatStatusText = `잔여 ${_bfmt(_bst.remaining)}박`;
      }
    }
  }

  let drawerMeasureStatus = "";
  if (currentPart) {
    const _dms_measure = selectedMeasureIdx !== null ? currentPart.measures[selectedMeasureIdx] : null;
    const _dms_sig = _dms_measure?.timeSignature ?? doc.timeSignature;
    const _dms_sharps = _dms_measure?.keySignature?.sharps ?? doc.keySignature?.sharps ?? 0;
    const _dms_keyName = getKeySignatureLabel(_dms_sharps).split(" ")[0];
    const _dms_clef = _dms_measure?.clef ?? currentPart.clef ?? "treble";
    const _dms_bpm = _dms_measure?.bpm;
    const _dms_items: string[] = [
      `${_dms_sig?.numerator ?? 4}/${_dms_sig?.denominator ?? 4}`,
      `${_dms_keyName}장조`,
    ];
    if (_dms_clef !== "treble") {
      _dms_items.push(
        _dms_clef === "bass" ? "낮은음"
        : _dms_clef === "alto" ? "알토"
        : _dms_clef === "tenor" ? "테너"
        : _dms_clef === "percussion" ? "타악기"
        : _dms_clef,
      );
    }
    if (_dms_bpm) _dms_items.push(`BPM${_dms_bpm}`);
    drawerMeasureStatus = _dms_items.join(" · ");
  }

  // 선택된 음표 엔티티 (선택 바의 기호 지우기 버튼용)
  const selectedNote = useMemo((): ScoreNote | null => {
    if (!selectedElementId) return null;
    const part = doc.parts[selectedPartIdx];
    if (!part) return null;
    for (const m of part.measures) {
      const el = m.elements.find((e) => e.id === selectedElementId);
      if (el?.type === "note") return el;
    }
    return null;
  }, [doc, selectedPartIdx, selectedElementId]);

  const styles = useMemo(() => makeStyles(C, S), [C, S]);

  // ── 렌더 ──────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <HintBanner
        hintKey="score_editor_intro"
        message={t("scoreMode", "hintInputNote")}
        icon="musical-notes-outline"
      />

      {/* 상단 툴바 + 성부 탭 */}
      <ScoreEditorToolbar
        topInset={topInset}
        canUndo={canUndo}
        canRedo={canRedo}
        savedToast={savedToast}
        muteAudio={muteAudio}
        isPlaying={playback.isPlaying}
        isPreparing={playback.isPreparing}
        progressAnimRef={progressAnimRef}
        parts={doc.parts}
        selectedPartIdx={selectedPartIdx}
        onBack={onBack}
        onOpenDial={onOpenDial}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onPlayPause={playback.isPlaying ? playback.pause : playback.play}
        onStop={playback.stop}
        onToggleMute={() => {
          const next = !muteAudio;
          updatePlaybackSettings({ muteAudio: next });
          if (next) stopAllScoreNotes();
        }}
        onOpenShare={() => setShowShareModal(true)}
        onOpenMoreMenu={() => setShowMoreMenu(true)}
        onSave={handleSave}
        onSelectPart={setSelectedPartIdx}
        onLayout={setTopBarHeight}
      />

      {/* 선택 액션 바 — 높이를 측정해 플로팅 도구 패널이 겹치지 않게 아래로 내린다 */}
      <View
        onLayout={(e) => setSelectionBarsHeight(e.nativeEvent.layout.height)}
      >
      <ScoreEditorSelectionBars
        selectedElementId={selectedElementId}
        selectedNote={selectedNote}
        panHandlers={selectionBarPan.panHandlers}
        onNavigatePrev={() => handleNavigateElement("prev")}
        onNavigateNext={() => handleNavigateElement("next")}
        onClearSymbols={handleClearSymbolsOnSelected}
        onDeleteSelected={handleDeleteSelected}
        measureMultiSelectIndices={measureMultiSelectIndices}
        hasMeasureClipboard={hasMeasureClipboard}
        onDeselectMeasures={() => setMeasureMultiSelectIndices([])}
        onCopyMeasures={() =>
          handleCopyMeasures(
            measureMultiSelectIndices[measureMultiSelectIndices.length - 1],
          )
        }
        onCutMeasures={() =>
          handleCutMeasures(
            measureMultiSelectIndices[measureMultiSelectIndices.length - 1],
          )
        }
        onDeleteMeasures={() => {
          const sorted = [...measureMultiSelectIndices].sort((a, b) => b - a);
          let working = doc;
          for (const idx of sorted) {
            const next = deleteMeasureFromDoc(working, selectedPartIdx, idx);
            if (next !== working) working = next;
          }
          applyDoc(working);
          setMeasureMultiSelectIndices([]);
        }}
        multiSelectIds={multiSelectIds}
        multiSelectCanTie={multiSelectCanTie}
        multiSelectCanTuplet={multiSelectCanTuplet}
        multiSelectSortedElementsLength={multiSelectSortedElements.length}
        onClearMultiSelect={handleClearMultiSelect}
        onTieMultiSelected={handleTieMultiSelected}
        onSlurMultiSelected={handleSlurMultiSelected}
        onApplyTuplet={handleApplyTupletToSelected}
        onDeleteMultiSelected={handleDeleteMultiSelected}
      />
      </View>

      {/* 악보 캔버스 */}
      <ScoreEditorCanvas
        doc={doc}
        currentPart={currentPart ?? null}
        containerWidth={containerWidth}
        selectedElementId={selectedElementId}
        multiSelectIds={multiSelectIds}
        selectedMeasureIdx={selectedMeasureIdx}
        measureMultiSelectIndices={measureMultiSelectIndices}
        selectedPartIdx={selectedPartIdx}
        activeTool={activeTool}
        activeDuration={activeDuration}
        isDotted={isDotted}
        accidental={accidental}
        selectedNoteHead={selectedNoteHead}
        highlightColor={highlightColor}
        lineSpacing={lineSpacing}
        isPlaying={playback.isPlaying}
        notePreviewEnabled={notePreviewEnabled}
        playheadMeasureIdx={
          playback.isPlaying &&
          playback.currentMeasureIdx < (doc.parts[selectedPartIdx]?.measures.length ?? 0)
            ? playback.currentMeasureIdx
            : undefined
        }
        playheadFraction={playback.playheadFraction}
        showPlayhead={showPlayhead}
        canvasDisabled={
          !!measureContextMenu?.visible || showMeasureEditModal || drawerOpen
        }
        isLandscape={S.isLandscape}
        referenceImageUri={doc.referenceImageUri}
        referenceImageOpacity={doc.referenceImageOpacity ?? 0.4}
        scoreScrollRef={scoreScrollRef as React.RefObject<ScrollView>}
        measureRowYRef={measureRowYRef}
        onNotePlaced={handleNotePlaced}
        onRestPlaced={handleRestPlaced}
        onElementTap={handleElementTap}
        onMeasureTap={handleMeasureTap}
        onMeasureLongPress={handleMeasureLongPress}
        onClearSelection={handleClearSelection}
        onEraseElement={handleEraseElement}
        onEraseMultiple={handleEraseMultiple}
        onNoteMoved={handleNoteMoved}
        onTupletBracketTap={handleTupletBracketTap}
        onAddMeasure={handleAddMeasure}
        onOpenMeta={() => {
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
        onReferenceOpacityToggle={handleReferenceOpacityToggle}
      />

      {/* 마디 설정 드로어 */}
      <ScoreEditorMeasureDrawer
        currentPart={currentPart ?? null}
        doc={doc}
        selectedMeasureIdx={selectedMeasureIdx}
        selectedPartIdx={selectedPartIdx}
        draftMeasure={draftMeasure}
        drawerOpen={drawerOpen}
        bottomInset={bottomInset}
        beatStatusText={beatStatusText}
        beatIsOverflow={beatIsOverflow}
        drawerMeasureStatus={drawerMeasureStatus}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
        onBpmChange={handleMeasureBpmChange}
        onTimeSigChange={handleMeasureTimeSigChange}
        onClefCycle={handleDrawerClefCycle}
        onKeyChange={handleDrawerKeyChange}
      />

      {/* 재생 오버레이 (확대 뷰 + 배지 + 플로팅 버튼) */}
      <ScoreEditorPlaybackOverlay
        topBarHeight={topBarHeight > 0 ? topBarHeight + selectionBarsHeight : 0}
        isPlaying={playback.isPlaying}
        showZoomView={showZoomView}
        showPlayhead={showPlayhead}
        highlightColor={highlightColor}
        currentPart={currentPart ?? null}
        doc={doc}
        containerWidth={containerWidth}
        lineSpacing={lineSpacing}
        playheadFraction={playback.playheadFraction}
        currentMeasureIdx={playback.currentMeasureIdx}
        currentLinkedEntryId={playback.currentLinkedEntryId}
        activeTool={activeTool}
        onToggleTool={(tool) => {
          const isActive = activeTool === tool;
          const next: EditorTool = isActive ? "note" : tool;
          setActiveTool(next);
          if (next !== "select") {
            setMultiSelectIds([]);
            setSelectedElementId(null);
          }
        }}
      />

      {/* 하단 팔레트 */}
      <View
        style={[
          styles.paletteWrapper,
          { paddingBottom: bottomInset + 4, backgroundColor: C.surface },
        ]}
      >
        <ScorePalette
          activeTool={activeTool}
          activeDuration={activeDuration}
          isDotted={isDotted}
          isDoubleDotted={isDoubleDotted}
          accidental={accidental}
          selectedArticulation={selectedArticulation}
          onToolChange={(tool) => {
            setActiveTool(tool);
            if (tool !== "select") {
              setMultiSelectIds([]);
              setSelectedElementId(null);
            }
          }}
          onDurationChange={setActiveDuration}
          onDottedChange={(v) => {
            setIsDotted(v);
            if (v) setIsDoubleDotted(false);
          }}
          onDoubleDottedChange={(v) => {
            setIsDoubleDotted(v);
            if (v) setIsDotted(false);
          }}
          onAccidentalChange={(acc) => {
            setAccidental(acc);
            if (selectedElementId) handleApplyAccidentalToSelected(acc);
          }}
          onArticulationSelect={(art) => {
            setSelectedArticulation(art);
            if (selectedElementId) handleApplyArticulationToSelected(art);
          }}
          selectedOrnament={selectedOrnament}
          onOrnamentSelect={(orn) => {
            setSelectedOrnament((prev) => (prev === orn ? null : orn));
            if (selectedElementId) handleApplyOrnamentToSelected(orn);
          }}
          selectedRepeatSign={selectedRepeatSign}
          selectedCrescType={selectedCrescType}
          onRepeatSignSelect={setSelectedRepeatSign}
          onCrescTypeSelect={setSelectedCrescType}
          onTempoSelect={handleTempoSelect}
          isPercussionPart={isPercussionPart}
          selectedNoteHead={selectedNoteHead}
          onNoteHeadSelect={setSelectedNoteHead}
        />
      </View>

      {/* 내보내기 캡처 뷰 (화면 외) */}
      <ScoreEditorExportCapture
        doc={doc}
        containerWidth={containerWidth}
        exportViewRef={exportViewRef as React.RefObject<View>}
        pngExportMeasuresPerLine={pngExportMeasuresPerLine}
        pngExportPages={pngExportPages}
        exportPageRefs={exportPageRefs}
        untitledLabel={t("scoreMode", "untitled")}
      />

      {/* 공유 모달 */}
      <ScoreEditorShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        onShareJson={handleShareScore}
        onSharePng={handleExportPng}
      />

      {/* PNG 내보내기 옵션 */}
      <ScorePngExportOptionsModal
        visible={showPngExportOptions}
        value={pngExportMeasuresPerLine}
        linesPerPage={pngExportLinesPerPage}
        previewPages={pngExportPages}
        previewWidth={Math.min(containerWidth || 400, 300)}
        onClose={() => {
          setShowPngExportOptions(false);
          setPngExportMeasuresPerLine(doc.measuresPerLine);
          setPngExportLinesPerPage(doc.linesPerPage);
        }}
        onChange={setPngExportMeasuresPerLine}
        onChangeLinesPerPage={setPngExportLinesPerPage}
        onConfirm={handleConfirmPngExport}
      />

      {/* ── ScoreEditorModals ─────────────────────────────────── */}
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
        onEditMetadata={() => {
          setShowMoreMenu(false);
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
        onExtractPart={handleExtractPartOpen}
        onOpenSymbolSettings={() => { setShowMoreMenu(false); }}
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
        visible={false}
        onClose={() => {}}
        currentPart={currentPart ?? null}
        showPlayhead={showPlayhead}
        showZoomView={showZoomView}
        notePreviewEnabled={notePreviewEnabled}
        onUpdatePlaybackSettings={updatePlaybackSettings}
        onSymbolToggle={() => {}}
      />
      <ScoreMeasureContextMenu
        measureIdx={measureContextMenu?.measureIdx ?? null}
        visible={!!measureContextMenu?.visible}
        hasLink={!!(
          measureContextMenu?.measureIdx != null &&
          currentPart?.measures[measureContextMenu.measureIdx]?.linkedPracticeEntryId
        )}
        selectionCount={measureMultiSelectIndices.length}
        hasClipboard={hasMeasureClipboard}
        onClose={() => setMeasureContextMenu(null)}
        onCopy={handleCopyMeasures}
        onCut={handleCutMeasures}
        onPaste={handleMeasurePaste}
        onAddRehearsal={handleAddRehearsalMark}
        onClearSigns={handleClearMeasureSigns}
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
      {challengeLevel !== null && challengeDoc !== null && (
        <SessionChallengeModal
          visible
          level={challengeLevel}
          doc={challengeDoc}
          onClose={() => { setChallengeLevel(null); setChallengeDoc(null); }}
        />
      )}
    </View>
  );
}

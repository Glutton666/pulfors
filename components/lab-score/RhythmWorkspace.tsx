import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Alert } from "@/lib/alert";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Difficulty, Hit, InterpretationCandidate, NotationEvent, PlaybackHit, RhythmDocument, Shape, SymbolMeaning, SymbolRole, UserSymbol } from "@/lib/rhythm-lab/types";
import { applyInterpretation, applyTuplet, buildRhythmPlayback, createRhythmDocument, insertRest, insertNotationNote, interpretRhythm, moveNotationEvent, setEventDuration, toNumber } from "@/lib/rhythm-lab/engine";
import { deleteRhythmDocument, listRhythmDocuments, saveRhythmDocument } from "@/lib/rhythm-lab/storage";
import { evaluatePractice } from "@/lib/rhythm-lab/practice";
import { createScoreClickSession, playChord, previewScoreDrum, stopPreviewNote } from "@/lib/score-audio";
import { createRhythmAudioSession } from "@/lib/rhythm-lab/audio";
import { RhythmStaff } from "./RhythmStaff";
import { RhythmSymbolEditor } from "./RhythmSymbolEditor";
import { RhythmInputSurface } from "./RhythmInputSurface";
import { RhythmKeyboard } from "./RhythmKeyboard";
import { RhythmValidationPanel } from "./RhythmValidationPanel";
import { RhythmInputDock } from "./RhythmInputDock";
import { RhythmHoldToStop } from "./RhythmHoldToStop";
import { RhythmCalibrationPanel } from "./RhythmCalibrationPanel";
import { changeStaffRow, staffRowPixels } from "./rhythm-staff-layout";
import { RhythmStaffControls } from "./RhythmStaffControls";
import { useRhythmCalibration } from "@/hooks/useRhythmCalibration";
import { createRhythmReferenceTrack } from "@/lib/rhythm-lab/reference-track";
import { RhythmEntryGuidance } from "./RhythmEntryGuidance";
import { applyDraftCandidate, confirmDraftRegion, prepareValidatedDraft, reconstructNotation, reopenDraftRegion, verifyDraft } from "@/lib/rhythm-lab/verification";
import { useRhythmEntryMode } from "@/hooks/useRhythmEntryMode";
import { useRhythmRecovery } from "@/hooks/useRhythmRecovery";
import { rhythmRecovery } from "@/lib/rhythm-lab/recovery";

type InputMode = "pad" | "drums" | "keyboard";
const DURS = [1, 2, 4, 8, 16, 24, 32, 64];
const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const clockNow = () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

export function RhythmWorkspace({ active = true, initialDocument }: { active?: boolean; initialDocument?: RhythmDocument }) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const ko = language === "ko";
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const compactDock = windowHeight < 650 && windowWidth >= 600;
  const text = ko
    ? { headline: "연주를 먼저, 표기는 나중에.", intro: "원래 타격 시각은 보존됩니다. 해석은 초안이며 언제든 수정할 수 있습니다.", bpm: "템포", meter: "박자", countIn: "예비박", bars: "마디 제한", start: "녹음 시작", stop: "마침", pad: "패드", drums: "드럼", keyboard: "건반", press: "누르고 떼어 연주", provisional: "임시 기보", listen: "듣기", original: "원본 입력", notation: "기보 비교", save: "기록 저장", library: "저장 기록", candidates: "다른 해석", simplify: "정리 정도", selected: "선택된 타격", flam: "플램", drag: "드래그", regular: "일반", diddle: "더블", accent: "악센트", confirm: "확정", rest: "쉼표 추가", duration: "길이", onset: "시작 박", tuplet: "연음", actual: "실제", normal: "표기", apply: "적용", symbols: "사용자 기호", newSymbol: "기호 만들기", shapes: "도형 추가", meaning: "의미", role: "역할", description: "설명", unsupported: "미지원 의미는 주석으로만 표시됩니다.", practice: "따라 치기", calibrate: "타이밍 보정", taps: "탭", manual: "수동 오프셋 ms", beginPractice: "연습 시작", endPractice: "연습 종료", result: "종합 점수", difficulty: "난이도", empty: "아직 연주가 없습니다. 설정 후 패드를 눌러 기록하세요.", title: "제목", open: "열기", delete: "삭제", error: "오류", noDoc: "저장된 리듬이 없습니다.", hit: "타격", values: "음가", inputFlow: "입력", reviewFlow: "검토", practiceFlow: "연습" }
    : { headline: "Play it first. Notate it later.", intro: "Raw hit times stay intact. Interpretation is a draft, ready for your ear and hand.", bpm: "Tempo", meter: "Meter", countIn: "Count-in", bars: "Bar limit", start: "Start recording", stop: "Finish", pad: "Pad", drums: "Drums", keyboard: "Keys", press: "Press and release to play", provisional: "Live draft", listen: "Listen", original: "Original take", notation: "Notation pass", save: "Save take", library: "Saved takes", candidates: "Alternate readings", simplify: "Simplify", selected: "Selected hits", flam: "Flam", drag: "Drag", regular: "Regular", diddle: "Diddle", accent: "Accent", confirm: "Confirm", rest: "Insert rest", duration: "Duration", onset: "Start beat", tuplet: "Tuplet", actual: "Actual", normal: "Normal", apply: "Apply", symbols: "Personal symbols", newSymbol: "Build symbol", shapes: "Add shape", meaning: "Meaning", role: "Role", description: "Description", unsupported: "Unsupported meanings stay annotations.", practice: "Practice", calibrate: "Timing calibration", taps: "Taps", manual: "Manual offset ms", beginPractice: "Start practice", endPractice: "Finish practice", result: "Overall score", difficulty: "Difficulty", empty: "No performance yet. Set the pulse, then play the pad.", title: "Title", open: "Open", delete: "Delete", error: "Error", noDoc: "No saved rhythm documents.", hit: "hit", values: "Values", inputFlow: "Input", reviewFlow: "Review", practiceFlow: "Practice" };
  const [doc, setDocument] = useState<RhythmDocument>(() => initialDocument
    ? prepareValidatedDraft(initialDocument)
    : createRhythmDocument({ title: ko ? "새 리듬" : "New rhythm", bpm: 92, meter: { numerator: 4, denominator: 4 } }));
  const docRef = useRef(doc);
  const setDoc = (action: React.SetStateAction<RhythmDocument>) => {
    const next = typeof action === "function" ? action(docRef.current) : action;
    docRef.current = next;
    setDocument(next);
  };
  const recovery = useRhythmRecovery(doc);
  const [recoveryChoice, setRecoveryChoice] = useState<string | null>(null);
  const recoverable = recovery.documents.filter((item) => item.id !== doc.id);
  const recoveryTarget = recoverable.find((item) => item.id === recoveryChoice) ??
    recoverable.find((item) => item.id === recovery.previous?.id) ?? recoverable.at(-1);
  const recordingPhase = useRef<"idle" | "count-in" | "recording">("idle");
  const [recording, setRecording] = useState(false);
  const [recordPending, setRecordPending] = useState(false);
  const { entryMode, chooseEntryMode, entryModeReady, entryModeError } = useRhythmEntryMode();
  const [recordRequest, setRecordRequest] = useState(false);
  const recordRequestRef = useRef(false);
  const [inputEpoch, setInputEpoch] = useState(0);
  const [liveElapsedMs, setLiveElapsedMs] = useState(0);
  const [mode, setMode] = useState<InputMode>(() => initialDocument
    ? initialDocument.hits.some((hit) => hit.midi !== undefined) ? "keyboard"
      : initialDocument.hits.some((hit) => hit.drum !== undefined) ? "drums" : "pad"
    : "pad");
  const [drum, setDrum] = useState<NonNullable<Hit["drum"]>>("snare");
  const [countIn, setCountIn] = useState(true);
  const [barLimit, setBarLimit] = useState("0");
  const [flow, setFlow] = useState<"input" | "review" | "practice">(initialDocument ? "review" : "input");
  const [selected, setSelected] = useState<string[]>([]);
  const [duration, setDuration] = useState(0.25);
  const [durationText, setDurationText] = useState("0.25");
  const [manualStart, setManualStart] = useState("0");
  const [scrubPosition, setScrubPosition] = useState("0");
  const [tupletActual, setTupletActual] = useState("3");
  const [tupletNormal, setTupletNormal] = useState("2");
  const [parentTupletId, setParentTupletId] = useState<string | undefined>();
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [saved, setSaved] = useState<RhythmDocument[]>([]);
  const [loadError, setLoadError] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [reviewTool, setReviewTool] = useState<"validation" | "edit" | "candidates" | "symbols" | "calibration" | null>(null);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const playbackEpoch = useRef(0);
  const [dragPreviewDocument, setDragPreviewDocument] = useState<RhythmDocument | null>(null);
  const [symbolName, setSymbolName] = useState("");
  const [symbolDescription, setSymbolDescription] = useState("");
  const [symbolRole, setSymbolRole] = useState<SymbolRole>("rhythm");
  const [symbolMeaning, setSymbolMeaning] = useState<SymbolMeaning>("flam");
  const [shapeType, setShapeType] = useState<Shape["type"]>("ellipse");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [symbolShapes, setSymbolShapes] = useState<Shape[]>([]);
  const [symbolEditor, setSymbolEditor] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [offsetText, setOffsetText] = useState(() => String(initialDocument?.offsetMs ?? 0));
  const [rowSelection, setRowSelection] = useState<{ start: number; count: number } | null>(null);
  const [previousReader, setPreviousReader] = useState<Pick<RhythmDocument, "id" | "notationVersion" | "automaticCorrection"> | null>(null);
  const calibration = useRhythmCalibration((offset) => {
    setOffsetText(String(offset)); setDoc((prev) => ({ ...prev, offsetMs: offset }));
  });
  const [snapEdits, setSnapEdits] = useState(true);
  const [practiceOn, setPracticeOn] = useState(false);
  const [practicePending, setPracticePending] = useState(false);
  const [practiceTaps, setPracticeTaps] = useState<Hit[]>([]);
  const practiceTapsRef = useRef<Hit[]>([]);
  const practiceExpectedRef = useRef<PlaybackHit[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [practiceResult, setPracticeResult] = useState<ReturnType<typeof evaluatePractice> | null>(null);
  const [liveJudgment, setLiveJudgment] = useState("");
  const startRef = useRef(0);
  const releaseRef = useRef<Record<string, string>>({});
  const practiceGeneration = useRef(0);
  const practiceReference = useRef<ReturnType<typeof createRhythmReferenceTrack> | null>(null);
  if (!practiceReference.current) practiceReference.current = createRhythmReferenceTrack();
  const recordOriginReady = useRef(false);
  const recordBoundaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordReference = useRef<ReturnType<typeof createRhythmReferenceTrack> | null>(null);
  if (!recordReference.current) recordReference.current = createRhythmReferenceTrack();
  const recordGeneration = useRef(0);
  const recordTicker = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioSession = useRef<ReturnType<typeof createRhythmAudioSession> | null>(null);
  const clickSession = useRef<ReturnType<typeof createScoreClickSession> | null>(null);
  if (!clickSession.current) clickSession.current = createScoreClickSession();
  const activeMidi = useRef<number[]>([]);
  const scrubTrackWidth = useRef(1);
  const workspaceScroll = useRef<ScrollView>(null);
  const [scrollViewport, setScrollViewport] = useState({ top: 0, height: 0 });
  const [stageY, setStageY] = useState({ input: 0, review: 0, practice: 0 });
  const [staffY, setStaffY] = useState({ input: 0, review: 0, practice: 0 });
  const staffViewport = (stage: "input" | "review" | "practice") => ({
    top: scrollViewport.top - stageY[stage] - staffY[stage],
    height: scrollViewport.height,
  });
  const editPanelY = useRef(0);
  const candidatePanelY = useRef(0);
  if (!audioSession.current) audioSession.current = createRhythmAudioSession();
  const interpretation = useMemo(() => interpretRhythm(doc), [doc]);
  const draftReport = useMemo(() => verifyDraft(doc, interpretation), [doc, interpretation]);
  const [reviewMeasure, setReviewMeasure] = useState<number | null>(null);
  const events = interpretation.events;
  const displayEvents = useMemo(() => dragPreviewDocument ? interpretRhythm(dragPreviewDocument).events : events, [dragPreviewDocument, events]);
  const playheadQ = Math.max(0, Number(scrubPosition) || 0);
  const livePlayheadQ = liveElapsedMs * doc.bpm / 60000;
  const scrubMaxQ = Math.max(doc.meter.numerator * 4 / doc.meter.denominator, ...events.map((event) => toNumber(event.startQ) + toNumber(event.durationQ)));
  const selectedEvents = events.filter((event) => selected.includes(event.id) || event.hitIds.some((id) => selected.includes(id)));
  const candidateMeasure = reviewMeasure ?? selectedEvents[0]?.measureIndex ?? events.filter((event) => event.kind === "note").at(-1)?.measureIndex ?? 0;
  const visibleCandidates = interpretation.candidates.filter((candidate) => candidate.measureIndex === candidateMeasure)
    .filter((candidate) => !candidateOpen || verifyDraft(applyDraftCandidate(reopenDraftRegion(doc, candidateMeasure), candidate))
      .regions.some((region) => region.measureIndex === candidateMeasure && region.status !== "invalid"));
  const selectedHitIds = [...new Set([...selectedEvents.flatMap((event) => [...event.hitIds, ...(event.graceHitIds ?? [])]), ...selected.filter((id) => doc.hits.some((hit) => hit.id === id))])];
  const interactionLocked = recording || recordPending || practiceOn || practicePending || recordRequest || playing;
  const inputLocked = !active || !entryModeReady || playing || recordRequest ||
    (flow === "input" && entryMode === "capture" && !recording && !recordPending);
  const clearHeldInput = () => { activeMidi.current = []; stopPreviewNote(); setInputEpoch((value) => value + 1); };
  const setPlaybackActive = (value: boolean) => { playingRef.current = value; setPlaying(value); };
  const cleanupPlayback = () => { playbackEpoch.current++; audioSession.current?.stop(); clearHeldInput(); setPlaybackActive(false); };
  const cleanupRecording = () => { recordGeneration.current++; recordOriginReady.current = false; recordReference.current?.stop(); recordingPhase.current = "idle"; if (recordBoundaryTimer.current) clearTimeout(recordBoundaryTimer.current); recordBoundaryTimer.current = null; if (recordTicker.current) clearInterval(recordTicker.current); recordTicker.current = null; clickSession.current?.stop(); };
  const cleanupPractice = () => { practiceGeneration.current++; practiceReference.current?.stop(); audioSession.current?.stop(); clickSession.current?.stop(); setPracticeOn(false); setPracticePending(false); clearHeldInput(); };
  const cleanupAll = () => { calibration.cancel(); cleanupPlayback(); cleanupRecording(); cleanupPractice(); recordRequestRef.current = false; setRecordRequest(false); };
  const cleanupAllRef = useRef(cleanupAll);
  cleanupAllRef.current = cleanupAll;
  useEffect(() => () => cleanupAllRef.current(), []);
  const checkpoint = () => {
    const now = Math.max(0, clockNow() - startRef.current);
    const openIds = new Set(Object.values(releaseRef.current));
    const current = docRef.current;
    const closed = { ...current, hits: current.hits.map((hit) =>
      openIds.has(hit.id) && hit.releaseMs === undefined ? { ...hit, releaseMs: now } : hit) };
    docRef.current = closed;
    rhythmRecovery.remember(closed, true);
    void rhythmRecovery.flush();
  };
  const checkpointRef = useRef(checkpoint);
  checkpointRef.current = checkpoint;
  useEffect(() => () => checkpointRef.current(), []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") { checkpointRef.current(); cleanupAllRef.current(); setRecording(false); setRecordPending(false); }
    });
    return () => subscription.remove();
  }, []);
  const update = (next: RhythmDocument) => { if (!playingRef.current) setDoc({ ...next, updatedAt: Date.now() }); };
  const startFreshTake = () => {
    if (!active || !recordRequestRef.current) return;
    recordRequestRef.current = false; setRecordRequest(false);
    chooseEntryMode("capture");
    cleanupRecording();
    cleanupPlayback();
    calibration.cancel();
    setSelected([]); setReviewMeasure(null); setScrubPosition("0"); setReviewTool(null); setFlow("input"); setPracticeResult(null); setDoc((prev) => ({
      ...createRhythmDocument({ title: prev.title, bpm: prev.bpm, meter: prev.meter }),
      symbols: prev.symbols, offsetMs: prev.offsetMs, simplification: prev.simplification, staffLayout: prev.staffLayout,
    }));
    releaseRef.current = {};
    recordingPhase.current = "count-in";
    setRecordPending(true);
    const beatMs = 60000 / doc.bpm * 4 / doc.meter.denominator;
    const count = countIn ? Math.max(1, doc.meter.numerator) : 0;
    const owner = recordGeneration.current;
    const failed = (error: unknown) => {
      if (owner !== recordGeneration.current) return;
      checkpointRef.current();
      cleanupRecording(); setRecording(false); setRecordPending(false); clearHeldInput();
      Alert.alert(text.error, error instanceof Error ? error.message : String(error));
    };
    void recordReference.current!.start({
      intervalMs: beatMs,
      onStarted: (timing) => {
        if (owner !== recordGeneration.current) return;
        startRef.current = timing.originMs + count * timing.intervalMs;
        recordOriginReady.current = true;
        const limit = Number(barLimit);
        const endMs = limit > 0 ? limit * doc.meter.numerator * timing.intervalMs : Infinity;
        let lastDisplayMs = -Infinity;
        const tick = () => {
          if (owner !== recordGeneration.current) return;
          const elapsed = clockNow() - startRef.current;
          if (elapsed < 0) return;
          if (recordingPhase.current !== "recording") {
            recordingPhase.current = "recording";
            setRecordPending(false); setRecording(true);
          }
          if (elapsed - lastDisplayMs >= 80) { lastDisplayMs = elapsed; setLiveElapsedMs(elapsed); }
          if (elapsed >= endMs) finishRecord();
        };
        tick();
        if (owner === recordGeneration.current) {
          recordTicker.current = setInterval(tick, 20);
          recordBoundaryTimer.current = setTimeout(tick, Math.max(0, Math.ceil(startRef.current - clockNow())));
        }
      },
      onError: failed,
    }).catch(failed);
  };
  const beginRecord = () => {
    if (!entryModeReady || interactionLocked || recordRequestRef.current) return;
    clearHeldInput();
    recordRequestRef.current = true; setRecordRequest(true);
    calibration.cancel();
    rhythmRecovery.remember(docRef.current, true);
    void rhythmRecovery.flush();
    startFreshTake();
  };
  const finishRecord = () => {
    if (recordingPhase.current === "count-in") {
      cleanupRecording();
      setRecordPending(false);
      return;
    }
    const releasedAt = Math.max(0, clockNow() - startRef.current);
    const openHitIds = new Set(Object.values(releaseRef.current));
    cleanupRecording(); setRecording(false); setRecordPending(false); setFlow("review"); clearHeldInput();
    releaseRef.current = {};
    setDoc((prev) => prepareValidatedDraft({
      ...prev,
      hits: prev.hits.map((hit) => openHitIds.has(hit.id) && hit.releaseMs === undefined ? { ...hit, releaseMs: releasedAt } : hit),
    }));
    requestAnimationFrame(() => workspaceScroll.current?.scrollTo({ y: 0, animated: true }));
  };
  const previewMove = (eventId: string, startQ: number) => {
    if (playingRef.current || interactionLocked) return;
    try { setDragPreviewDocument(moveNotationEvent(doc, eventId, startQ, snapEdits)); }
    catch { setDragPreviewDocument(null); }
  };
  const commitMove = (eventId: string, startQ: number) => {
    if (playingRef.current || interactionLocked) return;
    try {
      update(moveNotationEvent(doc, eventId, startQ, snapEdits));
      setDragPreviewDocument(null); setSelected([eventId]); setManualStart(String(startQ)); setScrubPosition(String(startQ));
    } catch (error) { setDragPreviewDocument(null); Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
  };
  const cancelMove = () => setDragPreviewDocument(null);
  const scrubAt = (x: number) => setScrubPosition(String(Math.max(0, Math.min(scrubMaxQ, x / scrubTrackWidth.current * scrubMaxQ)).toFixed(2)));
  const addHit = (id: string, action: "down" | "up", midi?: number) => {
    // Include async playback preparation, not just audible playback.
    if (playingRef.current || inputLocked) return;
    // A tap can arrive after the audio boundary but before the UI timer.
    if (recordOriginReady.current && recordingPhase.current === "count-in" && clockNow() >= startRef.current) {
      recordingPhase.current = "recording"; setRecordPending(false); setRecording(true);
    }
    if (action === "down") {
      const now = clockNow();
      if (recordingPhase.current === "recording") {
        const onsetMs = Math.max(0, now - startRef.current);
        const hit: Hit = { id: genId("hit"), onsetMs, ...(mode === "keyboard" ? { midi } : { drum: mode === "drums" ? drum : "snare" }), ...(mode === "keyboard" && midi ? { midi } : {}) };
        setDoc((prev) => ({ ...prev, hits: [...prev.hits, hit], updatedAt: Date.now() }));
        releaseRef.current[id] = hit.id;
      }
      if (flow === "input" && recordingPhase.current === "idle" && !practiceOn && !practicePending && entryMode === "notation") {
        setDoc((prev) => insertNotationNote(prev, playheadQ, duration,
          mode === "keyboard" ? { midi } : { drum: mode === "drums" ? drum : "snare" }));
        if (mode !== "keyboard") setScrubPosition(String(playheadQ + duration));
      }
      if (mode === "keyboard" && midi) {
        activeMidi.current = [...new Set([...activeMidi.current, midi])];
        playChord(activeMidi.current, 900, 0.58);
      }
      if (practiceOn) {
        const hit: Hit = { id: genId("practice"), onsetMs: Math.max(0, now - startRef.current), ...(mode === "keyboard" && midi ? { midi } : {}), ...(mode === "keyboard" ? {} : { drum: mode === "drums" ? drum : "snare" }) };
        practiceTapsRef.current = [...practiceTapsRef.current, hit];
        setPracticeTaps(practiceTapsRef.current);
        const targets = practiceExpectedRef.current;
        const correctedTime = hit.onsetMs - doc.offsetMs;
        const nearest = targets.reduce((best, target) => Math.abs(target.timeMs - correctedTime) < Math.abs(best) ? target.timeMs - correctedTime : best, Number.POSITIVE_INFINITY);
        setLiveJudgment(Number.isFinite(nearest) ? `${nearest >= 0 ? "+" : ""}${Math.round(nearest)} ms` : "Tap captured");
      }
      if (mode === "pad") previewScoreDrum("snare");
      if (mode === "drums") previewScoreDrum(drum);
    } else {
      if (mode === "keyboard" && midi && activeMidi.current.includes(midi)) {
        activeMidi.current = activeMidi.current.filter((value) => value !== midi);
        if (activeMidi.current.length) playChord(activeMidi.current, 500, 0.5);
        else stopPreviewNote();
      }
      if (recordingPhase.current === "recording" && releaseRef.current[id]) {
        const releaseMs = Math.max(0, clockNow() - startRef.current);
        const hitId = releaseRef.current[id];
        setDoc((prev) => {
          const index = prev.hits.findIndex((hit) => hit.id === hitId);
          if (index < 0) return prev;
          const hits = [...prev.hits]; hits[index] = { ...hits[index], releaseMs };
          return { ...prev, hits };
        });
        delete releaseRef.current[id];
      }
    }
  };
  const restorePrevious = () => {
    if (interactionLocked || !recoveryTarget) return;
    const previous = recoveryTarget;
    rhythmRecovery.remember(docRef.current, true);
    cleanupAllRef.current();
    releaseRef.current = {};
    setSelected([]); setReviewMeasure(null); setScrubPosition("0"); setReviewTool(null);
    setDoc(previous);
    setRecoveryChoice(null);
    setMode(previous.hits.some((hit) => hit.midi !== undefined) ? "keyboard"
      : previous.hits.some((hit) => hit.drum !== undefined) ? "drums" : "pad");
    setOffsetText(String(previous.offsetMs));
    setFlow("review");
    void rhythmRecovery.flush();
  };
  const changeBpm = (value: string) => setDoc((prev) => ({ ...prev, bpm: Math.max(30, Math.min(260, Number(value) || 30)) }));
  const play = (kind: "original" | "notation") => {
    if (recording || recordPending || recordRequestRef.current || playingRef.current) return;
    if (practiceOn || practicePending) cleanupPractice();
    cleanupPlayback();
    calibration.cancel();
    clickSession.current?.stop();
    try {
      if (kind === "notation" && !draftReport.valid) {
        Alert.alert(text.error, ko ? "기보 계산 검증을 통과하지 못했습니다. 원본은 그대로 보존되어 있습니다." : "Notation validation failed. The original take is preserved.");
        return;
      }
      const sequence = kind === "notation" ? reconstructNotation(doc, events) : buildRhythmPlayback(doc, kind);
      if (!sequence.length) { Alert.alert(text.listen, text.empty); return; }
      setPlaybackActive(true);
      const owner = playbackEpoch.current;
      void audioSession.current?.play(sequence, undefined, () => { if (owner === playbackEpoch.current) setPlaybackActive(false); }).catch((error) => {
        if (owner !== playbackEpoch.current) return;
        setPlaybackActive(false); Alert.alert(text.error, error instanceof Error ? error.message : String(error));
      });
    } catch (error) { Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
  };
  const save = async () => {
    try { await saveRhythmDocument(doc); setSaved(await listRhythmDocuments()); Alert.alert(text.save, ko ? "저장했습니다." : "Take saved."); }
    catch (e) { Alert.alert(text.error, e instanceof Error ? e.message : String(e)); }
  };
  const loadLibrary = async () => {
    setLibraryLoading(true);
    try { setSaved(await listRhythmDocuments()); setLoadError(""); }
    catch (e) { setLoadError(e instanceof Error ? e.message : "Unable to load."); }
    finally { setLibraryLoading(false); }
  };
  const removeSaved = async (id: string) => {
    try { await deleteRhythmDocument(id); await loadLibrary(); }
    catch (e) { Alert.alert(text.error, e instanceof Error ? e.message : String(e)); }
  };
  const openSaved = (item: RhythmDocument) => {
    if (recording || recordPending || practiceOn || practicePending) return;
    rhythmRecovery.remember(docRef.current, true);
    const opened = prepareValidatedDraft(item);
    // Reopening an older book version in this same workspace must not replace
    // the only recovery copy of newer edits sharing its document ID.
    rhythmRecovery.remember(opened, false, true);
    cleanupAllRef.current();
    setReviewMeasure(null);
    setReviewTool(null);
    setSelected([]);
    setScrubPosition("0");
    setMode(item.hits.some((hit) => hit.midi !== undefined) ? "keyboard"
      : item.hits.some((hit) => hit.drum !== undefined) ? "drums" : "pad");
    activeMidi.current = [];
    update(opened);
    setOffsetText(String(item.offsetMs ?? 0));
    setFlow("review");
    setLibraryOpen(false);
    setSettingsOpen(false);
  };
  const openSettings = () => {
    if (interactionLocked) return;
    if (playing) cleanupPlayback();
    setSettingsOpen(true);
  };
  const openLibrary = () => {
    if (interactionLocked) return;
    if (playing) cleanupPlayback();
    setLibraryOpen(true);
    void loadLibrary();
  };
  const tapPad = () => addHit("pad", "down");
  const applyKind = (kind: "flam" | "drag" | "diddle" | "regular" | "accent") => {
    if (!selectedHitIds.length) { Alert.alert(text.selected, ko ? "먼저 오선의 타격을 선택하세요." : "Select notation or hits first."); return; }
    if (selectedEvents.some((event) => event.locked)) {
      Alert.alert(text.confirm, ko ? "확정한 표기를 바꿀까요?" : "Replace a confirmed interpretation?", [
        { text: ko ? "취소" : "Cancel", style: "cancel" },
        { text: text.confirm, onPress: () => { try { update(applyInterpretation(doc, selectedHitIds, kind)); } catch (e) { Alert.alert(text.error, e instanceof Error ? e.message : String(e)); } } },
      ]);
    } else { try { update(applyInterpretation(doc, selectedHitIds, kind)); } catch (e) { Alert.alert(text.error, e instanceof Error ? e.message : String(e)); } }
  };
  const selectCandidate = (candidate: InterpretationCandidate) => {
    const apply = () => {
      try {
        const next = applyDraftCandidate(reopenDraftRegion(doc, candidate.measureIndex), candidate);
        const region = verifyDraft(next).regions.find((item) => item.measureIndex === candidate.measureIndex);
        if (region?.status === "invalid") {
          Alert.alert(text.error, ko ? "계산 검증을 통과하지 못한 후보는 적용하지 않습니다." : "This candidate did not pass structural validation.");
          return;
        }
        update(next); setCandidateOpen(false);
      } catch (error) { Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
    };
    if (draftReport.regions.some((region) => region.measureIndex === candidate.measureIndex && region.status === "confirmed")) {
      Alert.alert(text.confirm, ko ? "이 마디의 확정을 해제하고 다른 해석을 적용할까요?" : "Reopen this confirmed bar and apply another interpretation?", [
        { text: ko ? "취소" : "Cancel", style: "cancel" }, { text: text.apply, onPress: apply },
      ]);
    } else apply();
  };
  const reviewRegion = (index: number) => {
    setReviewMeasure(index);
    setSelected(events.filter((event) => event.measureIndex === index && event.kind === "note").map((event) => event.id));
    setScrubPosition(String(index * doc.meter.numerator * 4 / doc.meter.denominator));
  };
  const confirmRegion = (index: number) => {
    try { update(confirmDraftRegion(doc, index)); }
    catch (error) { Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
  };
  const listenRegion = (index: number, kind: "original" | "notation" | "overlay") => {
    if (interactionLocked || playingRef.current) return;
    cleanupPlayback();
    calibration.cancel();
    clickSession.current?.stop();
    const region = draftReport.regions.find((item) => item.measureIndex === index);
    if (kind !== "original" && (!region || region.status === "invalid")) {
      Alert.alert(text.error, ko ? "기보 계산 오류가 있는 구간은 비교 재생하지 않습니다." : "Cannot play notation that failed structural validation.");
      return;
    }
    const localEvents = events.filter((event) => event.measureIndex === index);
    const ids = new Set(localEvents.flatMap((event) => [...event.hitIds, ...(event.graceHitIds ?? [])]));
    const barMs = doc.meter.numerator * 4 / doc.meter.denominator * 60000 / doc.bpm;
    const from = index * barMs, to = from + barMs;
    const original = buildRhythmPlayback(doc, "original").filter((hit) => ids.has(hit.id) ||
      (hit.timeMs - doc.offsetMs >= from && hit.timeMs - doc.offsetMs < to))
      .map((hit) => ({ ...hit, timeMs: Math.max(0, hit.timeMs - doc.offsetMs - from) }));
    // Decode whole connected sounds first: decoding only this bar would drop
    // tied continuations or truncate a gate at the selected bar.
    const notated = reconstructNotation(doc).filter((hit) => ids.has(hit.id) ||
      hit.timeMs >= from && hit.timeMs < to).map((hit) => {
      const skip = Math.max(0, from - hit.timeMs);
      return { ...hit, timeMs: Math.max(0, hit.timeMs - from),
        durationMs: hit.durationMs === undefined ? undefined : Math.max(0, hit.durationMs - skip) };
    });
    // Distinct sounds make the two streams audible in overlay comparison.
    const sequence = kind === "original" ? original : kind === "notation" ? notated :
      [...original.map((hit) => ({ ...hit, midi: undefined, drum: "snare" as const })),
        ...notated.map((hit) => ({ ...hit, id: `notation-${hit.id}`, midi: undefined, drum: "hihat_closed" as const }))];
    const lead = Math.max(0, -Math.min(0, ...sequence.map((hit) => hit.timeMs)));
    if (!sequence.length) return;
    setPlaybackActive(true);
    const owner = playbackEpoch.current;
    void audioSession.current?.play(sequence.map((hit) => ({ ...hit, timeMs: hit.timeMs + lead })),
      undefined, () => { if (owner === playbackEpoch.current) setPlaybackActive(false); }).catch((error) => {
       if (owner !== playbackEpoch.current) return;
       setPlaybackActive(false); Alert.alert(text.error, error instanceof Error ? error.message : String(error));
    });
  };
  const editEvent = (event: NotationEvent, start: number, dur: number) => {
    try {
      const root = event.tie ? events.find((e) => e.tie?.id === event.tie!.id && e.tie.part === 0) ?? event : event;
      const moved = moveNotationEvent(doc, root.id, start, snapEdits);
      const next = setEventDuration(moved, root.id, dur);
      update({ ...next, manualEvents: next.manualEvents?.map((item) => item.id === event.id ? { ...item, locked: true } : item) });
    } catch (error) { Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
  };
  const applyEventForm = () => {
    const event = selectedEvents[0]; const start = Number(manualStart); const dur = Number(durationText);
    if (!event) { Alert.alert(text.selected, ko ? "먼저 음표나 쉼표를 선택하세요." : "Select a note or rest first."); return; }
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(dur) || dur <= 0) { Alert.alert(text.error, ko ? "시작 위치와 길이를 확인하세요." : "Check the onset and duration values."); return; }
    setDuration(dur); editEvent(event, start, dur);
  };
  const applyTupletNow = () => {
    const ids = selectedEvents.map((event) => event.id);
    if (ids.length < 2) { Alert.alert(text.tuplet, ko ? "연음으로 묶을 노트나 쉼표를 두 개 이상 선택하세요." : "Select at least two notes or rests for a tuplet."); return; }
    try { update(applyTuplet(doc, ids, Number(tupletActual), Number(tupletNormal), parentTupletId)); }
    catch (e) { Alert.alert(text.error, e instanceof Error ? e.message : String(e)); }
  };
  const addCustomShape = () => {
    const id = genId("shape");
    const shape: Shape = shapeType === "ellipse" ? { id, type: "ellipse", cx: 50, cy: 50, rx: 22, ry: 13 } :
      shapeType === "line" ? { id, type: "line", x1: 25, y1: 50, x2: 75, y2: 50 } :
        { id, type: "curve", x1: 20, y1: 55, cx: 50, cy: 15, x2: 80, y2: 55 };
    setSymbolShapes((prev) => [...prev, shape]);
    setSelectedShapeId(shape.id);
  };
  const updateShape = (shapeId: string, field: string, value: number) => setSymbolShapes((prev) => prev.map((shape) =>
    shape.id === shapeId ? { ...shape, [field]: value } as Shape : shape));
  const saveSymbol = () => {
    if (!symbolName.trim() || !symbolShapes.length) { Alert.alert(text.newSymbol, ko ? "이름과 도형을 입력하세요." : "Add a name and at least one shape."); return; }
    const symbol: UserSymbol = { id: genId("symbol"), name: symbolName.trim(), shapes: symbolShapes, role: symbolRole, meaning: symbolMeaning, description: symbolDescription.trim() };
    update({ ...doc, symbols: [...doc.symbols, symbol] });
    setSymbolEditor(false); setSymbolName(""); setSymbolDescription(""); setSymbolShapes([]);
  };
  const commitSymbol = (symbol: UserSymbol) => {
    if (symbol.role === "rhythm" && ["flam", "drag", "diddle"].includes(symbol.meaning)) {
      try { update(applyInterpretation(doc, selectedHitIds, symbol.meaning as "flam" | "drag" | "diddle", symbol.id)); }
      catch (e) { Alert.alert(text.error, e instanceof Error ? e.message : String(e)); }
    } else if (symbol.role === "expression" && symbol.meaning === "accent") {
      try { update(applyInterpretation(doc, selectedHitIds, "accent", symbol.id)); }
      catch (e) { Alert.alert(text.error, e instanceof Error ? e.message : String(e)); }
    } else {
      const marked = interpretation.events.filter((event) => event.hitIds.some((id) => selectedHitIds.includes(id))).map((event) => ({ ...event, symbolId: symbol.id, locked: true }));
      const markedIds = new Set(marked.map((event) => event.id));
      update({ ...doc, manualEvents: [...(doc.manualEvents ?? []).filter((event) => !markedIds.has(event.id)), ...marked] });
    }
  };
  const applySymbol = (symbol: UserSymbol) => {
    if (!selectedHitIds.length) { Alert.alert(text.symbols, ko ? "먼저 타격을 선택하세요." : "Select one or more hits first."); return; }
    if (selectedEvents.some((event) => event.locked)) Alert.alert(text.confirm, ko ? "확정한 표기를 바꿀까요?" : "Replace a confirmed interpretation?", [
      { text: ko ? "취소" : "Cancel", style: "cancel" },
      { text: text.confirm, onPress: () => commitSymbol(symbol) },
    ]);
    else commitSymbol(symbol);
  };
  const startCalibration = () => {
    calibration.cancel(); setOffsetText("0"); setDoc((prev) => ({ ...prev, offsetMs: 0 }));
  };
  const playCalibrationReference = () => {
    if (interactionLocked) return;
    cleanupPlayback(); clickSession.current?.stop();
    calibration.start(60000 / doc.bpm * 4 / doc.meter.denominator);
  };
  const calibrationTap = () => { if (!interactionLocked) calibration.tap(); };
  const editOffset = (value: string) => {
    calibration.cancel(); setOffsetText(value);
    if (value.trim() && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 2000) {
      setDoc((prev) => ({ ...prev, offsetMs: Number(value) }));
    }
  };
  const closeSettings = () => { calibration.cancel(); setSettingsOpen(false); };
  const beginPractice = () => {
    if (practiceOn || practicePending) return;
    if (recording || recordPending) { Alert.alert(text.practice, ko ? "먼저 입력을 마쳐 주세요." : "Finish recording before practice."); return; }
    calibration.cancel();
    // Raw playback remains untouched; practice targets and taps both use the
    // same single correction, preventing an artificial systematic mismatch.
    const expected = buildRhythmPlayback(doc, doc.hits.length ? "original" : "notation")
      .map((hit) => doc.hits.length ? { ...hit, timeMs: Math.max(0, hit.timeMs - doc.offsetMs) } : hit);
    if (!expected.length) { Alert.alert(text.practice, text.empty); return; }
    practiceExpectedRef.current = expected;
    cleanupPlayback(); cleanupPractice(); setFlow("practice"); setPracticeResult(null); practiceTapsRef.current = []; setPracticeTaps([]); setPracticePending(true); setLiveJudgment(text.beginPractice);
    const beatMs = 60000 / doc.bpm * 4 / doc.meter.denominator;
    const count = countIn ? Math.max(1, doc.meter.numerator) : 0;
    const owner = practiceGeneration.current;
    const failed = (error: unknown) => {
      if (owner !== practiceGeneration.current) return;
      cleanupPractice(); Alert.alert(text.error, error instanceof Error ? error.message : String(error));
    };
    const begin = () => {
      if (owner !== practiceGeneration.current) return;
      void audioSession.current?.play(expected, () => {
        if (owner !== practiceGeneration.current) return;
        setPracticePending(false); setPracticeOn(true); startRef.current = clockNow();
      }, () => { if (owner === practiceGeneration.current) finishPractice(); }).catch(failed);
    };
    if (count) void practiceReference.current!.start({
      intervalMs: beatMs, beats: count, onEnded: begin, onError: failed,
    }).catch(failed);
    else begin();
  };
  const finishPractice = () => {
    const expected = practiceExpectedRef.current;
    try {
      const result = evaluatePractice(expected, practiceTapsRef.current.map((hit) => ({ id: hit.id, timeMs: hit.onsetMs - doc.offsetMs, drum: hit.drum, midi: hit.midi })), doc.bpm, difficulty);
      cleanupPractice(); setPracticeResult(result);
    } catch (error) { cleanupPractice(); Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
  };
  const stopPractice = () => practiceOn ? finishPractice() : cleanupPractice();
  const changeFlow = (next: "input" | "review" | "practice") => {
    if (recording || recordPending || practiceOn || practicePending || recordRequestRef.current) return;
    if (next === "practice" && !buildRhythmPlayback(doc, doc.hits.length ? "original" : "notation").length) {
      Alert.alert(text.practice, text.empty);
      return;
    }
    if (next === "practice" && (recording || recordPending)) {
      Alert.alert(text.practice, ko ? "먼저 입력을 마쳐 주세요." : "Finish recording before practice.");
      return;
    }
    cleanupAllRef.current();
    calibration.cancel();
    setRecording(false);
    setRecordPending(false);
    setPracticePending(false);
    setFlow(next);
    requestAnimationFrame(() => workspaceScroll.current?.scrollTo({ y: 0, animated: true }));
  };
  const selectEvent = (event: NotationEvent) => {
    if (playing || recording || recordPending || practiceOn || practicePending) return;
    if (event.tie) event = events.find((e) => e.tie?.id === event.tie!.id && e.tie.part === 0) ?? event;
    setSelected((prev) => prev.includes(event.id) ? prev.filter((id) => id !== event.id) : [...prev, event.id]);
    setManualStart(String(toNumber(event.startQ))); setScrubPosition(String(toNumber(event.startQ)));
    const wholeDuration = event.tie ? events.filter((e) => e.tie?.id === event.tie!.id)
      .reduce((sum, e) => sum + toNumber(e.durationQ), 0) : toNumber(event.durationQ);
    setDuration(wholeDuration); setDurationText(String(wholeDuration));
  };
  useEffect(() => { void loadLibrary(); }, []);
  const deactivateRef = useRef<() => void>(() => {});
  deactivateRef.current = () => {
    if (recording || recordPending) finishRecord();
    else cleanupAllRef.current();
    setPracticePending(false);
  };
  useEffect(() => { if (!active) deactivateRef.current(); }, [active]);

  const entryGuidance = !entryModeReady ? (ko ? "입력 모드 불러오는 중…" : "Restoring input mode…")
    : playing ? (ko ? "재생 중 입력 잠김" : "Input locked during playback")
    : recordRequest ? (ko ? "새 녹음 확인 중 · 입력 잠김" : "New take confirmation · input locked")
    : recordPending ? (ko ? "예비박 · 소리만 나며 타격은 기록되지 않음 · 모드 전환 잠김" : "Count-in · sound only, no hits captured · mode locked")
    : recording ? (ko ? "탭 기록 중 · 누름·뗌 저장 · 모드 전환 잠김" : "Recording taps · down/up captured · mode locked")
    : practiceOn || practicePending || flow === "practice" ? (ko ? "따라 치기 · 원본 악보는 바뀌지 않음" : "Play along · the score stays unchanged")
    : entryMode === "notation" ? (ko ? "누른 타이밍은 기록되지 않음" : "Tap timing is not recorded")
    : (ko ? "패드를 길게 눌러 시작 · 예비박 설정 적용" : "Hold the pad to start · count-in setting applies");

  const settingsCalibration = <RhythmCalibrationPanel ko={ko} calibration={calibration} offset={offsetText} onOffset={editOffset}
    onReset={startCalibration} onStart={playCalibrationReference} onTap={calibrationTap} disabled={interactionLocked} />;
  return (
    <View style={s.workspace}>
    <ScrollView ref={workspaceScroll} testID="rhythm-workspace-scroll" style={[s.scroll, flow === "input" && { backgroundColor: "#fff" }]} contentContainerStyle={s.container} keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onLayout={(event) => { const height = event.nativeEvent.layout.height; setScrollViewport((prev) => prev.height === height ? prev : { ...prev, height }); }}
      onScroll={(event) => { const top = event.nativeEvent.contentOffset.y, height = event.nativeEvent.layoutMeasurement.height;
        setScrollViewport((prev) => prev.top === top && prev.height === height ? prev : { top, height }); }}>
      {(recovery.error || recoveryTarget) && <View testID="rhythm-recovery" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        {recovery.error && <><Text testID="rhythm-recovery-error" accessibilityLiveRegion="polite" style={{ color: C.accent, fontSize: 10 }}>
          {ko ? "임시 저장 실패 · 이 실행 중인 앱에는 복구 사본 유지" : "Recovery save failed · copy kept in this app session"}
        </Text><Pressable testID="rhythm-recovery-retry" accessibilityRole="button" onPress={recovery.retry} style={s.chip}>
          <Text style={{ color: C.accent, fontSize: 11 }}>{ko ? "재시도" : "Retry"}</Text>
        </Pressable></>}
        {recoveryTarget && <Pressable testID="rhythm-recovery-restore" accessibilityRole="button"
          disabled={interactionLocked} onPress={restorePrevious} style={[s.chip, { borderColor: C.border, opacity: interactionLocked ? 0.45 : 1 }]}>
          <Text numberOfLines={1} style={{ color: C.text, fontSize: 11 }}>{ko ? "이전 작업 복원" : "Restore previous work"} · {recoveryTarget.title} · {recoveryTarget.hits.length} {text.hit}</Text>
        </Pressable>}
        {recoverable.length > 1 && <Pressable testID="rhythm-recovery-next" accessibilityRole="button" disabled={interactionLocked}
          onPress={() => setRecoveryChoice(recoverable[(recoverable.findIndex((item) => item.id === recoveryTarget?.id) + 1) % recoverable.length].id)}
          style={[s.chip, { opacity: interactionLocked ? 0.45 : 1 }]}>
          <Text style={{ color: C.textSecondary, fontSize: 11 }}>{ko ? "다른 작업" : "Other work"} ({recoverable.findIndex((item) => item.id === recoveryTarget?.id) + 1}/{recoverable.length})</Text>
        </Pressable>}
      </View>}
      {flow !== "input" && <View style={s.flowRow}>{([["input", text.inputFlow], ["review", text.reviewFlow], ["practice", text.practiceFlow]] as const).map(([key, label]) => <Pressable key={key} testID={`rhythm-flow-${key}`} accessibilityRole="button" accessibilityState={{ selected: flow === key }} disabled={recording || recordPending || practiceOn || practicePending} onPress={() => changeFlow(key)} style={[s.flowChip, { borderColor: flow === key ? C.accent : C.border, backgroundColor: flow === key ? C.surfaceLight : "transparent", opacity: recording || recordPending || practiceOn || practicePending ? 0.45 : 1 }]}><Text style={{ color: flow === key ? C.accent : C.textSecondary, fontSize: 11 }}>{label}</Text></Pressable>)}</View>}
      <RhythmStaffControls layout={doc.staffLayout} ko={ko} onChange={(staffLayout) => setDoc((prev) => ({ ...prev, staffLayout }))} />
      {flow === "input" && <View testID="rhythm-input-stage" onLayout={(e) => { const y = e.nativeEvent.layout.y; setStageY((prev) => prev.input === y ? prev : { ...prev, input: y }); }}>
        <Text style={{ color: C.textSecondary, fontSize: 11, marginBottom: 5 }}>
          {recording || recordPending ? (ko ? "악보를 길게 눌러 입력 중지" : "Hold the score to finish") : (ko ? "악보 · 줄 번호를 눌러 마디 수 조정" : "Score · select a row number to adjust bars")}
        </Text>
        <View onLayout={(e) => { const y = e.nativeEvent.layout.y; setStaffY((prev) => prev.input === y ? prev : { ...prev, input: y }); }}>
        <RhythmHoldToStop enabled={recording || recordPending} onStop={finishRecord} minHeight={Math.max(0, scrollViewport.height - 35)}>
          <RhythmStaff events={interpretation.events} meter={doc.meter} selected={selected} symbols={doc.symbols} onSelect={selectEvent} onMovePreview={previewMove} onMoveCommit={commitMove} onMoveCancel={cancelMove}
            playheadQ={recording ? livePlayheadQ : playheadQ} layout={doc.staffLayout} onSelectRow={(start, count) => setRowSelection({ start, count })}
            readOnly={recording || recordPending} verticalViewport={staffViewport("input")}
            followPlayhead={recording} onFollowRow={(top) => {
              const y = stageY.input + staffY.input + top;
              if (y < scrollViewport.top || y + staffRowPixels(doc.staffLayout) > scrollViewport.top + scrollViewport.height) {
                workspaceScroll.current?.scrollTo({ y: Math.max(0, y - scrollViewport.height * 0.3), animated: false });
              }
            }} />
        </RhythmHoldToStop>
        </View>
      </View>}
      {flow === "review" && <View testID="rhythm-review-stage" onLayout={(event) => { const y = event.nativeEvent.layout.y; setStageY((prev) => prev.review === y ? prev : { ...prev, review: y }); }}>
        {(doc.notationVersion !== 2 || doc.automaticCorrection !== "pulse") && <View style={{ gap: 4, marginVertical: 4 }}>
          <Text style={{ color: C.textSecondary, fontSize: 11 }}>{ko ? "기존 기보 규칙으로 열었습니다. 원본과 수동 수정은 유지됩니다." : "Opened with legacy notation. Original input and manual edits are retained."}</Text>
          <Pressable testID="rhythm-upgrade-notation" accessibilityRole="button" disabled={interactionLocked}
            onPress={() => { rhythmRecovery.remember(docRef.current, true, true);
              setPreviousReader({ id: doc.id, notationVersion: doc.notationVersion, automaticCorrection: doc.automaticCorrection });
              setDoc((current) => ({ ...current, notationVersion: 2, automaticCorrection: "pulse", updatedAt: Date.now() })); }}
            style={[s.chip, { borderColor: C.border }]}>
            <Text style={{ color: C.text }}>{ko ? "작은 타이밍 흔들림을 정리해 재해석" : "Reinterpret with bounded timing correction"}</Text>
          </Pressable>
        </View>}
        {previousReader?.id === doc.id && doc.automaticCorrection === "pulse" && <Pressable
          testID="rhythm-restore-notation" accessibilityRole="button" disabled={interactionLocked}
          onPress={() => {
            setDoc((current) => ({ ...current, notationVersion: previousReader.notationVersion,
              automaticCorrection: previousReader.automaticCorrection, updatedAt: Date.now() }));
            setPreviousReader(null);
          }} style={[s.chip, { borderColor: C.border }]}>
          <Text style={{ color: C.text }}>{ko ? "이전 자동 해석으로 돌아가기 · 수동 수정 유지" : "Restore previous reader · keep manual edits"}</Text>
        </Pressable>}
        <View style={s.sectionHeader}>
          <View><Text style={[s.cardTitle, { color: C.text }]}>{text.provisional}</Text><Text style={[s.muted, { color: C.textSecondary }]}>{events.length} events · {doc.hits.length} raw hits</Text></View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", maxWidth: "100%", gap: 7 }}>
            <Pressable onPress={() => changeFlow("input")} style={[s.smallPrimary, { backgroundColor: C.surfaceLight }]}><Text style={{ color: C.text }}>{ko ? "입력으로 돌아가기" : "Back to input"}</Text></Pressable>
            <Pressable onPress={() => changeFlow("practice")} style={[s.smallPrimary, { backgroundColor: C.text }]}><Text style={{ color: C.background }}>{text.practice}</Text></Pressable>
            <Pressable testID="rhythm-settings-review" accessibilityRole="button" disabled={interactionLocked} onPress={openSettings} style={[s.smallPrimary, { backgroundColor: C.surfaceLight, opacity: interactionLocked ? 0.5 : 1 }]}><Ionicons name="options-outline" size={15} color={C.text} /><Text style={{ color: C.text }}>{ko ? "설정" : "Settings"}</Text></Pressable>
            <Pressable testID="rhythm-library-open-review" accessibilityRole="button" disabled={interactionLocked} onPress={openLibrary} style={[s.smallPrimary, { backgroundColor: C.surfaceLight, opacity: interactionLocked ? 0.5 : 1 }]}><Ionicons name="book-outline" size={15} color={C.text} /><Text style={{ color: C.text }}>{ko ? "연습장" : "Practice book"}</Text></Pressable>
            <Pressable onPress={save} style={[s.smallPrimary, { backgroundColor: C.accent }]} testID="rhythm-save"><Ionicons name="save-outline" size={15} color={C.background} /><Text style={{ color: C.background, fontFamily: "SpaceGrotesk_700Bold" }}>{ko ? "연습장에 저장" : "Save to practice book"}</Text></Pressable>
          </View>
        </View>
        <View onLayout={(event) => { const y = event.nativeEvent.layout.y; setStaffY((prev) => prev.review === y ? prev : { ...prev, review: y }); }}>
        <RhythmStaff events={displayEvents} meter={doc.meter} selected={selected} symbols={doc.symbols} onSelect={selectEvent} onMovePreview={playing ? () => {} : previewMove} onMoveCommit={playing ? () => {} : commitMove} onMoveCancel={cancelMove} playheadQ={playheadQ} layout={doc.staffLayout} onSelectRow={(start, count) => { if (!interactionLocked) setRowSelection({ start, count }); }} verticalViewport={staffViewport("review")} />
        </View>
        <View style={s.toolButtons} accessibilityLabel={ko ? "검토 도구" : "Review tools"}>
          {([
            ["validation", ko ? "검증 및 마디 검토" : "Validation & measures", "checkmark-done-outline"],
            ["edit", ko ? "기보 편집" : "Notation editor", "create-outline"],
            ["candidates", text.candidates, "git-compare-outline"],
            ["symbols", text.symbols, "shapes-outline"],
            ["calibration", text.calibrate, "timer-outline"],
          ] as const).map(([key, label, icon]) => <Pressable key={key} testID={`rhythm-tool-${key}`} accessibilityRole="button" accessibilityState={{ selected: reviewTool === key }} onPress={() => { setReviewTool((current) => current === key ? null : key); if (key === "candidates") setCandidateOpen(true); }} style={[s.toolbarButton, { borderColor: reviewTool === key ? C.accent : C.border, backgroundColor: reviewTool === key ? C.surfaceLight : C.surface }]}>
            <Ionicons name={icon} size={15} color={reviewTool === key ? C.accent : C.textSecondary} /><Text style={{ color: C.text, fontSize: 11 }}>{label}</Text>
          </Pressable>)}
        </View>
        {reviewTool === "validation" && <RhythmValidationPanel report={draftReport} language={ko ? "ko" : "en"} disabled={recording || recordPending || practiceOn || practicePending || playing}
          onReview={reviewRegion} onListen={listenRegion} onConfirm={confirmRegion}
          onAlternatives={(index) => { reviewRegion(index); setReviewTool("candidates"); setCandidateOpen(true); requestAnimationFrame(() => workspaceScroll.current?.scrollTo({ y: candidatePanelY.current, animated: true })); }}
          onEdit={(index) => { reviewRegion(index); setReviewTool("edit"); update(reopenDraftRegion(doc, index)); requestAnimationFrame(() => workspaceScroll.current?.scrollTo({ y: editPanelY.current, animated: true })); }} />}
        <View style={s.scrubber}>
          <Text style={[s.muted, { color: C.textSecondary }]}>{ko ? "정지 재생 위치 · 박" : "Stopped playhead · beat"}</Text>
          <Pressable onPress={() => setScrubPosition(String(Math.max(0, playheadQ - 0.25)))} style={s.step}><Text style={{ color: C.text }}>−</Text></Pressable>
          <TextInput value={scrubPosition} onChangeText={setScrubPosition} keyboardType="decimal-pad" style={[s.numInput, { color: C.text, borderColor: C.border }]} />
          <Pressable onPress={() => setScrubPosition(String(playheadQ + 0.25))} style={s.step}><Text style={{ color: C.text }}>+</Text></Pressable>
          <Pressable onPress={() => setScrubPosition("0")} style={[s.listenButton, { borderColor: C.border }]}><Text style={{ color: C.text }}>{ko ? "처음" : "Home"}</Text></Pressable>
        </View>
        <View accessibilityRole="adjustable" accessibilityLabel={ko ? "재생 위치" : "Playback position"} onLayout={(event) => { scrubTrackWidth.current = Math.max(1, event.nativeEvent.layout.width); }} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderGrant={(event) => scrubAt(event.nativeEvent.locationX)} onResponderMove={(event) => scrubAt(event.nativeEvent.locationX)} style={[s.scrubTrack, { backgroundColor: C.border }]}>
          <View style={[s.scrubFill, { width: `${Math.min(100, playheadQ / scrubMaxQ * 100)}%`, backgroundColor: C.accent }]} />
          <View style={[s.scrubThumb, { left: `${Math.min(100, playheadQ / scrubMaxQ * 100)}%`, backgroundColor: C.accent }]} />
        </View>
        {dragPreviewDocument && <Text style={[s.muted, { color: C.accent, marginBottom: 7 }]}>{ko ? "이동 미리보기 · 선택한 음표만 움직이고 주변 쉼표와 간격이 다시 계산됩니다." : "Move preview · this note moves alone; surrounding rests and gaps recalculate."}</Text>}
        <View style={s.listenRow}><Text style={[s.muted, { color: C.textSecondary }]}>{playing ? (ko ? "재생 중 입력 잠김" : "Input locked during playback") : text.listen}</Text><Pressable testID="rhythm-play-original" onPress={() => playing ? cleanupPlayback() : play("original")} style={[s.listenButton, { borderColor: C.border }]}><Ionicons name={playing ? "stop" : "play"} size={15} color={C.text} /><Text style={{ color: C.text }}>{text.original}</Text></Pressable><Pressable testID="rhythm-play-notation" onPress={() => playing ? cleanupPlayback() : play("notation")} style={[s.listenButton, { borderColor: C.border }]}><Ionicons name="musical-notes-outline" size={15} color={C.text} /><Text style={{ color: C.text }}>{text.notation}</Text></Pressable></View>
        {reviewTool === "edit" && <View onLayout={(event) => { editPanelY.current = event.nativeEvent.layout.y; }} pointerEvents={playing ? "none" : "auto"} style={[s.editBox, { borderColor: C.border, backgroundColor: C.surface }]}><Text style={[s.cardTitle, { color: C.text }]}>{text.selected}: {selected.length}</Text>
          <View style={s.setupHead}><Pressable testID="rhythm-insert-note" onPress={() => { try { update(insertNotationNote(doc, playheadQ, duration, mode === "keyboard" ? {} : { drum: mode === "drums" ? drum : "snare" })); } catch (error) { Alert.alert(text.error, error instanceof Error ? error.message : String(error)); } }} style={[s.listenButton, { borderColor: C.border }]}><Text style={{ color: C.text }}>{ko ? "음표 삽입" : "Insert note"}</Text></Pressable><Text style={[s.muted, { color: C.textSecondary }]}>{ko ? "빈 악보는 타격을 추가하지 않고 직접 작성할 수 있습니다." : "Write into an empty score without adding raw hits."}</Text></View>
          <View style={s.chipWrap}>{(["flam", "drag", "regular", "diddle", "accent"] as const).map((kind) => <Pressable key={kind} onPress={() => applyKind(kind)} style={[s.chip, { borderColor: C.border }]}><Text style={{ color: C.text }}>{text[kind]}</Text></Pressable>)}</View>
           {selectedEvents[0] && <><Text style={[s.muted, { color: C.textSecondary }]}>{text.onset} · {text.duration}</Text><View style={s.setupHead}><TextInput keyboardType="decimal-pad" value={manualStart} onChangeText={setManualStart} style={[s.numInput, { color: C.text, borderColor: C.border }]} /><TextInput keyboardType="decimal-pad" value={durationText} onChangeText={setDurationText} style={[s.numInput, { color: C.text, borderColor: C.border }]} /><Pressable onPress={applyEventForm} style={[s.smallPrimary, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{text.apply}</Text></Pressable><Pressable onPress={() => setSnapEdits((v) => !v)} style={[s.chip, { borderColor: snapEdits ? C.accent : C.border }]}><Text style={{ color: C.text }}>{snapEdits ? "Snap" : "Free"}</Text></Pressable><View style={s.chipWrap}>{DURS.map((v) => <Pressable key={v} onPress={() => { const d = 4 / v; setDuration(d); setDurationText(String(d)); editEvent(selectedEvents[0], toNumber(selectedEvents[0].startQ), d); }} style={[s.chip, { borderColor: Math.abs(duration - 4 / v) < 0.001 ? C.accent : C.border }]}><Text style={{ color: C.text }}>{v}</Text></Pressable>)}</View></View></>}
          <View style={s.setupHead}><Text style={[s.muted, { color: C.textSecondary }]}>{text.tuplet}</Text><TextInput value={tupletActual} placeholder={text.actual} placeholderTextColor={C.textTertiary} onChangeText={setTupletActual} keyboardType="number-pad" style={[s.numInput, { color: C.text, borderColor: C.border }]} /><Text style={{ color: C.text }}>:</Text><TextInput value={tupletNormal} placeholder={text.normal} placeholderTextColor={C.textTertiary} onChangeText={setTupletNormal} keyboardType="number-pad" style={[s.numInput, { color: C.text, borderColor: C.border }]} /><Pressable onPress={applyTupletNow} style={[s.smallPrimary, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{text.apply}</Text></Pressable></View>
          <View style={s.setupHead}><Text style={[s.muted, { color: C.textSecondary }]}>Parent</Text><Pressable onPress={() => setParentTupletId(undefined)} style={[s.chip, { borderColor: !parentTupletId ? C.accent : C.border }]}><Text style={{ color: C.text }}>None</Text></Pressable>{doc.tuplets.map((span) => <Pressable key={span.id} onPress={() => setParentTupletId(span.id)} style={[s.chip, { borderColor: parentTupletId === span.id ? C.accent : C.border }]}><Text style={{ color: C.text }}>{span.actual}:{span.normal}</Text></Pressable>)}</View>
          <View style={s.setupHead}><Pressable onPress={() => { try { update(insertRest(doc, playheadQ, duration)); } catch (error) { Alert.alert(text.error, error instanceof Error ? error.message : String(error)); } }} style={[s.listenButton, { borderColor: C.border }]}><Text style={{ color: C.text }}>+ {text.rest}</Text></Pressable><Text style={{ color: C.textSecondary, fontSize: 11 }}>{text.simplify} {Math.round(doc.simplification * 100)}%</Text></View>
          <View style={s.setupHead}><Text style={[s.muted, { color: C.textSecondary }]}>{text.simplify}</Text><View style={{ flex: 1 }} /><TextInput value={String(Math.round(doc.simplification * 100))} onChangeText={(v) => { const percent = Math.max(0, Math.min(100, Number(v) || 0)); update({ ...doc, simplification: percent / 100 }); }} keyboardType="number-pad" style={[s.numInput, { color: C.text, borderColor: C.border }]} /></View>
        </View>}
        {reviewTool === "candidates" && <View onLayout={(event) => { candidatePanelY.current = event.nativeEvent.layout.y; }} pointerEvents={playing ? "none" : "auto"} style={[s.editBox, { borderColor: C.border, backgroundColor: C.surface }]}>
          <View style={s.sectionHeader}><Text style={[s.cardTitle, { color: C.text }]}>{text.candidates}</Text><Pressable onPress={() => setCandidateOpen((v) => !v)}><Ionicons name={candidateOpen ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} /></Pressable></View>
          {candidateOpen && !visibleCandidates.length && <Text style={[s.muted, { color: C.textSecondary }]}>{ko ? "확정된 수정을 유지하면서 계산 검증을 통과하는 다른 후보가 없습니다." : "No alternative passes validation while preserving protected edits."}</Text>}
          {candidateOpen && visibleCandidates.map((candidate, index) => <Pressable key={candidate.id} onPress={() => selectCandidate(candidate)} style={[s.candidate, { borderColor: C.border }]}><Text style={{ color: C.text, flex: 1 }}>{ko ? `${candidate.measureIndex + 1}마디 · 온음표의 ${candidate.grid}분할 격자` : `Bar ${candidate.measureIndex + 1} · 1/${candidate.grid} whole-note grid`}</Text><Text style={{ color: C.accent, fontFamily: "SpaceGrotesk_700Bold" }}>{index === 0 ? (ko ? "추천" : "Suggested") : ""}</Text></Pressable>)}
        </View>}
        {reviewTool === "symbols" && <View pointerEvents={playing ? "none" : "auto"} style={[s.editBox, { borderColor: C.border, backgroundColor: C.surface }]}>
          <View style={s.sectionHeader}><Text style={[s.cardTitle, { color: C.text }]}>{text.symbols}</Text><Pressable onPress={() => setSymbolEditor((v) => !v)} style={[s.smallPrimary, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{text.newSymbol}</Text></Pressable></View>
          <Text style={[s.muted, { color: C.textSecondary }]}>{text.unsupported}</Text>
          {doc.symbols.map((symbol) => <View key={symbol.id} style={s.candidate}><Text style={{ color: C.text, flex: 1 }}>{symbol.name} · {symbol.role} / {symbol.meaning}{symbol.meaning === "annotation" ? " — annotation only" : ""}</Text><Pressable onPress={() => applySymbol(symbol)}><Text style={{ color: C.accent }}>{text.apply}</Text></Pressable></View>)}
          {symbolEditor && <RhythmSymbolEditor name={symbolName} description={symbolDescription} role={symbolRole} meaning={symbolMeaning} shapeType={shapeType} shapes={symbolShapes} selectedShapeId={selectedShapeId} colors={C} copy={{ name: text.newSymbol, description: text.description, shapes: text.shapes, role: text.role, meaning: text.meaning, save: text.save, removeShape: ko ? "도형 삭제" : "Remove shape" }} onName={setSymbolName} onDescription={setSymbolDescription} onRole={setSymbolRole} onMeaning={setSymbolMeaning} onShapeType={setShapeType} onSelectShape={setSelectedShapeId} onAddShape={addCustomShape} onUpdateShape={updateShape} onRemoveShape={(id) => { setSymbolShapes((prev) => prev.filter((shape) => shape.id !== id)); setSelectedShapeId(null); }} onSave={saveSymbol} />}
        </View>}
      </View>}
      {(flow === "review" || flow === "practice") && (flow === "practice" || reviewTool === "calibration") && <View style={[s.editBox, { borderColor: C.border, backgroundColor: C.surface }]}>
        <Pressable accessibilityRole="button" onPress={() => setCalibrationOpen((open) => !open)} style={s.sectionHeader}><Text style={[s.cardTitle, { color: C.text }]}>{text.calibrate}</Text><Ionicons name={calibrationOpen ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} /></Pressable>
        {calibrationOpen && !settingsOpen && <RhythmCalibrationPanel ko={ko} calibration={calibration} offset={offsetText} onOffset={editOffset}
          onReset={startCalibration} onStart={playCalibrationReference} onTap={calibrationTap} disabled={interactionLocked} />}
      </View>}
      {flow === "practice" && <View testID="rhythm-practice-stage" onLayout={(event) => { const y = event.nativeEvent.layout.y; setStageY((prev) => prev.practice === y ? prev : { ...prev, practice: y }); }}>
      <View style={s.practiceActions}>
        <Pressable testID="rhythm-settings-practice" accessibilityRole="button" disabled={interactionLocked} onPress={openSettings} style={[s.toolbarButton, { borderColor: C.border, opacity: interactionLocked ? 0.5 : 1 }]}><Ionicons name="options-outline" size={15} color={C.text} /><Text style={{ color: C.text }}>{ko ? "설정" : "Settings"}</Text></Pressable>
        <Pressable testID="rhythm-library-open-practice" accessibilityRole="button" disabled={interactionLocked} onPress={openLibrary} style={[s.toolbarButton, { borderColor: C.border, opacity: interactionLocked ? 0.5 : 1 }]}><Ionicons name="book-outline" size={15} color={C.accent} /><Text style={{ color: C.text }}>{ko ? "연습장" : "Practice book"}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => changeFlow("review")} style={[s.toolbarButton, { borderColor: C.border }]}><Text style={{ color: C.text }}>{ko ? "검토" : "Review"}</Text></Pressable>
      </View>
      <View onLayout={(event) => { const y = event.nativeEvent.layout.y; setStaffY((prev) => prev.practice === y ? prev : { ...prev, practice: y }); }}>
      <RhythmStaff events={events} meter={doc.meter} selected={[]} symbols={doc.symbols} onSelect={() => {}} onMovePreview={() => {}} onMoveCommit={() => {}} onMoveCancel={() => {}} playheadQ={playheadQ} layout={doc.staffLayout} verticalViewport={staffViewport("practice")} readOnly={practiceOn || practicePending} onSelectRow={(start, count) => setRowSelection({ start, count })} />
      </View>
      <View style={[s.editBox, { borderColor: C.border, backgroundColor: C.surface }]}>
        <View style={s.sectionHeader}><Text style={[s.cardTitle, { color: C.text }]}>{text.practice}</Text>{(["easy", "normal", "strict"] as const).map((value) => <Pressable key={value} disabled={practicePending || practiceOn} accessibilityRole="button" accessibilityState={{ selected: difficulty === value, disabled: practicePending || practiceOn }} onPress={() => setDifficulty(value)} style={[s.chip, { borderColor: difficulty === value ? C.accent : C.border, opacity: practicePending || practiceOn ? 0.5 : 1 }]}><Text style={{ color: C.text, fontSize: 10 }}>{value}</Text></Pressable>)}</View>
        <View style={s.setupHead}><Text style={[s.muted, { color: C.textSecondary }]}>{text.difficulty}</Text></View>
        {practiceResult && <Text style={[s.muted, { color: C.textSecondary }]}>Timing {practiceResult.timingScore} · coverage {practiceResult.coverageScore} · missed {practiceResult.missed} · extra {practiceResult.extra} · mean error {Math.round(practiceResult.meanErrorMs)} ms</Text>}
      </View>
      </View>}
    </ScrollView>
    {flow !== "review" && <RhythmInputDock compact={compactDock} toolbar={flow === "input" ? <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
          {(["capture", "notation"] as const).map((value) => <Pressable key={value} testID={`rhythm-entry-${value}`} accessibilityRole="button"
            accessibilityState={{ selected: entryMode === value }} disabled={interactionLocked}
            onPress={() => { clearHeldInput(); chooseEntryMode(value); }} style={[s.chip, { borderColor: entryMode === value ? C.accent : C.border, paddingHorizontal: 5, paddingVertical: 4 }]}>
            <Text style={{ fontSize: 10, color: entryMode === value ? C.accent : C.textSecondary }}>{value === "capture" ? (ko ? "탭 기록" : "Tap capture") : (ko ? "음표 직접 입력" : "Note entry")}</Text>
          </Pressable>)}
        </View>
        <Text style={[s.muted, { color: C.textSecondary }]}>{doc.bpm} BPM · {doc.meter.numerator}/{doc.meter.denominator}</Text>
      </View>
      <Pressable testID="rhythm-settings" accessibilityRole="button" accessibilityLabel={ko ? "설정 열기" : "Open settings"} disabled={interactionLocked} onPress={openSettings} style={[s.toolbarButton, { borderColor: C.border, paddingHorizontal: 6 }]}>
        <Ionicons name="options-outline" size={16} color={C.text} /><Text style={{ color: C.text, fontSize: 12 }}>{ko ? "설정" : "Settings"}</Text>
      </Pressable>
      <Pressable testID="rhythm-load" accessibilityRole="button" accessibilityLabel={ko ? "연습장 열기" : "Open practice book"} disabled={interactionLocked} onPress={openLibrary} style={[s.toolbarButton, { borderColor: C.border, paddingHorizontal: 6, marginLeft: 5 }]}>
        <Ionicons name="book-outline" size={16} color={C.accent} /><Text style={{ color: C.text, fontSize: 12 }}>{ko ? "연습장" : "Book"}</Text>
      </Pressable>
    </> : <Text style={{ color: C.accent }}>{text.practice}</Text>}>
      <View style={compactDock ? s.compactDockInfo : undefined}>
      <View style={s.dockModes}>
        <View style={s.modeRow}>{([["pad", text.pad], ["drums", text.drums], ["keyboard", text.keyboard]] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: mode === key, disabled: interactionLocked }} disabled={interactionLocked} onPress={() => { clearHeldInput(); setMode(key); }} style={[s.mode, compactDock && s.compactMode, { backgroundColor: mode === key ? C.accent : C.surface, opacity: interactionLocked ? 0.52 : 1 }]}><Text style={{ color: mode === key ? C.background : C.textSecondary, fontSize: compactDock ? 10 : 11, fontFamily: "SpaceGrotesk_700Bold" }}>{label}</Text></Pressable>)}
        {flow === "input" && (["review", "practice"] as const).map((next) => <Pressable key={next} testID={`rhythm-flow-${next}`} accessibilityRole="button" disabled={interactionLocked} onPress={() => changeFlow(next)} style={[s.mode, compactDock && s.compactMode, { backgroundColor: C.surface, opacity: interactionLocked ? 0.5 : 1 }]}><Text style={{ color: C.textSecondary, fontSize: compactDock ? 10 : 11 }}>{next === "review" ? text.reviewFlow : text.practiceFlow}</Text></Pressable>)}</View>
        {mode === "drums" && <View style={s.modeRow}>{(["snare", "kick", "hihat_closed"] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value} accessibilityState={{ selected: drum === value, disabled: recording || recordPending || practiceOn || practicePending }} disabled={recording || recordPending || practiceOn || practicePending} onPress={() => setDrum(value)} style={[s.chip, { borderColor: drum === value ? C.accent : C.border, opacity: recording || recordPending || practiceOn || practicePending ? 0.52 : 1 }]}><Text style={{ color: C.text, fontSize: 10 }}>{value}</Text></Pressable>)}</View>}
      </View>
      {flow === "input" ? (
      <View style={s.dockControls}>
        <Pressable testID="rhythm-record" accessibilityRole="button" disabled={!entryModeReady || recordRequest || playing} onPress={recording || recordPending ? finishRecord : beginRecord} style={[s.primaryButton, { backgroundColor: recording ? C.accent : C.text }]}>
          <Ionicons name={recording ? "stop" : recordPending ? "close" : "radio-button-on"} size={17} color={C.background} />
          <Text style={{ color: C.background, flexShrink: 1, fontSize: 12, fontFamily: "SpaceGrotesk_700Bold" }}>{recording || recordPending ? text.stop : entryMode === "notation" ? (ko ? "탭 기록으로 전환·녹음" : "Switch to tap capture & record") : text.start}</Text>
        </Pressable>
        <Text testID="rhythm-record-status" accessibilityLiveRegion="polite" accessibilityLabel={recording ? (ko ? "녹음 중" : "Recording") : recordPending ? (ko ? "예비박 진행 중" : "Count-in in progress") : (ko ? "정지" : "Stopped")} style={[s.muted, { color: C.textSecondary }]}>
          {recording ? (ko ? "녹음 중" : "Recording") : recordPending ? (ko ? "예비박" : "Count-in") : (ko ? "정지" : "Stopped")}
        </Text>
      </View>
      ) : (<>
      <Text style={[s.muted, { color: C.textSecondary, marginBottom: 8 }]}>
        {practicePending ? (ko ? "예비박" : "Count-in") : practiceOn ? (liveJudgment || text.practice) : (ko ? "원본 연주를 듣고 따라 연주하세요." : "Listen to the original take, then play along.")} {practiceOn ? ` · ${practiceTaps.length} / ${practiceExpectedRef.current.length}` : ""}
      </Text>
      <View style={s.dockControls}>
        <Pressable disabled={practicePending || practiceOn} onPress={beginPractice} style={[s.smallPrimary, { backgroundColor: C.accent, opacity: practicePending || practiceOn ? 0.5 : 1 }]}><Text style={{ color: C.background }}>{text.beginPractice}</Text></Pressable>
        {(practicePending || practiceOn) && <Pressable onPress={stopPractice} style={[s.smallPrimary, { backgroundColor: C.text }]}><Text style={{ color: C.background }}>{text.endPractice}</Text></Pressable>}
        {practiceResult && <Text style={{ color: C.accent, fontFamily: "SpaceGrotesk_700Bold" }}>{text.result}: {practiceResult.score}</Text>}
      </View>
      </>)}
      </View>
      <View style={[s.padRow, compactDock && s.compactDockSurface, Platform.OS === "web" ? ({ touchAction: "none", overscrollBehavior: "contain" } as any) : null]}>
        <RhythmEntryGuidance message={entryModeError ? `${entryGuidance} · ${ko ? "모드 환경설정 오류 · 다시 선택해 재시도" : "Mode preference error · select again to retry"}` : entryGuidance}
          ko={ko} compact={compactDock} stacked width={Math.min(180, Math.max(100, windowWidth - 464))} manual={entryMode === "notation" && flow === "input"} duration={duration}
          onDuration={(value) => { setDuration(value); setDurationText(String(value)); }}
          disabled={interactionLocked || !entryModeReady} hint={false} />
        <View style={{ flex: compactDock ? 1 : undefined, width: "100%", minWidth: 0, alignItems: "center" }}>
        {mode === "keyboard" ? <RhythmKeyboard key={inputEpoch} disabled={inputLocked} onDown={(midi) => addHit(`key_${midi}`, "down", midi)} onUp={(midi) => addHit(`key_${midi}`, "up", midi)} /> :
          <RhythmInputSurface key={inputEpoch} disabled={inputLocked} label={text.press} testID="rhythm-pad" onDown={tapPad} onUp={() => addHit("pad", "up")} style={[s.bigPad, windowHeight < 650 && { height: 100 }, compactDock && s.compactPad, { backgroundColor: mode === "drums" && drum === "kick" ? "#b6a77b" : C.accent }]}><View style={s.padMark} /><Text style={s.padLabel}>{text.press.toUpperCase()}</Text></RhythmInputSurface>}
        {flow === "input" && entryMode === "capture" && !recording && !recordPending && <Pressable
          testID="rhythm-activate-pad" accessibilityRole="button" accessibilityLabel={ko ? "길게 눌러 입력 시작" : "Hold to start recording"}
          disabled={!active || !entryModeReady || playing || recordRequest} delayLongPress={550} onLongPress={beginRecord}
          style={[StyleSheet.absoluteFill, { backgroundColor: C.accent, borderRadius: 22, justifyContent: "center", alignItems: "center", gap: 6 }]}>
          <Ionicons name="radio-button-on-outline" size={30} color={C.background} />
          <Text style={{ color: C.background, fontSize: 14, fontFamily: "SpaceGrotesk_700Bold" }}>{ko ? "길게 눌러 입력 시작" : "HOLD TO START"}</Text>
          <Text style={{ color: C.background, fontSize: 11 }}>{countIn ? (ko ? "예비박 후 기록" : "Record after count-in") : (ko ? "즉시 기록" : "Record immediately")}</Text>
        </Pressable>}
        </View>
      </View>
    </RhythmInputDock>}
    <Modal transparent visible={settingsOpen} animationType="slide" onRequestClose={closeSettings}>
      <View style={s.modalBackdrop}>
        <View testID="rhythm-settings-modal" accessibilityViewIsModal style={[s.modalCard, { height: "88%", minHeight: 0, backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[s.modalEyebrow, { color: C.accent }]}>{ko ? "연주 준비" : "TAKE SETUP"}</Text>
              <Text style={[s.modalTitle, { color: C.text }]}>{ko ? "설정" : "Settings"}</Text>
            </View>
            <Pressable testID="rhythm-settings-close" accessibilityRole="button" accessibilityLabel={ko ? "설정 닫기" : "Close settings"} onPress={closeSettings} style={[s.closeButton, { borderColor: C.border }]}>
              <Ionicons name="close" size={20} color={C.text} />
            </Pressable>
          </View>
          {windowHeight >= 540 && <View testID="rhythm-calibration-fixed" style={{ flexShrink: 0, marginBottom: 10 }}>{settingsCalibration}</View>}
          <ScrollView testID="rhythm-settings-scroll" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator
            style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 12 }}>
            {windowHeight < 540 && settingsCalibration}
            <Text style={[s.modalLabel, { color: C.textSecondary }]}>{text.title}</Text>
            <TextInput testID="rhythm-title-input" value={doc.title} onChangeText={(title) => setDoc((prev) => ({ ...prev, title }))} accessibilityLabel={text.title} returnKeyType="done" style={[s.modalTextInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]} />
            <View style={s.modalSettingRow}>
              <View style={s.settingCopy}><Text style={[s.modalLabel, { color: C.text }]}>{text.bpm}</Text><Text style={[s.muted, { color: C.textSecondary }]}>{ko ? "분당 박 수" : "Beats per minute"}</Text></View>
              <TextInput testID="rhythm-bpm-input" accessibilityLabel={text.bpm} value={String(doc.bpm)} onChangeText={changeBpm} keyboardType="number-pad" style={[s.numInput, s.settingNumber, { color: C.text, borderColor: C.border, backgroundColor: C.background }]} />
            </View>
            <View style={s.modalSettingRow}>
              <View style={s.settingCopy}><Text style={[s.modalLabel, { color: C.text }]}>{text.meter}</Text><Text style={[s.muted, { color: C.textSecondary }]}>{ko ? "분자 · 분모" : "Numerator · denominator"}</Text></View>
              <View style={s.meterControl}>
                <Pressable testID="rhythm-meter-decrease" accessibilityRole="button" accessibilityLabel={ko ? "박자 분자 줄이기" : "Decrease meter numerator"} onPress={() => setDoc((prev) => ({ ...prev, meter: { ...prev.meter, numerator: prev.meter.numerator <= 2 ? 7 : prev.meter.numerator - 1 } }))} style={[s.step, { backgroundColor: C.background }]}><Text style={{ color: C.text }}>−</Text></Pressable>
                <Pressable testID="rhythm-meter-denominator" accessibilityRole="button" accessibilityLabel={ko ? "박자 분모 변경" : "Change meter denominator"} onPress={() => setDoc((prev) => ({ ...prev, meter: { ...prev.meter, denominator: prev.meter.denominator === 2 ? 4 : prev.meter.denominator === 4 ? 8 : 2 } }))} style={s.meterValue}><Text style={{ color: C.text, fontFamily: "SpaceGrotesk_700Bold" }}>{doc.meter.numerator}/{doc.meter.denominator}</Text></Pressable>
                <Pressable testID="rhythm-meter-increase" accessibilityRole="button" accessibilityLabel={ko ? "박자 분자 늘리기" : "Increase meter numerator"} onPress={() => setDoc((prev) => ({ ...prev, meter: { ...prev.meter, numerator: prev.meter.numerator >= 7 ? 2 : prev.meter.numerator + 1 } }))} style={[s.step, { backgroundColor: C.background }]}><Text style={{ color: C.text }}>+</Text></Pressable>
              </View>
            </View>
            <View style={s.modalSettingRow}>
              <View style={s.settingCopy}><Text style={[s.modalLabel, { color: C.text }]}>{text.countIn}</Text><Text style={[s.muted, { color: C.textSecondary }]}>{ko ? "시작 전 한 마디" : "One bar before starting"}</Text></View>
              <Switch testID="rhythm-count-in" accessibilityLabel={text.countIn} value={countIn} onValueChange={setCountIn} trackColor={{ true: C.accent }} />
            </View>
            <View style={s.modalSettingRow}>
              <View style={s.settingCopy}><Text style={[s.modalLabel, { color: C.text }]}>{text.bars}</Text><Text style={[s.muted, { color: C.textSecondary }]}>{ko ? "0은 제한 없음" : "0 means no limit"}</Text></View>
              <TextInput testID="rhythm-bar-limit" accessibilityLabel={text.bars} value={barLimit} onChangeText={setBarLimit} keyboardType="number-pad" placeholder="0" placeholderTextColor={C.textTertiary} style={[s.numInput, s.settingNumber, { color: C.text, borderColor: C.border, backgroundColor: C.background }]} />
            </View>
            <View style={[s.modalDivider, { backgroundColor: C.border }]} />
            <View style={s.modalSettingRow}>
              <Text style={{ color: C.text }}>{ko ? "기본 줄당 마디 수" : "Default bars per row"}</Text>
              <View style={s.meterControl}>
                <Pressable testID="rhythm-bars-per-row-less" accessibilityRole="button" accessibilityLabel={ko ? "줄당 마디 수 줄이기" : "Fewer bars per row"} onPress={() => setDoc((prev) => ({ ...prev, staffLayout: { ...prev.staffLayout, barsPerRow: Math.max(1, (prev.staffLayout?.barsPerRow ?? 2) - 1), rowOverrides: [] } }))} style={s.step}><Text style={{ color: C.text }}>−</Text></Pressable>
                <Text testID="rhythm-bars-per-row" style={{ color: C.text }}>{doc.staffLayout?.barsPerRow ?? 2}</Text>
                <Pressable testID="rhythm-bars-per-row-more" accessibilityRole="button" accessibilityLabel={ko ? "줄당 마디 수 늘리기" : "More bars per row"} onPress={() => setDoc((prev) => ({ ...prev, staffLayout: { ...prev.staffLayout, barsPerRow: Math.min(16, (prev.staffLayout?.barsPerRow ?? 2) + 1), rowOverrides: [] } }))} style={s.step}><Text style={{ color: C.text }}>+</Text></Pressable>
              </View>
            </View>
            <Text style={{ color: C.textSecondary, fontSize: 10, marginVertical: 6 }}>{ko ? "기본값을 바꾸면 개별 줄 설정도 초기화됩니다. 악보의 줄 번호로 특정 줄만 조정할 수 있습니다." : "Changing the default resets individual rows. Select a row number on the score to adjust only that row."}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal transparent visible={rowSelection !== null} animationType="fade" onRequestClose={() => setRowSelection(null)}>
      <View style={s.modalBackdrop}><View testID="rhythm-row-modal" style={[s.modalCard, { backgroundColor: C.surface, borderColor: C.border, padding: 16 }]}>
        <Text style={{ color: C.text, fontSize: 16 }}>{ko ? "선택한 줄의 마디 수" : "Bars in selected row"} · {rowSelection ? rowSelection.start + 1 : ""}</Text>
        <Text style={{ color: C.textSecondary, fontSize: 11, marginVertical: 10 }}>{ko ? "뒤쪽은 기본 마디 수로 다시 배치합니다." : "Following rows reflow with the default count."}</Text>
        <View style={s.chipWrap}>{Array.from({ length: 16 }, (_, i) => i + 1).map((count) => <Pressable key={count} testID={`rhythm-row-count-${count}`} accessibilityRole="button"
          onPress={() => { if (rowSelection && !interactionLocked) setDoc((prev) => ({ ...prev, staffLayout: changeStaffRow(prev.staffLayout, rowSelection.start, count) })); setRowSelection(null); }}
          style={[s.chip, { borderColor: count === rowSelection?.count ? C.accent : C.border }]}><Text style={{ color: C.text }}>{count}</Text></Pressable>)}</View>
        <View style={s.modalActions}>
          <Pressable testID="rhythm-row-reset" accessibilityRole="button" onPress={() => { if (rowSelection && !interactionLocked) setDoc((prev) => ({ ...prev, staffLayout: changeStaffRow(prev.staffLayout, rowSelection.start) })); setRowSelection(null); }} style={s.chip}><Text style={{ color: C.accent }}>{ko ? "기본값으로" : "Use default"}</Text></Pressable>
          <Pressable testID="rhythm-row-close" accessibilityRole="button" onPress={() => setRowSelection(null)} style={s.chip}><Text style={{ color: C.text }}>{ko ? "닫기" : "Close"}</Text></Pressable>
        </View>
      </View></View>
    </Modal>
    <Modal transparent visible={libraryOpen} animationType="slide" onRequestClose={() => setLibraryOpen(false)}>
      <View style={s.modalBackdrop}>
        <View testID="rhythm-library-modal" accessibilityViewIsModal style={[s.modalCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[s.modalEyebrow, { color: C.accent }]}>{ko ? "저장한 연주" : "YOUR TAKES"}</Text>
              <Text style={[s.modalTitle, { color: C.text }]}>{text.library}</Text>
            </View>
            <Pressable testID="rhythm-library-refresh" accessibilityRole="button" accessibilityLabel={ko ? "저장 기록 새로고침" : "Refresh saved takes"} onPress={() => void loadLibrary()} style={[s.closeButton, { borderColor: C.border }]}><Ionicons name="refresh" size={19} color={C.accent} /></Pressable>
            <Pressable testID="rhythm-library-close" accessibilityRole="button" accessibilityLabel={ko ? "연습장 닫기" : "Close practice book"} onPress={() => setLibraryOpen(false)} style={[s.closeButton, { borderColor: C.border }]}><Ionicons name="close" size={20} color={C.text} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            {libraryLoading && <View testID="rhythm-library-loading" style={s.skeletonGroup}><View style={[s.skeletonLine, { backgroundColor: C.surfaceLight }]} /><View style={[s.skeletonLine, { backgroundColor: C.surfaceLight, width: "72%" }]} /></View>}
            {!!loadError && <View style={[s.libraryError, { borderColor: C.border, backgroundColor: C.background }]}><Text style={{ color: C.textSecondary, flex: 1 }}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => void loadLibrary()} style={[s.smallPrimary, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{ko ? "다시 시도" : "Retry"}</Text></Pressable></View>}
            {!libraryLoading && !loadError && !saved.length && <View style={[s.libraryEmpty, { borderColor: C.border, backgroundColor: C.background }]}><Ionicons name="book-outline" size={25} color={C.accent} /><Text style={[s.cardTitle, { color: C.text }]}>{text.noDoc}</Text><Text style={[s.muted, { color: C.textSecondary, textAlign: "center" }]}>{ko ? "검토 화면에서 저장하면 여기에 나타납니다." : "Save a take from review and it will appear here."}</Text></View>}
            {saved.map((item) => <View key={item.id} testID={`rhythm-saved-${item.id}`} style={[s.savedRow, { borderBottomColor: C.border }]}>
              <View style={s.savedInfo}><Text numberOfLines={1} style={[s.savedTitle, { color: C.text }]}>{item.title || text.title}</Text><Text style={[s.muted, { color: C.textSecondary }]}>{item.bpm} BPM · {item.meter.numerator}/{item.meter.denominator} · {item.hits.length} {text.hit}{item.hits.length === 1 ? "" : "s"}</Text></View>
              <Pressable testID={`rhythm-saved-open-${item.id}`} accessibilityRole="button" accessibilityLabel={`${text.open}: ${item.title}`} disabled={interactionLocked} onPress={() => openSaved(item)} style={[s.libraryIconButton, { backgroundColor: C.background, opacity: interactionLocked ? 0.45 : 1 }]}><Ionicons name="folder-open-outline" color={C.accent} size={19} /></Pressable>
              <Pressable testID={`rhythm-saved-delete-${item.id}`} accessibilityRole="button" accessibilityLabel={`${text.delete}: ${item.title}`} disabled={interactionLocked} onPress={() => Alert.alert(text.delete, item.title, [{ text: ko ? "취소" : "Cancel", style: "cancel" }, { text: text.delete, style: "destructive", onPress: () => void removeSaved(item.id) }])} style={[s.libraryIconButton, { backgroundColor: C.background, opacity: interactionLocked ? 0.45 : 1 }]}><Ionicons name="trash-outline" color={C.textSecondary} size={18} /></Pressable>
            </View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  workspace: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  container: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 4 },
  kicker: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, marginTop: 10, letterSpacing: -0.5 },
  intro: { fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  flowRow: { flexDirection: "row", gap: 7, marginBottom: 8 },
  inputToolbar: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 },
  compactInputToolbar: { minHeight: 40, marginBottom: 2, gap: 5 },
  stageTitle: { fontSize: 14, fontFamily: "SpaceGrotesk_700Bold" },
  toolbarButton: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 9, borderWidth: 1, borderRadius: 9 },
  scoreCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingTop: 1, marginTop: 4, marginBottom: 8 },
  compactScoreCard: { flex: 1, minWidth: 0, marginTop: 2, marginBottom: 2, paddingHorizontal: 5 },
  captureLandscape: { flexDirection: "row", alignItems: "center", gap: 8 },
  landscapeFeedback: { width: 240 },
  compactSectionHeader: { marginTop: 2, marginBottom: 2 },
  inputEmpty: { minHeight: 65, borderWidth: 1, borderStyle: "dashed", borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 5, marginTop: 4 },
  toolButtons: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 8 },
  dockModes: { gap: 1 },
  practiceActions: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 },
  flowChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  setup: { borderRadius: 15, borderWidth: 1, padding: 12, marginBottom: 16 },
  setupHead: { flexDirection: "row", alignItems: "center", gap: 7, marginVertical: 4, flexWrap: "wrap" },
  cardTitle: { fontSize: 14, fontFamily: "SpaceGrotesk_700Bold" },
  numInput: { minWidth: 42, height: 34, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, textAlign: "center" },
  step: { width: 25, height: 28, justifyContent: "center", alignItems: "center", borderRadius: 6, backgroundColor: "rgba(128,128,128,0.15)" },
  muted: { fontSize: 11 },
  titleInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  modeRow: { flexDirection: "row", gap: 5, alignItems: "center", marginTop: 3, flexWrap: "wrap" },
  mode: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 },
  compactMode: { paddingHorizontal: 6, paddingVertical: 4 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  recordRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  primaryButton: { minHeight: 34, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9 },
  padRow: { marginTop: 5, alignItems: "center" },
  dock: { flexShrink: 0, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth },
  compactDock: { height: 126, flexDirection: "row", alignItems: "center", gap: 8 },
  compactDockInfo: { width: 240, flexShrink: 0 },
  compactDockSurface: { flex: 1, minWidth: 0, marginTop: 0 },
  compactPad: { height: 80, width: "100%" },
  dockControls: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  bigPad: { width: "100%", height: 155, borderRadius: 24, alignItems: "center", justifyContent: "center", elevation: 3, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6 },
  padMark: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: "rgba(20,20,20,0.4)", marginBottom: 7 },
  padLabel: { fontSize: 9, letterSpacing: 1.4, color: "#1B1B1B", fontFamily: "SpaceGrotesk_700Bold" },
  keys: { flexDirection: "row", alignItems: "flex-end", height: 120 },
  key: { width: 34, borderWidth: 1, borderColor: "#333", borderBottomLeftRadius: 4, borderBottomRightRadius: 4, alignItems: "center", justifyContent: "flex-end", paddingBottom: 7 },
  practiceLive: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  smallPrimary: { flexDirection: "row", gap: 5, alignItems: "center", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8 },
  sectionHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginTop: 9, marginBottom: 8, gap: 8 },
  scrubber: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 7 }, listenRow: { flexDirection: "row", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 10 },
  scrubTrack: { height: 6, borderRadius: 4, marginBottom: 12, position: "relative" },
  scrubFill: { height: 6, borderRadius: 4 },
  scrubThumb: { width: 16, height: 16, borderRadius: 8, position: "absolute", top: -5, marginLeft: -8 },
  listenButton: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8 },
  editBox: { borderWidth: 1, borderRadius: 13, padding: 12, marginBottom: 10 },
  chipWrap: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginVertical: 6 },
  candidate: { flexDirection: "row", gap: 8, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  modalBackdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 14, backgroundColor: "rgba(10,14,17,0.58)" },
  modalCard: { width: "100%", maxWidth: 560, maxHeight: "88%", borderWidth: 1, borderRadius: 17, padding: 16, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  modalEyebrow: { fontSize: 9, letterSpacing: 1.4, fontFamily: "SpaceGrotesk_700Bold" },
  modalTitle: { fontSize: 20, fontFamily: "SpaceGrotesk_700Bold" },
  closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 10 },
  modalLabel: { fontSize: 12, fontFamily: "SpaceGrotesk_700Bold" },
  modalTextInput: { minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, marginTop: 5, marginBottom: 8 },
  modalSettingRow: { minHeight: 53, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(128,128,128,0.2)" },
  settingCopy: { flex: 1, minWidth: 0, gap: 2 },
  settingNumber: { minWidth: 64 },
  meterControl: { flexDirection: "row", alignItems: "center", gap: 8 },
  meterValue: { minWidth: 52, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  modalDivider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  calibrationHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, marginTop: 9, marginBottom: 8 },
  skeletonGroup: { gap: 9, paddingVertical: 12 },
  skeletonLine: { height: 13, width: "92%", borderRadius: 7, opacity: 0.65 },
  libraryError: { minHeight: 52, borderWidth: 1, borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  libraryEmpty: { minHeight: 150, borderWidth: 1, borderStyle: "dashed", borderRadius: 13, alignItems: "center", justifyContent: "center", padding: 18, gap: 8, marginTop: 8 },
  savedRow: { minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  savedInfo: { flex: 1, minWidth: 0, gap: 3 },
  savedTitle: { fontSize: 13, fontFamily: "SpaceGrotesk_700Bold" },
  libraryIconButton: { width: 37, height: 37, alignItems: "center", justifyContent: "center", borderRadius: 9 },
});

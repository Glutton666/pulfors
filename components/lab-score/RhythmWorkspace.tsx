import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Alert } from "@/lib/alert";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Difficulty, Hit, InterpretationCandidate, NotationEvent, PlaybackHit, RhythmDocument, Shape, SymbolMeaning, SymbolRole, UserSymbol } from "@/lib/rhythm-lab/types";
import { applyInterpretation, applyTuplet, buildRhythmPlayback, chooseCandidate, createRhythmDocument, insertRest, insertNotationNote, interpretRhythm, moveNotationEvent, setEventDuration, toNumber } from "@/lib/rhythm-lab/engine";
import { deleteRhythmDocument, listRhythmDocuments, saveRhythmDocument } from "@/lib/rhythm-lab/storage";
import { calibrateOffset, evaluatePractice } from "@/lib/rhythm-lab/practice";
import { createScoreClickSession, playChord, previewScoreDrum, stopPreviewNote } from "@/lib/score-audio";
import { createRhythmAudioSession } from "@/lib/rhythm-lab/audio";
import { RhythmStaff } from "./RhythmStaff";
import { RhythmSymbolEditor } from "./RhythmSymbolEditor";
import { RhythmInputSurface } from "./RhythmInputSurface";
import { RhythmKeyboard } from "./RhythmKeyboard";

type InputMode = "pad" | "drums" | "keyboard";
const DURS = [1, 2, 4, 8, 16, 24, 32, 64];
const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const clockNow = () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

export function RhythmWorkspace({ active = true }: { active?: boolean }) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const ko = language === "ko";
  const text = ko
    ? { headline: "연주를 먼저, 표기는 나중에.", intro: "원래 타격 시각은 보존됩니다. 해석은 초안이며 언제든 수정할 수 있습니다.", bpm: "템포", meter: "박자", countIn: "예비박", bars: "마디 제한", start: "녹음 시작", stop: "마침", pad: "패드", drums: "드럼", keyboard: "건반", press: "누르고 떼어 연주", provisional: "임시 기보", listen: "듣기", original: "원본 입력", notation: "기보 비교", save: "기록 저장", library: "저장 기록", candidates: "다른 해석", simplify: "정리 정도", selected: "선택된 타격", flam: "플램", drag: "드래그", regular: "일반", diddle: "더블", accent: "악센트", confirm: "확정", rest: "쉼표 추가", duration: "길이", onset: "시작 박", tuplet: "연음", actual: "실제", normal: "표기", apply: "적용", symbols: "사용자 기호", newSymbol: "기호 만들기", shapes: "도형 추가", meaning: "의미", role: "역할", description: "설명", unsupported: "미지원 의미는 주석으로만 표시됩니다.", practice: "따라 치기", calibrate: "타이밍 보정", taps: "탭", manual: "수동 오프셋 ms", beginPractice: "연습 시작", endPractice: "연습 종료", result: "종합 점수", difficulty: "난이도", empty: "아직 연주가 없습니다. 설정 후 패드를 눌러 기록하세요.", title: "제목", open: "열기", delete: "삭제", error: "오류", noDoc: "저장된 리듬이 없습니다.", hit: "타격", values: "음가", inputFlow: "입력", reviewFlow: "검토", practiceFlow: "연습" }
    : { headline: "Play it first. Notate it later.", intro: "Raw hit times stay intact. Interpretation is a draft, ready for your ear and hand.", bpm: "Tempo", meter: "Meter", countIn: "Count-in", bars: "Bar limit", start: "Start recording", stop: "Finish", pad: "Pad", drums: "Drums", keyboard: "Keys", press: "Press and release to play", provisional: "Live draft", listen: "Listen", original: "Original take", notation: "Notation pass", save: "Save take", library: "Saved takes", candidates: "Alternate readings", simplify: "Simplify", selected: "Selected hits", flam: "Flam", drag: "Drag", regular: "Regular", diddle: "Diddle", accent: "Accent", confirm: "Confirm", rest: "Insert rest", duration: "Duration", onset: "Start beat", tuplet: "Tuplet", actual: "Actual", normal: "Normal", apply: "Apply", symbols: "Personal symbols", newSymbol: "Build symbol", shapes: "Add shape", meaning: "Meaning", role: "Role", description: "Description", unsupported: "Unsupported meanings stay annotations.", practice: "Practice", calibrate: "Timing calibration", taps: "Taps", manual: "Manual offset ms", beginPractice: "Start practice", endPractice: "Finish practice", result: "Overall score", difficulty: "Difficulty", empty: "No performance yet. Set the pulse, then play the pad.", title: "Title", open: "Open", delete: "Delete", error: "Error", noDoc: "No saved rhythm documents.", hit: "hit", values: "Values", inputFlow: "Input", reviewFlow: "Review", practiceFlow: "Practice" };
  const [doc, setDoc] = useState<RhythmDocument>(() => createRhythmDocument({ title: ko ? "새 리듬" : "New rhythm", bpm: 92, meter: { numerator: 4, denominator: 4 } }));
  const [recording, setRecording] = useState(false);
  const [recordPending, setRecordPending] = useState(false);
  const [mode, setMode] = useState<InputMode>("pad");
  const [drum, setDrum] = useState<NonNullable<Hit["drum"]>>("snare");
  const [countIn, setCountIn] = useState(true);
  const [barLimit, setBarLimit] = useState("0");
  const [flow, setFlow] = useState<"input" | "review" | "practice">("input");
  const [selected, setSelected] = useState<string[]>([]);
  const [duration, setDuration] = useState(0.25);
  const [durationText, setDurationText] = useState("0.25");
  const [manualStart, setManualStart] = useState("0");
  const [scrubPosition, setScrubPosition] = useState("0");
  const [tupletActual, setTupletActual] = useState("3");
  const [tupletNormal, setTupletNormal] = useState("2");
  const [parentTupletId, setParentTupletId] = useState<string | undefined>();
  const [candidateOpen, setCandidateOpen] = useState(true);
  const [saved, setSaved] = useState<RhythmDocument[]>([]);
  const [loadError, setLoadError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [dragPreviewDocument, setDragPreviewDocument] = useState<RhythmDocument | null>(null);
  const [symbolName, setSymbolName] = useState("");
  const [symbolDescription, setSymbolDescription] = useState("");
  const [symbolRole, setSymbolRole] = useState<SymbolRole>("rhythm");
  const [symbolMeaning, setSymbolMeaning] = useState<SymbolMeaning>("flam");
  const [shapeType, setShapeType] = useState<Shape["type"]>("ellipse");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [symbolShapes, setSymbolShapes] = useState<Shape[]>([]);
  const [symbolEditor, setSymbolEditor] = useState(false);
  const [calTaps, setCalTaps] = useState<number[]>([]);
  const [offsetText, setOffsetText] = useState("0");
  const calibrationStart = useRef(0);
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
  const recordTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const practiceTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const calibrationTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recordMetro = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioSession = useRef<ReturnType<typeof createRhythmAudioSession> | null>(null);
  const clickSession = useRef<ReturnType<typeof createScoreClickSession> | null>(null);
  if (!clickSession.current) clickSession.current = createScoreClickSession();
  const activeMidi = useRef<number[]>([]);
  const scrubTrackWidth = useRef(1);
  if (!audioSession.current) audioSession.current = createRhythmAudioSession();
  const interpretation = useMemo(() => interpretRhythm(doc), [doc]);
  const events = interpretation.events;
  const displayEvents = useMemo(() => dragPreviewDocument ? interpretRhythm(dragPreviewDocument).events : events, [dragPreviewDocument, events]);
  const playheadQ = Math.max(0, Number(scrubPosition) || 0);
  const scrubMaxQ = Math.max(doc.meter.numerator * 4 / doc.meter.denominator, ...events.map((event) => toNumber(event.startQ) + toNumber(event.durationQ)));
  const selectedEvents = events.filter((event) => selected.includes(event.id) || event.hitIds.some((id) => selected.includes(id)));
  const selectedHitIds = [...new Set([...selectedEvents.flatMap((event) => [...event.hitIds, ...(event.graceHitIds ?? [])]), ...selected.filter((id) => doc.hits.some((hit) => hit.id === id))])];
  const cleanupPlayback = () => { audioSession.current?.stop(); stopPreviewNote(); setPlaying(false); };
  const cleanupRecording = () => { recordTimers.current.forEach(clearTimeout); recordTimers.current = []; if (recordMetro.current) clearInterval(recordMetro.current); recordMetro.current = null; clickSession.current?.stop(); };
  const cleanupPractice = () => { practiceTimers.current.forEach(clearTimeout); practiceTimers.current = []; audioSession.current?.stop(); clickSession.current?.stop(); setPracticeOn(false); setPracticePending(false); stopPreviewNote(); };
  const cleanupAll = () => { cleanupPlayback(); cleanupRecording(); cleanupPractice(); calibrationTimers.current.forEach(clearTimeout); calibrationTimers.current = []; };
  const cleanupAllRef = useRef(cleanupAll);
  cleanupAllRef.current = cleanupAll;
  useEffect(() => () => cleanupAllRef.current(), []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") { cleanupAllRef.current(); setRecording(false); setRecordPending(false); }
    });
    return () => subscription.remove();
  }, []);
  const update = (next: RhythmDocument) => setDoc({ ...next, updatedAt: Date.now() });
  const startFreshTake = () => {
    cleanupRecording(); cleanupPlayback();
    setSelected([]); setFlow("input"); setPracticeResult(null); setDoc((prev) => ({ ...prev, hits: [], overrides: [], manualEvents: undefined, tuplets: [] }));
    releaseRef.current = {};
    setRecordPending(true);
    const beatMs = 60000 / doc.bpm * 4 / doc.meter.denominator;
    const count = countIn ? Math.max(1, doc.meter.numerator) : 0;
    const delay = count * beatMs;
    if (countIn) for (let i = 0; i < count; i++) recordTimers.current.push(setTimeout(() => clickSession.current?.play(), i * beatMs));
    recordTimers.current.push(setTimeout(() => {
      startRef.current = clockNow(); setRecordPending(false); setRecording(true); clickSession.current?.play();
      recordMetro.current = setInterval(() => clickSession.current?.play(), beatMs);
      const limit = Number(barLimit);
      if (limit > 0) recordTimers.current.push(setTimeout(finishRecord, limit * doc.meter.numerator * beatMs));
    }, delay));
  };
  const beginRecord = () => {
    if (recording || recordPending || practiceOn || practicePending) return;
    const hasWork = !!(doc.hits.length || doc.overrides.length || doc.manualEvents?.length || doc.tuplets.length);
    if (!hasWork) { startFreshTake(); return; }
    Alert.alert(ko ? "새 녹음" : "Start a new take", ko ? "현재 연주를 먼저 저장하거나 버릴까요?" : "Save or discard the current performance before starting over?", [
      { text: ko ? "취소" : "Cancel", style: "cancel" },
      { text: ko ? "버리고 시작" : "Discard & start", style: "destructive", onPress: startFreshTake },
      { text: ko ? "저장 후 시작" : "Save & start", onPress: () => { void saveRhythmDocument(doc).then(async () => { await loadLibrary(); startFreshTake(); }).catch((error) => Alert.alert(text.error, error instanceof Error ? error.message : String(error))); } },
    ]);
  };
  const finishRecord = () => { cleanupRecording(); setRecording(false); setRecordPending(false); setFlow("review"); stopPreviewNote(); };
  const previewMove = (eventId: string, startQ: number) => {
    try { setDragPreviewDocument(moveNotationEvent(doc, eventId, startQ, snapEdits)); }
    catch { setDragPreviewDocument(null); }
  };
  const commitMove = (eventId: string, startQ: number) => {
    try {
      update(moveNotationEvent(doc, eventId, startQ, snapEdits));
      setDragPreviewDocument(null); setSelected([eventId]); setManualStart(String(startQ)); setScrubPosition(String(startQ));
    } catch (error) { setDragPreviewDocument(null); Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
  };
  const cancelMove = () => setDragPreviewDocument(null);
  const scrubAt = (x: number) => setScrubPosition(String(Math.max(0, Math.min(scrubMaxQ, x / scrubTrackWidth.current * scrubMaxQ)).toFixed(2)));
  const addHit = (id: string, action: "down" | "up", midi?: number) => {
    if (action === "down") {
      const now = clockNow();
      if (recording) {
        const onsetMs = Math.max(0, now - startRef.current);
        const hit: Hit = { id: genId("hit"), onsetMs, ...(mode === "keyboard" ? { midi } : { drum: mode === "drums" ? drum : "snare" }), ...(mode === "keyboard" && midi ? { midi } : {}) };
        setDoc((prev) => ({ ...prev, hits: [...prev.hits, hit], updatedAt: Date.now() }));
        releaseRef.current[id] = hit.id;
      }
      if (!recording && !recordPending && !practiceOn && !practicePending && !playing) {
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
      if (recording || practiceOn) {
        if (mode === "pad") previewScoreDrum("snare");
        if (mode === "drums") previewScoreDrum(drum);
      }
    } else {
      if (mode === "keyboard" && midi) {
        activeMidi.current = activeMidi.current.filter((value) => value !== midi);
        if (activeMidi.current.length) playChord(activeMidi.current, 500, 0.5);
        else stopPreviewNote();
      }
      if (recording && releaseRef.current[id]) {
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
  const changeBpm = (value: string) => setDoc((prev) => ({ ...prev, bpm: Math.max(30, Math.min(260, Number(value) || 30)) }));
  const play = (kind: "original" | "notation") => {
    if (practiceOn || practicePending) cleanupPractice();
    cleanupPlayback();
    try {
      const sequence = buildRhythmPlayback(doc, kind);
      if (!sequence.length) { Alert.alert(text.listen, text.empty); return; }
      setPlaying(true);
      void audioSession.current?.play(sequence, () => setPlaying(true), () => setPlaying(false)).catch((error) => {
        setPlaying(false); Alert.alert(text.error, error instanceof Error ? error.message : String(error));
      });
    } catch (error) { Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
  };
  const save = async () => {
    try { await saveRhythmDocument(doc); setSaved(await listRhythmDocuments()); Alert.alert(text.save, ko ? "저장했습니다." : "Take saved."); }
    catch (e) { Alert.alert(text.error, e instanceof Error ? e.message : String(e)); }
  };
  const loadLibrary = async () => {
    try { setSaved(await listRhythmDocuments()); setLoadError(""); }
    catch (e) { setLoadError(e instanceof Error ? e.message : "Unable to load."); }
  };
  const removeSaved = async (id: string) => {
    try { await deleteRhythmDocument(id); await loadLibrary(); }
    catch (e) { Alert.alert(text.error, e instanceof Error ? e.message : String(e)); }
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
    try { update(chooseCandidate(doc, candidate)); setCandidateOpen(false); }
    catch (error) { Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
  };
  const editEvent = (event: NotationEvent, start: number, dur: number) => {
    try {
      const moved = moveNotationEvent(doc, event.id, start, snapEdits);
      const next = setEventDuration(moved, event.id, dur);
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
  const startCalibration = () => { setCalTaps([]); setOffsetText("0"); };
  const playCalibrationReference = () => {
    calibrationTimers.current.forEach(clearTimeout); calibrationTimers.current = [];
    const beat = 60000 / doc.bpm * 4 / doc.meter.denominator;
    calibrationStart.current = clockNow();
    for (let i = 0; i < 16; i++) calibrationTimers.current.push(setTimeout(() => clickSession.current?.play(), i * beat));
  };
  const calibrationTap = () => {
    const now = clockNow(); const next = [...calTaps, now]; setCalTaps(next);
    if (next.length >= 16) {
      const interval = 60000 / doc.bpm * 4 / doc.meter.denominator;
      const expected = next.map((_, i) => calibrationStart.current + i * interval);
      try { const offset = Math.round(calibrateOffset(next, expected)); setOffsetText(String(offset)); setDoc((prev) => ({ ...prev, offsetMs: offset })); }
      catch (error) { Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
    }
  };
  const beginPractice = () => {
    if (practiceOn || practicePending) return;
    if (recording || recordPending) { Alert.alert(text.practice, ko ? "먼저 입력을 마쳐 주세요." : "Finish recording before practice."); return; }
    const expected = buildRhythmPlayback(doc, "original");
    if (!expected.length) { Alert.alert(text.practice, text.empty); return; }
    practiceExpectedRef.current = expected;
    cleanupPractice(); setFlow("practice"); setPracticeResult(null); practiceTapsRef.current = []; setPracticeTaps([]); setPracticePending(true); setLiveJudgment(text.beginPractice);
    const beatMs = 60000 / doc.bpm * 4 / doc.meter.denominator;
    const count = countIn ? Math.max(1, doc.meter.numerator) : 0;
    if (countIn) for (let i = 0; i < count; i++) practiceTimers.current.push(setTimeout(() => clickSession.current?.play(), i * beatMs));
    practiceTimers.current.push(setTimeout(() => {
      void audioSession.current?.play(expected, () => {
        setPracticePending(false); setPracticeOn(true); startRef.current = clockNow();
      }, finishPractice).catch((error) => {
        cleanupPractice(); Alert.alert(text.error, error instanceof Error ? error.message : String(error));
      });
    }, count * beatMs));
  };
  const finishPractice = () => {
    const expected = practiceExpectedRef.current;
    try {
      const result = evaluatePractice(expected, practiceTapsRef.current.map((hit) => ({ id: hit.id, timeMs: hit.onsetMs - doc.offsetMs, drum: hit.drum, midi: hit.midi })), doc.bpm, difficulty);
      cleanupPractice(); setPracticeResult(result);
    } catch (error) { cleanupPractice(); Alert.alert(text.error, error instanceof Error ? error.message : String(error)); }
  };
  const stopPractice = () => practiceOn ? finishPractice() : cleanupPractice();
  const selectEvent = (event: NotationEvent) => {
    setSelected((prev) => prev.includes(event.id) ? prev.filter((id) => id !== event.id) : [...prev, event.id]);
    setManualStart(String(toNumber(event.startQ))); setScrubPosition(String(toNumber(event.startQ)));
    setDuration(toNumber(event.durationQ)); setDurationText(String(toNumber(event.durationQ)));
  };
  useEffect(() => { void loadLibrary(); }, []);
  const deactivateRef = useRef<() => void>(() => {});
  deactivateRef.current = () => {
    if (recording || recordPending) finishRecord();
    else cleanupAllRef.current();
    setPracticePending(false);
  };
  useEffect(() => { if (!active) deactivateRef.current(); }, [active]);

  return (
    <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <Text style={[s.kicker, { color: C.accent }]}>{text.headline}</Text>
      <Text style={[s.intro, { color: C.textSecondary }]}>{text.intro}</Text>
      <View style={s.flowRow}>{([["input", text.inputFlow], ["review", text.reviewFlow], ["practice", text.practiceFlow]] as const).map(([key, label]) => <Pressable key={key} onPress={() => setFlow(key)} style={[s.flowChip, { borderColor: flow === key ? C.accent : C.border, backgroundColor: flow === key ? C.surfaceLight : "transparent" }]}><Text style={{ color: flow === key ? C.accent : C.textSecondary, fontSize: 11 }}>{label}</Text></Pressable>)}</View>
      <View style={[s.setup, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={s.setupHead}><Text style={[s.cardTitle, { color: C.text }]}>{text.bpm}</Text><TextInput value={String(doc.bpm)} onChangeText={changeBpm} keyboardType="number-pad" style={[s.numInput, { color: C.text, borderColor: C.border }]} /><Text style={[s.cardTitle, { color: C.text, marginLeft: 10 }]}>{text.meter}</Text>
          <Pressable onPress={() => setDoc((prev) => ({ ...prev, meter: { ...prev.meter, numerator: prev.meter.numerator <= 2 ? 7 : prev.meter.numerator - 1 } }))} style={s.step}><Text style={{ color: C.text }}>−</Text></Pressable><Pressable onPress={() => setDoc((prev) => ({ ...prev, meter: { ...prev.meter, denominator: prev.meter.denominator === 2 ? 4 : prev.meter.denominator === 4 ? 8 : 2 } }))} accessibilityLabel="Change meter denominator"><Text style={{ color: C.text, fontFamily: "SpaceGrotesk_700Bold" }}>{doc.meter.numerator}/{doc.meter.denominator}</Text></Pressable><Pressable onPress={() => setDoc((prev) => ({ ...prev, meter: { ...prev.meter, numerator: prev.meter.numerator >= 7 ? 2 : prev.meter.numerator + 1 } }))} style={s.step}><Text style={{ color: C.text }}>+</Text></Pressable>
        </View>
        <View style={s.setupHead}><Text style={[s.muted, { color: C.textSecondary }]}>{text.countIn}</Text><Switch value={countIn} onValueChange={setCountIn} trackColor={{ true: C.accent }} /><Text style={[s.muted, { color: C.textSecondary, marginLeft: 10 }]}>{text.bars}</Text><TextInput value={barLimit} onChangeText={setBarLimit} keyboardType="number-pad" placeholder="0" placeholderTextColor={C.textTertiary} style={[s.numInput, { color: C.text, borderColor: C.border }]} /><Text style={[s.muted, { color: C.textTertiary }]}>0 = ∞</Text></View>
        <TextInput value={doc.title} onChangeText={(title) => setDoc((prev) => ({ ...prev, title }))} style={[s.titleInput, { color: C.text, borderColor: C.border }]} accessibilityLabel={text.title} />
        <View style={s.modeRow}>{([["pad", text.pad], ["drums", text.drums], ["keyboard", text.keyboard]] as const).map(([key, label]) => <Pressable key={key} onPress={() => setMode(key)} style={[s.mode, { backgroundColor: mode === key ? C.accent : C.background }]}><Text style={{ color: mode === key ? C.background : C.textSecondary, fontSize: 12, fontFamily: "SpaceGrotesk_700Bold" }}>{label}</Text></Pressable>)}</View>
        {mode === "drums" && <View style={s.modeRow}>{(["snare", "kick", "hihat_closed"] as const).map((value) => <Pressable key={value} onPress={() => setDrum(value)} style={[s.chip, { borderColor: drum === value ? C.accent : C.border }]}><Text style={{ color: C.text, fontSize: 11 }}>{value}</Text></Pressable>)}</View>}
        <View style={s.recordRow}><Pressable testID="rhythm-record" onPress={recording ? finishRecord : recordPending ? finishRecord : beginRecord} style={[s.primaryButton, { backgroundColor: recording ? C.accent : C.text }]}><Ionicons name={recording ? "stop" : recordPending ? "close" : "radio-button-on"} size={17} color={C.background} /><Text style={{ color: C.background, fontFamily: "SpaceGrotesk_700Bold" }}>{recording ? text.stop : recordPending ? text.stop : text.start}</Text></Pressable><Text style={[s.muted, { color: C.textSecondary }]}>{doc.hits.length} {text.hit}{doc.hits.length === 1 ? "" : "s"}</Text></View>
        <Text testID="rhythm-record-status" style={[s.muted, { color: C.textSecondary }]}>
          {recording ? (ko ? "녹음 중" : "Recording") : recordPending ? (ko ? "예비박" : "Count-in") : (ko ? "정지" : "Stopped")}
        </Text>
        {!recordPending ? <View style={s.padRow}>
          {mode === "keyboard" ? <RhythmKeyboard onDown={(midi) => addHit(`key_${midi}`, "down", midi)} onUp={(midi) => addHit(`key_${midi}`, "up", midi)} /> :
            <RhythmInputSurface label={text.press} testID="rhythm-pad" onDown={tapPad} onUp={() => addHit("pad", "up")} style={[s.bigPad, { backgroundColor: mode === "drums" && drum === "kick" ? "#b6a77b" : C.accent }]}><View style={s.padMark} /><Text style={s.padLabel}>{text.press.toUpperCase()}</Text></RhythmInputSurface>}
        </View> : <Text style={[s.muted, { color: C.textSecondary, marginTop: 9 }]}>{text.empty}</Text>}
      </View>
      {flow !== "review" && (recording || doc.hits.length > 0) && <View style={{ marginBottom: 12 }}><Text style={[s.cardTitle, { color: C.text, marginBottom: 7 }]}>{text.provisional}</Text><RhythmStaff events={interpretation.events} meter={doc.meter} selected={selected} symbols={doc.symbols} onSelect={selectEvent} onMovePreview={previewMove} onMoveCommit={commitMove} onMoveCancel={cancelMove} playheadQ={playheadQ} /></View>}
      {practiceOn && <View style={[s.practiceLive, { borderColor: C.accent }]}><Text style={{ color: C.accent, fontFamily: "SpaceGrotesk_700Bold" }}>{liveJudgment || text.practice}</Text><Text style={{ color: C.textSecondary }}>{practiceTaps.length} / {buildRhythmPlayback(doc, "original").length}</Text><Pressable onPress={finishPractice} style={[s.smallPrimary, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{text.endPractice}</Text></Pressable></View>}
      {flow === "review" && <>
        <View style={s.sectionHeader}><View><Text style={[s.cardTitle, { color: C.text }]}>{text.provisional}</Text><Text style={[s.muted, { color: C.textSecondary }]}>{events.length} events · {doc.hits.length} raw hits</Text></View><Pressable onPress={save} style={[s.smallPrimary, { backgroundColor: C.accent }]} testID="rhythm-save"><Ionicons name="save-outline" size={15} color={C.background} /><Text style={{ color: C.background, fontFamily: "SpaceGrotesk_700Bold" }}>{text.save}</Text></Pressable></View>
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
        <RhythmStaff events={displayEvents} meter={doc.meter} selected={selected} symbols={doc.symbols} onSelect={selectEvent} onMovePreview={previewMove} onMoveCommit={commitMove} onMoveCancel={cancelMove} playheadQ={playheadQ} />
        <View style={s.listenRow}><Text style={[s.muted, { color: C.textSecondary }]}>{text.listen}</Text><Pressable onPress={() => playing ? cleanupPlayback() : play("original")} style={[s.listenButton, { borderColor: C.border }]}><Ionicons name={playing ? "stop" : "play"} size={15} color={C.text} /><Text style={{ color: C.text }}>{text.original}</Text></Pressable><Pressable onPress={() => playing ? cleanupPlayback() : play("notation")} style={[s.listenButton, { borderColor: C.border }]}><Ionicons name="musical-notes-outline" size={15} color={C.text} /><Text style={{ color: C.text }}>{text.notation}</Text></Pressable></View>
        <View style={[s.editBox, { borderColor: C.border, backgroundColor: C.surface }]}><Text style={[s.cardTitle, { color: C.text }]}>{text.selected}: {selected.length}</Text>
          <View style={s.chipWrap}>{(["flam", "drag", "regular", "diddle", "accent"] as const).map((kind) => <Pressable key={kind} onPress={() => applyKind(kind)} style={[s.chip, { borderColor: C.border }]}><Text style={{ color: C.text }}>{text[kind]}</Text></Pressable>)}</View>
           {selectedEvents[0] && <><Text style={[s.muted, { color: C.textSecondary }]}>{text.onset} · {text.duration}</Text><View style={s.setupHead}><TextInput keyboardType="decimal-pad" value={manualStart} onChangeText={setManualStart} style={[s.numInput, { color: C.text, borderColor: C.border }]} /><TextInput keyboardType="decimal-pad" value={durationText} onChangeText={setDurationText} style={[s.numInput, { color: C.text, borderColor: C.border }]} /><Pressable onPress={applyEventForm} style={[s.smallPrimary, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{text.apply}</Text></Pressable><Pressable onPress={() => setSnapEdits((v) => !v)} style={[s.chip, { borderColor: snapEdits ? C.accent : C.border }]}><Text style={{ color: C.text }}>{snapEdits ? "Snap" : "Free"}</Text></Pressable><View style={s.chipWrap}>{DURS.map((v) => <Pressable key={v} onPress={() => { const d = 4 / v; setDuration(d); setDurationText(String(d)); editEvent(selectedEvents[0], toNumber(selectedEvents[0].startQ), d); }} style={[s.chip, { borderColor: Math.abs(duration - 4 / v) < 0.001 ? C.accent : C.border }]}><Text style={{ color: C.text }}>{v}</Text></Pressable>)}</View></View></>}
          <View style={s.setupHead}><Text style={[s.muted, { color: C.textSecondary }]}>{text.tuplet}</Text><TextInput value={tupletActual} placeholder={text.actual} placeholderTextColor={C.textTertiary} onChangeText={setTupletActual} keyboardType="number-pad" style={[s.numInput, { color: C.text, borderColor: C.border }]} /><Text style={{ color: C.text }}>:</Text><TextInput value={tupletNormal} placeholder={text.normal} placeholderTextColor={C.textTertiary} onChangeText={setTupletNormal} keyboardType="number-pad" style={[s.numInput, { color: C.text, borderColor: C.border }]} /><Pressable onPress={applyTupletNow} style={[s.smallPrimary, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{text.apply}</Text></Pressable></View>
          <View style={s.setupHead}><Text style={[s.muted, { color: C.textSecondary }]}>Parent</Text><Pressable onPress={() => setParentTupletId(undefined)} style={[s.chip, { borderColor: !parentTupletId ? C.accent : C.border }]}><Text style={{ color: C.text }}>None</Text></Pressable>{doc.tuplets.map((span) => <Pressable key={span.id} onPress={() => setParentTupletId(span.id)} style={[s.chip, { borderColor: parentTupletId === span.id ? C.accent : C.border }]}><Text style={{ color: C.text }}>{span.actual}:{span.normal}</Text></Pressable>)}</View>
          <View style={s.setupHead}><Pressable onPress={() => { try { update(insertRest(doc, playheadQ, duration)); } catch (error) { Alert.alert(text.error, error instanceof Error ? error.message : String(error)); } }} style={[s.listenButton, { borderColor: C.border }]}><Text style={{ color: C.text }}>+ {text.rest}</Text></Pressable><Text style={{ color: C.textSecondary, fontSize: 11 }}>{text.simplify} {Math.round(doc.simplification * 100)}%</Text></View>
          <View style={s.setupHead}><Text style={[s.muted, { color: C.textSecondary }]}>{text.simplify}</Text><View style={{ flex: 1 }} /><TextInput value={String(Math.round(doc.simplification * 100))} onChangeText={(v) => { const percent = Math.max(0, Math.min(100, Number(v) || 0)); update({ ...doc, simplification: percent / 100 }); }} keyboardType="number-pad" style={[s.numInput, { color: C.text, borderColor: C.border }]} /></View>
        </View>
        <View style={[s.editBox, { borderColor: C.border, backgroundColor: C.surface }]}>
          <View style={s.sectionHeader}><Text style={[s.cardTitle, { color: C.text }]}>{text.candidates}</Text><Pressable onPress={() => setCandidateOpen((v) => !v)}><Ionicons name={candidateOpen ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} /></Pressable></View>
          {candidateOpen && interpretation.candidates.slice(0, 6).map((candidate) => <Pressable key={candidate.id} onPress={() => selectCandidate(candidate)} style={[s.candidate, { borderColor: C.border }]}><Text style={{ color: C.text, flex: 1 }}>{candidate.label}</Text><Text style={{ color: C.accent, fontFamily: "SpaceGrotesk_700Bold" }}>{Math.round(candidate.score * 100)}%</Text></Pressable>)}
        </View>
        <View style={[s.editBox, { borderColor: C.border, backgroundColor: C.surface }]}>
          <View style={s.sectionHeader}><Text style={[s.cardTitle, { color: C.text }]}>{text.symbols}</Text><Pressable onPress={() => setSymbolEditor((v) => !v)} style={[s.smallPrimary, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{text.newSymbol}</Text></Pressable></View>
          <Text style={[s.muted, { color: C.textSecondary }]}>{text.unsupported}</Text>
          {doc.symbols.map((symbol) => <View key={symbol.id} style={s.candidate}><Text style={{ color: C.text, flex: 1 }}>{symbol.name} · {symbol.role} / {symbol.meaning}{symbol.meaning === "annotation" ? " — annotation only" : ""}</Text><Pressable onPress={() => applySymbol(symbol)}><Text style={{ color: C.accent }}>{text.apply}</Text></Pressable></View>)}
          {symbolEditor && <RhythmSymbolEditor name={symbolName} description={symbolDescription} role={symbolRole} meaning={symbolMeaning} shapeType={shapeType} shapes={symbolShapes} selectedShapeId={selectedShapeId} colors={C} copy={{ name: text.newSymbol, description: text.description, shapes: text.shapes, role: text.role, meaning: text.meaning, save: text.save, removeShape: ko ? "도형 삭제" : "Remove shape" }} onName={setSymbolName} onDescription={setSymbolDescription} onRole={setSymbolRole} onMeaning={setSymbolMeaning} onShapeType={setShapeType} onSelectShape={setSelectedShapeId} onAddShape={addCustomShape} onUpdateShape={updateShape} onRemoveShape={(id) => { setSymbolShapes((prev) => prev.filter((shape) => shape.id !== id)); setSelectedShapeId(null); }} onSave={saveSymbol} />}
        </View>
      </>}
      <View style={[s.editBox, { borderColor: C.border, backgroundColor: C.surface }]}>
        <Text style={[s.cardTitle, { color: C.text }]}>{text.calibrate}</Text><Text style={[s.muted, { color: C.textSecondary }]}>{calTaps.length}/16 · taps preserve original hit timing</Text>
        <View style={s.setupHead}><Pressable onPress={startCalibration} style={[s.listenButton, { borderColor: C.border }]}><Text style={{ color: C.text }}>{ko ? "초기화" : "Reset"}</Text></Pressable><Pressable onPress={playCalibrationReference} style={[s.listenButton, { borderColor: C.border }]}><Text style={{ color: C.text }}>{ko ? "16박 기준음" : "16-beat reference"}</Text></Pressable><Pressable onPress={calibrationTap} style={[s.smallPrimary, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{text.taps} {calTaps.length + 1}</Text></Pressable><TextInput value={offsetText} onChangeText={(v) => { setOffsetText(v); setDoc((prev) => ({ ...prev, offsetMs: Number(v) || 0 })); }} keyboardType="numbers-and-punctuation" style={[s.numInput, { color: C.text, borderColor: C.border }]} /><Text style={[s.muted, { color: C.textSecondary }]}>{text.manual}</Text></View>
      </View>
      <View style={[s.editBox, { borderColor: C.border, backgroundColor: C.surface }]}>
        <View style={s.sectionHeader}><Text style={[s.cardTitle, { color: C.text }]}>{text.practice}</Text>{(["easy", "normal", "strict"] as const).map((value) => <Pressable key={value} onPress={() => setDifficulty(value)} style={[s.chip, { borderColor: difficulty === value ? C.accent : C.border }]}><Text style={{ color: C.text, fontSize: 10 }}>{value}</Text></Pressable>)}</View>
        <Text style={[s.muted, { color: C.textSecondary }]}>Input and practice are separate. Practice listens to the original performance.</Text>
         <View style={s.listenRow}><Pressable onPress={practicePending || practiceOn ? stopPractice : beginPractice} style={[s.smallPrimary, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{practicePending || practiceOn ? text.endPractice : text.beginPractice}</Text></Pressable>{practiceResult && <Text style={{ color: C.accent, fontFamily: "SpaceGrotesk_700Bold" }}>{text.result}: {practiceResult.score}</Text>}</View>
        {practiceResult && <Text style={[s.muted, { color: C.textSecondary }]}>Timing {practiceResult.timingScore} · coverage {practiceResult.coverageScore} · missed {practiceResult.missed} · extra {practiceResult.extra} · mean error {Math.round(practiceResult.meanErrorMs)} ms</Text>}
      </View>
      <View style={s.sectionHeader}><Text style={[s.cardTitle, { color: C.text }]}>{text.library}</Text><Pressable onPress={() => void loadLibrary()}><Ionicons name="refresh" color={C.accent} size={18} /></Pressable></View>
      {loadError ? <Text style={{ color: C.accent }}>{loadError}</Text> : null}
      {!saved.length && <Text style={[s.muted, { color: C.textSecondary }]}>{text.noDoc}</Text>}
      {saved.map((item) => <View key={item.id} style={[s.candidate, { borderColor: C.border }]}><Text style={{ color: C.text, flex: 1 }}>{item.title} · {item.hits.length} hits</Text><Pressable onPress={() => { update(item); setFlow("review"); }} accessibilityLabel={text.open}><Ionicons name="folder-open-outline" color={C.accent} size={19} /></Pressable><Pressable onPress={() => Alert.alert(text.delete, item.title, [{ text: ko ? "취소" : "Cancel", style: "cancel" }, { text: text.delete, style: "destructive", onPress: () => void removeSaved(item.id) }])} style={{ marginLeft: 14 }}><Ionicons name="trash-outline" color={C.textSecondary} size={18} /></Pressable></View>)}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 38 },
  kicker: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, marginTop: 10, letterSpacing: -0.5 },
  intro: { fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  flowRow: { flexDirection: "row", gap: 7, marginBottom: 10 },
  flowChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  setup: { borderRadius: 15, borderWidth: 1, padding: 12, marginBottom: 16 },
  setupHead: { flexDirection: "row", alignItems: "center", gap: 7, marginVertical: 4, flexWrap: "wrap" },
  cardTitle: { fontSize: 14, fontFamily: "SpaceGrotesk_700Bold" },
  numInput: { minWidth: 42, height: 34, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, textAlign: "center" },
  step: { width: 25, height: 28, justifyContent: "center", alignItems: "center", borderRadius: 6, backgroundColor: "rgba(128,128,128,0.15)" },
  muted: { fontSize: 11 },
  titleInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  modeRow: { flexDirection: "row", gap: 7, alignItems: "center", marginTop: 10, flexWrap: "wrap" },
  mode: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  recordRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  primaryButton: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 12, paddingHorizontal: 15, borderRadius: 10 },
  padRow: { marginTop: 11, alignItems: "center" },
  bigPad: { width: 184, height: 130, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 3, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6 },
  padMark: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: "rgba(20,20,20,0.4)", marginBottom: 11 },
  padLabel: { fontSize: 9, letterSpacing: 1.4, color: "#1B1B1B", fontFamily: "SpaceGrotesk_700Bold" },
  keys: { flexDirection: "row", alignItems: "flex-end", height: 120 },
  key: { width: 34, borderWidth: 1, borderColor: "#333", borderBottomLeftRadius: 4, borderBottomRightRadius: 4, alignItems: "center", justifyContent: "flex-end", paddingBottom: 7 },
  practiceLive: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  smallPrimary: { flexDirection: "row", gap: 5, alignItems: "center", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 9, marginBottom: 8, gap: 8 },
  scrubber: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 7 }, listenRow: { flexDirection: "row", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 10 },
  scrubTrack: { height: 6, borderRadius: 4, marginBottom: 12, position: "relative" },
  scrubFill: { height: 6, borderRadius: 4 },
  scrubThumb: { width: 16, height: 16, borderRadius: 8, position: "absolute", top: -5, marginLeft: -8 },
  listenButton: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8 },
  editBox: { borderWidth: 1, borderRadius: 13, padding: 12, marginBottom: 10 },
  chipWrap: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginVertical: 6 },
  candidate: { flexDirection: "row", gap: 8, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
});

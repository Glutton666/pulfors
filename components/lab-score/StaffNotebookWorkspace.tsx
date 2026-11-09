import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert } from "@/lib/alert";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLabScoreNotebook } from "@/hooks/useLabScoreNotebook";
import { useNotebookPlayback } from "@/hooks/useNotebookPlayback";
import { DEFAULT_NOTEBOOK_SETTINGS, type NotebookSettings, type StaffNotebook, type StaffPage, type StaffPoint, type StaffStamp } from "@/lib/staff-notebook";
import { loadPracticeBook, type PracticeEntry } from "@/lib/storage";
import { constrainStaffPoint, fitNotebookPage, materializeRows, stampPosition, screenToPaper, PAPER_WIDTH, ROW_HEIGHT, rowAt } from "@/lib/staff-notebook-layout";
import { NotebookModeMenu, type NotebookMode } from "@/components/lab-score/notebook/NotebookModeMenu";
import { NotebookBottomTools } from "@/components/lab-score/notebook/NotebookBottomTools";
import { NotebookPlaybackBar } from "@/components/lab-score/notebook/NotebookPlaybackBar";
import { NotebookFloatingDock } from "@/components/lab-score/notebook/NotebookFloatingDock";
import { NotebookSettingsPanel } from "@/components/lab-score/notebook/NotebookSettingsPanel";
import { NotebookPaper } from "@/components/lab-score/notebook/NotebookPaper";
import { attachedPosition, captureSelection, emptySelection, hitObject, includeAttached, isAttachedMark, isNotebookNote, isTupletMember, paginateNotebook, rectangle, removeSelection, reorderNotebookRows, selectRectangle, selectNotebookUnits, selectionBounds, selectionCount, selectionDelta, transformSelection, type NotebookClipboard, type NotebookSelection, type NotebookBounds, type NotebookSelectionUnit } from "@/lib/notebook-editing";
import { eraseNotebookGesture, type NotebookEraserMode } from "@/lib/notebook-erasing";
import { layoutNotebookMusic, measuresInRow, naturalPaperWidth, standardTupletRatio, isManualBar, isMusic, measureDuration, musicalDuration } from "@/lib/notebook-music-layout";
import { randomizeNotebook } from "@/lib/notebook-random";
import { insertSelectionBeforeFollowing, notebookWritingTail } from "@/lib/notebook-editing";
import { NotebookObjectEditor } from "@/components/lab-score/notebook/NotebookObjectEditor";

type Tool = "pen" | "erase" | "move" | "select";
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const withDefaults = (note: StaffNotebook): StaffNotebook => ({
  ...note,
  settings: { ...DEFAULT_NOTEBOOK_SETTINGS, ...(note.settings ?? {}), offsetX: 0, offsetY: 0 },
  pages: note.pages.map((page) => ({ ...page, stamps: page.stamps ?? [] })),
});

type Props = {
  active?: boolean;
  onRegisterExit?: (handler: ((next: () => void) => void) | null) => void;
  onOpenCapture?: () => void;
};

export function StaffNotebookWorkspace({ active = true, onRegisterExit, onOpenCapture }: Props) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const ko = language === "ko";
  const t = useMemo(() => ko ? {
    fresh: "새 노트", saved: "저장했습니다", failed: "저장하지 못했습니다", title: "노트 제목", savedNotes: "저장된 노트",
    page: "페이지", addPage: "페이지 추가", addStaff: "오선 추가", save: "저장", undo: "실행 취소", redo: "다시 실행",
    close: "패널 닫기", left: "노트와 재생", right: "필기 도구", confirm: "이 노트의 저장하지 않은 변경을 버릴까요?",
    discard: "버리기", cancel: "취소", loading: "불러오는 중", error: "연습장을 불러오지 못했습니다.",
    start: "재생", stop: "정지", bpm: "BPM", source: "재생 소스", click: "단순 1/4박자", loaded: "불러온 패턴",
    follow: "재생 따라가기", measure: "한 마디", phrase: "한 박자 (4마디)", zoom: "재생 확대", random: "줄 순서 섞기",
    unsupported: "이 항목은 이 화면에서 재생할 수 없습니다.", selectPattern: "연습장 패턴", noPatterns: "저장된 패턴이 없습니다.",
    settings: "노트 설정", patterns: "패턴 불러오기", notes: "내 노트", nothing: "아직 저장된 노트가 없습니다.",
    playbackError: "재생을 시작할 수 없습니다.", pageCount: "오선 수",
  } : {
    fresh: "New notebook", saved: "Notebook saved", failed: "Could not save notebook", title: "Notebook title", savedNotes: "Saved notebooks",
    page: "Page", addPage: "Add page", addStaff: "Add staff", save: "Save", undo: "Undo", redo: "Redo",
    close: "Close panel", left: "Notebook & playback", right: "Writing tools", confirm: "Discard unsaved changes to this notebook?",
    discard: "Discard", cancel: "Cancel", loading: "Loading", error: "Could not load the practice book.",
    start: "Play", stop: "Stop", bpm: "BPM", source: "Playback source", click: "Simple quarter-note click", loaded: "Loaded pattern",
    follow: "Follow playback", measure: "One measure", phrase: "One phrase (4 measures)", zoom: "Playback zoom", random: "Shuffle staff order",
    unsupported: "This item cannot be played in this workspace.", selectPattern: "Practice-book patterns", noPatterns: "No saved patterns yet.",
    settings: "Notebook settings", patterns: "Load pattern", notes: "My notebooks", nothing: "No saved notebooks yet.",
    playbackError: "Playback could not start.", pageCount: "Staves",
  }, [ko]);
  const { notebooks, error, refresh, save, remove, create } = useLabScoreNotebook();
  const [note, setNote] = useState<StaffNotebook>(() => withDefaults(create()));
  const [tool, setTool] = useState<Tool>("pen");
  const [lineWidth, setLineWidth] = useState(2.5);
  const [lineColor, setLineColor] = useState("#111111");
  const [eraserMode, setEraserMode] = useState<NotebookEraserMode>("object");
  const [toolPopup, setToolPopup] = useState<"pen" | "erase" | null>(null);
  const [eraseDraft, setEraseDraft] = useState<StaffPage | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [panel, setPanel] = useState<"menu" | "settings" | null>(null);
  const [mode, setMode] = useState<NotebookMode>("ink");
  const [patterns, setPatterns] = useState<PracticeEntry[]>([]);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternError, setPatternError] = useState("");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<StaffPoint>({ x: 0, y: 0 });
  const [selection, setSelection] = useState<NotebookSelection>(emptySelection);
  const [selectionUnit, setSelectionUnit] = useState<NotebookSelectionUnit>("object");
  const [unitRows, setUnitRows] = useState<{ first: number; last: number } | null>(null);
  const [objectEditor, setObjectEditor] = useState(false);
  const [decision, setDecision] = useState<{ title: string; message: string; options: { label: string; action: () => void }[] } | null>(null);
  const [feedback, setFeedback] = useState("");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); }, []);
  const notify = (message: string) => {
    setFeedback(message);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(""), 2200);
  };
  const [selectionBox, setSelectionBox] = useState<NotebookBounds | null>(null);
  const [clipboard, setClipboard] = useState<NotebookClipboard[]>([]);
  const [tupletIds, setTupletIds] = useState<string[] | null>(null);
  const [dragDraft, setDragDraft] = useState<{ selection: NotebookSelection; delta: StaffPoint; base: StaffPage; paste: boolean; awaiting: boolean; point: StaffPoint } | null>(null);
  const [drawing, setDrawing] = useState<StaffPoint[]>([]);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [dockMoving, setDockMoving] = useState(false);
  const [dockLayoutVersion, setDockLayoutVersion] = useState(0);
  const [frontDock, setFrontDock] = useState<"playback" | "tools">("tools");
  const [inkDockWidth, setInkDockWidth] = useState(600);
  const fitInkDock = useCallback((contentWidth: number) => {
    if (Number.isFinite(contentWidth) && contentWidth > 0) setInkDockWidth(Math.ceil(contentWidth) + 46);
  }, []);
  const [paperTop, setPaperTop] = useState(128);
  const paperStageRef = useRef<View>(null);
  const paperScroll = useRef<ScrollView>(null);
  const horizontalScroll = useRef<ScrollView>(null);
  const paperScrollOffset = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const frame = requestAnimationFrame(() => paperStageRef.current?.measureInWindow((_x, y) => setPaperTop(y)));
    return () => cancelAnimationFrame(frame);
  }, [viewport.width, viewport.height]);
  const drawingRef = useRef<StaffPoint[]>([]);
  const eraseGesture = useRef<{ base: StaffPage; points: StaffPoint[] } | null>(null);
  const editSnapshot = useRef<{ selection: NotebookSelection; draft: typeof dragDraft } | null>(null);
  const rightToggleRef = useRef<any>(null);
  const undoStack = useRef<StaffNotebook[]>([]);
  const redoStack = useRef<StaffNotebook[]>([]);
  const savedSnapshot = useRef(JSON.stringify(note));
  const selectionGesture = useRef<{ kind: "box" | "drag"; start: StaffPoint; selection: NotebookSelection; base: StaffPage; hitId?: string } | null>(null);
  const panStart = useRef<{ point: StaffPoint; offset: StaffPoint } | null>(null);
  useEffect(() => { if (pageIndex >= note.pages.length) setPageIndex(Math.max(0, note.pages.length - 1)); }, [pageIndex, note.pages.length]);
  const settings = note.settings!;
  const paperScale = viewport.width > 0 ? viewport.width / PAPER_WIDTH : 1;
  const editingNote = useMemo(() => fitNotebookPage(note, pageIndex,
    Math.ceil(viewport.height / (ROW_HEIGHT * paperScale * scale))), [note, pageIndex, viewport.height, paperScale, scale]);
  const page = editingNote.pages[pageIndex] ?? editingNote.pages[0];
  const playback = useNotebookPlayback(editingNote, active);
  const randomized = useMemo(() => {
    try {
      const shuffled = randomizeNotebook(editingNote);
      const locations = (n: StaffNotebook) => n.pages.flatMap((p, pi) => [
        ...(p.stamps ?? []).map((s) => `${pi}:${s.id}:${s.x}:${s.y}`),
        ...p.strokes.map((s) => `${pi}:${s.id}:${JSON.stringify(s.points)}`),
      ]).sort().join("|");
      return { note: shuffled, error: "", unchanged: !!editingNote.settings?.random && locations(shuffled) === locations(editingNote) };
    }
    catch (e) { return { note: editingNote, error: e instanceof Error ? e.message : String(e), unchanged: false }; }
  }, [editingNote]);
  const performanceNote = randomized.note;
  const playbackPage = useMemo(() => playback.running ? materializeRows(performanceNote, playback.rows) : null, [playback.running, playback.rows, performanceNote]);
  const visiblePage = playbackPage ?? (settings.random ? performanceNote.pages[pageIndex] : page) ?? page;
  const visibleHeight = (visiblePage.staffCount ?? 7) * ROW_HEIGHT;
  const resetTransient = () => {
    setSelection(emptySelection()); setSelectionBox(null); setDragDraft(null); selectionGesture.current = null; setUnitRows(null);
    setDrawing([]); drawingRef.current = []; setTupletIds(null); panStart.current = null;
    eraseGesture.current = null; setEraseDraft(null); editSnapshot.current = null; setObjectEditor(false);
  };
  const updateSettings = (patch: Partial<NotebookSettings>) => {
    playback.stop();
    const apply = () => {
      const next = { ...editingNote, settings: { ...DEFAULT_NOTEBOOK_SETTINGS, ...settings, ...patch } };
      if ("measuresPerRow" in patch || "lineUnit" in patch) next.pages = next.pages.map((p) => ({ ...p, measureCounts: undefined }));
      if (next.settings.autoScale && !next.settings.autoSpacing) next.pages = next.pages.map((p) => ({ ...p, layoutScale: Math.max(next.settings.minScale ?? .65,
        Math.min(1, 824 / Math.max(824, ...(p.stamps ?? []).map((s) => s.x - 38 + s.size), ...p.strokes.flatMap((s) => s.points.map((point) => point.x - 38 + s.width))))) }));
      const needsLayout = ["autoSpacing", "autoScale", "notationMeter", "measuresPerRow", "minScale"].some((key) => key in patch);
      commitDocument(next, needsLayout && !!next.settings.autoSpacing);
    };
    if (patch.random === false && settings.random && !randomized.error) {
      Alert.alert(ko ? "현재 순서를 저장할까요?" : "Save this order?", ko ? "원본은 유지하고 별도 오선노트로 저장합니다." : "Your original stays unchanged. Save a separate notebook.", [
        { text: t.cancel, style: "cancel" },
        { text: ko ? "저장 안 함" : "Don't save", onPress: apply },
        { text: t.save, onPress: () => { const snapshot = { ...performanceNote, id: id("notebook"), title: `${note.title} · ${ko ? "랜덤" : "Random"}`, settings: { ...settings, random: false }, updatedAt: Date.now() };
          void save(snapshot).then((ok) => { if (ok) apply(); else Alert.alert(t.failed); }); } },
      ]); return;
    }
    apply();
  };
  const replacePage = (index: number, next: StaffPage, lastStampId?: string) => setNote((prev) => ({
    ...prev, pages: prev.pages.map((item, i) => i === index ? next : item),
    lastNote: lastStampId ? { pageId: next.id, stampId: lastStampId } : prev.lastNote?.pageId === next.id && !next.stamps?.some((stamp) => stamp.id === prev.lastNote!.stampId) ? undefined : prev.lastNote,
  }));
  const checkpoint = () => { undoStack.current = [...undoStack.current.slice(-39), editingNote]; redoStack.current = []; };
  const layoutError = (e: unknown) => Alert.alert(ko ? "배치를 확인해 주세요" : "Check layout",
    e instanceof Error && e.message === "TUPLET_EXCEEDS_MEASURE"
      ? (ko ? "이 잇단음표의 음악적 길이가 한 마디보다 깁니다. 크기를 줄여도 길이는 바뀌지 않습니다. 음가나 비율을 수정해 주세요." : "This tuplet exceeds one measure. Visual shrinking cannot change its duration. Edit its values or ratio.")
      : e instanceof Error ? e.message : String(e));
  const commitDocument = (next: StaffNotebook, arrange = !!next.settings?.autoSpacing, after?: (next: StaffNotebook) => void, openIds?: string[]) => {
    const commit = (result: StaffNotebook) => {
      if (JSON.stringify(result) === JSON.stringify(editingNote)) { after?.(result); return; }
      checkpoint(); setNote(result);
      if (result.lastNote) { const pi = result.pages.findIndex((p) => p.id === result.lastNote!.pageId); if (pi >= 0) setPageIndex(pi); }
      after?.(result);
    };
    const run = (candidate: StaffNotebook, opts: Parameters<typeof layoutNotebookMusic>[1] = {}) => {
      try {
        const currentOpen = openIds ?? tupletIds;
        const openGroup = currentOpen && currentOpen.length >= 2 ? { id: "open-edit", stampIds: currentOpen } : undefined;
        const result = arrange ? layoutNotebookMusic(candidate, { openGroup, ...opts }) : { note: candidate, reason: "changed" as const };
        if (result.reason !== "crowded") { if (result.reason === "unchanged") after?.(result.note); else commit(result.note); return; }
        setDecision({ title: ko ? "한 줄에 객체가 많습니다" : "This row is crowded", message: ko ? "음악적 길이는 유지하면서 배치 방법을 선택해 주세요." : "Choose a layout without changing musical durations.", options: [
          { label: ko ? "줄당 마디 수 변경" : "Fewer measures per row", action: () => {
            const n = measuresInRow(candidate.settings);
            if (n === 1) { Alert.alert(ko ? "이미 한 줄에 한 마디입니다" : "Already one measure per row", ko ? "음가·비율을 수정하거나 추가 축소를 선택해 주세요." : "Edit the content or choose extra shrinking."); return; }
            run({ ...candidate, settings: { ...candidate.settings!, measuresPerRow: n - 1 } });
          } },
          { label: ko ? "현재 줄에 맞추기·추가 축소" : "Fit here · shrink further", action: () => {
            const fitted = layoutNotebookMusic(candidate, { openGroup, allowCrowded: true });
            if (fitted.requiredScale < .2) { Alert.alert(ko ? "읽을 수 있는 크기를 넘습니다" : "Too small to read", ko ? "마디 수나 기보 내용을 조정해 주세요." : "Change the bar count or notation."); return; }
            commit(fitted.note);
          } },
          { label: ko ? "넘치는 부분 다음 줄로" : "Move overflow to next row", action: () => {
            const spilled = layoutNotebookMusic(candidate, { openGroup, spillVisual: true });
            if (spilled.reason === "crowded") { Alert.alert(ko ? "한 마디 안의 간격이 부족합니다" : "A single bar is crowded", ko ? "묶음을 마디 경계에서 나눌 수 없습니다. 추가 축소나 기보 수정을 선택해 주세요." : "A tuplet cannot cross its bar. Shrink further or edit the notation."); return; }
            commit(spilled.note);
          } },
        ] });
      } catch (e) { layoutError(e); }
    };
    run(next);
  };
  const pageDocument = (index: number, next: StaffPage, lastId?: string): StaffNotebook => ({
    ...editingNote, pages: editingNote.pages.map((p, i) => i === index ? next : p),
    lastNote: lastId ? { pageId: next.id, stampId: lastId } : editingNote.lastNote && !editingNote.pages.some((p, i) => (i === index ? next : p).stamps?.some((s) => s.id === editingNote.lastNote!.stampId)) ? undefined : editingNote.lastNote,
  });
  const undo = () => {
    playback.stop();
    const previous = undoStack.current.at(-1);
    if (!previous) return;
    redoStack.current = [...redoStack.current, note];
    undoStack.current = undoStack.current.slice(0, -1);
    resetTransient(); setNote(previous);
  };
  const redo = () => {
    playback.stop();
    const next = redoStack.current.at(-1);
    if (!next) return;
    undoStack.current = [...undoStack.current, note];
    redoStack.current = redoStack.current.slice(0, -1);
    resetTransient(); setNote(next);
  };
  const openPanel = (next: "menu" | "settings") => {
    setPanel((old) => old === next ? null : next);
  };
  const requestExit = (next: () => void) => {
      const changed = savedSnapshot.current !== JSON.stringify(note);
      const continueExit = () => { playback.stop(); next(); };
      if (!changed) { continueExit(); return; }
      Alert.alert(t.fresh, t.confirm, [
        { text: t.cancel, style: "cancel" },
        { text: t.discard, style: "destructive", onPress: continueExit },
        { text: t.save, onPress: () => { void save(editingNote).then((ok) => { if (ok) { savedSnapshot.current = JSON.stringify(editingNote); continueExit(); } }); } },
      ]);
  };
  useEffect(() => {
    if (!active || !onRegisterExit) return;
    onRegisterExit(requestExit);
    return () => onRegisterExit(null);
  }, [onRegisterExit, active, note, editingNote, playback.stop, save, t]);
  const closePanel = useCallback(() => {
    setPanel(null);
    if (Platform.OS === "web") requestAnimationFrame(() => rightToggleRef.current?.focus?.());
  }, []);
  useEffect(() => {
    if (!panel) return;
    if (Platform.OS === "web") {
      const handler = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closePanel(); } };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { closePanel(); return true; });
    return () => sub.remove();
  }, [panel, closePanel]);
  useEffect(() => { if (!active) { playback.stop(); resetTransient(); setPanel(null); setToolPopup(null); } }, [active, playback.stop]);
  useEffect(() => {
    let alive = true;
    setPatternLoading(true); setPatternError("");
    void loadPracticeBook().then((entries) => { if (alive) setPatterns(entries); })
      .catch(() => { if (alive) setPatternError(t.error); })
      .finally(() => { if (alive) setPatternLoading(false); });
    return () => { alive = false; };
  }, [t.error]);
  useEffect(() => {
    if (!playback.running || !settings.follow || !playback.position) return;
    const ratio = paperScale * settings.playbackZoom * (visiblePage.layoutScale ?? 1);
    paperScroll.current?.scrollTo({ y: (playback.position.row * ROW_HEIGHT + 102) * ratio, animated: false });
  }, [playback.running, playback.position, settings.follow, settings.playbackZoom, paperScale, viewport.height, visiblePage.layoutScale]);
  const confirmReplace = (action: () => void) => {
    const changed = savedSnapshot.current !== JSON.stringify(note);
    const replace = () => { playback.stop(); resetTransient(); setOffset({ x: 0, y: 0 }); action(); };
    if (!changed) { replace(); return; }
    Alert.alert(t.fresh, t.confirm, [
      { text: t.cancel, style: "cancel" },
      { text: t.discard, style: "destructive", onPress: replace },
      { text: t.save, onPress: () => { void save(editingNote).then((ok) => { if (ok) replace(); }); } },
    ]);
  };
  const fresh = () => confirmReplace(() => { const next = withDefaults(create()); setNote(next); savedSnapshot.current = JSON.stringify(next); setPageIndex(0); undoStack.current = []; redoStack.current = []; });
  const addPage = () => { playback.stop(); checkpoint(); resetTransient(); const pages = [...editingNote.pages, { id: id("page"), strokes: [], staffCount: settings.rowsPerPage ?? 7, stamps: [] }]; setNote((prev) => ({ ...prev, pages })); setPageIndex(pages.length - 1); };
  const setRows = (count: number) => {
    if (!Number.isInteger(count) || count < 1 || count > 200) return;
    try {
      const next = paginateNotebook(editingNote, count, () => id("page"));
      playback.stop(); checkpoint(); resetTransient(); setNote(next); setPageIndex(0); setOffset({ x: 0, y: 0 });
    } catch (e) { Alert.alert(ko ? "줄 수를 변경하지 않았습니다" : "Page layout unchanged", e instanceof Error ? e.message : String(e)); }
  };
  const saveNow = async () => {
    const ok = await save(editingNote);
    if (ok) {
      savedSnapshot.current = JSON.stringify(editingNote);
      setNote((previous) => previous === note ? editingNote : previous);
    }
    Alert.alert(ok ? t.saved : t.failed);
  };
  const loadPattern = (entry: PracticeEntry) => {
    if (entry.mode && entry.mode !== "beat" && entry.mode !== "bar") return;
    playback.stop();
    updateSettings({ source: entry, bpm: entry.bpm });
  };
  const togglePlayback = async () => {
    try {
      if (playback.running || playback.preparing) playback.stop();
      else if (tupletIds !== null || dragDraft) Alert.alert(ko ? "편집을 먼저 마쳐 주세요" : "Finish or cancel the pending edit first");
      else if (randomized.error) Alert.alert(t.playbackError, randomized.error);
      else { resetTransient(); await playback.start(performanceNote); }
    } catch { Alert.alert(t.playbackError); }
  };
  const onPaperTouch = (screen: StaffPoint, phase: "start" | "move" | "end" | "cancel") => {
    if (phase === "start" && (playback.running || playback.preparing || settings.random)) {
      playback.stop();
      if (settings.random) { updateSettings({ random: false }); return; }
      return;
    }
    if (phase === "cancel") {
      drawingRef.current = []; setDrawing([]); selectionGesture.current = null; setSelectionBox(null); panStart.current = null;
      eraseGesture.current = null; setEraseDraft(null);
      if (editSnapshot.current) { setSelection(editSnapshot.current.selection); setDragDraft(editSnapshot.current.draft); }
      editSnapshot.current = null; return;
    }
    if (toolPopup || panel || decision || objectEditor) return;
    if (phase === "start") editSnapshot.current = { selection, draft: dragDraft };
    const zoom = playback.running && settings.follow ? settings.playbackZoom : scale;
    const layoutScale = page.layoutScale ?? 1;
    const doc = screenToPaper({ x: screen.x / paperScale, y: screen.y / paperScale }, offset, zoom);
    doc.x /= layoutScale; doc.y /= layoutScale;
    if (tool === "pen" || tool === "erase") {
      doc.x = Math.max(0, Math.min(naturalPaperWidth(page), doc.x));
      doc.y = Math.max(0, Math.min((page.staffCount ?? 7) * ROW_HEIGHT - 1, doc.y));
    }
    if (dragDraft?.paste) {
      const bounds = selectionBounds(dragDraft.base, dragDraft.selection)!;
      setDragDraft({ ...dragDraft, delta: selectionDelta(dragDraft.base, dragDraft.selection, { x: doc.x - bounds.x - bounds.width / 2, y: doc.y - bounds.y - bounds.height / 2 }, settings.snap),
        awaiting: phase === "end", point: screen });
      return;
    }
    if (dragDraft?.awaiting) return;
    if (tool === "erase") {
      if (phase === "start") eraseGesture.current = { base: page, points: [] };
      const gesture = eraseGesture.current;
      if (!gesture) return;
      gesture.points.push(doc);
      const next = eraseNotebookGesture(gesture.base, gesture.points, eraserMode, 22, settings);
      if (phase === "end") {
        if (next !== gesture.base) {
          const boundary = gesture.base.stamps?.some((s) => isManualBar(s) && !next.stamps?.some((v) => v.id === s.id));
          const apply = () => commitDocument(pageDocument(pageIndex, next), !!settings.autoSpacing || !!boundary);
          if (boundary) Alert.alert(ko ? "마디 경계를 지울까요?" : "Delete bar boundary?", ko ? "마디 해석과 배치도 조정됩니다." : "Measure interpretation and layout will change.", [{ text: t.cancel, style: "cancel" }, { text: ko ? "삭제" : "Delete", onPress: apply }]);
          else apply();
        }
        eraseGesture.current = null; setEraseDraft(null); editSnapshot.current = null;
      } else setEraseDraft(next);
      return;
    }
    if (phase === "start") {
      if (tool === "move") { panStart.current = { point: screen, offset }; return; }
      if (tool === "pen") { drawingRef.current = [doc]; setDrawing([doc]); setSelection(emptySelection()); return; }
      if (tool === "select") {
        const hit = hitObject(page, doc);
        if (mode === "select" && selectionUnit === "row" && unitRows && rowAt(doc.y, page.staffCount ?? 7) >= unitRows.first && rowAt(doc.y, page.staffCount ?? 7) <= unitRows.last) {
          selectionGesture.current = { kind: "drag", start: doc, selection, base: page }; return;
        }
        if (mode === "select" && selectionUnit !== "object" && (!hit || !selection.stampIds.includes(hit.id) && !selection.strokeIds.includes(hit.id))) {
          const next = selectNotebookUnits(page, doc, doc, selectionUnit, settings);
          setSelection(next);
          if (selectionUnit === "row") setUnitRows({ first: rowAt(doc.y, page.staffCount ?? 7), last: rowAt(doc.y, page.staffCount ?? 7) });
          selectionGesture.current = { kind: "box", start: doc, selection: next, base: page };
          return;
        }
        if (mode === "notes") {
          const next = hit?.kind === "stamp" ? includeAttached(page, { stampIds: [hit.id], strokeIds: [] }) : selection;
          if (next.stampIds.length) {
            setSelection(next);
            selectionGesture.current = { kind: "drag", start: doc, selection: next, base: page };
          }
          return;
        }
        if (hit) {
          const key = hit.kind === "stamp" ? "stampIds" : "strokeIds";
          const next = includeAttached(page, selection[key].includes(hit.id) ? selection : { ...selection, [key]: [...selection[key], hit.id] });
          setSelection(next);
          selectionGesture.current = { kind: "drag", start: doc, selection: next, base: page, hitId: hit.id };
        } else {
          selectionGesture.current = { kind: "box", start: doc, selection, base: page };
          setSelectionBox(rectangle(doc, doc));
        }
      }
      return;
    }
    if (phase === "move" && tool === "pen" && drawingRef.current.length) { drawingRef.current = [...drawingRef.current, doc]; setDrawing(drawingRef.current); }
    if (phase === "move" && tool === "move" && panStart.current) {
      setOffset({ x: panStart.current.offset.x + (screen.x - panStart.current.point.x) / paperScale, y: panStart.current.offset.y + (screen.y - panStart.current.point.y) / paperScale });
    }
    const gesture = selectionGesture.current;
    if ((phase === "move" || phase === "end") && tool === "select" && gesture) {
      const distance = Math.hypot(doc.x - gesture.start.x, doc.y - gesture.start.y);
      if (gesture.kind === "box") {
        const box = rectangle(gesture.start, doc);
        const rowRange = { first: Math.min(rowAt(gesture.start.y, page.staffCount ?? 7), rowAt(doc.y, page.staffCount ?? 7)),
          last: Math.max(rowAt(gesture.start.y, page.staffCount ?? 7), rowAt(doc.y, page.staffCount ?? 7)) };
        if (selectionUnit === "row" && mode === "select") {
          setUnitRows(rowRange);
          setSelectionBox({ x: 38, y: rowRange.first * ROW_HEIGHT, width: naturalPaperWidth(page) - 76, height: (rowRange.last - rowRange.first + 1) * ROW_HEIGHT });
        } else setSelectionBox(phase === "end" ? null : box);
        setSelection(selectionUnit !== "object" && mode === "select"
          ? selectNotebookUnits(gesture.base, gesture.start, doc, selectionUnit, settings)
          : distance < 4 ? emptySelection() : selectRectangle(gesture.base, box));
      } else if (distance > 4) {
        const delta = selectionDelta(gesture.base, gesture.selection, { x: doc.x - gesture.start.x, y: doc.y - gesture.start.y }, settings.snap);
        if (phase === "end" && mode === "notes") {
          finishMove(gesture.base, gesture.selection, delta, false);
        } else {
          setDragDraft({ base: gesture.base, selection: gesture.selection, delta,
            paste: false, awaiting: phase === "end", point: screen });
        }
      } else if (phase === "end") {
        setDragDraft(null);
      }
    }
    if (phase === "end" && tool === "pen" && drawingRef.current.length) {
      const points = [...drawingRef.current, doc];
      const count = Math.min(200, Math.max(page.staffCount ?? 7, ...points.map((point) => Math.ceil((point.y + 1) / ROW_HEIGHT))));
      const previousRow = page.anchor && rowAt(page.anchor.y, count), nextRow = rowAt(doc.y, count);
      const next = { ...page, staffCount: count, anchor: doc, strokes: [...page.strokes, { id: id("stroke"), points, width: lineWidth, color: lineColor }],
        completedRows: settings.autoSpacing && previousRow !== undefined && previousRow !== nextRow ? [...new Set([...(page.completedRows ?? []), previousRow])] : page.completedRows };
      commitDocument(pageDocument(pageIndex, next), !!settings.autoSpacing);
      drawingRef.current = []; setDrawing([]);
    }
    if (phase === "end") { selectionGesture.current = null; panStart.current = null; editSnapshot.current = null; }
  };
  const beginStamp = (choice: { glyph: string; role: "normal" | "ghost" | "strong"; dotted: boolean }) => {
    playback.stop();
    setDragDraft(null); setSelection(emptySelection()); setSelectionBox(null);
    const targetIndex = isAttachedMark(choice.glyph) && note.lastNote ? editingNote.pages.findIndex((p) => p.id === note.lastNote!.pageId) : pageIndex;
    const targetPage = editingNote.pages[targetIndex] ?? page;
    const attached = attachedPosition(targetPage, choice.glyph, note.lastNote?.stampId);
    const writingTail = !attached && isTupletMember(choice.glyph) ? notebookWritingTail(editingNote, pageIndex) : undefined;
    const index = attached && targetIndex >= 0 ? targetIndex : writingTail?.pageIndex ?? pageIndex;
    const destination = attached ? targetPage : editingNote.pages[index] ?? page;
    if (index !== pageIndex) { setPageIndex(index); setOffset({ x: 0, y: 0 }); setTupletIds(null); }
    const point = attached?.point ?? stampPosition(destination, { ...settings, snap: isTupletMember(choice.glyph) && settings.snap }, writingTail?.stamp);
    const anchor = constrainStaffPoint(destination, point, isTupletMember(choice.glyph) && settings.snap);
    const stamp: StaffStamp = { id: id("stamp"), glyph: choice.glyph, ...anchor, size: 26,
      role: isNotebookNote(choice.glyph) ? choice.role : undefined, dotted: isTupletMember(choice.glyph) ? choice.dotted : undefined, attachTo: attached?.attachTo };
    const nextOpen = tupletIds !== null && isTupletMember(stamp.glyph) ? [...tupletIds, stamp.id] : undefined;
    const stamps = [...(destination.stamps ?? [])];
    const previous = writingTail?.stamp ?? (destination.anchor ? stamps.find((s) => !s.attachTo && Math.abs(s.x - destination.anchor!.x) < 1 && Math.abs(s.y - destination.anchor!.y) < 1)
      : note.lastNote && stamps.find((s) => s.id === note.lastNote!.stampId));
    if (!attached && previous && isMusic(stamp) && (settings.autoSpacing || rowAt(anchor.y, destination.staffCount ?? 7) === rowAt(previous.y, destination.staffCount ?? 7))) {
      const sourceRow = rowAt(previous.y, destination.staffCount ?? 7);
      const next = stamps.filter((s) => rowAt(s.y, destination.staffCount ?? 7) === sourceRow && s.x > previous.x && !s.attachTo && !s.generated).sort((a, b) => a.x - b.x)[0];
      stamp.x = next ? (previous.x + next.x) / 2 : previous.x + 28;
      stamp.y = previous.y; anchor.x = stamp.x; anchor.y = stamp.y;
    }
    const apply = () => {
      const updated: StaffPage = { ...destination, anchor: { x: stamp.x, y: stamp.y }, stamps: [...stamps, stamp] };
      const priorRow = destination.anchor && rowAt(destination.anchor.y, destination.staffCount ?? 7), newRow = rowAt(stamp.y, destination.staffCount ?? 7);
      if (settings.autoSpacing && priorRow !== undefined && priorRow !== newRow) updated.completedRows = [...new Set([...(destination.completedRows ?? []), priorRow])];
      commitDocument(pageDocument(index, updated, isNotebookNote(stamp.glyph) ? stamp.id : undefined), !!settings.autoSpacing, (result) => {
        if (nextOpen) setTupletIds(nextOpen);
        const p = result.pages.find((p) => p.stamps?.some((s) => s.id === stamp.id)) ?? updated;
        const targetIndex = result.pages.findIndex((p) => p.stamps?.some((s) => s.id === stamp.id));
        if (targetIndex >= 0) setPageIndex(targetIndex);
        setSelection(includeAttached(p, { stampIds: [stamp.id], strokeIds: [] })); setTool("select");
      }, nextOpen);
    };
    if (isManualBar(stamp)) {
      Alert.alert(ko ? "실제 마디 경계를 놓습니다" : "Place a musical barline", ko ? "이 경계를 기준으로 음악적 해석과 배치가 조정됩니다." : "Musical interpretation and layout will use this boundary.", [
        { text: t.cancel, style: "cancel" }, { text: ko ? "놓기" : "Place", onPress: () => {
          const candidate = pageDocument(index, { ...destination, anchor, stamps: [...stamps, stamp] });
          commitDocument(candidate, true);
        } },
      ]);
    } else apply();
  };
  const changeMode = (next: NotebookMode) => {
    if (next === "settings") { setPanel("settings"); return; }
    resetTransient(); setMode(next); setTool(next === "ink" ? "pen" : "select");
    closePanel();
  };
  const closeTuplet = () => {
    if (tupletIds === null) { setTupletIds([]); return; }
    const ids = tupletIds.filter((id) => page.stamps?.some((s) => s.id === id && isTupletMember(s.glyph)));
    if (ids.length < 2) { Alert.alert(ko ? "음표·쉼표를 두 개 이상 넣어 주세요" : "Add at least two notes or rests"); return; }
    const group = { id: id("tuplet"), stampIds: ids, ratio: standardTupletRatio(ids.length) };
    if ((page.stamps ?? []).filter((s) => ids.includes(s.id)).reduce((sum, s) => sum + musicalDuration(s, [group]), 0) > measureDuration(settings) + 1e-7) {
      layoutError(new Error("TUPLET_EXCEEDS_MEASURE")); return;
    }
    commitDocument(pageDocument(pageIndex, { ...page, tuplets: [...(page.tuplets ?? []), group] }),
      !!settings.autoSpacing, () => setTupletIds(null), []);
  };
  const autoSpace = () => {
    if (playback.running || playback.preparing || dragDraft || drawingRef.current.length || eraseGesture.current) return;
    commitDocument(editingNote, true);
  };
  const withInkChoice = (chosen: NotebookSelection, action: (chosen: NotebookSelection) => void, copying = false) => {
    if (!chosen.strokeIds.length) { action(chosen); return; }
    Alert.alert(ko ? "필기가 포함되어 있습니다. 같이 옮길까요?" : "Handwriting is included. Include it?",
      copying ? (ko ? "복사·클립보드에도 같은 선택을 적용합니다." : "This choice applies to the copied selection.") : undefined, [
      { text: t.cancel, style: "cancel" },
      { text: ko ? "음표·기호만" : "Notation only", onPress: () => action({ ...chosen, strokeIds: [] }) },
      { text: ko ? "같이 포함" : "Include handwriting", onPress: () => action(chosen) },
    ]);
  };
  const finishMove = (base: StaffPage, chosen: NotebookSelection, delta: StaffPoint, copy: boolean, paste = false, boundaryConfirmed = false) => {
    const boundary = base.stamps?.some((s) => chosen.stampIds.includes(s.id) && isManualBar(s));
    if (boundary && !boundaryConfirmed) {
      Alert.alert(ko ? "마디 경계를 변경합니다" : "Change bar boundary", ko ? "음악적 해석과 배치도 조정됩니다." : "This changes interpretation and layout.", [
        { text: t.cancel, style: "cancel" }, { text: ko ? "계속" : "Continue", onPress: () => finishMove(base, chosen, delta, copy, paste, true) },
      ]); return;
    }
    withInkChoice(chosen, (picked) => {
      if (mode === "select" && selectionUnit === "row" && unitRows && !copy && !paste) {
        const target = Math.max(0, Math.min((base.staffCount ?? 7) - 1, unitRows.first + Math.round(delta.y / ROW_HEIGHT)));
        const next = reorderNotebookRows(base, unitRows.first, unitRows.last, target, picked.strokeIds.length > 0);
        commitDocument(pageDocument(pageIndex, next), !!settings.autoSpacing, () => { setDragDraft(null); setUnitRows(null); setSelectionBox(null); setSelection(emptySelection()); });
        return;
      }
      const detached = (base.stamps ?? []).filter((s) => picked.stampIds.includes(s.id) && s.attachTo && !picked.stampIds.includes(s.attachTo));
      const source = { ...base, strokes: paste ? base.strokes.filter((s) => !chosen.strokeIds.includes(s.id) || picked.strokeIds.includes(s.id)) : base.strokes,
        stamps: base.stamps?.map((s) => detached.some((d) => d.id === s.id) ? { ...s, attachTo: undefined } : s) };
      const result = transformSelection(source, picked, delta, copy && !paste, () => id("object"));
      const anchor = result.page.stamps?.find((s) => result.selection.stampIds.includes(s.id) && isNotebookNote(s.glyph))
        ?? result.page.stamps?.find((s) => result.selection.stampIds.includes(s.id));
      const doCommit = (next: StaffPage) => {
        if (settings.autoSpacing && (copy || paste)) next = insertSelectionBeforeFollowing(next, result.selection);
        commitDocument(pageDocument(pageIndex, { ...next, anchor: anchor ? { x: anchor.x, y: anchor.y } : page.anchor }, anchor && isNotebookNote(anchor.glyph) ? anchor.id : undefined),
          !!settings.autoSpacing || !!boundary, () => { setSelection(result.selection); setDragDraft(null); if (detached.length) notify(ko ? "연결 해제 ↗" : "Attachment released ↗"); });
      };
      const movedNote = result.page.stamps?.find((s) => result.selection.stampIds.includes(s.id) && isNotebookNote(s.glyph));
      const overlap = movedNote && result.page.stamps?.find((s) => !result.selection.stampIds.includes(s.id) && isNotebookNote(s.glyph) &&
        Math.abs(s.x - movedNote.x) < 10 && rowAt(s.y, page.staffCount ?? 7) === rowAt(movedNote.y, page.staffCount ?? 7));
      const pendingGroup = movedNote && result.page.tuplets?.find((g) => !g.stampIds.includes(movedNote.id) && (() => {
        const members = result.page.stamps!.filter((s) => g.stampIds.includes(s.id));
        return members.length && members.every((s) => rowAt(s.y, page.staffCount ?? 7) === rowAt(movedNote.y, page.staffCount ?? 7)) &&
          movedNote.x > Math.min(...members.map((s) => s.x)) && movedNote.x < Math.max(...members.map((s) => s.x));
      })());
      if (pendingGroup && tupletIds === null) {
        Alert.alert(ko ? "잇단음표에 포함할까요?" : "Include in this tuplet?", ko ? "작성을 마친 묶음 안에 놓았습니다." : "This position is inside a completed group.", [
          { text: t.cancel, style: "cancel" },
          { text: ko ? "별개 음표로" : "Keep separate", onPress: () => doCommit(result.page) },
          { text: ko ? "포함" : "Include", onPress: () => doCommit({ ...result.page, tuplets: result.page.tuplets?.map((g) => g.id === pendingGroup.id
            ? { ...g, stampIds: [...g.stampIds, movedNote!.id], ratio: standardTupletRatio(g.stampIds.length + 1) } : g) }) },
        ]);
      } else if (overlap && movedNote) {
        Alert.alert(ko ? "동시에 연주하는 음표인가요?" : "Are these simultaneous notes?", undefined, [
          { text: t.cancel, style: "cancel" },
          { text: ko ? "순서대로" : "Sequential", onPress: () => doCommit(result.page) },
          { text: ko ? "동시음" : "Together", onPress: () => { const chordId = overlap.chordId ?? id("chord");
            doCommit({ ...result.page, stamps: result.page.stamps?.map((s) => s.id === movedNote.id || s.id === overlap.id ? { ...s, chordId, x: overlap.x } : s) }); } },
        ]);
      } else doCommit(result.page);
    }, copy);
  };
  const commitDrag = (copy: boolean) => {
    if (!dragDraft) return;
    finishMove(dragDraft.base, dragDraft.selection, dragDraft.delta, copy, dragDraft.paste);
  };
  const saveClipboard = () => {
    if (!selectionCount(selection)) return;
    withInkChoice(selection, (picked) => {
      const entry = { id: id("clipboard"), label: `${ko ? "선택 묶음" : "Selection"} ${clipboard.length + 1}`, count: selectionCount(picked), page: captureSelection(page, picked) };
      setClipboard((previous) => [...previous, entry]);
    }, true);
  };
  const pasteClipboard = (key: string) => {
    const entry = clipboard.find((item) => item.id === key);
    if (!entry) return;
    playback.stop();
    const copied = transformSelection(entry.page, { strokeIds: entry.page.strokes.map((s) => s.id), stampIds: (entry.page.stamps ?? []).map((s) => s.id) }, { x: 0, y: 0 }, true, () => id("object"));
    // transformSelection(copy) retains originals; include only the fresh objects.
    const freshStrokes = copied.page.strokes.filter((s) => copied.selection.strokeIds.includes(s.id));
    const freshStamps = (copied.page.stamps ?? []).filter((s) => copied.selection.stampIds.includes(s.id));
    const base = { ...page, strokes: [...page.strokes, ...freshStrokes], stamps: [...(page.stamps ?? []), ...freshStamps],
      tuplets: [...(page.tuplets ?? []), ...(copied.page.tuplets ?? []).filter((t) => t.stampIds.every((id) => copied.selection.stampIds.includes(id)))] };
    const anchor = stampPosition(page, settings);
    setSelection(copied.selection); setDragDraft({ base, selection: copied.selection, delta: selectionDelta(base, copied.selection, anchor, settings.snap), paste: true, awaiting: true, point: { x: 40, y: 70 } });
    setTool("select");
  };
  const deleteSelection = () => {
    const boundary = page.stamps?.some((s) => selection.stampIds.includes(s.id) && isManualBar(s));
    const apply = () => { playback.stop(); commitDocument(pageDocument(pageIndex, removeSelection(page, selection)), !!settings.autoSpacing || !!boundary, () => { setSelection(emptySelection()); setDragDraft(null); }); };
    if (page.stamps?.some((s) => selection.stampIds.includes(s.id) && isManualBar(s))) Alert.alert(ko ? "마디 경계를 지울까요?" : "Delete bar boundary?", ko ? "마디 해석과 배치도 조정됩니다." : "This changes measure interpretation.", [{ text: t.cancel, style: "cancel" }, { text: ko ? "삭제" : "Delete", onPress: apply }]);
    else apply();
  };
  const resizeSelection = (factor: number) => {
    const bounds = selectionBounds(page, selection); if (!bounds) return;
    const origin = { x: bounds.x, y: bounds.y };
    const transform = (p: StaffPoint) => ({ x: origin.x + (p.x - origin.x) * factor, y: origin.y + (p.y - origin.y) * factor });
    const next = { ...page, strokes: page.strokes.map((s) => selection.strokeIds.includes(s.id) ? { ...s, width: s.width * factor, points: s.points.map(transform) } : s),
      stamps: page.stamps?.map((s) => selection.stampIds.includes(s.id) ? { ...s, ...transform(s), size: Math.max(4, Math.min(120, s.size * factor)) } : s) };
    const nextBounds = selectionBounds(next, selection)!;
    if (nextBounds.x + nextBounds.width > 900 || nextBounds.y + nextBounds.height > (page.staffCount ?? 7) * ROW_HEIGHT) return;
    commitDocument(pageDocument(pageIndex, next), !!settings.autoSpacing);
  };
  const selectedGroup = page.tuplets?.find((g) => g.stampIds.some((id) => selection.stampIds.includes(id)));
  const editObject = (stampId: string, patch: Partial<StaffStamp>, remove = false) => {
    const next = remove ? removeSelection(page, { stampIds: [stampId], strokeIds: [] }, false)
      : { ...page, stamps: page.stamps?.map((s) => s.id === stampId ? { ...s, ...patch, durationBeats: undefined, generated: false } : s) };
    const group = next.tuplets?.find((g) => g.id === selectedGroup?.id || g.stampIds.includes(stampId));
    if (group && next.stamps!.filter((s) => group.stampIds.includes(s.id)).reduce((sum, s) => sum + musicalDuration(s, [group]), 0) > measureDuration(settings) + 1e-7) {
      layoutError(new Error("TUPLET_EXCEEDS_MEASURE")); return;
    }
    commitDocument(pageDocument(pageIndex, next), !!settings.autoSpacing, () => {
      if (remove) setSelection((s) => ({ ...s, stampIds: s.stampIds.filter((id) => id !== stampId) }));
    });
  };
  const editRatio = (actual: number, normal: number) => {
    if (!selectedGroup) return;
    const next = { ...page, tuplets: page.tuplets?.map((g) => g.id === selectedGroup.id ? { ...g, ratio: { actual, normal } } : g) };
    const group = next.tuplets!.find((g) => g.id === selectedGroup.id)!;
    if (next.stamps!.filter((s) => group.stampIds.includes(s.id)).reduce((sum, s) => sum + musicalDuration(s, [group]), 0) > measureDuration(settings) + 1e-7) { layoutError(new Error("TUPLET_EXCEEDS_MEASURE")); return; }
    commitDocument(pageDocument(pageIndex, next), !!settings.autoSpacing);
  };
  const following = playback.running && settings.follow;
  const dockLayoutKey = dockLayoutVersion + viewport.width * 10000 + viewport.height;
  const beginDockMove = () => {
    onPaperTouch({ x: 0, y: 0 }, "cancel");
    setToolPopup(null); setDockMoving(true);
    setDockLayoutVersion((version) => version + 1);
  };
  const endDockMove = () => {
    setDockMoving(false);
    setDockLayoutVersion((version) => version + 1);
  };
    const zoom = following ? settings.playbackZoom : scale;
  const draftPage = dragDraft ? transformSelection(dragDraft.base, dragDraft.selection, dragDraft.delta).page : null;
  return (
    <View testID="notebook-workspace" style={[styles.root, { backgroundColor: "#ffffff" }]}>
      <View testID="notebook-paper-stage" ref={paperStageRef} style={styles.paperStage} onLayout={(event) => {
        setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });
        paperStageRef.current?.measureInWindow((_x, y) => setPaperTop(y));
      }}>
        <ScrollView testID="notebook-horizontal-scroll" ref={horizontalScroll} horizontal style={styles.paperScroll}
          disableScrollViewPanResponder scrollEnabled={Platform.OS === "web" || playback.running}
          scrollEventThrottle={16} onScroll={(event) => { paperScrollOffset.current.x = event.nativeEvent.contentOffset.x; }}
          contentContainerStyle={{ minWidth: "100%" }}
          showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ScrollView testID="notebook-vertical-scroll" ref={paperScroll} style={{ height: viewport.height, width: Math.max(viewport.width, PAPER_WIDTH * paperScale * zoom) }}
          disableScrollViewPanResponder scrollEnabled={Platform.OS === "web" || playback.running}
          scrollEventThrottle={16} onScroll={(event) => { paperScrollOffset.current.y = event.nativeEvent.contentOffset.y; }}
          contentContainerStyle={[styles.paperContent, { paddingTop: following ? viewport.height / 2 : 72,
            paddingBottom: following ? viewport.height / 2 : 148 }]}
          nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <NotebookPaper
            settings={settings}
            page={settings.random || playback.running ? visiblePage : eraseDraft ?? draftPage ?? page} width={PAPER_WIDTH * paperScale * zoom} height={visibleHeight * paperScale * zoom * (visiblePage.layoutScale ?? 1)}
            paperScale={paperScale} zoom={playback.running && settings.follow ? settings.playbackZoom : scale}
            offset={offset} tool={playback.running ? "move" : tool} lineWidth={lineWidth} lineColor={lineColor}
            drawing={drawing} pendingGlyph={null} preview={null}
            selection={playback.running ? undefined : selection} selectionBox={selectionBox}
            openTupletIds={tupletIds ?? undefined}
            onTouch={toolPopup || panel || dockMoving || decision || objectEditor ? undefined : onPaperTouch}
            onPan={(delta) => setOffset((old) => ({ x: old.x + delta.x / paperScale, y: old.y + delta.y / paperScale }))}
          />
        </ScrollView></ScrollView>
        {panel === "menu" ? (
          <View style={[StyleSheet.absoluteFill, { zIndex: 35 }]} pointerEvents="box-none">
            <Pressable testID="notebook-panel-close" style={styles.dismissSurface} onPress={closePanel} accessibilityLabel={t.close} />
            <View style={[styles.modePopover, { top: Math.max(8, Math.min(viewport.height - 58, viewport.height * 0.45)), right: 40 }]} pointerEvents="box-none">
              <NotebookModeMenu ko={ko} mode={mode} onMode={changeMode} />
            </View>
          </View>
        ) : null}
        <Pressable ref={rightToggleRef} accessibilityRole="button" accessibilityLabel={panel === "menu" ? t.close : (ko ? "모드와 설정" : "Modes and settings")} accessibilityState={{ expanded: panel === "menu" }} testID="notebook-right-toggle" onPress={() => panel === "menu" ? closePanel() : openPanel("menu")} style={[styles.edgeHandle, styles.rightHandle, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="chevron-back" size={17} color={C.text} />
        </Pressable>
        {playback.error || randomized.error || feedback || randomized.unchanged ? <View testID="notebook-feedback" accessibilityLiveRegion="polite" style={styles.playbackStatus}><Text style={{ color: C.accent }}>{playback.error || (randomized.error ? (ko ? "반복·이동 기호의 유효한 랜덤 배치를 만들지 못했습니다. 기호를 확인하거나 다시 섞어 주세요." : "No valid random navigation. Check the signs or reshuffle.") : feedback || (ko ? "이번 결과는 기존 순서와 같습니다. 전체가 기호로 묶였다면 내부 섞기를 켜거나 다시 섞어 주세요." : "This order is unchanged. For one protected section, enable inner shuffle or reshuffle."))}</Text></View> : null}
        {playback.running ? <View pointerEvents="none" style={[styles.playbackTag, { backgroundColor: C.surface }]}><Text style={{ color: C.text, fontSize: 11 }}>{settings.source?.label ?? t.click}</Text></View> : null}
        {dragDraft?.awaiting && !panel && <View testID="notebook-drop-actions" style={[styles.previewActions, { bottom: undefined, left: Math.max(8, Math.min(viewport.width - 315, dragDraft.point.x - paperScrollOffset.current.x)), top: Math.max(8, Math.min(viewport.height - 108, dragDraft.point.y - paperScrollOffset.current.y)), alignSelf: "auto", maxWidth: viewport.width - 16, flexWrap: "wrap" }]}>
          <Pressable testID="notebook-drop-cancel" onPress={() => { setDragDraft(null); if (dragDraft.paste) setSelection(emptySelection()); }} style={styles.previewButton}><Text>{t.cancel}</Text></Pressable>
          {!dragDraft.paste && <Pressable testID="notebook-drop-copy" onPress={() => commitDrag(true)} style={styles.previewButton}><Text>{ko ? "여기에 복사" : "Copy here"}</Text></Pressable>}
          <Pressable testID="notebook-drop-move" onPress={() => commitDrag(false)} style={styles.previewButton}><Text>{dragDraft.paste ? (ko ? "여기에 붙여넣기" : "Paste here") : (ko ? "여기로 이동" : "Move here")}</Text></Pressable>
        </View>}
      <NotebookFloatingDock id="playback" ko={ko} bounds={viewport} maxWidth={424} edge="top"
        active={frontDock === "playback"} onActivate={() => setFrontDock("playback")}
        onDragStart={beginDockMove} onDragEnd={endDockMove}>
        <NotebookPlaybackBar ko={ko} settings={settings} running={playback.running} preparing={playback.preparing}
          layoutKey={dockLayoutKey} pickerTop={paperTop} pickerBottom={paperTop + viewport.height}
          onSettings={updateSettings} onToggle={() => void togglePlayback()} />
      </NotebookFloatingDock>
      <NotebookFloatingDock id="tools" ko={ko} bounds={viewport} maxWidth={mode === "notes" ? 600 : mode === "ink" ? inkDockWidth : 680} edge="bottom"
        active={frontDock === "tools"} onActivate={() => setFrontDock("tools")}
        onDragStart={beginDockMove} onDragEnd={endDockMove}>
      {tupletIds !== null && <View style={styles.tupletStatus}><Text>{ko ? `잇단음표 작성 중 · ${tupletIds.length}개` : `Open tuplet · ${tupletIds.length}`}</Text><Pressable testID="notebook-tuplet-cancel" onPress={() => setTupletIds(null)} style={{ padding: 8 }}><Text>{t.cancel}</Text></Pressable></View>}
      {mode !== "ink" && mode !== "notes" && <View style={{ flexDirection: "row", justifyContent: "flex-end", backgroundColor: "#fffdf8" }}>
        <Pressable accessibilityLabel={t.undo} disabled={!undoStack.current.length} onPress={undo} style={{ padding: 10, opacity: undoStack.current.length ? 1 : 0.35 }}><Ionicons name="arrow-undo" size={18} color="#675d50" /></Pressable>
        <Pressable accessibilityLabel={t.redo} disabled={!redoStack.current.length} onPress={redo} style={{ padding: 10, opacity: redoStack.current.length ? 1 : 0.35 }}><Ionicons name="arrow-redo" size={18} color="#675d50" /></Pressable>
      </View>}
      <NotebookBottomTools ko={ko} mode={mode} tool={tool} lineWidth={lineWidth} scale={scale} pickerTop={paperTop}
        onPreferredWidth={mode === "ink" ? fitInkDock : undefined}
        pickerBottom={paperTop + viewport.height} layoutKey={dockLayoutKey}
        onAutoSpace={autoSpace} autoSpaceDisabled={playback.running || playback.preparing || !!dragDraft}
        lineColor={lineColor} onColor={setLineColor} eraserMode={eraserMode} onEraserMode={setEraserMode}
        toolPopup={toolPopup} onToolPopup={(next) => { resetTransient(); setToolPopup(next); }}
        canUndo={undoStack.current.length > 0} canRedo={redoStack.current.length > 0}
        onTool={(next) => { playback.stop(); setDragDraft(null); setTool(next); }} onWidth={setLineWidth}
        onZoom={(value) => { playback.stop(); setScale(Math.max(0.35, Math.min(2.5, value))); }} onUndo={undo} onRedo={redo}
        onChoose={beginStamp} onTuplet={closeTuplet} tupletCount={tupletIds?.length ?? null}
        selectionCount={selectionCount(selection) || (unitRows ? unitRows.last - unitRows.first + 1 : 0)} onClearSelection={() => { setSelection(emptySelection()); setDragDraft(null); setSelectionBox(null); setUnitRows(null); }}
        selectionUnit={selectionUnit} onSelectionUnit={(unit) => { setSelectionUnit(unit); setSelection(emptySelection()); setDragDraft(null); setUnitRows(null); setSelectionBox(null); }}
        onEditSelection={() => { playback.stop(); setObjectEditor(true); }}
        onSaveClipboard={saveClipboard} onDeleteSelection={deleteSelection} onResizeSelection={resizeSelection}
        clipboard={clipboard} onPaste={pasteClipboard} />
      </NotebookFloatingDock>
      </View>
      {panel === "settings" ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 40 }]} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={closePanel} accessibilityLabel={t.close} />
          <View style={[styles.drawer, styles.drawerRight, { backgroundColor: "#fffdf8", borderColor: "#ded6c9" }]}>
            <View style={[styles.drawerHead, { borderBottomColor: C.border }]}>
              <Text style={[styles.drawerTitle, { color: "#302b25" }]}>{t.settings}</Text>
              <Pressable testID="notebook-panel-close" accessibilityLabel={t.close} onPress={closePanel} hitSlop={12} style={styles.closeButton}><Ionicons name="close" size={22} color="#302b25" /></Pressable>
            </View>
            <NotebookSettingsPanel
              ko={ko} t={t} note={note} settings={settings} patterns={patterns} patternLoading={patternLoading} patternError={patternError}
              notebooks={notebooks} error={error}
              onSettings={updateSettings} onPattern={loadPattern}
              onRefresh={() => void refresh()} onNew={fresh} onSave={() => void saveNow()} onOpenCapture={onOpenCapture ? () => requestExit(onOpenCapture) : undefined}
              onLoad={(saved) => confirmReplace(() => { const loaded = withDefaults(saved); savedSnapshot.current = JSON.stringify(loaded); setNote(loaded); setPageIndex(0); undoStack.current = []; redoStack.current = []; })}
              onDelete={(saved) => Alert.alert(t.notes, ko ? "이 노트를 삭제할까요?" : "Delete this notebook?", [{ text: t.cancel, style: "cancel" }, { text: ko ? "삭제" : "Delete", style: "destructive", onPress: () => void remove(saved.id) }])}
              onTitle={(title) => setNote((prev) => ({ ...prev, title }))}
              pageIndex={pageIndex} onPage={(index) => { playback.stop(); resetTransient(); setPageIndex(index); setOffset({ x: 0, y: 0 }); }}
              onAddPage={addPage} onRows={setRows} onZoom={setScale} scale={scale}
              onReshuffle={() => updateSettings({ randomSeed: (settings.randomSeed ?? 1) + 1 })}
            />
          </View>
        </View>
      ) : null}
      {objectEditor && <View style={{ position: "absolute", bottom: 82, left: 8, right: 8, maxHeight: "70%", zIndex: 48 }}>
        <NotebookObjectEditor ko={ko} stamps={(page.stamps ?? []).filter((s) => selection.stampIds.includes(s.id))} group={selectedGroup}
          onChange={editObject} onRatio={editRatio} onDelete={(stampId) => editObject(stampId, {}, true)} onClose={() => setObjectEditor(false)} />
      </View>}
      <Modal visible={!!decision} transparent animationType="fade" onRequestClose={() => setDecision(null)}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "rgba(0,0,0,.4)" }}>
          <View testID="notebook-layout-choice" accessibilityViewIsModal style={{ width: 360, maxWidth: "100%", maxHeight: "90%", borderRadius: 16, padding: 18, backgroundColor: "#fffdf8" }}>
            <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: "700", marginBottom: 8 }}>{decision?.title}</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, marginBottom: 14 }}>{decision?.message}</Text>
            <ScrollView>{decision?.options.map((option, i) => <Pressable key={i} testID={`notebook-layout-option-${i}`} accessibilityRole="button" onPress={() => { setDecision(null); option.action(); }} style={{ minHeight: 46, justifyContent: "center", padding: 10, marginBottom: 6, borderRadius: 9, backgroundColor: "#eee7db" }}><Text>{option.label}</Text></Pressable>)}</ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setDecision(null)} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}><Text>{t.cancel}</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, overflow: "hidden" },
  paperStage: { flex: 1, minHeight: 0, position: "relative" },
  paperScroll: { width: "100%", flex: 1 },
  paperContent: { minHeight: "100%", alignItems: "flex-start" },
  edgeHandle: { position: "absolute", top: "45%", width: 32, height: 58, alignItems: "center", justifyContent: "center", borderWidth: 1, elevation: 5, shadowColor: "#181714", shadowOpacity: 0.14, shadowRadius: 6 },
  leftHandle: { left: 0, borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  rightHandle: { right: 0, borderTopLeftRadius: 14, borderBottomLeftRadius: 14, zIndex: 36 },
  dismissSurface: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent" },
  modePopover: { position: "absolute", zIndex: 2, maxWidth: "100%" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(21,20,18,0.25)" },
  drawer: { position: "absolute", top: 0, bottom: 0, width: 344, maxWidth: "88%", borderWidth: 1, elevation: 12, shadowColor: "#201e1a", shadowOpacity: 0.2, shadowRadius: 18 },
  drawerLeft: { left: 0, borderTopRightRadius: 15, borderBottomRightRadius: 15 },
  drawerRight: { right: 0, borderTopLeftRadius: 15, borderBottomLeftRadius: 15 },
  drawerHead: { minHeight: 54, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  drawerTitle: { fontSize: 15, fontWeight: "700" },
  closeButton: { padding: 7 },
  playbackTag: { position: "absolute", bottom: 12, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, elevation: 2 },
  playbackStatus: { position: "absolute", top: 10, alignSelf: "center", padding: 8 },
  previewActions: { position: "absolute", bottom: 16, alignSelf: "center", flexDirection: "row", gap: 10, padding: 6, borderRadius: 12, backgroundColor: "#ece7de", elevation: 5 },
  previewButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8, backgroundColor: "#ffffff" },
  tupletStatus: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#f8f1df", minHeight: 30 },
});

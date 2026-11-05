import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert } from "@/lib/alert";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLabScoreNotebook } from "@/hooks/useLabScoreNotebook";
import { useNotebookPlayback } from "@/hooks/useNotebookPlayback";
import { DEFAULT_NOTEBOOK_SETTINGS, type NotebookSettings, type StaffNotebook, type StaffPage, type StaffPoint, type StaffStamp } from "@/lib/staff-notebook";
import { loadPracticeBook, type PracticeEntry } from "@/lib/storage";
import { constrainStaffPoint, fitNotebookPage, materializeRows, stampPosition, screenToPaper, PAPER_WIDTH, ROW_HEIGHT } from "@/lib/staff-notebook-layout";
import { NotebookModeMenu, type NotebookMode } from "@/components/lab-score/notebook/NotebookModeMenu";
import { NotebookBottomTools } from "@/components/lab-score/notebook/NotebookBottomTools";
import { NotebookPlaybackBar } from "@/components/lab-score/notebook/NotebookPlaybackBar";
import { NotebookFloatingDock } from "@/components/lab-score/notebook/NotebookFloatingDock";
import { NotebookSettingsPanel } from "@/components/lab-score/notebook/NotebookSettingsPanel";
import { NotebookPaper } from "@/components/lab-score/notebook/NotebookPaper";
import { attachedPosition, captureSelection, emptySelection, hitObject, includeAttached, isAttachedMark, isNotebookNote, isTupletMember, paginateNotebook, rectangle, removeSelection, selectRectangle, selectionBounds, selectionCount, selectionDelta, transformSelection, type NotebookClipboard, type NotebookSelection, type NotebookBounds } from "@/lib/notebook-editing";
import { eraseNotebookGesture, type NotebookEraserMode } from "@/lib/notebook-erasing";
import { spaceNotebookRow } from "@/lib/notebook-spacing";

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
  const [selectionBox, setSelectionBox] = useState<NotebookBounds | null>(null);
  const [clipboard, setClipboard] = useState<NotebookClipboard[]>([]);
  const [tupletIds, setTupletIds] = useState<string[] | null>(null);
  const [dragDraft, setDragDraft] = useState<{ selection: NotebookSelection; delta: StaffPoint; base: StaffPage; paste: boolean; awaiting: boolean; point: StaffPoint } | null>(null);
  const [drawing, setDrawing] = useState<StaffPoint[]>([]);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [dockMoving, setDockMoving] = useState(false);
  const [dockLayoutVersion, setDockLayoutVersion] = useState(0);
  const [frontDock, setFrontDock] = useState<"playback" | "tools">("tools");
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
  const playbackPage = useMemo(() => playback.running ? materializeRows(editingNote, playback.rows) : null, [playback.running, playback.rows, editingNote]);
  const visiblePage = playbackPage ?? page;
  const visibleHeight = (visiblePage.staffCount ?? 7) * ROW_HEIGHT;
  const resetTransient = () => {
    setSelection(emptySelection()); setSelectionBox(null); setDragDraft(null); selectionGesture.current = null;
    setDrawing([]); drawingRef.current = []; setTupletIds(null); panStart.current = null;
    eraseGesture.current = null; setEraseDraft(null); editSnapshot.current = null;
  };
  const updateSettings = (patch: Partial<NotebookSettings>) => {
    if ((playback.running || playback.preparing) && ["source", "bpm", "random", "lineUnit", "beatsPerMeasure", "followSymbols"].some((key) => key in patch)) playback.stop();
    setNote((prev) => ({ ...prev, settings: { ...DEFAULT_NOTEBOOK_SETTINGS, ...(prev.settings ?? {}), ...patch } }));
  };
  const replacePage = (index: number, next: StaffPage, lastStampId?: string) => setNote((prev) => ({
    ...prev, pages: prev.pages.map((item, i) => i === index ? next : item),
    lastNote: lastStampId ? { pageId: next.id, stampId: lastStampId } : prev.lastNote?.pageId === next.id && !next.stamps?.some((stamp) => stamp.id === prev.lastNote!.stampId) ? undefined : prev.lastNote,
  }));
  const checkpoint = () => { undoStack.current = [...undoStack.current.slice(-39), editingNote]; redoStack.current = []; };
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
    const ratio = paperScale * settings.playbackZoom;
    paperScroll.current?.scrollTo({ y: (playback.position.row * ROW_HEIGHT + 102) * ratio, animated: false });
  }, [playback.running, playback.position, settings.follow, settings.playbackZoom, paperScale, viewport.height]);
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
      else { resetTransient(); await playback.start(editingNote); }
    } catch { Alert.alert(t.playbackError); }
  };
  const onPaperTouch = (screen: StaffPoint, phase: "start" | "move" | "end" | "cancel") => {
    if (phase === "cancel") {
      drawingRef.current = []; setDrawing([]); selectionGesture.current = null; setSelectionBox(null); panStart.current = null;
      eraseGesture.current = null; setEraseDraft(null);
      if (editSnapshot.current) { setSelection(editSnapshot.current.selection); setDragDraft(editSnapshot.current.draft); }
      editSnapshot.current = null; return;
    }
    if (toolPopup || panel) return;
    if (phase === "start") editSnapshot.current = { selection, draft: dragDraft };
    const zoom = playback.running && settings.follow ? settings.playbackZoom : scale;
    const doc = screenToPaper({ x: screen.x / paperScale, y: screen.y / paperScale }, offset, zoom);
    if (tool === "pen" || tool === "erase") {
      doc.x = Math.max(0, Math.min(PAPER_WIDTH, doc.x));
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
        if (next !== gesture.base) { checkpoint(); replacePage(pageIndex, next); }
        eraseGesture.current = null; setEraseDraft(null); editSnapshot.current = null;
      } else setEraseDraft(next);
      return;
    }
    if (phase === "start") {
      if (tool === "move") { panStart.current = { point: screen, offset }; return; }
      if (tool === "pen") { drawingRef.current = [doc]; setDrawing([doc]); setSelection(emptySelection()); return; }
      if (tool === "select") {
        const hit = hitObject(page, doc);
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
        setSelectionBox(phase === "end" ? null : box);
        setSelection(distance < 4 ? emptySelection() : selectRectangle(gesture.base, box));
      } else if (distance > 4) {
        const delta = selectionDelta(gesture.base, gesture.selection, { x: doc.x - gesture.start.x, y: doc.y - gesture.start.y }, settings.snap);
        if (phase === "end" && mode === "notes") {
          const result = transformSelection(gesture.base, gesture.selection, delta);
          const anchor = result.page.stamps?.find((s) => result.selection.stampIds.includes(s.id) && isNotebookNote(s.glyph))
            ?? result.page.stamps?.find((s) => result.selection.stampIds.includes(s.id));
          checkpoint();
          replacePage(pageIndex, { ...result.page, anchor: anchor ? { x: anchor.x, y: anchor.y } : page.anchor });
          setSelection(result.selection); setDragDraft(null);
        } else {
          setDragDraft({ base: gesture.base, selection: gesture.selection, delta,
            paste: false, awaiting: phase === "end", point: screen });
        }
      } else if (phase === "end") {
        setDragDraft(null);
      }
    }
    if (phase === "end" && tool === "pen" && drawingRef.current.length) {
      checkpoint();
      const points = [...drawingRef.current, doc];
      const count = Math.min(200, Math.max(page.staffCount ?? 7, ...points.map((point) => Math.ceil((point.y + 1) / ROW_HEIGHT))));
      replacePage(pageIndex, { ...page, staffCount: count, anchor: doc, strokes: [...page.strokes, { id: id("stroke"), points, width: lineWidth, color: lineColor }] });
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
    const index = attached && targetIndex >= 0 ? targetIndex : pageIndex;
    const destination = attached ? targetPage : page;
    if (index !== pageIndex) { setPageIndex(index); setOffset({ x: 0, y: 0 }); setTupletIds(null); }
    const point = attached?.point ?? stampPosition(destination, { ...settings, snap: isTupletMember(choice.glyph) && settings.snap });
    const anchor = constrainStaffPoint(destination, point, isTupletMember(choice.glyph) && settings.snap);
    checkpoint();
    const stamp: StaffStamp = { id: id("stamp"), glyph: choice.glyph, ...anchor, size: 26,
      role: isNotebookNote(choice.glyph) ? choice.role : undefined, dotted: isTupletMember(choice.glyph) ? choice.dotted : undefined, attachTo: attached?.attachTo };
    replacePage(index, { ...destination, anchor, stamps: [...(destination.stamps ?? []), stamp] }, isNotebookNote(stamp.glyph) ? stamp.id : undefined);
    if (index === pageIndex && tupletIds !== null && isTupletMember(stamp.glyph)) setTupletIds([...tupletIds, stamp.id]);
    setSelection(includeAttached(destination, { stampIds: [stamp.id], strokeIds: [] })); setTool("select");
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
    checkpoint(); replacePage(pageIndex, { ...page, tuplets: [...(page.tuplets ?? []), { id: id("tuplet"), stampIds: ids }] }); setTupletIds(null);
  };
  const autoSpace = () => {
    if (playback.running || playback.preparing || dragDraft || drawingRef.current.length || eraseGesture.current) return;
    const result = spaceNotebookRow(page);
    if (result.reason === "crowded") {
      Alert.alert(ko ? "간격을 정리하지 않았습니다" : "Spacing unchanged",
        ko ? "이 줄에 객체가 너무 많거나 넓어 같은 간격으로 놓을 수 없습니다. 일부를 다른 줄로 옮긴 뒤 다시 시도해 주세요."
          : "This row is too crowded to space safely. Move some objects to another row and try again.");
      return;
    }
    if (result.reason !== "changed") return;
    checkpoint(); replacePage(pageIndex, result.page);
  };
  const commitDrag = (copy: boolean) => {
    if (!dragDraft) return;
    checkpoint();
    const result = transformSelection(dragDraft.base, dragDraft.selection, dragDraft.delta, copy && !dragDraft.paste, () => id("object"));
    const last = (copy || dragDraft.paste) ? result.page.stamps?.filter((s) => result.selection.stampIds.includes(s.id) && isNotebookNote(s.glyph)).at(-1) : undefined;
    replacePage(pageIndex, result.page, last?.id); setSelection(result.selection); setDragDraft(null);
  };
  const saveClipboard = () => {
    if (!selectionCount(selection)) return;
    const entry = { id: id("clipboard"), label: `${ko ? "선택 묶음" : "Selection"} ${clipboard.length + 1}`, count: selectionCount(selection), page: captureSelection(page, selection) };
    setClipboard((previous) => [...previous, entry]);
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
    playback.stop(); checkpoint(); replacePage(pageIndex, removeSelection(page, selection)); setSelection(emptySelection()); setDragDraft(null);
  };
  const resizeSelection = (factor: number) => {
    const bounds = selectionBounds(page, selection); if (!bounds) return;
    const origin = { x: bounds.x, y: bounds.y };
    const transform = (p: StaffPoint) => ({ x: origin.x + (p.x - origin.x) * factor, y: origin.y + (p.y - origin.y) * factor });
    const next = { ...page, strokes: page.strokes.map((s) => selection.strokeIds.includes(s.id) ? { ...s, width: s.width * factor, points: s.points.map(transform) } : s),
      stamps: page.stamps?.map((s) => selection.stampIds.includes(s.id) ? { ...s, ...transform(s), size: Math.max(4, Math.min(120, s.size * factor)) } : s) };
    const nextBounds = selectionBounds(next, selection)!;
    if (nextBounds.x + nextBounds.width > 900 || nextBounds.y + nextBounds.height > (page.staffCount ?? 7) * ROW_HEIGHT) return;
    checkpoint(); replacePage(pageIndex, next);
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
            page={playback.running ? visiblePage : eraseDraft ?? draftPage ?? page} width={PAPER_WIDTH * paperScale * zoom} height={visibleHeight * paperScale * zoom}
            paperScale={paperScale} zoom={playback.running && settings.follow ? settings.playbackZoom : scale}
            offset={offset} tool={playback.running ? "move" : tool} lineWidth={lineWidth} lineColor={lineColor}
            drawing={drawing} pendingGlyph={null} preview={null}
            selection={playback.running ? undefined : selection} selectionBox={selectionBox}
            openTupletIds={tupletIds ?? undefined}
            onTouch={playback.running || toolPopup || panel || dockMoving ? undefined : onPaperTouch}
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
        {playback.error ? <View style={styles.playbackStatus}><Text style={{ color: C.accent }}>{playback.error}</Text></View> : null}
        {playback.running ? <View pointerEvents="none" style={[styles.playbackTag, { backgroundColor: C.surface }]}><Text style={{ color: C.text, fontSize: 11 }}>{settings.source?.label ?? t.click}</Text></View> : null}
        {dragDraft?.awaiting && !panel && <View testID="notebook-drop-actions" style={[styles.previewActions, { bottom: undefined, left: Math.max(8, Math.min(viewport.width - 315, dragDraft.point.x - paperScrollOffset.current.x)), top: Math.max(8, Math.min(viewport.height - 108, dragDraft.point.y - paperScrollOffset.current.y)), alignSelf: "auto", maxWidth: viewport.width - 16, flexWrap: "wrap" }]}>
          <Pressable testID="notebook-drop-cancel" onPress={() => { setDragDraft(null); if (dragDraft.paste) setSelection(emptySelection()); }} style={styles.previewButton}><Text>{t.cancel}</Text></Pressable>
          {!dragDraft.paste && <Pressable testID="notebook-drop-copy" onPress={() => commitDrag(true)} style={styles.previewButton}><Text>{ko ? "여기에 복사" : "Copy here"}</Text></Pressable>}
          <Pressable testID="notebook-drop-move" onPress={() => commitDrag(false)} style={styles.previewButton}><Text>{dragDraft.paste ? (ko ? "여기에 붙여넣기" : "Paste here") : (ko ? "여기로 이동" : "Move here")}</Text></Pressable>
        </View>}
      <NotebookFloatingDock id="playback" ko={ko} bounds={viewport} maxWidth={380} edge="top"
        active={frontDock === "playback"} onActivate={() => setFrontDock("playback")}
        onDragStart={beginDockMove} onDragEnd={endDockMove}>
        <NotebookPlaybackBar ko={ko} settings={settings} running={playback.running} preparing={playback.preparing}
          layoutKey={dockLayoutKey} pickerTop={paperTop} pickerBottom={paperTop + viewport.height}
          onSettings={updateSettings} onToggle={() => void togglePlayback()} />
      </NotebookFloatingDock>
      <NotebookFloatingDock id="tools" ko={ko} bounds={viewport} maxWidth={mode === "notes" ? 480 : 680} edge="bottom"
        active={frontDock === "tools"} onActivate={() => setFrontDock("tools")}
        onDragStart={beginDockMove} onDragEnd={endDockMove}>
      {tupletIds !== null && <View style={styles.tupletStatus}><Text>{ko ? `잇단음표 작성 중 · ${tupletIds.length}개` : `Open tuplet · ${tupletIds.length}`}</Text><Pressable testID="notebook-tuplet-cancel" onPress={() => setTupletIds(null)} style={{ padding: 8 }}><Text>{t.cancel}</Text></Pressable></View>}
      {mode !== "ink" && mode !== "notes" && <View style={{ flexDirection: "row", justifyContent: "flex-end", backgroundColor: "#fffdf8" }}>
        <Pressable accessibilityLabel={t.undo} disabled={!undoStack.current.length} onPress={undo} style={{ padding: 10, opacity: undoStack.current.length ? 1 : 0.35 }}><Ionicons name="arrow-undo" size={18} color="#675d50" /></Pressable>
        <Pressable accessibilityLabel={t.redo} disabled={!redoStack.current.length} onPress={redo} style={{ padding: 10, opacity: redoStack.current.length ? 1 : 0.35 }}><Ionicons name="arrow-redo" size={18} color="#675d50" /></Pressable>
      </View>}
      <NotebookBottomTools ko={ko} mode={mode} tool={tool} lineWidth={lineWidth} scale={scale} pickerTop={paperTop}
        pickerBottom={paperTop + viewport.height} layoutKey={dockLayoutKey}
        onAutoSpace={autoSpace} autoSpaceDisabled={playback.running || playback.preparing || !!dragDraft}
        lineColor={lineColor} onColor={setLineColor} eraserMode={eraserMode} onEraserMode={setEraserMode}
        toolPopup={toolPopup} onToolPopup={(next) => { resetTransient(); setToolPopup(next); }}
        canUndo={undoStack.current.length > 0} canRedo={redoStack.current.length > 0}
        onTool={(next) => { playback.stop(); setDragDraft(null); setTool(next); }} onWidth={setLineWidth}
        onZoom={(value) => { playback.stop(); setScale(Math.max(0.35, Math.min(2.5, value))); }} onUndo={undo} onRedo={redo}
        onChoose={beginStamp} onTuplet={closeTuplet} tupletCount={tupletIds?.length ?? null}
        selectionCount={selectionCount(selection)} onClearSelection={() => { setSelection(emptySelection()); setDragDraft(null); }}
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
            />
          </View>
        </View>
      ) : null}
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

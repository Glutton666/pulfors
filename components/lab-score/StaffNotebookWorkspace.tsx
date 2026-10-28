import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert } from "@/lib/alert";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLabScoreNotebook } from "@/hooks/useLabScoreNotebook";
import { useNotebookPlayback } from "@/hooks/useNotebookPlayback";
import { DEFAULT_NOTEBOOK_SETTINGS, type NotebookSettings, type StaffNotebook, type StaffPage, type StaffPoint, type StaffStamp, type StaffStroke } from "@/lib/staff-notebook";
import { loadPracticeBook, type PracticeEntry } from "@/lib/storage";
import { notebookRows, materializeRows, stampPosition, screenToPaper, rowAt, PAPER_WIDTH, ROW_HEIGHT } from "@/lib/staff-notebook-layout";
import { NotebookLeftPanel } from "@/components/lab-score/notebook/NotebookLeftPanel";
import { NotebookRightPanel } from "@/components/lab-score/notebook/NotebookRightPanel";
import { NotebookPaper } from "@/components/lab-score/notebook/NotebookPaper";
import { ALL_INSTR_SYMBOLS, ARTICULATIONS, ACCIDENTALS, REPEAT_SIGNS } from "@/components/ScorePalette";

type Tool = "pen" | "erase" | "move" | "select";
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const withDefaults = (note: StaffNotebook): StaffNotebook => ({
  ...note,
  settings: { ...DEFAULT_NOTEBOOK_SETTINGS, ...(note.settings ?? {}) },
  pages: note.pages.map((page) => ({ ...page, stamps: page.stamps ?? [] })),
});
const distToSegment = (p: StaffPoint, a: StaffPoint, b: StaffPoint) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const strokeHit = (stroke: StaffStroke, p: StaffPoint) => stroke.points.length === 1
  ? Math.hypot(stroke.points[0].x - p.x, stroke.points[0].y - p.y) < 24
  : stroke.points.slice(1).some((point, i) => distToSegment(p, stroke.points[i], point) < 22);

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
  const [pageIndex, setPageIndex] = useState(0);
  const [panel, setPanel] = useState<"left" | "right" | null>(null);
  const [patterns, setPatterns] = useState<PracticeEntry[]>([]);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternError, setPatternError] = useState("");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<StaffPoint>({ x: 0, y: 0 });
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [pendingGlyph, setPendingGlyph] = useState<string | null>(null);
  const [previewAnchor, setPreviewAnchor] = useState<StaffPoint | null>(null);
  const [drawing, setDrawing] = useState<StaffPoint[]>([]);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const paperScroll = useRef<ScrollView>(null);
  const horizontalScroll = useRef<ScrollView>(null);
  const drawingRef = useRef<StaffPoint[]>([]);
  const erasedInGesture = useRef(false);
  const leftToggleRef = useRef<any>(null);
  const rightToggleRef = useRef<any>(null);
  const openedFrom = useRef<"left" | "right" | null>(null);
  const undoStack = useRef<StaffPage[][]>([]);
  const redoStack = useRef<StaffPage[][]>([]);
  const savedSnapshot = useRef(JSON.stringify(note));
  const stampDrag = useRef<{ id: string; x: number; y: number } | null>(null);
  const panStart = useRef<{ point: StaffPoint; offset: StaffPoint } | null>(null);
  const page = note.pages[pageIndex] ?? note.pages[0];
  useEffect(() => { if (pageIndex >= note.pages.length) setPageIndex(Math.max(0, note.pages.length - 1)); }, [pageIndex, note.pages.length]);
  const settings = note.settings!;
  const paperScale = viewport.width > 0 ? viewport.width / PAPER_WIDTH : 1;
  const displayRows = useMemo(() => notebookRows(note), [note.pages]);
  const playback = useNotebookPlayback(note, active);
  const metroRunning = playback.running && !settings.source;
  const playbackPage = useMemo(() => playback.running ? materializeRows(note, playback.rows) : null, [playback.running, playback.rows, note]);
  const visiblePage = playbackPage ?? { ...page, staffCount: Math.min(200, Math.max(page.staffCount ?? 7,
    Math.ceil(viewport.height / (ROW_HEIGHT * paperScale * scale)))) };
  const visibleHeight = (visiblePage.staffCount ?? 7) * ROW_HEIGHT;
  const currentSelection = page.stamps?.find((stamp) => stamp.id === selectedStampId);
  const updateSettings = (patch: Partial<NotebookSettings>) => {
    if ((playback.running || playback.preparing) && ("source" in patch || "bpm" in patch || "random" in patch || "lineUnit" in patch)) playback.stop();
    if ("offsetX" in patch || "offsetY" in patch) setPreviewAnchor((point) => point ? {
      x: point.x + (patch.offsetX ?? settings.offsetX) - settings.offsetX,
      y: point.y + (patch.offsetY ?? settings.offsetY) - settings.offsetY,
    } : null);
    setNote((prev) => ({ ...prev, settings: { ...DEFAULT_NOTEBOOK_SETTINGS, ...(prev.settings ?? {}), ...patch } }));
  };
  const replacePage = (index: number, next: StaffPage) => setNote((prev) => ({ ...prev, pages: prev.pages.map((item, i) => i === index ? next : item) }));
  const checkpoint = () => { undoStack.current = [...undoStack.current.slice(-39), note.pages]; redoStack.current = []; };
  const undo = () => {
    playback.stop();
    const previous = undoStack.current.at(-1);
    if (!previous) return;
    redoStack.current = [...redoStack.current, note.pages];
    undoStack.current = undoStack.current.slice(0, -1);
    setNote((prev) => ({ ...prev, pages: previous }));
  };
  const redo = () => {
    playback.stop();
    const next = redoStack.current.at(-1);
    if (!next) return;
    undoStack.current = [...undoStack.current, note.pages];
    redoStack.current = redoStack.current.slice(0, -1);
    setNote((prev) => ({ ...prev, pages: next }));
  };
  const openPanel = (next: "left" | "right") => {
    openedFrom.current = next;
    setPanel((old) => old === next ? null : next);
  };
  const requestExit = (next: () => void) => {
      const changed = savedSnapshot.current !== JSON.stringify(note);
      const continueExit = () => { playback.stop(); next(); };
      if (!changed) { continueExit(); return; }
      Alert.alert(t.fresh, t.confirm, [
        { text: t.cancel, style: "cancel" },
        { text: t.discard, style: "destructive", onPress: continueExit },
        { text: t.save, onPress: () => { void save(note).then((ok) => { if (ok) { savedSnapshot.current = JSON.stringify(note); continueExit(); } }); } },
      ]);
  };
  useEffect(() => {
    if (!active || !onRegisterExit) return;
    onRegisterExit(requestExit);
    return () => onRegisterExit(null);
  }, [onRegisterExit, active, note, playback.stop, save, t]);
  const closePanel = useCallback(() => {
    setPanel(null);
    if (Platform.OS === "web") requestAnimationFrame(() => (openedFrom.current === "left" ? leftToggleRef.current : rightToggleRef.current)?.focus?.());
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
  useEffect(() => { if (!active) playback.stop(); }, [active, playback.stop]);
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
    horizontalScroll.current?.scrollTo({ x: (38 + playback.position.progress * 824) * ratio, animated: false });
  }, [playback.running, playback.position, settings.follow, settings.playbackZoom, paperScale, viewport.height]);
  const confirmReplace = (action: () => void) => {
    const changed = savedSnapshot.current !== JSON.stringify(note);
    const replace = () => { playback.stop(); setDrawing([]); drawingRef.current = []; setPendingGlyph(null); setSelectedStampId(null); setOffset({ x: 0, y: 0 }); action(); };
    if (!changed) { replace(); return; }
    Alert.alert(t.fresh, t.confirm, [
      { text: t.cancel, style: "cancel" },
      { text: t.discard, style: "destructive", onPress: replace },
      { text: t.save, onPress: () => { void save(note).then((ok) => { if (ok) replace(); }); } },
    ]);
  };
  const fresh = () => confirmReplace(() => { const next = withDefaults(create()); setNote(next); savedSnapshot.current = JSON.stringify(next); setPageIndex(0); undoStack.current = []; redoStack.current = []; });
  const addPage = () => { playback.stop(); checkpoint(); const pages = [...note.pages, { id: id("page"), strokes: [], staffCount: 7, stamps: [] }]; setNote((prev) => ({ ...prev, pages })); setPageIndex(pages.length - 1); setSelectedStampId(null); };
  const addStaff = () => { if ((visiblePage.staffCount ?? 7) >= 200) return; playback.stop(); checkpoint(); replacePage(pageIndex, { ...page, staffCount: (visiblePage.staffCount ?? 7) + 1 }); };
  const saveNow = async () => {
    const ok = await save(note);
    if (ok) savedSnapshot.current = JSON.stringify(note);
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
      else await playback.start();
    } catch { Alert.alert(t.playbackError); }
  };
  const toggleSimpleMetro = () => {
    if (playback.running || playback.preparing) { playback.stop(); return; }
    const simple = { ...note, settings: { ...settings, source: undefined } };
    setNote(simple); void playback.start(simple);
  };
  const onPaperTouch = (screen: StaffPoint, phase: "start" | "move" | "end" | "cancel") => {
    if (phase === "cancel") { drawingRef.current = []; setDrawing([]); stampDrag.current = null; panStart.current = null; return; }
    const zoom = playback.running && settings.follow ? settings.playbackZoom : scale;
    const doc = screenToPaper({ x: screen.x / paperScale, y: screen.y / paperScale }, offset, zoom);
    if (phase === "start") erasedInGesture.current = false;
    if ((phase === "start" || phase === "move") && tool === "erase") {
      const hitStroke = page.strokes.some((stroke) => strokeHit(stroke, doc));
      const hitStamps = (page.stamps ?? []).filter((stamp) => Math.hypot(stamp.x - doc.x, stamp.y - doc.y) < stamp.size * 0.7);
      if (hitStroke || hitStamps.length) {
        if (!erasedInGesture.current) { checkpoint(); erasedInGesture.current = true; }
        replacePage(pageIndex, { ...page, strokes: page.strokes.filter((stroke) => !strokeHit(stroke, doc)), stamps: (page.stamps ?? []).filter((stamp) => !hitStamps.includes(stamp)) });
      }
      return;
    }
    if (phase === "start") {
      if (pendingGlyph) { setPreviewAnchor(doc); return; }
      if (tool === "move") { panStart.current = { point: screen, offset }; return; }
      if (tool === "pen") { drawingRef.current = [doc]; setDrawing([doc]); setSelectedStampId(null); return; }
      if (tool === "select") {
        const hit = [...(page.stamps ?? [])].reverse().find((stamp) => Math.hypot(stamp.x - doc.x, stamp.y - doc.y) < stamp.size);
        setSelectedStampId(hit?.id ?? null);
        if (hit) { checkpoint(); stampDrag.current = { id: hit.id, x: doc.x, y: doc.y }; }
      }
      return;
    }
    if (phase === "move" && tool === "pen" && drawingRef.current.length) { drawingRef.current = [...drawingRef.current, doc]; setDrawing(drawingRef.current); }
    if (phase === "move" && pendingGlyph) setPreviewAnchor(doc);
    if (phase === "move" && tool === "move" && panStart.current) {
      setOffset({ x: panStart.current.offset.x + (screen.x - panStart.current.point.x) / paperScale, y: panStart.current.offset.y + (screen.y - panStart.current.point.y) / paperScale });
    }
    if (phase === "move" && tool === "select" && stampDrag.current) {
      const drag = stampDrag.current;
      const deltaX = doc.x - drag.x, deltaY = doc.y - drag.y;
      const stamp = page.stamps?.find((item) => item.id === drag.id);
      if (stamp) {
        replacePage(pageIndex, { ...page, stamps: page.stamps!.map((item) => item.id === drag.id ? { ...item, x: item.x + deltaX, y: item.y + deltaY } : item) });
        stampDrag.current = { ...drag, x: doc.x, y: doc.y };
      }
    }
    if (phase === "end" && tool === "pen" && drawingRef.current.length) {
      checkpoint();
      const points = [...drawingRef.current, doc];
      const count = Math.min(200, Math.max(page.staffCount ?? 7, ...points.map((point) => Math.ceil((point.y + 1) / ROW_HEIGHT))));
      replacePage(pageIndex, { ...page, staffCount: count, anchor: doc, strokes: [...page.strokes, { id: id("stroke"), points, width: lineWidth }] });
      drawingRef.current = []; setDrawing([]);
    }
    if (phase === "end") { stampDrag.current = null; panStart.current = null; }
  };
  const beginStamp = (glyph: string) => {
    playback.stop();
    const anchor = stampPosition(page, settings, currentSelection ? { x: currentSelection.x + currentSelection.size * 0.8, y: currentSelection.y } : undefined);
    setPendingGlyph(glyph); setPreviewAnchor(anchor); setTool("select");
    closePanel();
  };
  const stampItems = useMemo(() => {
    const items = [
    ...["whole", "half", "quarter", "eighth", "sixteenth"].map((glyph) => ({ id: glyph, symbol: glyph === "whole" ? "𝅝" : glyph === "half" ? "𝅗𝅥" : glyph === "quarter" ? "♩" : glyph === "eighth" ? "♪" : "𝅘𝅥𝅯", label: glyph })),
    ...["rest-whole", "rest-half", "rest-quarter", "rest-eighth", "rest-sixteenth"].map((glyph) => ({ id: glyph, symbol: glyph.replace("rest-", "") === "quarter" ? "𝄽" : glyph.replace("rest-", "") === "half" ? "𝄼" : glyph.replace("rest-", "") === "whole" ? "𝄻" : "𝄾", label: glyph })),
    ...ALL_INSTR_SYMBOLS.map((symbol) => ({ id: symbol.id, symbol: symbol.symbol, label: symbol.id })),
    ...ACCIDENTALS.map((item) => ({ id: item.value, symbol: item.symbol, label: item.value })),
    ...ARTICULATIONS.map((item) => ({ id: item.id, symbol: item.symbol, label: item.id })),
    ...REPEAT_SIGNS.map((item) => ({ id: item.id, symbol: item.symbol, label: item.id })),
    ];
    return items.filter((item, index) => items.findIndex((other) => other.id === item.id) === index);
  }, []);
  const confirmStamp = () => {
    if (!pendingGlyph || !previewAnchor) return;
    checkpoint();
    const top = 78 + rowAt(previewAnchor.y, page.staffCount ?? 7) * ROW_HEIGHT;
    const y = settings.snap ? top + Math.round((previewAnchor.y - top) / 6) * 6 : previewAnchor.y;
    const stamp: StaffStamp = { id: id("stamp"), glyph: pendingGlyph, x: Math.max(38, Math.min(862, previewAnchor.x)), y: Math.max(12, Math.min((page.staffCount ?? 7) * ROW_HEIGHT - 12, y)), size: 26 };
    replacePage(pageIndex, { ...page, anchor: { x: stamp.x, y: stamp.y }, stamps: [...(page.stamps ?? []), stamp] });
    setSelectedStampId(stamp.id); setPendingGlyph(null); setPreviewAnchor(null);
  };
  const cancelStamp = () => { setPendingGlyph(null); setPreviewAnchor(null); };
  const updateSelected = (patch: Partial<StaffStamp>) => {
    if (!currentSelection) return;
    checkpoint();
    replacePage(pageIndex, { ...page, stamps: page.stamps!.map((stamp) => stamp.id === currentSelection.id ? { ...stamp, ...patch } : stamp) });
  };
  const copyStamp = () => {
    if (!currentSelection) return;
    checkpoint();
    const copy = { ...currentSelection, id: id("stamp"), x: currentSelection.x + 28 };
    replacePage(pageIndex, { ...page, stamps: [...(page.stamps ?? []), copy] }); setSelectedStampId(copy.id);
  };
  const deleteStamp = () => {
    if (!currentSelection) return;
    checkpoint(); replacePage(pageIndex, { ...page, stamps: page.stamps!.filter((stamp) => stamp.id !== currentSelection.id) }); setSelectedStampId(null);
  };
  const nudge = (axis: "x" | "y", amount: number) => updateSettings({ [axis === "x" ? "offsetX" : "offsetY"]: settings[axis === "x" ? "offsetX" : "offsetY"] + amount });
  const following = playback.running && settings.follow;
  const zoom = following ? settings.playbackZoom : scale;
  return (
    <View style={[styles.root, { backgroundColor: "#ffffff" }]} onLayout={(event) => setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      <View style={styles.paperStage}>
        <ScrollView testID="notebook-horizontal-scroll" ref={horizontalScroll} horizontal style={styles.paperScroll}
          contentContainerStyle={{ minWidth: "100%", paddingHorizontal: following ? viewport.width / 2 : 0 }}
          showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ScrollView testID="notebook-vertical-scroll" ref={paperScroll} style={{ height: viewport.height, width: Math.max(viewport.width, PAPER_WIDTH * paperScale * zoom) }}
          contentContainerStyle={[styles.paperContent, { paddingVertical: following ? viewport.height / 2 : 0 }]}
          nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <NotebookPaper
            page={visiblePage} width={PAPER_WIDTH * paperScale * (playback.running && settings.follow ? settings.playbackZoom : scale)} height={visibleHeight * paperScale * (playback.running && settings.follow ? settings.playbackZoom : scale)}
            paperScale={paperScale} zoom={playback.running && settings.follow ? settings.playbackZoom : scale}
            offset={offset} tool={playback.running ? "move" : tool} lineWidth={lineWidth}
            drawing={drawing} pendingGlyph={pendingGlyph} preview={previewAnchor}
            selectedStampId={playback.running ? null : selectedStampId}
            onTouch={playback.running ? undefined : onPaperTouch}
          />
        </ScrollView></ScrollView>
        <Pressable ref={leftToggleRef} accessibilityRole="button" accessibilityLabel={t.left} testID="notebook-left-toggle" onPress={() => openPanel("left")} style={[styles.edgeHandle, styles.leftHandle, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="chevron-forward" size={17} color={C.text} />
        </Pressable>
        <Pressable ref={rightToggleRef} accessibilityRole="button" accessibilityLabel={t.right} testID="notebook-right-toggle" onPress={() => openPanel("right")} style={[styles.edgeHandle, styles.rightHandle, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="chevron-back" size={17} color={C.text} />
        </Pressable>
        {playback.error ? <View style={styles.playbackStatus}><Text style={{ color: C.accent }}>{playback.error}</Text></View> : null}
        {playback.running ? <View pointerEvents="none" style={[styles.playbackTag, { backgroundColor: C.surface }]}><Text style={{ color: C.text, fontSize: 11 }}>{settings.source?.label ?? t.click}</Text></View> : null}
        {pendingGlyph && !panel && <View style={styles.previewActions}>
          <Pressable testID="notebook-stamp-cancel" onPress={cancelStamp} style={styles.previewButton}><Text>{t.cancel}</Text></Pressable>
          <Pressable testID="notebook-stamp-confirm" onPress={confirmStamp} style={styles.previewButton}><Text>{ko ? "여기에 놓기" : "Place here"}</Text></Pressable>
        </View>}
      </View>
      {panel ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={closePanel} accessibilityLabel={t.close} />
          <View style={[styles.drawer, panel === "left" ? styles.drawerLeft : styles.drawerRight, { backgroundColor: "#fffdf8", borderColor: "#ded6c9" }]}>
            <View style={[styles.drawerHead, { borderBottomColor: C.border }]}>
              <Text style={[styles.drawerTitle, { color: "#302b25" }]}>{panel === "left" ? t.left : t.right}</Text>
              <Pressable testID="notebook-panel-close" accessibilityLabel={t.close} onPress={closePanel} hitSlop={12} style={styles.closeButton}><Ionicons name="close" size={22} color="#302b25" /></Pressable>
            </View>
            {panel === "left" ? (
              <NotebookLeftPanel
                ko={ko} t={t} note={note} settings={settings} patterns={patterns} patternLoading={patternLoading} patternError={patternError}
                notebooks={notebooks} error={error} playback={playback} metroRunning={metroRunning} selectedRows={displayRows.length}
                onSettings={updateSettings} onPattern={loadPattern} onPlay={togglePlayback} onSimpleMetro={toggleSimpleMetro}
                onRefresh={() => void refresh()} onNew={fresh} onSave={() => void saveNow()} onOpenCapture={onOpenCapture ? () => requestExit(onOpenCapture) : undefined}
                onLoad={(saved) => confirmReplace(() => { const loaded = withDefaults(saved); savedSnapshot.current = JSON.stringify(loaded); setNote(loaded); setPageIndex(0); undoStack.current = []; redoStack.current = []; })}
                onDelete={(saved) => Alert.alert(t.notes, ko ? "이 노트를 삭제할까요?" : "Delete this notebook?", [{ text: t.cancel, style: "cancel" }, { text: ko ? "삭제" : "Delete", style: "destructive", onPress: () => void remove(saved.id) }])}
                onTitle={(title) => setNote((prev) => ({ ...prev, title }))}
              />
            ) : (
              <NotebookRightPanel
                ko={ko} t={t} tool={tool} lineWidth={lineWidth} scale={scale} pageIndex={pageIndex} pageCount={note.pages.length}
                pageNumber={pageIndex + 1} canUndo={undoStack.current.length > 0} canRedo={redoStack.current.length > 0}
                stamps={stampItems} pendingGlyph={pendingGlyph} selected={currentSelection} settings={settings}
                onTool={(next) => { playback.stop(); setTool(next); }} onWidth={setLineWidth} onZoom={(value) => setScale(Math.max(0.55, Math.min(2.5, value)))}
                onUndo={undo} onRedo={redo} onAddPage={addPage} onAddStaff={addStaff}
                onPage={(index) => { playback.stop(); setPageIndex(index); setSelectedStampId(null); setOffset({ x: 0, y: 0 }); }}
                onStamp={beginStamp} onConfirm={confirmStamp} onCancel={cancelStamp} onNudge={nudge}
                onSettings={updateSettings} onSelectAction={(action) => {
                  if (!currentSelection) return;
                  if (action === "copy") copyStamp();
                  else if (action === "delete") deleteStamp();
                  else if (action === "grow") updateSelected({ size: Math.min(120, currentSelection.size + 4) });
                  else if (action === "shrink") updateSelected({ size: Math.max(8, currentSelection.size - 4) });
                }}
              />
            )}
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
  rightHandle: { right: 0, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
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
});

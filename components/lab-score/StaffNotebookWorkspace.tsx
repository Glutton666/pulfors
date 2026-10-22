import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Svg, { G, Line, Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "@/lib/alert";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLabNotebookMetronome, useLabScoreNotebook } from "@/hooks/useLabScoreNotebook";
import type { StaffNotebook, StaffStroke } from "@/lib/staff-notebook";

const PAGE_W = 900;
const PAGE_H = 1160;
const makeId = () => `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const distanceToSegment = (point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq)) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};
const nearStroke = (stroke: StaffStroke, point: { x: number; y: number }, radius: number) => {
  if (stroke.points.length === 1) return Math.hypot(stroke.points[0].x - point.x, stroke.points[0].y - point.y) < radius;
  return stroke.points.slice(1).some((end, index) => distanceToSegment(point, stroke.points[index], end) < radius);
};

export function StaffNotebookWorkspace({ active = true }: { active?: boolean }) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const ko = language === "ko";
  const copy = ko ? {
    title: "종이와 펜", subtitle: "그린 선은 그대로 남습니다.", new: "새 노트", pages: "페이지 추가", staff: "오선 추가", save: "저장", library: "내 노트", pen: "펜", erase: "지우개", move: "이동", undo: "실행 취소", redo: "다시 실행", width: "선 굵기", tempo: "박자", play: "시작", stop: "정지", blank: "저장된 오선 노트가 없습니다.", drawing: "그리기", titlePrompt: "노트 제목", load: "열기", remove: "삭제", loadErr: "노트를 불러오지 못했습니다.", saved: "노트를 저장했습니다.", saveErr: "저장하지 못했습니다.",
  } : {
    title: "Paper & pen", subtitle: "A line stays a line.", new: "New notebook", pages: "Add page", staff: "Add staff", save: "Save", library: "My notes", pen: "Pen", erase: "Eraser", move: "Move", undo: "Undo", redo: "Redo", width: "Stroke", tempo: "Tempo", play: "Start", stop: "Stop", blank: "No saved staff notebooks yet.", drawing: "Draw", titlePrompt: "Notebook title", load: "Open", remove: "Delete", loadErr: "Could not load notebooks.", saved: "Notebook saved.", saveErr: "Could not save notebook.",
  };
  const { notebooks, error, refresh, save, remove, create } = useLabScoreNotebook();
  const [note, setNote] = useState<StaffNotebook>(() => create());
  const [tool, setTool] = useState<"pen" | "erase" | "move">("pen");
  const [width, setWidth] = useState(3);
  const [bpm, setBpm] = useState(84);
  const { running: metroRunning, start: startMetro, stop: stopMetro } = useLabNotebookMetronome(bpm);
  const [undoStack, setUndo] = useState<StaffStroke[][]>([]);
  const [redoStack, setRedo] = useState<StaffStroke[][]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const { width: screenWidth } = useWindowDimensions();
  const drawing = useRef<{ x: number; y: number }[]>([]);
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([]);
  const viewportRef = useRef({ screenWidth, offset, scale });
  viewportRef.current = { screenWidth, offset, scale };
  const page = note.pages[pageIndex] ?? note.pages[0];
  const pageHeight = PAGE_H + (Math.max(7, page?.staffCount ?? 7) - 7) * 155;
  const pageRef = useRef(page);
  pageRef.current = page;
  const updateStrokes = (strokes: StaffStroke[]) => setNote((prev) => ({ ...prev, pages: prev.pages.map((p, i) => i === pageIndex ? { ...p, strokes } : p) }));
  const pushUndo = () => { setUndo((prev) => [...prev.slice(-39), page?.strokes ?? []]); setRedo([]); };
  const actionsRef = useRef({ updateStrokes, pushUndo });
  actionsRef.current = { updateStrokes, pushUndo };
  const pointFromEvent = (event: any) => {
    const view = viewportRef.current;
    const ratio = Math.min((view.screenWidth - 32) / PAGE_W, 0.7) * view.scale;
    return { x: (event.nativeEvent.locationX - view.offset.x) / ratio, y: (event.nativeEvent.locationY - view.offset.y) / ratio };
  };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      if (tool === "move") { panOrigin.current = { ...viewportRef.current.offset }; return; }
      const p = pointFromEvent(e);
      if (tool === "erase") {
        actionsRef.current.pushUndo(); actionsRef.current.updateStrokes((pageRef.current?.strokes ?? []).filter((stroke) => !nearStroke(stroke, p, 28)));
      } else { drawing.current = [p]; setDrawingPoints([p]); }
    },
    onPanResponderMove: (e, gesture) => {
      if (tool === "move") { setOffset({ x: panOrigin.current.x + gesture.dx, y: panOrigin.current.y + gesture.dy }); return; }
      const p = pointFromEvent(e);
      if (tool === "erase") {
        actionsRef.current.updateStrokes((pageRef.current?.strokes ?? []).filter((stroke) => !nearStroke(stroke, p, 24)));
      } else if (tool === "pen") { drawing.current.push(p); setDrawingPoints([...drawing.current]); }
    },
    onPanResponderRelease: () => {
      if (tool === "pen" && drawing.current.length) {
        actionsRef.current.pushUndo();
        actionsRef.current.updateStrokes([...(pageRef.current?.strokes ?? []), { id: makeId(), points: drawing.current, width }]);
        drawing.current = [];
        setDrawingPoints([]);
      }
    },
    onPanResponderTerminate: () => { drawing.current = []; setDrawingPoints([]); },
  }), [tool, width]);
  useEffect(() => () => stopMetro(), [stopMetro]);
  useEffect(() => { if (!active) stopMetro(); }, [active, stopMetro]);
  const confirmReplace = (action: () => void) => {
    if (!note.pages.some((item) => item.strokes.length)) { action(); return; }
    Alert.alert(ko ? "노트 바꾸기" : "Replace this notebook",
      ko ? "저장하지 않은 그림을 버릴까요?" : "Discard any unsaved drawing changes?", [
        { text: ko ? "취소" : "Cancel", style: "cancel" },
        { text: ko ? "버리기" : "Discard", style: "destructive", onPress: action },
        { text: ko ? "저장 후 계속" : "Save & continue", onPress: () => { void save(note).then((ok) => { if (ok) action(); }); } },
      ]);
  };
  const createFresh = () => confirmReplace(() => { setNote(create()); setPageIndex(0); setUndo([]); setRedo([]); setOffset({ x: 0, y: 0 }); });
  const switchPage = (index: number) => { setPageIndex(index); setUndo([]); setRedo([]); setOffset({ x: 0, y: 0 }); };
  const addPage = () => { setNote((prev) => ({ ...prev, pages: [...prev.pages, { id: makeId(), strokes: [] }] })); switchPage(note.pages.length); };
  const addStaff = () => setNote((prev) => ({ ...prev, pages: prev.pages.map((item, index) => index === pageIndex ? { ...item, staffCount: (item.staffCount ?? 7) + 1 } : item) }));
  const saveNow = async () => {
    const ok = await save(note);
    Alert.alert(ok ? copy.saved : copy.saveErr);
  };
  const undo = () => {
    if (!undoStack.length) return;
    setRedo((r) => [...r, page.strokes]); updateStrokes(undoStack[undoStack.length - 1]); setUndo((u) => u.slice(0, -1));
  };
  const redo = () => {
    if (!redoStack.length) return;
    setUndo((u) => [...u, page.strokes]); updateStrokes(redoStack[redoStack.length - 1]); setRedo((r) => r.slice(0, -1));
  };
  const loadNotes = async () => { try { await refresh(); } catch { Alert.alert(copy.loadErr); } };
  const deleteNote = (id: string) => Alert.alert(copy.remove, ko ? "이 노트를 삭제할까요?" : "Delete this notebook?", [
    { text: ko ? "취소" : "Cancel", style: "cancel" },
    { text: copy.remove, style: "destructive", onPress: () => { void remove(id); } },
  ]);
  const pageScale = Math.min((screenWidth - 32) / PAGE_W, 0.7) * scale;
  const pathFor = (stroke: StaffStroke) => stroke.points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") + (stroke.points.length === 1 ? " l0.01,0.01" : "");
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[s.kicker, { color: C.accent }]}>{copy.title.toUpperCase()}</Text>
          <Text style={[s.sub, { color: C.textSecondary }]}>{copy.subtitle}</Text>
        </View>
        <Pressable onPress={createFresh} style={[s.smallButton, { borderColor: C.border }]}><Ionicons name="add" size={18} color={C.text} /><Text style={{ color: C.text, fontSize: 12 }}>{copy.new}</Text></Pressable>
      </View>
      <View style={s.toolbar}>
        {([["pen", "create-outline", copy.pen], ["erase", "remove-outline", copy.erase], ["move", "hand-left-outline", copy.move]] as const).map(([key, icon, label]) => (
          <Pressable key={key} onPress={() => setTool(key)} style={[s.tool, { borderColor: tool === key ? C.accent : C.border, backgroundColor: tool === key ? C.surfaceLight : C.surface }]} testID={key === "erase" ? "notebook-eraser" : undefined}>
            <Ionicons name={icon} size={16} color={tool === key ? C.accent : C.textSecondary} /><Text style={{ color: C.text, fontSize: 11 }}>{label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={undo} style={s.tool}><Ionicons name="arrow-undo" size={17} color={C.textSecondary} /><Text style={{ color: C.text, fontSize: 11 }}>{copy.undo}</Text></Pressable>
        <Pressable onPress={redo} style={s.tool}><Ionicons name="arrow-redo" size={17} color={C.textSecondary} /><Text style={{ color: C.text, fontSize: 11 }}>{copy.redo}</Text></Pressable>
      </View>
      <View style={s.toolbar}>
        <Text style={[s.label, { color: C.textSecondary }]}>{copy.width}</Text>
        {[2, 3, 5, 8].map((v) => <Pressable key={v} onPress={() => setWidth(v)} style={[s.chip, { borderColor: width === v ? C.accent : C.border }]}><Text style={{ color: C.text }}>{v}</Text></Pressable>)}
        <Pressable onPress={() => setScale((v) => Math.min(1.5, +(v + 0.1).toFixed(1)))} style={s.zoom}><Text style={{ color: C.text }}>+</Text></Pressable>
        <Text style={{ color: C.textSecondary, fontSize: 11 }}>{Math.round(scale * 100)}%</Text>
        <Pressable onPress={() => setScale((v) => Math.max(0.7, +(v - 0.1).toFixed(1)))} style={s.zoom}><Text style={{ color: C.text }}>−</Text></Pressable>
      </View>
      <View style={s.paperWrap}>
        <View testID="notebook-drawing" style={[s.paper, { width: PAGE_W * pageScale, height: pageHeight * pageScale }]} {...responder.panHandlers}>
          <Svg pointerEvents="none" width={PAGE_W * pageScale} height={pageHeight * pageScale} viewBox={`0 0 ${PAGE_W} ${pageHeight}`} style={{ transform: [{ translateX: offset.x }, { translateY: offset.y }] }}>
            <G>
              {Array.from({ length: page?.staffCount ?? 7 }, (_, staff) => Array.from({ length: 5 }, (_, line) => (
                <Line key={`${staff}-${line}`} x1="38" x2="862" y1={78 + staff * 155 + line * 12} y2={78 + staff * 155 + line * 12} stroke="#111111" strokeWidth="1.2" />
              )))}
              {(page?.strokes ?? []).map((stroke) => <Path key={stroke.id} d={pathFor(stroke)} fill="none" stroke="#080808" strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
              {drawingPoints.length > 1 && <Path testID="notebook-live-ink" d={drawingPoints.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ")} fill="none" stroke="#080808" strokeWidth={width} strokeLinecap="round" />}
            </G>
          </Svg>
        </View>
      </View>
      <View style={s.pageRow}>
        <Pressable onPress={() => switchPage(Math.max(0, pageIndex - 1))} style={s.action}><Ionicons name="chevron-back" size={18} color={C.text} /></Pressable>
        <Text style={{ color: C.textSecondary }}>{pageIndex + 1} / {note.pages.length}</Text>
        <Pressable onPress={() => switchPage(Math.min(note.pages.length - 1, pageIndex + 1))} style={s.action}><Ionicons name="chevron-forward" size={18} color={C.text} /></Pressable>
        <Pressable onPress={addPage} style={[s.smallButton, { borderColor: C.border }]}><Ionicons name="duplicate-outline" size={16} color={C.text} /><Text style={{ color: C.text, fontSize: 12 }}>{copy.pages}</Text></Pressable>
        <Pressable onPress={addStaff} style={[s.smallButton, { borderColor: C.border }]}><Ionicons name="add-outline" size={16} color={C.text} /><Text style={{ color: C.text, fontSize: 12 }}>{copy.staff}</Text></Pressable>
        <Pressable onPress={() => void saveNow()} style={[s.saveButton, { backgroundColor: C.accent }]} testID="notebook-save"><Ionicons name="save-outline" size={16} color={C.background} /><Text style={{ color: C.background, fontFamily: "SpaceGrotesk_700Bold", fontSize: 12 }}>{copy.save}</Text></Pressable>
      </View>
      <View style={[s.metro, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={{ flex: 1 }}><Text style={[s.sectionTitle, { color: C.text }]}>{copy.tempo}</Text><Text style={{ color: C.textSecondary, fontSize: 12 }}>BPM</Text></View>
        <Pressable onPress={() => setBpm((v) => Math.max(30, v - 1))} style={s.bpm}><Text style={{ color: C.text }}>−</Text></Pressable>
        <TextInput keyboardType="number-pad" value={String(bpm)} onChangeText={(v) => setBpm(Math.max(30, Math.min(240, Number(v) || 30)))} style={[s.bpmInput, { color: C.text }]} />
        <Pressable onPress={() => setBpm((v) => Math.min(240, v + 1))} style={s.bpm}><Text style={{ color: C.text }}>+</Text></Pressable>
        <Pressable onPress={metroRunning ? stopMetro : startMetro} style={[s.metroButton, { backgroundColor: metroRunning ? C.surfaceLight : C.accent }]}><Text style={{ color: metroRunning ? C.text : C.background, fontFamily: "SpaceGrotesk_700Bold" }}>{metroRunning ? copy.stop : copy.play}</Text></Pressable>
      </View>
      <View style={s.libraryTitle}><Text style={[s.sectionTitle, { color: C.text }]}>{copy.library}</Text><Pressable onPress={() => void loadNotes()}><Ionicons name="refresh" size={17} color={C.accent} /></Pressable></View>
      {(error || "").length > 0 && <Text style={{ color: C.accent, marginBottom: 8 }}>{error}</Text>}
      {!notebooks.length ? <Text style={[s.sub, { color: C.textSecondary }]}>{copy.blank}</Text> : notebooks.map((saved) => (
        <View key={saved.id} style={[s.savedRow, { borderColor: C.border }]}>
          <View style={{ flex: 1 }}><Text style={{ color: C.text, fontFamily: "SpaceGrotesk_700Bold" }}>{saved.title}</Text><Text style={{ color: C.textSecondary, fontSize: 11 }}>{saved.pages.length} {ko ? "페이지" : "pages"}</Text></View>
          <Pressable onPress={() => confirmReplace(() => { setNote(saved); switchPage(0); })} accessibilityLabel={copy.load}><Ionicons name="folder-open-outline" size={19} color={C.accent} /></Pressable>
          <Pressable onPress={() => deleteNote(saved.id)} style={{ marginLeft: 17 }} accessibilityLabel={copy.remove}><Ionicons name="trash-outline" size={19} color={C.textSecondary} /></Pressable>
        </View>
      ))}
      <TextInput value={note.title} onChangeText={(title) => setNote((prev) => ({ ...prev, title }))} placeholder={copy.titlePrompt} placeholderTextColor={C.textTertiary} style={[s.nameInput, { color: C.text, borderColor: C.border }]} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 36 },
  titleRow: { flexDirection: "row", alignItems: "center", marginTop: 10, marginBottom: 12 },
  kicker: { fontSize: 10, letterSpacing: 1.7, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { fontSize: 12, marginTop: 3 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 9 },
  tool: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 9, borderWidth: 1, borderRadius: 9 },
  smallButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 9, borderRadius: 9, borderWidth: 1 },
  label: { fontSize: 11, marginRight: 2 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  zoom: { width: 25, height: 25, borderRadius: 8, backgroundColor: "rgba(128,128,128,0.14)", alignItems: "center", justifyContent: "center" },
  paperWrap: { alignItems: "center", width: "100%" },
  paper: { backgroundColor: "#FFFFFF", overflow: "hidden", elevation: 4, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
   pageRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 12 },
  action: { padding: 7 },
  saveButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  metro: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 13, borderWidth: 1, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontFamily: "SpaceGrotesk_700Bold" },
  bpm: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "rgba(128,128,128,0.16)" },
  bpmInput: { width: 38, textAlign: "center", fontSize: 17, fontFamily: "SpaceGrotesk_700Bold", padding: 0 },
  metroButton: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 9, marginLeft: 5 },
  libraryTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 9 },
  savedRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 11, paddingHorizontal: 4 },
  nameInput: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, marginTop: 12 },
});

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ALL_INSTR_SYMBOLS, ACCIDENTALS, ARTICULATIONS, REPEAT_SIGNS } from "@/components/ScorePalette";
import { NotebookGlyphPreview } from "./NotebookGlyph";
import { NotebookTupletPreview } from "./NotebookTupletGlyph";
import { useNotebookRestPicker } from "./NotebookRestPicker";
import type { NotebookMode } from "./NotebookModeMenu";
import { useLanguage } from "@/contexts/LanguageContext";

type Tool = "pen" | "erase" | "move" | "select";
type Choice = { glyph: string; role: "normal" | "ghost" | "strong"; dotted: boolean };
type ClipboardItem = { id: string; label: string; count: number };
type Props = {
  ko: boolean;
  mode: NotebookMode;
  tool: Tool;
  lineWidth: number;
  scale: number;
  pickerTop?: number;
  canUndo: boolean;
  canRedo: boolean;
  onTool: (tool: Tool) => void;
  onWidth: (width: number) => void;
  onZoom: (scale: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onChoose: (choice: Choice) => void;
  onTuplet: () => void;
  tupletCount: number | null;
  selectionCount: number;
  onClearSelection: () => void;
  onSaveClipboard: () => void;
  onDeleteSelection: () => void;
  onResizeSelection: (factor: number) => void;
  clipboard: ClipboardItem[];
  onPaste: (id: string) => void;
};

const durations = ["whole", "half", "quarter", "eighth", "sixteenth", "thirty_second"];
const roleValues: Choice["role"][] = ["ghost", "normal", "strong"];
type NotesCategory = "note" | "marks" | null;
const durationLabels = {
  en: ["Whole", "Half", "Quarter", "Eighth", "16th", "32nd"],
  ko: ["온음표", "2분음표", "4분음표", "8분음표", "16분음표", "32분음표"],
};

export function NotebookBottomTools(props: Props) {
  const { t } = useLanguage();
  const { ko, mode } = props;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [gestureActive, setGestureActive] = useState(false);
  const [gestureVertical, setGestureVertical] = useState(false);
  const [showAccessibleChooser, setShowAccessibleChooser] = useState(false);
  const [, setMeasuredRowsVersion] = useState(0);
  const [gestureRole, setGestureRole] = useState<Choice["role"]>("normal");
  const [gestureDuration, setGestureDuration] = useState("quarter");
  const [dotChoice, setDotChoice] = useState(false);
  const [category, setCategory] = useState<NotesCategory>(null);
  const [restGestureActive, setRestGestureActive] = useState(false);
  const [selectionTab, setSelectionTab] = useState<"select" | "clipboard">("select");
  const originRef = useRef<View>(null);
  const dockRef = useRef<View>(null);
  const rowRefs = useRef<Record<string, View | null>>({});
  const roleRefs = useRef<Record<Choice["role"], View | null>>({ ghost: null, normal: null, strong: null });
  const originBox = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const rowBoxes = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const roleBoxes = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const gestureRef = useRef({ active: false, dx: 0, dy: 0, vertical: false, role: "normal" as Choice["role"], duration: "quarter", dotted: false, lastX: 0, lastY: 0 });
  const gestureSnapshot = useRef({ role: "normal" as Choice["role"], duration: "quarter", dotted: false });
  const responderUsed = useRef(false);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [originLayout, setOriginLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const dockTop = useRef(0);
  const dockLeft = useRef(0);
  const [dockPosition, setDockPosition] = useState({ x: 0, y: 0 });
  const pickerTop = props.pickerTop ?? 128;
  const durationRowHeight = Math.max(8, Math.min(34, (dockPosition.y - pickerTop - 12) / 6));
  const durationColumnHeight = durationRowHeight * durations.length + 8;
  const restPicker = useNotebookRestPicker({
    ko,
    topBoundary: pickerTop,
    modeKey: mode,
    otherPickerActive: gestureActive,
    dockRef,
    onChoose: props.onChoose,
    onActiveChange: setRestGestureActive,
  });

  const restoreCancelledGesture = () => {
    const previous = gestureSnapshot.current;
    gestureRef.current.active = false;
    gestureRef.current.vertical = false;
    gestureRef.current.role = previous.role;
    gestureRef.current.duration = previous.duration;
    gestureRef.current.dotted = previous.dotted;
    setGestureRole(previous.role);
    setGestureDuration(previous.duration);
    setDotChoice(previous.dotted);
    setGestureActive(false);
    setGestureVertical(false);
    setShowAccessibleChooser(false);
    setOriginLayout(null);
    originBox.current = null;
    rowBoxes.current = {};
    roleBoxes.current = {};
    responderUsed.current = false;
  };

  useEffect(() => {
    restoreCancelledGesture();
    setCategory(null);
  }, [mode, windowWidth, windowHeight]);
  useEffect(() => () => {
    gestureRef.current.active = false;
    responderUsed.current = false;
  }, []);

  const noteResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      const state = gestureRef.current;
      gestureSnapshot.current = { role: state.role, duration: state.duration, dotted: state.dotted };
      Object.assign(state, { active: true, dx: 0, dy: 0, vertical: false, lastX: 0, lastY: 0 });
      responderUsed.current = true;
      rowBoxes.current = {};
      roleBoxes.current = {};
      originRef.current?.measureInWindow((x, y, width, height) => {
        originBox.current = { x, y, width, height };
        setOriginLayout({ x, y, width, height });
      });
      dockRef.current?.measureInWindow((x, y) => {
        dockLeft.current = x;
        dockTop.current = y;
        setDockPosition({ x, y });
      });
      setGestureActive(true);
      setGestureVertical(false);
      setShowAccessibleChooser(false);
      setGestureRole(state.role);
      setGestureDuration(state.duration);
      setDotChoice(state.dotted);
      setCategory(null);
    },
    onPanResponderMove: (_event, gesture) => {
      const state = gestureRef.current;
      state.dx = gesture.dx;
      state.dy = gesture.dy;
      state.lastX = gesture.moveX;
      state.lastY = gesture.moveY;
      if (state.vertical) {
        const hit = durations.map((duration) => ({ duration, box: rowBoxes.current[duration] }))
          .find(({ box }) => box && gesture.moveY >= box.y && gesture.moveY <= box.y + box.height);
        if (hit) {
          state.duration = hit.duration;
          const center = rowBoxes.current[hit.duration]!.x + rowBoxes.current[hit.duration]!.width / 2;
          state.dotted = gesture.moveX < center;
          setGestureDuration(state.duration);
          setDotChoice(state.dotted);
        }
        return;
      }
      if (gesture.dy < -12 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 0.65) {
        state.vertical = true;
        setGestureVertical(true);
        setGestureDuration(state.duration);
      } else if (Math.abs(gesture.dx) > 16) {
        const nearest = roleValues.map((role) => ({ role, box: roleBoxes.current[role] }))
          .filter((item) => item.box)
          .sort((a, b) => Math.abs(gesture.moveX - (a.box!.x + a.box!.width / 2)) - Math.abs(gesture.moveX - (b.box!.x + b.box!.width / 2)))[0];
        if (nearest) {
          state.role = nearest.role;
          setGestureRole(state.role);
        }
      }
    },
    onPanResponderRelease: () => {
      const state = gestureRef.current;
      if (!state.active) return;
      state.active = false;
      const role = state.role;
      gestureSnapshot.current = { role, duration: state.duration, dotted: state.dotted };
      callbacks.current.onChoose({ glyph: state.duration, role, dotted: state.dotted });
      setGestureActive(false);
      setGestureVertical(false);
      setOriginLayout(null);
      rowBoxes.current = {};
      roleBoxes.current = {};
      setTimeout(() => { responderUsed.current = false; }, 250);
    },
    onPanResponderTerminate: () => {
      restoreCancelledGesture();
    },
    onPanResponderTerminationRequest: () => false,
  }), []);

  const measureDurationRows = () => {
    let measured = 0;
    durations.forEach((duration) => rowRefs.current[duration]?.measureInWindow((x, y, width, height) => {
      rowBoxes.current[duration] = { x, y, width, height };
      measured += 1;
      if (measured === durations.length) setMeasuredRowsVersion((version) => version + 1);
    }));
  };
  const measureRoleChoices = () => {
    roleValues.forEach((role) => roleRefs.current[role]?.measureInWindow((x, y, width, height) => {
      roleBoxes.current[role] = { x, y, width, height };
    }));
  };

  const chooseAccessibleNote = (choice: Choice) => {
    gestureRef.current.active = false;
    Object.assign(gestureRef.current, { role: choice.role, duration: choice.glyph, dotted: choice.dotted });
    gestureSnapshot.current = { role: choice.role, duration: choice.glyph, dotted: choice.dotted };
    setGestureRole(choice.role); setGestureDuration(choice.glyph); setDotChoice(choice.dotted);
    responderUsed.current = false;
    setGestureActive(false);
    setGestureVertical(false);
    setShowAccessibleChooser(false);
    setCategory(null);
    props.onChoose(choice);
  };

  const usedMarkIds = new Set<string>();
  const markGroups = [
    { label: ko ? "임시표" : "Accidentals", items: ACCIDENTALS.map((item) => ({ id: item.value, label: item.labelKey })) },
    { label: ko ? "아티큘레이션" : "Articulations", items: ARTICULATIONS.map((item) => ({ id: item.id, label: item.labelKey })) },
    { label: ko ? "반복 · 이동 부호" : "Repeats & navigation", items: REPEAT_SIGNS.map((item) => ({ id: item.id, label: item.labelKey })) },
    { label: ko ? "악기 기호" : "Instrument marks", items: ALL_INSTR_SYMBOLS.map((item) => ({ id: item.id, label: item.labelKey })) },
  ].map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, label: t("scoreMode", item.label as any) })).filter((item) => {
      if (usedMarkIds.has(item.id)) return false;
      usedMarkIds.add(item.id);
      return true;
    }),
  }));

  if (mode === "ink") {
    const tools: { id: Tool; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
      { id: "pen", icon: "pencil-outline", label: ko ? "펜" : "Pen" },
      { id: "erase", icon: "backspace-outline", label: ko ? "지우개" : "Erase" },
      { id: "move", icon: "hand-left-outline", label: ko ? "화면 이동" : "Pan" },
    ];
    return (
      <View style={styles.dock}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inkRow}>
          {tools.map((item) => (
            <Pressable key={item.id} testID={`notebook-tool-${item.id}`} accessibilityRole="button" accessibilityState={{ selected: props.tool === item.id }} onPress={() => props.onTool(item.id)} style={[styles.toolButton, props.tool === item.id && styles.selectedTool]}>
              <Ionicons name={item.icon} size={17} color={props.tool === item.id ? "#674f31" : "#7b7163"} /><Text style={[styles.toolText, props.tool === item.id && styles.selectedText]}>{item.label}</Text>
            </Pressable>
          ))}
          <View style={styles.separator} />
          {[1.4, 2.5, 4, 6].map((width) => (
            <Pressable key={width} accessibilityRole="button" accessibilityLabel={`${width} ${ko ? "픽셀 굵기" : "pixel width"}`} accessibilityState={{ selected: props.lineWidth === width }} onPress={() => props.onWidth(width)} style={[styles.widthButton, props.lineWidth === width && styles.selectedWidth]}>
              <View style={{ width: 20, height: width, borderRadius: 3, backgroundColor: "#51473a" }} />
            </Pressable>
          ))}
          <View style={styles.separator} />
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "실행 취소" : "Undo"} disabled={!props.canUndo} onPress={props.onUndo} style={[styles.iconTool, !props.canUndo && styles.disabled]}>
            <Ionicons name="arrow-undo" size={17} color="#675d50" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "다시 실행" : "Redo"} disabled={!props.canRedo} onPress={props.onRedo} style={[styles.iconTool, !props.canRedo && styles.disabled]}>
            <Ionicons name="arrow-redo" size={17} color="#675d50" />
          </Pressable>
          <View style={styles.separator} />
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "축소" : "Zoom out"} onPress={() => props.onZoom(Math.max(0.35, props.scale - 0.1))} style={styles.iconTool}><Ionicons name="remove" size={17} color="#675d50" /></Pressable>
          <Text style={styles.zoomValue}>{Math.round(props.scale * 100)}%</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "확대" : "Zoom in"} onPress={() => props.onZoom(Math.min(2.5, props.scale + 0.1))} style={styles.iconTool}><Ionicons name="add" size={17} color="#675d50" /></Pressable>
        </ScrollView>
      </View>
    );
  }

  if (mode === "notes") {
    return (
      <View ref={dockRef} style={styles.dock} onLayout={() => dockRef.current?.measureInWindow((x, y) => {
        dockLeft.current = x;
        dockTop.current = y;
        setDockPosition({ x, y });
        originRef.current?.measureInWindow((originX, originY, width, height) => {
          originBox.current = { x: originX, y: originY, width, height };
          setOriginLayout({ x: originX, y: originY, width, height });
        });
      })}>
          <View style={styles.notesDockContent}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              <View ref={originRef} collapsable={false} pointerEvents={restGestureActive ? "none" : "auto"} onLayout={() => originRef.current?.measureInWindow((x, y, width, height) => setOriginLayout({ x, y, width, height }))} {...noteResponder.panHandlers} style={[styles.categoryButton, styles.noteOrigin, restGestureActive && { opacity: 0 }]}>
                {!restGestureActive && <Pressable testID="notebook-note-origin" accessibilityRole="button" accessibilityLabel={ko ? "음표 선택. 좌우로 강도를, 위로 음가를 고르세요." : "Note picker. Swipe sideways for role, up for duration."} accessibilityState={{ expanded: showAccessibleChooser }} accessibilityActions={[{ name: "expand", label: ko ? "음표 선택기 펼치기" : "Expand note chooser" }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "expand") setShowAccessibleChooser(true); }} onPress={() => { if (responderUsed.current) { responderUsed.current = false; return; } setShowAccessibleChooser(true); }} style={styles.originInner}>
                  <NotebookGlyphPreview glyph={gestureDuration} size={17} role={gestureRole} dotted={dotChoice} />
                  <Text style={styles.categoryLabel}>{ko ? "음표" : "NOTE"}</Text>
                </Pressable>}
              </View>
              {restPicker.origin}
              <Pressable testID="notebook-tuplet" disabled={gestureActive || restGestureActive} accessibilityElementsHidden={gestureActive || restGestureActive} accessibilityRole="button" accessibilityState={{ selected: props.tupletCount !== null }} onPress={props.onTuplet} style={[styles.categoryButton, props.tupletCount !== null && styles.tupletOpen, (gestureActive || restGestureActive) && { opacity: 0 }]}>
                <NotebookTupletPreview count={props.tupletCount ?? 3} />
                <Text style={styles.categoryLabel}>{props.tupletCount === null ? (ko ? "잇단음표" : "TUPLET") : `${ko ? "잇단음표" : "TUPLET"} ${props.tupletCount}`}</Text>
              </Pressable>
              <Pressable testID="notebook-category-marks" disabled={gestureActive || restGestureActive} accessibilityElementsHidden={gestureActive || restGestureActive} accessibilityRole="button" accessibilityState={{ expanded: category === "marks", selected: category === "marks" }} onPress={() => setCategory(category === "marks" ? null : "marks")} style={[styles.categoryButton, category === "marks" && styles.categoryActive, (gestureActive || restGestureActive) && { opacity: 0 }]}>
                <Ionicons name="musical-notes-outline" size={16} color="#725b3c" />
                <Text style={styles.categoryLabel}>{ko ? "기호" : "MARKS"}</Text>
                <Ionicons name={category === "marks" ? "chevron-up" : "chevron-down"} size={12} color="#8b7a60" />
              </Pressable>
            </ScrollView>
          </View>

        {gestureActive && originLayout ? <View pointerEvents="box-none" style={[styles.gestureLayer, { bottom: 0 }]}>
          <View pointerEvents="box-none" onLayout={measureRoleChoices} style={[styles.roleChoices, { left: originLayout.x + originLayout.width / 2 - dockLeft.current - 92, top: originLayout.y + originLayout.height / 2 - dockTop.current - 21 }]}>
            {roleValues.map((role) => <Pressable key={role} ref={((node: any) => { roleRefs.current[role] = node; }) as any} testID={`notebook-note-role-${role}`} accessibilityRole="button" accessibilityLabel={`${ko ? "음표" : "Note"} ${role}`} onPress={() => { gestureRef.current.role = role; setGestureRole(role); }} style={[styles.roleChoice, gestureRole === role && styles.roleChoiceActive]}><NotebookGlyphPreview glyph="quarter" size={19} role={role} /></Pressable>)}
          </View>
          {gestureVertical && <View pointerEvents="box-none" onLayout={measureDurationRows} style={[
            styles.durationColumn,
            { left: originLayout.x + originLayout.width / 2 - dockLeft.current - 48, top: Math.max(pickerTop - dockTop.current, originLayout.y - dockTop.current - durationColumnHeight - 8) },
          ]}>
            {[...durations].reverse().map((duration) => <Pressable key={duration} ref={((node: any) => { rowRefs.current[duration] = node; }) as any} collapsable={false} testID={`notebook-note-duration-${duration}`} accessibilityRole="button" accessibilityLabel={durationLabels[ko ? "ko" : "en"][durations.indexOf(duration)]} onPress={() => chooseAccessibleNote({ glyph: duration, role: gestureRef.current.role, dotted: gestureRef.current.dotted })} style={[styles.durationChoice, { height: durationRowHeight }, gestureDuration === duration && styles.verticalDurationActive]}>
              <NotebookGlyphPreview glyph={duration} size={20} role={gestureRole} dotted={gestureDuration === duration && dotChoice} />
            </Pressable>)}
          </View>}
          {gestureVertical && rowBoxes.current[gestureDuration] && <>
            <Pressable testID="notebook-note-dotted" accessibilityRole="button" accessibilityLabel={ko ? "점음표" : "Dotted"} onPress={() => { gestureRef.current.dotted = true; setDotChoice(true); }} style={[styles.branchChoice, { left: rowBoxes.current[gestureDuration].x - dockLeft.current - 42, top: rowBoxes.current[gestureDuration].y - dockTop.current + rowBoxes.current[gestureDuration].height / 2 - 18 }, dotChoice && styles.roleChoiceActive]}><NotebookGlyphPreview glyph={gestureDuration} size={18} role={gestureRole} dotted /></Pressable>
            <Pressable testID="notebook-note-plain" accessibilityRole="button" accessibilityLabel={ko ? "일반 음표" : "Plain"} onPress={() => { gestureRef.current.dotted = false; setDotChoice(false); }} style={[styles.branchChoice, { left: rowBoxes.current[gestureDuration].x - dockLeft.current + rowBoxes.current[gestureDuration].width + 6, top: rowBoxes.current[gestureDuration].y - dockTop.current + rowBoxes.current[gestureDuration].height / 2 - 18 }, !dotChoice && styles.roleChoiceActive]}><NotebookGlyphPreview glyph={gestureDuration} size={18} role={gestureRole} /></Pressable>
          </>}
        </View> : null}

        {restPicker.overlay}

        {category ? (
          <View testID="notebook-symbol-drawer" style={[styles.categoryDrawer, { maxHeight: 300 }]}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>{ko ? "악보 기호" : "Musical marks"}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={ko ? "도구 닫기" : "Close tools"} onPress={() => setCategory(null)} style={styles.drawerClose}><Ionicons name="close" size={17} color="#796b55" /></Pressable>
            </View>
            <ScrollView style={[styles.drawerScroll, { maxHeight: 255 }]} contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
              {markGroups.map((group) => (
                  <View key={group.label} style={styles.drawerMarkGroup}>
                    <Text style={styles.drawerEyebrow}>{group.label}</Text>
                    <View style={styles.drawerGlyphGrid}>
                      {group.items.map((item) => (
                        <Pressable key={item.id} testID={`notebook-symbol-${item.id}`} accessibilityRole="button" accessibilityLabel={item.label.replace(/([A-Z])/g, " $1").replace(/_/g, " ")} onPress={() => { props.onChoose({ glyph: item.id, role: "normal", dotted: false }); setCategory(null); }} style={styles.drawerGlyphButton}>
                          <NotebookGlyphPreview glyph={item.id} size={22} />
                          <Text numberOfLines={1} style={styles.drawerGlyphLabel}>{item.label.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
            </ScrollView>
          </View>
        ) : null}
        {showAccessibleChooser && !gestureActive && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accessibleChooser} contentContainerStyle={styles.accessibleChooserContent}>
          {roleValues.map((role) => <Pressable key={role} testID={`notebook-note-role-${role}`} accessibilityRole="button" accessibilityLabel={`${ko ? "음표" : "Note"} ${role}`} onPress={() => { gestureRef.current.role = role; setGestureRole(role); }} style={styles.accessibleChoice}><NotebookGlyphPreview glyph={gestureDuration} size={19} role={role} dotted={dotChoice} /></Pressable>)}
          {durations.map((duration) => <Pressable key={duration} testID={`notebook-note-duration-${duration}`} accessibilityRole="button" accessibilityLabel={durationLabels[ko ? "ko" : "en"][durations.indexOf(duration)]} onPress={() => chooseAccessibleNote({ glyph: duration, role: gestureRole, dotted: dotChoice })} style={styles.accessibleChoice}><NotebookGlyphPreview glyph={duration} size={18} role={gestureRole} dotted={dotChoice} /></Pressable>)}
          <Pressable testID="notebook-note-plain" accessibilityRole="button" accessibilityLabel={ko ? "일반 음표" : "Plain"} onPress={() => { gestureRef.current.dotted = false; setDotChoice(false); }} style={styles.accessibleChoice}><NotebookGlyphPreview glyph={gestureDuration} size={18} role={gestureRole} /></Pressable>
          <Pressable testID="notebook-note-dotted" accessibilityRole="button" accessibilityLabel={ko ? "점음표" : "Dotted"} onPress={() => { gestureRef.current.dotted = true; setDotChoice(true); }} style={styles.accessibleChoice}><NotebookGlyphPreview glyph={gestureDuration} size={18} role={gestureRole} dotted /></Pressable>
        </ScrollView>}
      </View>
    );
  }

  if (mode === "select") {
    return (
      <View style={styles.dock}>
        <View style={styles.selectionTabs}>
          <Pressable testID="notebook-selection-tab" accessibilityRole="tab" accessibilityState={{ selected: selectionTab === "select" }} onPress={() => setSelectionTab("select")} style={[styles.selectionTab, selectionTab === "select" && styles.selectedTool]}><Text style={styles.toolText}>{ko ? "선택" : "Selection"}</Text></Pressable>
          <Pressable testID="notebook-clipboard-tab" accessibilityRole="tab" accessibilityState={{ selected: selectionTab === "clipboard" }} onPress={() => setSelectionTab("clipboard")} style={[styles.selectionTab, selectionTab === "clipboard" && styles.selectedTool]}><Text style={styles.toolText}>{ko ? "클립보드" : "Clipboard"} · {props.clipboard.length}</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectRow}>
          {selectionTab === "select" ? <>
          <Pressable testID="notebook-tool-select" accessibilityRole="button" accessibilityState={{ selected: props.tool === "select" }} onPress={() => props.onTool("select")} style={[styles.toolButton, props.tool === "select" && styles.selectedTool]}>
            <Ionicons name="scan-outline" size={17} color={props.tool === "select" ? "#674f31" : "#7b7163"} />
            <Text style={[styles.toolText, props.tool === "select" && styles.selectedText]}>{ko ? "범위 선택" : "Select"}</Text>
          </Pressable>
          <View style={styles.selectionStatus}><Text style={styles.selectionCount}>{props.selectionCount}</Text><Text style={styles.selectionLabel}>{ko ? "개 선택됨" : "selected"}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "선택 크기 줄이기" : "Shrink selection"} disabled={!props.selectionCount} onPress={() => props.onResizeSelection(0.9)} style={[styles.iconTool, !props.selectionCount && styles.disabled]}><Ionicons name="remove" size={17} color="#675d50" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "선택 크기 키우기" : "Grow selection"} disabled={!props.selectionCount} onPress={() => props.onResizeSelection(1.1)} style={[styles.iconTool, !props.selectionCount && styles.disabled]}><Ionicons name="add" size={17} color="#675d50" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "선택 지우기" : "Clear selection"} disabled={!props.selectionCount} onPress={props.onClearSelection} style={[styles.actionChip, !props.selectionCount && styles.disabled]}><Ionicons name="close" size={15} color="#756952" /><Text style={styles.actionText}>{ko ? "해제" : "Clear"}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "선택 항목 삭제" : "Delete selection"} disabled={!props.selectionCount} onPress={props.onDeleteSelection} style={[styles.deleteChip, !props.selectionCount && styles.disabled]}><Ionicons name="trash-outline" size={15} color="#925d4c" /><Text style={styles.deleteText}>{ko ? "삭제" : "Delete"}</Text></Pressable>
          <Pressable testID="notebook-clipboard-save" accessibilityRole="button" accessibilityLabel={ko ? "선택 묶음 저장" : "Save selection to clipboard"} disabled={!props.selectionCount} onPress={props.onSaveClipboard} style={[styles.saveChip, !props.selectionCount && styles.disabled]}><Ionicons name="copy-outline" size={15} color="#fffaf1" /><Text style={styles.saveText}>{ko ? "클립보드에 보관" : "Save bundle"}</Text></Pressable>
          </> : <>
          <Text style={styles.dockEyebrow}>{ko ? "보관한 묶음" : "SAVED BUNDLES"}</Text>
          {props.clipboard.length ? props.clipboard.map((item) => (
            <Pressable key={item.id} testID={`notebook-paste-${item.id}`} accessibilityRole="button" accessibilityLabel={`${ko ? "붙여넣기" : "Paste"} ${item.label}`} onPress={() => props.onPaste(item.id)} style={styles.bundleButton}>
              <Ionicons name="albums-outline" size={16} color="#725b3c" />
              <View><Text numberOfLines={1} style={styles.bundleName}>{item.label}</Text><Text style={styles.bundleMeta}>{item.count} {ko ? "개체" : "objects"}</Text></View>
              <Ionicons name="add-circle-outline" size={17} color="#927a57" />
            </Pressable>
          )) : <Text style={styles.emptyBundle}>{ko ? "선택한 묶음을 보관하면 여기에 나타납니다." : "Saved bundles will appear here."}</Text>}
          </>}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.dock}>
      <View style={styles.settingsDock}>
        <Ionicons name="options-outline" size={17} color="#806a4b" />
        <Text style={styles.settingsDockText}>{ko ? "설정 패널에서 노트와 페이지를 관리합니다." : "Manage notebook and page settings in the settings panel."}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  selectionTabs: { flexDirection: "row", gap: 8, paddingHorizontal: 10, paddingTop: 6 },
  selectionTab: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: "#e8e0d4" },
  dock: { position: "relative", zIndex: 25, elevation: 12, overflow: "visible", width: "100%", minHeight: 66, maxHeight: 216, borderTopWidth: 1, borderTopColor: "#e5ddd0", backgroundColor: "rgba(255,253,248,0.98)" },
  inkRow: { minHeight: 66, alignItems: "center", paddingHorizontal: 10, gap: 6 },
  toolButton: { minHeight: 42, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: "#e8e0d4", backgroundColor: "#fffdf9", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  selectedTool: { borderColor: "#bca483", backgroundColor: "#f2ece2" },
  toolText: { color: "#70675a", fontSize: 11, fontWeight: "600" },
  selectedText: { color: "#59462e", fontWeight: "700" },
  separator: { width: 1, height: 28, backgroundColor: "#e9e2d8", marginHorizontal: 3 },
  widthButton: { width: 36, height: 36, borderRadius: 9, borderWidth: 1, borderColor: "transparent", backgroundColor: "#f7f3ec", alignItems: "center", justifyContent: "center" },
  selectedWidth: { borderColor: "#bca483", backgroundColor: "#eee6d9" },
  iconTool: { width: 37, height: 37, borderRadius: 10, backgroundColor: "#f4f0e8", alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.38 },
  zoomValue: { color: "#665944", minWidth: 38, textAlign: "center", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  notesDockContent: { minHeight: 58, paddingHorizontal: 9, paddingTop: 5, paddingBottom: 5, gap: 4 },
  noteGestureRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  gestureCaption: { flex: 1, gap: 3 },
  dockEyebrow: { color: "#9b8d77", fontSize: 8, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
  gestureHint: { color: "#a19480", fontSize: 8 },
  noteGesture: { height: 43, width: 190, maxWidth: "64%", borderRadius: 11, borderWidth: 1, borderColor: "#e7dece", backgroundColor: "#f9f5ed", overflow: "hidden" },
  noteGestureActive: { backgroundColor: "#f3ecdf", borderColor: "#bea985" },
  gestureIdle: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  gestureLabel: { color: "#75664f", fontSize: 10, fontWeight: "600" },
  gestureLive: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  gestureDock: { minHeight: 76, padding: 9, justifyContent: "center", alignItems: "center" },
  gestureDockTile: { width: "100%", maxWidth: 300, height: 52 },
  rolePreview: { alignItems: "center" },
  previewLabel: { color: "#9a8b72", fontSize: 7, fontWeight: "800", letterSpacing: 0.7 },
  previewValue: { color: "#66533a", fontSize: 9, fontWeight: "700", marginTop: 2 },
  previewGlyph: { height: 42, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  categoryRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 54, paddingRight: 4 },
  categoryButton: { minHeight: 39, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: "#e7dfd2", backgroundColor: "#fffdf9", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  noteOrigin: { width: 104, minWidth: 104, height: 70, minHeight: 70, flexShrink: 0, borderColor: "#bca483", backgroundColor: "#f3ecdf" },
  originInner: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  categoryActive: { backgroundColor: "#f1eadd", borderColor: "#bba27f" },
  categoryLabel: { color: "#62543e", fontSize: 9, fontWeight: "800", letterSpacing: 0.25 },
  tupletBracket: { color: "#725b3c", fontSize: 15, fontWeight: "700", lineHeight: 19 },
  gestureLayer: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 80, elevation: 22, overflow: "visible" },
  roleChoices: { position: "absolute", height: 42, flexDirection: "row", alignItems: "center", gap: 5, overflow: "visible" },
  roleChoice: { width: 58, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#e4d9c7", backgroundColor: "#fffdf8" },
  roleChoiceActive: { backgroundColor: "#f0e5d3", borderColor: "#b69a70" },
  durationColumn: { position: "absolute", width: 96, padding: 4, borderRadius: 12, borderWidth: 1, borderColor: "#ded3c2", backgroundColor: "#fffdf8", shadowColor: "#403321", shadowOpacity: 0.17, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 20 },
  durationChoice: { width: 86, height: 35, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  branchChoice: { position: "absolute", width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: "#e6dccd", backgroundColor: "#fffdf8" },
  accessibleChooser: { position: "absolute", left: 5, right: 5, bottom: "100%", zIndex: 80, maxHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: "#dfd3c1", backgroundColor: "#fffdf8", elevation: 18 },
  accessibleChooserContent: { minHeight: 56, alignItems: "center", gap: 5, paddingHorizontal: 6 },
  accessibleChoice: { width: 48, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: "#e8e0d4", backgroundColor: "#fffdf9" },
  verticalDurationOverlay: { position: "absolute", left: 10, bottom: "100%", zIndex: 70, elevation: 20, width: 194, maxHeight: 245, padding: 6, borderWidth: 1, borderColor: "#ded3c2", borderRadius: 12, backgroundColor: "#fffdf8", shadowColor: "#403321", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  overlayEyebrow: { color: "#927d5c", fontSize: 8, fontWeight: "800", letterSpacing: 0.9, paddingHorizontal: 5, paddingBottom: 3 },
  verticalDurationRow: { minHeight: 29, paddingHorizontal: 5, borderRadius: 7, flexDirection: "row", alignItems: "center", gap: 7 },
  verticalDurationActive: { backgroundColor: "#f0e7d9" },
  verticalDurationLabel: { flex: 1, color: "#736650", fontSize: 9, fontWeight: "600" },
  verticalEdgeHint: { color: "#aa9a80", fontSize: 7, fontWeight: "800", letterSpacing: 0.5 },
  categoryDrawer: { position: "absolute", left: 8, right: 8, bottom: "100%", zIndex: 65, elevation: 18, maxHeight: 350, borderWidth: 1, borderColor: "#e1d7c8", borderRadius: 14, backgroundColor: "#fffdf8", shadowColor: "#403321", shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, overflow: "hidden" },
  drawerHeader: { minHeight: 43, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#eee7dd" },
  drawerTitle: { flex: 1, color: "#564a38", fontSize: 12, fontWeight: "700" },
  drawerClose: { width: 33, height: 33, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#f5f0e8" },
  drawerScroll: { maxHeight: 305 },
  drawerContent: { padding: 11, gap: 8 },
  drawerEyebrow: { color: "#98866a", fontSize: 8, fontWeight: "800", letterSpacing: 0.8, marginTop: 2 },
  drawerGlyphGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  drawerGlyphButton: { width: 71, minHeight: 62, paddingHorizontal: 4, paddingVertical: 4, borderRadius: 9, borderWidth: 1, borderColor: "#e9e2d8", backgroundColor: "#fffdf9", alignItems: "center", justifyContent: "center", gap: 2, overflow: "hidden" },
  drawerGlyphSelected: { borderColor: "#b79d78", backgroundColor: "#f1eadd" },
  drawerGlyphLabel: { maxWidth: 66, color: "#7b6d59", fontSize: 8, textAlign: "center", textTransform: "capitalize" },
  drawerControlRow: { flexDirection: "row", gap: 6 },
  roleButton: { flex: 1, minHeight: 39, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: "#e8e0d4", backgroundColor: "#fffdf9" },
  roleButtonText: { color: "#6b5d47", fontSize: 9, fontWeight: "700" },
  drawerActionRow: { flexDirection: "row", gap: 7 },
  dotSwitch: { minHeight: 40, minWidth: 90, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e8e0d4", borderRadius: 9, backgroundColor: "#fffdf9" },
  placeNoteButton: { flex: 1, minHeight: 40, borderRadius: 9, backgroundColor: "#806546", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  placeNoteText: { color: "#fffaf1", fontSize: 10, fontWeight: "700" },
  drawerMarkGroup: { gap: 6, paddingBottom: 3 },
  popupHint: { color: "#9a8c77", fontSize: 8, textAlign: "center", paddingVertical: 3 },
  noteDivider: { height: 30, width: 1, backgroundColor: "#e8e0d5", marginHorizontal: 1 },
  fallbackGroup: { gap: 4 },
  fallbackLine: { flexDirection: "row", alignItems: "center", gap: 3 },
  glyphButton: { width: 34, height: 32, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e8e1d7", backgroundColor: "#fffdf9", borderRadius: 8, overflow: "hidden" },
  glyphButtonActive: { borderColor: "#bda582", backgroundColor: "#f1eadd" },
  pillButton: { minHeight: 26, paddingHorizontal: 7, borderRadius: 7, borderWidth: 1, borderColor: "#e8e1d7", justifyContent: "center", backgroundColor: "#fffdf9" },
  pillActive: { borderColor: "#bda582", backgroundColor: "#f1eadd" },
  pillText: { color: "#766a58", fontSize: 8, fontWeight: "600" },
  restButton: { width: 33, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#fffdf9", borderWidth: 1, borderColor: "#e8e1d7", overflow: "hidden" },
  tupletGroup: { gap: 5, minWidth: 112 },
  tupletButton: { minHeight: 39, paddingHorizontal: 9, borderWidth: 1, borderColor: "#e6dccd", borderRadius: 9, backgroundColor: "#fffdf8", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  tupletOpen: { backgroundColor: "#f2ecdf", borderColor: "#bca483" },
  tupletLabel: { color: "#66563e", fontSize: 9, fontWeight: "700" },
  tupletCount: { color: "#8a6b3e", fontSize: 12, fontWeight: "800" },
  markGroup: { gap: 5, maxWidth: 290 },
  markItems: { flexDirection: "row", flexWrap: "wrap", gap: 4, maxWidth: 280 },
  markButton: { width: 38, height: 37, borderRadius: 8, borderWidth: 1, borderColor: "#e9e2d8", backgroundColor: "#fffdf9", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  selectRow: { minHeight: 66, alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 7 },
  selectionStatus: { minWidth: 68, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 4 },
  selectionCount: { color: "#604b30", fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  selectionLabel: { color: "#897d6b", fontSize: 9 },
  actionChip: { minHeight: 36, paddingHorizontal: 9, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f3eee6" },
  actionText: { color: "#6b5d47", fontSize: 10, fontWeight: "600" },
  deleteChip: { minHeight: 36, paddingHorizontal: 9, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f8efea" },
  deleteText: { color: "#865a49", fontSize: 10, fontWeight: "600" },
  saveChip: { minHeight: 37, paddingHorizontal: 11, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#806546" },
  saveText: { color: "#fffaf1", fontSize: 10, fontWeight: "700" },
  bundleButton: { minHeight: 43, minWidth: 135, maxWidth: 190, paddingHorizontal: 8, borderRadius: 9, borderWidth: 1, borderColor: "#e5dccf", backgroundColor: "#fffdf8", flexDirection: "row", alignItems: "center", gap: 7 },
  bundleName: { maxWidth: 110, color: "#5e5240", fontSize: 9, fontWeight: "700" },
  bundleMeta: { color: "#988b77", fontSize: 8, marginTop: 2 },
  emptyBundle: { maxWidth: 180, color: "#948875", fontSize: 9, lineHeight: 13 },
  settingsDock: { minHeight: 63, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  settingsDockText: { color: "#837764", fontSize: 10 },
});

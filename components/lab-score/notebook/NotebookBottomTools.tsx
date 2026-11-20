import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ALL_INSTR_SYMBOLS, ACCIDENTALS, ARTICULATIONS, REPEAT_SIGNS } from "@/components/ScorePalette";
import { NotebookGlyphPreview } from "./NotebookGlyph";
import { NotebookTupletPreview } from "./NotebookTupletGlyph";
import { useNotebookRestPicker } from "./NotebookRestPicker";
import { useNotebookNotationPicker } from "./NotebookNotePicker";
import { noteDurations as durations, noteRoles as roleValues, type NotePickerChoice } from "@/lib/notebook-note-picker";
import type { NotebookMode } from "./NotebookModeMenu";
import { useLanguage } from "@/contexts/LanguageContext";
import type { NotebookEraserMode } from "@/lib/notebook-erasing";
import { NotebookInkOptions } from "./NotebookInkOptions";
import { NotebookInkToolbar } from "./NotebookInkToolbar";
import { NotebookSelectionTools } from "./NotebookSelectionTools";
import type { NotebookSelectionUnit } from "@/lib/notebook-editing";
import { defaultNotationMeter, type NotebookMeter } from "@/lib/notebook-sections";
import { NotebookMeterPicker } from "./NotebookMeterPicker";
import { symbolCategories, type NotebookSymbolCategory } from "@/lib/notebook-keyboard";

export type NotebookToolsKeyboard = {
  route: (event: KeyboardEvent) => boolean;
  dismissHistory: () => boolean;
};

type Tool = "pen" | "erase" | "move" | "select";
type Choice = { glyph: string; role: "normal" | "ghost" | "strong"; dotted: boolean };
type ClipboardItem = { id: string; label: string; count: number };
type Props = {
  ko: boolean;
  mode: NotebookMode;
  tool: Tool;
  lineWidth: number;
  lineColor: string;
  onColor: (color: string) => void;
  eraserMode: NotebookEraserMode;
  onEraserMode: (mode: NotebookEraserMode) => void;
  toolPopup: "pen" | "erase" | null;
  onToolPopup: (popup: "pen" | "erase" | null) => void;
  scale: number;
  pickerTop?: number;
  pickerBottom?: number;
  layoutKey?: number;
  canUndo: boolean;
  canRedo: boolean;
  onTool: (tool: Tool) => void;
  onWidth: (width: number) => void;
  onZoom: (scale: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAutoSpace: () => void;
  autoSpaceDisabled: boolean;
  onChoose: (choice: Choice) => void;
  notationMeter?: NotebookMeter;
  onTuplet: () => void;
  tupletCount: number | null;
  selectionCount: number;
  onClearSelection: () => void;
  onSaveClipboard: () => void;
  onDeleteSelection: () => void;
  onResizeSelection: (factor: number) => void;
  clipboard: ClipboardItem[];
  onPaste: (id: string) => void;
  onPreferredWidth?: (contentWidth: number) => void;
  selectionUnit?: NotebookSelectionUnit;
  onSelectionUnit?: (unit: NotebookSelectionUnit) => void;
  onEditSelection?: () => void;
  keyboardRef: React.RefObject<NotebookToolsKeyboard | null>;
  symbolRequest?: { group: NotebookSymbolCategory };
  onCloseKeyboardSymbols: () => void;
  onSticking: () => void;
};

type NotesCategory = "note" | "marks" | null;
const durationLabels = {
  en: ["Whole", "Half", "Quarter", "Eighth", "16th", "32nd"],
  ko: ["온음표", "2분음표", "4분음표", "8분음표", "16분음표", "32분음표"],
};

export function NotebookBottomTools(props: Props) {
  const { t } = useLanguage();
  const { ko, mode } = props;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [showAccessibleChooser, setShowAccessibleChooser] = useState(false);
  const [category, setCategory] = useState<NotesCategory>(null);
  const [meterPicker, setMeterPicker] = useState(false);
  const symbolGroup = props.symbolRequest?.group;
  const marksOpen = category === "marks" || !!symbolGroup;
  const [focusedMark, setFocusedMark] = useState<string | null>(null);
  const markButtons = useRef(new Map<string, View>());
  const inkKeyboard = useRef<((event: KeyboardEvent) => boolean) | null>(null);
  const dockRef = useRef<View>(null);
  const [dockPosition, setDockPosition] = useState({ x: 0, y: 0 });
  const [dockWidth, setDockWidth] = useState(0);
  const [dockHeight, setDockHeight] = useState(0);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const pickerTop = props.pickerTop ?? 8;
  const pickerBottom = props.pickerBottom ?? windowHeight - 8;
  const resetKey = `${mode}:${windowWidth}:${windowHeight}:${props.layoutKey}`;
  const gestureOptions = {
    dockRef, ko, width: windowWidth, top: pickerTop, bottom: Math.max(pickerTop, Math.min(windowHeight, pickerBottom)), resetKey,
    onChoose: props.onChoose,
    onBegin: () => { setMoreActionsOpen(false); setShowAccessibleChooser(false); setCategory(null); props.onCloseKeyboardSymbols(); },
  };
  const notePicker = useNotebookNotationPicker({
    ...gestureOptions, kind: "note",
  });
  const { role: gestureRole, glyph: gestureDuration, dotted: dotChoice } = notePicker.choice;
  // RNW can deliver onLayout before this mode's ref is attached. Measure after
  // commit as well, otherwise an untouched marks drawer uses y=0 and collapses.
  useEffect(() => {
    if (mode !== "notes") return;
    const frame = requestAnimationFrame(() => dockRef.current?.measureInWindow((x, y, width, height) => {
      setDockWidth(width);
      setDockHeight(height);
      setDockPosition({ x, y });
    }));
    return () => cancelAnimationFrame(frame);
  }, [mode, windowWidth, windowHeight, pickerTop, pickerBottom, category, props.layoutKey]);
  const roomAbove = Math.max(0, dockPosition.y - pickerTop - 8);
  const roomBelow = Math.max(0, pickerBottom - (dockPosition.y + (dockHeight || 66)) - 8);
  const compactNoteActions = dockWidth > 0 && dockWidth < 440;
  const chooserAbove = roomAbove >= 66 || roomAbove >= roomBelow;
  const moreActionsAbove = roomAbove >= 58 || roomAbove >= roomBelow;
  const drawerAvailable = Math.max(64, Math.min(350, Math.max(roomAbove, roomBelow)));
  const drawerAbove = roomAbove >= 180 || roomAbove >= roomBelow;
  const restPicker = useNotebookRestPicker({
    ...gestureOptions,
    ko,
    chooserAbove,
    chooserSpace: chooserAbove ? roomAbove : roomBelow,
    otherPickerActive: notePicker.active,
  });
  const restGestureActive = restPicker.active;
  const pickerActive = notePicker.active || restGestureActive;
  const closeMarks = () => { setCategory(null); props.onCloseKeyboardSymbols(); };

  useEffect(() => { setShowAccessibleChooser(false); setCategory(null); setMoreActionsOpen(false); }, [resetKey]);
  useEffect(() => {
    if (mode !== "notes" || !props.symbolRequest) return;
    setFocusedMark(null); setMoreActionsOpen(false);
  }, [mode, props.symbolRequest]);
  useEffect(() => {
    if (Platform.OS !== "web" || !moreActionsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-notebook-history]")) setMoreActionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [moreActionsOpen]);

  const chooseAccessibleNote = (choice: NotePickerChoice) => {
    notePicker.setAccessibleChoice(choice);
    setShowAccessibleChooser(false);
    setCategory(null);
    props.onChoose(choice);
  };

  const usedMarkIds = new Set<string>();
  const markGroups = [
    {
      label: ko ? "음자리표" : "Clefs",
      literal: true,
      items: [
        { id: "clef-treble", label: ko ? "높은음자리표" : "Treble clef" },
        { id: "clef-bass", label: ko ? "낮은음자리표" : "Bass clef" },
        { id: "clef-alto", label: ko ? "가온음자리표" : "Alto clef" },
        { id: "clef-tenor", label: ko ? "테너음자리표" : "Tenor clef" },
        { id: "clef-percussion", label: ko ? "타악기 음자리표" : "Percussion clef" },
      ],
    },
    {
      label: ko ? "박자표" : "Meters",
      literal: true,
      items: [
        { id: "meter-picker", label: ko ? "박자표 만들기" : "Custom meter" },
      ],
    },
    { label: ko ? "임시표" : "Accidentals", items: ACCIDENTALS.map((item) => ({ id: item.value, label: item.labelKey })) },
    { label: ko ? "아티큘레이션" : "Articulations", items: ARTICULATIONS.map((item) => ({ id: item.id, label: item.labelKey })) },
    { label: ko ? "반복 · 이동 부호" : "Repeats & navigation", items: [{ id: "barline", label: ko ? "마디선" : "Barline" }, ...REPEAT_SIGNS.map((item) => ({ id: item.id, label: item.labelKey }))] },
    { label: ko ? "악기 기호" : "Instrument marks", items: [
      { id: "percussion-sticking", label: ko ? "타악기 연주법" : "Percussion sticking" },
      ...ALL_INSTR_SYMBOLS.map((item) => ({ id: item.id, label: item.labelKey })),
    ] },
  ].map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, label: ["barline", "percussion-sticking"].includes(item.id) || ("literal" in group && group.literal) ? item.label : t("scoreMode", item.label as any) })).filter((item) => {
      if (usedMarkIds.has(item.id)) return false;
      usedMarkIds.add(item.id);
      return true;
    }),
  }));
  const visibleGroups = symbolGroup ? markGroups.filter((_, i) => symbolCategories[i] === symbolGroup) : markGroups;
  const marks = visibleGroups.flatMap((group) => group.items);
  const chooseMark = (glyph: string) => {
    if (glyph === "meter-picker") setMeterPicker(true);
    else if (glyph === "percussion-sticking") props.onSticking();
    else props.onChoose({ glyph, role: "normal", dotted: false });
    closeMarks();
  };
  const firstMarkId = marks[0]?.id;
  useEffect(() => {
    if (!marksOpen || !symbolGroup || focusedMark || !firstMarkId) return;
    setFocusedMark(firstMarkId);
    markButtons.current.get(firstMarkId)?.focus();
  }, [marksOpen, symbolGroup, focusedMark, firstMarkId]);
  const route = (event: KeyboardEvent) => {
    if (mode !== "notes") return inkKeyboard.current?.(event) ?? false;
    if (meterPicker) {
      if (event.key === "Escape") { event.preventDefault(); setMeterPicker(false); }
      return true;
    }
    if (event.key === "Escape") {
      const close = notePicker.active || showAccessibleChooser ? () => { notePicker.cancel(); setShowAccessibleChooser(false); }
        : restGestureActive || restPicker.showChooser ? restPicker.cancel
          : marksOpen ? closeMarks : moreActionsOpen ? () => setMoreActionsOpen(false) : null;
      if (!close) return false;
      event.preventDefault(); close(); return true;
    }
    if (marksOpen) {
      const key = event.key;
      const target = event.target as HTMLElement | null;
      const targetId = target?.closest?.("[data-notebook-mark]")?.getAttribute("data-notebook-mark");
      const at = marks.findIndex((mark) => mark.id === (targetId ?? focusedMark));
      if (key.startsWith("Arrow") && marks.length) {
        event.preventDefault();
        const index = at < 0 ? 0 : (at + (key === "ArrowLeft" || key === "ArrowUp" ? marks.length - 1 : 1)) % marks.length;
        setFocusedMark(marks[index].id);
        markButtons.current.get(marks[index].id)?.focus();
      } else if (key === "Enter" && !event.repeat && (targetId || !target?.closest?.("button,[role=button]"))) {
        if (at >= 0) { event.preventDefault(); chooseMark(marks[at].id); }
      }
      return true;
    }
    return pickerActive || showAccessibleChooser || restPicker.showChooser;
  };
  useEffect(() => {
    props.keyboardRef.current = { route, dismissHistory: () => {
      if (!moreActionsOpen) return false;
      setMoreActionsOpen(false);
      return true;
    } };
    return () => { props.keyboardRef.current = null; };
  });

  if (mode === "ink") {
    return (
      <View style={[styles.dock, styles.wideDock]}>
        <NotebookInkOptions ko={ko} popup={props.toolPopup} onClose={() => props.onToolPopup(null)}
          color={props.lineColor} width={props.lineWidth} onColor={props.onColor} onWidth={props.onWidth}
          eraserMode={props.eraserMode} onEraserMode={props.onEraserMode} />
        <NotebookInkToolbar
          keyboardRef={inkKeyboard}
          ko={ko}
          tool={props.tool}
          scale={props.scale}
          canUndo={props.canUndo}
          canRedo={props.canRedo}
          pickerTop={pickerTop}
          pickerBottom={pickerBottom}
          layoutKey={props.layoutKey}
          onTool={props.onTool}
          onToolPopup={props.onToolPopup}
          onZoom={props.onZoom}
          onUndo={props.onUndo}
          onRedo={props.onRedo}
          onPreferredWidth={props.onPreferredWidth}
        />
      </View>
    );
  }

  if (mode === "notes") {
    return (
      <View ref={dockRef} style={[styles.dock, styles.notesDock]} onLayout={() => dockRef.current?.measureInWindow((x, y, width, height) => {
        setDockWidth(width);
        setDockHeight(height);
        setDockPosition({ x, y });
      })}>
          <View testID="notebook-note-idle-tools" style={styles.notesDockContent}>
            <View style={styles.categoryRow}>
              {/* Hide the idle control without removing the gesture target or moving the layout. */}
              <View testID="notebook-note-tile" ref={notePicker.originRef} collapsable={false} pointerEvents={restGestureActive ? "none" : "auto"} aria-hidden={pickerActive || undefined} accessibilityElementsHidden={pickerActive} importantForAccessibility={pickerActive ? "no-hide-descendants" : "auto"} {...notePicker.panHandlers} style={[styles.categoryButton, styles.noteOrigin, pickerActive && styles.hiddenNeighbor, Platform.OS === "web" && { touchAction: "none", userSelect: "none" }]}>
                <Pressable testID="notebook-note-origin" disabled={restGestureActive} tabIndex={pickerActive ? -1 : undefined} accessibilityRole="button" accessibilityLabel={ko ? "음표 선택. 좌우로 강도를, 위로 음가를 고르세요." : "Note picker. Swipe sideways for role, up for duration."} accessibilityState={{ expanded: showAccessibleChooser }} accessibilityActions={[{ name: "expand", label: ko ? "음표 선택기 펼치기" : "Expand note chooser" }]} onAccessibilityAction={(event) => { if (!pickerActive && event.nativeEvent.actionName === "expand") setShowAccessibleChooser(true); }} onPress={(event) => {
                  const native = event.nativeEvent as typeof event.nativeEvent & { pointerType?: string; detail?: number };
                  if (pickerActive || (notePicker.consumePress() && native.pointerType !== "keyboard" && native.detail !== 0)) return;
                  setShowAccessibleChooser(true);
                }} style={styles.originInner}>
                  <View style={styles.categoryIconFrame}><NotebookGlyphPreview glyph={gestureDuration} size={22} role={gestureRole} dotted={dotChoice} /></View>
                  <Text style={styles.categoryLabel}>{ko ? "음표" : "Note"}</Text>
                </Pressable>
              </View>
              {restPicker.origin}
              <Pressable testID="notebook-tuplet" disabled={pickerActive} accessibilityElementsHidden={pickerActive} accessibilityRole="button" accessibilityState={{ selected: props.tupletCount !== null }} onPress={() => { setMoreActionsOpen(false); props.onTuplet(); }} style={[styles.categoryButton, props.tupletCount !== null && styles.categoryActive, pickerActive && styles.hiddenNeighbor]}>
                <View style={styles.categoryIconFrame}><NotebookTupletPreview count={props.tupletCount ?? 3} /></View>
                <Text style={styles.categoryLabel}>{ko ? "잇단음표" : "Tuplet"}</Text>
              </Pressable>
              <Pressable testID="notebook-category-marks" disabled={pickerActive} accessibilityElementsHidden={pickerActive} accessibilityRole="button" accessibilityState={{ expanded: marksOpen, selected: marksOpen }} onPress={() => { setMoreActionsOpen(false); setFocusedMark(null); if (marksOpen) closeMarks(); else setCategory("marks"); }} style={[styles.categoryButton, marksOpen && styles.categoryActive, pickerActive && styles.hiddenNeighbor]}>
                <View style={styles.categoryIconFrame}><Ionicons name="musical-notes-outline" size={21} color="#725b3c" /></View>
                <Text style={styles.categoryLabel}>{ko ? "기호" : "Marks"}</Text>
              </Pressable>
              {compactNoteActions ? (
                 <Pressable testID="notebook-note-more" dataSet={{ notebookHistory: "true" }} disabled={pickerActive} accessibilityElementsHidden={pickerActive} accessibilityRole="button" accessibilityLabel={ko ? "더 많은 편집 도구" : "More editing tools"} accessibilityState={{ expanded: moreActionsOpen }} onPress={() => setMoreActionsOpen((open) => !open)} style={[styles.moreActionsButton, pickerActive && styles.hiddenNeighbor]}>
                  <Ionicons name={moreActionsOpen ? "close" : "ellipsis-horizontal"} size={19} color="#675d50" />
                </Pressable>
              ) : (
                <>
                  <Pressable testID="notebook-auto-space" accessibilityElementsHidden={pickerActive} accessibilityRole="button" accessibilityLabel={ko ? "같은 간격으로 정리" : "Space notes evenly"} disabled={pickerActive || props.autoSpaceDisabled} onPress={props.onAutoSpace} style={[styles.inlineActionButton, props.autoSpaceDisabled && styles.disabled, pickerActive && styles.hiddenNeighbor]}>
                    <Ionicons name="options-outline" size={16} color="#695538" /><Text style={styles.autoSpaceText}>{ko ? "간격 정리" : "Auto-space"}</Text>
                  </Pressable>
                  <Pressable testID="notebook-note-undo" accessibilityElementsHidden={pickerActive} accessibilityRole="button" accessibilityLabel={ko ? "실행 취소" : "Undo"} disabled={pickerActive || !props.canUndo} onPress={props.onUndo} style={[styles.noteHistoryButton, !props.canUndo && styles.disabled, pickerActive && styles.hiddenNeighbor]}><Ionicons name="arrow-undo" size={17} color="#675d50" /></Pressable>
                  <Pressable testID="notebook-note-redo" accessibilityElementsHidden={pickerActive} accessibilityRole="button" accessibilityLabel={ko ? "다시 실행" : "Redo"} disabled={pickerActive || !props.canRedo} onPress={props.onRedo} style={[styles.noteHistoryButton, !props.canRedo && styles.disabled, pickerActive && styles.hiddenNeighbor]}><Ionicons name="arrow-redo" size={17} color="#675d50" /></Pressable>
                </>
              )}
            </View>
          </View>

           {compactNoteActions && moreActionsOpen && !pickerActive && <View testID="notebook-note-more-menu" dataSet={{ notebookHistory: "true" }} accessibilityRole="menu" style={[styles.moreActionsMenu, moreActionsAbove ? { bottom: "100%", top: undefined } : { top: "100%", bottom: undefined }]}>
            <Pressable testID="notebook-auto-space" accessibilityRole="menuitem" accessibilityLabel={ko ? "같은 간격으로 정리" : "Space notes evenly"} disabled={props.autoSpaceDisabled} onPress={() => { props.onAutoSpace(); setMoreActionsOpen(false); }} style={[styles.moreMenuAction, props.autoSpaceDisabled && styles.disabled]}><Ionicons name="options-outline" size={17} color="#695538" /><Text style={styles.moreMenuLabel}>{ko ? "간격" : "Space"}</Text></Pressable>
             <Pressable testID="notebook-note-undo" accessibilityRole="menuitem" accessibilityLabel={ko ? "실행 취소" : "Undo"} disabled={!props.canUndo} onPress={props.onUndo} style={[styles.moreMenuAction, !props.canUndo && styles.disabled]}><Ionicons name="arrow-undo" size={17} color="#675d50" /><Text style={styles.moreMenuLabel}>{ko ? "취소" : "Undo"}</Text></Pressable>
             <Pressable testID="notebook-note-redo" accessibilityRole="menuitem" accessibilityLabel={ko ? "다시 실행" : "Redo"} disabled={!props.canRedo} onPress={props.onRedo} style={[styles.moreMenuAction, !props.canRedo && styles.disabled]}><Ionicons name="arrow-redo" size={17} color="#675d50" /><Text style={styles.moreMenuLabel}>{ko ? "다시" : "Redo"}</Text></Pressable>
          </View>}

        {notePicker.overlay}

        {restPicker.overlay}

         {marksOpen && !pickerActive ? (
          <View testID="notebook-symbol-drawer" style={[styles.categoryDrawer, drawerAbove
            ? { bottom: "100%", top: undefined }
            : { top: "100%", bottom: undefined },
          { height: drawerAvailable }]}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>{ko ? "악보 기호" : "Musical marks"}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={ko ? "도구 닫기" : "Close tools"} onPress={closeMarks} style={styles.drawerClose}><Ionicons name="close" size={17} color="#796b55" /></Pressable>
            </View>
            <ScrollView style={[styles.drawerScroll, { flex: 1, minHeight: 0 }]} contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
               {visibleGroups.map((group) => (
                  <View key={group.label} style={styles.drawerMarkGroup}>
                    <Text style={styles.drawerEyebrow}>{group.label}</Text>
                    <View style={styles.drawerGlyphGrid}>
                      {group.items.map((item) => (
                          <Pressable key={item.id} ref={(node) => { if (node) markButtons.current.set(item.id, node); else markButtons.current.delete(item.id); }} dataSet={{ notebookMark: item.id }}
                            testID={`notebook-symbol-${item.id}`} accessibilityRole="button" accessibilityLabel={item.label.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
                            onFocus={() => setFocusedMark(item.id)} onPress={() => chooseMark(item.id)} style={[styles.drawerGlyphButton, focusedMark === item.id && styles.drawerGlyphSelected]}>
                            {item.id === "percussion-sticking" ? <Ionicons name="text-outline" size={23} color="#725b3c" /> :
                              <NotebookGlyphPreview glyph={item.id === "meter-picker" ? `time-${props.notationMeter?.beats ?? 4}-${props.notationMeter?.unit ?? 4}` : item.id} size={22} />}
                           <Text numberOfLines={item.id === "percussion-sticking" ? 2 : 1} style={styles.drawerGlyphLabel}>{item.label.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
            </ScrollView>
          </View>
        ) : null}
         {meterPicker && <NotebookMeterPicker ko={ko} initial={props.notationMeter ?? defaultNotationMeter}
           onClose={() => setMeterPicker(false)} onCommit={(glyph) => {
             setMeterPicker(false); props.onChoose({ glyph, role: "normal", dotted: false });
           }} />}
        {showAccessibleChooser && !pickerActive && <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[styles.accessibleChooser, chooserAbove ? { bottom: "100%", top: undefined } : { top: "100%", bottom: undefined }, { maxHeight: Math.max(44, Math.min(58, chooserAbove ? roomAbove : roomBelow)) }]}
          contentContainerStyle={styles.accessibleChooserContent}>
          {roleValues.map((role) => <Pressable key={role} testID={`notebook-note-role-${role}`} accessibilityRole="button" accessibilityState={{ selected: role === gestureRole }} accessibilityLabel={`${ko ? "음표" : "Note"} ${role}`} onPress={() => notePicker.setAccessibleChoice({ role })} style={styles.accessibleChoice}><NotebookGlyphPreview glyph={gestureDuration} size={22} role={role} dotted={dotChoice} /></Pressable>)}
          {durations.map((duration) => <Pressable key={duration} testID={`notebook-note-duration-${duration}`} accessibilityRole="button" accessibilityLabel={durationLabels[ko ? "ko" : "en"][durations.indexOf(duration)]} onPress={() => chooseAccessibleNote({ glyph: duration, role: gestureRole, dotted: dotChoice })} style={styles.accessibleChoice}><NotebookGlyphPreview glyph={duration} size={22} role={gestureRole} dotted={dotChoice} /></Pressable>)}
          <Pressable testID="notebook-note-plain" accessibilityRole="button" accessibilityState={{ selected: !dotChoice }} accessibilityLabel={ko ? "일반 음표" : "Plain"} onPress={() => notePicker.setAccessibleChoice({ dotted: false })} style={styles.accessibleChoice}><NotebookGlyphPreview glyph={gestureDuration} size={22} role={gestureRole} /></Pressable>
          <Pressable testID="notebook-note-dotted" accessibilityRole="button" accessibilityState={{ selected: dotChoice }} accessibilityLabel={ko ? "점음표" : "Dotted"} onPress={() => notePicker.setAccessibleChoice({ dotted: true })} style={styles.accessibleChoice}><NotebookGlyphPreview glyph={gestureDuration} size={22} role={gestureRole} dotted /></Pressable>
        </ScrollView>}
      </View>
    );
  }

  if (mode === "select") {
    return <NotebookSelectionTools {...props} />;
  }

  return (
    <View style={[styles.dock, styles.notesDock]}>
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
  dock: { position: "relative", alignSelf: "center", zIndex: 25, elevation: 12, overflow: "visible", width: "100%", minHeight: 66, maxHeight: 216, backgroundColor: "transparent" },
  wideDock: { maxWidth: 636 },
  notesDock: { maxWidth: 600 },
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
  notesDockContent: { paddingHorizontal: 6, paddingTop: 7, paddingBottom: 7 },
  hiddenNeighbor: { opacity: 0 },
  noteActions: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 2 },
  actionsCaption: { color: "#9b8d77", fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
  actionsSpacer: { width: 0 },
  inlineActionButton: { minHeight: 44, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: "#d9cbb5", backgroundColor: "#f5efe5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  moreActionsButton: { width: 44, height: 44, flexShrink: 0, borderRadius: 10, borderWidth: 1, borderColor: "#ded5c7", backgroundColor: "#f5f0e8", alignItems: "center", justifyContent: "center" },
  moreActionsMenu: { position: "absolute", right: 8, zIndex: 95, minHeight: 58, padding: 5, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 12, borderWidth: 1, borderColor: "#ded3c2", backgroundColor: "#fffdf8", shadowColor: "#403321", shadowOpacity: 0.17, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 20 },
  moreMenuAction: { width: 54, height: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", gap: 2 },
  moreMenuLabel: { color: "#776b58", fontSize: 8, fontWeight: "700" },
  autoSpaceButton: { minHeight: 38, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: "#d9cbb5", backgroundColor: "#f5efe5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  autoSpaceText: { color: "#655138", fontSize: 10, fontWeight: "700" },
  noteHistoryButton: { width: 44, height: 44, flexShrink: 0, borderRadius: 10, backgroundColor: "#f4f0e8", alignItems: "center", justifyContent: "center" },
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
  categoryRow: { minHeight: 64, flexDirection: "row", alignItems: "stretch", gap: 4 },
  categoryButton: { flex: 1, minWidth: 46, height: 64, minHeight: 64, paddingHorizontal: 0, borderRadius: 11, borderWidth: 1, borderColor: "#e7dfd2", backgroundColor: "#fffdf9", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 },
  categoryIconFrame: { height: 36, width: 56, alignItems: "center", justifyContent: "center", overflow: "visible" },
  noteOrigin: { width: undefined, minWidth: 0, height: 64, minHeight: 64, flexShrink: 1, borderColor: "#d7cbb7", backgroundColor: "#fffdf9" },
  originInner: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 3 },
  categoryActive: { backgroundColor: "#f0e7d9", borderColor: "#b69a70" },
  categoryLabel: { color: "#62543e", fontSize: 10, fontWeight: "700", letterSpacing: 0.1, textAlign: "center" },
  tupletBracket: { color: "#725b3c", fontSize: 15, fontWeight: "700", lineHeight: 19 },
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

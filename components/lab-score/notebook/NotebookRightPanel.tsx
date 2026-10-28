import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NotebookSettings, StaffStamp } from "@/lib/staff-notebook";
import { NotebookGlyphPreview } from "./NotebookGlyph";

type PaletteItem = { id: string; symbol: string; label: string };
type Props = {
  ko: boolean; t: Record<string, string>; tool: "pen" | "erase" | "move" | "select"; lineWidth: number;
  scale: number; pageIndex: number; pageCount: number; pageNumber: number; canUndo: boolean; canRedo: boolean;
  stamps: PaletteItem[]; pendingGlyph: string | null; selected: StaffStamp | undefined; settings: NotebookSettings;
  onTool: (tool: "pen" | "erase" | "move" | "select") => void; onWidth: (width: number) => void;
  onZoom: (scale: number) => void; onUndo: () => void; onRedo: () => void; onAddPage: () => void;
  onAddStaff: () => void; onPage: (index: number) => void; onStamp: (glyph: string) => void;
  onConfirm: () => void; onCancel: () => void; onNudge: (axis: "x" | "y", amount: number) => void;
  onSettings: (patch: Partial<NotebookSettings>) => void; onSelectAction: (action: "copy" | "delete" | "grow" | "shrink") => void;
};

export function NotebookRightPanel(props: Props) {
  const { ko, t } = props;
  const toolDefs: Array<{ id: Props["tool"]; icon: keyof typeof Ionicons.glyphMap; label: string; testID?: string }> = [
    { id: "pen", icon: "pencil-outline", label: ko ? "펜" : "Pen", testID: "notebook-pen" },
    { id: "erase", icon: "backspace-outline", label: ko ? "지우개" : "Erase", testID: "notebook-eraser" },
    { id: "select", icon: "scan-outline", label: ko ? "선택" : "Select" },
    { id: "move", icon: "hand-left-outline", label: ko ? "화면 이동" : "Pan" },
  ];
  const groups = [
    { title: ko ? "음표 · 쉼표" : "Notes & rests", items: props.stamps.filter((item) => ["whole", "half", "quarter", "eighth", "sixteenth", "rest-whole", "rest-half", "rest-quarter", "rest-eighth", "rest-sixteenth"].includes(item.id)) },
    { title: ko ? "임시표 · 아티큘레이션" : "Accidentals & marks", items: props.stamps.filter((item) => ["sharp", "flat", "natural", "double_sharp", "double_flat", "staccato", "tenuto", "accent", "fermata", "marcato", "staccatissimo", "snap_pizzicato", "left_hand_pizz"].includes(item.id)) },
    { title: ko ? "반복 · 이동 부호" : "Repeats & navigation", items: props.stamps.filter((item) => ["repeat_start", "repeat_end", "repeat_both", "segno", "coda", "da_capo", "dal_segno", "dal_segno_coda", "da_capo_coda", "fine", "volta1", "volta2"].includes(item.id)) },
    { title: ko ? "꾸밈 · 악기 기호" : "Ornaments & instrument marks", items: props.stamps.filter((item) => !["whole", "half", "quarter", "eighth", "sixteenth", "rest-whole", "rest-half", "rest-quarter", "rest-eighth", "rest-sixteenth", "sharp", "flat", "natural", "double_sharp", "double_flat", "staccato", "tenuto", "accent", "fermata", "marcato", "staccatissimo", "snap_pizzicato", "left_hand_pizz", "repeat_start", "repeat_end", "repeat_both", "segno", "coda", "da_capo", "dal_segno", "dal_segno_coda", "da_capo_coda", "fine", "volta1", "volta2"].includes(item.id)) },
  ];
  const toggle = (label: string, value: boolean, onChange: (next: boolean) => void) => (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.toggleRow}>
      <Text style={styles.smallLabel}>{label}</Text><View style={[styles.toggle, value && styles.toggleActive]}><View style={[styles.toggleKnob, value && styles.knobActive]} /></View>
    </Pressable>
  );
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>{ko ? "작성 도구" : "WRITING TOOLS"}</Text>
      <View style={styles.toolGrid}>
        {toolDefs.map((item) => <Pressable key={item.id} testID={item.testID} accessibilityRole="button" accessibilityState={{ selected: props.tool === item.id }} onPress={() => props.onTool(item.id)} style={[styles.toolTile, props.tool === item.id && styles.toolActive]}>
          <Ionicons name={item.icon} size={18} color={props.tool === item.id ? "#695237" : "#807668"} /><Text style={[styles.toolLabel, props.tool === item.id && styles.activeText]}>{item.label}</Text>
        </Pressable>)}
      </View>
      <View style={styles.toolRow}>
        <Pressable disabled={!props.canUndo} onPress={props.onUndo} style={[styles.toolChip, !props.canUndo && styles.disabled]}><Ionicons name="arrow-undo" size={16} color="#665b4d" /><Text style={styles.smallLabel}>{t.undo}</Text></Pressable>
        <Pressable disabled={!props.canRedo} onPress={props.onRedo} style={[styles.toolChip, !props.canRedo && styles.disabled]}><Ionicons name="arrow-redo" size={16} color="#665b4d" /><Text style={styles.smallLabel}>{t.redo}</Text></Pressable>
      </View>
      <View style={styles.labelLine}><Text style={styles.smallLabel}>{ko ? "선 굵기" : "Ink weight"}</Text><Text style={styles.number}>{props.lineWidth.toFixed(1)}</Text></View>
      <View style={styles.weights}>{[1.4, 2.5, 4, 6].map((weight) => <Pressable key={weight} accessibilityLabel={`${weight}`} onPress={() => props.onWidth(weight)} style={[styles.weightButton, props.lineWidth === weight && styles.weightActive]}><View style={{ width: 22, height: weight, borderRadius: 3, backgroundColor: "#34312b" }} /></Pressable>)}</View>
      <View style={styles.rule} />
      <Text style={styles.eyebrow}>{ko ? "악보 기호" : "MUSICAL MARKS"}</Text>
      <Text style={styles.hint}>{ko ? "선택하면 종이 위에 미리보기가 생깁니다. 위치를 조정한 뒤 놓으세요." : "Choose a mark, adjust its preview on paper, then place it. Marks are visual only."}</Text>
      {props.pendingGlyph ? (
        <View style={styles.pendingCard}>
          <View style={styles.previewBox}><NotebookGlyphPreview glyph={props.pendingGlyph} /></View>
          <View style={{ flex: 1 }}><Text style={styles.smallLabel}>{ko ? "배치 미리보기" : "Placement preview"}</Text><Text style={styles.hint}>{ko ? "종이에서 눌러 위치를 지정할 수 있어요." : "Tap the paper to set its position."}</Text></View>
          <Pressable onPress={props.onCancel} style={styles.iconButton}><Ionicons name="close" size={17} color="#786c5c" /></Pressable>
        </View>
      ) : null}
      {groups.map((group) => <View key={group.title} style={styles.group}>
        <Text style={styles.groupTitle}>{group.title}</Text>
        <View style={styles.symbolGrid}>
          {group.items.map((item) => <Pressable key={item.id} testID={`notebook-symbol-${item.id}`} accessibilityLabel={item.label} onPress={() => props.onStamp(item.id)} style={[styles.symbolButton, props.pendingGlyph === item.id && styles.symbolActive]}>
            <Text numberOfLines={1} style={styles.symbol}>{item.symbol}</Text><Text numberOfLines={1} style={styles.symbolLabel}>{item.label.replace(/_/g, " ")}</Text>
          </Pressable>)}
        </View>
      </View>)}
      <View style={styles.rule} />
      <Text style={styles.eyebrow}>{ko ? "기호 위치" : "PLACEMENT"}</Text>
      <Text style={styles.hint}>{ko ? "보정은 문서 좌표에 적용되며 음가나 시간은 바꾸지 않습니다." : "Offsets use paper coordinates; they never alter duration or timing."}</Text>
      <View style={styles.offsetControls}>
        <View style={styles.nudgePad}>
          <Pressable onPress={() => props.onNudge("y", -6)} style={styles.nudge}><Ionicons name="chevron-up" size={17} color="#5b5144" /></Pressable>
          <View style={styles.nudgeMiddle}><Pressable onPress={() => props.onNudge("x", -6)} style={styles.nudge}><Ionicons name="chevron-back" size={17} color="#5b5144" /></Pressable><View style={styles.nudgeCenter}><Ionicons name="move-outline" size={13} color="#a18c6e" /></View><Pressable onPress={() => props.onNudge("x", 6)} style={styles.nudge}><Ionicons name="chevron-forward" size={17} color="#5b5144" /></Pressable></View>
          <Pressable onPress={() => props.onNudge("y", 6)} style={styles.nudge}><Ionicons name="chevron-down" size={17} color="#5b5144" /></Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.offsetValue}>X {props.settings.offsetX} · Y {props.settings.offsetY}</Text>
          <Pressable onPress={() => props.onSettings({ offsetX: 0, offsetY: 0 })} style={styles.reset}><Text style={styles.resetText}>{ko ? "보정 초기화" : "Reset offsets"}</Text></Pressable>
        </View>
      </View>
      {toggle(ko ? "오선 줄 · 칸에 맞추기" : "Snap to staff lines & spaces", props.settings.snap, (snap) => props.onSettings({ snap }))}
      {props.selected ? (
        <View style={styles.selectionCard}>
          <Text style={styles.groupTitle}>{ko ? "선택한 기호" : "Selected mark"}</Text>
          <View style={styles.selectedRow}>
            <NotebookGlyphPreview glyph={props.selected.glyph} size={23} />
            <Text style={styles.hint}>x {Math.round(props.selected.x)} · y {Math.round(props.selected.y)} · {props.selected.size}px</Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable onPress={() => props.onSelectAction("shrink")} style={styles.actionButton}><Text style={styles.actionText}>−</Text></Pressable>
            <Pressable onPress={() => props.onSelectAction("grow")} style={styles.actionButton}><Text style={styles.actionText}>+</Text></Pressable>
            <Pressable onPress={() => props.onSelectAction("copy")} style={styles.actionButton}><Ionicons name="copy-outline" size={15} color="#5d5346" /></Pressable>
            <Pressable onPress={() => props.onSelectAction("delete")} style={[styles.actionButton, styles.deleteButton]}><Ionicons name="trash-outline" size={15} color="#925d4c" /></Pressable>
          </View>
        </View>
      ) : null}
      {props.pendingGlyph ? <Pressable onPress={props.onConfirm} style={styles.placeButton}><Ionicons name="checkmark" size={17} color="#fffaf2" /><Text style={styles.placeText}>{ko ? "기호 놓기" : "Place mark"}</Text></Pressable> : null}
      <View style={styles.rule} />
      <Text style={styles.eyebrow}>{ko ? "페이지" : "PAGES"}</Text>
      <View style={styles.pageControls}>
        <Pressable onPress={() => props.onPage(Math.max(0, props.pageIndex - 1))} disabled={props.pageIndex === 0} style={[styles.pageArrow, props.pageIndex === 0 && styles.disabled]}><Ionicons name="chevron-back" size={18} color="#665b4d" /></Pressable>
        <Text style={styles.pageCounter}>{t.page} {props.pageNumber} / {props.pageCount}</Text>
        <Pressable onPress={() => props.onPage(Math.min(props.pageCount - 1, props.pageIndex + 1))} disabled={props.pageIndex === props.pageCount - 1} style={[styles.pageArrow, props.pageIndex === props.pageCount - 1 && styles.disabled]}><Ionicons name="chevron-forward" size={18} color="#665b4d" /></Pressable>
      </View>
      <View style={styles.pageControls}>
        <Pressable onPress={props.onAddPage} style={styles.pageAdd}><Ionicons name="duplicate-outline" size={16} color="#66553d" /><Text style={styles.smallLabel}>{t.addPage}</Text></Pressable>
        <Pressable onPress={props.onAddStaff} style={styles.pageAdd}><Ionicons name="add-outline" size={17} color="#66553d" /><Text style={styles.smallLabel}>{t.addStaff}</Text></Pressable>
      </View>
      <View style={styles.zoomRow}>
        <Text style={styles.smallLabel}>{ko ? "종이 확대" : "Paper zoom"}</Text><View style={{ flex: 1 }} />
        <Pressable onPress={() => props.onZoom(props.scale - 0.1)} style={styles.zoomButton}><Ionicons name="remove" size={16} color="#5e5345" /></Pressable>
        <Text style={styles.number}>{Math.round(props.scale * 100)}%</Text>
        <Pressable onPress={() => props.onZoom(props.scale + 0.1)} style={styles.zoomButton}><Ionicons name="add" size={16} color="#5e5345" /></Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 17, paddingTop: 16, paddingBottom: 30 },
  eyebrow: { color: "#947d5d", fontSize: 9, letterSpacing: 1.4, fontWeight: "800", marginBottom: 8 },
  toolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  toolTile: { flexGrow: 1, flexBasis: "45%", minHeight: 46, borderWidth: 1, borderColor: "#e5ded2", backgroundColor: "#fffdf8", borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  toolActive: { borderColor: "#b39c7c", backgroundColor: "#f3ede3" },
  toolLabel: { color: "#6f675b", fontSize: 11, fontWeight: "600" },
  activeText: { color: "#5d4930" },
  toolRow: { flexDirection: "row", gap: 7, marginTop: 8 },
  toolChip: { flex: 1, minHeight: 35, borderRadius: 8, backgroundColor: "#f2eee7", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  smallLabel: { color: "#5b5348", fontSize: 10, fontWeight: "600" },
  disabled: { opacity: 0.4 },
  labelLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 13 },
  number: { color: "#66563f", fontSize: 10, fontWeight: "700" },
  weights: { flexDirection: "row", gap: 7, marginTop: 6 },
  weightButton: { flex: 1, height: 34, backgroundColor: "#f5f1ea", borderWidth: 1, borderColor: "transparent", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  weightActive: { borderColor: "#b59c78", backgroundColor: "#eee5d7" },
  rule: { height: 1, backgroundColor: "#e9e3d9", marginVertical: 16 },
  hint: { color: "#847b6e", fontSize: 10, lineHeight: 15 },
  group: { marginTop: 14 },
  groupTitle: { color: "#5d5347", fontSize: 11, fontWeight: "700", marginBottom: 7 },
  symbolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  symbolButton: { width: "23%", minWidth: 58, flexGrow: 1, height: 54, borderWidth: 1, borderColor: "#e8e1d7", borderRadius: 8, backgroundColor: "#fffdf9", alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  symbolActive: { borderColor: "#a58a64", backgroundColor: "#f2ebe0" },
  symbol: { color: "#292621", fontSize: 19, fontFamily: "serif" },
  symbolLabel: { color: "#8a8174", fontSize: 7, marginTop: 1, textTransform: "capitalize" },
  pendingCard: { flexDirection: "row", alignItems: "center", padding: 8, borderWidth: 1, borderColor: "#ddcfb9", borderRadius: 10, marginTop: 9, backgroundColor: "#f6f0e7", gap: 6 },
  previewBox: { width: 43, height: 43, alignItems: "center", justifyContent: "center" },
  iconButton: { padding: 5 },
  offsetControls: { flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 10 },
  nudgePad: { alignItems: "center", gap: 2 },
  nudgeMiddle: { flexDirection: "row", alignItems: "center", gap: 2 },
  nudge: { width: 31, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: "#f0ece4" },
  nudgeCenter: { width: 26, height: 24, justifyContent: "center", alignItems: "center" },
  offsetValue: { color: "#7b705f", fontSize: 10, fontVariant: ["tabular-nums"] },
  reset: { marginTop: 6, alignSelf: "flex-start", borderBottomWidth: 1, borderBottomColor: "#a6967e" },
  resetText: { color: "#75644c", fontSize: 10 },
  toggleRow: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#e9e3d9" },
  toggle: { width: 34, height: 20, borderRadius: 11, padding: 2, backgroundColor: "#d8d2c9", justifyContent: "center" },
  toggleActive: { backgroundColor: "#8d7655" },
  toggleKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fffdf8" },
  knobActive: { alignSelf: "flex-end" },
  selectionCard: { backgroundColor: "#f3eee6", borderRadius: 10, padding: 10, marginTop: 10 },
  selectedRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  actionRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  actionButton: { flex: 1, height: 31, borderRadius: 7, backgroundColor: "#fffdf8", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e4dacc" },
  deleteButton: { backgroundColor: "#fbf3ef" },
  actionText: { color: "#5d5346", fontSize: 17 },
  placeButton: { marginTop: 10, minHeight: 40, borderRadius: 9, backgroundColor: "#765d3e", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  placeText: { color: "#fffaf2", fontSize: 11, fontWeight: "700" },
  pageControls: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 7 },
  pageArrow: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#f1ede6", alignItems: "center", justifyContent: "center" },
  pageCounter: { flex: 1, textAlign: "center", color: "#5e5549", fontSize: 11, fontWeight: "700" },
  pageAdd: { flex: 1, minHeight: 35, borderRadius: 8, backgroundColor: "#f4f0e8", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  zoomRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 5 },
  zoomButton: { width: 27, height: 27, borderRadius: 7, backgroundColor: "#f1ede6", alignItems: "center", justifyContent: "center" },
});

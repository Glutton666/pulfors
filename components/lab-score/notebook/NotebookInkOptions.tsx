import React, { useEffect } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { NotebookEraserMode } from "@/lib/notebook-erasing";

export const NOTEBOOK_INK_COLORS = ["#111111", "#d13b35", "#2468c4", "#27824c", "#854ab0"];
export const NOTEBOOK_INK_WIDTHS = [1.4, 2.5, 4, 6];
type Props = {
  ko: boolean; popup: "pen" | "erase" | null; onClose: () => void;
  color: string; width: number; onColor: (color: string) => void; onWidth: (width: number) => void;
  eraserMode: NotebookEraserMode; onEraserMode: (mode: NotebookEraserMode) => void;
};
export function NotebookInkOptions(props: Props) {
  const { width, height } = useWindowDimensions();
  const { ko, popup, onClose } = props;
  useEffect(() => {
    if (!popup || Platform.OS !== "web") return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [popup, onClose]);
  return <Modal visible={!!popup} transparent animationType="none" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable testID="notebook-ink-options-backdrop" accessibilityLabel={ko ? "도구 옵션 닫기" : "Close tool options"} style={StyleSheet.absoluteFill} onPress={onClose} />
      <View testID="notebook-ink-options" accessibilityViewIsModal style={[styles.card, { width: Math.min(320, width - 32), maxHeight: Math.max(80, height - 64) }]}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={styles.heading}>
            <Text style={styles.title}>{popup === "pen" ? (ko ? "펜" : "Pen") : (ko ? "지우개" : "Eraser")}</Text>
            <Pressable testID="notebook-ink-options-close" onPress={onClose} style={styles.close}><Text>{ko ? "닫기" : "Done"}</Text></Pressable>
          </View>
          {popup === "pen" ? <>
            <Text style={styles.label}>{ko ? "색" : "Color"}</Text>
            <View style={styles.row}>{NOTEBOOK_INK_COLORS.map((color, i) => <Pressable key={color}
              testID={`notebook-ink-color-${i}`} accessibilityRole="radio" accessibilityState={{ checked: props.color === color }} aria-checked={props.color === color}
              accessibilityLabel={(ko ? ["검정", "빨강", "파랑", "초록", "보라"] : ["Black", "Red", "Blue", "Green", "Purple"])[i]}
              onPress={() => props.onColor(color)} style={[styles.choice, props.color === color && styles.selected]}>
              <View style={{ backgroundColor: color, width: 23, height: 23, borderRadius: 12 }} />
            </Pressable>)}</View>
            <Text style={styles.label}>{ko ? "두께" : "Width"}</Text>
            <View style={styles.row}>{NOTEBOOK_INK_WIDTHS.map((value) => <Pressable key={value}
              testID={`notebook-ink-width-${value}`} accessibilityRole="radio" accessibilityLabel={`${value} px`}
              accessibilityState={{ checked: props.width === value }} aria-checked={props.width === value} onPress={() => props.onWidth(value)}
              style={[styles.choice, props.width === value && styles.selected]}>
              <View style={{ width: 24, height: value, backgroundColor: props.color, borderRadius: 3 }} />
            </Pressable>)}</View>
          </> : <View style={{ gap: 8 }}>{(["object", "partial"] as const).map((value) => <Pressable key={value}
            testID={`notebook-eraser-${value}`} accessibilityRole="radio" accessibilityState={{ checked: props.eraserMode === value }} aria-checked={props.eraserMode === value}
            onPress={() => props.onEraserMode(value)} style={[styles.eraser, props.eraserMode === value && styles.selected]}>
            <Text>{props.eraserMode === value ? "●  " : "○  "}{value === "object" ? (ko ? "객체 전체 지우기" : "Erase whole objects") : (ko ? "닿은 부분만 지우기" : "Erase touched areas")}</Text>
          </Pressable>)}</View>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.18)" },
  card: { backgroundColor: "#fffdf8", borderColor: "#ded6c9", borderWidth: 1, borderRadius: 14, padding: 16 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 16, fontWeight: "700", color: "#59462e" },
  close: { padding: 10 },
  label: { color: "#70675a", marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 },
  choice: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent", borderRadius: 9 },
  selected: { borderColor: "#987b52", backgroundColor: "#eee6d9" },
  eraser: { padding: 14, minHeight: 48, borderWidth: 2, borderColor: "#e8e0d4", borderRadius: 9 },
});

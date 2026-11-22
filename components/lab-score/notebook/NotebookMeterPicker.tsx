import React, { useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { notebookMeterUnits, type NotebookMeter } from "@/lib/notebook-sections";
import { NotebookGlyphPreview } from "./NotebookGlyph";
import { WEB_GESTURE_SURFACE } from "@/lib/web-gesture-style";

const beats = Array.from({ length: 12 }, (_, i) => i + 1);
const stepHeight = 32;

function Wheel({ id, label, values, value, onChange }: {
  id: string; label: string; values: readonly number[]; value: number; onChange: (n: number) => void;
}) {
  const index = values.indexOf(value);
  const start = useRef(index);
  const latest = useRef({ index, values, onChange });
  latest.current = { index, values, onChange };
  const select = (i: number) => latest.current.onChange(latest.current.values[Math.max(0, Math.min(latest.current.values.length - 1, i))]);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { start.current = latest.current.index; },
    onPanResponderMove: (_, g) => select(start.current + Math.round(-g.dy / stepHeight)),
    onPanResponderRelease: (_, g) => select(start.current + Math.round(-g.dy / stepHeight)),
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => select(start.current),
  }), []);
  const web = Platform.OS === "web" ? {
    tabIndex: 0 as const,
    onKeyDown: (event: React.KeyboardEvent) => {
      const target = event.key === "ArrowUp" ? index + 1 : event.key === "ArrowDown" ? index - 1
        : event.key === "Home" ? 0 : event.key === "End" ? values.length - 1 : undefined;
      if (target !== undefined) { event.preventDefault(); event.stopPropagation(); select(target); }
    },
  } : {};
  return <View style={styles.column}>
    <Text style={styles.label}>{label}</Text>
    <View accessible testID={id} accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min: values[0], max: values.at(-1), now: value, text: String(value) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(event) => {
        select(index + (event.nativeEvent.actionName === "increment" ? 1 : -1));
      }} {...web} {...responder.panHandlers} style={[styles.wheel, WEB_GESTURE_SURFACE]}>
      <Pressable accessible={false} tabIndex={-1} testID={`${id}-previous`} disabled={index <= 0} onPress={() => select(index - 1)} style={styles.step}>
        <Text style={styles.neighbor}>{values[index - 1] ?? " "}</Text>
      </Pressable>
      <View pointerEvents="none" style={styles.current}><Text testID={`${id}-value`} style={styles.currentText}>{value}</Text></View>
      <Pressable accessible={false} tabIndex={-1} testID={`${id}-next`} disabled={index >= values.length - 1} onPress={() => select(index + 1)} style={styles.step}>
        <Text style={styles.neighbor}>{values[index + 1] ?? " "}</Text>
      </Pressable>
    </View>
  </View>;
}

export function NotebookMeterPicker({ ko, initial, onCommit, onClose }: {
  ko: boolean; initial: NotebookMeter; onCommit: (glyph: string) => void; onClose: () => void;
}) {
  const [numerator, setNumerator] = useState(initial.beats);
  const [denominator, setDenominator] = useState<number>(initial.unit);
  const glyph = `time-${numerator}-${denominator}`;
  return <Modal transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={ko ? "박자표 선택 닫기" : "Close meter picker"} />
      <View accessibilityViewIsModal testID="notebook-meter-picker" style={styles.card}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.top}><Text style={styles.title}>{ko ? "박자표 넣기" : "Insert time signature"}</Text>
            <Pressable testID="notebook-meter-picker-close" accessibilityRole="button" accessibilityLabel={ko ? "취소" : "Cancel"} hitSlop={8} onPress={onClose}>
              <Ionicons name="close" size={21} color="#695538" />
            </Pressable>
          </View>
          <View style={styles.controls}>
            <Wheel id="notebook-meter-numerator" label={ko ? "분자" : "Numerator"} values={beats} value={numerator} onChange={setNumerator} />
            <Wheel id="notebook-meter-denominator" label={ko ? "분모" : "Denominator"} values={notebookMeterUnits} value={denominator} onChange={setDenominator} />
            <View style={styles.preview} accessibilityLabel={`${numerator}/${denominator}`} testID="notebook-meter-preview">
              <Text style={styles.label}>{ko ? "미리보기" : "Preview"}</Text>
              <NotebookGlyphPreview glyph={glyph} size={32} />
            </View>
          </View>
          <Text style={styles.hint}>{ko ? "숫자를 위아래로 밀어 고릅니다. 클릭 소리의 박자는 바뀌지 않습니다." : "Swipe the numbers up or down. This does not change the click meter."}</Text>
          <Pressable testID="notebook-meter-picker-apply" accessibilityRole="button" onPress={() => onCommit(glyph)} style={styles.apply}>
            <Text style={styles.applyLabel}>{ko ? `${numerator}/${denominator} 넣기` : `Insert ${numerator}/${denominator}`}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#20170e55", padding: 14 },
  card: { width: "100%", maxWidth: 362, maxHeight: "96%", backgroundColor: "#fffdf8", borderRadius: 16 },
  content: { padding: 15, gap: 10 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#433422", fontSize: 16, fontWeight: "800" },
  controls: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
  column: { flex: 1, gap: 4 },
  label: { textAlign: "center", fontSize: 11, fontWeight: "700", color: "#695538" },
  wheel: { backgroundColor: "#f3ece1", borderColor: "#e1d5c5", borderWidth: 1, borderRadius: 10, alignItems: "stretch" },
  step: { height: stepHeight, alignItems: "center", justifyContent: "center" },
  neighbor: { fontSize: 16, color: "#786850", fontVariant: ["tabular-nums"] },
  current: { height: stepHeight, alignItems: "center", justifyContent: "center", backgroundColor: "#e9dcc8" },
  currentText: { fontSize: 22, color: "#463622", fontWeight: "800", fontVariant: ["tabular-nums"] },
  preview: { flex: 1, minHeight: 112, alignItems: "center", justifyContent: "space-between" },
  hint: { color: "#6f604d", fontSize: 11 },
  apply: { borderRadius: 9, backgroundColor: "#795f40", minHeight: 42, alignItems: "center", justifyContent: "center" },
  applyLabel: { color: "#fffdf8", fontSize: 13, fontWeight: "800" },
});

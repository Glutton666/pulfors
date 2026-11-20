import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, PanResponder, Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { layoutNotePicker, moveNotePickerDrag, startNotePickerDrag, type NotationPickerKind, type NotePickerChoice, type NotePickerDrag, type NotePickerLayout } from "@/lib/notebook-note-picker";
import { NotebookGlyph } from "./NotebookGlyph";

type Options = {
  kind: NotationPickerKind;
  ko: boolean;
  dockRef: React.RefObject<View | null>;
  width: number; top: number; bottom: number;
  resetKey: string;
  onBegin: () => void;
  onChoose: (choice: NotePickerChoice) => void;
};
const initial: NotePickerChoice = { glyph: "quarter", role: "normal", dotted: false };
type Session = { drag: NotePickerDrag; layout?: NotePickerLayout; dock?: { x: number; y: number } };

export function useNotebookNotationPicker(options: Options) {
  const latest = useRef(options); latest.current = options;
  const originRef = useRef<View>(null);
  const session = useRef<Session | null>(null);
  const saved = useRef(initial);
  const [choice, setChoice] = useState(initial);
  const [active, setActive] = useState(false);
  const [display, setDisplay] = useState<Session | null>(null);
  const suppressPointerPress = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressPress = useCallback(() => {
    suppressPointerPress.current = true;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => { suppressPointerPress.current = false; }, 250);
  }, []);
  const cancel = useCallback(() => {
    if (session.current) suppressPress();
    session.current = null;
    setActive(false); setDisplay(null); setChoice(saved.current);
  }, [suppressPress]);
  const setAccessibleChoice = (patch: Partial<NotePickerChoice>) => {
    saved.current = { ...saved.current, ...patch };
    setChoice(saved.current);
  };
  useEffect(() => { cancel(); }, [options.resetKey, cancel]);
  useEffect(() => () => {
    session.current = null;
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);
  useEffect(() => {
    if (!active) return;
    if (Platform.OS !== "web") {
      const back = BackHandler.addEventListener("hardwareBackPress", () => { cancel(); return true; });
      return () => back.remove();
    }
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("blur", cancel); };
  }, [active, cancel]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => true,
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: ({ nativeEvent }) => {
      const current: Session = { drag: startNotePickerDrag(saved.current, { x: nativeEvent.pageX, y: nativeEvent.pageY }) };
      session.current = current;
      suppressPress();
      setActive(true);
      latest.current.onBegin();
      latest.current.dockRef.current?.measureInWindow((x, y) => {
        if (session.current !== current) return;
        current.dock = { x, y };
        originRef.current?.measureInWindow((left, top, width, height) => {
          if (session.current !== current) return;
          const bounds = latest.current;
          current.layout = layoutNotePicker({ x: left + width / 2, y: top + height / 2 }, bounds.width, bounds.top, bounds.bottom, bounds.kind);
          current.drag = moveNotePickerDrag(current.drag, current.layout, current.drag.last);
          setDisplay({ ...current });
        });
      });
    },
    onPanResponderStart: (event) => { if (event.nativeEvent.touches.length > 1) cancel(); },
    onPanResponderMove: (_event, movement) => {
      const current = session.current;
      if (!current) return;
      if (movement.numberActiveTouches > 1) { cancel(); return; }
      const point = { x: movement.moveX, y: movement.moveY };
      if (!current.layout) { current.drag.last = point; return; }
      current.drag = moveNotePickerDrag(current.drag, current.layout, point);
      setDisplay({ ...current });
    },
    onPanResponderRelease: () => {
      const current = session.current;
      if (!current) return;
      if (current.drag.cancelHovered) { cancel(); return; }
      suppressPress();
      saved.current = current.drag.choice;
      cancel();
      latest.current.onChoose(saved.current);
    },
    onPanResponderTerminate: cancel,
    onPanResponderTerminationRequest: () => false,
  }), [cancel, suppressPress]);
  return {
    active, choice, originRef, cancel, panHandlers: responder.panHandlers,
    consumePress: () => {
      const suppressed = suppressPointerPress.current;
      suppressPointerPress.current = false;
      return suppressed;
    },
    setAccessibleChoice,
    overlay: display?.layout && display.dock
      ? <NotationPicker layout={display.layout} dock={display.dock} drag={display.drag} ko={options.ko} /> : null,
  };
}

function NotationPicker({ layout, dock, drag, ko }: { layout: NotePickerLayout; dock: { x: number; y: number }; drag: NotePickerDrag; ko: boolean }) {
  const duration = drag.phase === "duration";
  const isRest = layout.kind === "rest";
  const points = duration ? layout.durations : isRest ? [layout.roles[1]] : layout.roles;
  const selected = layout.durations.find((p) => p.glyph === drag.choice.glyph)!;
  const radius = duration ? layout.radius : layout.roleRadius;
  const pointPath = points.map((p) => ({ x: p.x - dock.x, y: p.y - dock.y }));
  const minX = Math.min(...pointPath.map((p) => p.x)) - 2, minY = Math.min(...pointPath.map((p) => p.y)) - 2;
  const width = Math.max(...pointPath.map((p) => p.x)) - minX + 2, height = Math.max(...pointPath.map((p) => p.y)) - minY + 2;
  const line = `M${pointPath[0].x} ${pointPath[0].y} L${pointPath.at(-1)!.x} ${pointPath.at(-1)!.y}`;
  const branch = (dotted: boolean) => ({
    x: selected.x + (dotted ? -1 : 1) * layout.branchSpace, y: selected.y,
    glyph: selected.glyph, role: drag.choice.role, dotted,
    id: dotted ? "dotted" : "plain", selected: drag.focus === "variant" && dotted === drag.choice.dotted,
  });
  const items = duration ? [
    ...layout.durations.map((p) => ({ ...p, id: `duration-${p.glyph}`, role: drag.choice.role,
      dotted: p.glyph === selected.glyph && drag.choice.dotted, selected: p.glyph === selected.glyph && drag.focus === "glyph" })),
    branch(true), branch(false),
  ] : (isRest ? [layout.roles[1]] : layout.roles).map((p) => ({
    ...p, id: isRest ? "gesture-preview" : `role-${p.role}`, glyph: drag.choice.glyph, dotted: drag.choice.dotted, selected: p.role === drag.choice.role,
  }));
  return <View testID={`notebook-${layout.kind}-gesture-picker`} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.layer}>
    {points.length > 1 && <Svg width={width} height={height} viewBox={`${minX} ${minY} ${width} ${height}`} style={{ position: "absolute", left: minX, top: minY }}>
      <Path d={line} fill="none" stroke="#baa385" strokeOpacity={.55} strokeWidth={1.25} strokeLinecap="round" />
    </Svg>}
    {items.map((item) => <View key={item.id} testID={`notebook-${layout.kind}-${item.id}`} dataSet={{ selected: String(item.selected), dotted: String(item.dotted) }}
      style={[styles.glyph, { left: item.x - dock.x - radius, top: item.y - dock.y - radius, width: radius * 2, height: radius * 2, borderRadius: radius },
        item.selected && styles.selected]}>
      <Svg width={radius * 1.9} height={radius * 1.9} viewBox="0 0 54 60">
        <NotebookGlyph glyph={isRest ? `rest-${item.glyph}` : item.glyph} role={item.role} dotted={item.dotted}
          x={isRest ? 25 : 24}
          y={isRest ? 30 : item.glyph === "whole" && item.role !== "strong" ? 37 : item.role === "strong" ? 52 : 46}
          size={isRest ? 28 : 26} onStaff={false} />
      </Svg>
    </View>)}
    {drag.visitedDurations && <View testID={`notebook-${layout.kind}-cancel-zone`}
      style={[styles.cancel, { left: layout.cancel.x - dock.x - layout.cancel.width / 2, top: layout.cancel.y - dock.y, width: layout.cancel.width, height: layout.cancel.height },
        drag.cancelHovered && styles.cancelActive]}>
      <Text style={styles.cancelText}>{ko ? "여기서 놓아 취소" : "Release to cancel"}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: "visible", zIndex: 80, elevation: 22 },
  glyph: { position: "absolute", alignItems: "center", justifyContent: "center", backgroundColor: "#fffdf7" },
  selected: { backgroundColor: "#f1e4c9", borderWidth: 1, borderColor: "#d2b994" },
  cancel: { position: "absolute", backgroundColor: "#f5ece0", borderRadius: 6, alignItems: "center", justifyContent: "center", borderColor: "#cdbb9e", borderWidth: 1 },
  cancelActive: { backgroundColor: "#eed2bd", borderColor: "#ad7456" },
  cancelText: { color: "#634a38", fontSize: 8, fontWeight: "700" },
});

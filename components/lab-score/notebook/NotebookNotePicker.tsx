import React, { useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, PanResponder, Platform, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { layoutNotePicker, moveNotePickerDrag, startNotePickerDrag, type NotationPickerKind, type NotePickerChoice, type NotePickerDrag, type NotePickerLayout } from "@/lib/notebook-note-picker";
import { NotebookGlyph } from "./NotebookGlyph";

type Options = {
  kind: NotationPickerKind;
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
  const suppressPress = () => {
    suppressPointerPress.current = true;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => { suppressPointerPress.current = false; }, 250);
  };
  const cancel = () => {
    if (session.current) suppressPress();
    session.current = null;
    setActive(false); setDisplay(null); setChoice(saved.current);
  };
  const setAccessibleChoice = (patch: Partial<NotePickerChoice>) => {
    saved.current = { ...saved.current, ...patch };
    setChoice(saved.current);
  };
  useEffect(() => { cancel(); }, [options.resetKey]);
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); cancel(); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("blur", cancel); };
  }, [active]);

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
      suppressPress();
      saved.current = current.drag.choice;
      cancel();
      latest.current.onChoose(saved.current);
    },
    onPanResponderTerminate: cancel,
    onPanResponderTerminationRequest: () => false,
  }), []);
  return {
    active, choice, originRef, panHandlers: responder.panHandlers,
    consumePress: () => {
      const suppressed = suppressPointerPress.current;
      suppressPointerPress.current = false;
      return suppressed;
    },
    setAccessibleChoice,
    overlay: display?.layout && display.dock
      ? <NotationPicker layout={display.layout} dock={display.dock} drag={display.drag} /> : null,
  };
}

function NotationPicker({ layout, dock, drag }: { layout: NotePickerLayout; dock: { x: number; y: number }; drag: NotePickerDrag }) {
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
          y={isRest ? (item.glyph === "thirty_second" ? 27 : 30) : item.glyph === "whole" && item.role !== "strong" ? 37 : item.role === "strong" ? 52 : 46}
          size={isRest ? 49 : 26} />
      </Svg>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: "visible", zIndex: 80, elevation: 22 },
  glyph: { position: "absolute", alignItems: "center", justifyContent: "center", backgroundColor: "#fffdf7" },
  selected: { backgroundColor: "#f1e4c9", borderWidth: 1, borderColor: "#d2b994" },
});

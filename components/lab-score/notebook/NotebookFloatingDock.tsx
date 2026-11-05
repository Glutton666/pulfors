import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { clampNotebookDock, initialNotebookDock, type DockPoint, type DockSize } from "@/lib/notebook-floating-dock";

type Props = {
  id: "playback" | "tools";
  ko: boolean;
  bounds: DockSize;
  maxWidth: number;
  edge: "top" | "bottom";
  active: boolean;
  onActivate: () => void;
  children: React.ReactNode;
  onDragStart: () => void;
  onDragEnd: () => void;
};

/** Only the handle owns dragging. The body keeps ordinary button/picker input,
 * and empty space around the dock still belongs to the paper. */
export function NotebookFloatingDock({ id, ko, bounds, maxWidth, edge, active, onActivate, children, onDragStart, onDragEnd }: Props) {
  const width = Math.max(0, Math.min(maxWidth, bounds.width - 16));
  const [height, setHeight] = useState(edge === "top" ? 60 : 128);
  const [manual, setManual] = useState<DockPoint | null>(null);
  const [dragging, setDragging] = useState(false);
  const size = { width, height };
  const position = manual ? clampNotebookDock(manual, bounds, size) : initialNotebookDock(bounds, size, edge);
  const latest = useRef({ bounds, size, position, onDragStart, onDragEnd });
  latest.current = { bounds, size, position, onDragStart, onDragEnd };
  const start = useRef<DockPoint | null>(null);
  useEffect(() => {
    // A mode change can alter dock height and therefore its bottom-anchored
    // position without laying out the child's own local coordinates again.
    if (!start.current) latest.current.onDragEnd();
  }, [width, height]);

  const finish = (cancelled: boolean) => {
    if (!start.current) return;
    if (cancelled) setManual(start.current);
    start.current = null;
    setDragging(false);
    latest.current.onDragEnd();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      start.current = latest.current.position;
      setDragging(true);
      latest.current.onDragStart();
    },
    onPanResponderMove: (_event, gesture) => {
      if (!start.current || gesture.numberActiveTouches > 1) return;
      setManual(clampNotebookDock({ x: start.current.x + gesture.dx, y: start.current.y + gesture.dy },
        latest.current.bounds, latest.current.size));
    },
    onPanResponderRelease: () => finishRef.current(false),
    onPanResponderTerminate: () => finishRef.current(true),
    onPanResponderTerminationRequest: () => true,
  }), []);

  const nudge = (x: number, y: number, reset = false) => {
    onActivate();
    onDragStart();
    setManual(reset ? null : clampNotebookDock({ x: position.x + x, y: position.y + y }, bounds, size));
    onDragEnd();
  };
  const webKeys = Platform.OS === "web" ? {
    tabIndex: 0 as const,
    onKeyDown: (event: any) => {
      const moves: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
      if (event.key === "Home") { event.preventDefault(); nudge(0, 0, true); }
      else if (moves[event.key]) { event.preventDefault(); nudge(...moves[event.key]); }
    },
  } : {};
  const label = id === "playback" ? (ko ? "재생바 이동" : "Move playback controls") : (ko ? "도구줄 이동" : "Move writing tools");
  return <View testID={`notebook-${id}-dock`} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
    onStartShouldSetResponderCapture={() => { onActivate(); return false; }}
    style={[styles.dock, { width, left: position.x, top: position.y, zIndex: dragging ? 29 : active ? 28 : 26,
      opacity: bounds.width ? 1 : 0 }, dragging && styles.dragging]}>
    <View testID={`notebook-${id}-handle`} collapsable={false} {...responder.panHandlers} {...webKeys}
      accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityHint={ko ? "핸들을 끌어 이동합니다. 방향키로 이동, Home으로 원위치." : "Drag this handle, or use arrow keys. Home resets the position."}
      accessibilityActions={[
        { name: "moveLeft", label: ko ? "왼쪽으로 이동" : "Move left" },
        { name: "moveRight", label: ko ? "오른쪽으로 이동" : "Move right" },
        { name: "increment", label: ko ? "아래로 이동" : "Move down" },
        { name: "decrement", label: ko ? "위로 이동" : "Move up" },
        { name: "reset", label: ko ? "기본 위치" : "Reset position" },
      ]}
      onAccessibilityAction={(event) => {
        const name = event.nativeEvent.actionName;
        if (name === "moveLeft") nudge(-16, 0);
        else if (name === "moveRight") nudge(16, 0);
        else if (name === "increment") nudge(0, 16);
        else if (name === "decrement") nudge(0, -16);
        else if (name === "reset") nudge(0, 0, true);
      }}
      style={[styles.handle, Platform.OS === "web" && ({ cursor: dragging ? "grabbing" : "grab", touchAction: "none" } as any)]}>
      <Ionicons name="reorder-three-outline" size={22} color={dragging ? "#70532c" : "#a09077"} />
    </View>
    <View style={styles.body}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({
  dock: { position: "absolute", flexDirection: "row", alignItems: "stretch", borderWidth: 1,
    borderColor: "#ded4c3", borderRadius: 15, backgroundColor: "#fffdf8", overflow: "visible",
    shadowColor: "#54442f", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 12 },
  dragging: { borderColor: "#ad9063", shadowOpacity: 0.22 },
  handle: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center",
    backgroundColor: "#f6f1e8", borderTopLeftRadius: 14, borderBottomLeftRadius: 14,
    borderRightWidth: 1, borderRightColor: "#e9e0d2" },
  body: { flex: 1, minWidth: 0, overflow: "visible" },
});

import React, { useMemo, useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import Svg, { G, Line, Path } from "react-native-svg";
import type { StaffPage, StaffPoint } from "@/lib/staff-notebook";
import { ROW_HEIGHT, STAFF_GAP, STAFF_TOP } from "@/lib/staff-notebook-layout";
import { NotebookGlyph } from "./NotebookGlyph";

type Props = {
  page: StaffPage; width: number; height: number; paperScale: number; zoom: number;
  offset: StaffPoint; tool: "pen" | "erase" | "move" | "select"; lineWidth: number;
  drawing: StaffPoint[]; pendingGlyph: string | null; preview: StaffPoint | null;
  selectedStampId: string | null; onTouch?: (point: StaffPoint, phase: "start" | "move" | "end" | "cancel") => void;
};

export function NotebookPaper({ page, width, height, paperScale, zoom, offset, lineWidth, drawing, pendingGlyph, preview, selectedStampId, onTouch }: Props) {
  const touch = useRef(onTouch); touch.current = onTouch;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => !!touch.current && event.nativeEvent.touches.length < 2,
    onMoveShouldSetPanResponder: (event) => !!touch.current && event.nativeEvent.touches.length < 2,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => touch.current?.({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, "start"),
    onPanResponderMove: (event) => touch.current?.({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, "move"),
    onPanResponderRelease: (event) => touch.current?.({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, "end"),
    onPanResponderTerminate: () => touch.current?.({ x: 0, y: 0 }, "cancel"),
  }), []);
  const transform = `translate(${offset.x} ${offset.y}) scale(${zoom})`;
  const path = (points: StaffPoint[]) => points.map((point, i) => `${i ? "L" : "M"}${point.x},${point.y}`).join(" ") + (points.length === 1 ? " l0.01,0.01" : "");
  const selected = page.stamps?.find((stamp) => stamp.id === selectedStampId);
  return (
    <View
      testID="notebook-drawing"
      style={[styles.paper, { width, height, transform: [{ scale: 1 }] }]}
      {...(onTouch ? responder.panHandlers : {})}
    >
      <Svg pointerEvents="none" width={width} height={height} viewBox={`0 0 ${width / paperScale} ${height / paperScale}`} preserveAspectRatio="none">
        <G transform={transform}>
          {Array.from({ length: page.staffCount ?? 7 }, (_, row) => Array.from({ length: 5 }, (_, line) => (
            <Line key={`${row}-${line}`} x1={38} x2={862} y1={STAFF_TOP + row * ROW_HEIGHT + line * STAFF_GAP} y2={STAFF_TOP + row * ROW_HEIGHT + line * STAFF_GAP} stroke="#141414" strokeWidth={1.1} />
          )))}
          {(page.strokes ?? []).map((stroke) => <Path key={stroke.id} d={path(stroke.points)} fill="none" stroke="#111111" strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
          {drawing.length > 0 && <Path testID="notebook-live-ink" d={path(drawing)} fill="none" stroke="#111111" strokeWidth={lineWidth} strokeLinecap="round" strokeLinejoin="round" />}
          {(page.stamps ?? []).map((stamp) => (
            <G key={stamp.id}>
              {stamp.id === selectedStampId && <Path d={`M ${stamp.x - stamp.size} ${stamp.y - stamp.size} h ${stamp.size * 2} v ${stamp.size * 2} h ${-stamp.size * 2} Z`} fill="none" stroke="#a36f36" strokeWidth={1} strokeDasharray="3 3" />}
              <NotebookGlyph glyph={stamp.glyph} x={stamp.x} y={stamp.y} size={stamp.size} />
            </G>
          ))}
          {pendingGlyph && preview && <G opacity={0.52}><NotebookGlyph glyph={pendingGlyph} x={preview.x} y={preview.y} size={26} /></G>}
          {selected && null}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: "#ffffff", overflow: "hidden" },
});

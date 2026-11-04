import React, { useMemo, useRef } from "react";
import { PanResponder, Platform, StyleSheet, View } from "react-native";
import Svg, { G, Line, Path, Rect } from "react-native-svg";
import type { StaffPage, StaffPoint } from "@/lib/staff-notebook";
import { ROW_HEIGHT, STAFF_GAP, STAFF_TOP } from "@/lib/staff-notebook-layout";
import { NotebookGlyph } from "./NotebookGlyph";
import { NotebookTupletGlyph } from "./NotebookTupletGlyph";
import { NotebookBeamLayer } from "./NotebookBeamLayer";
import { notebookTupletSpans } from "@/lib/notebook-tuplet-layout";
import { notebookBeaming } from "@/lib/notebook-beaming";
import type { NotebookSettings } from "@/lib/staff-notebook";
import type { NotebookBounds, NotebookSelection } from "@/lib/notebook-editing";

type Props = {
  page: StaffPage; width: number; height: number; paperScale: number; zoom: number;
  offset: StaffPoint; tool: "pen" | "erase" | "move" | "select"; lineWidth: number;
  drawing: StaffPoint[]; pendingGlyph: string | null; preview: StaffPoint | null;
  selectedStampId?: string | null; selection?: NotebookSelection; selectionBox?: NotebookBounds | null;
  openTupletIds?: string[]; pendingRole?: "normal" | "ghost" | "strong"; pendingDotted?: boolean;
  settings?: Partial<NotebookSettings>;
  onTouch?: (point: StaffPoint, phase: "start" | "move" | "end" | "cancel") => void;
};

export function NotebookPaper({ page, width, height, paperScale, zoom, offset, lineWidth, drawing, pendingGlyph, preview, selectedStampId, selection, selectionBox, openTupletIds, pendingRole, pendingDotted, settings, onTouch }: Props) {
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
  const displayedPage = page;
  const beaming = useMemo(() => notebookBeaming(displayedPage, settings, openTupletIds), [displayedPage, settings, openTupletIds]);
  const tuplets = notebookTupletSpans(displayedPage, openTupletIds, beaming);
  return (
    <View
      testID="notebook-drawing"
      style={[styles.paper, { width, height, transform: [{ scale: 1 }], ...(Platform.OS === "web" ? { userSelect: "none" as const } : {}) }]}
      {...(onTouch ? responder.panHandlers : {})}
    >
      <Svg pointerEvents="none" width={width} height={height} viewBox={`0 0 ${width / paperScale} ${height / paperScale}`} preserveAspectRatio="none">
        <G transform={transform}>
          {Array.from({ length: page.staffCount ?? 7 }, (_, row) => Array.from({ length: 5 }, (_, line) => (
            <Line key={`${row}-${line}`} x1={38} x2={862} y1={STAFF_TOP + row * ROW_HEIGHT + line * STAFF_GAP} y2={STAFF_TOP + row * ROW_HEIGHT + line * STAFF_GAP} stroke="#141414" strokeWidth={1.1} />
          )))}
          {(page.strokes ?? []).map((stroke) => <G key={stroke.id} testID={`notebook-ink-${stroke.id}`}>
            {selection?.strokeIds.includes(stroke.id) && <Path d={path(stroke.points)} fill="none" stroke="#d69e37" opacity={0.45} strokeWidth={stroke.width + 9} strokeLinecap="round" />}
            <Path d={path(stroke.points)} fill="none" stroke="#111111" strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />
          </G>)}
          {drawing.length > 0 && <Path testID="notebook-live-ink" d={path(drawing)} fill="none" stroke="#111111" strokeWidth={lineWidth} strokeLinecap="round" strokeLinejoin="round" />}
          {(displayedPage.stamps ?? []).map((stamp) => (
            <G key={stamp.id} testID={`notebook-stamp-${stamp.id}`}>
              {(selection?.stampIds.includes(stamp.id) || stamp.id === selectedStampId) && <Rect testID="notebook-selection-highlight" x={stamp.x - stamp.size} y={stamp.y - stamp.size * 1.5} width={stamp.size * 2} height={stamp.size * 2.1} fill="#ebc871" fillOpacity={0.3} stroke="#a36f36" strokeWidth={1} strokeDasharray="3 3" />}
              <NotebookGlyph glyph={stamp.glyph} x={stamp.x} y={stamp.y} size={stamp.size} role={stamp.role} dotted={stamp.dotted} beam={beaming.stems.get(stamp.id)} />
            </G>
          ))}
          <NotebookBeamLayer groups={beaming.groups} />
          {tuplets.map((span) => <NotebookTupletGlyph key={`${span.id}:${span.row}`} {...span} />)}
          {pendingGlyph && preview && <G opacity={0.52}><NotebookGlyph glyph={pendingGlyph} x={preview.x} y={preview.y} size={26} role={pendingRole} dotted={pendingDotted} /></G>}
          {selectionBox && <Rect testID="notebook-selection-box" x={selectionBox.x} y={selectionBox.y} width={selectionBox.width} height={selectionBox.height} fill="#c89c50" fillOpacity={0.12} stroke="#a36f36" strokeDasharray="5 4" strokeWidth={1} />}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: "#ffffff", overflow: "hidden" },
});

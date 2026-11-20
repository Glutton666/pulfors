import React, { useEffect, useMemo, useRef } from "react";
import { PanResponder, Platform, StyleSheet, View } from "react-native";
import Svg, { G, Line, Path, Rect } from "react-native-svg";
import type { StaffPage, StaffPoint , NotebookSettings } from "@/lib/staff-notebook";
import { ROW_HEIGHT, STAFF_GAP, STAFF_TOP } from "@/lib/staff-notebook-layout";
import { NotebookGlyph } from "./NotebookGlyph";
import { NotebookTupletGlyph } from "./NotebookTupletGlyph";
import { NotebookBeamLayer } from "./NotebookBeamLayer";
import { notebookTupletSpans } from "@/lib/notebook-tuplet-layout";
import { notebookBeaming } from "@/lib/notebook-beaming";
import type { NotebookBounds, NotebookSelection } from "@/lib/notebook-editing";
import { paperErasures } from "@/lib/notebook-erasing";
import { createNotebookPaperGesture } from "@/lib/notebook-paper-gesture";
import { NotebookObjectMask } from "./NotebookObjectMask";
import { naturalPaperWidth, notebookMeasureRegions } from "@/lib/notebook-music-layout";
import type { NotebookMeasureRegion } from "@/lib/notebook-measures";
import { flamPosition, type NotebookFlam, type PercussionTarget } from "@/lib/notebook-percussion";
import { NotebookFlamGlyph, NotebookStickingGlyph } from "./NotebookPercussionGlyphs";

type Props = {
  page: StaffPage; width: number; height: number; paperScale: number; zoom: number;
  offset: StaffPoint; tool: "pen" | "erase" | "move" | "select"; lineWidth: number;
  drawing: StaffPoint[]; pendingGlyph: string | null; preview: StaffPoint | null;
  selectedStampId?: string | null; selection?: NotebookSelection; selectionBox?: NotebookBounds | null;
  openTupletIds?: string[]; pendingRole?: "normal" | "ghost" | "strong"; pendingDotted?: boolean;
  settings?: Partial<NotebookSettings>;
  externalTieIds?: ReadonlySet<string>;
  lineColor?: string;
  onPan?: (delta: StaffPoint) => void;
  onZoomBy?: (ratio: number) => void;
  layoutScaleOverride?: number;
  displayRegions?: NotebookMeasureRegion[];
  inheritedClefs?: { glyph: string; x: number; y: number; size: number }[];
  keyboardCursor?: StaffPoint;
  percussionTarget?: PercussionTarget | null;
  flamDraft?: { id: string; flam: NotebookFlam } | null;
  onTouch?: (point: StaffPoint, phase: "start" | "move" | "end" | "cancel") => void;
};

export function NotebookPaper({ page, width, height, paperScale, zoom, offset, tool, lineWidth, lineColor = "#111111", drawing, pendingGlyph, preview, selectedStampId, selection, selectionBox, openTupletIds, pendingRole, pendingDotted, settings, externalTieIds, onTouch, onPan, onZoomBy, layoutScaleOverride, displayRegions, inheritedClefs, keyboardCursor, percussionTarget, flamDraft }: Props) {
  const surface = useRef<View>(null);
  const zoomCallback = useRef({ tool, onZoomBy });
  zoomCallback.current = { tool, onZoomBy };
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = surface.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !zoomCallback.current.onZoomBy) return;
      event.preventDefault();
      zoomCallback.current.onZoomBy(Math.exp(-event.deltaY * 0.003));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);
  const touch = useRef(onTouch); touch.current = onTouch;
  const pan = useRef(onPan); pan.current = onPan;
  const gesture = useMemo(() => createNotebookPaperGesture({
    edit: (point, phase) => touch.current?.(point, phase), pan: (delta) => pan.current?.(delta),
    zoom: (ratio) => { if (zoomCallback.current.tool === "move") zoomCallback.current.onZoomBy?.(ratio); },
  }), []);
  const responder = useMemo(() => {
    const send = (event: any, phase: "start" | "move" | "end" | "cancel") => {
      const native = event.nativeEvent;
      gesture.update(Array.from(native.touches ?? []), { x: native.locationX, y: native.locationY }, phase);
    };
    return PanResponder.create({
    onStartShouldSetPanResponder: () => !!touch.current,
    onMoveShouldSetPanResponder: () => !!touch.current,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => send(event, "start"),
    onPanResponderStart: (event) => { if (event.nativeEvent.touches.length >= 2) send(event, "move"); },
    onPanResponderEnd: (event) => { if (event.nativeEvent.touches.length) send(event, "move"); },
    onPanResponderMove: (event) => send(event, "move"),
    onPanResponderRelease: (event) => send(event, "end"),
    onPanResponderTerminate: (event) => send(event, "cancel"),
  }); }, [gesture]);
  const layoutScale = layoutScaleOverride ?? page.layoutScale ?? 1;
  const transform = `translate(${offset.x} ${offset.y}) scale(${zoom * layoutScale})`;
  const path = (points: StaffPoint[]) => points.map((point, i) => `${i ? "L" : "M"}${point.x},${point.y}`).join(" ") + (points.length === 1 ? " l0.01,0.01" : "");
  const displayedPage = page;
  const beaming = useMemo(() => notebookBeaming(displayedPage, settings, openTupletIds), [displayedPage, settings, openTupletIds]);
  const tuplets = notebookTupletSpans(displayedPage, openTupletIds, beaming);
  const paperWidth = naturalPaperWidth(page);
  const staffCount = page.staffCount ?? 7;
  const byId = useMemo(() => new Map((page.stamps ?? []).map((s) => [s.id, s])), [page.stamps]);
  return (
    <View
      ref={surface}
      testID="notebook-drawing"
      style={[styles.paper, { width, height, transform: [{ scale: 1 }], ...(Platform.OS === "web" ? { userSelect: "none" as const, touchAction: "none" as const } : {}) }]}
      {...(onTouch ? responder.panHandlers : {})}
    >
      <Svg pointerEvents="none" width={width} height={height} viewBox={`0 0 ${width / paperScale} ${height / paperScale}`} preserveAspectRatio="none">
        <G transform={transform}>
          {Array.from({ length: page.staffCount ?? 7 }, (_, row) => Array.from({ length: 5 }, (_, line) => (
            <Line key={`${row}-${line}`} x1={38} x2={naturalPaperWidth(page) - 38} y1={STAFF_TOP + row * ROW_HEIGHT + line * STAFF_GAP} y2={STAFF_TOP + row * ROW_HEIGHT + line * STAFF_GAP} stroke="#141414" strokeWidth={1.1} />
          )))}
           {settings?.showBarlines && (displayRegions ?? notebookMeasureRegions(page, settings)).filter((r) => r.index > 0 &&
            !(page.stamps ?? []).some((s) => /^(barline|bar_line)$/.test(s.glyph) && Math.abs(s.x - r.left) < 1 && Math.floor(s.y / ROW_HEIGHT) === r.row))
            .map((r) => <Line testID="notebook-auto-barline" key={`${r.row}:${r.index}`} x1={r.left} x2={r.left} y1={r.row * ROW_HEIGHT + STAFF_TOP} y2={r.row * ROW_HEIGHT + STAFF_TOP + STAFF_GAP * 4} stroke="#333" strokeWidth={1} />)}
           {inheritedClefs?.map((mark) => <G key={`clef:${mark.y}`} testID="notebook-inherited-clef"><NotebookGlyph {...mark} /></G>)}
          {keyboardCursor && <Rect testID="notebook-writing-cursor" x={keyboardCursor.x - 1} y={keyboardCursor.y - 23}
            width={2} height={46} fill="#9b6e33" />}
          {(page.strokes ?? []).map((stroke) => <G key={stroke.id} testID={`notebook-ink-${stroke.id}`}>
            <NotebookObjectMask cuts={paperErasures(stroke)}>
            {selection?.strokeIds.includes(stroke.id) && <Path d={path(stroke.points)} fill="none" stroke="#d69e37" opacity={0.45} strokeWidth={stroke.width + 9} strokeLinecap="round" />}
            <Path d={path(stroke.points)} fill="none" stroke={stroke.color ?? "#111111"} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />
            </NotebookObjectMask>
          </G>)}
          {drawing.length > 0 && <Path testID="notebook-live-ink" d={path(drawing)} fill="none" stroke={lineColor} strokeWidth={lineWidth} strokeLinecap="round" strokeLinejoin="round" />}
           {(displayedPage.stamps ?? []).filter((stamp) => settings?.showBarlines ||
             !stamp.generated || !/^(barline|bar_line)$/.test(stamp.glyph)).map((stamp) => {
             const editingFlam = flamDraft?.id === stamp.id;
             const flam = editingFlam ? flamDraft.flam : stamp.flam;
             const activePart = percussionTarget?.id === stamp.id ? percussionTarget.part : undefined;
             const below = (x: number) => tuplets.reduce((bottom, span) => span.below && span.row === Math.floor(stamp.y / ROW_HEIGHT)
               && span.left <= x && x <= span.right ? Math.max(bottom, span.y + span.fontSize * .7) : bottom, 0);
             return (
            <G key={stamp.id} testID={`notebook-stamp-${stamp.id}`}>
               {(activePart === "note" || !percussionTarget && (selection?.stampIds.includes(stamp.id) || stamp.id === selectedStampId)) && <Rect testID="notebook-selection-highlight" x={stamp.x - stamp.size} y={stamp.y - stamp.size * 1.5} width={stamp.size * 2} height={stamp.size * 2.1} fill="#ebc871" fillOpacity={0.3} stroke="#a36f36" strokeWidth={1} strokeDasharray="3 3" />}
              <NotebookObjectMask cuts={paperErasures(stamp)}>
                <NotebookGlyph glyph={stamp.glyph} x={stamp.x} y={stamp.y} size={stamp.size} role={stamp.role} dotted={stamp.dotted} beam={beaming.stems.get(stamp.id)} />
              </NotebookObjectMask>
               {flam && <NotebookFlamGlyph stamp={stamp} flam={flam} width={paperWidth} pending={editingFlam} active={activePart === "flam"} />}
               {stamp.sticking && <NotebookStickingGlyph stamp={stamp} value={stamp.sticking} x={stamp.x} count={staffCount} bracketBottom={below(stamp.x)} part="note" />}
               {flam?.sticking && (() => {
                 const { x } = flamPosition(stamp, flam, paperWidth);
                 return <NotebookStickingGlyph stamp={stamp} value={flam.sticking} x={x} count={staffCount} bracketBottom={below(x)} part="flam" />;
               })()}
            </G>
           ); })}
          {beaming.groups.map((group) => <NotebookObjectMask key={group.id} cuts={(page.stamps ?? []).filter((s) => group.memberIds.includes(s.id)).flatMap(paperErasures)}>
            <NotebookBeamLayer groups={[group]} />
          </NotebookObjectMask>)}
           {(page.stamps ?? []).filter((s) => s.tieTo && s.tieTo !== s.id && (byId.has(s.tieTo) || externalTieIds?.has(s.tieTo))).map((s) => {
             const next = byId.get(s.tieTo!);
            const sameRow = next && Math.floor(next.y / ROW_HEIGHT) === Math.floor(s.y / ROW_HEIGHT);
            const end = sameRow ? next.x - 4 : naturalPaperWidth(page) - 38;
            const y = s.y + 12, middle = (s.x + end) / 2;
            return <G key={`tie:${s.id}`}><Path testID="notebook-tie" d={`M${s.x + 4} ${y} Q${middle} ${y + 14} ${end} ${y}`} stroke="#111" strokeWidth={1.5} fill="none" />
              {next && !sameRow && <Path d={`M38 ${next.y + 12} Q${(38 + next.x) / 2} ${next.y + 26} ${next.x - 4} ${next.y + 12}`} stroke="#111" strokeWidth={1.5} fill="none" />}</G>;
          })}
           {(page.stamps ?? []).filter((s) => s.tieFrom && !byId.has(s.tieFrom) && externalTieIds?.has(s.tieFrom)).map((s) =>
            <Path key={`incoming-tie:${s.id}`} testID="notebook-incoming-tie" d={`M38 ${s.y + 12} Q${(38 + s.x) / 2} ${s.y + 26} ${s.x - 4} ${s.y + 12}`} stroke="#111" strokeWidth={1.5} fill="none" />)}
          {tuplets.map((span) => <NotebookObjectMask key={`${span.id}:${span.row}`} cuts={(page.stamps ?? []).filter((s) => page.tuplets?.find((t) => t.id === span.id)?.stampIds.includes(s.id)).flatMap(paperErasures)}>
            <NotebookTupletGlyph {...span} />
          </NotebookObjectMask>)}
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

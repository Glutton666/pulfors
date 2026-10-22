import React, { useMemo, useRef } from "react";
import { PanResponder, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { Meter, NotationEvent, UserSymbol } from "@/lib/rhythm-lab/types";
import { toNumber } from "@/lib/rhythm-lab/engine";

type TargetProps = {
  event: NotationEvent;
  x: number;
  y: number;
  measureWidth: number;
  spanQ: number;
  draggable: boolean;
  onSelect: (event: NotationEvent) => void;
  onPreview: (eventId: string, startQ: number) => void;
  onCommit: (eventId: string, startQ: number) => void;
  onCancel: () => void;
};

function EventTarget(props: TargetProps) {
  const target = useRef(props);
  target.current = props;
  const gesture = useRef({ startedAt: 0, originQ: 0, dragging: false, cancelled: false, previewQ: 0 });
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      const current = target.current;
      gesture.current = { startedAt: Date.now(), originQ: toNumber(current.event.startQ), dragging: false, cancelled: false, previewQ: toNumber(current.event.startQ) };
    },
    onPanResponderMove: (_event, state) => {
      const current = target.current;
      const g = gesture.current;
      const distance = Math.abs(state.dx) + Math.abs(state.dy);
      if (!g.dragging && !g.cancelled && distance > 8 && Date.now() - g.startedAt < 360) g.cancelled = true;
      if (current.draggable && !g.cancelled && Date.now() - g.startedAt >= 360) {
        g.dragging = true;
        g.previewQ = Math.max(0, g.originQ + state.dx / current.measureWidth * current.spanQ);
        current.onPreview(current.event.id, g.previewQ);
      }
    },
    onPanResponderRelease: () => {
      const g = gesture.current;
      if (g.dragging) target.current.onCommit(target.current.event.id, g.previewQ);
      else { target.current.onCancel(); target.current.onSelect(target.current.event); }
      g.dragging = false;
    },
    onPanResponderTerminate: () => { gesture.current.dragging = false; target.current.onCancel(); },
  }), []);
  return <View testID={`rhythm-note-target-${props.event.id}`} {...responder.panHandlers} style={[styles.target, { left: props.x - 18, top: props.y - 18 }]} />;
}

type Props = {
  events: NotationEvent[];
  meter: Meter;
  selected: string[];
  symbols: UserSymbol[];
  onSelect: (event: NotationEvent) => void;
  onMovePreview: (eventId: string, startQ: number) => void;
  onMoveCommit: (eventId: string, startQ: number) => void;
  onMoveCancel: () => void;
  playheadQ: number;
};

export function RhythmStaff({ events, meter, selected, symbols, onSelect, onMovePreview, onMoveCommit, onMoveCancel, playheadQ }: Props) {
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.max(260, viewportWidth - 32);
  const left = 22; const right = width - 22; const usable = right - left;
  const spanQ = meter.numerator * (4 / meter.denominator);
  const measures = Math.max(1, Math.floor(playheadQ / spanQ) + 1, ...events.map((event) => event.measureIndex + 1));
  const measuresPerRow = usable / 2 >= 280 ? 2 : 1;
  const rowCount = Math.ceil(measures / measuresPerRow);
  const height = Math.max(118, rowCount * 118);
  const measureWidth = usable / measuresPerRow;
  const rowFor = (event: NotationEvent) => Math.floor(event.measureIndex / measuresPerRow);
  const yFor = (event: NotationEvent) => 54 + rowFor(event) * 118;
  const xFor = (event: NotationEvent) => left + (event.measureIndex % measuresPerRow + (toNumber(event.startQ) % spanQ) / spanQ) * measureWidth;
  const playheadMeasure = Math.floor(playheadQ / spanQ);
  const playheadRow = Math.floor(playheadMeasure / measuresPerRow);
  const playheadX = left + (playheadMeasure % measuresPerRow + (playheadQ % spanQ) / spanQ) * measureWidth;
  const glyphValue = (event: NotationEvent) => {
    const q = toNumber(event.durationQ);
    const normalizedQ = event.tuplet ? q * event.tuplet.actual / event.tuplet.normal : q;
    return event.tuplet ? Math.max(1, Math.round(4 / normalizedQ)) : event.value;
  };
  const notes = events.filter((event) => event.kind === "note").sort((a, b) => toNumber(a.startQ) - toNumber(b.startQ));
  const beams: { a: NotationEvent; b: NotationEvent; levels: number }[] = [];
  for (let i = 0; i < notes.length - 1; i++) {
    const a = notes[i]; const b = notes[i + 1]; const va = glyphValue(a); const vb = glyphValue(b);
    const adjacent = a.measureIndex === b.measureIndex && Math.abs(toNumber(a.startQ) + toNumber(a.durationQ) - toNumber(b.startQ)) < 0.025;
    if (adjacent && va >= 8 && vb >= 8) beams.push({ a, b, levels: Math.min(Math.max(1, Math.round(Math.log2(va) - 2)), Math.max(1, Math.round(Math.log2(vb) - 2))) });
  }
  const beamed = new Set(beams.flatMap(({ a, b }) => [a.id, b.id]));
  return <View style={[styles.frame, { width, height }]}>
    <Svg width={width} height={height} style={{ backgroundColor: "#FFFFFF" }}>
      {Array.from({ length: rowCount }, (_, row) => <G key={`staff-${row}`}>
        {Array.from({ length: 5 }, (_, i) => <Line key={i} x1={left} x2={right} y1={34 + row * 118 + i * 9} y2={34 + row * 118 + i * 9} stroke="#111111" strokeWidth={1} />)}
        <SvgText x={left + 5} y={24 + row * 118} fontSize="11" fill="#111111">{meter.numerator}/{meter.denominator}</SvgText>
      </G>)}
      {Array.from({ length: measures }, (_, i) => {
        const row = Math.floor(i / measuresPerRow); const slot = i % measuresPerRow;
        const x = left + slot * measureWidth;
        const rowEnd = i === measures - 1 || (i + 1) % measuresPerRow === 0;
        return <G key={`bar-${i}`}><Line x1={x} x2={x} y1={34 + row * 118} y2={70 + row * 118} stroke="#111111" strokeWidth={1} />
          {rowEnd && <Line x1={right} x2={right} y1={34 + row * 118} y2={70 + row * 118} stroke="#111111" strokeWidth={1} />}</G>;
      })}
      {playheadRow < rowCount && <Line x1={playheadX} x2={playheadX} y1={34 + playheadRow * 118} y2={70 + playheadRow * 118} stroke="#C39A2E" strokeWidth={1.5} />}
      {beams.map(({ a, b, levels }, index) => {
        const x1 = xFor(a) + 6; const x2 = xFor(b) + 6; const y = yFor(a) - 37;
        return <G key={`beam-${index}`}>{Array.from({ length: levels }, (_, i) => <Line key={i} x1={x1} y1={y + i * 5} x2={x2} y2={y + i * 5} stroke="#111111" strokeWidth={3} />)}</G>;
      })}
      {events.map((event) => {
        const x = xFor(event); const y = yFor(event); const isSelected = selected.includes(event.id) || event.hitIds.some((id) => selected.includes(id));
        const value = glyphValue(event); const q = toNumber(event.durationQ); const open = value <= 2;
        const flags = value >= 8 ? Math.min(4, Math.max(1, Math.round(Math.log2(value) - 2))) : 0;
        const baseDuration = event.tuplet ? 4 / value * event.tuplet.normal / event.tuplet.actual : 4 / value;
        const dotted = q > baseDuration * 1.4;
        const symbol = event.symbolId ? symbols.find((item) => item.id === event.symbolId) : undefined;
        const supported = symbol && ((symbol.role === "rhythm" && ["flam", "drag", "diddle"].includes(symbol.meaning)) || (symbol.role === "expression" && symbol.meaning === "accent"));
        const symbolCaption = symbol ? supported ? symbol.name : `annotation: ${symbol.name}` : "";
        return <G key={event.id}>
          {isSelected && <Circle cx={x} cy={y} r={13} fill="none" stroke="#C39A2E" strokeWidth={1.7} />}
          {event.kind === "rest" ? value === 1 ? <Rect x={x - 7} y={y + 6} width={14} height={4} fill="#111111" /> :
            value === 2 ? <Rect x={x - 7} y={y - 10} width={14} height={4} fill="#111111" /> :
              <Path d={`M${x - 3},${y - 9} l6,6 -5,4 5,3 -7,5`} stroke="#111111" fill="none" strokeWidth={2} /> : <>
            <Path d={`M${x - 7},${y} a7,4 -20 1,0 14,0 a7,4 -20 1,0 -14,0`} fill={open ? "#FFFFFF" : "#111111"} stroke="#111111" strokeWidth={1.4} />
            {value !== 1 && <Line x1={x + 6} y1={y} x2={x + 6} y2={y - 37} stroke="#111111" strokeWidth={1.5} />}
            {flags > 0 && !beamed.has(event.id) && Array.from({ length: flags }, (_, i) => <Path key={i} d={`M${x + 6},${y - 37 + i * 5} q12,5 5,13`} fill="none" stroke="#111111" strokeWidth={1.5} />)}
            {dotted && <Circle cx={x + 11} cy={y} r={1.8} fill="#111111" />}
            {event.accent && <Path d={`M${x - 5},${y - 19} l11,3 -11,3`} fill="none" stroke="#111111" strokeWidth={1.2} />}
            {event.tuplet && <SvgText x={x} y={y - 47} fill="#111111" fontSize="10" textAnchor="middle">{event.tuplet.actual}</SvgText>}
          </>}
          {symbolCaption ? <SvgText x={x} y={y + 33} fill="#111111" fontSize="8" textAnchor="middle">{symbolCaption}</SvgText> : null}
        </G>;
      })}
    </Svg>
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {events.map((event) => <EventTarget key={`target-${event.id}`} event={event} x={xFor(event)} y={yFor(event)} measureWidth={measureWidth} spanQ={spanQ} draggable={event.kind === "note"} onSelect={onSelect} onPreview={onMovePreview} onCommit={onMoveCommit} onCancel={onMoveCancel} />)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { backgroundColor: "#FFFFFF", borderRadius: 11, marginBottom: 10, overflow: "hidden", position: "relative" },
  target: { position: "absolute", width: 36, height: 36, backgroundColor: "transparent" },
});

import React, { useMemo, useRef, useState } from "react";
import { PanResponder, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
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

type BeamPair = { a: NotationEvent; b: NotationEvent };
type TupletGroup = { events: NotationEvent[]; actual: number };

const BLACK = "#111111";
const GOLD = "#C39A2E";
// Scale the whole engraving together, but keep editing targets in screen pixels.
const NOTATION_SCALE = 0.8;
const EPSILON = 0.025;

function beamLevel(event: NotationEvent) {
  const value = displayValue(event);
  return event.kind === "note" && value >= 8
    ? Math.max(1, Math.min(6, Math.round(Math.log2(value) - 2)))
    : 0;
}

function displayValue(event: NotationEvent) {
  if (event.tuplet) {
    const normalizedQ = toNumber(event.durationQ) * event.tuplet.actual / event.tuplet.normal;
    if (normalizedQ > 0) return Math.max(1, Math.round(4 / normalizedQ));
  }
  return Math.max(1, event.value || 4);
}

function buildBeamPairs(events: NotationEvent[], spanQ: number, meter: Meter): BeamPair[] {
  const compound = meter.denominator === 8 && meter.numerator >= 6 && meter.numerator % 3 === 0;
  const beatQ = compound ? 1.5 : 4 / meter.denominator;
  const ordered = [...events].sort((a, b) => a.measureIndex - b.measureIndex || toNumber(a.startQ) - toNumber(b.startQ));
  const pairs: BeamPair[] = [];
  let group: NotationEvent[] = [];
  const flush = () => {
    if (group.length > 1) {
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i];
        const b = group[i + 1];
        pairs.push({ a, b });
      }
    }
    group = [];
  };
  let previousBeatKey = "";
  let previous: NotationEvent | undefined;
  for (const event of ordered) {
    const localQ = ((toNumber(event.startQ) % spanQ) + spanQ) % spanQ;
    const beatIndex = Math.floor((localQ + EPSILON) / beatQ);
    const beatKey = `${event.measureIndex}:${beatIndex}`;
    const adjacent = previous
      && previous.kind === "note"
      && event.kind === "note"
      && previous.measureIndex === event.measureIndex
      && Math.abs(toNumber(previous.startQ) + toNumber(previous.durationQ) - toNumber(event.startQ)) < EPSILON;
    if (event.kind !== "note" || !beamLevel(event) || beatKey !== previousBeatKey || !adjacent) flush();
    if (event.kind === "note" && beamLevel(event)) {
      if (group.length && beatKey !== previousBeatKey) flush();
      group.push(event);
    } else {
      flush();
    }
    previous = event;
    previousBeatKey = beatKey;
  }
  flush();
  return pairs;
}

function buildTupletGroups(events: NotationEvent[], spanQ: number, meter: Meter) {
  const compound = meter.denominator === 8 && meter.numerator >= 6 && meter.numerator % 3 === 0;
  const beatQ = compound ? 1.5 : 4 / meter.denominator;
  const ordered = events.filter((event) => event.tuplet)
    .sort((a, b) => a.measureIndex - b.measureIndex || toNumber(a.startQ) - toNumber(b.startQ));
  const groups: TupletGroup[] = [];
  let current: NotationEvent[] = [];
  const flush = () => {
    if (current.length) groups.push({ events: current, actual: current[0].tuplet!.actual });
    current = [];
  };
  for (const event of ordered) {
    const previous = current[current.length - 1];
    const sameRatio = previous?.tuplet?.actual === event.tuplet?.actual && previous?.tuplet?.normal === event.tuplet?.normal;
    const adjacent = previous && Math.abs(toNumber(previous.startQ) + toNumber(previous.durationQ) - toNumber(event.startQ)) < EPSILON;
    const localQ = ((toNumber(event.startQ) % spanQ) + spanQ) % spanQ;
    const beatIndex = Math.floor((localQ + EPSILON) / beatQ);
    const previousLocalQ = previous ? ((toNumber(previous.startQ) % spanQ) + spanQ) % spanQ : 0;
    const previousBeatIndex = Math.floor((previousLocalQ + EPSILON) / beatQ);
    const beatChanged = previous && (previous.measureIndex !== event.measureIndex || previousBeatIndex !== beatIndex);
    const groupComplete = previous && current.length >= (previous.tuplet?.actual ?? Infinity);
    if (previous && (!sameRatio || !adjacent || beatChanged || groupComplete)) flush();
    current.push(event);
  }
  flush();
  return groups;
}

function pitchStep(midi: number) {
  const naturalDegree = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return octave * 7 + naturalDegree;
}

function eventPitches(event: NotationEvent) {
  const pitches = Array.isArray(event.midi) ? event.midi.filter(Number.isFinite) : [];
  return [...new Set(pitches)].sort((a, b) => a - b);
}

export function RhythmStaff({ events, meter, selected, symbols, onSelect, onMovePreview, onMoveCommit, onMoveCancel, playheadQ }: Props) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const left = 28;
  const rightInset = 22;
  const spanQ = meter.numerator * (4 / meter.denominator);
  const measures = Math.max(1, Math.floor(playheadQ / spanQ) + 1, ...events.map((event) => event.measureIndex + 1));
  const measuresPerRow = viewportWidth >= 620 ? 2 : 1;
  const measureWidths = Array.from({ length: measures }, (_, measureIndex) => {
    const measureEvents = events.filter((event) => event.measureIndex === measureIndex);
    const onsets = [...new Set(measureEvents.map((event) => toNumber(event.startQ)))].sort((a, b) => a - b);
    const gaps = onsets.slice(1).map((value, index) => value - onsets[index]).filter((gap) => gap > 0.001);
    const minimumGap = gaps.length ? Math.min(...gaps) : spanQ;
    return Math.max(260, spanQ * 58, (spanQ / minimumGap) * 23);
  });
  const measureStarts: number[] = [];
  const rowCount = Math.ceil(measures / measuresPerRow);
  const rowEnds = Array.from({ length: rowCount }, (_, row) => {
    const rowStart = row * measuresPerRow;
    const rowEnd = Math.min(measures, rowStart + measuresPerRow);
    return left + measureWidths.slice(rowStart, rowEnd).reduce((sum, value) => sum + value, 0);
  });
  for (let i = 0; i < measures; i++) {
    const rowStart = Math.floor(i / measuresPerRow) * measuresPerRow;
    const precedingWidths = measureWidths.slice(rowStart, i).reduce((sum, value) => sum + value, 0);
    measureStarts.push(left + precedingWidths);
  }
  const contentWidth = Math.max(viewportWidth / NOTATION_SCALE, ...rowEnds.map((end) => end + rightInset));
  const width = Math.max(260, contentWidth);
  const rowHeight = 118;
  const height = Math.max(rowHeight, rowCount * rowHeight);
  const renderedWidth = width * NOTATION_SCALE;
  const renderedHeight = height * NOTATION_SCALE;
  const rowFor = (event: NotationEvent) => Math.floor(event.measureIndex / measuresPerRow);
  const yFor = (event: NotationEvent) => 54 + rowFor(event) * rowHeight;
  const edgePadding = 18;
  const xFor = (event: NotationEvent) => {
    const measureStart = measureStarts[event.measureIndex] ?? (left + event.measureIndex * 260);
    const localQ = ((toNumber(event.startQ) % spanQ) + spanQ) % spanQ;
    const timeWidth = Math.max(1, (measureWidths[event.measureIndex] ?? 260) - edgePadding * 2);
    return measureStart + edgePadding + (localQ / spanQ) * timeWidth;
  };
  const measureWidthAt = (measureIndex: number) => Math.max(1, (measureWidths[measureIndex] ?? 260) - edgePadding * 2);
  const measureWidthFor = (event: NotationEvent) => measureWidthAt(event.measureIndex);
  const playheadMeasure = Math.floor(playheadQ / spanQ);
  const playheadLocalQ = ((playheadQ % spanQ) + spanQ) % spanQ;
  const playheadX = (measureStarts[playheadMeasure] ?? left) + edgePadding + playheadLocalQ / spanQ * measureWidthAt(playheadMeasure);
  const beamPairs = buildBeamPairs(events, spanQ, meter);
  const beamed = new Set(beamPairs.flatMap(({ a, b }) => [a.id, b.id]));
  const tupletGroups = buildTupletGroups(events, spanQ, meter);
  const flagsFor = (event: NotationEvent) => beamLevel(event);

  return <View testID="rhythm-staff" onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)} style={styles.frame}>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: renderedWidth }}>
      <View style={{ width: renderedWidth, height: renderedHeight, position: "relative" }}>
        <Svg width={renderedWidth} height={renderedHeight} viewBox={`0 0 ${width} ${height}`} style={{ backgroundColor: "#FFFFFF" }}>
          {Array.from({ length: rowCount }, (_, row) => <G key={`staff-${row}`}>
            {Array.from({ length: 5 }, (_, i) => <Line key={`staff-line-${i}`} x1={left} x2={rowEnds[row]} y1={34 + row * rowHeight + i * 9} y2={34 + row * rowHeight + i * 9} stroke={BLACK} strokeWidth={1} />)}
            <SvgText x={left + 5} y={24 + row * rowHeight} fontSize="11" fill={BLACK}>{meter.numerator}/{meter.denominator}</SvgText>
          </G>)}
          {measureWidths.map((_, i) => {
            const x = measureStarts[i];
            const row = Math.floor(i / measuresPerRow);
            return <G key={`bar-${i}`}>
              <Line x1={x} x2={x} y1={34 + row * rowHeight} y2={70 + row * rowHeight} stroke={BLACK} strokeWidth={1} />
              <Line x1={x + measureWidths[i]} x2={x + measureWidths[i]} y1={34 + row * rowHeight} y2={70 + row * rowHeight} stroke={BLACK} strokeWidth={1} />
            </G>;
          })}
          {playheadMeasure < measures && <Line x1={playheadX} x2={playheadX} y1={34 + Math.floor(playheadMeasure / measuresPerRow) * rowHeight} y2={70 + Math.floor(playheadMeasure / measuresPerRow) * rowHeight} stroke={GOLD} strokeWidth={1.5} />}

          {beamPairs.map(({ a, b }, index) => {
            const firstX = xFor(a) + 6;
            const secondX = xFor(b) + 6;
            const beamY = rowFor(a) * rowHeight + 17;
            return <G key={`beam-${index}`}>
              <Line x1={firstX} y1={beamY} x2={secondX} y2={beamY} stroke={BLACK} strokeWidth={3} />
              {Array.from({ length: Math.max(flagsFor(a), flagsFor(b)) - 1 }, (_, levelIndex) => {
                const level = levelIndex + 2;
                const aHas = flagsFor(a) >= level;
                const bHas = flagsFor(b) >= level;
                if (aHas && bHas) return <Line key={level} x1={firstX} y1={beamY + (level - 1) * 5} x2={secondX} y2={beamY + (level - 1) * 5} stroke={BLACK} strokeWidth={3} />;
                if (aHas) return <Line key={level} x1={firstX} y1={beamY + (level - 1) * 5} x2={firstX + 11} y2={beamY + (level - 1) * 5} stroke={BLACK} strokeWidth={3} />;
                if (bHas) return <Line key={level} x1={secondX - 11} y1={beamY + (level - 1) * 5} x2={secondX} y2={beamY + (level - 1) * 5} stroke={BLACK} strokeWidth={3} />;
                return null;
              })}
            </G>;
          })}

          {tupletGroups.map((group, index) => {
            const first = group.events[0];
            const last = group.events[group.events.length - 1];
            const x1 = xFor(first) - 8;
            const x2 = xFor(last) + 13;
            const y = yFor(first) - 52;
            const middle = (x1 + x2) / 2;
            return <G key={`tuplet-${first.id}-${index}`} testID={`rhythm-tuplet-bracket-${first.id}`}>
              <Line x1={x1} y1={y + 5} x2={middle - 7} y2={y + 5} stroke={BLACK} strokeWidth={1} />
              <Line x1={middle + 7} y1={y + 5} x2={x2} y2={y + 5} stroke={BLACK} strokeWidth={1} />
              <Line x1={x1} y1={y + 5} x2={x1} y2={y + 10} stroke={BLACK} strokeWidth={1} />
              <Line x1={x2} y1={y + 5} x2={x2} y2={y + 10} stroke={BLACK} strokeWidth={1} />
              <SvgText x={middle} y={y + 8} fill={BLACK} fontSize="10" textAnchor="middle">{group.actual}</SvgText>
            </G>;
          })}

          {events.map((event) => {
            const x = xFor(event);
            const y = yFor(event);
            const isSelected = selected.includes(event.id) || event.hitIds.some((id) => selected.includes(id));
            const value = displayValue(event);
            const q = toNumber(event.durationQ);
            const baseDuration = event.tuplet ? 4 / value * event.tuplet.normal / event.tuplet.actual : 4 / value;
            const durationRatio = q / baseDuration;
            const dotted = durationRatio > 1.38 && durationRatio < 1.62;
            const open = value <= 2;
            const flags = value >= 8 ? Math.min(5, Math.max(1, Math.round(Math.log2(value) - 2))) : 0;
            const symbol = event.symbolId ? symbols.find((item) => item.id === event.symbolId) : undefined;
            const supported = symbol && ((symbol.role === "rhythm" && ["flam", "drag", "diddle"].includes(symbol.meaning)) || (symbol.role === "expression" && symbol.meaning === "accent"));
            const symbolCaption = symbol ? supported ? symbol.name : `annotation: ${symbol.name}` : "";
            const pitches = eventPitches(event);
            const pitchY = (midi: number) => y + 25 - (pitchStep(midi) - pitchStep(60)) * 4.5;
            const headYs = pitches.length ? pitches.map(pitchY) : [y];
            const isBeamed = beamed.has(event.id);
            const stemUp = isBeamed || headYs.reduce((sum, n) => sum + n, 0) / headYs.length >= 52;
            const headX = x + (pitches.length > 1 ? 2 : 0);
            const stemX = stemUp ? x + 6 : headX - 6;
            const stemEndY = isBeamed ? rowFor(event) * rowHeight + 17 : stemUp ? Math.min(...headYs) - 37 : Math.max(...headYs) + 37;
            return <G key={event.id} testID={`rhythm-glyph-${event.kind}-${event.id}`}>
              {isSelected && <Circle cx={x} cy={y} r={14} fill="none" stroke={GOLD} strokeWidth={1.7} />}
              {event.kind === "rest" ? <>
                {value === 1
                  ? <Rect testID={`rhythm-rest-glyph-${value}-${event.id}`} x={x - 7} y={y - 10} width={14} height={4} fill={BLACK} />
                  : value === 2
                    ? <Rect testID={`rhythm-rest-glyph-${value}-${event.id}`} x={x - 7} y={y - 2} width={14} height={4} fill={BLACK} />
                    : value === 4
                      ? <Path testID={`rhythm-rest-glyph-${value}-${event.id}`} d={`M${x - 4},${y - 17} l6,7 -5,5 6,4 -7,7 5,6`} stroke={BLACK} fill="none" strokeWidth={2.2} />
                      : <Path testID={`rhythm-rest-glyph-${value}-${event.id}`} d={`M${x + 1},${y - 12} C${x + 12},${y - 8} ${x - 2},${y - 3} ${x + 3},${y + 1} C${x + 9},${y + 6} ${x - 1},${y + 8} ${x - 3},${y + 11}${Array.from({ length: flags }, (_, i) => ` M${x + 2},${y - 10 + i * 4} C${x + 12},${y - 7 + i * 4} ${x + 7},${y - 3 + i * 4} ${x + 2},${y - 2 + i * 4}`).join("")}`} fill="none" stroke={BLACK} strokeWidth={1.8} />}
                {dotted && <Circle testID={`rhythm-dotted-dot-${event.id}`} cx={x + 11} cy={y + (value === 1 ? 0 : 3)} r={1.8} fill={BLACK} />}
              </> : <>
                {pitches.map((midi, pitchIndex) => {
                  const noteY = pitchY(midi);
                  const neighbor = pitches[pitchIndex - 1];
                  const adjacentStep = neighbor !== undefined && Math.abs(pitchStep(midi) - pitchStep(neighbor)) <= 1;
                  const noteX = headX + (adjacentStep ? (pitchIndex % 2 === 0 ? -3 : 3) : 0);
                  const ledgerLines = noteY < 34
                    ? Array.from({ length: Math.floor((34 - noteY + 4.5) / 9) }, (_, i) => 34 - (i + 1) * 9)
                    : noteY > 70
                      ? Array.from({ length: Math.floor((noteY - 70 + 4.5) / 9) }, (_, i) => 70 + (i + 1) * 9)
                      : [];
                  return <G key={`pitch-${midi}-${pitchIndex}`}>
                    {ledgerLines.map((ledgerY, i) => <Line key={i} x1={noteX - 10} x2={noteX + 10} y1={ledgerY} y2={ledgerY} stroke={BLACK} strokeWidth={1} />)}
                    <Ellipse testID={`rhythm-notehead-${event.id}-${pitchIndex}`} cx={noteX} cy={noteY} rx={7} ry={4.5} rotation={-20} originX={noteX} originY={noteY} fill={open ? "#FFFFFF" : BLACK} stroke={BLACK} strokeWidth={1.4} />
                  </G>;
                })}
                {!pitches.length && <Ellipse testID={`rhythm-notehead-${event.id}-0`} cx={headX} cy={y} rx={7} ry={4.5} rotation={-20} originX={headX} originY={y} fill={open ? "#FFFFFF" : BLACK} stroke={BLACK} strokeWidth={1.4} />}
                {value !== 1 && <Line x1={stemX} y1={stemUp ? Math.min(...headYs) : Math.max(...headYs)} x2={stemX} y2={stemEndY} stroke={BLACK} strokeWidth={1.5} />}
                {flags > 0 && !isBeamed && Array.from({ length: flags }, (_, i) => {
                  const flagY = stemEndY + (stemUp ? i * 5 : -i * 5);
                  return <Path key={i} d={stemUp ? `M${stemX},${flagY} q12,5 5,13` : `M${stemX},${flagY} q-12,-5 -5,-13`} fill="none" stroke={BLACK} strokeWidth={1.5} />;
                })}
                {dotted && <Circle testID={`rhythm-dotted-dot-${event.id}`} cx={headX + 11} cy={y} r={1.8} fill={BLACK} />}
                {event.accent && <Path d={`M${x - 5},${y - 20} l11,3 -11,3`} fill="none" stroke={BLACK} strokeWidth={1.2} />}
                {(event.graceHitIds ?? []).map((hitId, i) => {
                  const graceX = x - 14 - i * 9;
                  const graceY = y + 10;
                  return <G key={`grace-${hitId}`} testID={`rhythm-grace-hit-${hitId}`}>
                    <Ellipse cx={graceX} cy={graceY} rx={4.5} ry={3} rotation={-20} originX={graceX} originY={graceY} fill={BLACK} stroke={BLACK} strokeWidth={1} />
                    <Line x1={graceX + 4} y1={graceY} x2={graceX + 4} y2={graceY - 19} stroke={BLACK} strokeWidth={1.2} />
                    <Path d={`M${graceX + 1},${graceY - 15} l8,-6`} stroke={BLACK} strokeWidth={1.2} />
                  </G>;
                })}
              </>}
              {symbolCaption ? <SvgText x={x} y={y + 34} fill={BLACK} fontSize="8" textAnchor="middle">{symbolCaption}</SvgText> : null}
            </G>;
          })}
        </Svg>
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {events.map((event) => <EventTarget key={`target-${event.id}`} event={event} x={xFor(event) * NOTATION_SCALE} y={yFor(event) * NOTATION_SCALE} measureWidth={measureWidthFor(event) * NOTATION_SCALE} spanQ={spanQ} draggable={event.kind === "note"} onSelect={onSelect} onPreview={onMovePreview} onCommit={onMoveCommit} onCancel={onMoveCancel} />)}
        </View>
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  frame: { backgroundColor: "#FFFFFF", borderRadius: 11, marginBottom: 10, overflow: "hidden", position: "relative", width: "100%" },
  target: { position: "absolute", width: 36, height: 36, backgroundColor: "transparent" },
});

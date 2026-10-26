import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { Meter, NotationEvent, UserSymbol } from "@/lib/rhythm-lab/types";
import { toNumber } from "@/lib/rhythm-lab/engine";
import { notationSpelling } from "@/lib/rhythm-lab/notation";
import { indexStaffEvents, layoutStaffMeasures, staffWindow, NOTATION_SCALE, STAFF_LEFT } from "./rhythm-staff-layout";

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
  singleLine?: boolean;
  followPlayhead?: boolean;
};

type BeamPair = { a: NotationEvent; b: NotationEvent };
type TupletGroup = {
  id: string;
  events: NotationEvent[];
  fullEvents: NotationEvent[];
  actual: number;
  normal: number;
  layers: { actual: number; normal: number }[];
};

const BLACK = "#111111";
const GOLD = "#C39A2E";
// Scale the whole engraving together, but keep editing targets in screen pixels.
const EPSILON = 0.025;

function beamLevel(event: NotationEvent) {
  const value = displayValue(event);
  return event.kind === "note" && value >= 8
    ? Math.max(1, Math.min(6, Math.round(Math.log2(value) - 2)))
    : 0;
}

function displayValue(event: NotationEvent) {
  return notationSpelling(event).value;
}

function tupletFamily(event: NotationEvent) {
  if (!event.tuplet) return "ordinary";
  return event.tuplet.groupId ?? `${event.tuplet.actual}:${event.tuplet.normal}`;
}

function buildBeamPairs(events: NotationEvent[], spanQ: number, meter: Meter): BeamPair[] {
  const compound = meter.denominator === 8 && meter.numerator >= 6 && meter.numerator % 3 === 0;
  const beatQ = compound ? 1.5 : 4 / meter.denominator;
  const pairs: BeamPair[] = [];
  const voices = new Map<string, NotationEvent[]>();
  events.forEach((event) => {
    if (event.kind !== "note" || !beamLevel(event)) return;
    const voice = event.voiceId ?? `legacy-${event.midi?.join(",") ?? "unpitched"}`;
    const bucket = voices.get(voice) ?? [];
    bucket.push(event);
    voices.set(voice, bucket);
  });
  for (const voiceEvents of voices.values()) {
    const ordered = [...voiceEvents].sort((a, b) => a.measureIndex - b.measureIndex || toNumber(a.startQ) - toNumber(b.startQ));
    let group: NotationEvent[] = [];
    const flush = () => {
      if (group.length > 1) {
        for (let i = 0; i < group.length - 1; i++) {
          pairs.push({ a: group[i], b: group[i + 1] });
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
        && previous.measureIndex === event.measureIndex
        && Math.abs(toNumber(previous.startQ) + toNumber(previous.durationQ) - toNumber(event.startQ)) < EPSILON
        && tupletFamily(previous) === tupletFamily(event);
      if (beatKey !== previousBeatKey || !adjacent) flush();
      if (group.length && tupletFamily(group[0]) !== tupletFamily(event)) flush();
      group.push(event);
      previous = event;
      previousBeatKey = beatKey;
    }
    flush();
  }
  return pairs;
}

function buildTupletGroups(events: NotationEvent[], spanQ: number, meter: Meter, measuresPerRow: number) {
  const explicit = new Map<string, NotationEvent[]>();
  const legacy = events.filter((event) => event.tuplet && !event.tuplet.groupId)
    .sort((a, b) => a.measureIndex - b.measureIndex || toNumber(a.startQ) - toNumber(b.startQ));
  events.filter((event) => event.tuplet?.groupId).forEach((event) => {
    const id = event.tuplet!.groupId!;
    const bucket = explicit.get(id) ?? [];
    bucket.push(event);
    explicit.set(id, bucket);
  });
  const groups: TupletGroup[] = [...explicit.entries()].map(([id, members]) => {
    const ordered = members.sort((a, b) => toNumber(a.startQ) - toNumber(b.startQ));
    const tuplet = ordered[0].tuplet!;
    return { id, events: ordered, fullEvents: ordered, actual: tuplet.actual, normal: tuplet.normal,
      layers: tuplet.layers?.length ? tuplet.layers : [{ actual: tuplet.actual, normal: tuplet.normal }] };
  });
  const compound = meter.denominator === 8 && meter.numerator >= 6 && meter.numerator % 3 === 0;
  const beatQ = compound ? 1.5 : 4 / meter.denominator;
  let current: NotationEvent[] = [];
  const flushLegacy = () => {
    if (!current.length) return;
    const tuplet = current[0].tuplet!;
    const fullEvents = [...current];
    groups.push({ id: `legacy-${fullEvents[0].id}`, events: fullEvents, fullEvents,
      actual: tuplet.actual, normal: tuplet.normal,
      layers: tuplet.layers?.length ? tuplet.layers : [{ actual: tuplet.actual, normal: tuplet.normal }] });
    current = [];
  };
  let previousBeatKey = "";
  for (const event of legacy) {
    const previous = current[current.length - 1];
    const localQ = ((toNumber(event.startQ) % spanQ) + spanQ) % spanQ;
    const beatIndex = Math.floor((localQ + EPSILON) / beatQ);
    const beatKey = `${event.measureIndex}:${beatIndex}`;
    const sameRatio = previous?.tuplet?.actual === event.tuplet?.actual && previous?.tuplet?.normal === event.tuplet?.normal;
    const adjacent = previous && Math.abs(toNumber(previous.startQ) + toNumber(previous.durationQ) - toNumber(event.startQ)) < EPSILON;
    if (previous && (!sameRatio || !adjacent || beatKey !== previousBeatKey || current.length >= (previous.tuplet?.actual ?? Infinity))) flushLegacy();
    current.push(event);
    previousBeatKey = beatKey;
  }
  flushLegacy();
  return groups.flatMap((group) => {
    const segments = new Map<string, NotationEvent[]>();
    group.events.forEach((event) => {
      const key = `${event.measureIndex}:${Math.floor(event.measureIndex / measuresPerRow)}`;
      const bucket = segments.get(key) ?? [];
      bucket.push(event);
      segments.set(key, bucket);
    });
    return [...segments.values()].map((segment) => ({ ...group, events: segment.sort((a, b) => toNumber(a.startQ) - toNumber(b.startQ)) }));
  });
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

export function RhythmStaff({ events, meter, selected, symbols, onSelect, onMovePreview, onMoveCommit, onMoveCancel, playheadQ, singleLine = false, followPlayhead = false }: Props) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const appliedFollowX = useRef<number | null>(null);
  const left = STAFF_LEFT;
  const rightInset = 22;
  const spanQ = meter.numerator * (4 / meter.denominator);
  const index = useMemo(() => indexStaffEvents(events), [events]);
  const measures = Math.max(index.measureCount, Math.floor(playheadQ / spanQ) + 1);
  const measuresPerRow = singleLine ? measures : viewportWidth >= 620 ? 2 : 1;
  const { widths: measureWidths, starts: measureStarts, rowEnds } = useMemo(
    () => layoutStaffMeasures(index.byMeasure, measures, spanQ, measuresPerRow),
    [index, measures, spanQ, measuresPerRow],
  );
  const rowCount = Math.ceil(measures / measuresPerRow);
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
  const followX = Math.max(0, Math.min(renderedWidth - viewportWidth, playheadX * NOTATION_SCALE - viewportWidth * 0.65));
  const pendingFollow = singleLine && followPlayhead && appliedFollowX.current !== followX;
  const effectiveScrollX = Math.max(0, Math.min(renderedWidth - viewportWidth, pendingFollow ? followX : scrollX));
  const range = singleLine ? staffWindow(measureStarts, measureWidths, effectiveScrollX, viewportWidth || 320)
    : { first: 0, last: measures - 1 };
  const visibleMeasures = Array.from({ length: range.last - range.first + 1 }, (_, i) => range.first + i);
  const visibleEvents = visibleMeasures.flatMap((i) => index.byMeasure.get(i) ?? []);
  const windowLeft = singleLine ? Math.max(0, measureStarts[range.first] - left) : 0;
  const windowRight = singleLine ? Math.min(width, measureStarts[range.last] + measureWidths[range.last] + rightInset) : width;
  const windowWidth = windowRight - windowLeft;
  const beamPairs = buildBeamPairs(visibleEvents, spanQ, meter);
  const beamed = new Set(beamPairs.flatMap(({ a, b }) => [a.id, b.id]));
  // Retain full tuplet membership so continuation labels survive window edges.
  // Group segmentation is per measure, independent of the number of columns.
  const tupletsByMeasure = useMemo(() => {
    const buckets = new Map<number, TupletGroup[]>();
    for (const group of buildTupletGroups(events, spanQ, meter, 1)) {
      const i = group.events[0].measureIndex;
      const bucket = buckets.get(i) ?? [];
      bucket.push(group);
      buckets.set(i, bucket);
    }
    return buckets;
  }, [events, spanQ, meter]);
  const tupletGroups = visibleMeasures.flatMap((i) => tupletsByMeasure.get(i) ?? []);
  const selectedTies = new Set<string>();
  for (const [id, chain] of index.ties) {
    if (chain.some((piece) => selected.includes(piece.id))) selectedTies.add(id);
  }
  const tiePairsByMeasure = useMemo(() => {
    const buckets = new Map<number, { tieId: string; piece: NotationEvent; next: NotationEvent; index: number }[]>();
    for (const [tieId, chain] of index.ties) {
      const ordered = [...chain].sort((a, b) => a.tie!.part - b.tie!.part);
      for (let j = 0; j < ordered.length - 1; j++) {
        const piece = ordered[j], next = ordered[j + 1];
        const pair = { tieId, piece, next, index: j };
        for (let m = Math.min(piece.measureIndex, next.measureIndex); m <= Math.max(piece.measureIndex, next.measureIndex); m++) {
          const bucket = buckets.get(m) ?? [];
          bucket.push(pair);
          buckets.set(m, bucket);
        }
      }
    }
    return buckets;
  }, [index]);
  const tiePairs = [...new Set(visibleMeasures.flatMap((i) => tiePairsByMeasure.get(i) ?? []))];
  // Offscreen tie endpoints still affect the visible curve. Resolve their
  // polyphonic head offsets using their complete measures without drawing them.
  const geometryMeasures = new Set(visibleMeasures);
  for (const { piece, next } of tiePairs) {
    geometryMeasures.add(piece.measureIndex);
    geometryMeasures.add(next.measureIndex);
  }
  const geometryEvents = [...geometryMeasures].flatMap((i) => index.byMeasure.get(i) ?? []);
  const glyphXOffsets = new Map<string, number>();
  geometryEvents.filter((event) => event.kind === "note" && event.voiceId).forEach((event) => {
    const pitches = eventPitches(event);
    const start = toNumber(event.startQ);
    const peers = (index.byMeasure.get(event.measureIndex) ?? []).filter((other) => other.kind === "note" && other.voiceId && other.voiceId !== event.voiceId
      && other.measureIndex === event.measureIndex && Math.abs(toNumber(other.startQ) - start) < EPSILON
      && eventPitches(other).some((midi) => pitches.includes(midi)))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!peers.length) return;
    const cluster = [...new Map([event, ...peers].map((item) => [item.id, item])).values()].sort((a, b) => a.id.localeCompare(b.id));
    cluster.forEach((item, index) => glyphXOffsets.set(item.id, (index - (cluster.length - 1) / 2) * 7));
  });
  const glyphXFor = (event: NotationEvent) => xFor(event) + (glyphXOffsets.get(event.id) ?? 0);
  const noteHeadPoint = (event: NotationEvent, midi?: number) => {
    const pitches = eventPitches(event);
    if (midi === undefined || pitches.length === 0) return { x: glyphXFor(event), y: yFor(event) };
    const index = pitches.indexOf(midi);
    const prior = pitches[index - 1];
    const adjacent = prior !== undefined && Math.abs(pitchStep(midi) - pitchStep(prior)) <= 1;
    const headX = glyphXFor(event) + (pitches.length > 1 ? 2 : 0);
    return {
      x: headX + (adjacent ? (index % 2 === 0 ? -3 : 3) : 0),
      y: yFor(event) + 25 - (pitchStep(midi) - pitchStep(60)) * 4.5,
    };
  };
  const targetPoint = (event: NotationEvent) => {
    const pitches = eventPitches(event);
    return event.kind === "note" && pitches.length
      ? noteHeadPoint(event, pitches[Math.floor((pitches.length - 1) / 2)])
      : { x: xFor(event), y: yFor(event) };
  };
  const stemDirections = new Map<string, boolean>();
  visibleEvents.filter((event) => event.kind === "note").forEach((event) => {
    const pitches = eventPitches(event);
    const headYs = pitches.length
      ? pitches.map((midi) => yFor(event) + 25 - (pitchStep(midi) - pitchStep(60)) * 4.5)
      : [yFor(event)];
    stemDirections.set(event.id, headYs.reduce((sum, value) => sum + value, 0) / headYs.length >= 52);
  });
  visibleEvents.filter((event) => event.kind === "note" && event.voiceId).forEach((event) => {
    const start = toNumber(event.startQ);
    const end = start + toNumber(event.durationQ);
    const simultaneous = (index.byMeasure.get(event.measureIndex) ?? []).filter((other) => other.kind === "note" && other.voiceId && other.voiceId !== event.voiceId
      && other.measureIndex === event.measureIndex && toNumber(other.startQ) < end - EPSILON
      && toNumber(other.startQ) + toNumber(other.durationQ) > start + EPSILON)
      .sort((a, b) => toNumber(a.startQ) - toNumber(b.startQ) || a.id.localeCompare(b.id));
    if (!simultaneous.length) return;
    const cluster = [...new Map([event, ...simultaneous].map((item) => [item.id, item])).values()]
      .sort((a, b) => toNumber(a.startQ) - toNumber(b.startQ) || a.id.localeCompare(b.id));
    cluster.forEach((item, index) => stemDirections.set(item.id, index % 2 === 0));
  });
  const flagsFor = (event: NotationEvent) => beamLevel(event);
  useEffect(() => {
    if (followPlayhead && singleLine) {
      appliedFollowX.current = followX;
      setScrollX(followX);
      scrollRef.current?.scrollTo({ x: followX, animated: false });
    } else appliedFollowX.current = null;
  }, [followPlayhead, singleLine, followX]);

  return <View testID="rhythm-staff" onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)} style={styles.frame}>
    <ScrollView ref={scrollRef} testID="rhythm-staff-scroll" horizontal showsHorizontalScrollIndicator
      scrollEventThrottle={16} onScroll={(event) => setScrollX(event.nativeEvent.contentOffset.x)}
      contentContainerStyle={{ minWidth: renderedWidth }}>
      <View style={{ width: renderedWidth, height: renderedHeight, position: "relative" }}>
        <View style={{ position: "absolute", left: windowLeft * NOTATION_SCALE, width: windowWidth * NOTATION_SCALE, height: renderedHeight }}>
        <Svg width={windowWidth * NOTATION_SCALE} height={renderedHeight} viewBox={`${windowLeft} 0 ${windowWidth} ${height}`} style={{ backgroundColor: "#FFFFFF" }}>
          {Array.from({ length: rowCount }, (_, row) => <G key={`staff-${row}`}>
            {Array.from({ length: 5 }, (_, i) => <Line key={`staff-line-${i}`} x1={left} x2={rowEnds[row]} y1={34 + row * rowHeight + i * 9} y2={34 + row * rowHeight + i * 9} stroke={BLACK} strokeWidth={1} />)}
            <SvgText x={left + 5} y={24 + row * rowHeight} fontSize="11" fill={BLACK}>{meter.numerator}/{meter.denominator}</SvgText>
          </G>)}
          {visibleMeasures.map((i) => {
            const x = measureStarts[i];
            const row = Math.floor(i / measuresPerRow);
            return <G key={`bar-${i}`}>
              <Line x1={x} x2={x} y1={34 + row * rowHeight} y2={70 + row * rowHeight} stroke={BLACK} strokeWidth={1} />
              <Line x1={x + measureWidths[i]} x2={x + measureWidths[i]} y1={34 + row * rowHeight} y2={70 + row * rowHeight} stroke={BLACK} strokeWidth={1} />
            </G>;
          })}
          {playheadMeasure < measures && <Line x1={playheadX} x2={playheadX} y1={34 + Math.floor(playheadMeasure / measuresPerRow) * rowHeight} y2={70 + Math.floor(playheadMeasure / measuresPerRow) * rowHeight} stroke={GOLD} strokeWidth={1.5} />}

          {beamPairs.map(({ a, b }, index) => {
            const firstX = glyphXFor(a) + 6;
            const secondX = glyphXFor(b) + 6;
            const beamY = rowFor(a) * rowHeight + (stemDirections.get(a.id) === false ? 88 : 17);
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
            const x1 = glyphXFor(first) - 8;
            const x2 = glyphXFor(last) + 13;
            const y = yFor(first) - 52;
            const middle = (x1 + x2) / 2;
            const all = group.fullEvents;
            const hasEarlier = toNumber(all[0].startQ) < toNumber(first.startQ) - EPSILON;
            const hasLater = toNumber(all[all.length - 1].startQ) > toNumber(last.startQ) + EPSILON;
            const standard = group.layers.length === 1 && group.normal === 2 ** Math.floor(Math.log2(group.actual));
            const ratio = standard && !hasEarlier && !hasLater
              ? String(group.actual)
              : group.layers.map((layer) => `${layer.actual}:${layer.normal}`).join(" × ");
            return <G key={`tuplet-${first.id}-${index}`} testID={`rhythm-tuplet-bracket-${first.id}`}>
              <Line x1={x1} y1={y + 5} x2={middle - 18} y2={y + 5} stroke={BLACK} strokeWidth={1} />
              <Line x1={middle + 18} y1={y + 5} x2={x2} y2={y + 5} stroke={BLACK} strokeWidth={1} />
              {!hasEarlier && <Line x1={x1} y1={y + 5} x2={x1} y2={y + 10} stroke={BLACK} strokeWidth={1} />}
              {!hasLater && <Line x1={x2} y1={y + 5} x2={x2} y2={y + 10} stroke={BLACK} strokeWidth={1} />}
              <SvgText x={middle} y={y + 8} fill={BLACK} fontSize="9" textAnchor="middle">{ratio}{hasEarlier ? " ‹" : ""}{hasLater ? " ›" : ""}</SvgText>
            </G>;
          })}

          {tiePairs.flatMap(({ tieId, piece, next, index }) => {
                const sharedPitches = eventPitches(piece).filter((midi) => eventPitches(next).includes(midi));
                const tiePitches: (number | undefined)[] = sharedPitches.length ? sharedPitches : [undefined];
                return tiePitches.map((midi, pitchIndex) => {
                  const start = noteHeadPoint(piece, midi);
                  const end = noteHeadPoint(next, midi);
                  const x1 = start.x + 7;
                  const x2 = end.x - 7;
                  const y1 = start.y + 6;
                  const y2 = end.y + 6;
                  const key = `tie-${tieId}-${index}-${pitchIndex}`;
                  if (rowFor(piece) === rowFor(next)) {
                    const mid = (x1 + x2) / 2;
                    return <Path key={key} testID={key}
                      d={`M${x1},${y1} Q${mid},${y1 + 10} ${x2},${y2}`} fill="none" stroke={BLACK} strokeWidth={1.3} />;
                  }
                  const edgeOut = rowEnds[rowFor(piece)] - 3;
                  const edgeIn = left + 3;
                  return <G key={key} testID={key}>
                    <Path d={`M${x1},${y1} Q${(x1 + edgeOut) / 2},${y1 + 9} ${edgeOut},${y1 + 3}`} fill="none" stroke={BLACK} strokeWidth={1.3} />
                    <Path d={`M${edgeIn},${y2 + 3} Q${(edgeIn + x2) / 2},${y2 + 9} ${x2},${y2}`} fill="none" stroke={BLACK} strokeWidth={1.3} />
                  </G>;
                });
          })}

          {visibleEvents.map((event) => {
            const x = event.kind === "note" ? glyphXFor(event) : xFor(event);
            const y = yFor(event);
            const isSelected = selected.includes(event.id) || event.hitIds.some((id) => selected.includes(id)) ||
              !!event.tie && selectedTies.has(event.tie.id);
            const value = displayValue(event);
            const dotted = notationSpelling(event).dotted;
            const open = value <= 2;
            const flags = value >= 8 ? Math.min(5, Math.max(1, Math.round(Math.log2(value) - 2))) : 0;
            const symbol = event.symbolId ? symbols.find((item) => item.id === event.symbolId) : undefined;
            const supported = symbol && ((symbol.role === "rhythm" && ["flam", "drag", "diddle"].includes(symbol.meaning)) || (symbol.role === "expression" && symbol.meaning === "accent"));
            const symbolCaption = symbol ? supported ? symbol.name : `annotation: ${symbol.name}` : "";
            const pitches = eventPitches(event);
            const pitchY = (midi: number) => noteHeadPoint(event, midi).y;
            const headYs = pitches.length ? pitches.map(pitchY) : [y];
            const isBeamed = beamed.has(event.id);
            const stemUp = stemDirections.has(event.id)
              ? stemDirections.get(event.id)!
              : isBeamed || headYs.reduce((sum, n) => sum + n, 0) / headYs.length >= 52;
            const headX = x + (pitches.length > 1 ? 2 : 0);
            const stemX = stemUp ? x + 6 : headX - 6;
            const stemEndY = isBeamed ? rowFor(event) * rowHeight + (stemUp ? 17 : 88) : stemUp ? Math.min(...headYs) - 37 : Math.max(...headYs) + 37;
            return <G key={event.id} testID={`rhythm-glyph-${event.kind}-${event.id}`}>
              {isSelected && <Circle cx={x} cy={headYs[0]} r={14} fill="none" stroke={GOLD} strokeWidth={1.7} />}
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
                  const staffTop = 34 + rowFor(event) * rowHeight, staffBottom = staffTop + 36;
                  const ledgerLines = noteY < staffTop
                    ? Array.from({ length: Math.floor((staffTop - noteY + 4.5) / 9) }, (_, i) => staffTop - (i + 1) * 9)
                    : noteY > staffBottom
                      ? Array.from({ length: Math.floor((noteY - staffBottom + 4.5) / 9) }, (_, i) => staffBottom + (i + 1) * 9)
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
                {dotted && <Circle testID={`rhythm-dotted-dot-${event.id}`} cx={headX + 11} cy={headYs[0]} r={1.8} fill={BLACK} />}
                {event.accent && <Path d={`M${x - 5},${Math.min(...headYs) - 20} l11,3 -11,3`} fill="none" stroke={BLACK} strokeWidth={1.2} />}
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
          {visibleEvents.map((event) => {
            const point = targetPoint(event);
            return <EventTarget key={`target-${event.id}`} event={event} x={(point.x - windowLeft) * NOTATION_SCALE} y={point.y * NOTATION_SCALE} measureWidth={measureWidthFor(event) * NOTATION_SCALE} spanQ={spanQ} draggable={event.kind === "note"} onSelect={onSelect} onPreview={onMovePreview} onCommit={onMoveCommit} onCancel={onMoveCancel} />;
          })}
        </View>
        </View>
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  frame: { backgroundColor: "#FFFFFF", borderRadius: 11, marginBottom: 10, overflow: "hidden", position: "relative", width: "100%" },
  target: { position: "absolute", width: 36, height: 36, backgroundColor: "transparent" },
});

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import type { BeatType } from "@/lib/metronome-engine";
import { getBeatStaffCellHeight, getBeatStaffRows, findBeatStaffCellTarget, nextBeatCountForStaffAdd, type BeatStaffCellRects } from "@/lib/beat-staff-logic";
import { SimplifiedStaffNotation } from "@/components/bar-mode/SimplifiedStaffNotation";

interface Props {
  beatsPerMeasure: number;
  beatDenominator: 2 | 4 | 8;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  currentBeat: number;
  activeSubNote: number;
  isPlaying: boolean;
  isPreparing: boolean;
  onTogglePlay: () => void;
  onBeatsChange: (count: number) => void;
  onBeatTypeChange: (index: number, type: BeatType) => void;
  onDeleteBeat: (index: number) => void;
  cellRectsRef: React.MutableRefObject<BeatStaffCellRects>;
  dropTargetBeat: number | null;
  hintText: string;
  settingsText: string;
  playText: string;
  stopText: string;
  addText: string;
  beatTypeLabels: Record<BeatType, string>;
  onOpenSettings?: () => void;
}

export function BeatStaffMode({
  beatsPerMeasure, beatDenominator, beatTypes, beatSubdivisions,
  currentBeat, activeSubNote, isPlaying, isPreparing, onTogglePlay, onBeatsChange, onBeatTypeChange,
  onDeleteBeat, cellRectsRef, dropTargetBeat, hintText, settingsText,
  playText, stopText, addText, beatTypeLabels, onOpenSettings,
}: Props) {
  const { colors: C } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const rows = useMemo(() => getBeatStaffRows(beatsPerMeasure), [beatsPerMeasure]);
  const cellHeight = useMemo(
    () => getBeatStaffCellHeight(windowWidth, windowHeight, rows.length),
    [rows.length, windowHeight, windowWidth],
  );
  const startRef = useRef({ x: 0, y: 0, cell: -1 });
  const cellRefs = useRef<Record<number, View | null>>({});
  const latest = useRef({ isPlaying, beatsPerMeasure, onBeatsChange, onDeleteBeat });
  latest.current = { isPlaying, beatsPerMeasure, onBeatsChange, onDeleteBeat };
  const measureCells = useCallback(() => {
    Object.entries(cellRefs.current).forEach(([key, node]) => {
      node?.measureInWindow?.((x, y, w, h) => {
        cellRectsRef.current[Number(key)] = { x, y, w, h };
      });
    });
  }, [cellRectsRef]);
  useEffect(() => {
    for (const key of Object.keys(cellRectsRef.current)) {
      if (Number(key) >= beatsPerMeasure) delete cellRectsRef.current[Number(key)];
    }
  }, [beatsPerMeasure, cellRectsRef]);
  useEffect(() => {
    cellRectsRef.current = {};
    const timer = setTimeout(measureCells, 0);
    return () => clearTimeout(timer);
  }, [cellRectsRef, measureCells, windowHeight, windowWidth]);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: (e, g) => {
      const x = Number.isFinite(g.x0) ? g.x0 : e.nativeEvent.pageX;
      const y = Number.isFinite(g.y0) ? g.y0 : e.nativeEvent.pageY;
      startRef.current = { x, y, cell: findBeatStaffCellTarget(x, y, cellRectsRef.current) ?? -1 };
    },
    onPanResponderRelease: (e, g) => {
      const current = latest.current;
      if (current.isPlaying) return;
      if (Math.abs(g.dx) <= Math.abs(g.dy)) return;
      if (startRef.current.cell >= 0 && g.dx < -36) {
        current.onDeleteBeat(startRef.current.cell);
      } else if (g.dx > 44) {
        const nextCount = nextBeatCountForStaffAdd(current.beatsPerMeasure);
        if (nextCount !== null) current.onBeatsChange(nextCount);
      }
    },
    onPanResponderTerminate: () => {
      startRef.current = { x: 0, y: 0, cell: -1 };
    },
  })).current;

  return (
    <View {...pan.panHandlers} style={styles.root} testID="beat-staff-area">
      {onOpenSettings && <Pressable onPress={onOpenSettings} style={styles.settings} testID="open-beat-settings"><Text style={{ color: C.textSecondary }}>{settingsText}</Text></Pressable>}
      <View style={styles.meter}><Text style={[styles.meterText, { color: C.textTertiary }]}>{beatsPerMeasure}/{beatDenominator}</Text></View>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((beat) => {
            const notes = beatSubdivisions[String(beat)] ?? [beatTypes[beat] ?? "normal"];
            return (
              <Pressable
                ref={(node) => { cellRefs.current[beat] = node; }}
                key={beat}
                testID={`beat-staff-cell-${beat}`}
                accessibilityRole="button"
                accessibilityLabel={`${beat + 1}/${beatsPerMeasure}, ${beatTypeLabels[beatTypes[beat] ?? "normal"]}`}
                accessibilityHint={hintText}
                accessibilityState={{ selected: currentBeat === beat, disabled: isPlaying }}
                accessibilityActions={[{ name: "decrement", label: "Delete beat" }]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === "decrement" && !isPlaying) onDeleteBeat(beat);
                }}
                style={[styles.cell, { height: cellHeight, borderColor: dropTargetBeat === beat ? C.accent : currentBeat === beat ? C.accent : C.border, backgroundColor: dropTargetBeat === beat ? C.accentDim : currentBeat === beat ? C.accentDim : C.surface }]}
                onPress={() => {
                if (isPlaying) return;
                const current = beatTypes[beat] ?? "normal";
                const next = current === "strong" ? "accent" : current === "accent" ? "normal" : current === "normal" ? "mute" : "strong";
                onBeatTypeChange(beat, next);
              }}
                onLayout={measureCells}
              >
                <SimplifiedStaffNotation beat={beat} notes={notes} activeSubNote={activeSubNote} isCurrentBeat={isPlaying && currentBeat === beat} colors={{ ...C, background: C.background, backgroundSecondary: C.backgroundSecondary }} meterDenominator={beatDenominator} />
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.controls}>
        <Pressable
          testID="beat-staff-play-toggle"
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? stopText : playText}
          disabled={isPreparing}
          onPress={onTogglePlay}
          style={[styles.controlButton, { borderColor: C.accent, opacity: isPreparing ? 0.55 : 1 }]}
        >
          <Text style={[styles.controlText, { color: C.accent }]}>{isPlaying ? stopText : playText}</Text>
        </Pressable>
        <Pressable
          testID="beat-staff-add"
          accessibilityRole="button"
          accessibilityLabel={addText}
          disabled={beatsPerMeasure >= 8 || isPlaying}
          onPress={() => {
            const nextCount = nextBeatCountForStaffAdd(beatsPerMeasure);
            if (nextCount !== null) onBeatsChange(nextCount);
          }}
          style={[styles.addButton, { borderColor: C.border, opacity: beatsPerMeasure >= 8 || isPlaying ? 0.45 : 1 }]}
        >
          <Text style={[styles.controlText, { color: C.textSecondary }]}>＋</Text>
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: C.textTertiary }]}>{hintText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", maxWidth: 860, alignItems: "center", gap: 10, paddingHorizontal: 12 },
  row: { width: "100%", flexDirection: "row", justifyContent: "center", gap: 8 },
  cell: { flex: 1, maxWidth: 210, borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  meter: { position: "absolute", left: 14, top: 0 },
  meterText: { fontSize: 15, fontWeight: "700", letterSpacing: 1 },
  settings: { position: "absolute", right: 8, top: -4, padding: 8, zIndex: 2 },
  controls: { flexDirection: "row", alignItems: "center", gap: 8 },
  controlButton: { minWidth: 92, minHeight: 40, borderWidth: 1, borderRadius: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  addButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  controlText: { fontSize: 14, fontWeight: "700" },
  hint: { fontSize: 11, marginTop: 3 },
});
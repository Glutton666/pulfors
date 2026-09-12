import React, { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { StageBeatColumn } from "@/components/StageBeatColumn";
import { SubdivisionBar } from "@/components/SubdivisionBar";
import { useLanguage } from "@/contexts/LanguageContext";
import type { BeatType } from "@/lib/metronome-engine";

const BEAT_TYPES: BeatType[] = ["strong", "accent", "normal", "mute"];

type Props = {
  currentBeat: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  subdivisionPattern: BeatType[];
  beatSubdivisions?: Record<string, BeatType[]>;
  activeSubNote?: number;
  isPlaying: boolean;
  isPreparing?: boolean;
  isDark: boolean;
  text: string;
  faint: string;
  accent: string;
  onPlayPause: () => void;
  onPlayLongPress?: () => void;
  onBeatsChange: (n: number) => void;
  onBeatTypeChange: (index: number, type: BeatType) => void;
  onBeatSubdivisionChange: (index: number, pattern: BeatType[] | null) => void;
  onApplyPatternToAll: (pattern: BeatType[]) => void;
  onPatternChange: (pattern: BeatType[]) => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragCancel: () => void;
  onReset: () => void;
};

function nextType(type: BeatType) {
  return BEAT_TYPES[(BEAT_TYPES.indexOf(type) + 1) % BEAT_TYPES.length] ?? "normal";
}

export function StageEmptyPerformanceDisplay({
  currentBeat, beatsPerMeasure, beatTypes, subdivisionPattern, beatSubdivisions,
  activeSubNote, isPlaying, isPreparing = false, isDark, text, faint, accent, onPlayPause,
  onBeatsChange, onBeatTypeChange, onPatternChange, onDragStart, onDragMove,
  onDragCancel, onReset, onPlayLongPress, onBeatSubdivisionChange, onApplyPatternToAll,
}: Props) {
  const { t } = useLanguage();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const compact = height < 700 || landscape;
  const beatsRef = useRef(beatsPerMeasure);
  const [pressedCell, setPressedCell] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const beatRects = useRef<Record<number, { x: number; y: number; width: number; height: number }>>({});
  const beatNodes = useRef<Record<number, View | null>>({});
  useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);

  const beatSwipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < 36) return;
      onBeatsChange(Math.max(1, Math.min(16, beatsRef.current + (g.dx > 0 ? 1 : -1))));
    },
  })).current;

  const measureBeat = useCallback((index: number) => {
    beatNodes.current[index]?.measureInWindow((x, y, width, height) => {
      beatRects.current[index] = { x, y, width, height };
    });
  }, []);

  const findDropTarget = useCallback((pageX: number, pageY: number) => {
    for (const [key, rect] of Object.entries(beatRects.current)) {
      const pad = 10;
      if (
        pageX >= rect.x - pad && pageX <= rect.x + rect.width + pad &&
        pageY >= rect.y - pad && pageY <= rect.y + rect.height + pad
      ) return Number(key);
    }
    return null;
  }, []);

  const handleDragMove = useCallback((pageX: number, pageY: number) => {
    onDragMove(pageX, pageY);
    setDropTarget(findDropTarget(pageX, pageY));
  }, [findDropTarget, onDragMove]);

  const handleDragEnd = useCallback((pageX: number, pageY: number) => {
    const target = findDropTarget(pageX, pageY);
    if (target !== null) onBeatSubdivisionChange(target, [...subdivisionPattern]);
    setDropTarget(null);
    onDragCancel();
  }, [findDropTarget, onBeatSubdivisionChange, onDragCancel, subdivisionPattern]);

  const current = currentBeat < 0 ? 0 : currentBeat;
  const next = (current + 1) % Math.max(1, beatsPerMeasure);
  const currentPattern = beatSubdivisions?.[String(current)] ?? subdivisionPattern;
  const nextPattern = beatSubdivisions?.[String(next)] ?? subdivisionPattern;
  const renderPlayButton = () => (
    <Pressable
      onPress={onPlayPause}
      onLongPress={onPlayLongPress}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? t("stageMode", "pause") : t("stageMode", "play")}
      testID="stage-empty-play-pause"
      style={({ pressed }) => [
        styles.playButton,
        compact && styles.playButtonCompact,
        landscape && styles.playButtonLandscape,
        { borderColor: isPlaying ? accent : faint },
        pressed && styles.pressed,
      ]}
    >
      {isPreparing ? (
        <ActivityIndicator size="small" color={accent} />
      ) : (
        <Ionicons name={isPlaying ? "pause" : "play"} size={22} color={isPlaying ? accent : text} />
      )}
      <Text style={[styles.playLabel, { color: isPlaying ? accent : text }]}>
        {isPlaying ? t("stageMode", "pause") : t("stageMode", "play")}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={[styles.root, compact && styles.rootCompact, landscape && styles.rootLandscape]}
      testID="stage-empty-performance-display"
    >
      <View style={[styles.readout, compact && !landscape && styles.readoutCompact, landscape && styles.readoutLandscape]}>
        <StageBeatColumn
          currentBeat={currentBeat}
          beatsPerMeasure={beatsPerMeasure}
          beatTypes={beatTypes}
          subdivisionTypes={currentPattern}
          nextSubdivisionTypes={nextPattern}
          activeSubNote={isPlaying ? activeSubNote : undefined}
          theme={isDark ? "dark" : "light"}
          standbyPreview
          labels={{
            current: t("stageMode", "currentPlaying"),
            next: t("stageMode", "nextPlaying"),
            beat: t("stageMode", "beatUnit"),
            subdivision: t("stageMode", "subdivisionUnit"),
          }}
        />
      </View>

      {!isPlaying && (
        <View
          style={[styles.editor, compact && styles.editorCompact, landscape && styles.editorLandscape]}
          testID="stage-empty-editor"
        >
          {!landscape && (
            <View style={styles.editorHeader}>
              <Text style={[styles.eyebrow, { color: faint }]}>{t("stageMode", "emptyBeatPattern")}</Text>
              <Text style={[styles.hint, { color: faint }]}>{t("stageMode", "emptyBeatHint")}</Text>
            </View>
          )}
          <View {...beatSwipe.panHandlers} style={[styles.beatsRow, landscape && styles.beatsRowLandscape]}>
            {Array.from({ length: beatsPerMeasure }).map((_, index) => {
              const type = beatTypes[index] ?? "normal";
              const active = type === "strong";
              return (
                <Pressable
                  key={index}
                  testID={`stage-empty-beat-${index}`}
                  ref={(node) => { beatNodes.current[index] = node; }}
                  onLayout={() => requestAnimationFrame(() => measureBeat(index))}
                  onPress={() => onBeatTypeChange(index, nextType(type))}
                  onPressIn={() => setPressedCell(index)}
                  onPressOut={() => setPressedCell(null)}
                  accessibilityRole="button"
                  accessibilityLabel={`Beat ${index + 1}, ${type}`}
                  style={[
                    styles.beatCell,
                    landscape && styles.beatCellLandscape,
                    dropTarget === index && { backgroundColor: `${accent}24`, borderColor: accent },
                    pressedCell === index && styles.pressed,
                  ]}
                >
                  <View style={[styles.beatDot, {
                    backgroundColor: type === "mute" ? "transparent" : type === "accent" ? accent : type === "strong" ? accent : faint,
                    borderColor: type === "mute" ? faint : "transparent",
                    borderWidth: type === "mute" ? 1 : 0,
                    transform: [{ scale: active ? 1.18 : 1 }],
                  }]} />
                  <Text style={[styles.beatLabel, { color: index === current ? text : faint }]}>{index + 1}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.subHeader}>
            {!landscape && (
              <Text style={[styles.eyebrow, { color: faint }]}>{t("stageMode", "subdivisionUnit")}</Text>
            )}
            <Pressable
              onPress={() => onApplyPatternToAll(subdivisionPattern)}
              testID="stage-empty-apply-all"
              accessibilityRole="button"
              accessibilityLabel={t("stageMode", "emptyApplyAll")}
              hitSlop={8}
            >
              <Text style={[styles.reset, { color: accent }]}>{t("stageMode", "emptyApplyAll")}</Text>
            </Pressable>
          </View>
          <View style={styles.patternRow}>
            <SubdivisionBar
              pattern={subdivisionPattern}
              onPatternChange={onPatternChange}
              onDragStart={() => {
                Object.keys(beatNodes.current).forEach((key) => measureBeat(Number(key)));
                onDragStart();
              }}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onDragCancel={() => {
                setDropTarget(null);
                onDragCancel();
              }}
              onReset={onReset}
              isPlaying={false}
            />
          </View>
          {!landscape && (
            <Text style={[styles.dragHint, { color: faint }]}>{t("stageMode", "emptySubdivisionHint")}</Text>
          )}
          {landscape && renderPlayButton()}
        </View>
      )}

      {(!landscape || isPlaying) && renderPlayButton()}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  rootCompact: { paddingHorizontal: 10 },
  rootLandscape: { flexDirection: "row", gap: 10 },
  readout: { flex: 1, width: "100%", maxWidth: 520, minHeight: 230 },
  readoutCompact: { flex: 0, height: 180, minHeight: 180 },
  readoutLandscape: { width: "42%", height: "100%", minHeight: 0 },
  editor: { width: "100%", maxWidth: 560, paddingVertical: 8, gap: 8 },
  editorCompact: { paddingVertical: 2, gap: 3 },
  editorLandscape: { flex: 1, width: "38%", maxWidth: 380 },
  editorHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  subHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  hint: { fontSize: 10, textAlign: "right" },
  beatsRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 8, paddingVertical: 5 },
  beatsRowLandscape: { gap: 4, paddingVertical: 1 },
  beatCell: { width: 38, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "transparent" },
  beatCellLandscape: { width: 32, minHeight: 38 },
  beatDot: { width: 18, height: 18, borderRadius: 9, marginBottom: 4 },
  beatLabel: { fontSize: 10, fontWeight: "700" },
  patternRow: { minHeight: 52, width: "100%", alignItems: "center", justifyContent: "center", borderRadius: 12 },
  reset: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  dragHint: { fontSize: 10, textAlign: "center", opacity: 0.75 },
  playButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 132, height: 48, borderWidth: 1, borderRadius: 24, marginTop: 10 },
  playButtonCompact: { height: 42, marginTop: 0, transform: [{ translateY: -20 }] },
  playButtonLandscape: { minWidth: 104, alignSelf: "center", marginTop: 0, transform: [] },
  playLabel: { fontSize: 13, fontWeight: "800", letterSpacing: 1 },
  pressed: { opacity: 0.55, transform: [{ scale: 0.97 }] },
});
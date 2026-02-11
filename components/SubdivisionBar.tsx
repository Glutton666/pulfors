import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import type { BeatType } from "@/lib/metronome-engine";

interface SubdivisionBarProps {
  pattern: BeatType[];
  onPatternChange: (pattern: BeatType[]) => void;
  onDragStart: () => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
}

const CELL_SIZE = 28;
const CELL_GAP = 3;
const MAX_CELLS = 8;
const MIN_CELLS = 1;

function getCellColor(type: BeatType, active: boolean): string {
  if (type === "accent") return active ? Colors.accent : Colors.accentMuted;
  if (type === "normal") return active ? Colors.text : Colors.textTertiary;
  return "transparent";
}

function getCellBorder(type: BeatType): string {
  if (type === "mute") return Colors.textTertiary;
  return "transparent";
}

export function SubdivisionBar({
  pattern,
  onPatternChange,
  onDragStart,
  onDragMove,
  onDragEnd,
}: SubdivisionBarProps) {
  const isDraggingRef = useRef(false);

  const cycleType = useCallback(
    (index: number) => {
      const newPattern = [...pattern];
      const current = newPattern[index];
      const next: BeatType =
        current === "accent"
          ? "normal"
          : current === "normal"
          ? "mute"
          : "accent";
      newPattern[index] = next;

      if (Platform.OS !== "web") {
        Haptics.impactAsync(
          next === "accent"
            ? Haptics.ImpactFeedbackStyle.Heavy
            : next === "mute"
            ? Haptics.ImpactFeedbackStyle.Light
            : Haptics.ImpactFeedbackStyle.Medium
        );
      }

      onPatternChange(newPattern);
    },
    [pattern, onPatternChange]
  );

  const addCell = useCallback(() => {
    if (pattern.length >= MAX_CELLS) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPatternChange([...pattern, "normal"]);
  }, [pattern, onPatternChange]);

  const removeCell = useCallback(() => {
    if (pattern.length <= MIN_CELLS) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPatternChange(pattern.slice(0, -1));
  }, [pattern, onPatternChange]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        return Math.abs(gs.dy) > 12;
      },
      onPanResponderGrant: () => {
        isDraggingRef.current = true;
        onDragStart();
      },
      onPanResponderMove: (e) => {
        if (isDraggingRef.current) {
          onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
      },
      onPanResponderRelease: (e) => {
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
      },
      onPanResponderTerminate: (e) => {
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
      },
    })
  ).current;

  return (
    <View style={styles.wrapper} {...panResponder.panHandlers}>
      <Pressable
        onPress={removeCell}
        hitSlop={8}
        style={({ pressed }) => [
          styles.controlBtn,
          pressed && { opacity: 0.5 },
        ]}
        disabled={pattern.length <= MIN_CELLS}
      >
        <Feather
          name="minus"
          size={14}
          color={
            pattern.length <= MIN_CELLS ? Colors.border : Colors.textSecondary
          }
        />
      </Pressable>

      <View style={styles.cellsContainer}>
        {pattern.map((type, i) => (
          <Pressable
            key={i}
            onPress={() => cycleType(i)}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            hitSlop={2}
          >
            <View
              style={[
                styles.cell,
                {
                  backgroundColor: getCellColor(type, true),
                  borderColor: getCellBorder(type),
                  borderWidth: type === "mute" ? 2 : 0,
                },
              ]}
            />
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={addCell}
        hitSlop={8}
        style={({ pressed }) => [
          styles.controlBtn,
          pressed && { opacity: 0.5 },
        ]}
        disabled={pattern.length >= MAX_CELLS}
      >
        <Feather
          name="plus"
          size={14}
          color={
            pattern.length >= MAX_CELLS ? Colors.border : Colors.textSecondary
          }
        />
      </Pressable>

      <View style={styles.dragHint}>
        <Feather name="move" size={10} color={Colors.textTertiary} />
      </View>
    </View>
  );
}

export function DragGhost({
  pattern,
  x,
  y,
}: {
  pattern: BeatType[];
  x: number;
  y: number;
}) {
  return (
    <View
      style={[
        styles.ghost,
        {
          left: x - (pattern.length * (18 + 2)) / 2,
          top: y - 12,
        },
      ]}
      pointerEvents="none"
    >
      {pattern.map((type, i) => (
        <View
          key={i}
          style={[
            styles.ghostCell,
            {
              backgroundColor: getCellColor(type, true),
              borderColor: getCellBorder(type),
              borderWidth: type === "mute" ? 1.5 : 0,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  controlBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  cellsContainer: {
    flexDirection: "row",
    gap: CELL_GAP,
    alignItems: "center",
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 6,
  },
  dragHint: {
    marginLeft: 4,
    opacity: 0.4,
  },
  ghost: {
    position: "absolute",
    flexDirection: "row",
    gap: 2,
    zIndex: 1000,
    opacity: 0.85,
  },
  ghostCell: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
});

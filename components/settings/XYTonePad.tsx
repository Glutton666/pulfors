import React, { useCallback, useEffect, useRef } from "react";
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { FontSize, Radius, Spacing } from "@/constants/tokens";
import type { TonePosition } from "@/lib/metronome-tone-dsp";

export interface XYTonePadLabels {
  title: string;
  attack: string;
  high: string;
  resonance: string;
  low: string;
  neutral: string;
  reset: string;
  accessibilityLabel?: string;
}

export interface XYTonePadProps {
  tonePosition: TonePosition;
  onTonePositionChange: (position: TonePosition) => void;
  labels: XYTonePadLabels;
}

const clamp = (value: number) => Math.max(-1, Math.min(1, value));
const normalize = (value: number) => (Number.isFinite(value) ? clamp(value) : 0);

/**
 * A two-dimensional tone control. The position is deliberately kept in the
 * public -1..1 coordinate space so callers can map it to their own sound
 * parameters without having to know anything about the pad's dimensions.
 */
export function XYTonePad({
  tonePosition,
  onTonePositionChange,
  labels,
}: XYTonePadProps) {
  const { colors: C } = useTheme();
  const widthRef = useRef(0);
  const heightRef = useRef(0);
  const onChangeRef = useRef(onTonePositionChange);
  const padRef = useRef<View>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const gestureRef = useRef<{ time: number; x: number; y: number; moved: boolean; localX: number; localY: number } | null>(null);
  const webCleanupRef = useRef<(() => void) | null>(null);
  onChangeRef.current = onTonePositionChange;

  useEffect(() => () => {
    webCleanupRef.current?.();
    gestureRef.current = null;
  }, []);

  const emitPosition = useCallback((x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    onChangeRef.current({
      x: Math.round(clamp(x) * 1000) / 1000,
      y: Math.round(clamp(y) * 1000) / 1000,
    });
  }, []);

  const updateFromLocalPoint = useCallback((localX: number, localY: number) => {
    const width = widthRef.current;
    const height = heightRef.current;
    if (width <= 0 || height <= 0) return;
    // The public coordinate follows the DSP mapping: y=-1 is the top and
    // y=+1 is the bottom of the pad.
    emitPosition((localX / width) * 2 - 1, (localY / height) * 2 - 1);
  }, [emitPosition]);

  const finishGesture = useCallback((cancelled = false) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || cancelled || gesture.moved || Date.now() - gesture.time > 300) {
      lastTapRef.current = null;
      return;
    }
    const last = lastTapRef.current;
    const now = Date.now();
    if (last && now - last.time < 300 && Math.hypot(last.x - gesture.x, last.y - gesture.y) <= 20) {
      lastTapRef.current = null;
      emitPosition(0, 0);
    } else {
      lastTapRef.current = { time: now, x: gesture.x, y: gesture.y };
    }
  }, [emitPosition]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const { locationX, locationY, pageX, pageY } = event.nativeEvent;
        const gesture = { time: Date.now(), x: pageX, y: pageY, moved: false, localX: locationX, localY: locationY };
        gestureRef.current = gesture;
        if (Number.isFinite(locationX) && Number.isFinite(locationY)) {
          updateFromLocalPoint(locationX, locationY);
        } else {
          // Absolute page coordinates are not local coordinates.
          padRef.current?.measureInWindow((left, top) => {
            if (gestureRef.current !== gesture) return;
            gesture.localX = pageX - left;
            gesture.localY = pageY - top;
            updateFromLocalPoint(gesture.localX, gesture.localY);
          });
        }
      },
      onPanResponderMove: (_event, state) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        if (Math.hypot(state.dx, state.dy) > 8) gesture.moved = true;
        // Child targets can change locationX/Y; use displacement from grant.
        updateFromLocalPoint(gesture.localX + state.dx, gesture.localY + state.dy);
      },
      onPanResponderRelease: () => finishGesture(),
      onPanResponderTerminate: () => finishGesture(true),
    }),
  ).current;

  const handleWebPointerDown = useCallback((event: any) => {
    if (Platform.OS !== "web") return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.isPrimary === false) return;
    webCleanupRef.current?.();
    event.preventDefault();
    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const updateFromClientPoint = (clientX: number, clientY: number) => {
      emitPosition(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        ((clientY - rect.top) / rect.height) * 2 - 1,
      );
    };

    const pointerId = event.pointerId;
    const gesture = { time: Date.now(), x: event.clientX, y: event.clientY, moved: false, localX: 0, localY: 0 };
    gestureRef.current = gesture;
    updateFromClientPoint(event.clientX, event.clientY);
    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      if (Math.hypot(moveEvent.clientX - gesture.x, moveEvent.clientY - gesture.y) > 8) gesture.moved = true;
      updateFromClientPoint(moveEvent.clientX, moveEvent.clientY);
    };
    const cleanup = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
      webCleanupRef.current = null;
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      handlePointerMove(upEvent);
      finishGesture();
      cleanup();
    };
    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      finishGesture(true);
      cleanup();
    };
    webCleanupRef.current = cleanup;
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerCancel);
  }, [emitPosition, finishGesture]);

  const x = normalize(tonePosition.x);
  const y = normalize(tonePosition.y);
  const thumbLeft = `${((x + 1) / 2) * 100}%` as `${number}%`;
  const thumbTop = `${((y + 1) / 2) * 100}%` as `${number}%`;

  const adjustForAccessibility = useCallback((direction: number) => {
    // Increment/decrement are exposed as vertical tone adjustments. The
    // visual control remains available for adjusting both axes.
    emitPosition(x, y + direction * 0.1);
  }, [emitPosition, x, y]);

  return (
    <View style={styles.container} testID="xy-tone-pad">
      <Text style={[styles.title, { color: C.text }]}>{labels.title}</Text>
      <View
        ref={padRef}
        testID="xy-tone-pad-control"
        style={[
          styles.pad,
          {
            backgroundColor: C.surfaceLight,
            borderColor: C.border,
          },
          Platform.OS === "web" ? { touchAction: "none" } as any : undefined,
        ]}
        onLayout={(event) => {
          widthRef.current = event.nativeEvent.layout.width;
          heightRef.current = event.nativeEvent.layout.height;
        }}
        {...(Platform.OS !== "web" ? panResponder.panHandlers : {})}
        {...(Platform.OS === "web" ? {
          onPointerDown: handleWebPointerDown,
          role: "slider",
          "aria-valuemin": -1,
          "aria-valuemax": 1,
          "aria-valuenow": y,
          "aria-valuetext": `x ${x.toFixed(2)}, y ${y.toFixed(2)}`,
        } as any : {})}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={labels.accessibilityLabel || labels.title}
        accessibilityHint={labels.neutral}
        accessibilityValue={{
          min: -1,
          max: 1,
          now: y,
          text: `x ${x.toFixed(2)}, y ${y.toFixed(2)}`,
        }}
        accessibilityActions={[
          { name: "increment", label: labels.low },
          { name: "decrement", label: labels.high },
          { name: "moveLeft", label: labels.attack },
          { name: "moveRight", label: labels.resonance },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") adjustForAccessibility(1);
          if (event.nativeEvent.actionName === "decrement") adjustForAccessibility(-1);
          if (event.nativeEvent.actionName === "moveLeft") emitPosition(x - 0.1, y);
          if (event.nativeEvent.actionName === "moveRight") emitPosition(x + 0.1, y);
        }}
      >
        <View pointerEvents="none" style={[styles.verticalGuide, { backgroundColor: C.border }]} />
        <View pointerEvents="none" style={[styles.horizontalGuide, { backgroundColor: C.border }]} />

        <Text testID="xy-tone-pad-high" pointerEvents="none" style={[styles.directionLabel, styles.topLabel, { color: C.textSecondary }]}>
          {labels.high}
        </Text>
        <Text testID="xy-tone-pad-low" pointerEvents="none" style={[styles.directionLabel, styles.bottomLabel, { color: C.textSecondary }]}>
          {labels.low}
        </Text>
        <Text testID="xy-tone-pad-attack" pointerEvents="none" style={[styles.directionLabel, styles.leftLabel, { color: C.textSecondary }]}>
          {labels.attack}
        </Text>
        <Text testID="xy-tone-pad-resonance" pointerEvents="none" style={[styles.directionLabel, styles.rightLabel, { color: C.textSecondary }]}>
          {labels.resonance}
        </Text>
        <Text testID="xy-tone-pad-neutral" pointerEvents="none" style={[styles.centerLabel, { color: C.textTertiary }]}>
          {labels.neutral}
        </Text>

        <View
          testID="xy-tone-pad-thumb"
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: thumbLeft,
              top: thumbTop,
              backgroundColor: C.accent,
              borderColor: C.surface,
            },
          ]}
        />
      </View>
      <Pressable
        testID="xy-tone-pad-reset"
        accessibilityRole="button"
        accessibilityLabel={labels.reset}
        style={({ pressed }) => [
          styles.resetButton,
          { borderColor: C.border, backgroundColor: C.overlay08 },
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => {
          webCleanupRef.current?.();
          gestureRef.current = null;
          lastTapRef.current = null;
          emitPosition(0, 0);
        }}
      >
        <Text style={[styles.resetText, { color: C.textSecondary }]}>{labels.reset}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "stretch",
    gap: Spacing.sm,
  },
  title: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.body,
  },
  pad: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    aspectRatio: 1,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  verticalGuide: {
    position: "absolute",
    width: StyleSheet.hairlineWidth,
    top: 0,
    bottom: 0,
    left: "50%",
  },
  horizontalGuide: {
    position: "absolute",
    height: StyleSheet.hairlineWidth,
    left: 0,
    right: 0,
    top: "50%",
  },
  directionLabel: {
    position: "absolute",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.caption,
    opacity: 0.9,
  },
  topLabel: { left: 0, right: 0, top: Spacing.sm, textAlign: "center" },
  bottomLabel: { left: 0, right: 0, bottom: Spacing.sm, textAlign: "center" },
  leftLabel: { left: Spacing.sm, top: "50%", transform: [{ translateY: -8 }] },
  rightLabel: { right: Spacing.sm, top: "50%", transform: [{ translateY: -8 }] },
  centerLabel: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    fontSize: FontSize.caption,
    transform: [{ translateY: -8 }],
  },
  thumb: {
    position: "absolute",
    width: 22,
    height: 22,
    marginLeft: -11,
    marginTop: -11,
    borderRadius: 11,
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0 2px 6px rgba(0,0,0,0.3)" },
    }),
  },
  resetButton: {
    alignSelf: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
  },
  resetText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.small,
  },
});

export default XYTonePad;
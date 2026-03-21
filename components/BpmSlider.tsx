import React, { useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { moderateScale } from "@/lib/scale";

interface BpmSliderProps {
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onTapTempo: () => void;
  halfTime?: boolean;
  onHalfTimeToggle?: () => void;
  isLandscape?: boolean;
}

type Zone = "left" | "center" | "right";

export function BpmSlider({ bpm, onBpmChange, onTapTempo, halfTime, onHalfTimeToggle, isLandscape = false }: BpmSliderProps) {
  const { colors: C } = useTheme();
  const bpmRef = useRef(bpm);
  const startBpmRef = useRef(bpm);
  const lastHapticRef = useRef(bpm);
  const onBpmChangeRef = useRef(onBpmChange);
  const onTapTempoRef = useRef(onTapTempo);
  const didDragRef = useRef(false);
  const zoneRef = useRef<Zone>("center");
  const layoutRef = useRef({ x: 0, y: 0, width: 300, height: 150 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRepeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressFired = useRef(false);
  const touchViewRef = useRef<View>(null);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { onBpmChangeRef.current = onBpmChange; }, [onBpmChange]);
  useEffect(() => { onTapTempoRef.current = onTapTempo; }, [onTapTempo]);
  const onHalfTimeToggleRef = useRef(onHalfTimeToggle);
  useEffect(() => { onHalfTimeToggleRef.current = onHalfTimeToggle; }, [onHalfTimeToggle]);

  const offsetX = useSharedValue(0);
  const flash = useSharedValue(0);
  const glowL = useSharedValue(0);
  const glowR = useSharedValue(0);

  const resolveZone = useCallback((pageX: number): Zone => {
    const { x, width } = layoutRef.current;
    const localX = pageX - x;
    const third = width / 3;
    if (localX < third) return "left";
    if (localX > third * 2) return "right";
    return "center";
  }, []);

  const snapDown = useCallback((v: number) => {
    const t = Math.floor(v / 10) * 10;
    return Math.max(20, v === t ? v - 10 : t);
  }, []);

  const snapUp = useCallback((v: number) => {
    const t = Math.ceil(v / 10) * 10;
    return Math.min(300, v === t ? v + 10 : t);
  }, []);

  const clearTimers = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (longPressRepeat.current) { clearInterval(longPressRepeat.current); longPressRepeat.current = null; }
    longPressFired.current = false;
    glowL.value = withTiming(0, { duration: 200 });
    glowR.value = withTiming(0, { duration: 200 });
  }, []);

  const measureLayout = useCallback(() => {
    touchViewRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0) {
        layoutRef.current = { x, y, width, height };
      }
    });
  }, []);

  const beginLongPress = useCallback((zone: "left" | "right") => {
    (zone === "left" ? glowL : glowR).value = withTiming(1, { duration: 300 });
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      const step = () => {
        const cur = bpmRef.current;
        const next = zone === "left" ? snapDown(cur) : snapUp(cur);
        if (next !== cur) {
          onBpmChangeRef.current(next);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      };
      step();
      longPressRepeat.current = setInterval(step, 350);
    }, 500);
  }, [snapDown, snapUp]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5,

      onPanResponderGrant: (e) => {
        measureLayout();
        startBpmRef.current = bpmRef.current;
        lastHapticRef.current = bpmRef.current;
        didDragRef.current = false;

        const zone = resolveZone(e.nativeEvent.pageX);
        zoneRef.current = zone;
        if (zone !== "center") {
          beginLongPress(zone);
        } else {
          longPressTimer.current = setTimeout(() => {
            longPressFired.current = true;
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onHalfTimeToggleRef.current?.();
          }, 500);
        }
      },

      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dx) > 5) {
          didDragRef.current = true;
          if (zoneRef.current !== "center") { clearTimers(); return; }
          if (longPressTimer.current && !longPressFired.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          if (longPressFired.current) return;
        }
        if (zoneRef.current !== "center") return;
        if (longPressFired.current) return;

        const delta = gs.dx * 0.4;
        const next = Math.max(20, Math.min(300, Math.round(startBpmRef.current + delta)));
        offsetX.value = Math.max(-30, Math.min(30, gs.dx * 0.08));

        if (next !== lastHapticRef.current) {
          if (Platform.OS !== "web") {
            if (next % 10 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            else if (next % 5 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            else Haptics.selectionAsync();
          }
          lastHapticRef.current = next;
          onBpmChangeRef.current(next);
        }
      },

      onPanResponderRelease: () => {
        offsetX.value = withSpring(0, { damping: 15, stiffness: 300 });
        const wasLong = longPressFired.current;
        const zone = zoneRef.current;
        clearTimers();

        if (!didDragRef.current && !wasLong) {
          if (zone === "center") {
            onTapTempoRef.current();
            flash.value = withSequence(
              withTiming(1, { duration: 60 }),
              withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) })
            );
          } else {
            const delta = zone === "left" ? -1 : 1;
            const next = Math.max(20, Math.min(300, bpmRef.current + delta));
            if (next !== bpmRef.current) {
              onBpmChangeRef.current(next);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }
          }
        }
      },

      onPanResponderTerminate: () => {
        offsetX.value = withSpring(0, { damping: 15, stiffness: 300 });
        clearTimers();
      },
    })
  ).current;

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.15 }));
  const leftGlowStyle = useAnimatedStyle(() => ({ opacity: glowL.value * 0.3 }));
  const rightGlowStyle = useAnimatedStyle(() => ({ opacity: glowR.value * 0.3 }));

  return (
    <View style={[styles.wrapper, isLandscape && { alignSelf: "stretch" as const }]}>
      <View
        ref={touchViewRef}
        style={styles.touchLayer}
        collapsable={false}
        onLayout={() => measureLayout()}
        {...panResponder.panHandlers}
      >
        <Animated.View style={[styles.card, bodyStyle, halfTime && { borderColor: C.accent + "80" }, isLandscape && { paddingTop: 8, paddingBottom: 6 }]} testID="bpm-slider">
          <Animated.View style={[styles.flashOverlay, flashStyle, { backgroundColor: C.accent }]} />
          <Animated.View style={[styles.glowLeft, leftGlowStyle]}>
            <LinearGradient
              colors={[C.accent, "transparent"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View style={[styles.glowRight, rightGlowStyle]}>
            <LinearGradient
              colors={["transparent", C.accent]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          <View style={styles.zoneRow} pointerEvents="none">
            <Feather name="activity" size={isLandscape ? 10 : 12} color={Colors.textTertiary} />
            <Text style={[styles.tapLabel, isLandscape && { fontSize: 8 }]}>TAP</Text>
          </View>

          <View style={styles.bpmRow} pointerEvents="none">
            <Feather name="minus" size={isLandscape ? 18 : 24} color={Colors.textSecondary} style={styles.bpmIcon} />
            <View style={styles.bpmContent}>
              <Text style={[styles.bpmValue, isLandscape && { fontSize: 40, lineHeight: 46 }]} testID="bpm-display">{bpm}</Text>
              <Text style={[styles.bpmUnit, halfTime && { color: C.accent }, isLandscape && { fontSize: 10, marginTop: -2 }]}>{halfTime ? "½× BPM" : "BPM"}</Text>
            </View>
            <Feather name="plus" size={isLandscape ? 18 : 24} color={Colors.textSecondary} style={styles.bpmIcon} />
          </View>

          <View style={styles.ticks} pointerEvents="none">
            {Array.from({ length: 29 }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.tick,
                  i % 5 === 0 && styles.tickBig,
                  i === 14 && [styles.tickMid, { backgroundColor: C.accent }],
                ]}
              />
            ))}
          </View>
        </Animated.View>
      </View>

      {!isLandscape && <Text style={styles.hint}>hold sides ±10 · slide center to adjust</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    alignSelf: "stretch",
    gap: 6,
  },
  touchLayer: {
    alignSelf: "stretch",
  },
  card: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderRadius: moderateScale(20, 0.3),
    backgroundColor: Colors.surface,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.accent,
    borderRadius: 20,
  },
  glowLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "40%" as any,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    overflow: "hidden",
  },
  glowRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "40%" as any,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    overflow: "hidden",
  },
  bpmValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: moderateScale(64, 0.4),
    color: Colors.text,
    lineHeight: moderateScale(72, 0.4),
  },
  bpmUnit: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: moderateScale(13, 0.3),
    color: Colors.textTertiary,
    letterSpacing: 4,
    marginTop: -4,
  },
  bpmRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    paddingHorizontal: 8,
  },
  bpmContent: {
    alignItems: "center",
    flex: 1,
  },
  bpmIcon: {
    opacity: 0.5,
  },
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 2,
    opacity: 0.4,
  },
  tapLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: moderateScale(8, 0.3),
    color: Colors.textTertiary,
    letterSpacing: 1.5,
  },
  ticks: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "stretch",
    height: 6,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  tick: {
    width: 1,
    height: 3,
    backgroundColor: Colors.textTertiary,
    opacity: 0.3,
    borderRadius: 0.5,
  },
  tickBig: {
    height: 5,
    opacity: 0.5,
  },
  tickMid: {
    backgroundColor: Colors.accent,
    opacity: 0.7,
    height: 5,
  },
  hint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: moderateScale(11, 0.3),
    color: Colors.textTertiary,
    letterSpacing: 1,
    opacity: 0.6,
  },
});

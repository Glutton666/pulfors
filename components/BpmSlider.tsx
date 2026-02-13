import React, { useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Platform,
  LayoutChangeEvent,
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
import Colors from "@/constants/colors";

interface BpmSliderProps {
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onTapTempo: () => void;
}

type Zone = "left" | "center" | "right";

export function BpmSlider({ bpm, onBpmChange, onTapTempo }: BpmSliderProps) {
  const bpmRef = useRef(bpm);
  const startBpmRef = useRef(bpm);
  const lastHapticBpmRef = useRef(bpm);
  const onBpmChangeRef = useRef(onBpmChange);
  const onTapTempoRef = useRef(onTapTempo);
  const didDragRef = useRef(false);
  const widthRef = useRef(300);
  const zoneRef = useRef<Zone>("center");
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRepeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressFiredRef = useRef(false);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { onBpmChangeRef.current = onBpmChange; }, [onBpmChange]);
  useEffect(() => { onTapTempoRef.current = onTapTempo; }, [onTapTempo]);

  const offsetX = useSharedValue(0);
  const active = useSharedValue(0);
  const flash = useSharedValue(0);
  const glowL = useSharedValue(0);
  const glowR = useSharedValue(0);

  const getZone = useCallback((x: number): Zone => {
    const third = widthRef.current / 3;
    if (x < third) return "left";
    if (x > third * 2) return "right";
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
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    if (longPressRepeatRef.current) { clearInterval(longPressRepeatRef.current); longPressRepeatRef.current = null; }
    longPressFiredRef.current = false;
    glowL.value = withTiming(0, { duration: 200 });
    glowR.value = withTiming(0, { duration: 200 });
  }, []);

  const beginLongPress = useCallback((zone: "left" | "right") => {
    (zone === "left" ? glowL : glowR).value = withTiming(1, { duration: 300 });

    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      const step = () => {
        const cur = bpmRef.current;
        const next = zone === "left" ? snapDown(cur) : snapUp(cur);
        if (next !== cur) {
          onBpmChangeRef.current(next);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      };
      step();
      longPressRepeatRef.current = setInterval(step, 350);
    }, 500);
  }, [snapDown, snapUp]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5,

      onPanResponderGrant: (e) => {
        startBpmRef.current = bpmRef.current;
        lastHapticBpmRef.current = bpmRef.current;
        didDragRef.current = false;
        active.value = withTiming(1, { duration: 150 });

        const zone = getZone(e.nativeEvent.locationX);
        zoneRef.current = zone;
        if (zone !== "center") beginLongPress(zone);
      },

      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dx) > 5) {
          didDragRef.current = true;
          if (zoneRef.current !== "center") { clearTimers(); return; }
        }
        if (zoneRef.current !== "center") return;

        const delta = gs.dx * 0.4;
        const next = Math.max(20, Math.min(300, Math.round(startBpmRef.current + delta)));
        offsetX.value = Math.max(-30, Math.min(30, gs.dx * 0.08));

        if (next !== lastHapticBpmRef.current) {
          if (Platform.OS !== "web") {
            if (next % 10 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            else if (next % 5 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            else Haptics.selectionAsync();
          }
          lastHapticBpmRef.current = next;
          onBpmChangeRef.current(next);
        }
      },

      onPanResponderRelease: () => {
        offsetX.value = withSpring(0, { damping: 15, stiffness: 300 });
        active.value = withTiming(0, { duration: 200 });
        const wasLong = longPressFiredRef.current;
        clearTimers();

        if (zoneRef.current === "center" && !didDragRef.current && !wasLong) {
          onTapTempoRef.current();
          flash.value = withSequence(
            withTiming(1, { duration: 60 }),
            withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) })
          );
        }
      },

      onPanResponderTerminate: () => {
        offsetX.value = withSpring(0, { damping: 15, stiffness: 300 });
        active.value = withTiming(0, { duration: 200 });
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
    <View style={styles.wrapper}>
      <Animated.View
        style={[styles.card, bodyStyle]}
        testID="bpm-slider"
        onLayout={onLayout}
        {...pan.panHandlers}
      >
        <Animated.View style={[styles.flashOverlay, flashStyle]} />
        <Animated.View style={[styles.glowLeft, leftGlowStyle]} />
        <Animated.View style={[styles.glowRight, rightGlowStyle]} />

        <Text style={styles.bpmValue} testID="bpm-display">{bpm}</Text>
        <Text style={styles.bpmUnit}>BPM</Text>

        <View style={styles.zoneRow}>
          <View style={styles.zoneItem}>
            <Feather name="minus" size={14} color={Colors.textTertiary} />
          </View>
          <View style={[styles.zoneItem, styles.zoneMid]}>
            <Feather name="activity" size={10} color={Colors.textTertiary} />
            <Text style={styles.tapLabel}>TAP</Text>
          </View>
          <View style={styles.zoneItem}>
            <Feather name="plus" size={14} color={Colors.textTertiary} />
          </View>
        </View>

        <View style={styles.ticks}>
          {Array.from({ length: 29 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                i % 5 === 0 && styles.tickBig,
                i === 14 && styles.tickMid,
              ]}
            />
          ))}
        </View>
      </Animated.View>

      <Text style={styles.hint}>hold sides ±10 · slide center to adjust</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    alignSelf: "stretch",
    gap: 6,
  },
  card: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignSelf: "stretch",
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
    width: "33%" as any,
    backgroundColor: Colors.accent,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  glowRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "33%" as any,
    backgroundColor: Colors.accent,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  bpmValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 64,
    color: Colors.text,
    lineHeight: 72,
  },
  bpmUnit: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.textTertiary,
    letterSpacing: 4,
    marginTop: -4,
  },
  zoneRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    marginTop: 8,
  },
  zoneItem: {
    flex: 1,
    alignItems: "center",
    opacity: 0.4,
  },
  zoneMid: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 3,
  },
  tapLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
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
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1,
    opacity: 0.6,
  },
});

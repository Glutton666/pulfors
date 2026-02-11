import React, { useRef, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, PanResponder, Platform, Dimensions, LayoutChangeEvent } from "react-native";
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

const SCREEN_WIDTH = Dimensions.get("window").width;

interface BpmSliderProps {
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onTapTempo: () => void;
}

export function BpmSlider({ bpm, onBpmChange, onTapTempo }: BpmSliderProps) {
  const currentBpmRef = useRef(bpm);
  const startBpmRef = useRef(bpm);
  const lastHapticBpm = useRef(bpm);
  const onBpmChangeRef = useRef(onBpmChange);
  const onTapTempoRef = useRef(onTapTempo);
  const didDragRef = useRef(false);
  const containerWidthRef = useRef(SCREEN_WIDTH - 32);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLongPressActiveRef = useRef(false);
  const touchStartXRef = useRef(0);
  const grantLocationXRef = useRef(0);
  const grantZoneRef = useRef<"left" | "center" | "right">("center");

  useEffect(() => {
    currentBpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    onBpmChangeRef.current = onBpmChange;
  }, [onBpmChange]);

  useEffect(() => {
    onTapTempoRef.current = onTapTempo;
  }, [onTapTempo]);

  const translateX = useSharedValue(0);
  const isDragging = useSharedValue(0);
  const glowIntensity = useSharedValue(0);
  const tapFlash = useSharedValue(0);
  const leftGlow = useSharedValue(0);
  const rightGlow = useSharedValue(0);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
    isLongPressActiveRef.current = false;
    leftGlow.value = withTiming(0, { duration: 200 });
    rightGlow.value = withTiming(0, { duration: 200 });
  }, []);

  const getZone = useCallback((locationX: number): "left" | "center" | "right" => {
    const w = containerWidthRef.current;
    const third = w / 3;
    if (locationX < third) return "left";
    if (locationX > third * 2) return "right";
    return "center";
  }, []);

  const roundBpmDown = useCallback((current: number): number => {
    const tens = Math.floor(current / 10) * 10;
    if (current === tens) return Math.max(20, current - 10);
    return Math.max(20, tens);
  }, []);

  const roundBpmUp = useCallback((current: number): number => {
    const tens = Math.ceil(current / 10) * 10;
    if (current === tens) return Math.min(300, current + 10);
    return Math.min(300, tens);
  }, []);

  const startLongPress = useCallback((zone: "left" | "right") => {
    if (zone === "left") {
      leftGlow.value = withTiming(1, { duration: 300 });
    } else {
      rightGlow.value = withTiming(1, { duration: 300 });
    }

    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      const adjust = () => {
        const cur = currentBpmRef.current;
        const newBpm = zone === "left" ? roundBpmDown(cur) : roundBpmUp(cur);
        if (newBpm !== cur) {
          onBpmChangeRef.current(newBpm);
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }
      };
      adjust();
      longPressIntervalRef.current = setInterval(adjust, 400);
    }, 2000);
  }, [roundBpmDown, roundBpmUp]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    containerWidthRef.current = e.nativeEvent.layout.width;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 5,
      onPanResponderGrant: (e) => {
        startBpmRef.current = currentBpmRef.current;
        lastHapticBpm.current = currentBpmRef.current;
        didDragRef.current = false;
        isDragging.value = withTiming(1, { duration: 150 });
        glowIntensity.value = withTiming(1, { duration: 200 });

        const locationX = e.nativeEvent.locationX;
        grantLocationXRef.current = locationX;
        touchStartXRef.current = e.nativeEvent.pageX;

        const zone = getZone(locationX);
        grantZoneRef.current = zone;
        if (zone === "left" || zone === "right") {
          startLongPress(zone);
        }
      },
      onPanResponderMove: (_, gestureState) => {
        if (grantZoneRef.current !== "center") {
          if (Math.abs(gestureState.dx) > 10) {
            clearLongPress();
          }
          return;
        }

        if (Math.abs(gestureState.dx) > 5) {
          didDragRef.current = true;
        }

        const sensitivity = 0.4;
        const rawDelta = gestureState.dx * sensitivity;
        const newBpm = Math.round(startBpmRef.current + rawDelta);
        const clampedBpm = Math.max(20, Math.min(300, newBpm));

        translateX.value = Math.max(-30, Math.min(30, gestureState.dx * 0.08));

        if (clampedBpm !== lastHapticBpm.current) {
          if (Platform.OS !== "web") {
            if (clampedBpm % 10 === 0) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } else if (clampedBpm % 5 === 0) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } else {
              Haptics.selectionAsync();
            }
          }
          lastHapticBpm.current = clampedBpm;
          onBpmChangeRef.current(clampedBpm);
        }
      },
      onPanResponderRelease: (e) => {
        translateX.value = withSpring(0, { damping: 15, stiffness: 300 });
        isDragging.value = withTiming(0, { duration: 200 });
        glowIntensity.value = withTiming(0, { duration: 300 });

        const wasLongPress = isLongPressActiveRef.current;
        clearLongPress();

        if (!didDragRef.current && !wasLongPress) {
          const zone = getZone(grantLocationXRef.current);
          if (zone === "center") {
            onTapTempoRef.current();
            tapFlash.value = withSequence(
              withTiming(1, { duration: 60 }),
              withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) })
            );
          }
        }
      },
      onPanResponderTerminate: () => {
        translateX.value = withSpring(0, { damping: 15, stiffness: 300 });
        isDragging.value = withTiming(0, { duration: 200 });
        glowIntensity.value = withTiming(0, { duration: 300 });
        clearLongPress();
      },
    })
  ).current;

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const el = containerRef.current as unknown as HTMLElement;
    if (!el || !el.addEventListener) return;

    let startX = 0;
    let startBpm = 0;
    let lastHaptic = 0;
    let dragged = false;
    let grantLocX = 0;

    const handleMouseDown = (e: MouseEvent) => {
      startX = e.clientX;
      startBpm = currentBpmRef.current;
      lastHaptic = currentBpmRef.current;
      dragged = false;
      isDragging.value = withTiming(1, { duration: 150 });
      glowIntensity.value = withTiming(1, { duration: 200 });

      const rect = el.getBoundingClientRect();
      grantLocX = e.clientX - rect.left;

      const zone = getZone(grantLocX);
      const grantZone = zone;
      if (zone === "left" || zone === "right") {
        startLongPress(zone);
      }

      const handleMouseMove = (me: MouseEvent) => {
        if (grantZone !== "center") {
          if (Math.abs(me.clientX - startX) > 10) {
            clearLongPress();
          }
          return;
        }
        if (Math.abs(me.clientX - startX) > 5) {
          dragged = true;
        }
        const sensitivity = 0.4;
        const rawDelta = (me.clientX - startX) * sensitivity;
        const newBpm = Math.round(startBpm + rawDelta);
        const clampedBpm = Math.max(20, Math.min(300, newBpm));
        translateX.value = Math.max(-30, Math.min(30, (me.clientX - startX) * 0.08));
        if (clampedBpm !== lastHaptic) {
          lastHaptic = clampedBpm;
          onBpmChangeRef.current(clampedBpm);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        translateX.value = withSpring(0, { damping: 15, stiffness: 300 });
        isDragging.value = withTiming(0, { duration: 200 });
        glowIntensity.value = withTiming(0, { duration: 300 });

        const wasLongPress = isLongPressActiveRef.current;
        clearLongPress();

        if (!dragged && !wasLongPress) {
          const zone = getZone(grantLocX);
          if (zone === "center") {
            onTapTempoRef.current();
            tapFlash.value = withSequence(
              withTiming(1, { duration: 60 }),
              withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) })
            );
          }
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    };

    el.addEventListener("mousedown", handleMouseDown);

    return () => {
      el.removeEventListener("mousedown", handleMouseDown);
      clearLongPress();
    };
  }, [getZone, startLongPress, clearLongPress]);

  const containerRef = useRef<View>(null);

  const containerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowIntensity.value * 0.25,
  }));

  const tapFlashStyle = useAnimatedStyle(() => ({
    opacity: tapFlash.value * 0.15,
  }));

  const leftGlowStyle = useAnimatedStyle(() => ({
    opacity: leftGlow.value * 0.3,
  }));

  const rightGlowStyle = useAnimatedStyle(() => ({
    opacity: rightGlow.value * 0.3,
  }));

  const nativePanHandlers = Platform.OS !== "web" ? panResponder.panHandlers : {};

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.glowBg, glowStyle]} />
      <Animated.View
        ref={containerRef}
        style={[styles.container, containerAnimStyle]}
        onLayout={onLayout}
        {...nativePanHandlers}
        testID="bpm-slider"
      >
        <Animated.View style={[styles.tapFlashOverlay, tapFlashStyle]} />
        <Animated.View style={[styles.zoneGlowLeft, leftGlowStyle]} />
        <Animated.View style={[styles.zoneGlowRight, rightGlowStyle]} />

        <View style={styles.zoneIndicators}>
          <View style={styles.zoneLeft}>
            <Feather name="minus" size={14} color={Colors.textTertiary} />
          </View>
          <View style={styles.zoneCenter}>
            <Feather name="activity" size={10} color={Colors.textTertiary} />
            <Text style={styles.tapText}>TAP</Text>
          </View>
          <View style={styles.zoneRight}>
            <Feather name="plus" size={14} color={Colors.textTertiary} />
          </View>
        </View>

        <View style={styles.bpmContent}>
          <Text style={styles.bpmValue} testID="bpm-display">
            {bpm}
          </Text>
          <Text style={styles.bpmUnit}>BPM</Text>
        </View>

        <View style={styles.tickTrack}>
          {Array.from({ length: 29 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                i % 5 === 0 && styles.tickMajor,
                i === 14 && styles.tickCenter,
              ]}
            />
          ))}
        </View>
      </Animated.View>

      <Text style={styles.slideHint}>hold sides to jump · slide center to adjust</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    alignSelf: "stretch",
    gap: 6,
    paddingHorizontal: 0,
  },
  glowBg: {
    position: "absolute",
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 24,
    backgroundColor: Colors.accent,
  },
  container: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignSelf: "stretch",
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  tapFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.accent,
    borderRadius: 20,
  },
  zoneGlowLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "33%" as any,
    backgroundColor: Colors.accent,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  zoneGlowRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "33%" as any,
    backgroundColor: Colors.accent,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  zoneIndicators: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  zoneLeft: {
    flex: 1,
    alignItems: "center",
    opacity: 0.4,
  },
  zoneCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    opacity: 0.4,
  },
  zoneRight: {
    flex: 1,
    alignItems: "center",
    opacity: 0.4,
  },
  bpmContent: {
    alignItems: "center",
    minWidth: 120,
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
  tickTrack: {
    position: "absolute",
    bottom: 6,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 6,
  },
  tick: {
    width: 1,
    height: 3,
    backgroundColor: Colors.textTertiary,
    opacity: 0.3,
    borderRadius: 0.5,
  },
  tickMajor: {
    height: 5,
    opacity: 0.5,
  },
  tickCenter: {
    backgroundColor: Colors.accent,
    opacity: 0.7,
    height: 5,
  },
  tapText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
  },
  slideHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1,
    opacity: 0.6,
  },
});

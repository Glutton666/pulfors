import React, { useEffect, useRef } from "react";
import { View, Pressable, Platform, ActivityIndicator, PanResponder, Animated, type ViewStyle, type StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Spacing } from "@/constants/tokens";
import type { TranslationFn } from "@/lib/i18n";
import {
  createBarPlayGestureState,
  updateBarPlayGesture,
  type BarPlayGestureState,
} from "@/lib/bar-play-gesture";

export interface BarPlayButtonProps {
  isPlaying: boolean;
  isPreparing: boolean;
  barLoopMode: "loop" | "once";
  onTogglePlay: () => void;
  onBarLoopModeChange: (mode: "loop" | "once") => void;
  blockPlayMode?: "sequential" | "loop" | "random";
  onBlockPlayModeChange?: (mode: "sequential" | "loop" | "random") => void;
  onRandomPlayRequest?: () => void;
  baseStyle: StyleProp<ViewStyle>;
  accentColor: string;
  dangerColor: string;
  backgroundColor: string;
  iconSize: number;
  badgeIconSize: number;
  sizeOverride?: { width: number; height: number; borderRadius: number };
  testID?: string;
  t: TranslationFn;
}

export function BarPlayButton({
  isPlaying,
  isPreparing,
  barLoopMode,
  onTogglePlay,
  onBarLoopModeChange,
  blockPlayMode,
  onRandomPlayRequest,
  baseStyle,
  accentColor,
  dangerColor,
  backgroundColor,
  iconSize,
  badgeIconSize,
  sizeOverride,
  testID = "bar-play-button",
  t,
}: BarPlayButtonProps) {
  const gestureStateRef = useRef<BarPlayGestureState>(
    createBarPlayGestureState(),
  );
  const gestureTriggeredRef = useRef(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const resetGesture = () => {
    gestureStateRef.current = createBarPlayGestureState();
    gestureTriggeredRef.current = false;
  };

  const playEntryFeedback = () => {
    shakeAnim.stopAnimation();
    scaleAnim.stopAnimation();
    Animated.parallel([
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: -7, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 7, duration: 110, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -4, duration: 75, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.06, duration: 110, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
    ]).start();
  };

  useEffect(() => {
    if (isPlaying || isPreparing) resetGesture();
  }, [isPlaying, isPreparing]);

  useEffect(() => {
    return () => {
      resetGesture();
      shakeAnim.stopAnimation();
      scaleAnim.stopAnimation();
    };
  }, [scaleAnim, shakeAnim]);

  const shakePanel = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) =>
      !isPlaying &&
      !isPreparing &&
      !gestureTriggeredRef.current &&
      !!onRandomPlayRequest &&
      Math.abs(g.dx) > 8 &&
      Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderGrant: () => {
      gestureStateRef.current = createBarPlayGestureState();
      gestureTriggeredRef.current = false;
    },
    onPanResponderMove: (_e, g) => {
      if (isPlaying || isPreparing || gestureTriggeredRef.current) return;
      const result = updateBarPlayGesture(gestureStateRef.current, g.dx);
      gestureStateRef.current = result.state;
      if (result.triggered) {
        gestureTriggeredRef.current = true;
        playEntryFeedback();
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        onRandomPlayRequest?.();
      }
    },
    onPanResponderRelease: () => {
      resetGesture();
    },
    onPanResponderTerminate: () => {
      resetGesture();
    },
  });

  const handleLongPress = () => {
    const next = barLoopMode === "loop" ? "once" : "loop";
    onBarLoopModeChange(next);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const isRandom = blockPlayMode === "random";

  const barLoopModeLabel = barLoopMode === "loop"
    ? t("barModeView", "loopModeLoop")
    : t("barModeView", "loopModeOnce");

  const blockPlayModeLabel = blockPlayMode === "sequential"
    ? t("barModeView", "blockModeSequential")
    : blockPlayMode === "loop"
    ? t("barModeView", "blockModeLoop")
    : blockPlayMode === "random"
    ? t("barModeView", "blockModeRandom")
    : undefined;

  const accessibilityValueText = blockPlayModeLabel
    ? `${barLoopModeLabel}, ${blockPlayModeLabel}`
    : barLoopModeLabel;

  return (
    <Animated.View style={{ transform: [{ translateX: shakeAnim }, { scale: scaleAnim }] }} {...shakePanel.panHandlers}>
      <Pressable
        onPress={onTogglePlay}
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={({ pressed }) => [
          baseStyle,
          sizeOverride,
          pressed && { opacity: 0.7 },
          isPreparing && { opacity: 0.5 },
          barLoopMode === "loop" && { borderWidth: 1.5, borderColor: accentColor },
        ]}
        testID={testID}
        disabled={isPreparing}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? t("barModeView", "stopLabel") : t("barModeView", "playLabel")}
        accessibilityValue={{ text: accessibilityValueText }}
        accessibilityState={{ busy: isPreparing, disabled: isPreparing }}
        accessibilityHint={
          barLoopMode === "loop"
            ? t("barModeView", "hintSwitchToOnce")
            : t("barModeView", "hintSwitchToLoop")
        }
      >
        {isPreparing ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <Ionicons
            name={isPlaying ? "stop" : "play"}
            size={iconSize}
            color={isPlaying ? dangerColor : accentColor}
            style={!isPlaying ? { marginLeft: Spacing.xxs } : undefined}
          />
        )}
      </Pressable>
      {barLoopMode === "loop" && (
        <View
          accessible
          accessibilityLabel={t("barModeView", "loopModeLoop")}
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            backgroundColor: accentColor,
            borderRadius: 7,
            width: 14,
            height: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="repeat" size={badgeIconSize} color={backgroundColor} />
        </View>
      )}
      {isRandom && !isPlaying && (
        <View
          accessible
          accessibilityLabel={t("barModeView", "blockModeRandom")}
          style={{
            position: "absolute",
            bottom: -6,
            right: -6,
            backgroundColor: accentColor + "CC",
            borderRadius: 7,
            width: 14,
            height: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="shuffle" size={badgeIconSize} color={backgroundColor} />
        </View>
      )}
    </Animated.View>
  );
}

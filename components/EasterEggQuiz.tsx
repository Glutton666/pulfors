import React, { useRef, useEffect, useCallback, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/contexts/ThemeContext";
import Colors from "@/constants/colors";
import { useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";
import { FontSize } from "@/constants/tokens";

interface EasterEggQuizProps {
  onGuess: (bpm: number) => void;
  revealBpm?: number | null;
  isGiveUp?: boolean;
  shakeCount?: number;
  successCount?: number;
  hintDirection?: "up" | "down" | null;
  isLandscape?: boolean;
  applyBpmSelected?: boolean;
  onToggleApplyBpm?: () => void;
}

export function EasterEggQuiz({
  onGuess,
  revealBpm = null,
  isGiveUp = false,
  shakeCount = 0,
  successCount = 0,
  hintDirection = null,
  isLandscape = false,
  applyBpmSelected = false,
  onToggleApplyBpm,
}: EasterEggQuizProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const styles = make_styles(C, S);

  const [input, setInput] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = useCallback(() => {
    const val = parseInt(input, 10);
    if (!isNaN(val) && val >= 20 && val <= 300) {
      onGuess(val);
    }
  }, [input, onGuess]);

  const offsetX = useSharedValue(0);
  const flash = useSharedValue(0);
  const hintOpacity = useSharedValue(0);

  const prevShakeRef = useRef(0);
  useEffect(() => {
    if (shakeCount > prevShakeRef.current) {
      prevShakeRef.current = shakeCount;
      offsetX.value = withSequence(
        withTiming(-14, { duration: 55 }),
        withTiming(14, { duration: 55 }),
        withTiming(-10, { duration: 45 }),
        withTiming(10, { duration: 45 }),
        withTiming(-6, { duration: 35 }),
        withTiming(0, { duration: 35 })
      );
    }
  }, [shakeCount, offsetX]);

  const prevSuccessRef = useRef(0);
  useEffect(() => {
    if (successCount > prevSuccessRef.current) {
      prevSuccessRef.current = successCount;
      flash.value = withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0.6, { duration: 120 }),
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) })
      );
    }
  }, [successCount, flash]);

  useEffect(() => {
    if (hintDirection != null) {
      hintOpacity.value = 0;
      hintOpacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    } else {
      hintOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [hintDirection, hintOpacity]);

  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offsetX.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hintOpacity.value }));

  const accentLabel = revealBpm != null
    ? (isGiveUp ? t("main", "eggRevealGiveUp") : t("main", "eggRevealCorrect"))
    : "BPM ?";

  const hintText = hintDirection === "up"
    ? t("main", "eggHintUp")
    : hintDirection === "down"
    ? t("main", "eggHintDown")
    : "";

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.card, { backgroundColor: C.surface, borderColor: C.accent + "80" }, bodyStyle, isLandscape && { paddingTop: S.ms(8, 0.3), paddingBottom: S.ms(6, 0.3) }]}>
        <Animated.View style={[styles.flashOverlay, flashStyle, { backgroundColor: C.accent }]} />
        <LinearGradient
          colors={[C.accent + "18", "transparent"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.content} pointerEvents="box-none">
          {revealBpm != null ? (
            <>
              <Text
                style={[
                  styles.label,
                  { color: isGiveUp ? C.textSecondary : C.accent },
                  isLandscape && { fontSize: S.ms(10, 0.3), marginTop: -2 },
                ]}
              >
                {accentLabel}
              </Text>
              <Text
                style={[
                  styles.bpmValue,
                  { color: isGiveUp ? C.textSecondary : C.accent },
                  isLandscape && { fontSize: S.ms(40, 0.4), lineHeight: S.ms(46, 0.4) },
                ]}
                testID="bpm-easter-egg-reveal"
              >
                {revealBpm}
              </Text>
              {onToggleApplyBpm && (
                <TouchableOpacity
                  onPress={onToggleApplyBpm}
                  activeOpacity={0.6}
                  testID="bpm-easter-egg-apply"
                >
                  <Text
                    style={[
                      styles.label,
                      { color: applyBpmSelected ? C.accent : C.textTertiary },
                      isLandscape && { fontSize: S.ms(10, 0.3), marginTop: -2 },
                    ]}
                  >
                    {applyBpmSelected ? "✓ 비트모드에 적용" : "클릭시 비트모드에 적용"}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <TextInput
                ref={inputRef}
                style={[
                  styles.bpmValue,
                  styles.eggInput,
                  { color: C.accent, borderBottomColor: C.accent },
                  isLandscape && { fontSize: S.ms(40, 0.4), lineHeight: S.ms(46, 0.4) },
                ]}
                value={input}
                onChangeText={setInput}
                keyboardType="numeric"
                placeholder="000"
                placeholderTextColor={C.textTertiary}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                maxLength={3}
                testID="bpm-easter-egg-input"
              />
              <Text
                style={[
                  styles.label,
                  { color: C.accent },
                  isLandscape && { fontSize: S.ms(10, 0.3), marginTop: -2 },
                ]}
              >
                {accentLabel}
              </Text>
              <Animated.Text
                style={[
                  styles.hintDirection,
                  { color: hintDirection === "up" ? C.accent : C.textSecondary },
                  isLandscape && { fontSize: S.ms(11, 0.3) },
                  hintStyle,
                ]}
                testID="bpm-easter-egg-hint"
              >
                {hintText}
              </Animated.Text>
            </>
          )}
        </View>

        <View style={styles.ticks} pointerEvents="none">
          {Array.from({ length: 29 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                { backgroundColor: C.accent },
                i % 5 === 0 && styles.tickBig,
                i === 14 && [styles.tickMid],
              ]}
            />
          ))}
        </View>
      </Animated.View>

      <Text style={[styles.hint, { color: C.textTertiary }]}>
        {revealBpm == null ? (Platform.OS === "web" ? "ENTER↵" : "↵") : " "}
      </Text>
    </View>
  );
}

const make_styles = (C: typeof Colors, S: ScaleValues) =>
  StyleSheet.create({
    wrapper: {
      alignItems: "center",
      alignSelf: "stretch",
      gap: S.ms(6, 0.3),
    },
    card: {
      alignSelf: "stretch",
      alignItems: "center",
      paddingHorizontal: S.ms(16, 0.3),
      paddingTop: S.ms(14, 0.3),
      paddingBottom: S.ms(10, 0.3),
      borderRadius: S.ms(20, 0.3),
      overflow: "hidden",
      borderWidth: 1.5,
    },
    flashOverlay: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 20,
    },
    content: {
      alignItems: "center",
    },
    bpmValue: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: S.ms(64, 0.4),
      lineHeight: S.ms(72, 0.4),
    },
    eggInput: {
      textAlign: "center",
      borderBottomWidth: 2,
      paddingBottom: 2,
      minWidth: S.ms(80, 0.4),
    },
    label: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: S.ms(13, 0.3),
      letterSpacing: 4,
      marginTop: -4,
    },
    hintDirection: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: S.ms(13, 0.3),
      letterSpacing: 1,
      marginTop: S.ms(6, 0.3),
    },
    ticks: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignSelf: "stretch",
      height: S.ms(6, 0.3),
      marginTop: S.ms(6, 0.3),
      paddingHorizontal: S.ms(4, 0.3),
    },
    tick: {
      width: 1,
      height: S.ms(3, 0.3),
      opacity: 0.2,
      borderRadius: 0.5,
    },
    tickBig: {
      height: S.ms(5, 0.3),
      opacity: 0.35,
    },
    tickMid: {
      opacity: 0.6,
      height: S.ms(5, 0.3),
    },
    hint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.caption,
      letterSpacing: 1,
      opacity: 0.5,
    },
  });

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { MetronomeEngine, highClickUri, lowClickUri } from "@/lib/metronome-engine";
import { loadSettings } from "@/lib/storage";

type TimerState = "idle" | "running" | "finishing" | "done";

const PRESET_DURATIONS = [
  { label: "1m", seconds: 60 },
  { label: "3m", seconds: 180 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1800 },
];

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TimerScreen() {
  const insets = useSafeAreaInsets();
  const [totalSeconds, setTotalSeconds] = useState(300);
  const [remaining, setRemaining] = useState(300);
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [bpm, setBpm] = useState(120);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [isMetronomePlaying, setIsMetronomePlaying] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineRef = useRef<MetronomeEngine | null>(null);

  const highPlayer = useAudioPlayer(highClickUri);
  const lowPlayer = useAudioPlayer(lowClickUri);

  const flashOpacity = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  useEffect(() => {
    const engine = new MetronomeEngine();
    engineRef.current = engine;

    engine.setAudioCallbacks(
      () => {
        try { highPlayer.seekTo(0); highPlayer.play(); } catch (e) {}
      },
      () => {
        try { lowPlayer.seekTo(0); lowPlayer.play(); } catch (e) {}
      }
    );

    engine.setOnBeat((beat: number, isAccent: boolean) => {
      setCurrentBeat(beat);
      if (isAccent) {
        flashOpacity.value = withSequence(
          withTiming(0.08, { duration: 50 }),
          withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) })
        );
      }
    });

    loadSettings().then((settings) => {
      setBpm(settings.bpm);
      setBeatsPerMeasure(settings.beatsPerMeasure);
      engine.setBpm(settings.bpm);
      engine.setBeatsPerMeasure(settings.beatsPerMeasure);
    });

    return () => { engine.cleanup(); };
  }, []);

  const startTimer = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const engine = engineRef.current;
    if (!engine) return;

    loadSettings().then((settings) => {
      engine.setBpm(settings.bpm);
      engine.setBeatsPerMeasure(settings.beatsPerMeasure);
      setBpm(settings.bpm);
      setBeatsPerMeasure(settings.beatsPerMeasure);
    });

    setRemaining(totalSeconds);
    setTimerState("running");
    setIsMetronomePlaying(true);
    engine.start();

    const startTime = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const left = totalSeconds - elapsed;
      if (left <= 0) {
        setRemaining(0);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setTimerState("finishing");
        engine.stopAfterMeasure(() => {
          setIsMetronomePlaying(false);
          setCurrentBeat(-1);
          setTimerState("done");
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          pulseScale.value = withSequence(
            withTiming(1.05, { duration: 200 }),
            withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) })
          );
        });
      } else {
        setRemaining(left);
      }
    }, 250);
  }, [totalSeconds, pulseScale, flashOpacity]);

  const stopTimer = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    engineRef.current?.stop();
    setIsMetronomePlaying(false);
    setCurrentBeat(-1);
    setTimerState("idle");
    setRemaining(totalSeconds);
  }, [totalSeconds]);

  const resetTimer = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimerState("idle");
    setRemaining(totalSeconds);
    setCurrentBeat(-1);
  }, [totalSeconds]);

  const adjustTime = useCallback((delta: number) => {
    if (timerState !== "idle") return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setTotalSeconds((prev) => {
      const next = Math.max(10, Math.min(3600, prev + delta));
      setRemaining(next);
      return next;
    });
  }, [timerState]);

  const selectPreset = useCallback((seconds: number) => {
    if (timerState !== "idle") return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setTotalSeconds(seconds);
    setRemaining(seconds);
  }, [timerState]);

  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const isIdle = timerState === "idle";
  const isDone = timerState === "done";
  const isFinishing = timerState === "finishing";
  const isActive = timerState === "running" || isFinishing;

  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[Colors.background, "#0A0E14", Colors.background]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: Colors.accent, pointerEvents: "none" as const },
          flashStyle,
        ]}
      />

      <View
        style={[
          styles.content,
          { paddingTop: (insets.top || webTopInset) + 24 },
        ]}
      >
        <View style={styles.displaySection}>
          <View style={styles.progressRing}>
            <View
              style={[
                styles.progressFill,
                {
                  height: `${progress * 100}%`,
                  backgroundColor: isFinishing ? Colors.accent : isActive ? Colors.accentDim : Colors.surface,
                },
              ]}
            />
            <Animated.View style={[styles.timeContainer, pulseStyle]}>
              <Text
                style={[
                  styles.timeDisplay,
                  isDone && styles.timeDone,
                  isFinishing && styles.timeFinishing,
                ]}
                testID="timer-display"
              >
                {formatCountdown(remaining)}
              </Text>
              {isFinishing && (
                <Text style={styles.finishingLabel}>finishing measure...</Text>
              )}
              {isDone && (
                <Text style={styles.doneLabel}>complete</Text>
              )}
            </Animated.View>
          </View>
        </View>

        {isActive && (
          <View style={styles.beatsRow}>
            {beats.map((beat) => (
              <View
                key={beat}
                style={[
                  styles.beatDot,
                  beat === 0 && styles.beatDotAccent,
                  isMetronomePlaying && currentBeat === beat && styles.beatDotActive,
                  isMetronomePlaying && currentBeat === beat && beat === 0 && styles.beatDotAccentActive,
                ]}
              />
            ))}
          </View>
        )}

        {isIdle && (
          <View style={styles.setupSection}>
            <View style={styles.adjustRow}>
              <Pressable
                onPress={() => adjustTime(-10)}
                onLongPress={() => adjustTime(-60)}
                style={({ pressed }) => [styles.adjustButton, pressed && styles.buttonPressed]}
              >
                <Feather name="minus" size={20} color={Colors.textSecondary} />
              </Pressable>

              <View style={styles.adjustDisplay}>
                <Text style={styles.adjustValue}>{formatCountdown(totalSeconds)}</Text>
              </View>

              <Pressable
                onPress={() => adjustTime(10)}
                onLongPress={() => adjustTime(60)}
                style={({ pressed }) => [styles.adjustButton, pressed && styles.buttonPressed]}
              >
                <Feather name="plus" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presetsRow}
            >
              {PRESET_DURATIONS.map((preset) => (
                <Pressable
                  key={preset.label}
                  onPress={() => selectPreset(preset.seconds)}
                  style={[
                    styles.presetChip,
                    totalSeconds === preset.seconds && styles.presetChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.presetText,
                      totalSeconds === preset.seconds && styles.presetTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.metronomeHint}>
              Metronome plays during timer at saved BPM
            </Text>
          </View>
        )}

        <View style={styles.controlsRow}>
          {isIdle && (
            <Pressable
              onPress={startTimer}
              style={({ pressed }) => [styles.mainButton, styles.startButton, pressed && styles.buttonPressed]}
              testID="timer-start"
            >
              <Ionicons name="play" size={32} color={Colors.background} style={{ marginLeft: 3 }} />
            </Pressable>
          )}

          {isActive && (
            <Pressable
              onPress={stopTimer}
              style={({ pressed }) => [styles.mainButton, styles.stopButton, pressed && styles.buttonPressed]}
              testID="timer-stop"
            >
              <Ionicons name="stop" size={32} color={Colors.background} />
            </Pressable>
          )}

          {isDone && (
            <Pressable
              onPress={resetTimer}
              style={({ pressed }) => [styles.mainButton, styles.startButton, pressed && styles.buttonPressed]}
              testID="timer-reset"
            >
              <Ionicons name="refresh" size={28} color={Colors.background} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
    paddingBottom: 16,
  },
  displaySection: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  progressRing: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 0,
  },
  timeContainer: {
    alignItems: "center",
    zIndex: 1,
  },
  timeDisplay: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 48,
    color: Colors.text,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  timeDone: {
    color: Colors.success,
  },
  timeFinishing: {
    color: Colors.accent,
  },
  finishingLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.accent,
    marginTop: 4,
    letterSpacing: 1,
  },
  doneLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.success,
    marginTop: 4,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  beatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 16,
  },
  beatDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.textTertiary,
  },
  beatDotAccent: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  beatDotActive: {
    backgroundColor: Colors.text,
  },
  beatDotAccentActive: {
    backgroundColor: Colors.accent,
  },
  setupSection: {
    alignItems: "center",
    gap: 20,
  },
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  adjustButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  adjustDisplay: {
    minWidth: 120,
    alignItems: "center",
  },
  adjustValue: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 28,
    color: Colors.text,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  presetsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 4,
  },
  presetChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  presetText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.textTertiary,
  },
  presetTextActive: {
    color: Colors.accent,
  },
  metronomeHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    opacity: 0.5,
    letterSpacing: 0.5,
  },
  controlsRow: {
    alignItems: "center",
    paddingVertical: 16,
  },
  mainButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  startButton: {
    backgroundColor: Colors.accent,
    boxShadow: `0px 4px 12px ${Colors.accent}4D`,
  },
  stopButton: {
    backgroundColor: Colors.danger,
    boxShadow: `0px 4px 12px ${Colors.danger}4D`,
  },
  buttonPressed: {
    transform: [{ scale: 0.93 }],
  },
});

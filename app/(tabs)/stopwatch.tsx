import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function formatLapDiff(ms: number): string {
  if (ms < 1000) return `+${ms}ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `+${seconds}s`;
}

interface LapData {
  id: string;
  number: number;
  time: number;
  diff: number;
}

export default function StopwatchScreen() {
  const insets = useSafeAreaInsets();
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [laps, setLaps] = useState<LapData[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const accumulatedRef = useRef(0);
  const lastLapTimeRef = useRef(0);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const start = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startTimeRef.current = Date.now();
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsed(accumulatedRef.current + (Date.now() - startTimeRef.current));
    }, 16);
  }, []);

  const pause = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    accumulatedRef.current += Date.now() - startTimeRef.current;
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    accumulatedRef.current = 0;
    lastLapTimeRef.current = 0;
    setElapsed(0);
    setIsRunning(false);
    setLaps([]);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const recordLap = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentTime = accumulatedRef.current + (Date.now() - startTimeRef.current);
    const diff = currentTime - lastLapTimeRef.current;
    lastLapTimeRef.current = currentTime;
    setLaps((prev) => [
      {
        id: Date.now().toString(),
        number: prev.length + 1,
        time: currentTime,
        diff,
      },
      ...prev,
    ]);
  }, []);

  const renderLap = useCallback(({ item, index }: { item: LapData; index: number }) => {
    const totalLaps = laps.length;
    let best = false;
    let worst = false;
    if (totalLaps >= 3) {
      const diffs = laps.map((l) => l.diff);
      const minDiff = Math.min(...diffs);
      const maxDiff = Math.max(...diffs);
      if (item.diff === minDiff) best = true;
      if (item.diff === maxDiff) worst = true;
    }

    return (
      <View style={styles.lapRow}>
        <View style={styles.lapLeft}>
          <Text style={[styles.lapNumber, best && styles.lapBest, worst && styles.lapWorst]}>
            Lap {item.number}
          </Text>
        </View>
        <Text style={[styles.lapDiff, best && styles.lapBest, worst && styles.lapWorst]}>
          {formatLapDiff(item.diff)}
        </Text>
        <Text style={[styles.lapTime, best && styles.lapBest, worst && styles.lapWorst]}>
          {formatTime(item.time)}
        </Text>
      </View>
    );
  }, [laps]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[Colors.background, "#0A0E14", Colors.background]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.content,
          { paddingTop: (insets.top || webTopInset) + 24 },
        ]}
      >
        <View style={styles.displaySection}>
          <Text style={styles.timeDisplay} testID="stopwatch-display">
            {formatTime(elapsed)}
          </Text>
        </View>

        <View style={styles.controlsRow}>
          {!isRunning && elapsed === 0 ? (
            <Pressable
              onPress={start}
              style={({ pressed }) => [styles.mainButton, styles.startButton, pressed && styles.buttonPressed]}
              testID="stopwatch-start"
            >
              <Ionicons name="play" size={32} color={Colors.background} style={{ marginLeft: 3 }} />
            </Pressable>
          ) : isRunning ? (
            <>
              <Pressable
                onPress={recordLap}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                testID="stopwatch-lap"
                accessibilityLabel="Lap"
                accessibilityRole="button"
              >
                <Ionicons name="flag" size={22} color={Colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={pause}
                style={({ pressed }) => [styles.mainButton, styles.pauseButton, pressed && styles.buttonPressed]}
                testID="stopwatch-pause"
                accessibilityLabel="Pause"
                accessibilityRole="button"
              >
                <Ionicons name="pause" size={32} color={Colors.background} />
              </Pressable>
              <View style={styles.secondaryPlaceholder} />
            </>
          ) : (
            <>
              <Pressable
                onPress={reset}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                testID="stopwatch-reset"
              >
                <Ionicons name="refresh" size={22} color={Colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={start}
                style={({ pressed }) => [styles.mainButton, styles.startButton, pressed && styles.buttonPressed]}
                testID="stopwatch-resume"
              >
                <Ionicons name="play" size={32} color={Colors.background} style={{ marginLeft: 3 }} />
              </Pressable>
              <View style={styles.secondaryPlaceholder} />
            </>
          )}
        </View>

        <View style={styles.lapsSection}>
          {laps.length > 0 && (
            <FlatList
              data={laps}
              renderItem={renderLap}
              keyExtractor={(item) => item.id}
              style={styles.lapsList}
              showsVerticalScrollIndicator={false}
              scrollEnabled={laps.length > 0}
            />
          )}
          {laps.length === 0 && elapsed > 0 && (
            <Text style={styles.lapsHint}>Tap flag to record lap</Text>
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
  },
  displaySection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  timeDisplay: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 56,
    color: Colors.text,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
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
  pauseButton: {
    backgroundColor: Colors.danger,
    boxShadow: `0px 4px 12px ${Colors.danger}4D`,
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryPlaceholder: {
    width: 48,
    height: 48,
  },
  buttonPressed: {
    transform: [{ scale: 0.93 }],
  },
  lapsSection: {
    flex: 1,
    marginTop: 16,
  },
  lapsList: {
    flex: 1,
  },
  lapRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  lapLeft: {
    flex: 1,
  },
  lapNumber: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  lapDiff: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textTertiary,
    marginRight: 16,
    minWidth: 80,
    textAlign: "right",
  },
  lapTime: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    minWidth: 90,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  lapBest: {
    color: Colors.success,
  },
  lapWorst: {
    color: Colors.danger,
  },
  lapsHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: "center",
    marginTop: 24,
    opacity: 0.5,
  },
});

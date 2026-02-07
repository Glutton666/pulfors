import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
  ScrollView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  useSharedValue,
} from "react-native-reanimated";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { highClickUri, lowClickUri } from "@/lib/metronome-engine";
import { useMetronome } from "@/lib/metronome-context";
import { TIME_SIGNATURES, BEAT_SUBDIVISIONS } from "@/lib/storage";
import { Pendulum } from "@/components/Pendulum";
import { BeatIndicator } from "@/components/BeatIndicator";
import { GaugeBpm } from "@/components/GaugeBpm";
import { SwipeSelector } from "@/components/SwipeSelector";
import { TimerStopwatch } from "@/components/TimerStopwatch";

export default function MetronomeScreen() {
  const insets = useSafeAreaInsets();
  const {
    settings, presets, isPlaying, currentBeat, bpm, isLoaded,
    stopwatchMs, isStopwatchRunning,
    timerMs, timerTargetMs, isTimerRunning, isTimerSet,
    setBpm, adjustBpm, togglePlay,
    setTimeSignatureIndex, setTempoPresetIndex, setBeatSubdivision,
    startStopwatch, stopStopwatch, resetStopwatch,
    setTimerTarget, startTimer, stopTimer, resetTimer,
    engineRef,
  } = useMetronome();

  const [timerMode, setTimerMode] = useState<"stopwatch" | "timer">("stopwatch");
  const lastTapTime = useRef(0);

  const highPlayer = useAudioPlayer(highClickUri);
  const lowPlayer = useAudioPlayer(lowClickUri);

  const flashOpacity = useSharedValue(0);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setAudioCallbacks(
      () => { try { highPlayer.seekTo(0); highPlayer.play(); } catch (e) { /* silent */ } },
      () => { try { lowPlayer.seekTo(0); lowPlayer.play(); } catch (e) { /* silent */ } }
    );
  }, [highPlayer, lowPlayer, engineRef]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.addOnBeat((beat, isAccent) => {
      if (isAccent) {
        flashOpacity.value = withSequence(
          withTiming(0.08, { duration: 40 }),
          withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) })
        );
      }
    });
  }, [flashOpacity, engineRef]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const handleBpmAdjust = useCallback((delta: number) => {
    const now = Date.now();
    const withinWindow = now - lastTapTime.current < settings.rapidTapWindowMs;
    lastTapTime.current = now;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    adjustBpm(withinWindow ? delta * 10 : delta);
  }, [adjustBpm, settings.rapidTapWindowMs]);

  const tapTimesRef = useRef<number[]>([]);

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const taps = tapTimesRef.current;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (taps.length > 0 && now - taps[taps.length - 1] > 2500) {
      tapTimesRef.current = [];
    }
    taps.push(now);
    if (taps.length > 8) taps.shift();
    if (taps.length >= 2) {
      let total = 0;
      for (let i = 1; i < taps.length; i++) total += taps[i] - taps[i - 1];
      const avg = total / (taps.length - 1);
      setBpm(Math.round(60000 / avg));
    }
    tapTimesRef.current = taps;
  }, [setBpm]);

  const getTempoLabel = useCallback((b: number) => {
    for (const p of presets) {
      if (b >= p.min && b < p.max) return p.label;
    }
    return b >= 240 ? "Prestissimo" : "Grave";
  }, [presets]);

  const tsItems = TIME_SIGNATURES.map(ts => ({ label: ts.label, value: ts.label }));
  const presetItems = presets.map(p => ({ label: p.label, value: p.label }));
  const beatItems = BEAT_SUBDIVISIONS.map(b => ({
    label: `${b.value} ${b.value === 1 ? "Beat" : "Beats"}`,
    value: b.value,
  }));

  const currentBeatSubIdx = BEAT_SUBDIVISIONS.findIndex(b => b.value === settings.beatSubdivision);
  const ts = TIME_SIGNATURES[settings.timeSignatureIndex];

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  if (!isLoaded) {
    return <View style={[styles.screen, { backgroundColor: Colors.background }]} />;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#0D1117", "#0A0E14", "#0D1117"]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: Colors.accent, pointerEvents: "none" as const },
          flashStyle,
        ]}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: (insets.top || webTopInset) + 8,
            paddingBottom: (insets.bottom || webBottomInset) + 20,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          >
            <Feather name="settings" size={20} color={Colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={handleTapTempo}
            style={({ pressed }) => [styles.tapBtn, pressed && styles.tapBtnPressed]}
          >
            <Feather name="activity" size={16} color={Colors.textSecondary} />
            <Text style={styles.tapText}>TAP</Text>
          </Pressable>
        </View>

        {settings.theme === "analog" ? (
          <View style={styles.pendulumWrap}>
            <Pendulum isPlaying={isPlaying} bpm={bpm} />
          </View>
        ) : null}

        <GaugeBpm
          bpm={bpm}
          onBpmChange={setBpm}
          isPlaying={isPlaying}
          tempoLabel={getTempoLabel(bpm)}
        />

        <View style={styles.bpmButtons}>
          <Pressable
            onPress={() => handleBpmAdjust(-1)}
            style={({ pressed }) => [styles.bpmAdjBtn, pressed && styles.bpmAdjBtnPressed]}
          >
            <Feather name="minus" size={22} color={Colors.text} />
          </Pressable>
          <Pressable
            onPress={() => handleBpmAdjust(1)}
            style={({ pressed }) => [styles.bpmAdjBtn, pressed && styles.bpmAdjBtnPressed]}
          >
            <Feather name="plus" size={22} color={Colors.text} />
          </Pressable>
        </View>

        <BeatIndicator
          beatsPerMeasure={ts?.beats || 4}
          currentBeat={currentBeat}
          isPlaying={isPlaying}
          beatLightMode={settings.beatLightMode}
        />

        <View style={styles.selectorsSection}>
          <View style={styles.selectorBlock}>
            <Text style={styles.selectorLabel}>Tempo</Text>
            <SwipeSelector
              items={presetItems}
              selectedIndex={settings.tempoPresetIndex}
              onSelect={setTempoPresetIndex}
              itemWidth={110}
              labelStyle="large"
            />
          </View>

          <View style={styles.selectorRow}>
            <View style={[styles.selectorBlock, { flex: 1 }]}>
              <Text style={styles.selectorLabel}>Time Sig.</Text>
              <SwipeSelector
                items={tsItems}
                selectedIndex={settings.timeSignatureIndex}
                onSelect={setTimeSignatureIndex}
                itemWidth={70}
              />
            </View>
            <View style={[styles.selectorBlock, { flex: 1 }]}>
              <Text style={styles.selectorLabel}>Subdivision</Text>
              <SwipeSelector
                items={beatItems}
                selectedIndex={currentBeatSubIdx >= 0 ? currentBeatSubIdx : 0}
                onSelect={(idx) => setBeatSubdivision(BEAT_SUBDIVISIONS[idx].value)}
                itemWidth={90}
              />
            </View>
          </View>
        </View>

        <View style={styles.timerSection}>
          <TimerStopwatch
            mode={timerMode}
            stopwatchMs={stopwatchMs}
            isStopwatchRunning={isStopwatchRunning}
            timerMs={timerMs}
            timerTargetMs={timerTargetMs}
            isTimerRunning={isTimerRunning}
            isTimerSet={isTimerSet}
            onStartStopwatch={startStopwatch}
            onStopStopwatch={stopStopwatch}
            onResetStopwatch={resetStopwatch}
            onSetTimerTarget={setTimerTarget}
            onStartTimer={startTimer}
            onStopTimer={stopTimer}
            onResetTimer={resetTimer}
            onModeChange={setTimerMode}
          />
        </View>

        <View style={styles.playSection}>
          <Pressable
            onPress={togglePlay}
            style={({ pressed }) => [
              styles.playBtn,
              isPlaying && styles.playBtnActive,
              pressed && styles.playBtnPressed,
            ]}
          >
            <Ionicons
              name={isPlaying ? "stop" : "play"}
              size={32}
              color={Colors.background}
              style={!isPlaying ? { marginLeft: 3 } : undefined}
            />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 12,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tapBtnPressed: {
    backgroundColor: Colors.surfaceLight,
  },
  tapText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 2,
  },
  pendulumWrap: {
    alignItems: "center",
    marginBottom: -8,
  },
  bpmButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  bpmAdjBtn: {
    width: 52,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bpmAdjBtnPressed: {
    backgroundColor: Colors.surfaceLight,
    transform: [{ scale: 0.95 }],
  },
  selectorsSection: {
    gap: 12,
  },
  selectorBlock: {
    gap: 4,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 12,
  },
  selectorLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    textAlign: "center",
  },
  timerSection: {
    paddingTop: 4,
  },
  playSection: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 8,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0px 4px 16px ${Colors.accent}4D`,
  },
  playBtnActive: {
    backgroundColor: Colors.danger,
    boxShadow: `0px 4px 16px ${Colors.danger}4D`,
  },
  playBtnPressed: {
    transform: [{ scale: 0.92 }],
  },
});

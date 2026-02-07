import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
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
import Colors from "@/constants/colors";
import { MetronomeEngine, highClickUri, lowClickUri } from "@/lib/metronome-engine";
import { loadSettings, saveSettings } from "@/lib/storage";
import { Pendulum } from "@/components/Pendulum";
import { BeatIndicator } from "@/components/BeatIndicator";
import { BpmSlider } from "@/components/BpmSlider";

const TEMPO_PRESETS = [
  { label: "Largo", min: 40, max: 60, bpm: 50 },
  { label: "Adagio", min: 60, max: 80, bpm: 70 },
  { label: "Andante", min: 80, max: 100, bpm: 90 },
  { label: "Moderato", min: 100, max: 120, bpm: 110 },
  { label: "Allegro", min: 120, max: 160, bpm: 140 },
  { label: "Vivace", min: 160, max: 200, bpm: 176 },
  { label: "Presto", min: 200, max: 300, bpm: 208 },
];

const TIME_SIGNATURES = [
  { beats: 2, label: "2/4" },
  { beats: 3, label: "3/4" },
  { beats: 4, label: "4/4" },
  { beats: 6, label: "6/8" },
];

function getTempoLabel(bpm: number): string {
  for (const preset of TEMPO_PRESETS) {
    if (bpm >= preset.min && bpm < preset.max) {
      return preset.label;
    }
  }
  if (bpm >= 300) return "Prestissimo";
  if (bpm < 40) return "Grave";
  return "Presto";
}

export default function MetronomeScreen() {
  const insets = useSafeAreaInsets();
  const [bpm, setBpm] = useState(120);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [isLoaded, setIsLoaded] = useState(false);

  const engineRef = useRef<MetronomeEngine | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  const highPlayer = useAudioPlayer(highClickUri);
  const lowPlayer = useAudioPlayer(lowClickUri);

  const flashOpacity = useSharedValue(0);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  useEffect(() => {
    const engine = new MetronomeEngine();
    engineRef.current = engine;

    engine.setAudioCallbacks(
      () => {
        try {
          highPlayer.seekTo(0);
          highPlayer.play();
        } catch (e) { /* silent */ }
      },
      () => {
        try {
          lowPlayer.seekTo(0);
          lowPlayer.play();
        } catch (e) { /* silent */ }
      }
    );

    loadSettings().then((settings) => {
      setBpm(settings.bpm);
      setBeatsPerMeasure(settings.beatsPerMeasure);
      engine.setBpm(settings.bpm);
      engine.setBeatsPerMeasure(settings.beatsPerMeasure);
      setIsLoaded(true);
    });

    return () => {
      engine.cleanup();
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.setOnBeat((beat: number, isAccent: boolean) => {
      setCurrentBeat(beat);
      if (isAccent) {
        flashOpacity.value = withSequence(
          withTiming(0.12, { duration: 50 }),
          withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) })
        );
      }
    });
  }, [flashOpacity]);

  const updateBpm = useCallback(
    (newBpm: number) => {
      const clampedBpm = Math.max(20, Math.min(300, newBpm));
      setBpm(clampedBpm);
      engineRef.current?.setBpm(clampedBpm);
      saveSettings({ bpm: clampedBpm, beatsPerMeasure, subdivisions: 1 });
    },
    [beatsPerMeasure]
  );

  const updateTimeSignature = useCallback(
    (beats: number) => {
      setBeatsPerMeasure(beats);
      engineRef.current?.setBeatsPerMeasure(beats);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      saveSettings({ bpm, beatsPerMeasure: beats, subdivisions: 1 });
    },
    [bpm]
  );

  const togglePlayPause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (isPlaying) {
      engine.stop();
      setIsPlaying(false);
      setCurrentBeat(-1);
    } else {
      engine.start();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const taps = tapTimesRef.current;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (taps.length > 0 && now - taps[taps.length - 1] > 2500) {
      tapTimesRef.current = [];
    }

    taps.push(now);

    if (taps.length > 8) {
      taps.shift();
    }

    if (taps.length >= 2) {
      let totalInterval = 0;
      for (let i = 1; i < taps.length; i++) {
        totalInterval += taps[i] - taps[i - 1];
      }
      const avgInterval = totalInterval / (taps.length - 1);
      const detectedBpm = Math.round(60000 / avgInterval);
      updateBpm(detectedBpm);
    }

    tapTimesRef.current = taps;
  }, [updateBpm]);

  const tempoLabel = getTempoLabel(bpm);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  if (!isLoaded) {
    return (
      <View style={[styles.screen, { backgroundColor: Colors.background }]} />
    );
  }

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
          {
            paddingTop: (insets.top || webTopInset) + 16,
            paddingBottom: (insets.bottom || webBottomInset) + 16,
          },
        ]}
      >
        <View style={styles.topSection}>
          <Pressable
            onPress={handleTapTempo}
            style={({ pressed }) => [
              styles.tapButton,
              pressed && styles.tapButtonPressed,
            ]}
            testID="tap-tempo-button"
          >
            <Feather name="activity" size={18} color={Colors.textSecondary} />
            <Text style={styles.tapText}>TAP</Text>
          </Pressable>
        </View>

        <View style={styles.pendulumSection}>
          <Pendulum isPlaying={isPlaying} bpm={bpm} />
        </View>

        <View style={styles.bpmSection}>
          <Text style={styles.tempoLabel}>{tempoLabel}</Text>
          <BpmSlider bpm={bpm} onBpmChange={updateBpm} />
        </View>

        <BeatIndicator
          beatsPerMeasure={beatsPerMeasure}
          currentBeat={currentBeat}
          isPlaying={isPlaying}
        />

        <View style={styles.timeSignatureSection}>
          <Text style={styles.sectionLabel}>Time Signature</Text>
          <View style={styles.timeSignatureRow}>
            {TIME_SIGNATURES.map((ts) => (
              <Pressable
                key={ts.label}
                onPress={() => updateTimeSignature(ts.beats)}
                style={[
                  styles.tsButton,
                  beatsPerMeasure === ts.beats && styles.tsButtonActive,
                ]}
                testID={`ts-${ts.label}`}
              >
                <Text
                  style={[
                    styles.tsText,
                    beatsPerMeasure === ts.beats && styles.tsTextActive,
                  ]}
                >
                  {ts.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.presetsSection}>
          <Text style={styles.sectionLabel}>Tempo</Text>
          <View style={styles.presetsRow}>
            {TEMPO_PRESETS.map((preset) => {
              const isActive = bpm >= preset.min && bpm < preset.max;
              return (
                <Pressable
                  key={preset.label}
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.selectionAsync();
                    }
                    updateBpm(preset.bpm);
                  }}
                  style={[
                    styles.presetChip,
                    isActive && styles.presetChipActive,
                  ]}
                  testID={`preset-${preset.label}`}
                >
                  <Text
                    style={[
                      styles.presetText,
                      isActive && styles.presetTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.playSection}>
          <Pressable
            onPress={togglePlayPause}
            style={({ pressed }) => [
              styles.playButton,
              isPlaying && styles.playButtonActive,
              pressed && styles.playButtonPressed,
            ]}
            testID="play-button"
          >
            <Ionicons
              name={isPlaying ? "stop" : "play"}
              size={36}
              color={isPlaying ? Colors.background : Colors.background}
              style={!isPlaying ? { marginLeft: 4 } : undefined}
            />
          </Pressable>
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
  },
  topSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  tapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tapButtonPressed: {
    backgroundColor: Colors.surfaceLight,
  },
  tapText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 2,
  },
  pendulumSection: {
    alignItems: "center",
    justifyContent: "center",
  },
  bpmSection: {
    alignItems: "center",
    gap: 4,
  },
  tempoLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.accentMuted,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  sectionLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textTertiary,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 10,
    textAlign: "center",
  },
  timeSignatureSection: {
    alignItems: "center",
  },
  timeSignatureRow: {
    flexDirection: "row",
    gap: 10,
  },
  tsButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tsButtonActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  tsText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  tsTextActive: {
    color: Colors.accent,
  },
  presetsSection: {
    alignItems: "center",
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "transparent",
  },
  presetChipActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accentMuted,
  },
  presetText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textTertiary,
  },
  presetTextActive: {
    color: Colors.accent,
  },
  playSection: {
    alignItems: "center",
    paddingBottom: 8,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0px 4px 12px ${Colors.accent}4D`,
  },
  playButtonActive: {
    backgroundColor: Colors.danger,
    boxShadow: `0px 4px 12px ${Colors.danger}4D`,
  },
  playButtonPressed: {
    transform: [{ scale: 0.93 }],
  },
});

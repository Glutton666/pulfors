import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import {
  MetronomeEngine,
  highClickSource,
  lowClickSource,
} from "@/lib/metronome-engine";
import type { BeatType } from "@/lib/metronome-engine";
import { loadSettings, saveSettings } from "@/lib/storage";
import {
  BeatIndicator,
  DIAL_SIZE,
  DOT_RADIUS_FROM_CENTER,
} from "@/components/BeatIndicator";
import { BpmSlider } from "@/components/BpmSlider";
import { SubdivisionBar, DragGhost } from "@/components/SubdivisionBar";
import { StopwatchTimer } from "@/components/StopwatchTimer";

function getTempoLabel(bpm: number): string {
  if (bpm < 40) return "Grave";
  if (bpm < 60) return "Largo";
  if (bpm < 80) return "Adagio";
  if (bpm < 100) return "Andante";
  if (bpm < 120) return "Moderato";
  if (bpm < 160) return "Allegro";
  if (bpm < 200) return "Vivace";
  if (bpm < 300) return "Presto";
  return "Prestissimo";
}

function defaultBeatTypes(beats: number): BeatType[] {
  return Array.from({ length: beats }, (_, i) =>
    i === 0 ? "accent" : "normal"
  );
}

export default function MetronomeScreen() {
  const insets = useSafeAreaInsets();
  const [bpm, setBpm] = useState(120);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [beatTypes, setBeatTypes] = useState<BeatType[]>(defaultBeatTypes(4));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [subdivisionPattern, setSubdivisionPattern] = useState<BeatType[]>([
    "accent",
  ]);
  const [beatSubdivisions, setBeatSubdivisions] = useState<
    Record<string, BeatType[]>
  >({});
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dropTargetBeat, setDropTargetBeat] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const engineRef = useRef<MetronomeEngine | null>(null);
  const tapTimesRef = useRef<number[]>([]);
  const dialRef = useRef<View>(null);
  const dialCenterRef = useRef({ x: 0, y: 0 });

  const highPlayer = useAudioPlayer(highClickSource);
  const lowPlayer = useAudioPlayer(lowClickSource);

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
        } catch (e) {}
      },
      () => {
        try {
          lowPlayer.seekTo(0);
          lowPlayer.play();
        } catch (e) {}
      }
    );

    loadSettings().then((settings) => {
      setBpm(settings.bpm);
      setBeatsPerMeasure(settings.beatsPerMeasure);
      engine.setBpm(settings.bpm);
      engine.setBeatsPerMeasure(settings.beatsPerMeasure);

      if (settings.subdivisionPattern && settings.subdivisionPattern.length > 0) {
        setSubdivisionPattern(settings.subdivisionPattern);
      }
      if (settings.beatSubdivisions) {
        setBeatSubdivisions(settings.beatSubdivisions);
        engine.setAllBeatSubdivisions(settings.beatSubdivisions);
      }

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

  const persistSettings = useCallback(
    (overrides: Partial<{
      bpm: number;
      beatsPerMeasure: number;
      subdivisionPattern: BeatType[];
      beatSubdivisions: Record<string, BeatType[]>;
    }> = {}) => {
      const current = {
        bpm,
        beatsPerMeasure,
        subdivisions: 1,
        subdivisionPattern,
        beatSubdivisions,
        ...overrides,
      };
      saveSettings(current);
    },
    [bpm, beatsPerMeasure, subdivisionPattern, beatSubdivisions]
  );

  const updateBpm = useCallback(
    (newBpm: number) => {
      const clampedBpm = Math.max(20, Math.min(300, newBpm));
      setBpm(clampedBpm);
      engineRef.current?.setBpm(clampedBpm);
      persistSettings({ bpm: clampedBpm });
    },
    [persistSettings]
  );

  const updateTimeSignature = useCallback(
    (beats: number) => {
      const newTypes = defaultBeatTypes(beats);
      setBeatsPerMeasure(beats);
      setBeatTypes(newTypes);
      engineRef.current?.setBeatsPerMeasure(beats);
      engineRef.current?.setBeatTypes(newTypes);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const cleaned: Record<string, BeatType[]> = {};
      for (const [k, v] of Object.entries(beatSubdivisions)) {
        if (Number(k) < beats) cleaned[k] = v;
      }
      setBeatSubdivisions(cleaned);
      persistSettings({ beatsPerMeasure: beats, beatSubdivisions: cleaned });
    },
    [persistSettings, beatSubdivisions]
  );

  const handleBeatTypeChange = useCallback(
    (index: number, type: BeatType) => {
      setBeatTypes((prev) => {
        const next = [...prev];
        next[index] = type;
        engineRef.current?.setBeatTypes(next);
        return next;
      });
    },
    []
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

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setOnMeasureComplete(() => {
      if (!engine.getIsRunning()) {
        setIsPlaying(false);
        setCurrentBeat(-1);
      }
    });
  }, []);

  const handleTimerExpired = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.requestStopAfterMeasure();
  }, []);

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

  const handlePatternChange = useCallback(
    (pattern: BeatType[]) => {
      setSubdivisionPattern(pattern);
      persistSettings({ subdivisionPattern: pattern });
    },
    [persistSettings]
  );

  const measureDialCenter = useCallback(() => {
    if (!dialRef.current) return;
    if (Platform.OS === "web") {
      const el = dialRef.current as unknown as HTMLElement;
      if (el?.getBoundingClientRect) {
        const rect = el.getBoundingClientRect();
        dialCenterRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    } else {
      (dialRef.current as any)?.measure?.(
        (
          _x: number,
          _y: number,
          w: number,
          h: number,
          pageX: number,
          pageY: number
        ) => {
          dialCenterRef.current = { x: pageX + w / 2, y: pageY + h / 2 };
        }
      );
    }
  }, []);

  const findClosestBeat = useCallback(
    (pageX: number, pageY: number): number | null => {
      const center = dialCenterRef.current;
      if (center.x === 0 && center.y === 0) return null;

      const dialRadius = DIAL_SIZE / 2;
      let closestBeat: number | null = null;
      let closestDist = Infinity;

      for (let i = 0; i < beatsPerMeasure; i++) {
        const angle = (i / beatsPerMeasure) * 2 * Math.PI - Math.PI / 2;
        const dotX = center.x + DOT_RADIUS_FROM_CENTER * Math.cos(angle);
        const dotY = center.y + DOT_RADIUS_FROM_CENTER * Math.sin(angle);

        const dist = Math.sqrt((pageX - dotX) ** 2 + (pageY - dotY) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          closestBeat = i;
        }
      }

      if (closestDist < 40) return closestBeat;
      return null;
    },
    [beatsPerMeasure]
  );

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    measureDialCenter();
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [measureDialCenter]);

  const handleDragMove = useCallback(
    (pageX: number, pageY: number) => {
      setDragPos({ x: pageX, y: pageY });
      const target = findClosestBeat(pageX, pageY);
      setDropTargetBeat(target);
    },
    [findClosestBeat]
  );

  const handleDragEnd = useCallback(
    (pageX: number, pageY: number) => {
      const target = findClosestBeat(pageX, pageY);
      setIsDragging(false);
      setDropTargetBeat(null);

      if (target !== null && subdivisionPattern.length > 1) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        const newSubs = { ...beatSubdivisions };
        newSubs[String(target)] = [...subdivisionPattern];
        setBeatSubdivisions(newSubs);
        engineRef.current?.setBeatSubdivision(target, subdivisionPattern);
        persistSettings({ beatSubdivisions: newSubs });
      } else if (target !== null && subdivisionPattern.length <= 1) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        const newSubs = { ...beatSubdivisions };
        delete newSubs[String(target)];
        setBeatSubdivisions(newSubs);
        engineRef.current?.setBeatSubdivision(target, null);
        persistSettings({ beatSubdivisions: newSubs });
      }
    },
    [findClosestBeat, subdivisionPattern, beatSubdivisions, persistSettings]
  );

  const beatSubdivisionCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const [k, v] of Object.entries(beatSubdivisions)) {
      counts[Number(k)] = v.length;
    }
    return counts;
  }, [beatSubdivisions]);

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
          {
            backgroundColor: Colors.accent,
            pointerEvents: "none" as const,
          },
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
          <BeatIndicator
            beatsPerMeasure={beatsPerMeasure}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            onBeatsChange={updateTimeSignature}
            onTogglePlay={togglePlayPause}
            beatTypes={beatTypes}
            onBeatTypeChange={handleBeatTypeChange}
            dropTargetBeat={dropTargetBeat}
            beatSubdivisionCounts={beatSubdivisionCounts}
            dialRef={dialRef}
          />
        </View>

        <View style={styles.bpmSection}>
          <SubdivisionBar
            pattern={subdivisionPattern}
            onPatternChange={handlePatternChange}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
          <Text style={styles.tempoLabel}>{tempoLabel}</Text>
          <BpmSlider
            bpm={bpm}
            onBpmChange={updateBpm}
            onTapTempo={handleTapTempo}
          />
        </View>
      </View>

      <StopwatchTimer
        onTimerExpired={handleTimerExpired}
        isMetronomePlaying={isPlaying}
        topInset={insets.top || webTopInset}
      />

      {isDragging && (
        <DragGhost
          pattern={subdivisionPattern}
          x={dragPos.x}
          y={dragPos.y}
        />
      )}
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
  topSection: {
    flex: 2,
    justifyContent: "center",
    alignItems: "center",
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
});

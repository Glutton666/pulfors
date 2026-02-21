import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
  TextInput,
  PanResponder,
  ScrollView,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAudioPlayer } from "expo-audio";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import {
  WaveType,
  SignalGeneratorEngine,
  generateToneDataUri,
} from "@/lib/signal-generator-engine";

const WAVE_OPTIONS: { type: WaveType; label: string; icon: string }[] = [
  { type: "sine", label: "Sine", icon: "sine-wave" },
  { type: "square", label: "Square", icon: "square-wave" },
  { type: "triangle", label: "Triangle", icon: "triangle-wave" },
  { type: "sawtooth", label: "Saw", icon: "sawtooth-wave" },
];

const NOTE_FREQS: { name: string; freq: number }[] = [
  { name: "A2", freq: 110 },
  { name: "E3", freq: 164.81 },
  { name: "A3", freq: 220 },
  { name: "E4", freq: 329.63 },
  { name: "A4", freq: 440 },
  { name: "A5", freq: 880 },
  { name: "1k", freq: 1000 },
];

const KNOB_SIZE = 100;
const KNOB_RADIUS = KNOB_SIZE / 2;
const KNOB_STROKE = 6;
const ARC_START = 135;
const ARC_END = 405;
const ARC_RANGE = ARC_END - ARC_START;
const INDICATOR_RADIUS = KNOB_RADIUS - 14;

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const MIN_DB = -60;
const MAX_DB = 0;

function freqToNorm(freq: number): number {
  const logMin = Math.log10(MIN_FREQ);
  const logMax = Math.log10(MAX_FREQ);
  return (Math.log10(freq) - logMin) / (logMax - logMin);
}

function normToFreq(norm: number): number {
  const logMin = Math.log10(MIN_FREQ);
  const logMax = Math.log10(MAX_FREQ);
  return Math.pow(10, logMin + norm * (logMax - logMin));
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function polarToXY(angleDeg: number, r: number, cx: number, cy: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToXY(endAngle, r, cx, cy);
  const end = polarToXY(startAngle, r, cx, cy);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

interface KnobProps {
  value: number;
  onChange: (v: number) => void;
  label: string;
  displayValue: string;
  displayUnit: string;
  accentColor: string;
  accentDim: string;
}

function Knob({ value, onChange, label, displayValue, displayUnit, accentColor, accentDim }: KnobProps) {
  const knobRef = useRef<View>(null);
  const layoutRef = useRef({ cx: 0, cy: 0 });
  const valRef = useRef(value);
  valRef.current = value;

  const haptic = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        knobRef.current?.measureInWindow((x, y, w, h) => {
          layoutRef.current = { cx: x + w / 2, cy: y + h / 2 };
        });
        haptic();
      },
      onPanResponderMove: (_, gs) => {
        const sensitivity = 0.005;
        const delta = -gs.dy * sensitivity;
        const next = Math.max(0, Math.min(1, valRef.current + delta));
        if (Math.abs(next - valRef.current) > 0.001) {
          onChange(next);
        }
      },
    }), [onChange, haptic]);

  const angle = ARC_START + value * ARC_RANGE;
  const indicator = polarToXY(angle, INDICATOR_RADIUS, KNOB_RADIUS, KNOB_RADIUS);
  const trackR = KNOB_RADIUS - KNOB_STROKE / 2 - 4;

  return (
    <View style={styles.knobContainer}>
      <Text style={styles.knobLabel}>{label}</Text>
      <View
        ref={knobRef}
        {...panResponder.panHandlers}
        style={styles.knobOuter}
      >
        <View style={[styles.knobBg, { borderColor: accentDim }]}>
          <View style={[styles.knobIndicatorDot, { backgroundColor: accentColor, left: indicator.x - 5, top: indicator.y - 5 }]} />
        </View>
        <View style={styles.knobCenter} pointerEvents="none">
          <Text style={[styles.knobValue, { color: accentColor }]}>{displayValue}</Text>
          <Text style={styles.knobUnit}>{displayUnit}</Text>
        </View>
      </View>
    </View>
  );
}

interface SignalGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SignalGeneratorModal({ visible, onClose }: SignalGeneratorModalProps) {
  const { colors: C } = useTheme();
  const [frequency, setFrequency] = useState(440);
  const [volumeDb, setVolumeDb] = useState(-10);
  const [waveType, setWaveType] = useState<WaveType>("sine");
  const [isPlaying, setIsPlaying] = useState(false);
  const [editingFreq, setEditingFreq] = useState(false);
  const [freqInput, setFreqInput] = useState("440");

  const engineRef = useRef(new SignalGeneratorEngine());
  const isPlayingRef = useRef(false);
  const mobileLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const volumeLinear = dbToLinear(volumeDb);

  const toneUri = useMemo(() => {
    if (Platform.OS === "web") return null;
    return generateToneDataUri(frequency, waveType, volumeLinear);
  }, [frequency, waveType, volumeLinear]);

  const mobilePlayer = useAudioPlayer(toneUri ?? undefined);

  const hapticFeedback = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    if (Platform.OS === "web") {
      engineRef.current.stopWeb();
    } else {
      if (mobileLoopRef.current) {
        clearTimeout(mobileLoopRef.current);
        mobileLoopRef.current = null;
      }
      try { mobilePlayer.pause(); } catch {}
    }
    setIsPlaying(false);
  }, [mobilePlayer]);

  const startPlayback = useCallback(() => {
    isPlayingRef.current = true;
    if (Platform.OS === "web") {
      engineRef.current.startWeb(frequency, waveType, volumeLinear);
    } else {
      const playLoop = () => {
        if (!isPlayingRef.current) return;
        try {
          mobilePlayer.seekTo(0);
          mobilePlayer.play();
        } catch {}
        mobileLoopRef.current = setTimeout(playLoop, 950);
      };
      playLoop();
    }
    setIsPlaying(true);
  }, [frequency, waveType, volumeLinear, mobilePlayer]);

  useEffect(() => {
    if (isPlaying && Platform.OS === "web") {
      engineRef.current.updateFrequency(frequency);
    }
  }, [frequency, isPlaying]);

  useEffect(() => {
    if (isPlaying && Platform.OS === "web") {
      engineRef.current.updateWaveType(waveType);
    }
  }, [waveType, isPlaying]);

  useEffect(() => {
    if (isPlaying && Platform.OS === "web") {
      engineRef.current.updateVolume(volumeLinear);
    }
  }, [volumeLinear, isPlaying]);

  useEffect(() => {
    if (isPlaying && Platform.OS !== "web") {
      stopPlayback();
      setTimeout(() => startPlayback(), 50);
    }
  }, [frequency, waveType, volumeLinear]);

  useEffect(() => {
    return () => {
      engineRef.current.stopWeb();
      if (mobileLoopRef.current) clearTimeout(mobileLoopRef.current);
    };
  }, []);

  const handleClose = useCallback(() => {
    stopPlayback();
    onClose();
  }, [stopPlayback, onClose]);

  const handleFreqKnob = useCallback((norm: number) => {
    const f = normToFreq(norm);
    setFrequency(Math.round(f * 10) / 10);
  }, []);

  const handleVolKnob = useCallback((norm: number) => {
    const db = MIN_DB + norm * (MAX_DB - MIN_DB);
    setVolumeDb(Math.round(db));
  }, []);

  const freqNorm = freqToNorm(frequency);
  const volNorm = (volumeDb - MIN_DB) / (MAX_DB - MIN_DB);

  const formatFreqDisplay = (f: number) => {
    if (f >= 1000) return (f / 1000).toFixed(f >= 10000 ? 1 : 2);
    return f >= 100 ? Math.round(f).toString() : f.toFixed(1);
  };

  const freqDisplayUnit = frequency >= 1000 ? "kHz" : "Hz";

  const commitFreqInput = useCallback(() => {
    setEditingFreq(false);
    const val = parseFloat(freqInput);
    if (!isNaN(val) && val >= MIN_FREQ && val <= MAX_FREQ) {
      setFrequency(Math.round(val * 10) / 10);
    }
  }, [freqInput]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <MaterialCommunityIcons name="waveform" size={20} color={C.accent} />
            <Text style={[styles.title, { color: C.accent }]}>Signal Generator</Text>
            <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={styles.knobsRow}>
            <Knob
              value={freqNorm}
              onChange={handleFreqKnob}
              label="FREQUENCY"
              displayValue={formatFreqDisplay(frequency)}
              displayUnit={freqDisplayUnit}
              accentColor={C.accent}
              accentDim={C.accentDim}
            />
            <Knob
              value={volNorm}
              onChange={handleVolKnob}
              label="VOLUME"
              displayValue={`${volumeDb}`}
              displayUnit="dB"
              accentColor={C.accent}
              accentDim={C.accentDim}
            />
          </View>

          {editingFreq ? (
            <View style={styles.freqEditRow}>
              <TextInput
                style={[styles.freqEditInput, { color: C.accent, borderBottomColor: C.accent }]}
                value={freqInput}
                onChangeText={setFreqInput}
                onSubmitEditing={commitFreqInput}
                onBlur={commitFreqInput}
                keyboardType="numeric"
                autoFocus
                selectTextOnFocus
              />
              <Text style={styles.freqEditUnit}>Hz</Text>
            </View>
          ) : (
            <Pressable onPress={() => { setFreqInput(String(frequency)); setEditingFreq(true); }}>
              <Text style={[styles.freqTapText, { color: Colors.textTertiary }]}>
                {frequency} Hz — tap to edit
              </Text>
            </Pressable>
          )}

          <View style={styles.presetsRow}>
            {NOTE_FREQS.map((n) => {
              const active = Math.abs(frequency - n.freq) < 0.5;
              return (
                <Pressable
                  key={n.name}
                  onPress={() => { hapticFeedback(); setFrequency(n.freq); }}
                  style={[styles.presetChip, active && { backgroundColor: C.accentDim, borderColor: C.accent }]}
                >
                  <Text style={[styles.presetText, active && { color: C.accent }]}>{n.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.waveSection}>
            <Text style={styles.sectionLabel}>WAVEFORM</Text>
            <View style={styles.waveRow}>
              {WAVE_OPTIONS.map((w) => {
                const active = waveType === w.type;
                return (
                  <Pressable
                    key={w.type}
                    onPress={() => { hapticFeedback(); setWaveType(w.type); }}
                    style={[styles.waveBtn, active && { backgroundColor: C.accentDim, borderColor: C.accent }]}
                  >
                    <MaterialCommunityIcons
                      name={w.icon as any}
                      size={20}
                      color={active ? C.accent : Colors.textTertiary}
                    />
                    <Text style={[styles.waveBtnText, active && { color: C.accent }]}>{w.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            onPress={() => {
              hapticFeedback();
              isPlaying ? stopPlayback() : startPlayback();
            }}
            style={({ pressed }) => [
              styles.playBtn,
              { backgroundColor: isPlaying ? Colors.danger : C.accent },
              pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
            ]}
            testID="signal-toggle"
          >
            <Ionicons
              name={isPlaying ? "stop" : "play"}
              size={20}
              color={isPlaying ? Colors.white : Colors.background}
            />
            <Text style={[styles.playBtnText, { color: isPlaying ? Colors.white : Colors.background }]}>
              {isPlaying ? "Stop" : "Play"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    width: 310,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 18,
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.5,
    width: "100%",
  },
  knobsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
  },
  knobContainer: {
    alignItems: "center",
    gap: 4,
  },
  knobLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    color: Colors.textTertiary,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  knobOuter: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
  },
  knobBg: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_RADIUS,
    borderWidth: KNOB_STROKE,
    backgroundColor: Colors.surfaceLight,
  },
  knobIndicatorDot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  knobCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  knobValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 18,
    lineHeight: 20,
  },
  knobUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textTertiary,
    lineHeight: 12,
  },
  freqEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  freqEditInput: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    borderBottomWidth: 2,
    paddingVertical: 2,
    minWidth: 80,
    textAlign: "center",
  },
  freqEditUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
  },
  freqTapText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
  },
  sectionLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    color: Colors.textTertiary,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 5,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },
  waveSection: {
    width: "100%",
    alignItems: "center",
  },
  waveRow: {
    flexDirection: "row",
    gap: 6,
  },
  waveBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  waveBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 2,
  },
  playBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
});

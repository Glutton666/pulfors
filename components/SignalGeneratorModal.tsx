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
import { autoCorrelate, frequencyToNote } from "@/lib/tuner-engine";

const WAVE_OPTIONS: { type: WaveType; label: string; icon: string }[] = [
  { type: "sine", label: "Sine", icon: "sine-wave" },
  { type: "square", label: "Square", icon: "square-wave" },
  { type: "triangle", label: "Triangle", icon: "triangle-wave" },
  { type: "sawtooth", label: "Saw", icon: "sawtooth-wave" },
];

const NOTE_FREQS: { name: string; freq: number }[] = [
  { name: "C2", freq: 65.41 },
  { name: "E2", freq: 82.41 },
  { name: "A2", freq: 110 },
  { name: "C3", freq: 130.81 },
  { name: "E3", freq: 164.81 },
  { name: "G3", freq: 196 },
  { name: "A3", freq: 220 },
  { name: "C4", freq: 261.63 },
  { name: "E4", freq: 329.63 },
  { name: "G4", freq: 392 },
  { name: "A4", freq: 440 },
  { name: "C5", freq: 523.25 },
  { name: "E5", freq: 659.25 },
  { name: "A5", freq: 880 },
  { name: "C6", freq: 1046.5 },
  { name: "1k", freq: 1000 },
  { name: "2k", freq: 2000 },
  { name: "4k", freq: 4000 },
  { name: "8k", freq: 8000 },
  { name: "10k", freq: 10000 },
];

const KNOB_SIZE = 110;
const KNOB_RADIUS = KNOB_SIZE / 2;
const KNOB_STROKE = 5;
const ARC_START = 135;
const ARC_END = 405;
const ARC_RANGE = ARC_END - ARC_START;
const INDICATOR_RADIUS = KNOB_RADIUS - 14;

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const VOLUME_LINEAR = 0.3;

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

function polarToXY(angleDeg: number, r: number, cx: number, cy: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

interface KnobProps {
  value: number;
  onChange: (v: number) => void;
  displayValue: string;
  displayUnit: string;
  accentColor: string;
  accentDim: string;
  onTapCenter?: () => void;
}

function Knob({ value, onChange, displayValue, displayUnit, accentColor, accentDim, onTapCenter }: KnobProps) {
  const knobRef = useRef<View>(null);
  const valRef = useRef(value);
  const movedRef = useRef(false);
  valRef.current = value;

  const haptic = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        movedRef.current = false;
        haptic();
      },
      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dy) > 3) movedRef.current = true;
        const sensitivity = 0.0015;
        const delta = -gs.dy * sensitivity;
        const next = Math.max(0, Math.min(1, valRef.current + delta));
        if (Math.abs(next - valRef.current) > 0.001) {
          onChange(next);
        }
      },
      onPanResponderRelease: () => {
        if (!movedRef.current && onTapCenter) {
          onTapCenter();
        }
      },
    }), [onChange, haptic, onTapCenter]);

  const angle = ARC_START + value * ARC_RANGE;
  const indicator = polarToXY(angle, INDICATOR_RADIUS, KNOB_RADIUS, KNOB_RADIUS);

  return (
    <View style={styles.knobContainer}>
      <View
        ref={knobRef}
        {...panResponder.panHandlers}
        style={styles.knobOuter}
      >
        <View style={[styles.knobBg, { borderColor: accentDim }]}>
          <View style={[styles.knobIndicatorDot, { backgroundColor: accentColor, left: indicator.x - 6, top: indicator.y - 6 }]} />
        </View>
        <View style={styles.knobCenter} pointerEvents="none">
          <Text style={[styles.knobValue, { color: accentColor }]}>{displayValue}</Text>
          <Text style={styles.knobUnit}>{displayUnit}</Text>
        </View>
      </View>
    </View>
  );
}

function formatHz(freq: number): string {
  if (freq >= 10000) return (freq / 1000).toFixed(1) + "k";
  if (freq >= 1000) return (freq / 1000).toFixed(2) + "k";
  if (freq >= 100) return Math.round(freq).toString();
  return freq.toFixed(1);
}

interface SignalGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SignalGeneratorModal({ visible, onClose }: SignalGeneratorModalProps) {
  const { colors: C } = useTheme();
  const [frequency, setFrequency] = useState(440);
  const [waveType, setWaveType] = useState<WaveType>("sine");
  const [isPlaying, setIsPlaying] = useState(false);
  const [editingFreq, setEditingFreq] = useState(false);
  const [freqInput, setFreqInput] = useState("440");

  const [micListening, setMicListening] = useState(false);
  const [micDetectedFreq, setMicDetectedFreq] = useState<number | null>(null);
  const [micDetectedNote, setMicDetectedNote] = useState<string | null>(null);
  const micActiveRef = useRef(false);
  const micAudioCtxRef = useRef<any>(null);
  const micAnalyserRef = useRef<any>(null);
  const micSourceRef = useRef<any>(null);
  const micStreamRef = useRef<any>(null);
  const micRafRef = useRef<number | null>(null);

  const engineRef = useRef(new SignalGeneratorEngine());
  const isPlayingRef = useRef(false);
  const mobileLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toneUri = useMemo(() => {
    if (Platform.OS === "web") return null;
    return generateToneDataUri(frequency, waveType, VOLUME_LINEAR);
  }, [frequency, waveType]);

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
      engineRef.current.startWeb(frequency, waveType, VOLUME_LINEAR);
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
  }, [frequency, waveType, mobilePlayer]);

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
    if (isPlaying && Platform.OS !== "web") {
      stopPlayback();
      setTimeout(() => startPlayback(), 50);
    }
  }, [frequency, waveType]);

  useEffect(() => {
    return () => {
      engineRef.current.stopWeb();
      if (mobileLoopRef.current) clearTimeout(mobileLoopRef.current);
      micActiveRef.current = false;
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (micSourceRef.current) micSourceRef.current.disconnect();
      if (micAudioCtxRef.current) micAudioCtxRef.current.close();
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t: any) => t.stop());
    };
  }, []);

  const stopMic = useCallback(() => {
    micActiveRef.current = false;
    setMicListening(false);
    if (micRafRef.current) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micAudioCtxRef.current) {
      micAudioCtxRef.current.close();
      micAudioCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t: any) => t.stop());
      micStreamRef.current = null;
    }
    setMicDetectedFreq(null);
    setMicDetectedNote(null);
  }, []);

  const startMic = useCallback(async () => {
    if (Platform.OS !== "web") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      micAudioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      micAnalyserRef.current = analyser;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      micSourceRef.current = source;

      micActiveRef.current = true;
      setMicListening(true);

      const buf = new Float32Array(analyser.fftSize);
      const detect = () => {
        if (!micActiveRef.current) return;
        analyser.getFloatTimeDomainData(buf);
        const freq = autoCorrelate(buf, audioCtx.sampleRate);
        if (freq > 20 && freq <= MAX_FREQ) {
          const rounded = Math.round(freq * 10) / 10;
          setMicDetectedFreq(rounded);
          const noteInfo = frequencyToNote(freq);
          setMicDetectedNote(`${noteInfo.name}${noteInfo.octave}`);
        } else {
          setMicDetectedFreq(null);
          setMicDetectedNote(null);
        }
        micRafRef.current = requestAnimationFrame(detect);
      };
      detect();
    } catch {
      setMicListening(false);
    }
  }, []);

  const toggleMic = useCallback(() => {
    hapticFeedback();
    if (micListening) {
      stopMic();
    } else {
      startMic();
    }
  }, [micListening, stopMic, startMic, hapticFeedback]);

  const applyMicFreq = useCallback(() => {
    if (micDetectedFreq && micDetectedFreq >= MIN_FREQ && micDetectedFreq <= MAX_FREQ) {
      hapticFeedback();
      setFrequency(micDetectedFreq);
    }
  }, [micDetectedFreq, hapticFeedback]);

  const handleClose = useCallback(() => {
    stopPlayback();
    stopMic();
    onClose();
  }, [stopPlayback, stopMic, onClose]);

  const handleFreqKnob = useCallback((norm: number) => {
    const f = normToFreq(norm);
    setFrequency(Math.round(f * 10) / 10);
  }, []);

  const freqNorm = freqToNorm(frequency);

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

  const openFreqEdit = useCallback(() => {
    setFreqInput(String(frequency));
    setEditingFreq(true);
  }, [frequency]);

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

          <Knob
            value={freqNorm}
            onChange={handleFreqKnob}
            displayValue={formatFreqDisplay(frequency)}
            displayUnit={freqDisplayUnit}
            accentColor={C.accent}
            accentDim={C.accentDim}
            onTapCenter={openFreqEdit}
          />

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
            <Pressable onPress={openFreqEdit} style={styles.freqTapBtn} hitSlop={8}>
              <Text style={[styles.freqTapText, { color: Colors.textSecondary }]}>
                {frequency} Hz
              </Text>
              <Ionicons name="pencil" size={12} color={Colors.textTertiary} style={{ marginLeft: 4 }} />
            </Pressable>
          )}

          <View style={styles.presetsSection}>
            <Text style={styles.sectionLabel}>PRESETS</Text>
            <ScrollView
              style={styles.presetsScroll}
              contentContainerStyle={styles.presetsGrid}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {NOTE_FREQS.map((n) => {
                const active = Math.abs(frequency - n.freq) < 0.5;
                return (
                  <Pressable
                    key={n.name}
                    onPress={() => { hapticFeedback(); setFrequency(n.freq); }}
                    style={[styles.presetChip, active && { backgroundColor: C.accentDim, borderColor: C.accent }]}
                  >
                    <Text style={[styles.presetName, active && { color: C.accent }]}>{n.name}</Text>
                    <Text style={[styles.presetHz, active && { color: C.accent, opacity: 0.7 }]}>
                      {n.freq >= 1000 ? (n.freq / 1000) + "kHz" : n.freq + "Hz"}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
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

          {Platform.OS === "web" && (
            <View style={styles.micSection}>
              <View style={styles.micRow}>
                <Pressable
                  onPress={toggleMic}
                  style={({ pressed }) => [
                    styles.micBtn,
                    micListening && { backgroundColor: Colors.danger },
                    !micListening && { backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.border },
                    pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                  ]}
                  testID="signal-mic-toggle"
                >
                  <MaterialCommunityIcons
                    name={micListening ? "microphone-off" : "microphone"}
                    size={18}
                    color={micListening ? Colors.white : C.accent}
                  />
                  <Text style={[styles.micBtnText, { color: micListening ? Colors.white : Colors.textSecondary }]}>
                    {micListening ? "Stop" : "Listen"}
                  </Text>
                </Pressable>

                {micListening && micDetectedFreq && (
                  <Pressable
                    onPress={applyMicFreq}
                    style={({ pressed }) => [
                      styles.micApplyBtn,
                      { backgroundColor: C.accentDim, borderColor: C.accent },
                      pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                    ]}
                    testID="signal-mic-apply"
                  >
                    <Text style={[styles.micApplyFreq, { color: C.accent }]}>
                      {micDetectedNote} {micDetectedFreq} Hz
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color={C.accent} />
                  </Pressable>
                )}

                {micListening && !micDetectedFreq && (
                  <Text style={styles.micHint}>Listening...</Text>
                )}
              </View>
            </View>
          )}

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
    width: 320,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
    maxHeight: "80%",
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
  knobContainer: {
    alignItems: "center",
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
    width: 12,
    height: 12,
    borderRadius: 6,
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
    fontSize: 20,
    lineHeight: 24,
  },
  knobUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
    lineHeight: 14,
  },
  freqEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  freqEditInput: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 20,
    borderBottomWidth: 2,
    paddingVertical: 4,
    minWidth: 100,
    textAlign: "center",
  },
  freqEditUnit: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 16,
    color: Colors.textTertiary,
  },
  freqTapBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  freqTapText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  sectionLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    color: Colors.textTertiary,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  presetsSection: {
    width: "100%",
    alignItems: "center",
  },
  presetsScroll: {
    maxHeight: 100,
    width: "100%",
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 5,
    paddingBottom: 2,
  },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    minWidth: 50,
  },
  presetName: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  presetHz: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
    color: Colors.textTertiary,
    opacity: 0.8,
    marginTop: 1,
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
  micSection: {
    width: "100%",
    alignItems: "center",
  },
  micRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  micBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  micBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
  },
  micApplyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  micApplyFreq: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
  },
  micHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  playBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
});

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

type WaveType = "sine" | "square" | "triangle" | "sawtooth";

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

  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const hapticFeedback = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const startSignal = useCallback(() => {
    if (Platform.OS !== "web") return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;

      const gain = ctx.createGain();
      gain.gain.value = 0.3;
      gain.connect(ctx.destination);
      gainNodeRef.current = gain;

      const osc = ctx.createOscillator();
      osc.type = waveType;
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start();
      oscillatorRef.current = osc;

      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [waveType, frequency]);

  const stopSignal = useCallback(() => {
    if (oscillatorRef.current) {
      try { oscillatorRef.current.stop(); } catch {}
      oscillatorRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    if (isPlaying && oscillatorRef.current) {
      oscillatorRef.current.frequency.value = frequency;
    }
  }, [frequency, isPlaying]);

  useEffect(() => {
    if (isPlaying && oscillatorRef.current) {
      oscillatorRef.current.type = waveType;
    }
  }, [waveType, isPlaying]);

  useEffect(() => {
    return () => { stopSignal(); };
  }, [stopSignal]);

  const handleClose = useCallback(() => {
    stopSignal();
    onClose();
  }, [stopSignal, onClose]);

  const adjustFreq = useCallback((delta: number) => {
    hapticFeedback();
    setFrequency((prev) => {
      const next = Math.max(20, Math.min(20000, prev + delta));
      return Math.round(next * 10) / 10;
    });
  }, [hapticFeedback]);

  const commitFreqInput = useCallback(() => {
    setEditingFreq(false);
    const val = parseFloat(freqInput);
    if (!isNaN(val) && val >= 20 && val <= 20000) {
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

          <View style={styles.freqSection}>
            <Text style={styles.label}>Frequency</Text>
            <View style={styles.freqRow}>
              <Pressable
                onPress={() => adjustFreq(-10)}
                onLongPress={() => adjustFreq(-100)}
                style={({ pressed }) => [styles.freqAdjustBtn, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="remove" size={18} color={Colors.text} />
              </Pressable>

              {editingFreq ? (
                <TextInput
                  style={[styles.freqDisplay, styles.freqInput, { color: C.accent, borderBottomColor: C.accent }]}
                  value={freqInput}
                  onChangeText={setFreqInput}
                  onSubmitEditing={commitFreqInput}
                  onBlur={commitFreqInput}
                  keyboardType="numeric"
                  autoFocus
                  selectTextOnFocus
                />
              ) : (
                <Pressable onPress={() => { setFreqInput(String(frequency)); setEditingFreq(true); }}>
                  <Text style={[styles.freqDisplay, { color: C.accent }]}>
                    {frequency}
                    <Text style={styles.freqUnit}> Hz</Text>
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => adjustFreq(10)}
                onLongPress={() => adjustFreq(100)}
                style={({ pressed }) => [styles.freqAdjustBtn, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="add" size={18} color={Colors.text} />
              </Pressable>
            </View>
            <Text style={styles.hint}>Tap to edit, hold +/- for x100</Text>
          </View>

          <View style={styles.presetsRow}>
            {NOTE_FREQS.map((n) => {
              const active = Math.abs(frequency - n.freq) < 0.5;
              return (
                <Pressable
                  key={n.name}
                  onPress={() => { hapticFeedback(); setFrequency(n.freq); }}
                  style={[
                    styles.presetChip,
                    active && { backgroundColor: C.accentDim, borderColor: C.accent },
                  ]}
                >
                  <Text style={[styles.presetText, active && { color: C.accent }]}>
                    {n.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.waveSection}>
            <Text style={styles.label}>Waveform</Text>
            <View style={styles.waveRow}>
              {WAVE_OPTIONS.map((w) => {
                const active = waveType === w.type;
                return (
                  <Pressable
                    key={w.type}
                    onPress={() => { hapticFeedback(); setWaveType(w.type); }}
                    style={[
                      styles.waveBtn,
                      active && { backgroundColor: C.accentDim, borderColor: C.accent },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={w.icon as any}
                      size={20}
                      color={active ? C.accent : Colors.textTertiary}
                    />
                    <Text style={[styles.waveBtnText, active && { color: C.accent }]}>
                      {w.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {Platform.OS !== "web" ? (
            <Text style={styles.hint}>Signal generator is available on web only</Text>
          ) : (
            <Pressable
              onPress={() => {
                hapticFeedback();
                isPlaying ? stopSignal() : startSignal();
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
          )}
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
    padding: 24,
    width: 300,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
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
  label: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  freqSection: {
    width: "100%",
    alignItems: "center",
  },
  freqRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  freqAdjustBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  freqDisplay: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 32,
    textAlign: "center",
    minWidth: 140,
  },
  freqUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 16,
    color: Colors.textTertiary,
  },
  freqInput: {
    borderBottomWidth: 2,
    paddingVertical: 4,
  },
  hint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 4,
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
    marginTop: 4,
  },
  playBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
});

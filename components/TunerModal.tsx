import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
} from "react-native";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import {
  TUNINGS,
  frequencyToNote,
  findClosestTuningNote,
  autoCorrelate,
} from "@/lib/tuner-engine";

interface TunerModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TunerModal({ visible, onClose }: TunerModalProps) {
  const { colors: C } = useTheme();

  const [tunerActive, setTunerActive] = useState(false);
  const [tunerInstrument, setTunerInstrument] = useState(0);
  const [detectedFreq, setDetectedFreq] = useState<number | null>(null);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [detectedCents, setDetectedCents] = useState(0);
  const [selectedString, setSelectedString] = useState<number | null>(null);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const audioContextRef = useRef<any>(null);
  const analyserRef = useRef<any>(null);
  const sourceRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const tunerRafRef = useRef<number | null>(null);
  const tunerActiveRef = useRef(false);

  const hapticFeedback = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const startTuner = useCallback(async () => {
    if (Platform.OS !== "web") {
      setTunerActive(false);
      setMicPermission(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      analyserRef.current = analyser;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      setMicPermission(true);
      tunerActiveRef.current = true;
      setTunerActive(true);

      const buf = new Float32Array(analyser.fftSize);
      const detect = () => {
        if (!tunerActiveRef.current) return;
        analyser.getFloatTimeDomainData(buf);
        const freq = autoCorrelate(buf, audioCtx.sampleRate);
        if (freq > 0 && freq < 2000) {
          setDetectedFreq(Math.round(freq * 10) / 10);
          const noteInfo = frequencyToNote(freq);
          setDetectedNote(`${noteInfo.name}${noteInfo.octave}`);
          setDetectedCents(noteInfo.cents);
        } else {
          setDetectedFreq(null);
          setDetectedNote(null);
          setDetectedCents(0);
        }
        tunerRafRef.current = requestAnimationFrame(detect);
      };
      detect();
    } catch {
      setMicPermission(false);
      setTunerActive(false);
    }
  }, []);

  const stopTuner = useCallback(() => {
    tunerActiveRef.current = false;
    setTunerActive(false);
    if (tunerRafRef.current) {
      cancelAnimationFrame(tunerRafRef.current);
      tunerRafRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: any) => t.stop());
      streamRef.current = null;
    }
    setDetectedFreq(null);
    setDetectedNote(null);
    setDetectedCents(0);
  }, []);

  useEffect(() => {
    return () => {
      if (tunerActiveRef.current) stopTuner();
    };
  }, [stopTuner]);

  const handleClose = useCallback(() => {
    stopTuner();
    onClose();
  }, [stopTuner, onClose]);

  const currentTuning = TUNINGS[tunerInstrument];
  const match = detectedFreq
    ? findClosestTuningNote(detectedFreq, currentTuning)
    : null;

  const centsDisplay = match ? match.cents : detectedCents;
  const inTune = Math.abs(centsDisplay) <= 5;
  const centsColor = inTune
    ? Colors.success
    : Math.abs(centsDisplay) <= 15
    ? C.accent
    : Colors.danger;

  const meterPosition = Math.max(-50, Math.min(50, centsDisplay));
  const meterPercent = ((meterPosition + 50) / 100) * 100;

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
            <MaterialCommunityIcons name="tune-variant" size={20} color={C.accent} />
            <Text style={[styles.title, { color: C.accent }]}>Tuner</Text>
            <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={styles.instrumentRow}>
            <Pressable
              onPress={() => {
                hapticFeedback();
                setTunerInstrument((prev) =>
                  prev <= 0 ? TUNINGS.length - 1 : prev - 1
                );
                setSelectedString(null);
              }}
              hitSlop={12}
              style={styles.arrowBtn}
            >
              <Feather name="chevron-left" size={18} color={Colors.textSecondary} />
            </Pressable>
            <Text style={styles.instrumentLabel}>{currentTuning.label}</Text>
            <Pressable
              onPress={() => {
                hapticFeedback();
                setTunerInstrument((prev) =>
                  prev >= TUNINGS.length - 1 ? 0 : prev + 1
                );
                setSelectedString(null);
              }}
              hitSlop={12}
              style={styles.arrowBtn}
            >
              <Feather name="chevron-right" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.stringRow}>
            {currentTuning.notes.map((note, i) => {
              const isMatched = match && match.note.string === note.string;
              const isSelected = selectedString === note.string;
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    hapticFeedback();
                    setSelectedString(
                      selectedString === note.string ? null : note.string
                    );
                  }}
                  style={({ pressed }) => [
                    styles.stringChip,
                    isSelected && styles.stringChipSelected,
                    isSelected && { backgroundColor: C.accentDim, borderColor: C.accent },
                    isMatched && inTune && styles.stringChipInTune,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.stringLabel,
                      isSelected && { color: C.accent },
                      isMatched && inTune && { color: Colors.success },
                    ]}
                  >
                    {note.name}
                  </Text>
                  <Text style={styles.stringNum}>{note.string}</Text>
                </Pressable>
              );
            })}
          </View>

          {!tunerActive ? (
            <View style={styles.startSection}>
              {micPermission === false && Platform.OS !== "web" ? (
                <Text style={styles.hint}>
                  Tuner uses microphone (web only)
                </Text>
              ) : micPermission === false ? (
                <Text style={styles.hint}>Microphone access denied</Text>
              ) : null}
              <Pressable
                onPress={startTuner}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: C.accent },
                  pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                ]}
                testID="tuner-start"
              >
                <MaterialCommunityIcons
                  name="microphone"
                  size={20}
                  color={Colors.background}
                />
                <Text style={styles.actionBtnText}>Start Listening</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.activeSection}>
              <Text style={[styles.noteDisplay, { color: centsColor }]}>
                {detectedNote ?? "--"}
              </Text>

              <View style={styles.centsMeter}>
                <View style={styles.centsMeterTrack}>
                  <View style={styles.centsMeterCenter} />
                  <View
                    style={[
                      styles.centsMeterNeedle,
                      {
                        left: `${meterPercent}%` as any,
                        backgroundColor: centsColor,
                      },
                    ]}
                  />
                </View>
                <View style={styles.centsMeterLabels}>
                  <Text style={styles.centsMeterLabel}>-50</Text>
                  <Text style={[styles.centsMeterLabel, { color: Colors.text }]}>0</Text>
                  <Text style={styles.centsMeterLabel}>+50</Text>
                </View>
              </View>

              <Text style={[styles.centsText, { color: centsColor }]}>
                {centsDisplay > 0 ? "+" : ""}
                {centsDisplay} cents
              </Text>

              {detectedFreq && (
                <Text style={styles.freqText}>{detectedFreq} Hz</Text>
              )}

              <Pressable
                onPress={stopTuner}
                style={({ pressed }) => [
                  styles.stopBtn,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                ]}
                testID="tuner-stop"
              >
                <Ionicons name="stop" size={16} color={Colors.text} />
                <Text style={styles.stopBtnText}>Stop</Text>
              </Pressable>
            </View>
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
    gap: 16,
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
  instrumentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
  },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  instrumentLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.text,
    letterSpacing: 0.5,
    flex: 1,
    textAlign: "center",
  },
  stringRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  stringChip: {
    width: 40,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  stringChipSelected: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  stringChipInTune: {
    borderColor: Colors.success,
    backgroundColor: "rgba(63, 185, 80, 0.12)",
  },
  stringLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  stringNum: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },
  startSection: {
    alignItems: "center",
    gap: 10,
  },
  hint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
  activeSection: {
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  noteDisplay: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 48,
    letterSpacing: 3,
  },
  centsMeter: {
    width: "85%",
    gap: 4,
  },
  centsMeterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceLight,
    position: "relative",
    overflow: "visible",
  },
  centsMeterCenter: {
    position: "absolute",
    left: "50%",
    top: -3,
    width: 2,
    height: 12,
    marginLeft: -1,
    backgroundColor: Colors.textTertiary,
    borderRadius: 1,
  },
  centsMeterNeedle: {
    position: "absolute",
    top: -4,
    width: 8,
    height: 14,
    marginLeft: -4,
    borderRadius: 4,
  },
  centsMeterLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  centsMeterLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    color: Colors.textTertiary,
  },
  centsText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  freqText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
  },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stopBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
});

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
  Alert,
  PanResponder,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio, InterruptionModeIOS } from "expo-av";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

type Phase = "idle" | "countdown" | "recording" | "trimming" | "loading";

interface NoteRecorderModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (uri: string) => void;
  onDelete: () => void;
  beatIndex: number;
  subIndex: number;
  hasExisting: boolean;
}

const MAX_RECORD_SECONDS = 10;
const COUNTDOWN_FROM = 3;

export function NoteRecorderModal({
  visible,
  onClose,
  onSave,
  onDelete,
  beatIndex,
  subIndex,
  hasExisting,
}: NoteRecorderModalProps) {
  const { colors: C } = useTheme();

  const [phase, setPhase] = useState<Phase>("idle");
  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_FROM);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(1);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);

  const countScale = useSharedValue(1);
  const countOpacity = useSharedValue(1);

  const cleanup = useCallback(async () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
    }
    if (previewSoundRef.current) {
      try {
        await previewSoundRef.current.unloadAsync();
      } catch {}
      previewSoundRef.current = null;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, interruptionModeIOS: InterruptionModeIOS.MixWithOthers });
    } catch {}
  }, []);

  useEffect(() => {
    if (!visible) {
      cleanup();
      setPhase("idle");
      setCountdownValue(COUNTDOWN_FROM);
      setRecordDuration(0);
      setRecordedUri(null);
      setTrimStart(0);
      setTrimEnd(1);
      setAudioDuration(0);
      setIsPlayingPreview(false);
    }
  }, [visible, cleanup]);

  const startCountdown = useCallback(async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Microphone access is needed to record audio.");
      return;
    }

    setPhase("countdown");
    setCountdownValue(COUNTDOWN_FROM);
    let count = COUNTDOWN_FROM;

    const tick = () => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      countScale.value = 0.5;
      countOpacity.value = 0;
      countScale.value = withSpring(1, { damping: 8, stiffness: 300 });
      countOpacity.value = withTiming(1, { duration: 200 });
    };

    tick();

    const doTick = () => {
      count--;
      if (count > 0) {
        setCountdownValue(count);
        tick();
        countdownTimerRef.current = setTimeout(doTick, 1000);
      } else {
        startRecording();
      }
    };

    countdownTimerRef.current = setTimeout(doTick, 1000);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        isMeteringEnabled: false,
        android: {
          extension: ".m4a",
          outputFormat: 2,
          audioEncoder: 3,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: "aac",
          audioQuality: 127,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: "audio/webm",
          bitsPerSecond: 128000,
        },
      } as any);

      recordingRef.current = recording;
      await recording.startAsync();
      setPhase("recording");
      setRecordDuration(0);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const startTime = Date.now();
      recordTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setRecordDuration(elapsed);
        if (elapsed >= MAX_RECORD_SECONDS) {
          stopRecording();
        }
      }, 100);
    } catch (e) {
      console.error("Failed to start recording:", e);
      setPhase("idle");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    if (!recordingRef.current) {
      setPhase("idle");
      return;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, interruptionModeIOS: InterruptionModeIOS.MixWithOthers });

      if (uri) {
        setRecordedUri(uri);

        const sound = new Audio.Sound();
        await sound.loadAsync({ uri });
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          setAudioDuration(status.durationMillis / 1000);
          setTrimEnd(1);
        }
        await sound.unloadAsync();

        setPhase("trimming");
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        setPhase("idle");
      }
    } catch (e) {
      console.error("Failed to stop recording:", e);
      setPhase("idle");
    }
  }, []);

  const playPreview = useCallback(async () => {
    if (!recordedUri || audioDuration === 0) return;

    if (previewSoundRef.current) {
      try {
        await previewSoundRef.current.unloadAsync();
      } catch {}
      previewSoundRef.current = null;
    }

    try {
      const sound = new Audio.Sound();
      await sound.loadAsync({ uri: recordedUri });
      previewSoundRef.current = sound;

      const startMs = Math.floor(trimStart * audioDuration * 1000);
      const endMs = Math.floor(trimEnd * audioDuration * 1000);

      await sound.setPositionAsync(startMs);
      setIsPlayingPreview(true);
      await sound.playAsync();

      const checkInterval = setInterval(async () => {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            if (!status.isPlaying || (status.positionMillis >= endMs)) {
              await sound.stopAsync();
              clearInterval(checkInterval);
              setIsPlayingPreview(false);
            }
          } else {
            clearInterval(checkInterval);
            setIsPlayingPreview(false);
          }
        } catch {
          clearInterval(checkInterval);
          setIsPlayingPreview(false);
        }
      }, 50);
    } catch (e) {
      console.error("Failed to play preview:", e);
      setIsPlayingPreview(false);
    }
  }, [recordedUri, trimStart, trimEnd, audioDuration]);

  const handleSave = useCallback(async () => {
    if (!recordedUri) return;

    if (audioDuration > 0) {
      const startMs = Math.floor(trimStart * audioDuration * 1000);
      const endMs = Math.floor(trimEnd * audioDuration * 1000);
      onSave(`${recordedUri}#t=${startMs},${endMs}`);
    } else {
      onSave(recordedUri);
    }
  }, [recordedUri, trimStart, trimEnd, audioDuration, onSave]);

  const MAX_DURATION_SEC = 600;
  const MAX_FILE_SIZE_MB = 50;

  const handleImportFile = useCallback(async () => {
    try {
      setPhase("loading");
      setLoadingProgress(0);
      setLoadingMessage("Selecting file...");

      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setPhase("idle");
        setLoadingMessage("");
        return;
      }

      const asset = result.assets[0];
      const fileUri = asset.uri;
      const fileSizeMB = asset.size ? asset.size / (1024 * 1024) : 0;

      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        Alert.alert("File Too Large", `Maximum file size is ${MAX_FILE_SIZE_MB}MB. This file is ${Math.round(fileSizeMB)}MB.`);
        setPhase("idle");
        setLoadingMessage("");
        return;
      }

      setLoadingMessage("Loading audio...");
      setLoadingProgress(0.2);

      const progressInterval = setInterval(() => {
        setLoadingProgress((prev) => Math.min(prev + 0.05, 0.85));
      }, 500);

      const sound = new Audio.Sound();
      await sound.loadAsync({ uri: fileUri });
      const status = await sound.getStatusAsync();

      clearInterval(progressInterval);
      setLoadingProgress(0.95);

      if (status.isLoaded && status.durationMillis) {
        const durationSec = status.durationMillis / 1000;

        if (durationSec > MAX_DURATION_SEC) {
          Alert.alert(
            "Too Long",
            `Maximum audio length is 10 minutes. This file is ${Math.floor(durationSec / 60)}m ${Math.round(durationSec % 60)}s.`
          );
          await sound.unloadAsync();
          setPhase("idle");
          setLoadingMessage("");
          setLoadingProgress(0);
          return;
        }

        setLoadingProgress(1);
        setLoadingMessage("Ready!");

        setRecordedUri(fileUri);
        setAudioDuration(durationSec);
        setTrimStart(0);
        setTrimEnd(1);
        setPhase("trimming");
        setLoadingMessage("");
        setLoadingProgress(0);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        Alert.alert("Error", "Could not load this audio file.");
        setPhase("idle");
        setLoadingMessage("");
        setLoadingProgress(0);
      }
      await sound.unloadAsync();
    } catch (e) {
      console.error("Failed to import audio:", e);
      Alert.alert("Error", "Failed to import audio file.");
      setPhase("idle");
      setLoadingMessage("");
      setLoadingProgress(0);
    }
  }, []);

  const handleDelete = useCallback(() => {
    onDelete();
  }, [onDelete]);

  const handleClose = useCallback(async () => {
    await cleanup();
    onClose();
  }, [cleanup, onClose]);

  const countAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countScale.value }],
    opacity: countOpacity.value,
  }));

  const formatTime = (seconds: number) => {
    const s = Math.floor(seconds);
    const ms = Math.floor((seconds % 1) * 10);
    return `${s}.${ms}`;
  };

  const formatMinSec = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s.toFixed(2)}`;
  };

  const parseMinSec = (text: string): number | null => {
    const cleaned = text.trim();
    if (cleaned.includes(":")) {
      const [minPart, secPart] = cleaned.split(":");
      const mins = parseInt(minPart, 10);
      const secs = parseFloat(secPart);
      if (isNaN(mins) || isNaN(secs)) return null;
      return mins * 60 + secs;
    }
    const val = parseFloat(cleaned);
    if (isNaN(val)) return null;
    return val;
  };

  const [startTimeText, setStartTimeText] = useState("");
  const [endTimeText, setEndTimeText] = useState("");
  const [editingStart, setEditingStart] = useState(false);
  const [editingEnd, setEditingEnd] = useState(false);

  useEffect(() => {
    if (phase === "trimming" && audioDuration > 0) {
      if (!editingStart) setStartTimeText(formatMinSec(trimStart * audioDuration));
      if (!editingEnd) setEndTimeText(formatMinSec(trimEnd * audioDuration));
    }
  }, [phase, trimStart, trimEnd, audioDuration, editingStart, editingEnd]);

  const applyStartTime = useCallback(() => {
    setEditingStart(false);
    if (audioDuration <= 0) return;
    const parsed = parseMinSec(startTimeText);
    if (parsed === null || parsed < 0) return;
    const ratio = Math.max(0, Math.min(parsed / audioDuration, trimEnd - 0.01));
    setTrimStart(ratio);
  }, [startTimeText, audioDuration, trimEnd]);

  const applyEndTime = useCallback(() => {
    setEditingEnd(false);
    if (audioDuration <= 0) return;
    const parsed = parseMinSec(endTimeText);
    if (parsed === null || parsed < 0) return;
    const ratio = Math.min(1, Math.max(parsed / audioDuration, trimStart + 0.01));
    setTrimEnd(ratio);
  }, [endTimeText, audioDuration, trimStart]);

  const trimStartDisplay = (trimStart * audioDuration).toFixed(2);
  const trimEndDisplay = (trimEnd * audioDuration).toFixed(2);
  const trimDuration = ((trimEnd - trimStart) * audioDuration).toFixed(2);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={[styles.container, { backgroundColor: Colors.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>
              Beat {beatIndex + 1}, Note {subIndex + 1}
            </Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {phase === "idle" && (
            <View style={styles.content}>
              <View style={styles.sourceRow}>
                <Pressable
                  style={[styles.sourceButton, { backgroundColor: C.accent }]}
                  onPress={startCountdown}
                >
                  <Ionicons name="mic" size={24} color={Colors.white} />
                  <Text style={styles.sourceButtonText}>Record</Text>
                </Pressable>
                <Pressable
                  style={[styles.sourceButton, { backgroundColor: Colors.surfaceLight }]}
                  onPress={handleImportFile}
                >
                  <Ionicons name="musical-notes" size={24} color={Colors.text} />
                  <Text style={[styles.sourceButtonText, { color: Colors.text }]}>Import</Text>
                </Pressable>
              </View>
              {hasExisting && (
                <Pressable style={styles.deleteButton} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                  <Text style={[styles.deleteText]}>Remove Sample</Text>
                </Pressable>
              )}
            </View>
          )}

          {phase === "loading" && (
            <View style={styles.content}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={styles.hintText}>{loadingMessage || "Loading audio..."}</Text>
              {loadingProgress > 0 && (
                <View style={{ width: "80%", height: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
                  <View style={{ width: `${Math.round(loadingProgress * 100)}%` as any, height: "100%", backgroundColor: C.accent, borderRadius: 2 }} />
                </View>
              )}
              {loadingProgress > 0 && (
                <Text style={[styles.hintText, { fontSize: 11, marginTop: 6 }]}>{Math.round(loadingProgress * 100)}%</Text>
              )}
            </View>
          )}

          {phase === "countdown" && (
            <View style={styles.content}>
              <Animated.View style={[styles.countdownCircle, { borderColor: C.accent }, countAnimStyle]}>
                <Text style={[styles.countdownText, { color: C.accent }]}>{countdownValue}</Text>
              </Animated.View>
              <Text style={styles.hintText}>Get ready...</Text>
            </View>
          )}

          {phase === "recording" && (
            <View style={styles.content}>
              <View style={styles.recordingIndicator}>
                <View style={[styles.recordDot, { backgroundColor: "#FF4444" }]} />
                <Text style={styles.recordingTimeText}>{formatTime(recordDuration)}s</Text>
              </View>
              <View style={styles.recordingBar}>
                <View
                  style={[
                    styles.recordingProgress,
                    { width: `${(recordDuration / MAX_RECORD_SECONDS) * 100}%`, backgroundColor: "#FF4444" },
                  ]}
                />
              </View>
              <Text style={styles.hintText}>Max {MAX_RECORD_SECONDS}s</Text>
              <Pressable
                style={[styles.stopButton, { backgroundColor: "#FF4444" }]}
                onPress={stopRecording}
              >
                <Ionicons name="stop" size={24} color={Colors.white} />
                <Text style={styles.recordButtonText}>Stop</Text>
              </Pressable>
            </View>
          )}

          {phase === "trimming" && recordedUri && (
            <View style={styles.content}>
              <Text style={styles.sectionLabel}>Trim Audio</Text>
              <Text style={styles.trimInfo}>
                Duration: {trimDuration}s
              </Text>

              <View style={styles.trimTimeInputRow}>
                <View style={styles.trimTimeInputGroup}>
                  <Text style={styles.trimTimeLabel}>Start</Text>
                  <TextInput
                    style={[styles.trimTimeInput, { borderColor: C.accent + "60" }]}
                    value={startTimeText}
                    onChangeText={setStartTimeText}
                    onFocus={() => setEditingStart(true)}
                    onBlur={applyStartTime}
                    onSubmitEditing={applyStartTime}
                    keyboardType="decimal-pad"
                    placeholder="0:00.00"
                    placeholderTextColor={Colors.textTertiary}
                    returnKeyType="done"
                  />
                </View>
                <Text style={styles.trimTimeSeparator}>—</Text>
                <View style={styles.trimTimeInputGroup}>
                  <Text style={styles.trimTimeLabel}>End</Text>
                  <TextInput
                    style={[styles.trimTimeInput, { borderColor: C.accent + "60" }]}
                    value={endTimeText}
                    onChangeText={setEndTimeText}
                    onFocus={() => setEditingEnd(true)}
                    onBlur={applyEndTime}
                    onSubmitEditing={applyEndTime}
                    keyboardType="decimal-pad"
                    placeholder="0:00.00"
                    placeholderTextColor={Colors.textTertiary}
                    returnKeyType="done"
                  />
                </View>
              </View>

              <View style={styles.trimContainer}>
                <View style={styles.waveformBar}>
                  <View
                    style={[
                      styles.trimRegion,
                      {
                        left: `${trimStart * 100}%`,
                        width: `${(trimEnd - trimStart) * 100}%`,
                        backgroundColor: C.accent + "40",
                        borderColor: C.accent,
                      },
                    ]}
                  />
                  <TrimHandle
                    value={trimStart}
                    onChange={(v) => { setTrimStart(Math.min(v, trimEnd - 0.05)); setEditingStart(false); }}
                    color={C.accent}
                    side="left"
                  />
                  <TrimHandle
                    value={trimEnd}
                    onChange={(v) => { setTrimEnd(Math.max(v, trimStart + 0.05)); setEditingEnd(false); }}
                    color={C.accent}
                    side="right"
                  />
                </View>
              </View>

              <View style={styles.trimActions}>
                <Pressable
                  style={[styles.previewBtn, { borderColor: C.accent }]}
                  onPress={playPreview}
                >
                  <Ionicons
                    name={isPlayingPreview ? "pause" : "play"}
                    size={18}
                    color={C.accent}
                  />
                  <Text style={[styles.previewBtnText, { color: C.accent }]}>
                    {isPlayingPreview ? "Playing..." : "Preview"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.saveRow}>
                <Pressable style={styles.cancelBtn} onPress={handleClose}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, { backgroundColor: C.accent }]}
                  onPress={handleSave}
                >
                  <Ionicons name="checkmark" size={18} color={Colors.white} />
                  <Text style={styles.saveBtnText}>Save</Text>
                </Pressable>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TrimHandle({
  value,
  onChange,
  color,
  side,
}: {
  value: number;
  onChange: (v: number) => void;
  color: string;
  side: "left" | "right";
}) {
  const containerRef = useRef<View>(null);
  const layoutRef = useRef({ x: 0, width: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        containerRef.current?.measureInWindow((x, _y, width) => {
          layoutRef.current = { x, width };
        });
      },
      onPanResponderMove: (e: any) => {
        const { x, width } = layoutRef.current;
        if (width === 0) return;
        const pageX = e.nativeEvent.pageX;
        const ratio = Math.max(0, Math.min(1, (pageX - x) / width));
        onChange(ratio);
      },
    })
  ).current;

  return (
    <View
      ref={containerRef}
      style={[StyleSheet.absoluteFill]}
      pointerEvents="box-none"
    >
      <View
        {...panResponder.panHandlers}
        style={[
          styles.trimHandle,
          {
            left: `${value * 100}%`,
            marginLeft: side === "left" ? -10 : -10,
            backgroundColor: color,
          },
        ]}
      >
        <View style={styles.trimHandleLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  content: {
    alignItems: "center",
    gap: 16,
  },
  sourceRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  sourceButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 18,
    borderRadius: 14,
  },
  sourceButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
  recordButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
  },
  recordButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  deleteText: {
    color: "#FF6B6B",
    fontSize: 14,
  },
  countdownCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  countdownText: {
    fontSize: 36,
    fontWeight: "800",
  },
  hintText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recordingTimeText: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  recordingBar: {
    width: "100%",
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    overflow: "hidden",
  },
  recordingProgress: {
    height: "100%",
    borderRadius: 3,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  sectionLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    alignSelf: "flex-start",
  },
  trimInfo: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    alignSelf: "flex-start",
  },
  trimTimeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  trimTimeInputGroup: {
    flex: 1,
    gap: 4,
  },
  trimTimeLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  trimTimeInput: {
    backgroundColor: Colors.surfaceLight,
    color: Colors.text,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: "center",
  },
  trimTimeSeparator: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginTop: 18,
  },
  trimContainer: {
    width: "100%",
    height: 60,
    justifyContent: "center",
  },
  waveformBar: {
    width: "100%",
    height: 40,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 6,
    overflow: "visible",
    position: "relative",
  },
  trimRegion: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderWidth: 1,
    borderRadius: 4,
  },
  trimHandle: {
    position: "absolute",
    top: -4,
    width: 20,
    height: 48,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  trimHandleLine: {
    width: 2,
    height: 20,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 1,
  },
  trimActions: {
    flexDirection: "row",
    gap: 12,
  },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  previewBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  saveRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
});

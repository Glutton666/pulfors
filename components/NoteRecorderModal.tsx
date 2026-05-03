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
import { ensurePermission } from "@/lib/permissions";
import { Ionicons } from "@expo/vector-icons";
import {
  useAudioRecorder,
  useAudioPlayer,
  createAudioPlayer,
  RecordingPresets,
} from "expo-audio";
import { acquireAudioSession, releaseAudioSession } from "@/lib/audio-session";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { Radius, FontSize, Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { SampleSource } from "@/lib/note-samples";
import type { SampleChannel } from "@/lib/stereo-channel";
import { buildPreviewUri } from "@/lib/note-preview";
import { soundSets } from "@/lib/metronome-engine";
import type { BuiltinSoundSet } from "@/lib/storage";
import { safePlay } from "@/lib/audio-utils";
import { captureBreadcrumb } from "@/lib/error-tracking";

type Phase = "idle" | "countdown" | "recording" | "trimming" | "loading";

interface NoteRecorderModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (uri: string, name: string, source: SampleSource, channel: SampleChannel) => void;
  onDelete: () => void;
  beatIndex: number;
  subIndex: number;
  hasExisting: boolean;
  existingName?: string;
  existingChannel?: SampleChannel;
  bpm: number;
  soundSet?: BuiltinSoundSet;
}

const MAX_RECORD_SECONDS = 10;
const COUNTDOWN_BEATS = 4;

export function NoteRecorderModal({
  visible,
  onClose,
  onSave,
  onDelete,
  beatIndex,
  subIndex,
  hasExisting,
  existingName,
  existingChannel = "both",
  bpm,
  soundSet = "classic",
}: NoteRecorderModalProps) {
  const { colors: C } = useTheme();
  const styles = make_styles(C);
  const { t } = useLanguage();

  const [phase, setPhase] = useState<Phase>("idle");
  const [countdownValue, setCountdownValue] = useState(1);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [sampleName, setSampleName] = useState("");
  const sourceTypeRef = useRef<SampleSource>("recording");
  const [channel, setChannel] = useState<SampleChannel>(existingChannel);

  useEffect(() => {
    if (visible) {
      setChannel(existingChannel);
    }
  }, [visible, existingChannel]);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(1);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [autoPreview, setAutoPreview] = useState(true);
  // 채널별로 미리듣기용 stereo wav uri를 캐시. recordedUri 변경 시 무효화.
  const previewStereoCacheRef = useRef<{ left?: string; right?: string }>({});
  const previewTokenRef = useRef(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderRef = useRef(recorder);
  useEffect(() => { recorderRef.current = recorder; }, [recorder]);

  const clickSource = soundSets[soundSet]?.low ?? soundSets.classic.low;
  const clickPlayer = useAudioPlayer(clickSource);
  const previewPlayer = useAudioPlayer(null);
  const previewPlayerRef = useRef(previewPlayer);
  useEffect(() => { previewPlayerRef.current = previewPlayer; }, [previewPlayer]);

  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metronomeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingActiveRef = useRef(false);

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
    if (metronomeTimerRef.current) {
      clearInterval(metronomeTimerRef.current);
      metronomeTimerRef.current = null;
    }
    if (previewWatchRef.current) {
      clearInterval(previewWatchRef.current);
      previewWatchRef.current = null;
    }
    if (recordingActiveRef.current) {
      try { await recorderRef.current.stop(); } catch {}
      recordingActiveRef.current = false;
    }
    try { previewPlayerRef.current.pause(); } catch {}
    try {
      await releaseAudioSession("noteRecorderModal");
    } catch {}
  }, []);

  const playClick = useCallback(() => {
    try { clickPlayer.seekTo(0); } catch {}
    safePlay(clickPlayer, "noteRecorder.click");
  }, [clickPlayer]);

  const startMetronomeClicks = useCallback((currentBpm: number) => {
    if (metronomeTimerRef.current) clearInterval(metronomeTimerRef.current);
    const interval = 60000 / currentBpm;
    playClick();
    metronomeTimerRef.current = setInterval(() => {
      playClick();
    }, interval);
  }, [playClick]);

  const stopMetronomeClicks = useCallback(() => {
    if (metronomeTimerRef.current) {
      clearInterval(metronomeTimerRef.current);
      metronomeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      cleanup();
      setPhase("idle");
      setCountdownValue(1);
      setRecordDuration(0);
      setRecordedUri(null);
      setTrimStart(0);
      setTrimEnd(1);
      setAudioDuration(0);
      setIsPlayingPreview(false);
      setSampleName("");
      previewStereoCacheRef.current = {};
      previewTokenRef.current += 1;
    } else {
      setSampleName(existingName || "");
    }
  }, [visible, cleanup, existingName]);

  useEffect(() => {
    // recordedUri 변경 시 채널별 stereo 캐시 무효화.
    previewStereoCacheRef.current = {};
  }, [recordedUri]);

  const prepareRecording = useCallback(async () => {
    try {
      await acquireAudioSession("noteRecorderModal", "recording");
      await recorderRef.current.prepareToRecordAsync();
    } catch (e) {
      captureBreadcrumb({ category: "noteRecorder", message: "prepareToRecord failed", level: "error", data: { error: String(e) } });
    }
  }, []);

  const startCountdownRef = useRef<() => Promise<void>>(async () => {});
  const startCountdown = useCallback(async () => {
    const ok = await ensurePermission("mic", t, {
      pendingAction: () => { void startCountdownRef.current(); },
    });
    if (!ok) return;

    sourceTypeRef.current = "recording";
    setPhase("countdown");
    setCountdownValue(1);
    let count = 1;
    const interval = 60000 / bpm;

    prepareRecording();

    const tick = () => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      countScale.value = 0.5;
      countOpacity.value = 0;
      countScale.value = withSpring(1, { damping: 8, stiffness: 300 });
      countOpacity.value = withTiming(1, { duration: 200 });
      playClick();
    };

    tick();

    const doTick = () => {
      count++;
      if (count <= COUNTDOWN_BEATS) {
        setCountdownValue(count);
        tick();
        countdownTimerRef.current = setTimeout(doTick, interval);
      } else {
        startRecording();
      }
    };

    countdownTimerRef.current = setTimeout(doTick, interval);
  }, [bpm, playClick, prepareRecording, t]);
  useEffect(() => { startCountdownRef.current = startCountdown; }, [startCountdown]);

  const startRecording = useCallback(async () => {
    try {
      try {
        await recorderRef.current.prepareToRecordAsync();
      } catch {}

      recorderRef.current.record();
      recordingActiveRef.current = true;
      setPhase("recording");
      setRecordDuration(0);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      startMetronomeClicks(bpm);

      const startTime = Date.now();
      recordTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setRecordDuration(elapsed);
        if (elapsed >= MAX_RECORD_SECONDS) {
          stopRecording();
        }
      }, 100);
    } catch (e) {
      captureBreadcrumb({ category: "noteRecorder", message: "startRecording failed", level: "error", data: { error: String(e) } });
      setPhase("idle");
    }
  }, [bpm, startMetronomeClicks]);

  const probeDurationSec = useCallback(async (uri: string): Promise<number> => {
    return new Promise((resolve) => {
      let resolved = false;
      const probe = createAudioPlayer({ uri });
      const finish = (sec: number) => {
        if (resolved) return;
        resolved = true;
        try { probe.remove(); } catch {}
        resolve(sec);
      };
      const startedAt = Date.now();
      const tick = setInterval(() => {
        const d = probe.duration;
        if (typeof d === "number" && d > 0 && isFinite(d)) {
          clearInterval(tick);
          finish(d);
        } else if (Date.now() - startedAt > 4000) {
          clearInterval(tick);
          finish(0);
        }
      }, 80);
    });
  }, []);

  const stopRecording = useCallback(async () => {
    stopMetronomeClicks();
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    try {
      await recorderRef.current.stop();
      recordingActiveRef.current = false;
      const uri = recorderRef.current.uri;
      await releaseAudioSession("noteRecorderModal");

      if (uri) {
        setRecordedUri(uri);
        const dur = await probeDurationSec(uri);
        if (dur > 0) {
          setAudioDuration(dur);
          setTrimEnd(1);
        }
        setPhase("trimming");
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        setPhase("idle");
      }
    } catch (e) {
      captureBreadcrumb({ category: "noteRecorder", message: "stopRecording failed", level: "error", data: { error: String(e) } });
      setPhase("idle");
    }
  }, [probeDurationSec, stopMetronomeClicks]);

  const playPreview = useCallback(async () => {
    if (!recordedUri || audioDuration === 0) return;

    if (previewWatchRef.current) {
      clearInterval(previewWatchRef.current);
      previewWatchRef.current = null;
    }

    const token = ++previewTokenRef.current;

    try {
      // 채널 적용: left/right인 경우 mono → stereo wav를 만들어 그 uri를 재생.
      // 같은 채널을 반복 재생할 때는 캐시된 stereo uri를 재사용한다.
      let effectiveUri = recordedUri;
      if (channel !== "both") {
        const cache = previewStereoCacheRef.current;
        const cached = channel === "left" ? cache.left : cache.right;
        if (cached) {
          effectiveUri = cached;
        } else {
          const built = await buildPreviewUri(recordedUri, channel);
          if (token !== previewTokenRef.current) return;
          effectiveUri = built;
          if (built !== recordedUri) {
            if (channel === "left") cache.left = built;
            else cache.right = built;
          }
        }
      }

      if (token !== previewTokenRef.current) return;
      const player = previewPlayerRef.current;
      try { player.pause(); } catch {}
      try { player.replace({ uri: effectiveUri }); } catch {}

      const startSec = trimStart * audioDuration;
      const endSec = trimEnd * audioDuration;

      // Wait briefly for the player to load the new source before seeking.
      const waitLoad = async () => {
        const start = Date.now();
        while (Date.now() - start < 1500) {
          const d = player.duration;
          if (typeof d === "number" && d > 0 && isFinite(d)) return true;
          await new Promise((r) => setTimeout(r, 40));
        }
        return false;
      };
      await waitLoad();
      if (token !== previewTokenRef.current) return;

      try { await player.seekTo(startSec); } catch {}
      setIsPlayingPreview(true);
      safePlay(player, "noteRecorder.preview");

      const startedAt = Date.now();
      const expectedDurMs = Math.max(50, (endSec - startSec) * 1000);
      previewWatchRef.current = setInterval(() => {
        try {
          const ct = player.currentTime;
          const elapsed = Date.now() - startedAt;
          if ((typeof ct === "number" && ct >= endSec) || elapsed > expectedDurMs + 600) {
            try { player.pause(); } catch {}
            if (previewWatchRef.current) {
              clearInterval(previewWatchRef.current);
              previewWatchRef.current = null;
            }
            setIsPlayingPreview(false);
          }
        } catch {
          if (previewWatchRef.current) {
            clearInterval(previewWatchRef.current);
            previewWatchRef.current = null;
          }
          setIsPlayingPreview(false);
        }
      }, 50);
    } catch (e) {
      captureBreadcrumb({ category: "noteRecorder", message: "playPreview failed", level: "warning", data: { error: String(e) } });
      setIsPlayingPreview(false);
    }
  }, [recordedUri, trimStart, trimEnd, audioDuration, channel]);

  const playPreviewRef = useRef(playPreview);
  useEffect(() => { playPreviewRef.current = playPreview; }, [playPreview]);

  const handleSlideEnd = useCallback(() => {
    if (autoPreview) {
      void playPreviewRef.current();
    }
  }, [autoPreview]);

  const handleSave = useCallback(async () => {
    if (!recordedUri) return;

    if (audioDuration > 0) {
      const startMs = Math.floor(trimStart * audioDuration * 1000);
      const endMs = Math.floor(trimEnd * audioDuration * 1000);
      onSave(`${recordedUri}#t=${startMs},${endMs}`, sampleName, sourceTypeRef.current, channel);
    } else {
      onSave(recordedUri, sampleName, sourceTypeRef.current, channel);
    }
  }, [recordedUri, trimStart, trimEnd, audioDuration, onSave, sampleName, channel]);

  const MAX_DURATION_SEC = 600;
  const MAX_FILE_SIZE_MB = 50;

  const handleImportFile = useCallback(async () => {
    try {
      sourceTypeRef.current = "import";
      setPhase("loading");
      setLoadingProgress(0);
      setLoadingMessage(t("noteRecorder", "selectingFile"));

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
        Alert.alert(t("noteRecorder", "fileTooLarge"), t("noteRecorder", "fileTooLargeMsg").replace("{size}", String(MAX_FILE_SIZE_MB)).replace("{actual}", String(Math.round(fileSizeMB))));
        setPhase("idle");
        setLoadingMessage("");
        return;
      }

      setLoadingMessage(t("noteRecorder", "loadingAudio"));
      setLoadingProgress(0.2);

      const progressInterval = setInterval(() => {
        setLoadingProgress((prev) => Math.min(prev + 0.05, 0.85));
      }, 500);

      const durationSec = await probeDurationSec(fileUri);

      clearInterval(progressInterval);
      setLoadingProgress(0.95);

      if (durationSec > 0) {
        if (durationSec > MAX_DURATION_SEC) {
          Alert.alert(
            t("noteRecorder", "tooLongTitle"),
            t("noteRecorder", "tooLongMsg").replace("{0}", String(Math.floor(durationSec / 60))).replace("{1}", String(Math.round(durationSec % 60)))
          );
          setPhase("idle");
          setLoadingMessage("");
          setLoadingProgress(0);
          return;
        }

        setLoadingProgress(1);
        setLoadingMessage(t("noteRecorder", "ready"));

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
        Alert.alert(t("noteRecorder", "error"), t("noteRecorder", "loadError"));
        setPhase("idle");
        setLoadingMessage("");
        setLoadingProgress(0);
      }
    } catch (e) {
      captureBreadcrumb({ category: "noteRecorder", message: "importAudio failed", level: "error", data: { error: String(e) } });
      Alert.alert(t("noteRecorder", "error"), t("noteRecorder", "importError"));
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
        <Pressable style={[styles.container, { backgroundColor: C.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text }]}>
              {t("noteRecorder", "beatNote").replace("{0}", String(beatIndex + 1)).replace("{1}", String(subIndex + 1))}
            </Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </Pressable>
          </View>

          {phase === "idle" && (
            <View style={styles.content}>
              <View style={styles.sourceRow}>
                <Pressable
                  style={[styles.sourceButton, { backgroundColor: C.accent }]}
                  onPress={startCountdown}
                >
                  <Ionicons name="mic" size={24} color={C.white} />
                  <Text style={styles.sourceButtonText}>{t("noteRecorder", "record")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.sourceButton, { backgroundColor: C.surfaceLight }]}
                  onPress={handleImportFile}
                >
                  <Ionicons name="musical-notes" size={24} color={C.text} />
                  <Text style={[styles.sourceButtonText, { color: C.text }]}>{t("noteRecorder", "import")}</Text>
                </Pressable>
              </View>
              {hasExisting && (
                <Pressable style={styles.deleteButton} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                  <Text style={[styles.deleteText]}>{t("noteRecorder", "removeSample")}</Text>
                </Pressable>
              )}
            </View>
          )}

          {phase === "loading" && (
            <View style={styles.content}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={styles.hintText}>{loadingMessage || t("noteRecorder", "loadingAudio")}</Text>
              {loadingProgress > 0 && (
                <View style={{ width: "80%", height: 4, backgroundColor: C.overlay10, borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
                  <View style={{ width: `${Math.round(loadingProgress * 100)}%` as any, height: "100%", backgroundColor: C.accent, borderRadius: 2 }} />
                </View>
              )}
              {loadingProgress > 0 && (
                <Text style={[styles.hintText, { fontSize: FontSize.caption, marginTop: 6 }]}>{Math.round(loadingProgress * 100)}%</Text>
              )}
            </View>
          )}

          {phase === "countdown" && (
            <View style={styles.content}>
              <Animated.View style={[styles.countdownCircle, { borderColor: C.accent }, countAnimStyle]}>
                <Text style={[styles.countdownText, { color: C.accent }]}>{countdownValue}</Text>
              </Animated.View>
              <Text style={styles.hintText}>{t("noteRecorder", "getReady")}</Text>
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
              <Text style={styles.hintText}>{t("noteRecorder", "maxSeconds").replace("{0}", String(MAX_RECORD_SECONDS))}</Text>
              <Pressable
                style={[styles.stopButton, { backgroundColor: "#FF4444" }]}
                onPress={stopRecording}
              >
                <Ionicons name="stop" size={24} color={C.white} />
                <Text style={styles.recordButtonText}>{t("noteRecorder", "stop")}</Text>
              </Pressable>
            </View>
          )}

          {phase === "trimming" && recordedUri && (
            <View style={styles.content}>
              <Text style={styles.sectionLabel}>{t("noteRecorder", "trimAudio")}</Text>
              <Text style={styles.trimInfo}>
                {t("noteRecorder", "duration").replace("{0}", trimDuration)}
              </Text>

              <View style={styles.trimTimeInputRow}>
                <View style={styles.trimTimeInputGroup}>
                  <Text style={styles.trimTimeLabel}>{t("noteRecorder", "trimStart")}</Text>
                  <TextInput
                    style={[styles.trimTimeInput, { borderColor: C.accent + "60" }]}
                    value={startTimeText}
                    onChangeText={setStartTimeText}
                    onFocus={() => setEditingStart(true)}
                    onBlur={applyStartTime}
                    onSubmitEditing={applyStartTime}
                    keyboardType="decimal-pad"
                    placeholder="0:00.00"
                    placeholderTextColor={C.textTertiary}
                    returnKeyType="done"
                  />
                </View>
                <Text style={styles.trimTimeSeparator}>—</Text>
                <View style={styles.trimTimeInputGroup}>
                  <Text style={styles.trimTimeLabel}>{t("noteRecorder", "trimEnd")}</Text>
                  <TextInput
                    style={[styles.trimTimeInput, { borderColor: C.accent + "60" }]}
                    value={endTimeText}
                    onChangeText={setEndTimeText}
                    onFocus={() => setEditingEnd(true)}
                    onBlur={applyEndTime}
                    onSubmitEditing={applyEndTime}
                    keyboardType="decimal-pad"
                    placeholder="0:00.00"
                    placeholderTextColor={C.textTertiary}
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
                  {channel !== "both" && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.channelOverlay,
                        {
                          left: `${trimStart * 100}%`,
                          width: `${(trimEnd - trimStart) * 100}%`,
                        },
                        channel === "left" ? { top: 0, bottom: "50%" } : { top: "50%", bottom: 0 },
                        { backgroundColor: C.accent + "55" },
                      ]}
                    />
                  )}
                  <TrimHandle
                    value={trimStart}
                    onChange={(v) => { setTrimStart(Math.min(v, trimEnd - 0.05)); setEditingStart(false); }}
                    onSlideEnd={handleSlideEnd}
                    color={C.accent}
                    side="left"
                  />
                  <TrimHandle
                    value={trimEnd}
                    onChange={(v) => { setTrimEnd(Math.max(v, trimStart + 0.05)); setEditingEnd(false); }}
                    onSlideEnd={handleSlideEnd}
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
                    {isPlayingPreview ? t("noteRecorder", "playing") : t("noteRecorder", "previewBtn")}
                  </Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: Spacing.sm, marginTop: Spacing.xs, alignSelf: "stretch" }}>
                <Pressable
                  onPress={() => setAutoPreview((v) => !v)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  hitSlop={8}
                >
                  <Ionicons
                    name={autoPreview ? "checkbox" : "square-outline"}
                    size={18}
                    color={autoPreview ? C.accent : C.textSecondary}
                  />
                  <Text style={{ color: C.textSecondary, fontSize: FontSize.small }}>
                    {t("noteRecorder", "autoPreview")}
                  </Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "center", gap: Spacing.xs, marginTop: Spacing.sm, alignSelf: "stretch" }}>
                {(["both", "left", "right"] as const).map((opt) => {
                  const active = channel === opt;
                  const label = opt === "left" ? t("noteRecorder", "channel_left") : opt === "right" ? t("noteRecorder", "channel_right") : t("noteRecorder", "channel_both");
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setChannel(opt)}
                      style={{
                        flex: 1,
                        paddingVertical: Spacing.sm,
                        borderRadius: Radius.md,
                        borderWidth: 1,
                        borderColor: active ? C.accent : C.border,
                        backgroundColor: active ? C.accentDim : C.surface,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: active ? C.accent : C.textSecondary, fontSize: FontSize.small }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: Spacing.xs }}>
                <Ionicons name="headset-outline" size={14} color={C.textTertiary} />
                <Text style={{ color: C.textTertiary, fontSize: FontSize.caption }}>
                  {t("noteRecorder", "headphonesHint")}
                </Text>
              </View>

              <View style={styles.nameInputRow}>
                <Ionicons name="pricetag-outline" size={14} color={C.textSecondary} />
                <TextInput
                  style={[styles.nameInput, { borderColor: C.accent + "40" }]}
                  value={sampleName}
                  onChangeText={setSampleName}
                  placeholder={t("noteRecorder", "sampleName")}
                  placeholderTextColor={C.textTertiary}
                  returnKeyType="done"
                  maxLength={30}
                />
              </View>

              <View style={styles.saveRow}>
                <Pressable style={styles.cancelBtn} onPress={handleClose}>
                  <Text style={styles.cancelBtnText}>{t("noteRecorder", "cancel")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, { backgroundColor: C.accent }]}
                  onPress={handleSave}
                >
                  <Ionicons name="checkmark" size={18} color={C.white} />
                  <Text style={styles.saveBtnText}>{t("noteRecorder", "save")}</Text>
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
  onSlideEnd,
  color,
  side,
}: {
  value: number;
  onChange: (v: number) => void;
  onSlideEnd?: () => void;
  color: string;
  side: "left" | "right";
}) {
  const onSlideEndRef = useRef(onSlideEnd);
  useEffect(() => { onSlideEndRef.current = onSlideEnd; }, [onSlideEnd]);
  const { colors: C } = useTheme();
  const styles = make_styles(C);
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
      onPanResponderRelease: () => {
        try { onSlideEndRef.current?.(); } catch {}
      },
      onPanResponderTerminate: () => {
        try { onSlideEndRef.current?.(); } catch {}
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

const make_styles = (C: typeof Colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    width: "100%",
    maxWidth: 480,
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
    color: C.text,
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
    color: C.white,
    fontSize: 14,
    fontWeight: "600",
  },
  recordButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
  },
  recordButtonText: {
    color: C.white,
    fontSize: 16,
    fontWeight: "600",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
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
    color: C.text,
  },
  hintText: {
    color: C.textSecondary,
    fontSize: 13,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recordingTimeText: {
    color: C.text,
    fontSize: 24,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  recordingBar: {
    width: "100%",
    height: 6,
    backgroundColor: C.surfaceLight,
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
    color: C.text,
    fontSize: 14,
    fontWeight: "600",
    alignSelf: "flex-start",
  },
  trimInfo: {
    color: C.textSecondary,
    fontSize: FontSize.small,
    fontVariant: ["tabular-nums"],
    alignSelf: "flex-start",
  },
  trimTimeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: "100%",
  },
  trimTimeInputGroup: {
    flex: 1,
    gap: Spacing.xs,
  },
  trimTimeLabel: {
    color: C.textSecondary,
    fontSize: FontSize.caption,
    fontWeight: "600",
  },
  trimTimeInput: {
    backgroundColor: C.surfaceLight,
    color: C.text,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: Spacing.sm,
    textAlign: "center",
  },
  trimTimeSeparator: {
    color: C.textSecondary,
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
    backgroundColor: C.surfaceLight,
    borderRadius: Radius.sm,
    overflow: "visible",
    position: "relative",
  },
  trimRegion: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderWidth: 1,
    borderRadius: Radius.xs,
  },
  channelOverlay: {
    position: "absolute",
    borderRadius: Radius.xs,
  },
  trimHandle: {
    position: "absolute",
    top: -4,
    width: 20,
    height: 48,
    borderRadius: Radius.xs,
    justifyContent: "center",
    alignItems: "center",
  },
  trimHandleLine: {
    width: 2,
    height: 20,
    backgroundColor: C.textSecondary,
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
    color: C.text,
  },
  nameInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: "100%",
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: Spacing.sm,
    color: C.text,
    fontSize: 13,
  },
  saveRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: Spacing.xs,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: C.surfaceLight,
    alignItems: "center",
  },
  cancelBtnText: {
    color: C.textSecondary,
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
    color: C.white,
    fontSize: 14,
    fontWeight: "600",
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  View,
  Text,
  StyleSheet,
  Platform,
  Alert,
  TextInput,
  FlatList,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import {
  useAudioPlayer,
  useAudioRecorder,
  setAudioModeAsync,
  RecordingPresets,
  type AudioPlayer,
  type AudioSource,
} from "expo-audio";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import { ensurePermission } from "@/lib/permissions";
import { safePlay } from "@/lib/audio-utils";
import { soundSets } from "@/lib/metronome-engine";
import {
  DRUM_PAD_COUNT,
  DRUM_KIT_COLS,
  type DrumKitMapping,
  type DrumPadConfig,
  loadDrumKitMapping,
  saveDrumKitMapping,
  createDefaultDrumKitMapping,
  listBuiltinPadOptions,
  resolvePadUri,
  getBuiltinPadModule,
} from "@/lib/drum-kit";
import {
  loadPracticeBook,
  savePracticeBook,
  createPracticeEntry,
  type PracticeEntry,
  type BuiltinSoundSet,
  type SoundRole,
} from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";

const BEATS = 4;
const SUBS = 4;
const CELLS = BEATS * SUBS;

type Phase = "idle" | "countin" | "recording" | "review";
type RecordedHit = { cell: number; pad: number };

export interface DrumKitModalProps {
  visible: boolean;
  onClose: () => void;
}

interface DrumPadProps {
  index: number;
  config: DrumPadConfig | null;
  bgColor: string;
  borderColor: string;
  textColor: string;
  textTertiary: string;
  accent: string;
  flashing: boolean;
  onTap: (index: number) => void;
  onLongPress: (index: number) => void;
  size: number;
}

function padSourceToAudioSource(config: DrumPadConfig): AudioSource | null {
  if (config.source.type === "builtin") {
    return getBuiltinPadModule(config.source.setName, config.source.role) as unknown as AudioSource;
  }
  return { uri: config.source.uri };
}

const DrumPad = React.memo(function DrumPad({
  index, config, bgColor, borderColor, textColor, textTertiary, accent, flashing, onTap, onLongPress, size,
}: DrumPadProps) {
  const player = useAudioPlayer(null) as AudioPlayer;
  const playerRef = useRef(player);
  useEffect(() => { playerRef.current = player; }, [player]);
  const lastSourceRef = useRef<string>("");

  useEffect(() => {
    if (!config) { lastSourceRef.current = ""; return; }
    const key = config.source.type === "builtin"
      ? `b:${config.source.setName}:${config.source.role}`
      : `${config.source.type}:${config.source.uri}`;
    if (key === lastSourceRef.current) return;
    lastSourceRef.current = key;
    const src = padSourceToAudioSource(config);
    if (!src) return;
    try { player.replace(src); } catch {}
  }, [config, player]);

  const handlePress = useCallback(() => {
    if (!config) { onTap(index); return; }
    try { player.seekTo(0); } catch {}
    safePlay(player, "drumKit.pad");
    onTap(index);
  }, [config, player, index, onTap]);

  const label = !config ? "" : config.source.type === "builtin"
    ? `${config.source.setName.slice(0, 4)}/${config.source.role[0]}`
    : (config.source.name || (config.source.type === "recording" ? "REC" : "FILE"));

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={() => onLongPress(index)}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.pad,
        {
          width: size, height: size,
          backgroundColor: flashing ? accent + "55" : bgColor,
          borderColor: flashing ? accent : borderColor,
        },
        !config && { borderStyle: "dashed" as const },
        pressed && { opacity: 0.7 },
      ]}
      testID={`drum-pad-${index}`}
    >
      {!config ? (
        <Ionicons name="add" size={Math.max(18, size * 0.35)} color={textTertiary} />
      ) : (
        <>
          <Text style={[styles.padLabel, { color: textColor }]} numberOfLines={1}>{label}</Text>
          {config.source.type !== "builtin" && (
            <Ionicons
              name={config.source.type === "recording" ? "mic" : "document-text-outline"}
              size={Math.max(10, size * 0.18)}
              color={textTertiary}
              style={{ marginTop: Spacing.xxs }}
            />
          )}
        </>
      )}
    </Pressable>
  );
});

export function DrumKitModal({ visible, onClose }: DrumKitModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const [mapping, setMapping] = useState<DrumKitMapping>(createDefaultDrumKitMapping());
  const [phase, setPhase] = useState<Phase>("idle");
  const [bpm, setBpm] = useState(100);
  const [countInValue, setCountInValue] = useState(0);
  const [recordedHits, setRecordedHits] = useState<RecordedHit[]>([]);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [flashingPad, setFlashingPad] = useState<number | null>(null);
  const [assignSlot, setAssignSlot] = useState<number | null>(null);
  const [showBuiltinPicker, setShowBuiltinPicker] = useState(false);
  const [entryName, setEntryName] = useState("");

  const phaseRef = useRef<Phase>("idle");
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const recordStartRef = useRef<number>(0);
  const recordedHitsRef = useRef<RecordedHit[]>([]);
  const countInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clickPlayer = useAudioPlayer(soundSets.classic.high);

  useEffect(() => {
    if (!visible) return;
    void loadDrumKitMapping().then((m) => setMapping(m));
  }, [visible]);

  const persistMapping = useCallback(async (next: DrumKitMapping) => {
    setMapping(next);
    await saveDrumKitMapping(next);
  }, []);

  const cleanupTimers = useCallback(() => {
    if (countInTimerRef.current) { clearTimeout(countInTimerRef.current); countInTimerRef.current = null; }
    if (recordEndTimerRef.current) { clearTimeout(recordEndTimerRef.current); recordEndTimerRef.current = null; }
    if (cellTickerRef.current) { clearInterval(cellTickerRef.current); cellTickerRef.current = null; }
    if (flashTimerRef.current) { clearTimeout(flashTimerRef.current); flashTimerRef.current = null; }
  }, []);

  useEffect(() => {
    if (!visible) {
      cleanupTimers();
      setPhase("idle");
      setRecordedHits([]);
      recordedHitsRef.current = [];
      setActiveCell(null);
      setCountInValue(0);
      setFlashingPad(null);
      setAssignSlot(null);
      setShowBuiltinPicker(false);
      setEntryName("");
    }
  }, [visible, cleanupTimers]);

  const playClick = useCallback(() => {
    try { clickPlayer.seekTo(0); } catch {}
    safePlay(clickPlayer, "drumKit.click");
  }, [clickPlayer]);

  const stopRecording = useCallback(() => {
    cleanupTimers();
    if (phaseRef.current === "recording" || phaseRef.current === "countin") {
      setPhase("review");
    }
    setActiveCell(null);
  }, [cleanupTimers]);

  const startRecording = useCallback(() => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "review") return;
    cleanupTimers();
    setRecordedHits([]);
    recordedHitsRef.current = [];

    const safeBpm = Math.max(40, Math.min(240, bpm));
    const beatMs = 60000 / safeBpm;
    const cellMs = beatMs / SUBS;
    const measureMs = beatMs * BEATS;

    setPhase("countin");
    setCountInValue(1);
    playClick();

    let count = 1;
    const doCountIn = () => {
      count++;
      if (count <= BEATS) {
        setCountInValue(count);
        playClick();
        countInTimerRef.current = setTimeout(doCountIn, beatMs);
      } else {
        setPhase("recording");
        setCountInValue(0);
        recordStartRef.current = Date.now();
        playClick();
        let lastBeat = 0;
        let lastCell = -1;
        cellTickerRef.current = setInterval(() => {
          const elapsed = Date.now() - recordStartRef.current;
          const idx = Math.floor(elapsed / cellMs);
          if (idx < 0 || idx >= CELLS) return;
          if (idx !== lastCell) {
            lastCell = idx;
            setActiveCell(idx);
          }
          const beat = Math.floor(idx / SUBS);
          if (beat > lastBeat) {
            lastBeat = beat;
            playClick();
          }
        }, Math.max(15, Math.floor(cellMs / 4)));
        recordEndTimerRef.current = setTimeout(() => {
          stopRecording();
        }, measureMs + 50);
      }
    };
    countInTimerRef.current = setTimeout(doCountIn, beatMs);
  }, [bpm, cleanupTimers, playClick, stopRecording]);

  const recordHit = useCallback((padIdx: number) => {
    if (phaseRef.current !== "recording") return;
    const safeBpm = Math.max(40, Math.min(240, bpm));
    const beatMs = 60000 / safeBpm;
    const cellMs = beatMs / SUBS;
    const elapsed = Date.now() - recordStartRef.current;
    const cell = Math.round(elapsed / cellMs);
    if (cell < 0 || cell >= CELLS) return;
    const next = [...recordedHitsRef.current.filter((h) => h.cell !== cell), { cell, pad: padIdx }];
    recordedHitsRef.current = next;
    setRecordedHits(next);
    setFlashingPad(padIdx);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashingPad(null), 120);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [bpm]);

  const handlePadTap = useCallback((idx: number) => {
    recordHit(idx);
  }, [recordHit]);

  const handlePadLongPress = useCallback((idx: number) => {
    if (phaseRef.current === "recording" || phaseRef.current === "countin") return;
    setAssignSlot(idx);
  }, []);

  const handleAssignBuiltin = useCallback((setName: BuiltinSoundSet, role: SoundRole) => {
    if (assignSlot === null) return;
    const next = [...mapping];
    next[assignSlot] = { source: { type: "builtin", setName, role } };
    void persistMapping(next);
    setShowBuiltinPicker(false);
    setAssignSlot(null);
  }, [assignSlot, mapping, persistMapping]);

  const handleAssignClear = useCallback(() => {
    if (assignSlot === null) return;
    const next = [...mapping];
    next[assignSlot] = null;
    void persistMapping(next);
    setAssignSlot(null);
  }, [assignSlot, mapping, persistMapping]);

  const handleAssignFile = useCallback(async () => {
    if (assignSlot === null) return;
    const slot = assignSlot;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["audio/*"], copyToCacheDirectory: true });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const a = result.assets[0];
      const next = [...mapping];
      next[slot] = { source: { type: "import", uri: a.uri, name: a.name || "imported" } };
      await persistMapping(next);
    } catch {
      Alert.alert(t("drumKit", "pickerError"));
    } finally {
      setAssignSlot(null);
    }
  }, [assignSlot, mapping, persistMapping, t]);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderRef = useRef(recorder);
  useEffect(() => { recorderRef.current = recorder; }, [recorder]);
  const [isRecordingMic, setIsRecordingMic] = useState(false);

  const handleAssignRecord = useCallback(async () => {
    if (assignSlot === null) return;
    const slot = assignSlot;
    const granted = await ensurePermission("mic", t);
    if (!granted) {
      Alert.alert(t("drumKit", "micPermissionDenied"));
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: "mixWithOthers", shouldPlayInBackground: false });
      await recorderRef.current.prepareToRecordAsync();
      recorderRef.current.record();
      setIsRecordingMic(true);
      setTimeout(async () => {
        try { await recorderRef.current.stop(); } catch {}
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: "mixWithOthers", shouldPlayInBackground: false });
        const uri = recorderRef.current.uri;
        setIsRecordingMic(false);
        if (uri) {
          const next = [...mapping];
          next[slot] = { source: { type: "recording", uri, name: `pad-${slot + 1}` } };
          await persistMapping(next);
        }
        setAssignSlot(null);
      }, 2000);
    } catch {
      setIsRecordingMic(false);
      setAssignSlot(null);
    }
  }, [assignSlot, mapping, persistMapping, t]);

  const handleSave = useCallback(async () => {
    if (recordedHits.length === 0) {
      Alert.alert(t("drumKit", "nothingRecorded"));
      return;
    }
    const noteSamples: Record<string, string> = {};
    const noteSampleNames: Record<string, string> = {};
    const noteSampleSources: Record<string, "recording" | "import"> = {};
    for (const hit of recordedHits) {
      const beat = Math.floor(hit.cell / SUBS);
      const sub = hit.cell % SUBS;
      const key = `${beat}-${sub}`;
      const pad = mapping[hit.pad];
      if (!pad) continue;
      const resolved = await resolvePadUri(pad);
      if (!resolved) continue;
      noteSamples[key] = resolved.uri;
      noteSampleNames[key] = resolved.name;
      noteSampleSources[key] = resolved.source;
    }
    const subPattern: BeatType[] = ["normal", "normal", "normal", "normal"];
    const beatSubdivisions: Record<string, BeatType[]> = {
      "0": [...subPattern],
      "1": [...subPattern],
      "2": [...subPattern],
      "3": [...subPattern],
    };
    const beatTypes: BeatType[] = ["accent", "normal", "normal", "normal"];
    const label = (entryName.trim() || t("drumKit", "namePlaceholder")) + ` (${bpm})`;
    const entry = createPracticeEntry(label, {
      mode: "note",
      bpm,
      beatsPerMeasure: BEATS,
      beatTypes,
      beatSubdivisions,
      barRepeats: {},
      barLoopMode: "loop",
      subdivisionPattern: ["accent"],
      noteSamples,
      noteSampleNames,
      noteSampleSources,
    });
    const existing = await loadPracticeBook();
    await savePracticeBook([entry, ...existing]);
    Alert.alert(t("drumKit", "saved"));
    setPhase("idle");
    setRecordedHits([]);
    recordedHitsRef.current = [];
    setEntryName("");
  }, [recordedHits, mapping, bpm, entryName, t]);

  const handleDiscard = useCallback(() => {
    setRecordedHits([]);
    recordedHitsRef.current = [];
    setPhase("idle");
    setActiveCell(null);
  }, []);

  const padSize = useMemo(() => {
    const maxW = Math.min(360, S.ms(280, 0.4));
    return Math.floor((maxW - Spacing.sm * (DRUM_KIT_COLS - 1)) / DRUM_KIT_COLS);
  }, [S]);

  const recordedCellSet = useMemo(() => new Set(recordedHits.map((h) => h.cell)), [recordedHits]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
              paddingTop: (insets.top || webTopInset) + Spacing.md,
              paddingBottom: Spacing.lg + (insets.bottom || webBottomInset),
            },
          ]}
          onPress={() => {}}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text }]}>{t("drumKit", "title")}</Text>
            <Pressable onPress={onClose} hitSlop={8} testID="drum-kit-close">
              <Ionicons name="close" size={S.ms(22, 0.4)} color={C.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: Spacing.lg }} showsVerticalScrollIndicator={false}>
            <Text style={[styles.hint, { color: C.textSecondary }]}>
              {phase === "idle" || phase === "review" ? t("drumKit", "tapToPlay") : t("drumKit", "recordingHint")}
            </Text>

            <View style={styles.controlRow}>
              <View style={[styles.bpmBox, { borderColor: C.border, backgroundColor: C.background }]}>
                <Text style={[styles.bpmLabel, { color: C.textTertiary }]}>{t("drumKit", "bpmLabel")}</Text>
                <TextInput
                  value={String(bpm)}
                  onChangeText={(v) => {
                    const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
                    if (Number.isFinite(n)) setBpm(Math.max(40, Math.min(240, n)));
                    else setBpm(40);
                  }}
                  keyboardType="number-pad"
                  editable={phase === "idle" || phase === "review"}
                  style={[styles.bpmInput, { color: C.text }]}
                  testID="drum-kit-bpm"
                />
              </View>

              {phase === "idle" || phase === "review" ? (
                <Pressable
                  onPress={startRecording}
                  style={[styles.recordBtn, { backgroundColor: C.accent }]}
                  testID="drum-kit-record"
                >
                  <Ionicons name="radio-button-on" size={S.ms(16, 0.3)} color="#fff" />
                  <Text style={styles.recordBtnText}>{t("drumKit", "record")}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={stopRecording}
                  style={[styles.recordBtn, { backgroundColor: C.danger }]}
                  testID="drum-kit-stop"
                >
                  <Ionicons name="square" size={S.ms(14, 0.3)} color="#fff" />
                  <Text style={styles.recordBtnText}>{t("drumKit", "stop")}</Text>
                </Pressable>
              )}
            </View>

            {phase === "countin" && (
              <View style={[styles.statusBox, { borderColor: C.accent, backgroundColor: C.accent + "22" }]}>
                <Text style={[styles.statusText, { color: C.accent }]}>
                  {t("drumKit", "countIn")} {countInValue}/{BEATS}
                </Text>
              </View>
            )}
            {phase === "recording" && (
              <View style={[styles.statusBox, { borderColor: C.danger, backgroundColor: C.danger + "22" }]}>
                <Text style={[styles.statusText, { color: C.danger }]}>
                  {t("drumKit", "recording")} {(activeCell ?? 0) + 1}/{CELLS}
                </Text>
              </View>
            )}

            <View style={[styles.padGrid, { gap: Spacing.sm, alignSelf: "center" }]}>
              {Array.from({ length: DRUM_PAD_COUNT }).map((_, i) => (
                <DrumPad
                  key={`pad-${i}`}
                  index={i}
                  config={mapping[i]}
                  bgColor={C.background}
                  borderColor={C.border}
                  textColor={C.text}
                  textTertiary={C.textTertiary}
                  accent={C.accent}
                  flashing={flashingPad === i}
                  onTap={handlePadTap}
                  onLongPress={handlePadLongPress}
                  size={padSize}
                />
              ))}
            </View>

            {phase === "review" && recordedHits.length > 0 && (
              <View style={styles.reviewBox}>
                <View style={styles.gridStrip}>
                  {Array.from({ length: CELLS }).map((_, i) => {
                    const filled = recordedCellSet.has(i);
                    const beatStart = i % SUBS === 0;
                    return (
                      <View
                        key={`cell-${i}`}
                        style={[
                          styles.cellDot,
                          { borderColor: beatStart ? C.accent : C.border, backgroundColor: filled ? C.accent : C.background },
                        ]}
                      />
                    );
                  })}
                </View>
                <View style={[styles.nameRow, { borderColor: C.border, backgroundColor: C.background }]}>
                  <Text style={[styles.bpmLabel, { color: C.textTertiary }]}>{t("drumKit", "nameLabel")}</Text>
                  <TextInput
                    value={entryName}
                    onChangeText={setEntryName}
                    placeholder={t("drumKit", "namePlaceholder")}
                    placeholderTextColor={C.textTertiary}
                    style={[styles.nameInput, { color: C.text }]}
                    testID="drum-kit-name"
                  />
                </View>
                <View style={styles.reviewBtnRow}>
                  <Pressable
                    onPress={handleDiscard}
                    style={[styles.reviewBtn, { borderColor: C.border, backgroundColor: C.background }]}
                  >
                    <Text style={[styles.reviewBtnText, { color: C.textSecondary }]}>{t("drumKit", "discard")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    style={[styles.reviewBtn, { borderColor: C.accent, backgroundColor: C.accent }]}
                    testID="drum-kit-save"
                  >
                    <Text style={[styles.reviewBtnText, { color: "#fff" }]}>{t("drumKit", "save")}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>

      <Modal
        visible={assignSlot !== null && !showBuiltinPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setAssignSlot(null)}
      >
        <Pressable style={styles.assignBackdrop} onPress={() => !isRecordingMic && setAssignSlot(null)}>
          <Pressable style={[styles.assignSheet, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => {}}>
            <Text style={[styles.title, { color: C.text }]}>{t("drumKit", "assignTitle")}</Text>
            {isRecordingMic ? (
              <View style={[styles.statusBox, { borderColor: C.danger, backgroundColor: C.danger + "22", alignSelf: "stretch" }]}>
                <Text style={[styles.statusText, { color: C.danger }]}>{t("drumKit", "recording")}…</Text>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => setShowBuiltinPicker(true)}
                  style={[styles.assignItem, { borderColor: C.border }]}
                  testID="assign-builtin"
                >
                  <MaterialCommunityIcons name="music-circle-outline" size={S.ms(20, 0.4)} color={C.accent} />
                  <Text style={[styles.assignItemText, { color: C.text }]}>{t("drumKit", "sourceBuiltin")}</Text>
                </Pressable>
                <Pressable
                  onPress={handleAssignFile}
                  style={[styles.assignItem, { borderColor: C.border }]}
                  testID="assign-file"
                >
                  <Ionicons name="document-text-outline" size={S.ms(20, 0.4)} color={C.accent} />
                  <Text style={[styles.assignItemText, { color: C.text }]}>{t("drumKit", "sourceFile")}</Text>
                </Pressable>
                {Platform.OS !== "web" && (
                  <Pressable
                    onPress={handleAssignRecord}
                    style={[styles.assignItem, { borderColor: C.border }]}
                    testID="assign-record"
                  >
                    <Ionicons name="mic-outline" size={S.ms(20, 0.4)} color={C.accent} />
                    <Text style={[styles.assignItemText, { color: C.text }]}>{t("drumKit", "sourceRecord")}</Text>
                  </Pressable>
                )}
                {assignSlot !== null && mapping[assignSlot] && (
                  <Pressable
                    onPress={handleAssignClear}
                    style={[styles.assignItem, { borderColor: C.danger }]}
                  >
                    <Ionicons name="trash-outline" size={S.ms(20, 0.4)} color={C.danger} />
                    <Text style={[styles.assignItemText, { color: C.danger }]}>{t("drumKit", "clear")}</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setAssignSlot(null)}
                  style={[styles.assignItem, { borderColor: C.border, justifyContent: "center" }]}
                >
                  <Text style={[styles.assignItemText, { color: C.textSecondary }]}>{t("drumKit", "cancel")}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showBuiltinPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBuiltinPicker(false)}
      >
        <Pressable style={styles.assignBackdrop} onPress={() => setShowBuiltinPicker(false)}>
          <Pressable style={[styles.assignSheet, { backgroundColor: C.surface, borderColor: C.border, maxHeight: "80%" }]} onPress={() => {}}>
            <Text style={[styles.title, { color: C.text }]}>{t("drumKit", "builtinPick")}</Text>
            <FlatList
              data={listBuiltinPadOptions()}
              keyExtractor={(item, i) => `b-${item.setName}-${item.role}-${i}`}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleAssignBuiltin(item.setName, item.role)}
                  style={[styles.assignItem, { borderColor: C.border }]}
                >
                  <MaterialCommunityIcons name="music-note" size={S.ms(18, 0.4)} color={C.accent} />
                  <Text style={[styles.assignItemText, { color: C.text }]}>
                    {item.setName} · {item.role}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end" as const,
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: Spacing.lg,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: Spacing.sm,
  },
  title: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.subtitle,
    marginBottom: Spacing.xs,
  },
  hint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.small,
    marginBottom: Spacing.md,
  },
  controlRow: {
    flexDirection: "row" as const,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  bpmBox: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  bpmLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.caption,
  },
  bpmInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.body,
    paddingVertical: 0,
  },
  recordBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  recordBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.body,
    color: "#fff",
  },
  statusBox: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    alignItems: "center" as const,
  },
  statusText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.body,
  },
  padGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    width: 360,
    maxWidth: "100%",
  },
  pad: {
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: Spacing.xs,
  },
  padLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.caption,
    textAlign: "center" as const,
  },
  reviewBox: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  gridStrip: {
    flexDirection: "row" as const,
    gap: Spacing.xxs,
    flexWrap: "wrap" as const,
    justifyContent: "center" as const,
  },
  cellDot: {
    width: 14,
    height: 14,
    borderRadius: Radius.xs,
    borderWidth: 1,
  },
  nameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  nameInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.body,
    paddingVertical: 0,
  },
  reviewBtnRow: {
    flexDirection: "row" as const,
    gap: Spacing.md,
  },
  reviewBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center" as const,
  },
  reviewBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.body,
  },
  assignBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: Spacing.lg,
  },
  assignSheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  assignItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  assignItemText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.body,
  },
});

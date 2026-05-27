import React, { useRef, useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { confirmDestructive } from "@/lib/confirm";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import {
  useAudioPlayer,
  useAudioRecorder,
  createAudioPlayer,
  RecordingPresets,
} from "expo-audio";
import { AnimatedModal } from "@/components/AnimatedModal";
import { acquireAudioSession, releaseAudioSession } from "@/lib/audio-session";
import { ensurePermission } from "@/lib/permissions";
import { saveCustomSoundSets, BUILTIN_SOUND_SETS } from "@/lib/storage";
import type { BuiltinSoundSet, SoundRole, CustomSoundSetConfig, CustomSoundSample } from "@/lib/storage";
import { soundSets } from "@/lib/metronome-engine";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { safePlay } from "@/lib/audio-utils";
import { logger } from "@/lib/logger";
import { useScale } from "@/lib/scale";
import { FontSize } from "@/constants/tokens";
import Colors from "@/constants/colors";

interface CustomSoundSetEditorProps {
  visible: boolean;
  slot: string | null;
  customSoundSets: Record<string, CustomSoundSetConfig>;
  onCustomSoundSetsChange: (configs: Record<string, CustomSoundSetConfig>) => void;
  currentSoundSet: string;
  onSoundSetChange?: (ss: string) => void;
  onClose: () => void;
}

const defaultSample = (role: SoundRole): CustomSoundSample => ({
  type: "builtin",
  sourceSet: "classic",
  sourceRole: role,
  duration: 0.5,
});

const ROLE_OPTIONS: { value: SoundRole; label: string }[] = [
  { value: "strong", label: "STRONG" },
  { value: "high", label: "ACCENT" },
  { value: "low", label: "NORMAL" },
];

export function CustomSoundSetEditor({
  visible,
  slot,
  customSoundSets,
  onCustomSoundSetsChange,
  currentSoundSet,
  onSoundSetChange,
  onClose,
}: CustomSoundSetEditorProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const ms = S.ms;

  const [customName, setCustomName] = useState("");
  const [customStrong, setCustomStrong] = useState<CustomSoundSample>(defaultSample("strong"));
  const [customAccent, setCustomAccent] = useState<CustomSoundSample>(defaultSample("high"));
  const [customNormal, setCustomNormal] = useState<CustomSoundSample>(defaultSample("low"));
  const [recordingSlot, setRecordingSlot] = useState<"strong" | "accent" | "normal" | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 빌트인 미리듣기 플레이어 (21개)
  const classicStrong = useAudioPlayer(soundSets.classic.strong);
  const classicHigh   = useAudioPlayer(soundSets.classic.high);
  const classicLow    = useAudioPlayer(soundSets.classic.low);
  const woodblockStrong = useAudioPlayer(soundSets.woodblock.strong);
  const woodblockHigh   = useAudioPlayer(soundSets.woodblock.high);
  const woodblockLow    = useAudioPlayer(soundSets.woodblock.low);
  const cowbellStrong = useAudioPlayer(soundSets.cowbell.strong);
  const cowbellHigh   = useAudioPlayer(soundSets.cowbell.high);
  const cowbellLow    = useAudioPlayer(soundSets.cowbell.low);
  const digitalStrong = useAudioPlayer(soundSets.digital.strong);
  const digitalHigh   = useAudioPlayer(soundSets.digital.high);
  const digitalLow    = useAudioPlayer(soundSets.digital.low);
  const rimshotStrong = useAudioPlayer(soundSets.rimshot.strong);
  const rimshotHigh   = useAudioPlayer(soundSets.rimshot.high);
  const rimshotLow    = useAudioPlayer(soundSets.rimshot.low);
  const triangleStrong = useAudioPlayer(soundSets.triangle.strong);
  const triangleHigh   = useAudioPlayer(soundSets.triangle.high);
  const triangleLow    = useAudioPlayer(soundSets.triangle.low);
  const hihatStrong = useAudioPlayer(soundSets.hihat.strong);
  const hihatHigh   = useAudioPlayer(soundSets.hihat.high);
  const hihatLow    = useAudioPlayer(soundSets.hihat.low);

  const previewPlayers: Partial<Record<BuiltinSoundSet, typeof classicStrong[]>> = {
    classic:   [classicStrong, classicHigh, classicLow],
    woodblock: [woodblockStrong, woodblockHigh, woodblockLow],
    cowbell:   [cowbellStrong, cowbellHigh, cowbellLow],
    digital:   [digitalStrong, digitalHigh, digitalLow],
    rimshot:   [rimshotStrong, rimshotHigh, rimshotLow],
    triangle:  [triangleStrong, triangleHigh, triangleLow],
    hihat:     [hihatStrong, hihatHigh, hihatLow],
  };

  const sampleRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const sampleRecorderRef = useRef(sampleRecorder);
  const sampleRecordingActiveRef = useRef(false);
  useEffect(() => { sampleRecorderRef.current = sampleRecorder; }, [sampleRecorder]);

  useEffect(() => {
    return () => {
      if (sampleRecordingActiveRef.current) {
        sampleRecordingActiveRef.current = false;
        try { void sampleRecorderRef.current.stop(); } catch {}
      }
      void releaseAudioSession("cseRec");
    };
  }, []);

  useEffect(() => {
    if (!visible || !slot) return;
    const existing = customSoundSets[slot];
    if (existing) {
      setCustomName(existing.name);
      setCustomStrong(existing.strong.type ? existing.strong : { ...existing.strong, type: "builtin" });
      setCustomAccent(existing.accent.type ? existing.accent : { ...existing.accent, type: "builtin" });
      setCustomNormal(existing.normal.type ? existing.normal : { ...existing.normal, type: "builtin" });
    } else {
      setCustomName(t("customSoundSet", "namePlaceholder"));
      setCustomStrong(defaultSample("strong"));
      setCustomAccent(defaultSample("high"));
      setCustomNormal(defaultSample("low"));
    }
    setRecordingSlot(null);
    setIsRecording(false);
  }, [visible, slot]); // eslint-disable-line react-hooks/exhaustive-deps

  const playCustomSampleUri = useCallback(async (uri: string, duration: number) => {
    if (previewStopTimerRef.current) {
      clearTimeout(previewStopTimerRef.current);
      previewStopTimerRef.current = null;
    }
    try {
      const player = createAudioPlayer({ uri });
      safePlay(player, "cse.previewCustomUri");
      previewStopTimerRef.current = setTimeout(() => {
        try { player.pause(); player.remove(); } catch {}
        previewStopTimerRef.current = null;
      }, Math.max(150, duration * 1000));
    } catch (e) {
      logger.warn("CSE preview failed:", e);
    }
  }, []);

  const previewBuiltin = useCallback((sourceSet: BuiltinSoundSet, sourceRole: SoundRole) => {
    const players = previewPlayers[sourceSet];
    if (!players) return;
    const idx = sourceRole === "strong" ? 0 : sourceRole === "high" ? 1 : 2;
    try { players[idx].seekTo(0); } catch {}
    safePlay(players[idx], "cse.previewBuiltin");
  }, [previewPlayers]);

  const probeUriDuration = useCallback(async (uri: string): Promise<number> => {
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
        if (typeof d === "number" && d > 0 && isFinite(d)) { clearInterval(tick); finish(d); }
        else if (Date.now() - startedAt > 4000) { clearInterval(tick); finish(0); }
      }, 80);
    });
  }, []);

  const startSampleRecording = useCallback(async (slt: "strong" | "accent" | "normal") => {
    const ok = await ensurePermission("mic", t);
    if (!ok) return;
    setRecordingSlot(slt);
    let acquired = false;
    try {
      await acquireAudioSession("cseRec", "recording");
      acquired = true;
      await sampleRecorderRef.current.prepareToRecordAsync();
      sampleRecorderRef.current.record();
      sampleRecordingActiveRef.current = true;
      setIsRecording(true);
      setRecordDuration(0);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const startTime = Date.now();
      recordTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setRecordDuration(elapsed);
        if (elapsed >= 3) stopSampleRecording(slt);
      }, 100);
    } catch (e) {
      logger.error("CSE recording failed:", e);
      setRecordingSlot(null);
      if (acquired) { try { await releaseAudioSession("cseRec"); } catch {} }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopSampleRecording = useCallback(async (slt: "strong" | "accent" | "normal") => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    if (!sampleRecordingActiveRef.current) { setIsRecording(false); setRecordingSlot(null); return; }
    try {
      try { await sampleRecorderRef.current.stop(); }
      finally { sampleRecordingActiveRef.current = false; await releaseAudioSession("cseRec"); }
      const uri = sampleRecorderRef.current.uri;
      if (uri) {
        const rawDur = await probeUriDuration(uri);
        const dur = rawDur > 0 ? Math.min(3.0, Math.round(rawDur * 10) / 10) : 0.5;
        const sample: CustomSoundSample = { type: "custom", sampleUri: uri, sampleName: t("customSoundSet", "record"), duration: dur };
        if (slt === "strong") setCustomStrong(sample);
        else if (slt === "accent") setCustomAccent(sample);
        else setCustomNormal(sample);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) { logger.error("CSE stop recording failed:", e); }
    setIsRecording(false);
    setRecordingSlot(null);
  }, [t, probeUriDuration]);

  const importSampleFile = useCallback(async (slt: "strong" | "accent" | "normal") => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["audio/*"], copyToCacheDirectory: true });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const fileSizeMB = asset.size ? asset.size / (1024 * 1024) : 0;
      if (fileSizeMB > 50) { Alert.alert(t("customSoundSet", "importError")); return; }
      const rawDur = await probeUriDuration(asset.uri);
      const dur = rawDur > 0 ? Math.min(3.0, Math.round(rawDur * 10) / 10) : 0.5;
      const name = asset.name ? asset.name.replace(/\.[^.]+$/, "").substring(0, 12) : t("customSoundSet", "import");
      const sample: CustomSoundSample = { type: "custom", sampleUri: asset.uri, sampleName: name, duration: dur };
      if (slt === "strong") setCustomStrong(sample);
      else if (slt === "accent") setCustomAccent(sample);
      else setCustomNormal(sample);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      logger.error("CSE import failed:", e);
      Alert.alert(t("customSoundSet", "importError"));
    }
  }, [t, probeUriDuration]);

  const handleSave = useCallback(() => {
    if (!slot) return;
    const updated = {
      ...customSoundSets,
      [slot]: {
        name: customName || t("customSoundSet", "namePlaceholder"),
        strong: customStrong,
        accent: customAccent,
        normal: customNormal,
      },
    };
    onCustomSoundSetsChange(updated);
    saveCustomSoundSets(updated);
    onClose();
  }, [slot, customName, customStrong, customAccent, customNormal, customSoundSets, onCustomSoundSetsChange, t, onClose]);

  const handleDelete = useCallback(() => {
    if (!slot) return;
    confirmDestructive(t("customSoundSet", "deleteConfirm"), {
      title: t("customSoundSet", "deleteTitle"),
      confirmText: t("customSoundSet", "delete"),
      cancelText: t("customSoundSet", "cancel"),
      onConfirm: () => {
        const updated = { ...customSoundSets };
        delete updated[slot];
        onCustomSoundSetsChange(updated);
        saveCustomSoundSets(updated);
        if (currentSoundSet === slot) onSoundSetChange?.("classic");
        onClose();
      },
    });
  }, [slot, customSoundSets, onCustomSoundSetsChange, currentSoundSet, onSoundSetChange, t, onClose]);

  const styles = makeStyles(C);

  const items: { label: string; state: CustomSoundSample; setter: (s: CustomSoundSample) => void; slot: "strong" | "accent" | "normal" }[] = [
    { label: t("customSoundSet", "strongSample"), state: customStrong, setter: setCustomStrong, slot: "strong" },
    { label: t("customSoundSet", "accentSample"), state: customAccent, setter: setCustomAccent, slot: "accent" },
    { label: t("customSoundSet", "normalSample"), state: customNormal, setter: setCustomNormal, slot: "normal" },
  ];

  if (!slot) return null;
  const isExisting = !!customSoundSets[slot];

  return (
    <AnimatedModal visible={visible} onRequestClose={onClose} transparent>
      <View style={styles.header}>
        <Text style={styles.title}>{t("customSoundSet", "title")}</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={ms(20, 0.4)} color={C.textSecondary} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* 이름 */}
        <View style={styles.nameRow}>
          <Text style={styles.fieldLabel}>{t("customSoundSet", "name")}</Text>
          <TextInput
            style={styles.nameInput}
            value={customName}
            onChangeText={setCustomName}
            placeholder={t("customSoundSet", "namePlaceholder")}
            placeholderTextColor={C.textTertiary}
            maxLength={12}
          />
        </View>

        {/* STRONG / ACCENT / NORMAL */}
        {items.map((item) => {
          const sampleType = item.state.type || "builtin";
          const isRecordingThis = recordingSlot === item.slot && isRecording;
          return (
            <View key={item.slot} style={styles.sampleSection}>
              <View style={styles.sampleHeader}>
                <Text style={styles.sampleTitle}>{item.label}</Text>
                <Pressable
                  onPress={() => {
                    if (sampleType === "custom" && item.state.sampleUri) {
                      playCustomSampleUri(item.state.sampleUri, item.state.duration);
                    } else if (sampleType === "builtin" && item.state.sourceSet && item.state.sourceRole) {
                      previewBuiltin(item.state.sourceSet, item.state.sourceRole);
                    }
                  }}
                  style={styles.previewBtn}
                >
                  <Ionicons name="play" size={ms(14, 0.4)} color={C.accent} />
                </Pressable>
              </View>

              {/* 소스 타입 */}
              <View style={styles.pickerRow}>
                <Text style={styles.pickerLabel}>{t("customSoundSet", "source")}</Text>
                <View style={styles.chipRow}>
                  {(["builtin", "custom"] as const).map(tp => (
                    <Pressable
                      key={tp}
                      style={[styles.chip, sampleType === tp && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                      onPress={() => {
                        item.setter({ ...item.state, type: tp });
                        if (Platform.OS !== "web") Haptics.selectionAsync();
                      }}
                    >
                      <Text style={[styles.chipText, sampleType === tp && { color: C.accent }]}>
                        {tp === "builtin" ? t("customSoundSet", "sourceBuiltin") : t("customSoundSet", "sourceCustom")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {sampleType === "builtin" ? (
                <>
                  {/* 빌트인 사운드셋 선택 */}
                  <View style={styles.pickerRow}>
                    <Text style={styles.pickerLabel}>{t("customSoundSet", "source")}</Text>
                    <View style={styles.chipRow}>
                      {BUILTIN_SOUND_SETS.map(bs => {
                        const active = item.state.sourceSet === bs;
                        return (
                          <Pressable
                            key={bs}
                            style={[styles.chip, active && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                            onPress={() => {
                              item.setter({ ...item.state, type: "builtin", sourceSet: bs });
                              if (Platform.OS !== "web") Haptics.selectionAsync();
                            }}
                          >
                            <Text style={[styles.chipText, active && { color: C.accent }]}>{t("soundSets", bs)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  {/* 역할 선택 */}
                  <View style={styles.pickerRow}>
                    <Text style={styles.pickerLabel}>{t("customSoundSet", "role")}</Text>
                    <View style={styles.chipRow}>
                      {ROLE_OPTIONS.map(ro => {
                        const active = item.state.sourceRole === ro.value;
                        return (
                          <Pressable
                            key={ro.value}
                            style={[styles.chip, active && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                            onPress={() => {
                              item.setter({ ...item.state, type: "builtin", sourceRole: ro.value });
                              previewBuiltin(item.state.sourceSet || "classic", ro.value);
                              if (Platform.OS !== "web") Haptics.selectionAsync();
                            }}
                          >
                            <Text style={[styles.chipText, active && { color: C.accent }]}>{ro.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              ) : (
                <>
                  {item.state.sampleUri ? (
                    <View style={styles.customSampleRow}>
                      <Ionicons name="musical-note" size={ms(14, 0.4)} color={C.accent} />
                      <Text style={styles.customSampleName} numberOfLines={1}>
                        {item.state.sampleName || t("customSoundSet", "sampleLoaded")}
                      </Text>
                      <Pressable
                        onPress={() => { item.setter({ ...item.state, sampleUri: undefined, sampleName: undefined }); }}
                      >
                        <Ionicons name="close-circle" size={ms(16, 0.4)} color="#F85149" />
                      </Pressable>
                    </View>
                  ) : isRecordingThis ? (
                    <View style={styles.recordingRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={[styles.recordingDot]} />
                        <Text style={styles.recordingText}>
                          {t("customSoundSet", "recording")} {recordDuration.toFixed(1)}s
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.actionBtn, { backgroundColor: "#F85149" }]}
                        onPress={() => stopSampleRecording(item.slot)}
                      >
                        <Ionicons name="stop" size={ms(12, 0.4)} color="#fff" />
                        <Text style={styles.actionBtnText}>{t("customSoundSet", "stopRecord")}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        style={[styles.actionBtn, { flex: 1, borderColor: C.accent, borderWidth: 1, backgroundColor: C.accentDim }]}
                        onPress={() => startSampleRecording(item.slot)}
                      >
                        <Ionicons name="mic" size={ms(12, 0.4)} color={C.accent} />
                        <Text style={[styles.actionBtnText, { color: C.accent }]}>{t("customSoundSet", "record")}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionBtn, { flex: 1, borderColor: C.accent, borderWidth: 1, backgroundColor: C.accentDim }]}
                        onPress={() => importSampleFile(item.slot)}
                      >
                        <Ionicons name="folder-open" size={ms(12, 0.4)} color={C.accent} />
                        <Text style={[styles.actionBtnText, { color: C.accent }]}>{t("customSoundSet", "import")}</Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}

              {/* 재생 길이 */}
              <View style={styles.pickerRow}>
                <Text style={styles.pickerLabel}>{t("customSoundSet", "duration")}</Text>
                <Pressable
                  style={styles.durationBtn}
                  onPress={() => item.setter({ ...item.state, duration: Math.max(0.1, Math.round((item.state.duration - 0.1) * 10) / 10) })}
                >
                  <Ionicons name="remove" size={ms(12, 0.4)} color={C.text} />
                </Pressable>
                <Text style={[styles.durationValue, { color: C.accent }]}>{item.state.duration.toFixed(1)}s</Text>
                <Pressable
                  style={styles.durationBtn}
                  onPress={() => item.setter({ ...item.state, duration: Math.min(3.0, Math.round((item.state.duration + 0.1) * 10) / 10) })}
                >
                  <Ionicons name="add" size={ms(12, 0.4)} color={C.text} />
                </Pressable>
              </View>
            </View>
          );
        })}

        {/* 액션 버튼 */}
        <View style={styles.actions}>
          {isExisting && (
            <Pressable style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={ms(14, 0.4)} color="#F85149" />
              <Text style={styles.deleteBtnText}>{t("customSoundSet", "delete")}</Text>
            </Pressable>
          )}
          <Pressable style={[styles.saveBtn, { backgroundColor: C.accent, flex: 1 }]} onPress={handleSave}>
            <Ionicons name="checkmark" size={ms(14, 0.4)} color={C.background} />
            <Text style={[styles.saveBtnText, { color: C.background }]}>{t("customSoundSet", "save")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </AnimatedModal>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 15, color: C.text },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  fieldLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 12, color: C.textSecondary, width: 48 },
  nameInput: {
    flex: 1, fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: C.text,
    backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: C.border,
  },
  sampleSection: { gap: 6, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginBottom: 4 },
  sampleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sampleTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 12, color: C.text },
  previewBtn: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: C.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border,
  },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pickerLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 11, color: C.textTertiary, width: 44 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, flex: 1 },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 10, color: C.textSecondary },
  customSampleRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: C.border,
  },
  customSampleName: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 11, color: C.text, flex: 1 },
  recordingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#F85149" },
  recordingText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 11, color: "#F85149" },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  actionBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 11, color: "#fff" },
  durationBtn: {
    width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  durationValue: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 12, minWidth: 32, textAlign: "center" },
  actions: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 8 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(248,81,73,0.3)", backgroundColor: "rgba(248,81,73,0.08)",
  },
  deleteBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 12, color: "#F85149" },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  saveBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 12 },
});

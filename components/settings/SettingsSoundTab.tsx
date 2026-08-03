import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  PanResponder,
  LayoutChangeEvent,
  Switch,
  Alert,
} from "react-native";
import { TextInput } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  createAudioPlayer,
  RecordingPresets,
} from "expo-audio";
import { acquireAudioSession, releaseAudioSession } from "@/lib/audio-session";
import * as DocumentPicker from "expo-document-picker";
import { useScale } from "@/lib/scale";
import { Radius, FontSize, Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { SoundSet, BuiltinSoundSet, SoundRole, CustomSoundSetConfig, CustomSoundSample } from "@/lib/storage";
import { saveCustomSoundSets, BUILTIN_SOUND_SETS } from "@/lib/storage";
import { confirmDestructive } from "@/lib/confirm";
import { logger } from "@/lib/logger";
import { ensurePermission } from "@/lib/permissions";
import { make_styles, make_csStyles } from "@/components/SettingsModal.styles";
import { getSoundSetOptions } from "@/components/SettingsModal.helpers";
import { HelpIcon } from "@/components/HelpIcon";

interface SettingsSoundTabProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  sampleVolume: number;
  onSampleVolumeChange: (volume: number) => void;
  soundSet: SoundSet;
  onSoundSetChange: (value: SoundSet) => void;
  layerSoundSets: Record<number, SoundSet>;
  onLayerSoundSetsChange: (value: Record<number, SoundSet>) => void;
  customSoundSets: Record<string, CustomSoundSetConfig>;
  onCustomSoundSetsChange: (configs: Record<string, CustomSoundSetConfig>) => void;
  audioOffsetMs: number;
  onAudioOffsetChange: (value: number) => void;
  timerStopMode: "immediate" | "end-of-cycle";
  onTimerStopModeChange: (value: "immediate" | "end-of-cycle") => void;
  backgroundPlay: boolean;
  onBackgroundPlayChange: (value: boolean) => void;
  autoResumeAfterInterruption: boolean;
  onAutoResumeAfterInterruptionChange: (value: boolean) => void;
  playSoundPreview: (set: SoundSet) => void;
  previewCustomSample: (sourceSet: BuiltinSoundSet, sourceRole: SoundRole) => void;
  playCustomSampleUri: (uri: string, duration: number) => Promise<void>;
}

export function SettingsSoundTab({
  volume,
  onVolumeChange,
  sampleVolume,
  onSampleVolumeChange,
  soundSet,
  onSoundSetChange,
  layerSoundSets,
  customSoundSets,
  onCustomSoundSetsChange,
  audioOffsetMs,
  onAudioOffsetChange,
  timerStopMode,
  onTimerStopModeChange,
  backgroundPlay,
  onBackgroundPlayChange,
  autoResumeAfterInterruption,
  onAutoResumeAfterInterruptionChange,
  playSoundPreview,
  previewCustomSample,
  playCustomSampleUri,
}: SettingsSoundTabProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = make_styles(C);
  const csStyles = make_csStyles(C);
  const { t } = useLanguage();

  // Volume slider state
  const trackRef = useRef<View>(null);
  const trackWidthRef = useRef(0);
  const trackLeftRef = useRef(0);
  const lastHapticRef = useRef(volume);

  // Sample volume slider state
  const sampleTrackRef = useRef<View>(null);
  const sampleTrackWidthRef = useRef(0);
  const sampleTrackLeftRef = useRef(0);
  const lastSampleHapticRef = useRef(0);

  // Custom sound editor state
  const layerKeys = Object.keys(layerSoundSets).map((k) => Number(k)).filter((n) => !isNaN(n) && n > 0);
  const initialLayerCount = layerKeys.length > 0 ? Math.max(...layerKeys) : 1;
  const [layerSoundRowCount] = useState(initialLayerCount);
  const [editingCustomSlot, setEditingCustomSlot] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const defaultSample = (role: SoundRole): CustomSoundSample => ({ type: "builtin", sourceSet: "classic", sourceRole: role, duration: 0.5 });
  const [customStrong, setCustomStrong] = useState<CustomSoundSample>(defaultSample("strong"));
  const [customAccent, setCustomAccent] = useState<CustomSoundSample>(defaultSample("high"));
  const [customNormal, setCustomNormal] = useState<CustomSoundSample>(defaultSample("low"));
  const [recordingSlot, setRecordingSlot] = useState<"strong" | "accent" | "normal" | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      void releaseAudioSession("settingsSampleRec");
    };
  }, []);

  // Volume slider callbacks
  const onVolumeChangeRef = useRef(onVolumeChange);
  onVolumeChangeRef.current = onVolumeChange;

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
  }, []);

  const updateVolumeFromX = useCallback((pageX: number) => {
    const w = trackWidthRef.current;
    if (w <= 0) return;
    const relX = pageX - trackLeftRef.current;
    const newVol = Math.max(0, Math.min(2, (relX / w) * 2));
    const rounded = Math.round(newVol * 100) / 100;
    const step = Math.round(rounded * 10);
    const lastStep = Math.round(lastHapticRef.current * 10);
    if (step !== lastStep) {
      lastHapticRef.current = rounded;
      if (Platform.OS !== "web") {
        if (rounded === 0 || rounded === 1 || rounded === 2) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          Haptics.selectionAsync();
        }
      }
    }
    onVolumeChangeRef.current(rounded);
  }, []);

  const updateVolumeRef = useRef(updateVolumeFromX);
  updateVolumeRef.current = updateVolumeFromX;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (trackRef.current) {
          (trackRef.current as any).measureInWindow?.((x: number) => {
            trackLeftRef.current = x + 8;
            updateVolumeRef.current(e.nativeEvent.pageX);
          });
        } else {
          updateVolumeRef.current(e.nativeEvent.pageX);
        }
      },
      onPanResponderMove: (e) => { updateVolumeRef.current(e.nativeEvent.pageX); },
      onPanResponderRelease: () => {},
    })
  ).current;

  const nativePanHandlers = Platform.OS !== "web" ? panResponder.panHandlers : {};

  const handleWebMouse = useCallback((e: any) => {
    if (Platform.OS !== "web") return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    trackLeftRef.current = rect.left;
    const startUpdate = (me: MouseEvent) => { updateVolumeFromX(me.clientX); };
    startUpdate(e.nativeEvent);
    const handleMove = (me: MouseEvent) => { startUpdate(me); };
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [updateVolumeFromX]);

  // Sample volume slider callbacks
  const onSampleVolumeChangeRef = useRef(onSampleVolumeChange);
  onSampleVolumeChangeRef.current = onSampleVolumeChange;

  const onSampleTrackLayout = useCallback((e: LayoutChangeEvent) => {
    sampleTrackWidthRef.current = e.nativeEvent.layout.width;
  }, []);

  const updateSampleVolumeFromX = useCallback((pageX: number) => {
    const w = sampleTrackWidthRef.current;
    if (w <= 0) return;
    const relX = pageX - sampleTrackLeftRef.current;
    const newVol = Math.max(0, Math.min(1, relX / w));
    const rounded = Math.round(newVol * 100) / 100;
    const step = Math.round(rounded * 20);
    const lastStep = Math.round(lastSampleHapticRef.current * 20);
    if (step !== lastStep) {
      lastSampleHapticRef.current = rounded;
      if (Platform.OS !== "web") {
        if (rounded === 0 || rounded === 1) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          Haptics.selectionAsync();
        }
      }
    }
    onSampleVolumeChangeRef.current(rounded);
  }, []);

  const updateSampleVolumeRef = useRef(updateSampleVolumeFromX);
  updateSampleVolumeRef.current = updateSampleVolumeFromX;

  const samplePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (sampleTrackRef.current) {
          (sampleTrackRef.current as any).measureInWindow?.((x: number) => {
            sampleTrackLeftRef.current = x + 8;
            updateSampleVolumeRef.current(e.nativeEvent.pageX);
          });
        } else {
          updateSampleVolumeRef.current(e.nativeEvent.pageX);
        }
      },
      onPanResponderMove: (e) => { updateSampleVolumeRef.current(e.nativeEvent.pageX); },
      onPanResponderRelease: () => {},
    })
  ).current;

  const sampleNativePanHandlers = Platform.OS !== "web" ? samplePanResponder.panHandlers : {};

  const handleSampleWebMouse = useCallback((e: any) => {
    if (Platform.OS !== "web") return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    sampleTrackLeftRef.current = rect.left;
    const startUpdate = (me: MouseEvent) => { updateSampleVolumeFromX(me.clientX); };
    startUpdate(e.nativeEvent);
    const handleMove = (me: MouseEvent) => { startUpdate(me); };
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [updateSampleVolumeFromX]);

  const volumeIcon = volume === 0 ? "volume-off" : volume < 0.15 ? "volume-low" : volume < 0.5 ? "volume-medium" : "volume-high";
  const pct = Math.round(volume * 100);
  const sampleVolPct = Math.round(sampleVolume * 100);
  const sampleVolumeIcon = sampleVolume === 0 ? "volume-off" : sampleVolume < 0.3 ? "volume-low" : sampleVolume < 0.7 ? "volume-medium" : "volume-high";

  // Custom sound editor callbacks
  const openCustomEditor = useCallback((slot: string) => {
    const existing = customSoundSets[slot];
    if (existing) {
      setCustomName(existing.name);
      setCustomStrong(existing.strong.type ? existing.strong : { ...existing.strong, type: "builtin" as const });
      setCustomAccent(existing.accent.type ? existing.accent : { ...existing.accent, type: "builtin" as const });
      setCustomNormal(existing.normal.type ? existing.normal : { ...existing.normal, type: "builtin" as const });
    } else {
      setCustomName(t("customSoundSet", "namePlaceholder"));
      setCustomStrong(defaultSample("strong"));
      setCustomAccent(defaultSample("high"));
      setCustomNormal(defaultSample("low"));
    }
    setEditingCustomSlot(slot);
    setRecordingSlot(null);
    setIsRecording(false);
  }, [customSoundSets, t]);

  const saveCustomSet = useCallback(() => {
    if (!editingCustomSlot) return;
    const updated = {
      ...customSoundSets,
      [editingCustomSlot]: {
        name: customName || t("customSoundSet", "namePlaceholder"),
        strong: customStrong,
        accent: customAccent,
        normal: customNormal,
      },
    };
    onCustomSoundSetsChange(updated);
    saveCustomSoundSets(updated);
    setEditingCustomSlot(null);
  }, [editingCustomSlot, customName, customStrong, customAccent, customNormal, customSoundSets, onCustomSoundSetsChange, t]);

  const deleteCustomSet = useCallback((slot: string) => {
    confirmDestructive(t("customSoundSet", "deleteConfirm"), {
      title: t("customSoundSet", "deleteTitle"),
      confirmText: t("customSoundSet", "delete"),
      cancelText: t("customSoundSet", "cancel"),
      onConfirm: () => {
        const updated = { ...customSoundSets };
        delete updated[slot];
        onCustomSoundSetsChange(updated);
        saveCustomSoundSets(updated);
        if (soundSet === slot) onSoundSetChange("classic");
        if (editingCustomSlot === slot) setEditingCustomSlot(null);
      },
    });
  }, [customSoundSets, onCustomSoundSetsChange, soundSet, onSoundSetChange, editingCustomSlot, t]);

  const getNextCustomSlot = useCallback((): string | null => {
    const slots = ["custom1", "custom2", "custom3"];
    for (const s of slots) {
      if (!customSoundSets[s]) return s;
    }
    return null;
  }, [customSoundSets]);

  const ROLE_OPTIONS: { value: SoundRole; labelKey: "roleStrong" | "roleAccent" | "roleNormal" }[] = [
    { value: "strong", labelKey: "roleStrong" },
    { value: "high", labelKey: "roleAccent" },
    { value: "low", labelKey: "roleNormal" },
  ];

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

  const startSampleRecording = useCallback(async (slot: "strong" | "accent" | "normal") => {
    const ok = await ensurePermission("mic", t);
    if (!ok) return;
    setRecordingSlot(slot);
    let acquired = false;
    try {
      await acquireAudioSession("settingsSampleRec", "recording");
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
        if (elapsed >= 3) stopSampleRecording(slot);
      }, 100);
    } catch (e) {
      logger.error("Failed to start recording:", e);
      setRecordingSlot(null);
      if (acquired) {
        try { await releaseAudioSession("settingsSampleRec"); } catch {}
      }
    }
  }, []);

  const stopSampleRecording = useCallback(async (slot: "strong" | "accent" | "normal") => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    if (!sampleRecordingActiveRef.current) { setIsRecording(false); setRecordingSlot(null); return; }
    try {
      try {
        await sampleRecorderRef.current.stop();
      } finally {
        sampleRecordingActiveRef.current = false;
        await releaseAudioSession("settingsSampleRec");
      }
      const uri = sampleRecorderRef.current.uri;
      if (uri) {
        const rawDur = await probeUriDuration(uri);
        const dur = rawDur > 0 ? Math.min(3.0, Math.round(rawDur * 10) / 10) : 0.5;
        const sample: CustomSoundSample = { type: "custom", sampleUri: uri, sampleName: t("customSoundSet", "record"), duration: dur };
        if (slot === "strong") setCustomStrong(sample);
        else if (slot === "accent") setCustomAccent(sample);
        else setCustomNormal(sample);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) { logger.error("Failed to stop recording:", e); }
    setIsRecording(false);
    setRecordingSlot(null);
  }, [t, probeUriDuration]);

  const importSampleFile = useCallback(async (slot: "strong" | "accent" | "normal") => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["audio/*"], copyToCacheDirectory: true });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const fileUri = asset.uri;
      const fileSizeMB = asset.size ? asset.size / (1024 * 1024) : 0;
      if (fileSizeMB > 50) {
        Alert.alert(t("customSoundSet", "importError"));
        return;
      }
      const rawDur = await probeUriDuration(fileUri);
      const dur = rawDur > 0 ? Math.min(3.0, Math.round(rawDur * 10) / 10) : 0.5;
      const name = asset.name ? asset.name.replace(/\.[^.]+$/, "").substring(0, 12) : t("customSoundSet", "import");
      const sample: CustomSoundSample = { type: "custom", sampleUri: fileUri, sampleName: name, duration: dur };
      if (slot === "strong") setCustomStrong(sample);
      else if (slot === "accent") setCustomAccent(sample);
      else setCustomNormal(sample);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      logger.error("Failed to import audio:", e);
      Alert.alert(t("customSoundSet", "importError"));
    }
  }, [t, probeUriDuration]);

  return (
    <>
      {/* Volume */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name={volumeIcon as any} size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "volume")}</Text>
          <Text style={[styles.sectionValue, { color: C.accent }]}>{pct}%</Text>
        </View>
        <View
          ref={trackRef}
          style={styles.sliderContainer}
          onLayout={onTrackLayout}
          {...nativePanHandlers}
          {...(Platform.OS === "web" ? { onMouseDown: handleWebMouse } as any : {})}
        >
          <View style={styles.sliderTrack}>
            <View
              style={[
                styles.sliderFill,
                { width: `${volume * 50}%` as any, backgroundColor: volume > 1.0 ? "#FF4444" : volume >= 0.8 ? "#FF6B35" : C.accent },
              ]}
            />
          </View>
          <View style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1.5, backgroundColor: C.textSecondary, opacity: 0.35 }} />
          <View
            style={[
              styles.sliderThumb,
              { left: `${volume * 50}%` as any, backgroundColor: volume > 1.0 ? "#FF4444" : volume >= 0.8 ? "#FF6B35" : C.accent },
            ]}
          />
        </View>
        {volume >= 0.8 && volume <= 1.0 && (
          <Text style={[styles.volumeWarning]}>{t("settings", "volumeWarning")}</Text>
        )}
        {volume > 1.0 && (
          <>
            <Text style={[styles.volumeWarning]}>{t("settings", "volumeWarning")}</Text>
            <Text style={[styles.volumeWarning, { color: "#FF4444" }]}>{t("settings", "volumeBoostWarning")}</Text>
          </>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {/* Sample Volume */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name={sampleVolumeIcon as any} size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "sampleVolume")}</Text>
          <Text style={[styles.sectionValue, { color: C.accent }]}>{sampleVolPct}%</Text>
        </View>
        <View
          ref={sampleTrackRef}
          style={styles.sliderContainer}
          onLayout={onSampleTrackLayout}
          {...sampleNativePanHandlers}
          {...(Platform.OS === "web" ? { onMouseDown: handleSampleWebMouse } as any : {})}
        >
          <View style={styles.sliderTrack}>
            <View
              style={[styles.sliderFill, { width: `${sampleVolume * 100}%` as any, backgroundColor: sampleVolume >= 0.8 ? "#FF6B35" : C.accent }]}
            />
          </View>
          <View
            style={[styles.sliderThumb, { left: `${sampleVolume * 100}%` as any, backgroundColor: sampleVolume >= 0.8 ? "#FF6B35" : C.accent }]}
          />
        </View>
        {sampleVolume >= 0.8 && (
          <Text style={[styles.volumeWarning]}>{t("settings", "sampleVolumeWarning")}</Text>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {/* Sound Set */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="music-note-eighth" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "soundSet")}</Text>
        </View>

        {!editingCustomSlot && (
          <View style={{ marginTop: Spacing.sm, gap: Spacing.xxs }}>
            {[
              ...BUILTIN_SOUND_SETS.map((key) => ({ key, label: t("soundSets", key as any), isCustom: false })),
              ...Object.entries(customSoundSets).map(([k, cfg]) => ({ key: k, label: cfg.name, isCustom: true })),
            ].map((opt) => {
              const isMain = soundSet === opt.key;
              const usedInLayers = Object.entries(layerSoundSets)
                .filter(([, v]) => v === opt.key)
                .map(([k]) => Number(k))
                .sort((a, b) => a - b);
              return (
                <Pressable
                  key={opt.key}
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.md, backgroundColor: isMain ? C.accentDim : C.overlay08, gap: Spacing.sm }}
                  onPress={() => { onSoundSetChange(opt.key as any); playSoundPreview(opt.key as SoundSet); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
                >
                  <Ionicons name={isMain ? "checkmark-circle" : "ellipse-outline"} size={S.ms(16, 0.4)} color={isMain ? C.accent : C.textTertiary} />
                  <Text style={{ flex: 1, color: isMain ? C.accent : C.text, fontSize: FontSize.small, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                    {opt.label}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
                    {isMain && (
                      <View style={{ backgroundColor: C.accent, borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: Spacing.xxs }}>
                        <Text style={{ color: C.background, fontSize: 9, fontFamily: "SpaceGrotesk_600SemiBold" }}>{t("settings", "soundSetMain")}</Text>
                      </View>
                    )}
                    {usedInLayers.map((ln) => (
                      <View key={ln} style={{ backgroundColor: C.overlay08, borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: Spacing.xxs, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }}>
                        <Text style={{ color: C.textSecondary, fontSize: 9 }}>{t("settings", "soundSetLayerBadge").replace("%s", String(ln))}</Text>
                      </View>
                    ))}
                    {opt.isCustom && (
                      <Pressable hitSlop={8} onPress={() => openCustomEditor(opt.key)} style={{ padding: Spacing.xs }}>
                        <Ionicons name="pencil-outline" size={S.ms(14, 0.4)} color={C.textSecondary} />
                      </Pressable>
                    )}
                  </View>
                </Pressable>
              );
            })}

            {Object.keys(customSoundSets).length < 3 && (
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderStyle: "dashed", marginTop: Spacing.xs }}
                onPress={() => { const slot = getNextCustomSlot(); if (slot) openCustomEditor(slot); }}
              >
                <Ionicons name="add-circle-outline" size={S.ms(16, 0.4)} color={C.textSecondary} />
                <Text style={{ color: C.textSecondary, fontSize: FontSize.small }}>{t("settings", "soundSetAddNew")}</Text>
              </Pressable>
            )}
          </View>
        )}

        {editingCustomSlot && (
          <View style={csStyles.editorContainer}>
            <View style={csStyles.editorHeader}>
              <Text style={csStyles.editorTitle}>{t("customSoundSet", "title")}</Text>
              <Pressable onPress={() => setEditingCustomSlot(null)}>
                <Ionicons name="close" size={S.ms(20, 0.4)} color={C.textSecondary} />
              </Pressable>
            </View>

            <View style={csStyles.nameRow}>
              <Text style={csStyles.fieldLabel}>{t("customSoundSet", "name")}</Text>
              <TextInput
                style={csStyles.nameInput}
                value={customName}
                onChangeText={setCustomName}
                placeholder={t("customSoundSet", "namePlaceholder")}
                placeholderTextColor={C.textTertiary}
                maxLength={12}
              />
            </View>

            {([
              { label: t("customSoundSet", "strongSample"), state: customStrong, setter: setCustomStrong, slot: "strong" as const },
              { label: t("customSoundSet", "accentSample"), state: customAccent, setter: setCustomAccent, slot: "accent" as const },
              { label: t("customSoundSet", "normalSample"), state: customNormal, setter: setCustomNormal, slot: "normal" as const },
            ]).map((item, idx) => {
              const sampleType = item.state.type || "builtin";
              const isRecordingThis = recordingSlot === item.slot && isRecording;
              return (
                <View key={idx} style={csStyles.sampleSection}>
                  <View style={csStyles.sampleHeader}>
                    <Text style={csStyles.sampleTitle}>{item.label}</Text>
                    <Pressable
                      onPress={() => {
                        if (sampleType === "custom" && item.state.sampleUri) {
                          playCustomSampleUri(item.state.sampleUri, item.state.duration);
                        } else if (sampleType === "builtin" && item.state.sourceSet && item.state.sourceRole) {
                          previewCustomSample(item.state.sourceSet, item.state.sourceRole);
                        }
                      }}
                      style={csStyles.previewBtn}
                    >
                      <Ionicons name="play" size={S.ms(14, 0.4)} color={C.accent} />
                    </Pressable>
                  </View>

                  <View style={csStyles.pickerRow}>
                    <Text style={csStyles.pickerLabel}>{t("customSoundSet", "source")}</Text>
                    <View style={csStyles.chipRow}>
                      <Pressable
                        style={[csStyles.chip, sampleType === "builtin" && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                        onPress={() => {
                          item.setter({ type: "builtin", sourceSet: item.state.sourceSet || "classic", sourceRole: item.state.sourceRole || "strong", duration: item.state.duration });
                          if (Platform.OS !== "web") Haptics.selectionAsync();
                        }}
                      >
                        <Text style={[csStyles.chipText, sampleType === "builtin" && { color: C.accent }]}>{t("customSoundSet", "sourceBuiltin")}</Text>
                      </Pressable>
                      <Pressable
                        style={[csStyles.chip, sampleType === "custom" && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                        onPress={() => {
                          item.setter({ ...item.state, type: "custom" });
                          if (Platform.OS !== "web") Haptics.selectionAsync();
                        }}
                      >
                        <Text style={[csStyles.chipText, sampleType === "custom" && { color: C.accent }]}>{t("customSoundSet", "sourceCustom")}</Text>
                      </Pressable>
                    </View>
                  </View>

                  {sampleType === "builtin" ? (
                    <>
                      <View style={csStyles.pickerRow}>
                        <Text style={csStyles.pickerLabel}>{t("customSoundSet", "source")}</Text>
                        <View style={csStyles.chipRow}>
                          {BUILTIN_SOUND_SETS.map((bs) => {
                            const active = item.state.sourceSet === bs;
                            return (
                              <Pressable
                                key={bs}
                                style={[csStyles.chip, active && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                                onPress={() => {
                                  item.setter({ ...item.state, type: "builtin", sourceSet: bs });
                                  if (Platform.OS !== "web") Haptics.selectionAsync();
                                }}
                              >
                                <Text style={[csStyles.chipText, active && { color: C.accent }]}>
                                  {t("soundSets", bs as Parameters<typeof t>[1])}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                      <View style={csStyles.pickerRow}>
                        <Text style={csStyles.pickerLabel}>{t("customSoundSet", "role")}</Text>
                        <View style={csStyles.chipRow}>
                          {ROLE_OPTIONS.map((ro) => {
                            const active = item.state.sourceRole === ro.value;
                            return (
                              <Pressable
                                key={ro.value}
                                style={[csStyles.chip, active && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                                onPress={() => {
                                  item.setter({ ...item.state, type: "builtin", sourceRole: ro.value });
                                  previewCustomSample(item.state.sourceSet || "classic", ro.value);
                                  if (Platform.OS !== "web") Haptics.selectionAsync();
                                }}
                              >
                                <Text style={[csStyles.chipText, active && { color: C.accent }]}>
                                  {t("customSoundSet", ro.labelKey)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      {item.state.sampleUri ? (
                        <View style={csStyles.customSampleInfo}>
                          <View style={csStyles.customSampleRow}>
                            <Ionicons name="musical-note" size={S.ms(16, 0.4)} color={C.accent} />
                            <Text style={csStyles.customSampleName} numberOfLines={1}>
                              {item.state.sampleName || t("customSoundSet", "sampleLoaded")}
                            </Text>
                            <Pressable
                              onPress={() => {
                                item.setter({ ...item.state, sampleUri: undefined, sampleName: undefined });
                                if (Platform.OS !== "web") Haptics.selectionAsync();
                              }}
                              style={csStyles.removeSampleBtn}
                            >
                              <Ionicons name="close-circle" size={S.ms(16, 0.4)} color="#F85149" />
                            </Pressable>
                          </View>
                        </View>
                      ) : isRecordingThis ? (
                        <View style={csStyles.recordingRow}>
                          <View style={csStyles.recordingIndicator}>
                            <View style={[csStyles.recordingDot, { backgroundColor: "#F85149" }]} />
                            <Text style={csStyles.recordingText}>
                              {t("customSoundSet", "recording")} {recordDuration.toFixed(1)}s
                            </Text>
                          </View>
                          <Pressable
                            style={[csStyles.recordActionBtn, { backgroundColor: "#F85149" }]}
                            onPress={() => stopSampleRecording(item.slot)}
                          >
                            <Ionicons name="stop" size={S.ms(14, 0.4)} color="#fff" />
                            <Text style={csStyles.recordActionText}>{t("customSoundSet", "stopRecord")}</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View style={csStyles.recordImportRow}>
                          <Pressable
                            style={[csStyles.recordActionBtn, { backgroundColor: C.accentDim, borderColor: C.accent, borderWidth: 1 }]}
                            onPress={() => startSampleRecording(item.slot)}
                          >
                            <Ionicons name="mic" size={S.ms(14, 0.4)} color={C.accent} />
                            <Text style={[csStyles.recordActionText, { color: C.accent }]}>{t("customSoundSet", "record")}</Text>
                          </Pressable>
                          <Pressable
                            style={[csStyles.recordActionBtn, { backgroundColor: C.accentDim, borderColor: C.accent, borderWidth: 1 }]}
                            onPress={() => importSampleFile(item.slot)}
                          >
                            <Ionicons name="folder-open" size={S.ms(14, 0.4)} color={C.accent} />
                            <Text style={[csStyles.recordActionText, { color: C.accent }]}>{t("customSoundSet", "import")}</Text>
                          </Pressable>
                        </View>
                      )}
                    </>
                  )}

                  <View style={csStyles.durationRow}>
                    <Text style={csStyles.pickerLabel}>{t("customSoundSet", "duration")}</Text>
                    <View style={csStyles.durationControls}>
                      <Pressable
                        style={csStyles.durationBtn}
                        onPress={() => {
                          const next = Math.max(0.1, Math.round((item.state.duration - 0.1) * 10) / 10);
                          item.setter({ ...item.state, duration: next });
                          if (Platform.OS !== "web") Haptics.selectionAsync();
                        }}
                      >
                        <Ionicons name="remove" size={S.ms(14, 0.4)} color={C.text} />
                      </Pressable>
                      <Text style={[csStyles.durationValue, { color: C.accent }]}>{item.state.duration.toFixed(1)}s</Text>
                      <Pressable
                        style={csStyles.durationBtn}
                        onPress={() => {
                          const next = Math.min(3.0, Math.round((item.state.duration + 0.1) * 10) / 10);
                          item.setter({ ...item.state, duration: next });
                          if (Platform.OS !== "web") Haptics.selectionAsync();
                        }}
                      >
                        <Ionicons name="add" size={S.ms(14, 0.4)} color={C.text} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}

            <View style={csStyles.editorActions}>
              {customSoundSets[editingCustomSlot] && (
                <Pressable style={csStyles.deleteBtn} onPress={() => deleteCustomSet(editingCustomSlot)}>
                  <Ionicons name="trash-outline" size={S.ms(16, 0.4)} color="#F85149" />
                  <Text style={csStyles.deleteBtnText}>{t("customSoundSet", "delete")}</Text>
                </Pressable>
              )}
              <Pressable style={[csStyles.saveBtn, { backgroundColor: C.accent }]} onPress={saveCustomSet}>
                <Ionicons name="checkmark" size={S.ms(16, 0.4)} color={C.background} />
                <Text style={csStyles.saveBtnText}>{t("customSoundSet", "save")}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {/* Audio offset */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="timer-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "audioOffset")}</Text>
          <HelpIcon title={t("settings", "audioOffset")} message={t("settings", "audioOffsetHelp")} />
          <Text style={[styles.sectionValue, { color: C.accent }]}>
            {audioOffsetMs > 0 ? "+" : ""}{audioOffsetMs}ms
          </Text>
        </View>
        <View style={styles.offsetRow}>
          <Pressable style={styles.offsetBtn} onPress={() => { onAudioOffsetChange(Math.max(-200, audioOffsetMs - 5)); if (Platform.OS !== "web") Haptics.selectionAsync(); }}>
            <Ionicons name="remove" size={S.ms(18, 0.4)} color={C.text} />
          </Pressable>
          <Pressable style={styles.offsetBtn} onPress={() => { onAudioOffsetChange(Math.max(-200, audioOffsetMs - 1)); if (Platform.OS !== "web") Haptics.selectionAsync(); }}>
            <Text style={styles.offsetBtnText}>-1</Text>
          </Pressable>
          <Pressable style={[styles.offsetBtn, styles.offsetResetBtn]} onPress={() => { onAudioOffsetChange(0); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
            <Text style={styles.offsetResetText}>0</Text>
          </Pressable>
          <Pressable style={styles.offsetBtn} onPress={() => { onAudioOffsetChange(Math.min(200, audioOffsetMs + 1)); if (Platform.OS !== "web") Haptics.selectionAsync(); }}>
            <Text style={styles.offsetBtnText}>+1</Text>
          </Pressable>
          <Pressable style={styles.offsetBtn} onPress={() => { onAudioOffsetChange(Math.min(200, audioOffsetMs + 5)); if (Platform.OS !== "web") Haptics.selectionAsync(); }}>
            <Ionicons name="add" size={S.ms(18, 0.4)} color={C.text} />
          </Pressable>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "audioOffsetHint")}</Text>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {/* Timer stop mode */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="stop-circle-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "timerStop")}</Text>
        </View>
        <View style={styles.tripleRow}>
          {([
            { value: "end-of-cycle" as const, label: t("settings", "timerStopEndCycle") },
            { value: "immediate" as const, label: t("settings", "timerStopImmediate") },
          ]).map((opt) => {
            const active = timerStopMode === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.tripleBtn, active && [styles.tripleBtnActive, { borderColor: C.accent, backgroundColor: C.accentDim }]]}
                onPress={() => { onTimerStopModeChange(opt.value); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
              >
                <Text style={[styles.tripleBtnText, active && [styles.tripleBtnTextActive, { color: C.accent }]]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>
          {timerStopMode === "end-of-cycle" ? t("settings", "timerStopHintEndCycle") : t("settings", "timerStopHintImmediate")}
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {/* Background play */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="play-circle-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "backgroundPlay")}</Text>
          <Switch
            value={backgroundPlay}
            onValueChange={onBackgroundPlayChange}
            trackColor={{ false: C.surfaceLight, true: C.accentMuted }}
            thumbColor={backgroundPlay ? C.accent : C.textSecondary}
            style={{ transform: [{ scale: 0.85 }] }}
          />
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {/* Auto resume */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="call-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "autoResumeAfterInterruption")}</Text>
          <Switch
            value={autoResumeAfterInterruption}
            onValueChange={onAutoResumeAfterInterruptionChange}
            trackColor={{ false: C.surfaceLight, true: C.accentMuted }}
            thumbColor={autoResumeAfterInterruption ? C.accent : C.textSecondary}
            style={{ transform: [{ scale: 0.85 }] }}
          />
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "autoResumeAfterInterruptionHint")}</Text>
      </View>
    </>
  );
}

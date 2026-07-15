import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  Platform,
  Alert,
  FlatList,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeTouchEvent,
} from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import {
  useAudioPlayer,
  useAudioRecorder,
  RecordingPresets,
  type AudioPlayer,
  type AudioSource,
} from "expo-audio";
import { acquireAudioSession, releaseAudioSession } from "@/lib/audio-session";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import { ensurePermission } from "@/lib/permissions";
import { safePlay } from "@/lib/audio-utils";
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
import { resolveWebAssetUrl } from "@/lib/audio-renderer";
import {
  type BuiltinSoundSet,
  type SoundRole,
} from "@/lib/storage";

export interface DrumKitModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called when user selects "음원 분리" on a pad that has an imported audio file */
  onStemSep?: (uri: string, name: string) => void;
}

interface DrumPadHandle {
  play: () => void;
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
  pressed: boolean;
  size: number;
}

function padSourceToAudioSource(config: DrumPadConfig): AudioSource | null {
  if (config.source.type === "builtin") {
    return getBuiltinPadModule(config.source.setName, config.source.role) as unknown as AudioSource;
  }
  return { uri: config.source.uri };
}

const DrumPad = React.memo(React.forwardRef<DrumPadHandle, DrumPadProps>(function DrumPad(
  { index, config, bgColor, borderColor, textColor, textTertiary, accent, flashing, pressed, size },
  ref,
) {
  const player = useAudioPlayer(null) as AudioPlayer;
  const lastSourceRef = useRef<string>("");

  useEffect(() => {
    if (!config) { lastSourceRef.current = ""; return; }
    const key = config.source.type === "builtin"
      ? `b:${config.source.setName}:${config.source.role}`
      : `${config.source.type}:${config.source.uri}`;
    if (key === lastSourceRef.current) return;
    lastSourceRef.current = key;

    if (Platform.OS === "web" && config.source.type === "builtin") {
      // On web, Asset.fromModule().uri may be empty; resolve via Metro's unstable_path API
      const mod = getBuiltinPadModule(config.source.setName, config.source.role);
      const uri = resolveWebAssetUrl(mod as number);
      if (uri) try { player.replace({ uri }); } catch {}
      return;
    }

    const src = padSourceToAudioSource(config);
    if (!src) return;
    try { player.replace(src); } catch {}
  }, [config, player]);

  useImperativeHandle(ref, () => ({
    play() {
      if (!config) return;
      try { player.seekTo(0); } catch {}
      safePlay(player, "drumKit.pad");
    },
  }), [config, player]);

  const label = !config ? "" : config.source.type === "builtin"
    ? `${config.source.setName.slice(0, 4)}/${config.source.role[0]}`
    : (config.source.name || (config.source.type === "recording" ? "REC" : "FILE"));

  return (
    <View
      pointerEvents="none"
      style={[
        styles.pad,
        {
          width: size, height: size,
          backgroundColor: flashing ? accent + "55" : bgColor,
          borderColor: flashing ? accent : borderColor,
          opacity: pressed ? 0.7 : 1,
        },
        !config && { borderStyle: "dashed" as const },
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
    </View>
  );
}));

export function DrumKitModal({ visible, onClose, onStemSep }: DrumKitModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const [mapping, setMapping] = useState<DrumKitMapping>(createDefaultDrumKitMapping());
  const [flashingPads, setFlashingPads] = useState<Set<number>>(new Set());
  const [pressedPads, setPressedPads] = useState<Set<number>>(new Set());
  const [assignSlot, setAssignSlot] = useState<number | null>(null);
  const [showBuiltinPicker, setShowBuiltinPicker] = useState(false);

  const padRefs = useRef<Array<{ current: DrumPadHandle | null }>>(
    Array.from({ length: DRUM_PAD_COUNT }, () => ({ current: null }))
  );
  const activeTouches = useRef<Map<string, number>>(new Map());
  const flashTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const longPressTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const padSizeRef = useRef(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderRef = useRef(recorder);
  useEffect(() => { recorderRef.current = recorder; }, [recorder]);
  const [isRecordingMic, setIsRecordingMic] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void loadDrumKitMapping().then((m) => setMapping(m));
  }, [visible]);

  const persistMapping = useCallback(async (next: DrumKitMapping) => {
    setMapping(next);
    await saveDrumKitMapping(next);
  }, []);

  const cleanupTimers = useCallback(() => {
    flashTimers.current.forEach((t) => clearTimeout(t));
    flashTimers.current.clear();
    longPressTimers.current.forEach((t) => clearTimeout(t));
    longPressTimers.current.clear();
  }, []);

  useEffect(() => {
    if (!visible) {
      cleanupTimers();
      setFlashingPads(new Set());
      setPressedPads(new Set());
      activeTouches.current.clear();
      setAssignSlot(null);
      setShowBuiltinPicker(false);
    }
  }, [visible, cleanupTimers]);

  const hitPadIndex = useCallback((x: number, y: number): number => {
    const ps = padSizeRef.current;
    const step = ps + Spacing.sm;
    const col = Math.floor(x / step);
    const row = Math.floor(y / step);
    if (col < 0 || col >= DRUM_KIT_COLS || row < 0) return -1;
    if ((x - col * step) > ps || (y - row * step) > ps) return -1;
    const idx = row * DRUM_KIT_COLS + col;
    return idx >= 0 && idx < DRUM_PAD_COUNT ? idx : -1;
  }, []);

  const triggerPad = useCallback((padIdx: number) => {
    padRefs.current[padIdx]?.current?.play();
    setFlashingPads((prev) => new Set([...prev, padIdx]));
    const existing = flashTimers.current.get(padIdx);
    if (existing) clearTimeout(existing);
    const ft = setTimeout(() => {
      setFlashingPads((prev) => { const n = new Set(prev); n.delete(padIdx); return n; });
      flashTimers.current.delete(padIdx);
    }, 120);
    flashTimers.current.set(padIdx, ft);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);

  const handleGridTouchEnd = useCallback((e: NativeSyntheticEvent<NativeTouchEvent>) => {
    for (const touch of e.nativeEvent.changedTouches) {
      const padIdx = activeTouches.current.get(touch.identifier);
      activeTouches.current.delete(touch.identifier);
      if (padIdx === undefined) continue;
      setPressedPads((prev) => { const n = new Set(prev); n.delete(padIdx); return n; });
      const lpt = longPressTimers.current.get(padIdx);
      if (lpt) { clearTimeout(lpt); longPressTimers.current.delete(padIdx); }
    }
  }, []);

  const handleGridTouchStart = useCallback((e: NativeSyntheticEvent<NativeTouchEvent>) => {
    for (const touch of e.nativeEvent.changedTouches) {
      if (activeTouches.current.has(touch.identifier)) continue;
      const padIdx = hitPadIndex(touch.locationX, touch.locationY);
      if (padIdx < 0) continue;
      activeTouches.current.set(touch.identifier, padIdx);
      setPressedPads((prev) => new Set([...prev, padIdx]));
      triggerPad(padIdx);
      const lpt = setTimeout(() => {
        setAssignSlot(padIdx);
        longPressTimers.current.delete(padIdx);
      }, 400);
      longPressTimers.current.set(padIdx, lpt);
    }
  }, [hitPadIndex, triggerPad]);

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

  const handleAssignRecord = useCallback(async () => {
    if (assignSlot === null) return;
    const slot = assignSlot;
    const granted = await ensurePermission("mic", t);
    if (!granted) {
      Alert.alert(t("drumKit", "micPermissionDenied"));
      return;
    }
    let acquired = false;
    try {
      await acquireAudioSession("drumKitRec", "recording");
      acquired = true;
      await recorderRef.current.prepareToRecordAsync();
      recorderRef.current.record();
      setIsRecordingMic(true);
      setTimeout(async () => {
        try { await recorderRef.current.stop(); } catch {}
        try { await releaseAudioSession("drumKitRec"); } catch {}
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
      if (acquired) {
        try { await releaseAudioSession("drumKitRec"); } catch {}
      }
    }
  }, [assignSlot, mapping, persistMapping, t]);

  const padSize = useMemo(() => {
    const maxW = Math.min(360, S.ms(280, 0.4));
    const v = Math.floor((maxW - Spacing.sm * (DRUM_KIT_COLS - 1)) / DRUM_KIT_COLS);
    padSizeRef.current = v;
    return v;
  }, [S]);

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={onClose}>
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
              {t("drumKit", "tapToPlay")}
            </Text>

            <View
              style={[styles.padGrid, { gap: Spacing.sm, alignSelf: "center" }]}
              onTouchStart={handleGridTouchStart}
              onTouchEnd={handleGridTouchEnd}
              onTouchCancel={handleGridTouchEnd}
            >
              {Array.from({ length: DRUM_PAD_COUNT }).map((_, i) => (
                <DrumPad
                  ref={padRefs.current[i]}
                  key={`pad-${i}`}
                  index={i}
                  config={mapping[i]}
                  bgColor={C.background}
                  borderColor={C.border}
                  textColor={C.text}
                  textTertiary={C.textTertiary}
                  accent={C.accent}
                  flashing={flashingPads.has(i)}
                  pressed={pressedPads.has(i)}
                  size={padSize}
                />
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>

      <AnimatedModal
        visible={assignSlot !== null && !showBuiltinPicker}
        transparent
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
                {assignSlot !== null && mapping[assignSlot]?.source.type === "import" && onStemSep && (
                  <Pressable
                    onPress={() => {
                      const cfg = mapping[assignSlot];
                      if (cfg?.source.type === "import") {
                        onStemSep(cfg.source.uri, cfg.source.name);
                        setAssignSlot(null);
                      }
                    }}
                    style={[styles.assignItem, { borderColor: C.accent }]}
                    testID="assign-stem-sep"
                  >
                    <MaterialCommunityIcons name="layers-triple-outline" size={S.ms(20, 0.4)} color={C.accent} />
                    <Text style={[styles.assignItemText, { color: C.accent }]}>{t("stemSep", "title")}</Text>
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
      </AnimatedModal>

      <AnimatedModal
        visible={showBuiltinPicker}
        transparent
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
      </AnimatedModal>
    </AnimatedModal>
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

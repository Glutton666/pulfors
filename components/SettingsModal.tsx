import React, { useRef, useCallback, useState, useEffect, useImperativeHandle } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  PanResponder,
  LayoutChangeEvent,
  ScrollView,
  Switch,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { AnimatedModal } from "@/components/AnimatedModal";
import { logger } from "@/lib/logger";
import { confirmDestructive } from "@/lib/confirm";
import { make_styles, make_csStyles, kbStyles } from "./SettingsModal.styles";
import { AssistantShortcutsGuide } from "@/components/AssistantShortcutsGuide";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  useAudioPlayer,
  useAudioRecorder,
  createAudioPlayer,
  RecordingPresets,
  type AudioPlayer as ExpoAudioPlayer,
} from "expo-audio";
import { acquireAudioSession, releaseAudioSession } from "@/lib/audio-session";
import * as DocumentPicker from "expo-document-picker";
import { useScale } from "@/lib/scale";
import Colors, { accentFromHex, type ThemeColor } from "@/constants/colors";
import { Radius, FontSize, Spacing } from "@/constants/tokens";
import { PRESET_COLORS, HUE_COLORS } from "@/constants/color-presets";
import { useTheme, type BeatTypeKey } from "@/contexts/ThemeContext";
import type { FlashMode, HapticMode, SoundSet, BuiltinSoundSet, SoundRole, CustomSoundSetConfig, CustomSoundSample } from "@/lib/storage";
import { loadCustomSoundSets, saveCustomSoundSets, BUILTIN_SOUND_SETS } from "@/lib/storage";
import { soundSets } from "@/lib/metronome-engine";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGE_OPTIONS, type Language, type KbSectionKey } from "@/lib/i18n";
import { safePlay } from "@/lib/audio-utils";
import { ensurePermission } from "@/lib/permissions";
import {
  loadPracticeRooms,
  addPracticeRoom,
  deletePracticeRoom,
  renamePracticeRoom,
  requestLocationPermission,
  type PracticeRoom,
} from "@/lib/practice-room";
import { Share } from "react-native";
import { loadGoals, saveGoals, type Goal } from "@/lib/activity-log";
import { HelpIcon } from "@/components/HelpIcon";
import {
  DEFAULT_BINDINGS,
  buildLabel,
  executeRebind,
  executeRebindReset,
  type KeyBindingsMap,
  type KeyAction,
  type KeyBinding,
} from "@/lib/keyboard-bindings";

type SettingsTab = "theme" | "sound" | "profile" | "keyboard";

interface SoundPreviewHandle {
  playSoundPreview: (set: SoundSet) => void;
  previewCustomSample: (sourceSet: BuiltinSoundSet, sourceRole: SoundRole) => void;
}

const SoundPreviewPlayers = React.forwardRef<
  SoundPreviewHandle,
  { customSoundSets: Record<string, CustomSoundSetConfig>; playCustomSampleUri: (uri: string, duration: number) => Promise<void> }
>(function SoundPreviewPlayers({ customSoundSets, playCustomSampleUri }, ref) {
  const classicStrong = useAudioPlayer(soundSets.classic.strong);
  const classicHigh = useAudioPlayer(soundSets.classic.high);
  const classicLow = useAudioPlayer(soundSets.classic.low);
  const woodblockStrong = useAudioPlayer(soundSets.woodblock.strong);
  const woodblockHigh = useAudioPlayer(soundSets.woodblock.high);
  const woodblockLow = useAudioPlayer(soundSets.woodblock.low);
  const cowbellStrong = useAudioPlayer(soundSets.cowbell.strong);
  const cowbellHigh = useAudioPlayer(soundSets.cowbell.high);
  const cowbellLow = useAudioPlayer(soundSets.cowbell.low);
  const digitalStrong = useAudioPlayer(soundSets.digital.strong);
  const digitalHigh = useAudioPlayer(soundSets.digital.high);
  const digitalLow = useAudioPlayer(soundSets.digital.low);
  const rimshotStrong = useAudioPlayer(soundSets.rimshot.strong);
  const rimshotHigh = useAudioPlayer(soundSets.rimshot.high);
  const rimshotLow = useAudioPlayer(soundSets.rimshot.low);
  const triangleStrong = useAudioPlayer(soundSets.triangle.strong);
  const triangleHigh = useAudioPlayer(soundSets.triangle.high);
  const triangleLow = useAudioPlayer(soundSets.triangle.low);
  const hihatStrong = useAudioPlayer(soundSets.hihat.strong);
  const hihatHigh = useAudioPlayer(soundSets.hihat.high);
  const hihatLow = useAudioPlayer(soundSets.hihat.low);
  const jamblockStrong = useAudioPlayer(soundSets.jamblock.strong);
  const jamblockHigh = useAudioPlayer(soundSets.jamblock.high);
  const jamblockLow = useAudioPlayer(soundSets.jamblock.low);
  const previewIndexRef = useRef<Record<string, number>>({});

  type PlayerList = typeof classicStrong[];
  const players: Partial<Record<string, PlayerList>> = {
    classic: [classicStrong, classicHigh, classicLow],
    woodblock: [woodblockStrong, woodblockHigh, woodblockLow],
    cowbell: [cowbellStrong, cowbellHigh, cowbellLow],
    digital: [digitalStrong, digitalHigh, digitalLow],
    rimshot: [rimshotStrong, rimshotHigh, rimshotLow],
    triangle: [triangleStrong, triangleHigh, triangleLow],
    hihat: [hihatStrong, hihatHigh, hihatLow],
    jamblock: [jamblockStrong, jamblockHigh, jamblockLow],
  };

  useImperativeHandle(ref, () => ({
    playSoundPreview(set: SoundSet) {
      const idx = previewIndexRef.current[set] ?? 0;
      let list = players[set];
      if (!list) {
        const cfg = customSoundSets[set];
        if (cfg) {
          const samples = [cfg.strong, cfg.accent, cfg.normal];
          const sample = samples[idx % 3];
          if (sample.type === "custom" && sample.sampleUri) {
            void playCustomSampleUri(sample.sampleUri, sample.duration);
            previewIndexRef.current[set] = (idx + 1) % 3;
            return;
          }
          const srcSet = sample.sourceSet || "classic";
          const srcRole = sample.sourceRole || "strong";
          list = players[srcSet];
          if (list) {
            const roleIdx = srcRole === "strong" ? 0 : srcRole === "high" ? 1 : 2;
            try { list[roleIdx].seekTo(0); } catch {}
            safePlay(list[roleIdx], "settings.previewSample.custom");
            previewIndexRef.current[set] = (idx + 1) % 3;
            return;
          }
        }
        list = players.classic;
      }
      if (!list) return;
      const player = list[idx];
      try { player.seekTo(0); } catch {}
      safePlay(player, "settings.previewSample.builtin");
      previewIndexRef.current[set] = (idx + 1) % 3;
    },
    previewCustomSample(sourceSet: BuiltinSoundSet, sourceRole: SoundRole) {
      const list = players[sourceSet];
      if (!list) return;
      const idx = sourceRole === "strong" ? 0 : sourceRole === "high" ? 1 : 2;
      try { list[idx].seekTo(0); } catch {}
      safePlay(list[idx], "settings.previewCustomSource");
    },
  }));

  return null;
});

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  sampleVolume: number;
  onSampleVolumeChange: (volume: number) => void;
  backgroundPlay: boolean;
  onBackgroundPlayChange: (value: boolean) => void;
  autoResumeAfterInterruption: boolean;
  onAutoResumeAfterInterruptionChange: (value: boolean) => void;
  soundSet: SoundSet;
  onSoundSetChange: (value: SoundSet) => void;
  layerSoundSets: Record<number, SoundSet>;
  onLayerSoundSetsChange: (value: Record<number, SoundSet>) => void;
  flashMode: FlashMode;
  onFlashModeChange: (value: FlashMode) => void;
  hapticMode: HapticMode;
  onHapticModeChange: (value: HapticMode) => void;
  audioOffsetMs: number;
  onAudioOffsetChange: (value: number) => void;
  timerStopMode: "immediate" | "end-of-cycle";
  onTimerStopModeChange: (value: "immediate" | "end-of-cycle") => void;
  loggingEnabled: boolean;
  onLoggingEnabledChange: (val: boolean) => void;
  username: string;
  onUsernameChange: (val: string) => void;
  roomTrackingActive: boolean;
  trackingRoomName: string | null;
  onStartRoomTracking: (room: { id: string; name: string }) => void;
  onStopRoomTracking: () => void;
  onResetApp?: () => void;
  customSoundSets: Record<string, CustomSoundSetConfig>;
  onCustomSoundSetsChange: (configs: Record<string, CustomSoundSetConfig>) => void;
  landscapeReversed: boolean;
  onLandscapeReversedChange: (val: boolean) => void;
  showLandscapeImage: boolean;
  onShowLandscapeImageChange: (val: boolean) => void;
  beatDirection: "cw" | "ccw";
  onBeatDirectionChange: (val: "cw" | "ccw") => void;
  barMetronomeChannel: import("@/lib/stereo-channel").SampleChannel;
  onBarMetronomeChannelChange: (val: import("@/lib/stereo-channel").SampleChannel) => void;
  barCellOpacity: number;
  onBarCellOpacityChange: (val: number) => void;
  barRowHeight: number;
  onBarRowHeightChange: (val: number) => void;
  onShowOnboarding?: () => void;
  onEnterNoteMode?: () => void;
  keyBindings?: import("@/lib/keyboard-bindings").KeyBindingsMap;
  onKeyBindingsChange?: (kb: import("@/lib/keyboard-bindings").KeyBindingsMap) => void;
}

import { getSoundSetOptions, getTripleOptions, TripleSelector } from "./SettingsModal.helpers";

function KeyRebindOverlay({
  actionLabel,
  conflict,
  onKeyDown,
  onCancel,
  t,
}: {
  actionLabel: string;
  conflict: string | null;
  onKeyDown: (e: KeyboardEvent) => void;
  onCancel: () => void;
  t: import("@/lib/i18n").TranslationFn;
}) {
  const { colors: C } = useTheme();
  useEffect(() => {
    if (Platform.OS !== "web") return;
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onKeyDown]);

  return (
    <View style={kbStyles.overlayBg} pointerEvents="box-only" dataSet={{ capturesKeys: "true" }}>
      <View style={[kbStyles.overlayCard, { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1 }]}>
        <Text style={[kbStyles.overlayTitle, { color: C.text }]}>{t("keyboard", "listening")}</Text>
        <Text style={[kbStyles.overlayActionLabel, { color: C.accent }]}>{actionLabel}</Text>
        {conflict ? (
          <Text style={kbStyles.overlayConflict}>{conflict}</Text>
        ) : (
          <Text style={[kbStyles.overlayHint, { color: C.textSecondary }]}>{t("keyboard", "pressKeyHint")}</Text>
        )}
        <Pressable
          style={[kbStyles.overlayCancel, { borderColor: C.border }]}
          onPress={onCancel}
        >
          <Text style={[kbStyles.overlayCancelText, { color: C.textSecondary }]}>{t("keyboard", "cancelRebind")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SettingsModal({
  visible,
  onClose,
  volume,
  onVolumeChange,
  sampleVolume,
  onSampleVolumeChange,
  backgroundPlay,
  onBackgroundPlayChange,
  autoResumeAfterInterruption,
  onAutoResumeAfterInterruptionChange,
  soundSet,
  onSoundSetChange,
  layerSoundSets,
  onLayerSoundSetsChange,
  flashMode,
  onFlashModeChange,
  hapticMode,
  onHapticModeChange,
  audioOffsetMs,
  onAudioOffsetChange,
  timerStopMode,
  onTimerStopModeChange,
  loggingEnabled,
  onLoggingEnabledChange,
  username,
  onUsernameChange,
  roomTrackingActive,
  trackingRoomName,
  onStartRoomTracking,
  onStopRoomTracking,
  onResetApp,
  customSoundSets,
  onCustomSoundSetsChange,
  landscapeReversed,
  onLandscapeReversedChange,
  showLandscapeImage,
  onShowLandscapeImageChange,
  beatDirection,
  onBeatDirectionChange,
  barMetronomeChannel,
  onBarMetronomeChannelChange,
  barCellOpacity,
  onBarCellOpacityChange,
  barRowHeight,
  onBarRowHeightChange,
  onShowOnboarding,
  keyBindings: keyBindingsProp,
  onKeyBindingsChange,
}: SettingsModalProps) {
  const { themeColor, customHex, themeMode, setThemeColor, setCustomHex, setThemeMode, colors: C, hubImages, addHubImage, removeHubImage, updateHubImageBeatTypes } = useTheme();
  const S = useScale();
  const styles = make_styles(C);
  const csStyles = make_csStyles(C);
  const { language, setLanguage, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<SettingsTab>("theme");
  const [showCustomPicker, setShowCustomPicker] = useState(themeColor === "custom");
  const [hexInput, setHexInput] = useState(customHex);
  const [localUsername, setLocalUsername] = useState(username);
  const [showAssistantGuide, setShowAssistantGuide] = useState(false);
  const hueTrackRef = useRef<View>(null);
  const hueTrackWidthRef = useRef(0);
  const trackWidthRef = useRef(0);
  const trackLeftRef = useRef(0);
  const lastHapticRef = useRef(volume);
  const tabFadeAnim = useRef(new Animated.Value(1)).current;
  const tabSlideAnim = useRef(new Animated.Value(0)).current;

  const [practiceRooms, setPracticeRooms] = useState<PracticeRoom[]>([]);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLoggingInfo, setShowLoggingInfo] = useState(false);
  const [localKeyBindings, setLocalKeyBindings] = useState<KeyBindingsMap>(keyBindingsProp ?? DEFAULT_BINDINGS);
  const [rebindingAction, setRebindingAction] = useState<KeyAction | null>(null);
  const [rebindConflict, setRebindConflict] = useState<string | null>(null);
  const [kbSavedToast, setKbSavedToast] = useState(false);
  const kbSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [webUrlCopied, setWebUrlCopied] = useState(false);
  const webUrlCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showKbSaved = useCallback(() => {
    setKbSavedToast(true);
    if (kbSavedTimerRef.current) clearTimeout(kbSavedTimerRef.current);
    kbSavedTimerRef.current = setTimeout(() => setKbSavedToast(false), 1500);
  }, []);
  useEffect(() => () => {
    if (kbSavedTimerRef.current) clearTimeout(kbSavedTimerRef.current);
    if (webUrlCopiedTimerRef.current) clearTimeout(webUrlCopiedTimerRef.current);
  }, []);
  useEffect(() => {
    if (keyBindingsProp) setLocalKeyBindings(keyBindingsProp);
  }, [keyBindingsProp]);
  const layerKeys = Object.keys(layerSoundSets).map(k => Number(k)).filter(n => !isNaN(n) && n > 0);
  const initialLayerCount = layerKeys.length > 0 ? Math.max(...layerKeys) : 1;
  const [layerSoundRowCount, setLayerSoundRowCount] = useState(initialLayerCount);
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
  const previewProbePlayerRef = useRef<ExpoAudioPlayer | null>(null);
  const previewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewPlayersReady, setPreviewPlayersReady] = useState(false);

  useEffect(() => {
    if (visible) {
      setLocalUsername(username);
      setShowResetConfirm(false);
      loadPracticeRooms().then(setPracticeRooms);
      // Defer mounting the 21 audio preview players until after the modal
      // open animation (~150ms) so their initialization doesn't collide with
      // the metronome's active AudioContext and trigger play/pause conflicts.
      const tid = setTimeout(() => setPreviewPlayersReady(true), 300);
      return () => clearTimeout(tid);
    } else {
      setPreviewPlayersReady(false);
    }
  }, [visible, username]);

  const handleAddRoom = useCallback(async () => {
    if (!newRoomName.trim()) return;
    setAddingRoom(true);
    const granted = await requestLocationPermission();
    if (!granted) {
      setAddingRoom(false);
      Alert.alert(t("settings", "permissionNeeded"), t("settings", "permissionLocationMsg"));
      return;
    }
    const room = await addPracticeRoom(newRoomName.trim());
    if (room) {
      setPracticeRooms((prev) => [...prev, room]);
      setNewRoomName("");
      setShowAddRoom(false);
    } else {
      Alert.alert(t("settings", "error"), t("settings", "locationError"));
    }
    setAddingRoom(false);
  }, [newRoomName]);

  const handleDeleteRoom = useCallback(async (id: string) => {
    await deletePracticeRoom(id);
    setPracticeRooms((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleRenameRoom = useCallback((room: PracticeRoom) => {
    if (Platform.OS === "ios" && typeof Alert.prompt === "function") {
      Alert.prompt(
        t("settings", "renameRoom"),
        undefined,
        async (newName: string) => {
          if (!newName?.trim()) return;
          await renamePracticeRoom(room.id, newName.trim());
          setPracticeRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, name: newName.trim() } : r));
        },
        "plain-text",
        room.name,
      );
      return;
    }
    const newName = Platform.OS === "web" ? window.prompt(t("settings", "renameRoom"), room.name) : null;
    if (newName?.trim()) {
      renamePracticeRoom(room.id, newName.trim());
      setPracticeRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, name: newName.trim() } : r));
    }
  }, [t]);

  const handleShareRoom = useCallback(async (room: PracticeRoom) => {
    const msg = t("settings", "shareRoomMsg").replace("%s", room.name);
    try {
      await Share.share({ message: msg });
    } catch {}
  }, [t]);

  const handleAddRoomGoal = useCallback((room: PracticeRoom) => {
    const promptGoal = (defaultVal: string) => {
      if (Platform.OS === "ios") {
        Alert.prompt?.(
          t("settings", "addGoal"),
          t("settings", "goalMinutes"),
          async (val: string) => {
            const mins = parseInt(val, 10);
            if (!mins || mins <= 0) return;
            const goals = await loadGoals();
            const newGoal: Goal = {
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              type: "room_time",
              target: mins,
              label: room.name,
            };
            goals.push(newGoal);
            await saveGoals(goals);
            Alert.alert(t("settings", "goalAdded"), t("settings", "goalAddedMsg").replace("%s", String(mins)));
          },
          "plain-text",
          defaultVal
        );
      } else {
        const val = Platform.OS === "web" ? window.prompt(t("settings", "goalMinutes"), defaultVal) : null;
        if (val) {
          const mins = parseInt(val, 10);
          if (!mins || mins <= 0) return;
          loadGoals().then(async (goals) => {
            const newGoal: Goal = {
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              type: "room_time",
              target: mins,
              label: room.name,
            };
            goals.push(newGoal);
            await saveGoals(goals);
            Alert.alert(t("settings", "goalAdded"), t("settings", "goalAddedMsg").replace("%s", String(mins)));
          });
        }
      }
    };
    promptGoal("30");
  }, [t]);

  const soundPreviewRef = useRef<SoundPreviewHandle>(null);

  const playCustomSampleUri = useCallback(async (uri: string, duration: number) => {
    if (previewStopTimerRef.current) {
      clearTimeout(previewStopTimerRef.current);
      previewStopTimerRef.current = null;
    }
    if (previewProbePlayerRef.current) {
      try { previewProbePlayerRef.current.pause(); } catch {}
      try { previewProbePlayerRef.current.remove(); } catch {}
      previewProbePlayerRef.current = null;
    }
    try {
      const rawUri = uri.split("#")[0];
      const isSafeUri =
        rawUri.startsWith("file://") ||
        rawUri.startsWith("asset://") ||
        rawUri.startsWith("blob:") ||
        rawUri.startsWith("data:");
      if (!isSafeUri) {
        logger.warn("[SettingsModal] Blocked unsafe custom sound URI:", rawUri.slice(0, 80));
        return;
      }
      const player = createAudioPlayer({ uri: rawUri });
      previewProbePlayerRef.current = player;
      const hashParts = uri.split("#t=")[1];
      let startMs = 0;
      if (hashParts) {
        const parts = hashParts.split(",").map(Number);
        if (!isNaN(parts[0])) startMs = parts[0];
      }
      // Wait briefly for the player to load before seeking
      const start = Date.now();
      while (Date.now() - start < 800) {
        const d = player.duration;
        if (typeof d === "number" && d > 0 && isFinite(d)) break;
        await new Promise((r) => setTimeout(r, 30));
      }
      try { if (startMs > 0) await player.seekTo(startMs / 1000); } catch {}
      safePlay(player, "settings.previewProbe");
      previewStopTimerRef.current = setTimeout(() => {
        try { player.pause(); } catch {}
        try { player.remove(); } catch {}
        if (previewProbePlayerRef.current === player) previewProbePlayerRef.current = null;
        previewStopTimerRef.current = null;
      }, Math.max(150, duration * 1000));
    } catch (e) {
      logger.warn("Preview failed:", e);
    }
  }, []);

  const playSoundPreview = useCallback((set: SoundSet) => {
    soundPreviewRef.current?.playSoundPreview(set);
  }, []);

  const previewCustomSample = useCallback((sourceSet: BuiltinSoundSet, sourceRole: SoundRole) => {
    soundPreviewRef.current?.previewCustomSample(sourceSet, sourceRole);
  }, []);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = S.isLandscape;
  const isTablet = S.isTablet;
  const cardMaxWidth = isTablet ? 600 : (isLandscape ? Math.min(winW * 0.92, 900) : 540);
  const maxSheetHeight = isLandscape ? winH * 0.96 : winH * 0.9;

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
  }, []);

  const onVolumeChangeRef = useRef(onVolumeChange);
  onVolumeChangeRef.current = onVolumeChange;

  const updateVolumeFromX = useCallback(
    (pageX: number) => {
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
    },
    []
  );

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
      onPanResponderMove: (e) => {
        updateVolumeRef.current(e.nativeEvent.pageX);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const nativePanHandlers =
    Platform.OS !== "web" ? panResponder.panHandlers : {};

  const trackRef = useRef<View>(null);

  const handleWebMouse = useCallback(
    (e: any) => {
      if (Platform.OS !== "web") return;
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      trackLeftRef.current = rect.left;

      const startUpdate = (me: MouseEvent) => {
        updateVolumeFromX(me.clientX);
      };

      startUpdate(e.nativeEvent);

      const handleMove = (me: MouseEvent) => {
        startUpdate(me);
      };
      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [updateVolumeFromX]
  );

  const sampleTrackRef = useRef<View>(null);
  const sampleTrackWidthRef = useRef(0);
  const sampleTrackLeftRef = useRef(0);
  const lastSampleHapticRef = useRef(0);

  const onSampleVolumeChangeRef = useRef(onSampleVolumeChange);
  onSampleVolumeChangeRef.current = onSampleVolumeChange;

  const onSampleTrackLayout = useCallback((e: LayoutChangeEvent) => {
    sampleTrackWidthRef.current = e.nativeEvent.layout.width;
  }, []);

  const updateSampleVolumeFromX = useCallback(
    (pageX: number) => {
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
    },
    []
  );

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
      onPanResponderMove: (e) => {
        updateSampleVolumeRef.current(e.nativeEvent.pageX);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const sampleNativePanHandlers =
    Platform.OS !== "web" ? samplePanResponder.panHandlers : {};

  const handleSampleWebMouse = useCallback(
    (e: any) => {
      if (Platform.OS !== "web") return;
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      sampleTrackLeftRef.current = rect.left;

      const startUpdate = (me: MouseEvent) => {
        updateSampleVolumeFromX(me.clientX);
      };

      startUpdate(e.nativeEvent);

      const handleMove = (me: MouseEvent) => {
        startUpdate(me);
      };
      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [updateSampleVolumeFromX]
  );

  const sampleVolPct = Math.round(sampleVolume * 100);
  const sampleVolumeIcon =
    sampleVolume === 0
      ? "volume-off"
      : sampleVolume < 0.3
        ? "volume-low"
        : sampleVolume < 0.7
          ? "volume-medium"
          : "volume-high";

  const hueFromPosition = useCallback((ratio: number): string => {
    const r = Math.max(0, Math.min(1, ratio));
    const segment = r * (HUE_COLORS.length - 1);
    const idx = Math.floor(segment);
    const t = segment - idx;
    const c1 = HUE_COLORS[Math.min(idx, HUE_COLORS.length - 1)];
    const c2 = HUE_COLORS[Math.min(idx + 1, HUE_COLORS.length - 1)];
    const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
    const rr = Math.round(r1 + (r2 - r1) * t);
    const gg = Math.round(g1 + (g2 - g1) * t);
    const bb = Math.round(b1 + (b2 - b1) * t);
    return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`.toUpperCase();
  }, []);

  const updateHueFromX = useCallback(
    (pageX: number) => {
      const w = hueTrackWidthRef.current;
      if (w <= 0) return;
      if (hueTrackRef.current) {
        (hueTrackRef.current as any).measureInWindow?.((x: number) => {
          const relX = pageX - x;
          const ratio = Math.max(0, Math.min(1, relX / w));
          const hex = hueFromPosition(ratio);
          setCustomHex(hex);
          setHexInput(hex);
          setThemeColor("custom");
          setShowCustomPicker(true);
        });
      }
    },
    [hueFromPosition, setCustomHex, setThemeColor]
  );

  const huePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => { updateHueFromX(e.nativeEvent.pageX); },
      onPanResponderMove: (e) => { updateHueFromX(e.nativeEvent.pageX); },
      onPanResponderRelease: () => {},
    })
  ).current;

  const handleHueWebMouse = useCallback(
    (e: any) => {
      if (Platform.OS !== "web") return;
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const doUpdate = (pageX: number) => {
        const relX = pageX - rect.left;
        const ratio = Math.max(0, Math.min(1, relX / w));
        const hex = hueFromPosition(ratio);
        setCustomHex(hex);
        setHexInput(hex);
        setThemeColor("custom");
        setShowCustomPicker(true);
      };
      doUpdate(e.nativeEvent.clientX);
      const handleMove = (me: MouseEvent) => { doUpdate(me.clientX); };
      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [hueFromPosition, setCustomHex, setThemeColor]
  );

  const handleHexSubmit = useCallback(() => {
    let h = hexInput.trim();
    if (!h.startsWith("#")) h = "#" + h;
    if (/^#[0-9A-Fa-f]{6}$/.test(h)) {
      setCustomHex(h.toUpperCase());
      setThemeColor("custom");
      setShowCustomPicker(true);
    } else {
      setHexInput(customHex);
    }
  }, [hexInput, customHex, setCustomHex, setThemeColor]);

  const pickHubImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      addHubImage(result.assets[0].uri);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [addHubImage]);

  const volumeIcon =
    volume === 0
      ? "volume-off"
      : volume < 0.15
        ? "volume-low"
        : volume < 0.5
          ? "volume-medium"
          : "volume-high";

  const pct = Math.round(volume * 100);

  const TRIPLE_OPTS = getTripleOptions(t);
  const SOUND_OPTS = getSoundSetOptions(t);

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


  const sampleRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const sampleRecorderRef = useRef(sampleRecorder);
  const sampleRecordingActiveRef = useRef(false);
  useEffect(() => { sampleRecorderRef.current = sampleRecorder; }, [sampleRecorder]);
  useEffect(() => {
    return () => {
      // 녹음 중에 모달이 닫히거나 언마운트돼도 오디오 세션과 메트로놈이 회복되도록.
      if (sampleRecordingActiveRef.current) {
        sampleRecordingActiveRef.current = false;
        try { void sampleRecorderRef.current.stop(); } catch {}
      }
      void releaseAudioSession("settingsSampleRec");
    };
  }, []);

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
      // 시작 실패 시 세션 회복 보장.
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

  const renderThemeTab = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name={themeMode === "day" ? "sunny" : "moon"} size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "themeMode")}</Text>
        </View>
        <View style={styles.tripleRow}>
          {([
            { value: "night" as const, icon: "moon" as const, labelKey: "nightMode" as const },
            { value: "day" as const, icon: "sunny" as const, labelKey: "dayMode" as const },
          ]).map((opt) => {
            const active = themeMode === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.tripleBtn, { borderColor: C.border, backgroundColor: C.surface }, active && [styles.tripleBtnActive, { borderColor: C.accent, backgroundColor: C.accentDim }]]}
                onPress={() => {
                  setThemeMode(opt.value);
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
              >
                <Ionicons name={opt.icon} size={S.ms(14, 0.4)} color={active ? C.accent : C.textSecondary} style={{ marginRight: Spacing.xs }} />
                <Text style={[styles.tripleBtnText, { color: C.textSecondary }, active && [styles.tripleBtnTextActive, { color: C.accent }]]}>
                  {t("settings", opt.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="language-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "language")}</Text>
        </View>
        <View style={styles.tripleRow}>
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = language === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.tripleBtn, active && [styles.tripleBtnActive, { borderColor: C.accent, backgroundColor: C.accentDim }]]}
                onPress={() => {
                  setLanguage(opt.value);
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.tripleBtnText, active && [styles.tripleBtnTextActive, { color: C.accent }]]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "themeColor")}</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.themeScroll}
        >
          {PRESET_COLORS.map((opt) => {
            const active = themeColor === opt.value;
            return (
              <Pressable
                key={opt.value}
                testID={`theme-${opt.value}`}
                onPress={() => {
                  setThemeColor(opt.value);
                  setShowCustomPicker(false);
                  if (Platform.OS !== "web") {
                    Haptics.selectionAsync();
                  }
                }}
                style={[
                  styles.themeChip,
                  active && { borderColor: opt.color },
                ]}
              >
                <View
                  style={[
                    styles.themeDot,
                    { backgroundColor: opt.color },
                  ]}
                />
                {active && (
                  <Ionicons name="checkmark" size={S.ms(10, 0.4)} color={C.white} style={styles.themeCheck} />
                )}
              </Pressable>
            );
          })}
          <Pressable
            testID="theme-custom"
            onPress={() => {
              setShowCustomPicker(true);
              setThemeColor("custom");
              if (Platform.OS !== "web") {
                Haptics.selectionAsync();
              }
            }}
            style={[
              styles.themeChip,
              styles.customChip,
              themeColor === "custom" && { borderColor: customHex },
            ]}
          >
            {themeColor === "custom" ? (
              <>
                <View style={[styles.themeDot, { backgroundColor: customHex }]} />
                <Ionicons name="checkmark" size={S.ms(10, 0.4)} color={C.white} style={styles.themeCheck} />
              </>
            ) : (
              <Ionicons name="color-wand-outline" size={S.ms(18, 0.4)} color={C.textSecondary} />
            )}
          </Pressable>
        </ScrollView>
        {showCustomPicker && (
          <View style={styles.customPickerContainer}>
            <View
              ref={hueTrackRef}
              style={styles.hueTrackWrapper}
              onLayout={(e) => { hueTrackWidthRef.current = e.nativeEvent.layout.width; }}
              {...(Platform.OS !== "web" ? huePanResponder.panHandlers : {})}
              {...(Platform.OS === "web" ? { onMouseDown: handleHueWebMouse } as any : {})}
            >
              <LinearGradient
                colors={HUE_COLORS as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.hueTrack}
              />
              <View style={[styles.hueThumb, { backgroundColor: customHex, borderColor: C.white }]} />
            </View>
            <View style={styles.hexRow}>
              <View style={[styles.hexPreview, { backgroundColor: customHex }]} />
              <TextInput
                style={[styles.hexInput, { borderColor: C.accent }]}
                value={hexInput}
                onChangeText={setHexInput}
                onBlur={handleHexSubmit}
                onSubmitEditing={handleHexSubmit}
                placeholder="#FFFFFF"
                placeholderTextColor={C.textTertiary}
                maxLength={7}
                autoCapitalize="characters"
              />
            </View>
          </View>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="image-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "hubImages")}</Text>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>
          {t("settings", "hubImagesHint")}
        </Text>

        {hubImages.map((img) => {
          const beatTypeOptions: { key: BeatTypeKey; label: string; icon: any }[] = [
            { key: "normal", label: t("beatTypes", "normal"), icon: "ellipse-outline" },
            { key: "accent", label: t("beatTypes", "accent"), icon: "chevron-up-outline" },
            { key: "strong", label: t("beatTypes", "strong"), icon: "chevron-up" },
          ];
          return (
            <View key={img.id} style={styles.hubImageCard}>
              <View style={styles.hubImageTop}>
                <Image source={{ uri: img.uri }} style={styles.hubImageThumb} />
                <View style={styles.hubImageChips}>
                  {beatTypeOptions.map((bt) => {
                    const active = img.beatTypes.includes(bt.key);
                    return (
                      <Pressable
                        key={bt.key}
                        onPress={() => {
                          const next = active
                            ? img.beatTypes.filter((t) => t !== bt.key)
                            : [...img.beatTypes, bt.key];
                          if (next.length > 0) updateHubImageBeatTypes(img.id, next);
                        }}
                        style={[
                          styles.beatTypeChip,
                          active
                            ? { backgroundColor: C.accentDim, borderColor: C.accent }
                            : { backgroundColor: C.surface, borderColor: C.border },
                        ]}
                      >
                        <Ionicons name={bt.icon} size={S.ms(12, 0.4)} color={active ? C.accent : C.textTertiary} />
                        <Text style={[styles.beatTypeChipText, { color: active ? C.accent : C.textTertiary }]}>
                          {bt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable onPress={() => removeHubImage(img.id)} style={styles.hubImageRemove}>
                  <Ionicons name="close-circle" size={S.ms(22, 0.4)} color={C.danger} />
                </Pressable>
              </View>
            </View>
          );
        })}

        {hubImages.length < 3 && (
          <Pressable
            onPress={pickHubImage}
            style={[styles.addHubImageBtn, { borderColor: C.accent }]}
          >
            <Ionicons name="add-circle-outline" size={S.ms(20, 0.4)} color={C.accent} />
            <Text style={[styles.addHubImageText, { color: C.accent }]}>
              {t("settings", "addImage")} ({hubImages.length}/3)
            </Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="swap-horizontal-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "landscapeReversed")}</Text>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "landscapeReversedHint")}</Text>
        <Pressable
          onPress={() => {
            onLandscapeReversedChange(!landscapeReversed);
            if (Platform.OS !== "web") Haptics.selectionAsync();
          }}
          style={[
            styles.toggleRow,
            { borderColor: landscapeReversed ? C.accent : C.border, backgroundColor: landscapeReversed ? C.accentDim : C.surface },
          ]}
        >
          <Ionicons name={landscapeReversed ? "checkmark-circle" : "ellipse-outline"} size={S.ms(20, 0.4)} color={landscapeReversed ? C.accent : C.textTertiary} />
          <Text style={[styles.toggleLabel, { color: landscapeReversed ? C.accent : C.textSecondary }]}>
            {landscapeReversed ? "ON" : "OFF"}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="image-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "showLandscapeImage")}</Text>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "showLandscapeImageHint")}</Text>
        <Pressable
          onPress={() => {
            onShowLandscapeImageChange(!showLandscapeImage);
            if (Platform.OS !== "web") Haptics.selectionAsync();
          }}
          style={[
            styles.toggleRow,
            { borderColor: showLandscapeImage ? C.accent : C.border, backgroundColor: showLandscapeImage ? C.accentDim : C.surface },
          ]}
        >
          <Ionicons name={showLandscapeImage ? "checkmark-circle" : "ellipse-outline"} size={S.ms(20, 0.4)} color={showLandscapeImage ? C.accent : C.textTertiary} />
          <Text style={[styles.toggleLabel, { color: showLandscapeImage ? C.accent : C.textSecondary }]}>
            {showLandscapeImage ? "ON" : "OFF"}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="refresh-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "beatDirection")}</Text>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "beatDirectionHint")}</Text>
        <View style={styles.tripleRow}>
          {([
            { value: "cw" as const, label: t("settings", "clockwise"), icon: "arrow-redo-outline" as const },
            { value: "ccw" as const, label: t("settings", "counterclockwise"), icon: "arrow-undo-outline" as const },
          ]).map((opt) => {
            const active = beatDirection === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.tripleBtn, active && [styles.tripleBtnActive, { borderColor: C.accent, backgroundColor: C.accentDim }]]}
                onPress={() => {
                  onBeatDirectionChange(opt.value);
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
              >
                <Ionicons name={opt.icon} size={S.ms(14, 0.4)} color={active ? C.accent : C.textTertiary} style={{ marginRight: Spacing.xs }} />
                <Text style={[styles.tripleBtnText, active && [styles.tripleBtnTextActive, { color: C.accent }]]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="headset-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "barMetronomeChannel")}</Text>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "barMetronomeChannelHint")}</Text>
        <View style={styles.tripleRow}>
          {(["both", "left", "right"] as const).map((opt) => {
            const active = barMetronomeChannel === opt;
            return (
              <Pressable
                key={opt}
                style={[styles.tripleBtn, active && [styles.tripleBtnActive, { borderColor: C.accent, backgroundColor: C.accentDim }]]}
                onPress={() => {
                  onBarMetronomeChannelChange(opt);
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.tripleBtnText, active && [styles.tripleBtnTextActive, { color: C.accent }]]}>
                  {opt === "left" ? t("noteRecorder", "channel_left") : opt === "right" ? t("noteRecorder", "channel_right") : t("noteRecorder", "channel_both")}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="layers-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "barCellOpacity")}</Text>
          <Text style={[styles.sectionValue, { color: C.accent }]}>{Math.round(barCellOpacity * 100)}%</Text>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "barCellOpacityHint")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 }}>
          <Pressable
            onPress={() => { const v = Math.max(0, Math.round((barCellOpacity - 0.05) * 100) / 100); onBarCellOpacityChange(v); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
            style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: C.backgroundSecondary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: C.text, fontSize: 20, fontFamily: "SpaceGrotesk_600SemiBold" }}>−</Text>
          </Pressable>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: C.overlay06 }}>
            <View style={{ width: `${barCellOpacity * 100}%` as any, height: 4, borderRadius: 2, backgroundColor: C.accent }} />
          </View>
          <Pressable
            onPress={() => { const v = Math.min(1, Math.round((barCellOpacity + 0.05) * 100) / 100); onBarCellOpacityChange(v); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
            style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: C.backgroundSecondary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: C.text, fontSize: 20, fontFamily: "SpaceGrotesk_600SemiBold" }}>+</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="resize-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "barRowHeight")}</Text>
          <Text style={[styles.sectionValue, { color: C.accent }]}>{barRowHeight}px</Text>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "barRowHeightHint")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 }}>
          <Pressable
            onPress={() => { const v = Math.max(32, barRowHeight - 4); onBarRowHeightChange(v); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
            style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: C.backgroundSecondary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: C.text, fontSize: 20, fontFamily: "SpaceGrotesk_600SemiBold" }}>−</Text>
          </Pressable>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: C.overlay06 }}>
            <View style={{ width: `${((barRowHeight - 32) / 40) * 100}%` as any, height: 4, borderRadius: 2, backgroundColor: C.accent }} />
          </View>
          <Pressable
            onPress={() => { const v = Math.min(72, barRowHeight + 4); onBarRowHeightChange(v); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
            style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: C.backgroundSecondary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: C.text, fontSize: 20, fontFamily: "SpaceGrotesk_600SemiBold" }}>+</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="flash-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "screenFlash")}</Text>
          <HelpIcon
            title={t("settings", "screenFlash")}
            message={t("settings", "screenFlashHelp")}
          />
        </View>
        <TripleSelector value={flashMode} onChange={onFlashModeChange} accentColor={C.accent} accentDimColor={C.accentDim} options={TRIPLE_OPTS} />
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="phone-portrait-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "hapticFeedback")}</Text>
          <HelpIcon
            title={t("settings", "hapticFeedback")}
            message={t("settings", "hapticFeedbackHelp")}
          />
        </View>
        <TripleSelector value={hapticMode} onChange={onHapticModeChange} accentColor={C.accent} accentDimColor={C.accentDim} options={TRIPLE_OPTS} />
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="chart-line" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "activityLogging")}</Text>
          <Pressable onPress={() => setShowLoggingInfo(true)} hitSlop={8}>
            <Ionicons name="information-circle-outline" size={S.ms(18, 0.4)} color={C.textTertiary} />
          </Pressable>
          <Switch
            value={loggingEnabled}
            onValueChange={(val) => {
              if (val && !loggingEnabled) {
                setShowLoggingInfo(true);
              }
              onLoggingEnabledChange(val);
            }}
            trackColor={{ false: C.surfaceLight, true: C.accentMuted }}
            thumbColor={loggingEnabled ? C.accent : C.textSecondary}
            style={{ transform: [{ scale: 0.85 }] }}
          />
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>
          {t("settings", "loggingHint")}
        </Text>
      </View>
    </>
  );

  const renderSoundTab = () => (
    <>
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
                {
                  width: `${volume * 50}%` as any,
                  backgroundColor: volume > 1.0 ? "#FF4444" : volume >= 0.8 ? "#FF6B35" : C.accent,
                },
              ]}
            />
          </View>
          <View style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1.5, backgroundColor: C.textSecondary, opacity: 0.35 }} />
          <View
            style={[
              styles.sliderThumb,
              {
                left: `${volume * 50}%` as any,
                backgroundColor: volume > 1.0 ? "#FF4444" : volume >= 0.8 ? "#FF6B35" : C.accent,
              },
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
              style={[
                styles.sliderFill,
                { width: `${sampleVolume * 100}%` as any, backgroundColor: sampleVolume >= 0.8 ? "#FF6B35" : C.accent },
              ]}
            />
          </View>
          <View
            style={[
              styles.sliderThumb,
              { left: `${sampleVolume * 100}%` as any, backgroundColor: sampleVolume >= 0.8 ? "#FF6B35" : C.accent },
            ]}
          />
        </View>
        {sampleVolume >= 0.8 && (
          <Text style={[styles.volumeWarning]}>{t("settings", "sampleVolumeWarning")}</Text>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="music-note-eighth" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "soundSet")}</Text>
        </View>

        {!editingCustomSlot && (
          <View style={{ marginTop: 8, gap: 2 }}>
            {[
              ...BUILTIN_SOUND_SETS.map(key => ({ key, label: t("soundSets", key as any), isCustom: false })),
              ...Object.entries(customSoundSets).map(([k, cfg]) => ({ key: k, label: cfg.name, isCustom: true })),
            ].map(opt => {
              const isMain = soundSet === opt.key;
              const usedInLayers = Object.entries(layerSoundSets)
                .filter(([, v]) => v === opt.key)
                .map(([k]) => Number(k))
                .sort((a, b) => a - b);
              return (
                <Pressable
                  key={opt.key}
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: isMain ? C.accentDim : C.overlay08, gap: 8 }}
                  onPress={() => { onSoundSetChange(opt.key as any); playSoundPreview(opt.key as SoundSet); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
                >
                  <Ionicons
                    name={isMain ? "checkmark-circle" : "ellipse-outline"}
                    size={S.ms(16, 0.4)}
                    color={isMain ? C.accent : C.textTertiary}
                  />
                  <Text style={{ flex: 1, color: isMain ? C.accent : C.text, fontSize: FontSize.small, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                    {opt.label}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    {isMain && (
                      <View style={{ backgroundColor: C.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: C.background, fontSize: 9, fontFamily: "SpaceGrotesk_600SemiBold" }}>{t("settings", "soundSetMain")}</Text>
                      </View>
                    )}
                    {usedInLayers.map(ln => (
                      <View key={ln} style={{ backgroundColor: C.overlay08, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }}>
                        <Text style={{ color: C.textSecondary, fontSize: 9 }}>{t("settings", "soundSetLayerBadge").replace("%s", String(ln))}</Text>
                      </View>
                    ))}
                    {opt.isCustom && (
                      <Pressable
                        hitSlop={8}
                        onPress={() => openCustomEditor(opt.key)}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="pencil-outline" size={S.ms(14, 0.4)} color={C.textSecondary} />
                      </Pressable>
                    )}
                  </View>
                </Pressable>
              );
            })}

            {Object.keys(customSoundSets).length < 3 && (
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderStyle: "dashed", marginTop: 4 }}
                onPress={() => {
                  const slot = getNextCustomSlot();
                  if (slot) openCustomEditor(slot);
                }}
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
                      <Text style={[csStyles.chipText, sampleType === "builtin" && { color: C.accent }]}>
                        {t("customSoundSet", "sourceBuiltin")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[csStyles.chip, sampleType === "custom" && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                      onPress={() => {
                        item.setter({ ...item.state, type: "custom" });
                        if (Platform.OS !== "web") Haptics.selectionAsync();
                      }}
                    >
                      <Text style={[csStyles.chipText, sampleType === "custom" && { color: C.accent }]}>
                        {t("customSoundSet", "sourceCustom")}
                      </Text>
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
                                {t("soundSets", bs)}
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
                    <Text style={[csStyles.durationValue, { color: C.accent }]}>
                      {item.state.duration.toFixed(1)}s
                    </Text>
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
                <Pressable
                  style={csStyles.deleteBtn}
                  onPress={() => deleteCustomSet(editingCustomSlot)}
                >
                  <Ionicons name="trash-outline" size={S.ms(16, 0.4)} color="#F85149" />
                  <Text style={csStyles.deleteBtnText}>{t("customSoundSet", "delete")}</Text>
                </Pressable>
              )}
              <Pressable
                style={[csStyles.saveBtn, { backgroundColor: C.accent }]}
                onPress={saveCustomSet}
              >
                <Ionicons name="checkmark" size={S.ms(16, 0.4)} color={C.background} />
                <Text style={csStyles.saveBtnText}>{t("customSoundSet", "save")}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="timer-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "audioOffset")}</Text>
          <HelpIcon
            title={t("settings", "audioOffset")}
            message={t("settings", "audioOffsetHelp")}
          />
          <Text style={[styles.sectionValue, { color: C.accent }]}>
            {audioOffsetMs > 0 ? "+" : ""}{audioOffsetMs}ms
          </Text>
        </View>
        <View style={styles.offsetRow}>
          <Pressable
            style={styles.offsetBtn}
            onPress={() => {
              const next = Math.max(-200, audioOffsetMs - 5);
              onAudioOffsetChange(next);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <Ionicons name="remove" size={S.ms(18, 0.4)} color={C.text} />
          </Pressable>
          <Pressable
            style={styles.offsetBtn}
            onPress={() => {
              const next = Math.max(-200, audioOffsetMs - 1);
              onAudioOffsetChange(next);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <Text style={styles.offsetBtnText}>-1</Text>
          </Pressable>
          <Pressable
            style={[styles.offsetBtn, styles.offsetResetBtn]}
            onPress={() => {
              onAudioOffsetChange(0);
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={styles.offsetResetText}>0</Text>
          </Pressable>
          <Pressable
            style={styles.offsetBtn}
            onPress={() => {
              const next = Math.min(200, audioOffsetMs + 1);
              onAudioOffsetChange(next);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <Text style={styles.offsetBtnText}>+1</Text>
          </Pressable>
          <Pressable
            style={styles.offsetBtn}
            onPress={() => {
              const next = Math.min(200, audioOffsetMs + 5);
              onAudioOffsetChange(next);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <Ionicons name="add" size={S.ms(18, 0.4)} color={C.text} />
          </Pressable>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>
          {t("settings", "audioOffsetHint")}
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

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
                onPress={() => {
                  onTimerStopModeChange(opt.value);
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.tripleBtnText, active && [styles.tripleBtnTextActive, { color: C.accent }]]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>
          {timerStopMode === "end-of-cycle"
            ? t("settings", "timerStopHintEndCycle")
            : t("settings", "timerStopHintImmediate")}
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

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
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>
          {t("settings", "autoResumeAfterInterruptionHint")}
        </Text>
      </View>

    </>
  );

  const renderProfileTab = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="person-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "nickname")}</Text>
        </View>
        <TextInput
          style={[styles.usernameInput, { borderColor: C.accentMuted }]}
          value={localUsername}
          onChangeText={(text) => {
            setLocalUsername(text);
            onUsernameChange(text);
          }}
          placeholder={t("settings", "nicknamePlaceholder")}
          placeholderTextColor={C.textTertiary}
          maxLength={30}
          testID="settings-username"
        />
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="location" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "practiceRoom")}</Text>
        </View>

        {roomTrackingActive && trackingRoomName && (
          <View style={[styles.trackingBanner, { borderColor: C.success }]}>
            <View style={styles.trackingDot} />
            <Text style={[styles.trackingText, { color: C.success }]}>
              {trackingRoomName}{t("settings", "trackingAt")}
            </Text>
            <Pressable style={[styles.trackingStopBtn, { backgroundColor: C.danger }]} onPress={onStopRoomTracking}>
              <Text style={styles.trackingStopText}>{t("settings", "trackingStop")}</Text>
            </Pressable>
          </View>
        )}

        {practiceRooms.length === 0 && !showAddRoom && (
          <Text style={styles.roomEmptyHint}>
            {t("settings", "noRooms")}
          </Text>
        )}

        {practiceRooms.map((room) => {
          const isTracking = roomTrackingActive && trackingRoomName === room.name;
          return (
            <View key={room.id} style={styles.roomRow}>
              <View style={styles.roomInfo}>
                <Ionicons name="location-outline" size={S.ms(14, 0.4)} color={C.accent} />
                <Text style={styles.roomName} numberOfLines={1}>{room.name}</Text>
              </View>
              <View style={styles.roomActions}>
                {!isTracking && !roomTrackingActive && (
                  <Pressable
                    style={[styles.roomStartBtn, { backgroundColor: C.accentDim }]}
                    onPress={() => onStartRoomTracking({ id: room.id, name: room.name })}
                  >
                    <Ionicons name="play" size={S.ms(12, 0.4)} color={C.accent} />
                  </Pressable>
                )}
                <Pressable onPress={() => handleDeleteRoom(room.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={S.ms(14, 0.4)} color={C.textTertiary} />
                </Pressable>
              </View>
            </View>
          );
        })}

        {showAddRoom ? (
          <View style={[styles.addRoomForm, { borderColor: C.accentDim }]}>
            <Text style={styles.addRoomHint}>{t("settings", "addRoomHint")}</Text>
            <View style={styles.addRoomRow}>
              <TextInput
                style={[styles.usernameInput, { borderColor: C.accentMuted, flex: 1 }]}
                value={newRoomName}
                onChangeText={setNewRoomName}
                placeholder={t("settings", "roomNamePlaceholder")}
                placeholderTextColor={C.textTertiary}
                maxLength={30}
              />
              <Pressable style={[styles.addRoomSaveBtn, { backgroundColor: C.accent }]} onPress={handleAddRoom} disabled={addingRoom}>
                {addingRoom ? (
                  <ActivityIndicator size="small" color={C.surface} />
                ) : (
                  <Ionicons name="checkmark" size={S.ms(16, 0.4)} color={C.surface} />
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={[styles.addRoomBtn, { borderColor: C.accentDim }]}
            onPress={() => setShowAddRoom(true)}
          >
            <Ionicons name="add" size={S.ms(16, 0.4)} color={C.accent} />
            <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "addRoom")}</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="cloud-download-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "backupData")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <Pressable
            style={[styles.addRoomBtn, { borderColor: C.accentDim, flex: 1 }]}
            onPress={async () => {
              const { exportBackup } = await import("@/lib/backup");
              const ok = await exportBackup();
              Alert.alert(
                ok ? t("settings", "complete") : t("settings", "error"),
                ok ? t("settings", "backupSuccess") : t("settings", "backupFail")
              );
            }}
          >
            <Ionicons name="download-outline" size={S.ms(15, 0.4)} color={C.accent} />
            <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "createBackup")}</Text>
          </Pressable>
          <Pressable
            style={[styles.addRoomBtn, { borderColor: C.accentDim, flex: 1 }]}
            onPress={() => {
              Alert.alert(
                t("settings", "restoreBackup"),
                t("settings", "restoreWarning"),
                [
                  { text: t("settings", "cancel"), style: "cancel" },
                  {
                    text: t("settings", "restoreConfirm"),
                    style: "destructive",
                    onPress: async () => {
                      const { importBackup } = await import("@/lib/backup");
                      const result = await importBackup();
                      if (result.success) {
                        Alert.alert(
                          t("settings", "complete"),
                          t("settings", "restoreSuccess"),
                          [{
                            text: "OK",
                            onPress: async () => {
                              if (Platform.OS === "web") {
                                window.location.reload();
                              } else {
                                const { reloadAppAsync } = await import("expo");
                                await reloadAppAsync();
                              }
                            },
                          }]
                        );
                      } else {
                        const msgKey = result.errorCode === "unsupported_version"
                          ? "restoreUnsupportedVersion"
                          : "restoreFail";
                        const detail = result.validationDetail
                          ? `\n\n${t("settings", "restoreInvalidDetail")}: ${result.validationDetail}`
                          : "";
                        Alert.alert(t("settings", "error"), t("settings", msgKey) + detail);
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Ionicons name="push-outline" size={S.ms(15, 0.4)} color={C.accent} />
            <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "restoreBackup")}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {!!process.env.EXPO_PUBLIC_DOMAIN && (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="globe-outline" size={S.ms(18, 0.4)} color={C.accent} />
              <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "webVersionLink")}</Text>
            </View>
            <Text style={[styles.offsetHint, { color: C.textSecondary, marginBottom: 8 }]} numberOfLines={1}>
              {`https://${process.env.EXPO_PUBLIC_DOMAIN}`}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                style={[styles.addRoomBtn, { borderColor: C.accentDim, flex: 1 }]}
                onPress={() => Linking.openURL(`https://${process.env.EXPO_PUBLIC_DOMAIN}`)}
              >
                <Ionicons name="open-outline" size={S.ms(15, 0.4)} color={C.accent} />
                <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "webVersionOpen")}</Text>
              </Pressable>
              <Pressable
                style={[styles.addRoomBtn, { borderColor: webUrlCopied ? C.accent : C.accentDim, flex: 1 }]}
                onPress={async () => {
                  await Clipboard.setStringAsync(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
                  setWebUrlCopied(true);
                  if (webUrlCopiedTimerRef.current) clearTimeout(webUrlCopiedTimerRef.current);
                  webUrlCopiedTimerRef.current = setTimeout(() => setWebUrlCopied(false), 2000);
                }}
              >
                <Ionicons name={webUrlCopied ? "checkmark-outline" : "copy-outline"} size={S.ms(15, 0.4)} color={C.accent} />
                <Text style={[styles.addRoomBtnText, { color: C.accent }]}>
                  {webUrlCopied ? t("settings", "webVersionCopied") : t("settings", "webVersionCopy")}
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: C.border }]} />
        </>
      )}

      {onShowOnboarding && (
        <Pressable
          style={styles.addRoomBtn}
          onPress={() => {
            onShowOnboarding();
          }}
        >
          <Ionicons name="play-circle-outline" size={S.ms(15, 0.4)} color={C.accent} />
          <Text style={[styles.addRoomBtnText, { color: C.accent }]}>
            {t("settings", "showOnboardingAgain")}
          </Text>
        </Pressable>
      )}
      {onShowOnboarding && (
        <Text style={[styles.offsetHint, { color: C.textTertiary, marginBottom: 12 }]}>
          {t("settings", "showOnboardingAgainHint")}
        </Text>
      )}

      {onResetApp && !showResetConfirm && (
        <Pressable
          style={styles.resetButton}
          onPress={() => setShowResetConfirm(true)}
        >
          <Ionicons name="refresh-circle-outline" size={S.ms(18, 0.4)} color="#F85149" />
          <Text style={styles.resetButtonText}>{t("settings", "resetApp")}</Text>
        </Pressable>
      )}
      {onResetApp && showResetConfirm && (
        <View style={styles.resetConfirmBox}>
          <Text style={styles.resetConfirmText}>
            {t("settings", "resetConfirm")}
          </Text>
          <View style={styles.resetConfirmButtons}>
            <Pressable
              style={styles.resetCancelBtn}
              onPress={() => setShowResetConfirm(false)}
            >
              <Text style={styles.resetCancelText}>{t("settings", "cancel")}</Text>
            </Pressable>
            <Pressable
              style={styles.resetConfirmBtn}
              onPress={() => {
                setShowResetConfirm(false);
                onResetApp?.();
              }}
            >
              <Text style={styles.resetConfirmBtnText}>{t("settings", "reset")}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="link-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>
            {language === "ko" ? "어시스턴트 연동" : "Assistant Integration"}
          </Text>
        </View>
        <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, fontFamily: "Inter_400Regular", marginBottom: Spacing.sm }}>
          {language === "ko"
            ? "Siri 또는 Google 어시스턴트로 메트로놈을 제어할 수 있습니다."
            : "Control the metronome with Siri or Google Assistant."}
        </Text>
        <Pressable
          onPress={() => setShowAssistantGuide(true)}
          style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.overlay10 }}
          testID="assistant-shortcuts-guide"
        >
          <Text style={{ color: C.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>
            {language === "ko" ? "단축어 설정 방법 보기" : "How to set up shortcuts"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />
        </Pressable>
      </View>

      <AssistantShortcutsGuide
        visible={showAssistantGuide}
        onClose={() => setShowAssistantGuide(false)}
      />
    </>
  );

  const TAB_ITEMS: { key: SettingsTab; icon: string; label: string }[] = [
    { key: "theme", icon: "color-palette-outline", label: t("settings", "themeTab") },
    { key: "sound", icon: "musical-notes-outline", label: t("settings", "soundTab") },
    { key: "profile", icon: "person-circle-outline", label: t("settings", "profileTab") },
    ...(Platform.OS === "web" ? [{ key: "keyboard" as SettingsTab, icon: "keypad-outline", label: t("keyboard", "tabLabel") }] : []),
  ];

  const switchTab = useCallback((tab: SettingsTab) => {
    if (activeTab === tab) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const tabs: SettingsTab[] = ["theme", "sound", "profile", "keyboard"];
    const currentIdx = tabs.indexOf(activeTab);
    const nextIdx = tabs.indexOf(tab);
    const slideDir = nextIdx > currentIdx ? 1 : -1;
    const nativeDriver = Platform.OS !== "web";
    Animated.parallel([
      Animated.timing(tabFadeAnim, { toValue: 0, duration: 100, useNativeDriver: nativeDriver }),
      Animated.timing(tabSlideAnim, { toValue: slideDir * 30, duration: 100, useNativeDriver: nativeDriver }),
    ]).start(() => {
      setActiveTab(tab);
      tabSlideAnim.setValue(-slideDir * 30);
      Animated.parallel([
        Animated.timing(tabFadeAnim, { toValue: 1, duration: 180, useNativeDriver: nativeDriver }),
        Animated.timing(tabSlideAnim, { toValue: 0, duration: 180, useNativeDriver: nativeDriver }),
      ]).start();
    });
  }, [activeTab, tabFadeAnim, tabSlideAnim]);

  const KB_SECTIONS: { titleKey: KbSectionKey; rows: { action: KeyAction; labelKey: KbSectionKey }[] }[] = [
    {
      titleKey: "sectionGeneral",
      rows: [
        { action: "playPause",        labelKey: "actionPlayPause" },
        { action: "tapTempo",         labelKey: "actionTapTempo" },
        { action: "bpmUp",            labelKey: "actionBpmUp" },
        { action: "bpmDown",          labelKey: "actionBpmDown" },
        { action: "bpmRight",         labelKey: "actionBpmRight" },
        { action: "bpmLeft",          labelKey: "actionBpmLeft" },
        { action: "toggleMenu",       labelKey: "actionToggleMenu" },
        { action: "toggleStopwatch",  labelKey: "actionToggleStopwatch" },
        { action: "toggleTimer",      labelKey: "actionToggleTimer" },
        { action: "openPracticeBook", labelKey: "actionOpenBook" },
        { action: "showShortcuts",    labelKey: "actionShowShortcuts" },
        { action: "escape",           labelKey: "actionEscape" },
      ],
    },
    {
      titleKey: "sectionBeat",
      rows: [
        { action: "addBeatNormal",  labelKey: "actionAddNormal" },
        { action: "addBeatAccent",  labelKey: "actionAddAccent" },
        { action: "addBeatStrong",  labelKey: "actionAddStrong" },
        { action: "addBeatMute",    labelKey: "actionAddMute" },
        { action: "removeBeat",     labelKey: "actionRemoveBeat" },
        { action: "cycleBeatTypes", labelKey: "actionCycleBeat" },
      ],
    },
    {
      titleKey: "sectionSub",
      rows: [
        { action: "addSubNormal", labelKey: "actionAddSubNormal" },
        { action: "addSubAccent", labelKey: "actionAddSubAccent" },
        { action: "addSubStrong", labelKey: "actionAddSubStrong" },
        { action: "addSubMute",   labelKey: "actionAddSubMute" },
        { action: "removeSub",    labelKey: "actionRemoveSub" },
      ],
    },
    {
      titleKey: "sectionBar",
      rows: [
        { action: "loopToggle",        labelKey: "actionLoopToggle" },
        { action: "blockPlayModeNext", labelKey: "actionBlockPlayNext" },
      ],
    },
  ];

  const renderKeyboardTab = () => {
    const handleRebindPress = (action: KeyAction) => {
      setRebindingAction(action);
      setRebindConflict(null);
    };

    const handleRebindKeyDown = (e: KeyboardEvent) => {
      if (!rebindingAction) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape") {
        setRebindingAction(null);
        setRebindConflict(null);
        return;
      }

      const newBinding: KeyBinding = {
        code: e.code,
        shift: e.shiftKey || undefined,
        ctrl: (e.ctrlKey || e.metaKey) || undefined,
        alt: e.altKey || undefined,
        label: buildLabel({ code: e.code, shift: e.shiftKey || undefined, ctrl: (e.ctrlKey || e.metaKey) || undefined, alt: e.altKey || undefined }),
      };
      if (!newBinding.shift) delete newBinding.shift;
      if (!newBinding.ctrl) delete newBinding.ctrl;
      if (!newBinding.alt) delete newBinding.alt;

      executeRebind(localKeyBindings, rebindingAction, newBinding, {
        setLocalKeyBindings,
        setRebindingAction,
        setRebindConflict,
        onKeyBindingsChange,
        showKbSaved,
        conflictMessage: t("keyboard", "conflict"),
      });
    };

    return (
      <View>
        {rebindingAction !== null && (
          <KeyRebindOverlay
            actionLabel={t("keyboard", KB_SECTIONS.flatMap(s => s.rows).find(r => r.action === rebindingAction)?.labelKey ?? "actionPlayPause")}
            conflict={rebindConflict}
            onKeyDown={handleRebindKeyDown}
            onCancel={() => { setRebindingAction(null); setRebindConflict(null); }}
            t={t}
          />
        )}
        <Pressable
          style={[kbStyles.resetBtn, { borderColor: C.border }]}
          onPress={() => {
            Alert.alert(t("keyboard", "resetAll"), t("keyboard", "resetConfirm"), [
              { text: t("keyboard", "cancel"), style: "cancel" },
              {
                text: t("keyboard", "resetBtn"),
                onPress: () => {
                  executeRebindReset({ setLocalKeyBindings, onKeyBindingsChange, showKbSaved });
                },
              },
            ]);
          }}
        >
          <Text style={[kbStyles.resetBtnText, { color: C.textSecondary }]}>{t("keyboard", "resetAll")}</Text>
        </Pressable>
        {KB_SECTIONS.map((section) => (
          <View key={section.titleKey} style={kbStyles.section}>
            <Text style={[kbStyles.sectionTitle, { color: C.textSecondary }]}>
              {t("keyboard", section.titleKey)}
            </Text>
            {section.rows.map((row) => {
              const binding = localKeyBindings[row.action];
              const isRebinding = rebindingAction === row.action;
              return (
                <Pressable
                  key={row.action}
                  style={[
                    kbStyles.row,
                    { borderBottomColor: C.border },
                    isRebinding && { backgroundColor: C.overlay10 },
                  ]}
                  onPress={() => handleRebindPress(row.action)}
                >
                  <Text style={[kbStyles.actionLabel, { color: C.text }]}>
                    {t("keyboard", row.labelKey)}
                  </Text>
                  <View style={[
                    kbStyles.keyBadge,
                    { backgroundColor: isRebinding ? C.accent : C.surfaceLight, borderColor: C.border },
                  ]}>
                    <Text style={[kbStyles.keyText, { color: isRebinding ? C.background : C.accent }]}>
                      {isRebinding ? t("keyboard", "pressKey") : buildLabel(binding)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        {kbSavedToast && (
          <View style={kbStyles.savedToast} pointerEvents="none">
            <Text style={[kbStyles.savedToastText, { color: C.accent }]}>
              {t("keyboard", "saved")}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "theme": return renderThemeTab();
      case "sound": return renderSoundTab();
      case "profile": return renderProfileTab();
      case "keyboard": return renderKeyboardTab();
    }
  };

  return (
    <AnimatedModal
      visible={visible}
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <ScrollView
          style={{ marginTop: (insets.top || webTopInset) + 16 }}
          contentContainerStyle={[
            styles.scrollContent,
            {
              maxWidth: cardMaxWidth,
              alignSelf: "center" as const,
              width: "100%",
              paddingBottom: isLandscape ? 16 : 80,
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          onStartShouldSetResponder={() => true}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: C.surface, borderColor: C.border }, isLandscape && { maxHeight: maxSheetHeight }]}
            onPress={(e) => e.stopPropagation()}
          >
            {isLandscape ? (
              <View style={{ flexDirection: "row", flex: 1 }}>
                <View style={{ width: 120 }}>
                  <View style={[styles.header, { marginBottom: 12 }]}>
                    <Text style={[styles.title, { color: C.text }]}>{t("settings", "title")}</Text>
                    <Pressable onPress={onClose} hitSlop={12} testID="settings-close" accessibilityRole="button" accessibilityLabel={t("a11y", "closeModal")}>
                      <Ionicons name="close" size={S.ms(22, 0.4)} color={C.textSecondary} />
                    </Pressable>
                  </View>
                  <View>
                    {TAB_ITEMS.map((tab) => (
                      <Pressable
                        key={tab.key}
                        style={[styles.sidebarTab, { borderColor: activeTab === tab.key ? C.accent : C.border, backgroundColor: activeTab === tab.key ? C.accentDim : C.surfaceLight }]}
                        onPress={() => switchTab(tab.key)}
                        accessibilityRole="button"
                        accessibilityLabel={tab.label}
                        accessibilityState={{ selected: activeTab === tab.key }}
                      >
                        <Ionicons name={tab.icon as any} size={S.ms(16, 0.4)} color={activeTab === tab.key ? C.accent : C.textSecondary} />
                        <Text style={[styles.tabBtnText, { color: activeTab === tab.key ? C.accent : C.textSecondary }]}>{tab.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={[styles.verticalDivider, { backgroundColor: C.border }]} />
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingLeft: 16, paddingBottom: 16 }}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <Animated.View style={{ opacity: tabFadeAnim, transform: [{ translateY: tabSlideAnim }] }}>
                    {renderTabContent()}
                  </Animated.View>
                </ScrollView>
              </View>
            ) : (
              <>
                <View style={styles.header}>
                  <Text style={[styles.title, { color: C.text }]}>{t("settings", "title")}</Text>
                  <Pressable onPress={onClose} hitSlop={12} testID="settings-close" accessibilityRole="button" accessibilityLabel={t("a11y", "closeModal")}>
                    <Ionicons name="close" size={S.ms(22, 0.4)} color={C.textSecondary} />
                  </Pressable>
                </View>
                <View style={styles.tabBar}>
                  {TAB_ITEMS.map((tab) => (
                    <Pressable
                      key={tab.key}
                      style={[styles.tabBtn, activeTab === tab.key && [styles.tabBtnActive, { borderColor: C.accent }]]}
                      onPress={() => switchTab(tab.key)}
                      accessibilityRole="button"
                      accessibilityLabel={tab.label}
                      accessibilityState={{ selected: activeTab === tab.key }}
                    >
                      <Ionicons
                        name={tab.icon as any}
                        size={S.ms(16, 0.4)}
                        color={activeTab === tab.key ? C.accent : C.textSecondary}
                      />
                      <Text style={[styles.tabBtnText, { color: C.textSecondary }, activeTab === tab.key && { color: C.accent }]}>{tab.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={[styles.divider, { backgroundColor: C.border }]} />
                <Animated.View style={{ opacity: tabFadeAnim, transform: [{ translateX: tabSlideAnim }] }}>
                  {renderTabContent()}
                </Animated.View>
              </>
            )}
          </Pressable>
        </ScrollView>
      </Pressable>

      {previewPlayersReady && (
        <SoundPreviewPlayers
          ref={soundPreviewRef}
          customSoundSets={customSoundSets}
          playCustomSampleUri={playCustomSampleUri}
        />
      )}

      <AnimatedModal
        visible={showLoggingInfo}
        transparent
        onRequestClose={() => setShowLoggingInfo(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.overlay} onPress={() => setShowLoggingInfo(false)}>
          <View style={styles.loggingInfoContainer}>
            <Pressable style={[styles.loggingInfoSheet, { backgroundColor: C.surface, borderColor: C.border }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.loggingInfoHeader}>
                <Ionicons name="analytics-outline" size={S.ms(28, 0.4)} color={C.accent} />
                <Text style={[styles.loggingInfoTitle, { color: C.text }]}>{t("loggingInfo", "title")}</Text>
              </View>
              <Text style={[styles.loggingInfoSubtitle, { color: C.textSecondary }]}>{t("loggingInfo", "subtitle")}</Text>

              <View style={[styles.loggingInfoCard, { backgroundColor: C.surfaceLight }]}>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="time-outline" size={S.ms(16, 0.4)} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row1")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="musical-notes-outline" size={S.ms(16, 0.4)} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row2")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="location-outline" size={S.ms(16, 0.4)} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row3")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="bar-chart-outline" size={S.ms(16, 0.4)} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row4")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="trophy-outline" size={S.ms(16, 0.4)} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row5")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="share-social-outline" size={S.ms(16, 0.4)} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row6")}</Text>
                </View>
              </View>

              <View style={styles.loggingInfoFooter}>
                <Ionicons name="shield-checkmark-outline" size={S.ms(14, 0.4)} color={C.textTertiary} />
                <Text style={[styles.loggingInfoFooterText, { color: C.textTertiary }]}>{t("loggingInfo", "footer")}</Text>
              </View>

              <Pressable
                style={[styles.loggingInfoCloseBtn, { backgroundColor: C.accent }]}
                onPress={() => setShowLoggingInfo(false)}
              >
                <Text style={styles.loggingInfoCloseBtnText}>{t("loggingInfo", "close")}</Text>
              </Pressable>
            </Pressable>
          </View>
        </Pressable>
      </AnimatedModal>
    </AnimatedModal>
  );
}


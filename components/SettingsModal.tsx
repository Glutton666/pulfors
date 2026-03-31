import React, { useRef, useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useAudioPlayer } from "expo-audio";
import { Audio, InterruptionModeIOS } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import Colors, { ACCENT_PRESETS, accentFromHex, type ThemeColor } from "@/constants/colors";
import { useTheme, type BeatTypeKey } from "@/contexts/ThemeContext";
import type { FlashMode, HapticMode, SoundSet, BuiltinSoundSet, SoundRole, CustomSoundSetConfig, CustomSoundSample } from "@/lib/storage";
import { loadCustomSoundSets, saveCustomSoundSets, BUILTIN_SOUND_SETS } from "@/lib/storage";
import { soundSets } from "@/lib/metronome-engine";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/lib/i18n";
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

const PRESET_COLORS: { value: Exclude<ThemeColor, "custom">; labelKey: "colorGold" | "colorBlue" | "colorGreen" | "colorRed" | "colorPurple" | "colorCyan" | "colorOrange" | "colorPink" | "colorRose" | "colorNeon" | "colorSaints" | "colorDeepRed" | "colorBeige"; color: string }[] = [
  { value: "gold", labelKey: "colorGold", color: ACCENT_PRESETS.gold.accent },
  { value: "blue", labelKey: "colorBlue", color: ACCENT_PRESETS.blue.accent },
  { value: "green", labelKey: "colorGreen", color: ACCENT_PRESETS.green.accent },
  { value: "red", labelKey: "colorRed", color: ACCENT_PRESETS.red.accent },
  { value: "purple", labelKey: "colorPurple", color: ACCENT_PRESETS.purple.accent },
  { value: "cyan", labelKey: "colorCyan", color: ACCENT_PRESETS.cyan.accent },
  { value: "orange", labelKey: "colorOrange", color: ACCENT_PRESETS.orange.accent },
  { value: "pink", labelKey: "colorPink", color: ACCENT_PRESETS.pink.accent },
  { value: "rose", labelKey: "colorRose", color: ACCENT_PRESETS.rose.accent },
  { value: "neon", labelKey: "colorNeon", color: ACCENT_PRESETS.neon.accent },
  { value: "saintspurple", labelKey: "colorSaints", color: ACCENT_PRESETS.saintspurple.accent },
  { value: "deepred", labelKey: "colorDeepRed", color: ACCENT_PRESETS.deepred.accent },
  { value: "beige", labelKey: "colorBeige", color: ACCENT_PRESETS.beige.accent },
];

const HUE_COLORS = [
  "#FF0000", "#FF8000", "#FFFF00", "#80FF00",
  "#00FF00", "#00FF80", "#00FFFF", "#0080FF",
  "#0000FF", "#8000FF", "#FF00FF", "#FF0080", "#FF0000",
];

type SettingsTab = "theme" | "sound" | "profile";

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  sampleVolume: number;
  onSampleVolumeChange: (volume: number) => void;
  backgroundPlay: boolean;
  onBackgroundPlayChange: (value: boolean) => void;
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
  micMethod: "native" | "webview";
  onMicMethodChange: (val: "native" | "webview") => void;
}

function getSoundSetOptions(t: any): { value: SoundSet; label: string; icon: string }[] {
  return [
    { value: "classic", label: t("soundSets", "classic"), icon: "music-note" },
    { value: "woodblock", label: t("soundSets", "woodblock"), icon: "music-box" },
    { value: "digital", label: t("soundSets", "digital"), icon: "sine-wave" },
    { value: "rimshot", label: t("soundSets", "rimshot"), icon: "music-circle-outline" },
  ];
}

function getTripleOptions(t: any): { value: "all" | "accent" | "off"; label: string }[] {
  return [
    { value: "all", label: t("tripleOptions", "all") },
    { value: "accent", label: t("tripleOptions", "accent") },
    { value: "off", label: t("tripleOptions", "off") },
  ];
}

function TripleSelector({
  value,
  onChange,
  accentColor,
  accentDimColor,
  options,
}: {
  value: "all" | "accent" | "off";
  onChange: (v: "all" | "accent" | "off") => void;
  accentColor: string;
  accentDimColor: string;
  options: { value: "all" | "accent" | "off"; label: string }[];
}) {
  const { colors: C } = useTheme();
  const styles = make_styles(C);
  return (
    <View style={styles.tripleRow}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.tripleBtn, active && [styles.tripleBtnActive, { borderColor: accentColor, backgroundColor: accentDimColor }]]}
            onPress={() => {
              onChange(opt.value);
              if (Platform.OS !== "web") {
                Haptics.selectionAsync();
              }
            }}
          >
            <Text
              style={[
                styles.tripleBtnText,
                active && [styles.tripleBtnTextActive, { color: accentColor }],
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
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
  micMethod,
  onMicMethodChange,
}: SettingsModalProps) {
  const { themeColor, customHex, themeMode, setThemeColor, setCustomHex, setThemeMode, colors: C, hubImages, addHubImage, removeHubImage, updateHubImageBeatTypes } = useTheme();
  const styles = make_styles(C);
  const csStyles = make_csStyles(C);
  const { language, setLanguage, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<SettingsTab>("theme");
  const [showCustomPicker, setShowCustomPicker] = useState(themeColor === "custom");
  const [hexInput, setHexInput] = useState(customHex);
  const [localUsername, setLocalUsername] = useState(username);
  const hueTrackRef = useRef<View>(null);
  const hueTrackWidthRef = useRef(0);
  const trackWidthRef = useRef(0);
  const trackLeftRef = useRef(0);
  const lastHapticRef = useRef(volume);
  const previewIndexRef = useRef<Record<string, number>>({});
  const tabFadeAnim = useRef(new Animated.Value(1)).current;
  const tabSlideAnim = useRef(new Animated.Value(0)).current;

  const [practiceRooms, setPracticeRooms] = useState<PracticeRoom[]>([]);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLoggingInfo, setShowLoggingInfo] = useState(false);
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
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (visible) {
      setLocalUsername(username);
      setShowResetConfirm(false);
      loadPracticeRooms().then(setPracticeRooms);
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
    Alert.prompt?.(
      t("settings", "renameRoom"),
      undefined,
      async (newName: string) => {
        if (!newName?.trim()) return;
        await renamePracticeRoom(room.id, newName.trim());
        setPracticeRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, name: newName.trim() } : r));
      },
      "plain-text",
      room.name
    ) || (() => {
      const newName = Platform.OS === "web" ? window.prompt(t("settings", "renameRoom"), room.name) : null;
      if (newName?.trim()) {
        renamePracticeRoom(room.id, newName.trim());
        setPracticeRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, name: newName.trim() } : r));
      }
    })();
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

  const classicStrong = useAudioPlayer(soundSets.classic.strong);
  const classicHigh = useAudioPlayer(soundSets.classic.high);
  const classicLow = useAudioPlayer(soundSets.classic.low);
  const woodblockStrong = useAudioPlayer(soundSets.woodblock.strong);
  const woodblockHigh = useAudioPlayer(soundSets.woodblock.high);
  const woodblockLow = useAudioPlayer(soundSets.woodblock.low);
  const digitalStrong = useAudioPlayer(soundSets.digital.strong);
  const digitalHigh = useAudioPlayer(soundSets.digital.high);
  const digitalLow = useAudioPlayer(soundSets.digital.low);
  const rimshotStrong = useAudioPlayer(soundSets.rimshot.strong);
  const rimshotHigh = useAudioPlayer(soundSets.rimshot.high);
  const rimshotLow = useAudioPlayer(soundSets.rimshot.low);

  const previewPlayers: Record<SoundSet, typeof classicStrong[]> = {
    classic: [classicStrong, classicHigh, classicLow],
    woodblock: [woodblockStrong, woodblockHigh, woodblockLow],
    digital: [digitalStrong, digitalHigh, digitalLow],
    rimshot: [rimshotStrong, rimshotHigh, rimshotLow],
  };

  const playCustomSampleUri = useCallback(async (uri: string, duration: number) => {
    if (previewSoundRef.current) {
      try { await previewSoundRef.current.unloadAsync(); } catch {}
      previewSoundRef.current = null;
    }
    try {
      const sound = new Audio.Sound();
      const rawUri = uri.split("#")[0];
      await sound.loadAsync({ uri: rawUri });
      previewSoundRef.current = sound;
      const hashParts = uri.split("#t=")[1];
      let startMs = 0;
      if (hashParts) {
        const parts = hashParts.split(",").map(Number);
        if (!isNaN(parts[0])) startMs = parts[0];
      }
      await sound.setPositionAsync(startMs);
      await sound.playAsync();
      setTimeout(async () => {
        try { await sound.stopAsync(); await sound.unloadAsync(); } catch {}
        if (previewSoundRef.current === sound) previewSoundRef.current = null;
      }, duration * 1000);
    } catch (e) {
      console.warn("Preview failed:", e);
    }
  }, []);

  const playSoundPreview = useCallback((set: SoundSet) => {
    const idx = previewIndexRef.current[set] ?? 0;
    let players = previewPlayers[set];
    if (!players) {
      const cfg = customSoundSets[set];
      if (cfg) {
        const samples = [cfg.strong, cfg.accent, cfg.normal];
        const sample = samples[idx % 3];
        if (sample.type === "custom" && sample.sampleUri) {
          playCustomSampleUri(sample.sampleUri, sample.duration);
          previewIndexRef.current[set] = (idx + 1) % 3;
          return;
        }
        const srcSet = sample.sourceSet || "classic";
        const srcRole = sample.sourceRole || "strong";
        players = previewPlayers[srcSet];
        if (players) {
          const roleIdx = srcRole === "strong" ? 0 : srcRole === "high" ? 1 : 2;
          try {
            players[roleIdx].seekTo(0);
            players[roleIdx].play();
          } catch {}
          previewIndexRef.current[set] = (idx + 1) % 3;
          return;
        }
      }
      players = previewPlayers.classic;
    }
    const player = players[idx];
    try {
      player.seekTo(0);
      player.play();
    } catch {}
    previewIndexRef.current[set] = (idx + 1) % 3;
  }, [customSoundSets, playCustomSampleUri]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

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
      const newVol = Math.max(0, Math.min(1, relX / w));
      const rounded = Math.round(newVol * 100) / 100;

      const step = Math.round(rounded * 20);
      const lastStep = Math.round(lastHapticRef.current * 20);
      if (step !== lastStep) {
        lastHapticRef.current = rounded;
        if (Platform.OS !== "web") {
          if (rounded === 0 || rounded === 1) {
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
      : volume < 0.3
        ? "volume-low"
        : volume < 0.7
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
    Alert.alert(
      t("customSoundSet", "deleteTitle"),
      t("customSoundSet", "deleteConfirm"),
      [
        { text: t("customSoundSet", "cancel"), style: "cancel" },
        {
          text: t("customSoundSet", "delete"),
          style: "destructive",
          onPress: () => {
            const updated = { ...customSoundSets };
            delete updated[slot];
            onCustomSoundSetsChange(updated);
            saveCustomSoundSets(updated);
            if (soundSet === slot) onSoundSetChange("classic");
            if (editingCustomSlot === slot) setEditingCustomSlot(null);
          },
        },
      ]
    );
  }, [customSoundSets, onCustomSoundSetsChange, soundSet, onSoundSetChange, editingCustomSlot, t]);

  const getNextCustomSlot = useCallback((): string | null => {
    const slots = ["custom1", "custom2", "custom3"];
    for (const s of slots) {
      if (!customSoundSets[s]) return s;
    }
    return null;
  }, [customSoundSets]);

  const previewCustomSample = useCallback((sourceSet: BuiltinSoundSet, sourceRole: SoundRole) => {
    const players = previewPlayers[sourceSet];
    const idx = sourceRole === "strong" ? 0 : sourceRole === "high" ? 1 : 2;
    try {
      players[idx].seekTo(0);
      players[idx].play();
    } catch {}
  }, [previewPlayers]);

  const ROLE_OPTIONS: { value: SoundRole; labelKey: string }[] = [
    { value: "strong", labelKey: "roleStrong" },
    { value: "high", labelKey: "roleAccent" },
    { value: "low", labelKey: "roleNormal" },
  ];


  const startSampleRecording = useCallback(async (slot: "strong" | "accent" | "normal") => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("customSoundSet", "micPermission"));
      return;
    }
    setRecordingSlot(slot);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        isMeteringEnabled: false,
        android: { extension: ".wav", outputFormat: 6, audioEncoder: 1, sampleRate: 44100, numberOfChannels: 1, bitRate: 705600 },
        ios: { extension: ".wav", outputFormat: "lpcm" as any, audioQuality: 127, sampleRate: 44100, numberOfChannels: 1, bitRate: 705600, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
        web: { mimeType: "audio/webm", bitsPerSecond: 128000 },
      } as any);
      recordingRef.current = recording;
      await recording.startAsync();
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
      console.error("Failed to start recording:", e);
      setRecordingSlot(null);
    }
  }, []);

  const stopSampleRecording = useCallback(async (slot: "strong" | "accent" | "normal") => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    if (!recordingRef.current) { setIsRecording(false); setRecordingSlot(null); return; }
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, interruptionModeIOS: InterruptionModeIOS.MixWithOthers });
      if (uri) {
        const sound = new Audio.Sound();
        await sound.loadAsync({ uri });
        const status = await sound.getStatusAsync();
        let dur = 0.5;
        if (status.isLoaded && status.durationMillis) dur = Math.min(3.0, Math.round(status.durationMillis / 100) / 10);
        await sound.unloadAsync();
        const sample: CustomSoundSample = { type: "custom", sampleUri: uri, sampleName: t("customSoundSet", "record"), duration: dur };
        if (slot === "strong") setCustomStrong(sample);
        else if (slot === "accent") setCustomAccent(sample);
        else setCustomNormal(sample);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) { console.error("Failed to stop recording:", e); }
    setIsRecording(false);
    setRecordingSlot(null);
  }, [t]);

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
      const sound = new Audio.Sound();
      await sound.loadAsync({ uri: fileUri });
      const status = await sound.getStatusAsync();
      let dur = 0.5;
      if (status.isLoaded && status.durationMillis) dur = Math.min(3.0, Math.round(status.durationMillis / 100) / 10);
      await sound.unloadAsync();
      const name = asset.name ? asset.name.replace(/\.[^.]+$/, "").substring(0, 12) : t("customSoundSet", "import");
      const sample: CustomSoundSample = { type: "custom", sampleUri: fileUri, sampleName: name, duration: dur };
      if (slot === "strong") setCustomStrong(sample);
      else if (slot === "accent") setCustomAccent(sample);
      else setCustomNormal(sample);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error("Failed to import audio:", e);
      Alert.alert(t("customSoundSet", "importError"));
    }
  }, [t]);

  const renderThemeTab = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name={themeMode === "day" ? "sunny" : "moon"} size={18} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "themeMode")}</Text>
        </View>
        <View style={styles.tripleRow}>
          {([
            { value: "night" as const, icon: "moon" as const, labelKey: "nightMode" },
            { value: "day" as const, icon: "sunny" as const, labelKey: "dayMode" },
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
                <Ionicons name={opt.icon} size={14} color={active ? C.accent : C.textSecondary} style={{ marginRight: 4 }} />
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
          <Ionicons name="language-outline" size={18} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "language")}</Text>
        </View>
        <View style={styles.tripleRow}>
          {([
            { value: "ko" as Language, label: "한국어" },
            { value: "en" as Language, label: "English" },
          ]).map((opt) => {
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
          <Ionicons name="color-palette-outline" size={18} color={C.accent} />
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
                  <Ionicons name="checkmark" size={10} color={C.white} style={styles.themeCheck} />
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
                <Ionicons name="checkmark" size={10} color={C.white} style={styles.themeCheck} />
              </>
            ) : (
              <Ionicons name="color-wand-outline" size={18} color={C.textSecondary} />
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
          <Ionicons name="image-outline" size={18} color={C.accent} />
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
                        <Ionicons name={bt.icon} size={12} color={active ? C.accent : C.textTertiary} />
                        <Text style={[styles.beatTypeChipText, { color: active ? C.accent : C.textTertiary }]}>
                          {bt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable onPress={() => removeHubImage(img.id)} style={styles.hubImageRemove}>
                  <Ionicons name="close-circle" size={22} color={C.danger} />
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
            <Ionicons name="add-circle-outline" size={20} color={C.accent} />
            <Text style={[styles.addHubImageText, { color: C.accent }]}>
              {t("settings", "addImage")} ({hubImages.length}/3)
            </Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="swap-horizontal-outline" size={18} color={C.accent} />
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
          <Ionicons name={landscapeReversed ? "checkmark-circle" : "ellipse-outline"} size={20} color={landscapeReversed ? C.accent : C.textTertiary} />
          <Text style={[styles.toggleLabel, { color: landscapeReversed ? C.accent : C.textSecondary }]}>
            {landscapeReversed ? "ON" : "OFF"}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="image-outline" size={18} color={C.accent} />
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
          <Ionicons name={showLandscapeImage ? "checkmark-circle" : "ellipse-outline"} size={20} color={showLandscapeImage ? C.accent : C.textTertiary} />
          <Text style={[styles.toggleLabel, { color: showLandscapeImage ? C.accent : C.textSecondary }]}>
            {showLandscapeImage ? "ON" : "OFF"}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="refresh-outline" size={18} color={C.accent} />
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
                <Ionicons name={opt.icon} size={14} color={active ? C.accent : C.textTertiary} style={{ marginRight: 4 }} />
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
          <Ionicons name="flash-outline" size={18} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "screenFlash")}</Text>
        </View>
        <TripleSelector value={flashMode} onChange={onFlashModeChange} accentColor={C.accent} accentDimColor={C.accentDim} options={TRIPLE_OPTS} />
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="phone-portrait-outline" size={18} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "hapticFeedback")}</Text>
        </View>
        <TripleSelector value={hapticMode} onChange={onHapticModeChange} accentColor={C.accent} accentDimColor={C.accentDim} options={TRIPLE_OPTS} />
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="chart-line" size={18} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "activityLogging")}</Text>
          <Pressable onPress={() => setShowLoggingInfo(true)} hitSlop={8}>
            <Ionicons name="information-circle-outline" size={18} color={C.textTertiary} />
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
          <Ionicons name={volumeIcon as any} size={18} color={C.accent} />
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
                { width: `${volume * 100}%` as any, backgroundColor: C.accent },
              ]}
            />
          </View>
          <View
            style={[
              styles.sliderThumb,
              { left: `${volume * 100}%` as any, backgroundColor: C.accent },
            ]}
          />
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name={sampleVolumeIcon as any} size={18} color={C.accent} />
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
                { width: `${sampleVolume * 100}%` as any, backgroundColor: C.accent },
              ]}
            />
          </View>
          <View
            style={[
              styles.sliderThumb,
              { left: `${sampleVolume * 100}%` as any, backgroundColor: C.accent },
            ]}
          />
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="music-note-eighth" size={18} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "soundSet")}</Text>
        </View>
        <View style={styles.soundSetGrid}>
          {SOUND_OPTS.map((opt) => {
            const active = soundSet === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[
                  styles.soundSetBtn,
                  active && [styles.soundSetBtnActive, { borderColor: C.accent, backgroundColor: C.accentDim }],
                ]}
                onPress={() => {
                  onSoundSetChange(opt.value);
                  playSoundPreview(opt.value);
                  if (Platform.OS !== "web") {
                    Haptics.selectionAsync();
                  }
                }}
              >
                <MaterialCommunityIcons
                  name={opt.icon as any}
                  size={20}
                  color={active ? C.accent : C.textSecondary}
                />
                <Text
                  style={[
                    styles.soundSetLabel,
                    active && [styles.soundSetLabelActive, { color: C.accent }],
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}

          {(["custom1", "custom2", "custom3"] as const).map((slot) => {
            const config = customSoundSets[slot];
            if (!config) return null;
            const active = soundSet === slot;
            return (
              <Pressable
                key={slot}
                style={[
                  styles.soundSetBtn,
                  active && [styles.soundSetBtnActive, { borderColor: C.accent, backgroundColor: C.accentDim }],
                ]}
                onPress={() => {
                  onSoundSetChange(slot);
                  playSoundPreview(slot);
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
                onLongPress={() => openCustomEditor(slot)}
              >
                <MaterialCommunityIcons
                  name="tune-variant"
                  size={20}
                  color={active ? C.accent : C.textSecondary}
                />
                <Text
                  style={[
                    styles.soundSetLabel,
                    active && [styles.soundSetLabelActive, { color: C.accent }],
                  ]}
                  numberOfLines={1}
                >
                  {config.name}
                </Text>
              </Pressable>
            );
          })}

          {Object.keys(customSoundSets).length < 3 && (
            <Pressable
              style={[styles.soundSetBtn, styles.soundSetAddBtn]}
              onPress={() => {
                const slot = getNextCustomSlot();
                if (slot) openCustomEditor(slot);
              }}
            >
              <Ionicons name="add" size={20} color={C.textSecondary} />
              <Text style={styles.soundSetLabel}>
                {t("customSoundSet", "addCustom")}
              </Text>
            </Pressable>
          )}
        </View>

        {editingCustomSlot && (
          <View style={csStyles.editorContainer}>
            <View style={csStyles.editorHeader}>
              <Text style={csStyles.editorTitle}>{t("customSoundSet", "title")}</Text>
              <Pressable onPress={() => setEditingCustomSlot(null)}>
                <Ionicons name="close" size={20} color={C.textSecondary} />
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
                    <Ionicons name="play" size={14} color={C.accent} />
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
                          <Ionicons name="musical-note" size={16} color={C.accent} />
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
                            <Ionicons name="close-circle" size={16} color="#F85149" />
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
                          <Ionicons name="stop" size={14} color="#fff" />
                          <Text style={csStyles.recordActionText}>{t("customSoundSet", "stopRecord")}</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={csStyles.recordImportRow}>
                        <Pressable
                          style={[csStyles.recordActionBtn, { backgroundColor: C.accentDim, borderColor: C.accent, borderWidth: 1 }]}
                          onPress={() => startSampleRecording(item.slot)}
                        >
                          <Ionicons name="mic" size={14} color={C.accent} />
                          <Text style={[csStyles.recordActionText, { color: C.accent }]}>{t("customSoundSet", "record")}</Text>
                        </Pressable>
                        <Pressable
                          style={[csStyles.recordActionBtn, { backgroundColor: C.accentDim, borderColor: C.accent, borderWidth: 1 }]}
                          onPress={() => importSampleFile(item.slot)}
                        >
                          <Ionicons name="folder-open" size={14} color={C.accent} />
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
                      <Ionicons name="remove" size={14} color={C.text} />
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
                      <Ionicons name="add" size={14} color={C.text} />
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
                  <Ionicons name="trash-outline" size={16} color="#F85149" />
                  <Text style={csStyles.deleteBtnText}>{t("customSoundSet", "delete")}</Text>
                </Pressable>
              )}
              <Pressable
                style={[csStyles.saveBtn, { backgroundColor: C.accent }]}
                onPress={saveCustomSet}
              >
                <Ionicons name="checkmark" size={16} color={C.background} />
                <Text style={csStyles.saveBtnText}>{t("customSoundSet", "save")}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="layers-outline" size={18} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "layerSoundSet")}</Text>
        </View>
        {Array.from({ length: layerSoundRowCount }, (_, i) => i + 1).map((layerNum) => {
          const currentSet = layerSoundSets[layerNum] || "";
          const allOpts: { value: string; label: string }[] = [
            { value: "", label: t("settings", "layerDefault") },
            ...SOUND_OPTS.map(o => ({ value: o.value, label: o.label })),
          ];
          return (
            <View key={`layer-ss-${layerNum}`} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: "600", width: 52 }}>L{layerNum}</Text>
              <View style={{ flexDirection: "row", flex: 1, gap: 4 }}>
                {allOpts.map(opt => {
                  const active = currentSet === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={{
                        flex: 1,
                        paddingVertical: 6,
                        borderRadius: 6,
                        alignItems: "center",
                        backgroundColor: active ? C.accentDim : "transparent",
                        borderWidth: active ? 1 : 0.5,
                        borderColor: active ? C.accent : C.border,
                      }}
                      onPress={() => {
                        const updated = { ...layerSoundSets };
                        if (opt.value === "") {
                          delete updated[layerNum];
                        } else {
                          updated[layerNum] = opt.value as SoundSet;
                        }
                        onLayerSoundSetsChange(updated);
                        if (Platform.OS !== "web") Haptics.selectionAsync();
                      }}
                    >
                      <Text style={{ fontSize: 10, color: active ? C.accent : C.textSecondary }} numberOfLines={1}>
                        {opt.value === "" ? "Default" : opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {layerNum === layerSoundRowCount && layerNum > 1 && (
                <Pressable
                  onPress={() => {
                    const updated = { ...layerSoundSets };
                    delete updated[layerNum];
                    onLayerSoundSetsChange(updated);
                    setLayerSoundRowCount(prev => prev - 1);
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                  }}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="remove-circle-outline" size={18} color="#F85149" />
                </Pressable>
              )}
            </View>
          );
        })}
        <Pressable
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 8,
            gap: 6,
            borderRadius: 6,
            borderWidth: 0.5,
            borderColor: C.border,
            borderStyle: "dashed",
          }}
          onPress={() => {
            setLayerSoundRowCount(prev => prev + 1);
            if (Platform.OS !== "web") Haptics.selectionAsync();
          }}
        >
          <Ionicons name="add" size={16} color={C.textSecondary} />
          <Text style={{ fontSize: 12, color: C.textSecondary }}>Layer {layerSoundRowCount + 1}</Text>
        </Pressable>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="timer-outline" size={18} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "audioOffset")}</Text>
          <Text style={[styles.sectionValue, { color: C.accent }]}>
            {audioOffsetMs > 0 ? "+" : ""}{audioOffsetMs}ms
          </Text>
        </View>
        <View style={styles.offsetRow}>
          <Pressable
            style={styles.offsetBtn}
            onPress={() => {
              const next = Math.max(-100, audioOffsetMs - 5);
              onAudioOffsetChange(next);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <Ionicons name="remove" size={18} color={C.text} />
          </Pressable>
          <Pressable
            style={styles.offsetBtn}
            onPress={() => {
              const next = Math.max(-100, audioOffsetMs - 1);
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
              const next = Math.min(100, audioOffsetMs + 1);
              onAudioOffsetChange(next);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <Text style={styles.offsetBtnText}>+1</Text>
          </Pressable>
          <Pressable
            style={styles.offsetBtn}
            onPress={() => {
              const next = Math.min(100, audioOffsetMs + 5);
              onAudioOffsetChange(next);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
          >
            <Ionicons name="add" size={18} color={C.text} />
          </Pressable>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>
          {t("settings", "audioOffsetHint")}
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="stop-circle-outline" size={18} color={C.accent} />
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
          <Ionicons name="play-circle-outline" size={18} color={C.accent} />
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

      {Platform.OS === "android" && (
        <>
          <View style={[styles.divider, { backgroundColor: C.border }]} />
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="mic-outline" size={18} color={C.accent} />
              <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "micMethod")}</Text>
            </View>
            <View style={styles.tripleRow}>
              {([
                { value: "native" as const, label: t("settings", "micMethodNative") },
                { value: "webview" as const, label: t("settings", "micMethodWebView") },
              ]).map((opt) => {
                const active = micMethod === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.tripleBtn, active && [styles.tripleBtnActive, { borderColor: C.accent, backgroundColor: C.accentDim }]]}
                    onPress={() => {
                      onMicMethodChange(opt.value);
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
              {t("settings", "micMethodHint")}
            </Text>
          </View>
        </>
      )}
    </>
  );

  const renderProfileTab = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="person-outline" size={18} color={C.accent} />
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
          <Ionicons name="location" size={18} color={C.accent} />
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
                <Ionicons name="location-outline" size={14} color={C.accent} />
                <Text style={styles.roomName} numberOfLines={1}>{room.name}</Text>
              </View>
              <View style={styles.roomActions}>
                {!isTracking && !roomTrackingActive && (
                  <Pressable
                    style={[styles.roomStartBtn, { backgroundColor: C.accentDim }]}
                    onPress={() => onStartRoomTracking({ id: room.id, name: room.name })}
                  >
                    <Ionicons name="play" size={12} color={C.accent} />
                  </Pressable>
                )}
                <Pressable onPress={() => handleDeleteRoom(room.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={14} color={C.textTertiary} />
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
                  <Ionicons name="checkmark" size={16} color={C.surface} />
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={[styles.addRoomBtn, { borderColor: C.accentDim }]}
            onPress={() => setShowAddRoom(true)}
          >
            <Ionicons name="add" size={16} color={C.accent} />
            <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "addRoom")}</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="cloud-download-outline" size={18} color={C.accent} />
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
            <Ionicons name="download-outline" size={15} color={C.accent} />
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
                        Alert.alert(t("settings", "error"), t("settings", "restoreFail"));
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Ionicons name="push-outline" size={15} color={C.accent} />
            <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "restoreBackup")}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {onResetApp && !showResetConfirm && (
        <Pressable
          style={styles.resetButton}
          onPress={() => setShowResetConfirm(true)}
        >
          <Ionicons name="refresh-circle-outline" size={18} color="#F85149" />
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
    </>
  );

  const TAB_ITEMS: { key: SettingsTab; icon: string; label: string }[] = [
    { key: "theme", icon: "color-palette-outline", label: t("settings", "themeTab") },
    { key: "sound", icon: "musical-notes-outline", label: t("settings", "soundTab") },
    { key: "profile", icon: "person-circle-outline", label: t("settings", "profileTab") },
  ];

  const switchTab = useCallback((tab: SettingsTab) => {
    if (activeTab === tab) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const tabs: SettingsTab[] = ["theme", "sound", "profile"];
    const currentIdx = tabs.indexOf(activeTab);
    const nextIdx = tabs.indexOf(tab);
    const slideDir = nextIdx > currentIdx ? 1 : -1;
    Animated.parallel([
      Animated.timing(tabFadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(tabSlideAnim, { toValue: slideDir * 30, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      setActiveTab(tab);
      tabSlideAnim.setValue(-slideDir * 30);
      Animated.parallel([
        Animated.timing(tabFadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(tabSlideAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    });
  }, [activeTab, tabFadeAnim, tabSlideAnim]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "theme": return renderThemeTab();
      case "sound": return renderSoundTab();
      case "profile": return renderProfileTab();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <ScrollView
          style={{ marginTop: (insets.top || webTopInset) + 50 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          onStartShouldSetResponder={() => true}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: C.text }]}>{t("settings", "title")}</Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                testID="settings-close"
              >
                <Ionicons name="close" size={22} color={C.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.tabBar}>
              {TAB_ITEMS.map((tab) => (
                <Pressable
                  key={tab.key}
                  style={[styles.tabBtn, activeTab === tab.key && [styles.tabBtnActive, { borderColor: C.accent }]]}
                  onPress={() => switchTab(tab.key)}
                >
                  <Ionicons
                    name={tab.icon as any}
                    size={16}
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
          </Pressable>
        </ScrollView>
      </Pressable>

      <Modal
        visible={showLoggingInfo}
        animationType="fade"
        transparent
        onRequestClose={() => setShowLoggingInfo(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.overlay} onPress={() => setShowLoggingInfo(false)}>
          <View style={styles.loggingInfoContainer}>
            <Pressable style={[styles.loggingInfoSheet, { backgroundColor: C.surface, borderColor: C.border }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.loggingInfoHeader}>
                <Ionicons name="analytics-outline" size={28} color={C.accent} />
                <Text style={[styles.loggingInfoTitle, { color: C.text }]}>{t("loggingInfo", "title")}</Text>
              </View>
              <Text style={[styles.loggingInfoSubtitle, { color: C.textSecondary }]}>{t("loggingInfo", "subtitle")}</Text>

              <View style={[styles.loggingInfoCard, { backgroundColor: C.surfaceLight }]}>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="time-outline" size={16} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row1")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="musical-notes-outline" size={16} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row2")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="location-outline" size={16} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row3")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="bar-chart-outline" size={16} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row4")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="trophy-outline" size={16} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row5")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="share-social-outline" size={16} color={C.accent} />
                  <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", "row6")}</Text>
                </View>
              </View>

              <View style={styles.loggingInfoFooter}>
                <Ionicons name="shield-checkmark-outline" size={14} color={C.textTertiary} />
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
      </Modal>
    </Modal>
  );
}

const make_styles = (C: typeof Colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  sheet: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: C.text,
    letterSpacing: 0.5,
  },
  usernameSection: {
    gap: 10,
  },
  usernameInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.text,
    backgroundColor: C.surfaceLight,
  },
  tabBar: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surfaceLight,
  },
  tabBtnActive: {
    backgroundColor: C.accentDim,
  },
  tabBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: C.textSecondary,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.text,
    flex: 1,
  },
  sectionValue: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: C.accent,
    minWidth: 40,
    textAlign: "right" as const,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 16,
  },
  sliderContainer: {
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  sliderTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: C.surfaceLight,
    overflow: "hidden",
  },
  sliderFill: {
    height: "100%",
    backgroundColor: C.accent,
    borderRadius: 5,
  },
  sliderThumb: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.accent,
    marginLeft: -5,
    top: 11,
    borderWidth: 2,
    borderColor: C.surface,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
      },
    }),
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  sliderLabelText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: C.textTertiary,
    letterSpacing: 0.5,
  },
  soundSetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  soundSetBtn: {
    flex: 1,
    minWidth: "45%" as any,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceLight,
  },
  soundSetBtnActive: {
    borderColor: C.accent,
    backgroundColor: C.accentDim,
  },
  soundSetLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: C.textSecondary,
  },
  soundSetLabelActive: {
    color: C.accent,
  },
  tripleRow: {
    flexDirection: "row",
    gap: 8,
  },
  tripleBtn: {
    flex: 1,
    alignItems: "center" as const,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceLight,
  },
  tripleBtnActive: {
    borderColor: C.accent,
    backgroundColor: C.accentDim,
  },
  tripleBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: C.textSecondary,
  },
  tripleBtnTextActive: {
    color: C.accent,
  },
  toggleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceLight,
  },
  toggleLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.textSecondary,
  },
  offsetRow: {
    flexDirection: "row",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  offsetBtn: {
    width: 44,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceLight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  offsetBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: C.text,
  },
  offsetResetBtn: {
    borderColor: C.accentMuted,
    backgroundColor: C.accentDim,
    width: 52,
  },
  offsetResetText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: C.accent,
  },
  offsetHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: C.textTertiary,
    textAlign: "center" as const,
    letterSpacing: 0.5,
  },
  themeScroll: {
    flexDirection: "row-reverse",
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  themeChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  customChip: {
    borderStyle: "dashed" as any,
  },
  themeDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  themeCheck: {
    position: "absolute",
  },
  customPickerContainer: {
    marginTop: 14,
    gap: 12,
  },
  hueTrackWrapper: {
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  hueTrack: {
    height: 14,
    borderRadius: 7,
  },
  hueThumb: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    left: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0 2px 6px rgba(0,0,0,0.4)" },
    }),
  },
  hexRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  hexPreview: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  hexInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.text,
    backgroundColor: C.surfaceLight,
  },
  hubImageCard: {
    marginTop: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  hubImageTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  hubImageThumb: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  hubImageChips: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  beatTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  beatTypeChipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: C.text,
  },
  hubImageRemove: {
    padding: 2,
  },
  addHubImageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed" as any,
    backgroundColor: C.surface,
  },
  addHubImageText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: C.text,
  },
  trackingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.success,
  },
  trackingText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: C.text,
    flex: 1,
  },
  trackingStopBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  trackingStopText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
    color: "#fff",
  },
  addRoomForm: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderStyle: "dashed" as any,
  },
  addRoomHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: C.textSecondary,
  },
  addRoomRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  addRoomSaveBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addRoomBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    borderStyle: "dashed" as any,
    marginTop: 4,
  },
  addRoomBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: C.text,
  },
  roomEmptyHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: C.textTertiary,
    textAlign: "center",
    paddingVertical: 8,
  },
  roomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  roomInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  roomName: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: C.text,
    flex: 1,
  },
  roomActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  roomStartBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248, 81, 73, 0.3)",
    backgroundColor: "rgba(248, 81, 73, 0.08)",
  },
  resetButtonText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: "#F85149",
  },
  resetConfirmBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248, 81, 73, 0.3)",
    backgroundColor: "rgba(248, 81, 73, 0.06)",
    padding: 16,
    gap: 14,
    alignItems: "center",
  },
  resetConfirmText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  resetConfirmButtons: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  resetCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceLight,
  },
  resetCancelText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: C.textSecondary,
  },
  resetConfirmBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F85149",
  },
  resetConfirmBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  loggingInfoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  loggingInfoSheet: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    width: "100%",
    maxWidth: 480,
  },
  loggingInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  loggingInfoTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: C.text,
  },
  loggingInfoSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: 16,
  },
  loggingInfoCard: {
    backgroundColor: C.surfaceLight,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  loggingInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loggingInfoText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: C.text,
    flex: 1,
  },
  loggingInfoFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
    marginBottom: 16,
  },
  loggingInfoFooterText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: C.textTertiary,
  },
  loggingInfoCloseBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  loggingInfoCloseBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: C.white,
  },
  soundSetAddBtn: {
    borderStyle: "dashed" as any,
    borderColor: C.border,
  },
});

const make_csStyles = (C: typeof Colors) => StyleSheet.create({
  editorContainer: {
    marginTop: 12,
    backgroundColor: C.surfaceLight,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editorTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: C.text,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fieldLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: C.textSecondary,
    width: 60,
  },
  nameInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: C.text,
    backgroundColor: C.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  sampleSection: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 10,
  },
  sampleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sampleTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
    color: C.text,
  },
  previewBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: C.textTertiary,
    width: 44,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    flex: 1,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  chipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
    color: C.textSecondary,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  durationControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  durationBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  durationValue: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: C.text,
    minWidth: 36,
    textAlign: "center",
  },
  customSampleInfo: {
    gap: 4,
  },
  customSampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  customSampleName: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: C.text,
    flex: 1,
  },
  removeSampleBtn: {
    padding: 2,
  },
  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 4,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: "#F85149",
  },
  recordImportRow: {
    flexDirection: "row",
    gap: 8,
  },
  recordActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
  },
  recordActionText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
    color: "#fff",
  },
  editorActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(248, 81, 73, 0.3)",
    backgroundColor: "rgba(248, 81, 73, 0.08)",
  },
  deleteBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
    color: "#F85149",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
    color: C.white,
  },
});

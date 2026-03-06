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
import Colors, { ACCENT_PRESETS, accentFromHex, type ThemeColor } from "@/constants/colors";
import { useTheme, type BeatTypeKey } from "@/contexts/ThemeContext";
import type { FlashMode, HapticMode, SoundSet, BuiltinSoundSet, SoundRole, CustomSoundSetConfig } from "@/lib/storage";
import { loadCustomSoundSets, saveCustomSoundSets, BUILTIN_SOUND_SETS } from "@/lib/storage";
import { soundSets } from "@/lib/metronome-engine";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/lib/i18n";
import {
  loadPracticeRooms,
  addPracticeRoom,
  deletePracticeRoom,
  requestLocationPermission,
  type PracticeRoom,
} from "@/lib/practice-room";

const PRESET_COLORS: { value: Exclude<ThemeColor, "custom">; label: string; color: string }[] = [
  { value: "gold", label: "Gold", color: ACCENT_PRESETS.gold.accent },
  { value: "blue", label: "Blue", color: ACCENT_PRESETS.blue.accent },
  { value: "green", label: "Green", color: ACCENT_PRESETS.green.accent },
  { value: "red", label: "Red", color: ACCENT_PRESETS.red.accent },
  { value: "purple", label: "Purple", color: ACCENT_PRESETS.purple.accent },
  { value: "cyan", label: "Cyan", color: ACCENT_PRESETS.cyan.accent },
  { value: "orange", label: "Orange", color: ACCENT_PRESETS.orange.accent },
  { value: "pink", label: "Pink", color: ACCENT_PRESETS.pink.accent },
  { value: "rose", label: "Rose", color: ACCENT_PRESETS.rose.accent },
  { value: "neon", label: "Neon", color: ACCENT_PRESETS.neon.accent },
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
}: SettingsModalProps) {
  const { themeColor, customHex, setThemeColor, setCustomHex, colors: C, hubImages, addHubImage, removeHubImage, updateHubImageBeatTypes } = useTheme();
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
  const [editingCustomSlot, setEditingCustomSlot] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [customStrong, setCustomStrong] = useState<{ sourceSet: BuiltinSoundSet; sourceRole: SoundRole; duration: number }>({ sourceSet: "classic", sourceRole: "strong", duration: 0.5 });
  const [customAccent, setCustomAccent] = useState<{ sourceSet: BuiltinSoundSet; sourceRole: SoundRole; duration: number }>({ sourceSet: "classic", sourceRole: "high", duration: 0.5 });
  const [customNormal, setCustomNormal] = useState<{ sourceSet: BuiltinSoundSet; sourceRole: SoundRole; duration: number }>({ sourceSet: "classic", sourceRole: "low", duration: 0.5 });

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

  const playSoundPreview = useCallback((set: SoundSet) => {
    const idx = previewIndexRef.current[set] ?? 0;
    const players = previewPlayers[set];
    const player = players[idx];
    try {
      player.seekTo(0);
      player.play();
    } catch {}
    previewIndexRef.current[set] = (idx + 1) % 3;
  }, []);

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
      setCustomStrong(existing.strong);
      setCustomAccent(existing.accent);
      setCustomNormal(existing.normal);
    } else {
      setCustomName(t("customSoundSet", "namePlaceholder"));
      setCustomStrong({ sourceSet: "classic", sourceRole: "strong", duration: 0.5 });
      setCustomAccent({ sourceSet: "classic", sourceRole: "high", duration: 0.5 });
      setCustomNormal({ sourceSet: "classic", sourceRole: "low", duration: 0.5 });
    }
    setEditingCustomSlot(slot);
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

  const renderThemeTab = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="language-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "language")}</Text>
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

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "themeColor")}</Text>
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
                  <Ionicons name="checkmark" size={10} color={Colors.white} style={styles.themeCheck} />
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
                <Ionicons name="checkmark" size={10} color={Colors.white} style={styles.themeCheck} />
              </>
            ) : (
              <Ionicons name="color-wand-outline" size={18} color={Colors.textSecondary} />
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
              <View style={[styles.hueThumb, { backgroundColor: customHex, borderColor: Colors.white }]} />
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
                placeholderTextColor={Colors.textTertiary}
                maxLength={7}
                autoCapitalize="characters"
              />
            </View>
          </View>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="image-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "hubImages")}</Text>
        </View>
        <Text style={styles.offsetHint}>
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
                            : { backgroundColor: Colors.surface, borderColor: Colors.border },
                        ]}
                      >
                        <Ionicons name={bt.icon} size={12} color={active ? C.accent : Colors.textTertiary} />
                        <Text style={[styles.beatTypeChipText, { color: active ? C.accent : Colors.textTertiary }]}>
                          {bt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable onPress={() => removeHubImage(img.id)} style={styles.hubImageRemove}>
                  <Ionicons name="close-circle" size={22} color={Colors.danger} />
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

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="flash-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "screenFlash")}</Text>
        </View>
        <TripleSelector value={flashMode} onChange={onFlashModeChange} accentColor={C.accent} accentDimColor={C.accentDim} options={TRIPLE_OPTS} />
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="phone-portrait-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "hapticFeedback")}</Text>
        </View>
        <TripleSelector value={hapticMode} onChange={onHapticModeChange} accentColor={C.accent} accentDimColor={C.accentDim} options={TRIPLE_OPTS} />
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="chart-line" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "activityLogging")}</Text>
          <Pressable onPress={() => setShowLoggingInfo(true)} hitSlop={8}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.textTertiary} />
          </Pressable>
          <Switch
            value={loggingEnabled}
            onValueChange={(val) => {
              if (val && !loggingEnabled) {
                setShowLoggingInfo(true);
              }
              onLoggingEnabledChange(val);
            }}
            trackColor={{ false: Colors.surfaceLight, true: C.accentMuted }}
            thumbColor={loggingEnabled ? C.accent : Colors.textSecondary}
            style={{ transform: [{ scale: 0.85 }] }}
          />
        </View>
        <Text style={styles.offsetHint}>
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
          <Text style={styles.sectionLabel}>{t("settings", "volume")}</Text>
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

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name={sampleVolumeIcon as any} size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "sampleVolume")}</Text>
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

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="music-note-eighth" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "soundSet")}</Text>
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
                  color={active ? C.accent : Colors.textSecondary}
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
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
                onLongPress={() => openCustomEditor(slot)}
              >
                <MaterialCommunityIcons
                  name="tune-variant"
                  size={20}
                  color={active ? C.accent : Colors.textSecondary}
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
              <Ionicons name="add" size={20} color={Colors.textSecondary} />
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
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <View style={csStyles.nameRow}>
              <Text style={csStyles.fieldLabel}>{t("customSoundSet", "name")}</Text>
              <TextInput
                style={csStyles.nameInput}
                value={customName}
                onChangeText={setCustomName}
                placeholder={t("customSoundSet", "namePlaceholder")}
                placeholderTextColor={Colors.textTertiary}
                maxLength={12}
              />
            </View>

            {([
              { label: t("customSoundSet", "strongSample"), state: customStrong, setter: setCustomStrong },
              { label: t("customSoundSet", "accentSample"), state: customAccent, setter: setCustomAccent },
              { label: t("customSoundSet", "normalSample"), state: customNormal, setter: setCustomNormal },
            ] as const).map((item, idx) => (
              <View key={idx} style={csStyles.sampleSection}>
                <View style={csStyles.sampleHeader}>
                  <Text style={csStyles.sampleTitle}>{item.label}</Text>
                  <Pressable
                    onPress={() => previewCustomSample(item.state.sourceSet, item.state.sourceRole)}
                    style={csStyles.previewBtn}
                  >
                    <Ionicons name="play" size={14} color={C.accent} />
                  </Pressable>
                </View>

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
                            item.setter({ ...item.state, sourceSet: bs });
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
                            item.setter({ ...item.state, sourceRole: ro.value });
                            previewCustomSample(item.state.sourceSet, ro.value);
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
                      <Ionicons name="remove" size={14} color={Colors.text} />
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
                      <Ionicons name="add" size={14} color={Colors.text} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}

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
                <Ionicons name="checkmark" size={16} color={Colors.background} />
                <Text style={csStyles.saveBtnText}>{t("customSoundSet", "save")}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="timer-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "audioOffset")}</Text>
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
            <Ionicons name="remove" size={18} color={Colors.text} />
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
            <Ionicons name="add" size={18} color={Colors.text} />
          </Pressable>
        </View>
        <Text style={styles.offsetHint}>
          {t("settings", "audioOffsetHint")}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="stop-circle-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "timerStop")}</Text>
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
        <Text style={styles.offsetHint}>
          {timerStopMode === "end-of-cycle"
            ? t("settings", "timerStopHintEndCycle")
            : t("settings", "timerStopHintImmediate")}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="play-circle-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "backgroundPlay")}</Text>
          <Switch
            value={backgroundPlay}
            onValueChange={onBackgroundPlayChange}
            trackColor={{ false: Colors.surfaceLight, true: C.accentMuted }}
            thumbColor={backgroundPlay ? C.accent : Colors.textSecondary}
            style={{ transform: [{ scale: 0.85 }] }}
          />
        </View>
      </View>
    </>
  );

  const renderProfileTab = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="person-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "nickname")}</Text>
        </View>
        <TextInput
          style={[styles.usernameInput, { borderColor: C.accentMuted }]}
          value={localUsername}
          onChangeText={setLocalUsername}
          onBlur={() => onUsernameChange(localUsername)}
          onSubmitEditing={() => onUsernameChange(localUsername)}
          placeholder={t("settings", "nicknamePlaceholder")}
          placeholderTextColor={Colors.textTertiary}
          maxLength={30}
          testID="settings-username"
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="location" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>{t("settings", "practiceRoom")}</Text>
        </View>

        {roomTrackingActive && trackingRoomName && (
          <View style={[styles.trackingBanner, { borderColor: Colors.success }]}>
            <View style={styles.trackingDot} />
            <Text style={[styles.trackingText, { color: Colors.success }]}>
              {trackingRoomName}{t("settings", "trackingAt")}
            </Text>
            <Pressable style={[styles.trackingStopBtn, { backgroundColor: Colors.danger }]} onPress={onStopRoomTracking}>
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
                  <Ionicons name="trash-outline" size={14} color={Colors.textTertiary} />
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
                placeholderTextColor={Colors.textTertiary}
                maxLength={30}
              />
              <Pressable style={[styles.addRoomSaveBtn, { backgroundColor: C.accent }]} onPress={handleAddRoom} disabled={addingRoom}>
                {addingRoom ? (
                  <ActivityIndicator size="small" color={Colors.surface} />
                ) : (
                  <Ionicons name="checkmark" size={16} color={Colors.surface} />
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

      <View style={styles.divider} />

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
            style={styles.sheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.header}>
              <Text style={styles.title}>{t("settings", "title")}</Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                testID="settings-close"
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
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
                    color={activeTab === tab.key ? C.accent : Colors.textSecondary}
                  />
                  <Text style={[styles.tabBtnText, activeTab === tab.key && { color: C.accent }]}>{tab.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.divider} />

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
            <Pressable style={styles.loggingInfoSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.loggingInfoHeader}>
                <Ionicons name="analytics-outline" size={28} color={C.accent} />
                <Text style={styles.loggingInfoTitle}>{t("loggingInfo", "title")}</Text>
              </View>
              <Text style={styles.loggingInfoSubtitle}>{t("loggingInfo", "subtitle")}</Text>

              <View style={styles.loggingInfoCard}>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="time-outline" size={16} color={C.accent} />
                  <Text style={styles.loggingInfoText}>{t("loggingInfo", "row1")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="musical-notes-outline" size={16} color={C.accent} />
                  <Text style={styles.loggingInfoText}>{t("loggingInfo", "row2")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="location-outline" size={16} color={C.accent} />
                  <Text style={styles.loggingInfoText}>{t("loggingInfo", "row3")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="bar-chart-outline" size={16} color={C.accent} />
                  <Text style={styles.loggingInfoText}>{t("loggingInfo", "row4")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="trophy-outline" size={16} color={C.accent} />
                  <Text style={styles.loggingInfoText}>{t("loggingInfo", "row5")}</Text>
                </View>
                <View style={styles.loggingInfoRow}>
                  <Ionicons name="share-social-outline" size={16} color={C.accent} />
                  <Text style={styles.loggingInfoText}>{t("loggingInfo", "row6")}</Text>
                </View>
              </View>

              <View style={styles.loggingInfoFooter}>
                <Ionicons name="shield-checkmark-outline" size={14} color={Colors.textTertiary} />
                <Text style={styles.loggingInfoFooterText}>{t("loggingInfo", "footer")}</Text>
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
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
    color: Colors.text,
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
    color: Colors.text,
    backgroundColor: Colors.surfaceLight,
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
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  tabBtnActive: {
    backgroundColor: Colors.accentDim,
  },
  tabBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
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
    color: Colors.text,
    flex: 1,
  },
  sectionValue: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.accent,
    minWidth: 40,
    textAlign: "right" as const,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
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
    backgroundColor: Colors.surfaceLight,
    overflow: "hidden",
  },
  sliderFill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 5,
  },
  sliderThumb: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.accent,
    marginLeft: -5,
    top: 11,
    borderWidth: 2,
    borderColor: Colors.surface,
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
    color: Colors.textTertiary,
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
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  soundSetBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentDim,
  },
  soundSetLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  soundSetLabelActive: {
    color: Colors.accent,
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
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  tripleBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentDim,
  },
  tripleBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  tripleBtnTextActive: {
    color: Colors.accent,
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
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  offsetBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  offsetResetBtn: {
    borderColor: Colors.accentMuted,
    backgroundColor: Colors.accentDim,
    width: 52,
  },
  offsetResetText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.accent,
  },
  offsetHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textTertiary,
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
    borderColor: Colors.border,
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
    borderColor: Colors.border,
  },
  hexInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.surfaceLight,
  },
  hubImageCard: {
    marginTop: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.surface,
  },
  addHubImageText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
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
    backgroundColor: Colors.success,
  },
  trackingText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
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
    color: Colors.textSecondary,
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
  },
  roomEmptyHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
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
    color: Colors.text,
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
    color: Colors.textSecondary,
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
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  resetCancelText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    width: "100%",
    maxWidth: 360,
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
    color: Colors.text,
  },
  loggingInfoSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  loggingInfoCard: {
    backgroundColor: Colors.surfaceLight,
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
    color: Colors.text,
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
    color: Colors.textTertiary,
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
    color: Colors.background,
  },
  soundSetAddBtn: {
    borderStyle: "dashed" as any,
    borderColor: Colors.border,
  },
});

const csStyles = StyleSheet.create({
  editorContainer: {
    marginTop: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editorTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fieldLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
    width: 60,
  },
  nameInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.text,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sampleSection: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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
    color: Colors.text,
  },
  previewBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: Colors.textTertiary,
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
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  durationValue: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    minWidth: 36,
    textAlign: "center",
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
    color: Colors.background,
  },
});

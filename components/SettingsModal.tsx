import React, { useRef, useCallback, useState } from "react";
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useAudioPlayer } from "expo-audio";
import Colors, { ACCENT_PRESETS, accentFromHex, type ThemeColor } from "@/constants/colors";
import { useTheme, type BeatTypeKey } from "@/contexts/ThemeContext";
import type { FlashMode, HapticMode, SoundSet } from "@/lib/storage";
import { soundSets } from "@/lib/metronome-engine";

const PRESET_COLORS: { value: Exclude<ThemeColor, "custom">; label: string; color: string }[] = [
  { value: "gold", label: "Gold", color: ACCENT_PRESETS.gold.accent },
  { value: "blue", label: "Blue", color: ACCENT_PRESETS.blue.accent },
  { value: "green", label: "Green", color: ACCENT_PRESETS.green.accent },
  { value: "red", label: "Red", color: ACCENT_PRESETS.red.accent },
  { value: "purple", label: "Purple", color: ACCENT_PRESETS.purple.accent },
  { value: "cyan", label: "Cyan", color: ACCENT_PRESETS.cyan.accent },
  { value: "orange", label: "Orange", color: ACCENT_PRESETS.orange.accent },
  { value: "pink", label: "Pink", color: ACCENT_PRESETS.pink.accent },
];

const HUE_COLORS = [
  "#FF0000", "#FF8000", "#FFFF00", "#80FF00",
  "#00FF00", "#00FF80", "#00FFFF", "#0080FF",
  "#0000FF", "#8000FF", "#FF00FF", "#FF0080", "#FF0000",
];

type SettingsTab = "theme" | "sound";

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
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
}

const SOUND_SET_OPTIONS: { value: SoundSet; label: string; icon: string }[] = [
  { value: "classic", label: "Classic", icon: "music-note" },
  { value: "woodblock", label: "Woodblock", icon: "music-box" },
  { value: "digital", label: "Digital", icon: "sine-wave" },
  { value: "rimshot", label: "Rimshot", icon: "music-circle-outline" },
];

const TRIPLE_OPTIONS: { value: "all" | "accent" | "off"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "accent", label: "Accent" },
  { value: "off", label: "Off" },
];

function TripleSelector({
  value,
  onChange,
  accentColor,
  accentDimColor,
}: {
  value: "all" | "accent" | "off";
  onChange: (v: "all" | "accent" | "off") => void;
  accentColor: string;
  accentDimColor: string;
}) {
  return (
    <View style={styles.tripleRow}>
      {TRIPLE_OPTIONS.map((opt) => {
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
}: SettingsModalProps) {
  const { themeColor, customHex, setThemeColor, setCustomHex, colors: C, hubImages, addHubImage, removeHubImage, updateHubImageBeatType } = useTheme();
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

  React.useEffect(() => {
    if (visible) {
      setLocalUsername(username);
    }
  }, [visible, username]);

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

  const renderThemeTab = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>Theme Color</Text>
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
          <Text style={styles.sectionLabel}>Center Hub Images</Text>
        </View>
        <Text style={styles.offsetHint}>
          Add photos and assign them to beat types
        </Text>

        {hubImages.map((img) => {
          const beatTypeOptions: { key: BeatTypeKey; label: string; icon: any }[] = [
            { key: "normal", label: "Normal", icon: "ellipse-outline" },
            { key: "accent", label: "Accent", icon: "chevron-up-outline" },
            { key: "strong", label: "Strong", icon: "chevron-up" },
          ];
          return (
            <View key={img.id} style={styles.hubImageCard}>
              <View style={styles.hubImageTop}>
                <Image source={{ uri: img.uri }} style={styles.hubImageThumb} />
                <View style={styles.hubImageChips}>
                  {beatTypeOptions.map((bt) => {
                    const active = img.beatType === bt.key;
                    return (
                      <Pressable
                        key={bt.key}
                        onPress={() => {
                          if (!active) updateHubImageBeatType(img.id, bt.key);
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
              Add Image ({hubImages.length}/3)
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="flash-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>Screen Flash</Text>
        </View>
        <TripleSelector value={flashMode} onChange={onFlashModeChange} accentColor={C.accent} accentDimColor={C.accentDim} />
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="phone-portrait-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>Haptic Feedback</Text>
        </View>
        <TripleSelector value={hapticMode} onChange={onHapticModeChange} accentColor={C.accent} accentDimColor={C.accentDim} />
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="chart-line" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>Activity Logging</Text>
          <Switch
            value={loggingEnabled}
            onValueChange={onLoggingEnabledChange}
            trackColor={{ false: Colors.surfaceLight, true: C.accentMuted }}
            thumbColor={loggingEnabled ? C.accent : Colors.textSecondary}
            style={{ transform: [{ scale: 0.85 }] }}
          />
        </View>
        <Text style={styles.offsetHint}>
          Track practice sessions and feature usage
        </Text>
      </View>
    </>
  );

  const renderSoundTab = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name={volumeIcon as any} size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>Volume</Text>
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
          <MaterialCommunityIcons name="music-note-eighth" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>Sound Set</Text>
        </View>
        <View style={styles.soundSetGrid}>
          {SOUND_SET_OPTIONS.map((opt) => {
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
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="timer-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>Audio Offset</Text>
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
          - = audio earlier / + = audio later
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="stop-circle-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>Timer Stop</Text>
        </View>
        <View style={styles.tripleRow}>
          {([
            { value: "end-of-cycle" as const, label: "End of Cycle" },
            { value: "immediate" as const, label: "Immediate" },
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
            ? "Stops after current measure ends"
            : "Stops immediately when timer expires"}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="play-circle-outline" size={18} color={C.accent} />
          <Text style={styles.sectionLabel}>Background Play</Text>
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
              <Text style={styles.title}>Settings</Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                testID="settings-close"
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.usernameSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person-outline" size={18} color={C.accent} />
                <Text style={styles.sectionLabel}>Username</Text>
              </View>
              <TextInput
                style={[styles.usernameInput, { borderColor: C.accentMuted }]}
                value={localUsername}
                onChangeText={setLocalUsername}
                onBlur={() => onUsernameChange(localUsername)}
                onSubmitEditing={() => onUsernameChange(localUsername)}
                placeholder="Enter your name"
                placeholderTextColor={Colors.textTertiary}
                maxLength={30}
                testID="settings-username"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tabBtn, activeTab === "theme" && [styles.tabBtnActive, { borderColor: C.accent }]]}
                onPress={() => {
                  setActiveTab("theme");
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
              >
                <Ionicons
                  name="color-palette-outline"
                  size={16}
                  color={activeTab === "theme" ? C.accent : Colors.textSecondary}
                />
                <Text style={[styles.tabBtnText, activeTab === "theme" && { color: C.accent }]}>Theme</Text>
              </Pressable>
              <Pressable
                style={[styles.tabBtn, activeTab === "sound" && [styles.tabBtnActive, { borderColor: C.accent }]]}
                onPress={() => {
                  setActiveTab("sound");
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
              >
                <Ionicons
                  name="musical-notes-outline"
                  size={16}
                  color={activeTab === "sound" ? C.accent : Colors.textSecondary}
                />
                <Text style={[styles.tabBtnText, activeTab === "sound" && { color: C.accent }]}>Sound</Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            {activeTab === "theme" ? renderThemeTab() : renderSoundTab()}
          </Pressable>
        </ScrollView>
      </Pressable>
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
    paddingBottom: 40,
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
});

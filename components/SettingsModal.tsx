import React, { useRef, useCallback } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import type { FlashMode, HapticMode, SoundSet } from "@/lib/storage";

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
}

const SOUND_SET_OPTIONS: { value: SoundSet; label: string; icon: string }[] = [
  { value: "classic", label: "Classic", icon: "music-note" },
  { value: "woodblock", label: "Woodblock", icon: "music-box" },
  { value: "digital", label: "Digital", icon: "sine-wave" },
  { value: "rimshot", label: "Rimshot", icon: "drum-machine" },
];

const TRIPLE_OPTIONS: { value: "all" | "accent" | "off"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "accent", label: "Accent" },
  { value: "off", label: "Off" },
];

function TripleSelector({
  value,
  onChange,
}: {
  value: "all" | "accent" | "off";
  onChange: (v: "all" | "accent" | "off") => void;
}) {
  return (
    <View style={styles.tripleRow}>
      {TRIPLE_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.tripleBtn, active && styles.tripleBtnActive]}
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
                active && styles.tripleBtnTextActive,
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
}: SettingsModalProps) {
  const insets = useSafeAreaInsets();
  const trackWidthRef = useRef(0);
  const trackLeftRef = useRef(0);
  const lastHapticRef = useRef(volume);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
  }, []);

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
      onVolumeChange(rounded);
    },
    [onVolumeChange]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (trackRef.current) {
          (trackRef.current as any).measureInWindow?.((x: number) => {
            trackLeftRef.current = x + 8;
            updateVolumeFromX(e.nativeEvent.pageX);
          });
        } else {
          updateVolumeFromX(e.nativeEvent.pageX);
        }
      },
      onPanResponderMove: (e) => {
        updateVolumeFromX(e.nativeEvent.pageX);
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

  const volumeIcon =
    volume === 0
      ? "volume-off"
      : volume < 0.3
        ? "volume-low"
        : volume < 0.7
          ? "volume-medium"
          : "volume-high";

  const pct = Math.round(volume * 100);

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
        >
          <View
            style={styles.sheet}
            onStartShouldSetResponder={() => true}
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

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name={volumeIcon as any} size={18} color={Colors.accent} />
                <Text style={styles.sectionLabel}>Volume</Text>
                <Text style={styles.sectionValue}>{pct}%</Text>
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
                      { width: `${volume * 100}%` as any },
                    ]}
                  />
                </View>
                <View
                  style={[
                    styles.sliderThumb,
                    { left: `${volume * 100}%` as any },
                  ]}
                />
              </View>
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabelText}>0</Text>
                <Text style={styles.sliderLabelText}>100</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="play-circle-outline" size={18} color={Colors.accent} />
                <Text style={styles.sectionLabel}>Background Play</Text>
                <Switch
                  value={backgroundPlay}
                  onValueChange={onBackgroundPlayChange}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.accentMuted }}
                  thumbColor={backgroundPlay ? Colors.accent : Colors.textSecondary}
                  style={{ transform: [{ scale: 0.85 }] }}
                />
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="music-note-eighth" size={18} color={Colors.accent} />
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
                        active && styles.soundSetBtnActive,
                      ]}
                      onPress={() => {
                        onSoundSetChange(opt.value);
                        if (Platform.OS !== "web") {
                          Haptics.selectionAsync();
                        }
                      }}
                    >
                      <MaterialCommunityIcons
                        name={opt.icon as any}
                        size={20}
                        color={active ? Colors.accent : Colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.soundSetLabel,
                          active && styles.soundSetLabelActive,
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
                <Ionicons name="flash-outline" size={18} color={Colors.accent} />
                <Text style={styles.sectionLabel}>Screen Flash</Text>
              </View>
              <TripleSelector value={flashMode} onChange={onFlashModeChange} />
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="phone-portrait-outline" size={18} color={Colors.accent} />
                <Text style={styles.sectionLabel}>Haptic Feedback</Text>
              </View>
              <TripleSelector value={hapticMode} onChange={onHapticModeChange} />
            </View>
          </View>
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
    marginBottom: 24,
  },
  title: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 0.5,
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
    height: 40,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceLight,
    overflow: "hidden",
  },
  sliderFill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  sliderThumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    marginLeft: -2,
    top: 10,
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
});

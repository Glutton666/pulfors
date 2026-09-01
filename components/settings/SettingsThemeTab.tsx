import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  ScrollView,
  Switch,
  TextInput,
  Image,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useScale } from "@/lib/scale";
import { Radius, FontSize, Spacing } from "@/constants/tokens";
import { PRESET_COLORS, HUE_COLORS } from "@/constants/color-presets";
import { useTheme, type BeatTypeKey } from "@/contexts/ThemeContext";
import { onAccentColor } from "@/lib/color-contrast";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGE_OPTIONS } from "@/lib/i18n";
import type { FlashMode, HapticMode } from "@/lib/storage";
import type { SampleChannel } from "@/lib/stereo-channel";
import type { BarRandomConfig } from "@/lib/bar-random-session";
import { make_styles } from "@/components/SettingsModal.styles";
import { getTripleOptions, TripleSelector } from "@/components/SettingsModal.helpers";
import { HelpIcon } from "@/components/HelpIcon";
import { AnimatedModal } from "@/components/AnimatedModal";

interface SettingsThemeTabProps {
  loggingEnabled: boolean;
  onLoggingEnabledChange: (val: boolean) => void;
  landscapeReversed: boolean;
  onLandscapeReversedChange: (val: boolean) => void;
  showLandscapeImage: boolean;
  onShowLandscapeImageChange: (val: boolean) => void;
  beatDirection: "cw" | "ccw";
  onBeatDirectionChange: (val: "cw" | "ccw") => void;
  barMetronomeChannel: SampleChannel;
  onBarMetronomeChannelChange: (val: SampleChannel) => void;
  barCellOpacity: number;
  onBarCellOpacityChange: (val: number) => void;
  barRowHeight: number;
  onBarRowHeightChange: (val: number) => void;
  randomBarConfig: BarRandomConfig;
  onRandomBarConfigChange: (config: BarRandomConfig) => void;
  flashMode: FlashMode;
  onFlashModeChange: (value: FlashMode) => void;
  hapticMode: HapticMode;
  onHapticModeChange: (value: HapticMode) => void;
}

export function SettingsThemeTab({
  loggingEnabled,
  onLoggingEnabledChange,
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
  randomBarConfig,
  onRandomBarConfigChange,
  flashMode,
  onFlashModeChange,
  hapticMode,
  onHapticModeChange,
}: SettingsThemeTabProps) {
  const { themeColor, customHex, themeMode, setThemeColor, setCustomHex, setThemeMode, colors: C, hubImages, addHubImage, removeHubImage, updateHubImageBeatTypes } = useTheme();
  const S = useScale();
  const styles = make_styles(C);
  const { language, setLanguage, t } = useLanguage();
  const [showCustomPicker, setShowCustomPicker] = useState(themeColor === "custom");
  const [hexInput, setHexInput] = useState(customHex);
  const [showLoggingInfo, setShowLoggingInfo] = useState(false);

  const hueTrackRef = React.useRef<View>(null);
  const hueTrackWidthRef = React.useRef(0);

  const hueFromPosition = React.useCallback((ratio: number): string => {
    const r = Math.max(0, Math.min(1, ratio));
    const segment = r * (HUE_COLORS.length - 1);
    const idx = Math.floor(segment);
    const t2 = segment - idx;
    const c1 = HUE_COLORS[Math.min(idx, HUE_COLORS.length - 1)];
    const c2 = HUE_COLORS[Math.min(idx + 1, HUE_COLORS.length - 1)];
    const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
    const rr = Math.round(r1 + (r2 - r1) * t2);
    const gg = Math.round(g1 + (g2 - g1) * t2);
    const bb = Math.round(b1 + (b2 - b1) * t2);
    return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`.toUpperCase();
  }, []);

  const updateHueFromX = React.useCallback((pageX: number) => {
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
  }, [hueFromPosition, setCustomHex, setThemeColor]);

  const huePanResponder = React.useRef(
    require("react-native").PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: any) => { updateHueFromX(e.nativeEvent.pageX); },
      onPanResponderMove: (e: any) => { updateHueFromX(e.nativeEvent.pageX); },
      onPanResponderRelease: () => {},
    })
  ).current;

  const handleHueWebMouse = React.useCallback((e: any) => {
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
  }, [hueFromPosition, setCustomHex, setThemeColor]);

  const handleHexSubmit = React.useCallback(() => {
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

  const pickHubImage = React.useCallback(async () => {
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

  const TRIPLE_OPTS = getTripleOptions(t);

  return (
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeScroll}>
          {PRESET_COLORS.map((opt) => {
            const active = themeColor === opt.value;
            return (
              <Pressable
                key={opt.value}
                testID={`theme-${opt.value}`}
                onPress={() => {
                  setThemeColor(opt.value);
                  setShowCustomPicker(false);
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
                style={[styles.themeChip, active && { borderColor: opt.color }]}
              >
                <View style={[styles.themeDot, { backgroundColor: opt.color }]} />
                {active && <Ionicons name="checkmark" size={S.ms(10, 0.4)} color={onAccentColor(opt.color)} style={styles.themeCheck} />}
              </Pressable>
            );
          })}
          <Pressable
            testID="theme-custom"
            onPress={() => {
              setShowCustomPicker(true);
              setThemeColor("custom");
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
            style={[styles.themeChip, styles.customChip, themeColor === "custom" && { borderColor: customHex }]}
          >
            {themeColor === "custom" ? (
              <>
                <View style={[styles.themeDot, { backgroundColor: customHex }]} />
                <Ionicons name="checkmark" size={S.ms(10, 0.4)} color={onAccentColor(customHex)} style={styles.themeCheck} />
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
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "hubImagesHint")}</Text>
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
                            ? img.beatTypes.filter((t2) => t2 !== bt.key)
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
          <Pressable onPress={pickHubImage} style={[styles.addHubImageBtn, { borderColor: C.accent }]}>
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
          style={[styles.toggleRow, { borderColor: landscapeReversed ? C.accent : C.border, backgroundColor: landscapeReversed ? C.accentDim : C.surface }]}
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
          style={[styles.toggleRow, { borderColor: showLandscapeImage ? C.accent : C.border, backgroundColor: showLandscapeImage ? C.accentDim : C.surface }]}
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: Spacing.sm }}>
          <Pressable
            onPress={() => { const v = Math.max(0, Math.round((barCellOpacity - 0.05) * 100) / 100); onBarCellOpacityChange(v); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
            style={{ width: 36, height: 36, borderRadius: Radius.md, backgroundColor: C.backgroundSecondary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: C.text, fontSize: 20, fontFamily: "SpaceGrotesk_600SemiBold" }}>−</Text>
          </Pressable>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: C.overlay06 }}>
            <View style={{ width: `${barCellOpacity * 100}%` as any, height: 4, borderRadius: 2, backgroundColor: C.accent }} />
          </View>
          <Pressable
            onPress={() => { const v = Math.min(1, Math.round((barCellOpacity + 0.05) * 100) / 100); onBarCellOpacityChange(v); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
            style={{ width: 36, height: 36, borderRadius: Radius.md, backgroundColor: C.backgroundSecondary, alignItems: "center", justifyContent: "center" }}
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: Spacing.sm }}>
          <Pressable
            onPress={() => { const v = Math.max(32, barRowHeight - 4); onBarRowHeightChange(v); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
            style={{ width: 36, height: 36, borderRadius: Radius.md, backgroundColor: C.backgroundSecondary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: C.text, fontSize: 20, fontFamily: "SpaceGrotesk_600SemiBold" }}>−</Text>
          </Pressable>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: C.overlay06 }}>
            <View style={{ width: `${((barRowHeight - 32) / 40) * 100}%` as any, height: 4, borderRadius: 2, backgroundColor: C.accent }} />
          </View>
          <Pressable
            onPress={() => { const v = Math.min(72, barRowHeight + 4); onBarRowHeightChange(v); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
            style={{ width: 36, height: 36, borderRadius: Radius.md, backgroundColor: C.backgroundSecondary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: C.text, fontSize: 20, fontFamily: "SpaceGrotesk_600SemiBold" }}>+</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="shuffle-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "barRandomStrategy")}</Text>
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "barRandomStrategyHint")}</Text>
        <View style={styles.tripleRow}>
          {(["independent", "no-consecutive", "shuffle-bag"] as const).map((strategy) => {
            const active = randomBarConfig.strategy === strategy;
            const label = strategy === "independent"
              ? t("barModeView", "randomIndependent")
              : strategy === "no-consecutive"
                ? t("barModeView", "randomNoRepeat")
                : t("barModeView", "randomShuffleBag");
            return (
              <Pressable
                key={strategy}
                style={[styles.tripleBtn, active && [styles.tripleBtnActive, { borderColor: C.accent, backgroundColor: C.accentDim }]]}
                onPress={() => {
                  onRandomBarConfigChange({ ...randomBarConfig, strategy });
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <Text style={[styles.tripleBtnText, active && [styles.tripleBtnTextActive, { color: C.accent }]]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="flash-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "screenFlash")}</Text>
          <HelpIcon title={t("settings", "screenFlash")} message={t("settings", "screenFlashHelp")} />
        </View>
        <TripleSelector value={flashMode as import("@/components/SettingsModal.helpers").TripleValue} onChange={onFlashModeChange as (v: import("@/components/SettingsModal.helpers").TripleValue) => void} accentColor={C.accent} accentDimColor={C.accentDim} options={TRIPLE_OPTS} />
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="phone-portrait-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "hapticFeedback")}</Text>
          <HelpIcon title={t("settings", "hapticFeedback")} message={t("settings", "hapticFeedbackHelp")} />
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
              if (val && !loggingEnabled) setShowLoggingInfo(true);
              onLoggingEnabledChange(val);
            }}
            trackColor={{ false: C.surfaceLight, true: C.accentMuted }}
            thumbColor={loggingEnabled ? C.accent : C.textSecondary}
            style={{ transform: [{ scale: 0.85 }] }}
          />
        </View>
        <Text style={[styles.offsetHint, { color: C.textTertiary }]}>{t("settings", "loggingHint")}</Text>
      </View>

      {/* Logging info sub-modal */}
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
                {(["row1", "row2", "row3", "row4", "row5", "row6"] as const).map((row, i) => (
                  <View key={row} style={styles.loggingInfoRow}>
                    <Ionicons
                      name={(["time-outline", "musical-notes-outline", "location-outline", "bar-chart-outline", "trophy-outline", "share-social-outline"] as const)[i]}
                      size={S.ms(16, 0.4)}
                      color={C.accent}
                    />
                    <Text style={[styles.loggingInfoText, { color: C.textSecondary }]}>{t("loggingInfo", row)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.loggingInfoFooter}>
                <Ionicons name="shield-checkmark-outline" size={S.ms(14, 0.4)} color={C.textTertiary} />
                <Text style={[styles.loggingInfoFooterText, { color: C.textTertiary }]}>{t("loggingInfo", "footer")}</Text>
              </View>
              <Pressable
                style={[styles.loggingInfoCloseBtn, { backgroundColor: C.accent }]}
                onPress={() => setShowLoggingInfo(false)}
              >
                <Text style={[styles.loggingInfoCloseBtnText, { color: onAccentColor(C.accent) }]}>{t("loggingInfo", "close")}</Text>
              </Pressable>
            </Pressable>
          </View>
        </Pressable>
      </AnimatedModal>
    </>
  );
}

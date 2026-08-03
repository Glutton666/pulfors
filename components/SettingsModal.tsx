import React, { useRef, useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  ScrollView,
  Animated,
  useWindowDimensions,
} from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import { make_styles } from "./SettingsModal.styles";
import { useScale } from "@/lib/scale";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { FlashMode, HapticMode, SoundSet, BuiltinSoundSet, SoundRole, CustomSoundSetConfig } from "@/lib/storage";
import { SoundPreviewPlayers, type SoundPreviewHandle } from "./settings/SoundPreviewPlayers";
import { SettingsThemeTab } from "./settings/SettingsThemeTab";
import { SettingsSoundTab } from "./settings/SettingsSoundTab";
import { SettingsProfileTab } from "./settings/SettingsProfileTab";
import { SettingsKeyboardTab } from "./settings/SettingsKeyboardTab";

type SettingsTab = "theme" | "sound" | "profile" | "keyboard";

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
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = make_styles(C);
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<SettingsTab>("theme");
  const tabFadeAnim = useRef(new Animated.Value(1)).current;
  const tabSlideAnim = useRef(new Animated.Value(0)).current;
  const [previewPlayersReady, setPreviewPlayersReady] = useState(false);
  const soundPreviewRef = useRef<SoundPreviewHandle>(null);

  useEffect(() => {
    if (visible) {
      const tid = setTimeout(() => setPreviewPlayersReady(true), 300);
      return () => clearTimeout(tid);
    } else {
      setPreviewPlayersReady(false);
    }
  }, [visible]);

  const playSoundPreview = useCallback((set: SoundSet) => {
    soundPreviewRef.current?.playSoundPreview(set);
  }, []);

  const previewCustomSample = useCallback((sourceSet: BuiltinSoundSet, sourceRole: SoundRole) => {
    soundPreviewRef.current?.previewCustomSample(sourceSet, sourceRole);
  }, []);

  const playCustomSampleUri = useCallback((uri: string, duration: number): Promise<void> => {
    return soundPreviewRef.current?.playCustomSampleUri(uri, duration) ?? Promise.resolve();
  }, []);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = S.isLandscape;
  const isTablet = S.isTablet;
  const cardMaxWidth = isTablet ? 600 : (isLandscape ? Math.min(winW * 0.92, 900) : 540);
  const maxSheetHeight = isLandscape ? winH * 0.96 : winH * 0.9;

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

  const TAB_ITEMS: { key: SettingsTab; icon: string; label: string }[] = [
    { key: "theme", icon: "color-palette-outline", label: t("settings", "themeTab") },
    { key: "sound", icon: "musical-notes-outline", label: t("settings", "soundTab") },
    { key: "profile", icon: "person-circle-outline", label: t("settings", "profileTab") },
    ...(Platform.OS === "web" ? [{ key: "keyboard" as SettingsTab, icon: "keypad-outline", label: t("keyboard", "tabLabel") }] : []),
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "theme":
        return (
          <SettingsThemeTab
            loggingEnabled={loggingEnabled}
            onLoggingEnabledChange={onLoggingEnabledChange}
            landscapeReversed={landscapeReversed}
            onLandscapeReversedChange={onLandscapeReversedChange}
            showLandscapeImage={showLandscapeImage}
            onShowLandscapeImageChange={onShowLandscapeImageChange}
            beatDirection={beatDirection}
            onBeatDirectionChange={onBeatDirectionChange}
            barMetronomeChannel={barMetronomeChannel}
            onBarMetronomeChannelChange={onBarMetronomeChannelChange}
            barCellOpacity={barCellOpacity}
            onBarCellOpacityChange={onBarCellOpacityChange}
            barRowHeight={barRowHeight}
            onBarRowHeightChange={onBarRowHeightChange}
            flashMode={flashMode}
            onFlashModeChange={onFlashModeChange}
            hapticMode={hapticMode}
            onHapticModeChange={onHapticModeChange}
          />
        );
      case "sound":
        return (
          <SettingsSoundTab
            volume={volume}
            onVolumeChange={onVolumeChange}
            sampleVolume={sampleVolume}
            onSampleVolumeChange={onSampleVolumeChange}
            soundSet={soundSet}
            onSoundSetChange={onSoundSetChange}
            layerSoundSets={layerSoundSets}
            onLayerSoundSetsChange={onLayerSoundSetsChange}
            customSoundSets={customSoundSets}
            onCustomSoundSetsChange={onCustomSoundSetsChange}
            audioOffsetMs={audioOffsetMs}
            onAudioOffsetChange={onAudioOffsetChange}
            timerStopMode={timerStopMode}
            onTimerStopModeChange={onTimerStopModeChange}
            backgroundPlay={backgroundPlay}
            onBackgroundPlayChange={onBackgroundPlayChange}
            autoResumeAfterInterruption={autoResumeAfterInterruption}
            onAutoResumeAfterInterruptionChange={onAutoResumeAfterInterruptionChange}
            playSoundPreview={playSoundPreview}
            previewCustomSample={previewCustomSample}
            playCustomSampleUri={playCustomSampleUri}
          />
        );
      case "profile":
        return (
          <SettingsProfileTab
            visible={visible}
            username={username}
            onUsernameChange={onUsernameChange}
            roomTrackingActive={roomTrackingActive}
            trackingRoomName={trackingRoomName}
            onStartRoomTracking={onStartRoomTracking}
            onStopRoomTracking={onStopRoomTracking}
            onResetApp={onResetApp}
            onShowOnboarding={onShowOnboarding}
          />
        );
      case "keyboard":
        return (
          <SettingsKeyboardTab
            keyBindings={keyBindingsProp}
            onKeyBindingsChange={onKeyBindingsChange}
          />
        );
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
        />
      )}
    </AnimatedModal>
  );
}

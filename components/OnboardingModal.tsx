import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Platform,
  Animated,
  Dimensions,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { ACCENT_PRESETS } from "@/constants/colors";
import type { ThemeColor } from "@/constants/colors";
import type { FlashMode, HapticMode } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";
import { useLanguage } from "@/contexts/LanguageContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingModalProps {
  visible: boolean;
  onComplete: (settings: OnboardingResult) => void;
}

export interface OnboardingResult {
  themeColor: ThemeColor;
  loggingEnabled: boolean;
  hapticMode: HapticMode;
  flashMode: FlashMode;
  username: string;
  practiceRoomName: string;
}

const THEME_OPTIONS: { key: ThemeColor; color: string; label: string }[] = [
  { key: "gold", color: ACCENT_PRESETS.gold.accent, label: "Gold" },
  { key: "green", color: ACCENT_PRESETS.green.accent, label: "Green" },
  { key: "orange", color: ACCENT_PRESETS.orange.accent, label: "Orange" },
  { key: "blue", color: ACCENT_PRESETS.blue.accent, label: "Blue" },
  { key: "saintspurple", color: ACCENT_PRESETS.saintspurple.accent, label: "Saints" },
  { key: "deepred", color: ACCENT_PRESETS.deepred.accent, label: "Deep Red" },
  { key: "beige", color: ACCENT_PRESETS.beige.accent, label: "Beige" },
  { key: "rose", color: ACCENT_PRESETS.rose.accent, label: "Rose" },
  { key: "neon", color: ACCENT_PRESETS.neon.accent, label: "Neon" },
];

const TOTAL_STEPS = 5;

const DEMO_BEAT_TYPES: BeatType[] = ["strong", "accent", "normal", "mute"];

const BEAT_COLORS: Record<BeatType, string> = {
  strong: "#F0883E",
  accent: "#D4A846",
  normal: "#8B949E",
  mute: "#30363D",
};

const DEMO_BPM = 100;
const DEMO_INTERVAL = (60 / DEMO_BPM) * 1000;

function DemoBar({
  activeBeat,
  accentColor,
  beatLabels,
}: {
  activeBeat: number;
  accentColor: string;
  beatLabels: string[];
}) {
  return (
    <View style={demoStyles.bar}>
      {DEMO_BEAT_TYPES.map((type, i) => {
        const isActive = activeBeat === i;
        const dotColor = type === "mute" ? Colors.textTertiary : BEAT_COLORS[type];
        return (
          <View key={i} style={demoStyles.beatCol}>
            <View
              style={[
                demoStyles.beatDot,
                {
                  backgroundColor: dotColor,
                  borderColor: isActive ? accentColor : "transparent",
                  borderWidth: isActive ? 2 : 0,
                  transform: [{ scale: isActive ? 1.3 : 1 }],
                },
              ]}
            />
            <Text
              style={[
                demoStyles.beatLabel,
                isActive && { color: accentColor },
              ]}
            >
              {beatLabels[i]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function useDemo(
  isActive: boolean,
  visible: boolean,
  mode: "haptic" | "flash",
  hapticMode: HapticMode,
  flashMode: FlashMode,
  flashAnim: Animated.Value
) {
  const [activeBeat, setActiveBeat] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beatRef = useRef(-1);
  const playingRef = useRef(false);
  const hapticModeRef = useRef(hapticMode);
  const flashModeRef = useRef(flashMode);

  hapticModeRef.current = hapticMode;
  flashModeRef.current = flashMode;

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    playingRef.current = false;
    setPlaying(false);
    setActiveBeat(-1);
    beatRef.current = -1;
  }, []);

  useEffect(() => {
    if (!isActive || !visible) stop();
  }, [isActive, visible, stop]);

  const toggle = useCallback(() => {
    if (playingRef.current) {
      stop();
      return;
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    playingRef.current = true;
    setPlaying(true);
    beatRef.current = -1;

    const tick = () => {
      beatRef.current = (beatRef.current + 1) % 4;
      const idx = beatRef.current;
      setActiveBeat(idx);

      const beatType = DEMO_BEAT_TYPES[idx];
      const isAccent = beatType === "strong" || beatType === "accent";

      if (mode === "haptic" && Platform.OS !== "web") {
        const hm = hapticModeRef.current;
        if (hm === "all" && beatType !== "mute") {
          Haptics.impactAsync(
            isAccent ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light
          );
        } else if (hm === "accent" && isAccent) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }
      }

      if (mode === "flash") {
        const fm = flashModeRef.current;
        const shouldFlash =
          fm === "all" ? beatType !== "mute" : fm === "accent" ? isAccent : false;
        if (shouldFlash) {
          Animated.sequence([
            Animated.timing(flashAnim, { toValue: 0.2, duration: 50, useNativeDriver: true }),
            Animated.timing(flashAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
          ]).start();
        }
      }
    };

    tick();
    intervalRef.current = setInterval(tick, DEMO_INTERVAL);
  }, [mode, flashAnim, stop]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { activeBeat, playing, toggle, stop };
}

export function OnboardingModal({ visible, onComplete }: OnboardingModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const [step, setStep] = useState(0);

  const [selectedTheme, setSelectedTheme] = useState<ThemeColor>("gold");
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [hapticMode, setHapticMode] = useState<HapticMode>("all");
  const [flashMode, setFlashMode] = useState<FlashMode>("accent");
  const [username, setUsername] = useState("");
  const [roomName, setRoomName] = useState("");

  const prevVisibleRef = useRef(visible);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setStep(0);
      setSelectedTheme("gold");
      setLoggingEnabled(true);
      setHapticMode("all");
      setFlashMode("accent");
      setUsername("");
      setRoomName("");
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const hapticFlashAnim = useRef(new Animated.Value(0)).current;
  const flashFlashAnim = useRef(new Animated.Value(0)).current;

  const accentColor =
    ACCENT_PRESETS[selectedTheme === "custom" ? "gold" : selectedTheme]?.accent ||
    ACCENT_PRESETS.gold.accent;

  const hapticDemo = useDemo(step === 2, visible, "haptic", hapticMode, flashMode, hapticFlashAnim);
  const flashDemo = useDemo(step === 3, visible, "flash", hapticMode, flashMode, flashFlashAnim);

  const animateToStep = useCallback(
    (nextStep: number) => {
      const direction = nextStep > step ? -1 : 1;
      Animated.sequence([
        Animated.timing(slideAnim, {
          toValue: direction * winW,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -direction * winW,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
      setStep(nextStep);
    },
    [step, slideAnim, winW]
  );

  const handleNext = useCallback(() => {
    hapticDemo.stop();
    flashDemo.stop();
    if (step < TOTAL_STEPS - 1) {
      animateToStep(step + 1);
    } else {
      onComplete({
        themeColor: selectedTheme,
        loggingEnabled,
        hapticMode,
        flashMode,
        username: username.trim(),
        practiceRoomName: roomName.trim(),
      });
    }
  }, [
    step,
    selectedTheme,
    loggingEnabled,
    hapticMode,
    flashMode,
    username,
    roomName,
    onComplete,
    animateToStep,
    hapticDemo,
    flashDemo,
  ]);

  const handleSkip = useCallback(() => {
    hapticDemo.stop();
    flashDemo.stop();
    onComplete({
      themeColor: selectedTheme,
      loggingEnabled,
      hapticMode,
      flashMode,
      username: username.trim(),
      practiceRoomName: roomName.trim(),
    });
  }, [selectedTheme, loggingEnabled, hapticMode, flashMode, username, roomName, onComplete, hapticDemo, flashDemo]);

  const handleBack = useCallback(() => {
    hapticDemo.stop();
    flashDemo.stop();
    if (step > 0) {
      animateToStep(step - 1);
    }
  }, [step, animateToStep, hapticDemo, flashDemo]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i === step
              ? { backgroundColor: accentColor, width: 24 }
              : { backgroundColor: Colors.textTertiary },
          ]}
        />
      ))}
    </View>
  );

  const renderStepHeader = (icon: React.ReactNode, titleKey: string, subtitleKey: string) => (
    <View style={isLandscape ? styles.landHeaderCol : undefined}>
      {icon}
      <Text style={[styles.stepTitle, isLandscape && styles.landStepTitle]}>{t("onboarding", titleKey)}</Text>
      <Text style={[styles.stepSubtitle, isLandscape && styles.landStepSubtitle]}>{t("onboarding", subtitleKey)}</Text>
    </View>
  );

  const renderThemeStep = () => {
    const themeGrid = (
      <View style={[styles.themeGrid, isLandscape && { marginTop: 0 }]}>
        {THEME_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={[
              styles.themeOption,
              isLandscape && { width: "auto", minWidth: 70, paddingVertical: 8, paddingHorizontal: 10 },
              selectedTheme === opt.key && {
                borderColor: opt.color,
                borderWidth: 2,
              },
            ]}
            onPress={() => setSelectedTheme(opt.key)}
          >
            <View style={[styles.themeCircle, isLandscape && { width: 32, height: 32, borderRadius: 16 }, { backgroundColor: opt.color }]}>
              {selectedTheme === opt.key && (
                <Ionicons name="checkmark" size={isLandscape ? 16 : 20} color="#fff" />
              )}
            </View>
            <Text
              style={[
                styles.themeLabel,
                selectedTheme === opt.key && { color: opt.color },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    );

    if (isLandscape) {
      return (
        <View style={styles.landRow}>
          {renderStepHeader(
            <MaterialCommunityIcons name="palette-outline" size={32} color={accentColor} />,
            "themeTitle", "themeSubtitle"
          )}
          <ScrollView style={styles.landContentCol} contentContainerStyle={styles.landContentInner} showsVerticalScrollIndicator={false}>
            {themeGrid}
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={styles.stepContent}>
        <MaterialCommunityIcons name="palette-outline" size={40} color={accentColor} />
        <Text style={styles.stepTitle}>{t("onboarding", "themeTitle")}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding", "themeSubtitle")}</Text>
        {themeGrid}
      </View>
    );
  };

  const renderLoggingStep = () => {
    const loggingContent = (
      <>
        <View style={[styles.infoCard, isLandscape && { padding: 10, gap: 8 }]}>
          <Text style={styles.infoCardTitle}>{t("onboarding", "loggingWhy")}</Text>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={isLandscape ? 14 : 18} color={accentColor} />
            <Text style={styles.infoText}>{t("onboarding", "loggingRow1")}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="musical-notes-outline" size={isLandscape ? 14 : 18} color={accentColor} />
            <Text style={styles.infoText}>{t("onboarding", "loggingRow2")}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={isLandscape ? 14 : 18} color={accentColor} />
            <Text style={styles.infoText}>{t("onboarding", "loggingRow3")}</Text>
          </View>
        </View>

        <View style={[styles.infoCard, isLandscape && { padding: 10, gap: 8 }]}>
          <Text style={styles.infoCardTitle}>{t("onboarding", "loggingHow")}</Text>
          <View style={styles.infoRow}>
            <Ionicons name="bar-chart-outline" size={isLandscape ? 14 : 18} color={accentColor} />
            <Text style={styles.infoText}>{t("onboarding", "loggingRow4")}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="trophy-outline" size={isLandscape ? 14 : 18} color={accentColor} />
            <Text style={styles.infoText}>{t("onboarding", "loggingRow5")}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="share-social-outline" size={isLandscape ? 14 : 18} color={accentColor} />
            <Text style={styles.infoText}>{t("onboarding", "loggingRow6")}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={isLandscape ? 14 : 18} color={accentColor} />
            <Text style={styles.infoText}>{t("onboarding", "loggingRow7")}</Text>
          </View>
        </View>

        <Pressable
          style={[
            styles.bigToggle,
            isLandscape && { height: 38, marginTop: 4, marginBottom: 8 },
            loggingEnabled
              ? { backgroundColor: accentColor }
              : { backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.border },
          ]}
          onPress={() => setLoggingEnabled(!loggingEnabled)}
        >
          <Ionicons
            name={loggingEnabled ? "checkmark-circle" : "close-circle-outline"}
            size={22}
            color={loggingEnabled ? Colors.background : Colors.textSecondary}
          />
          <Text
            style={[
              styles.bigToggleText,
              { color: loggingEnabled ? Colors.background : Colors.textSecondary },
            ]}
          >
            {loggingEnabled ? t("onboarding", "loggingOn") : t("onboarding", "loggingOff")}
          </Text>
        </Pressable>
      </>
    );

    if (isLandscape) {
      return (
        <View style={styles.landRow}>
          {renderStepHeader(
            <Ionicons name="analytics-outline" size={32} color={accentColor} />,
            "loggingTitle", "loggingSubtitle"
          )}
          <ScrollView style={styles.landContentCol} contentContainerStyle={styles.landContentInner} showsVerticalScrollIndicator={false}>
            {loggingContent}
          </ScrollView>
        </View>
      );
    }

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.stepContent}
        showsVerticalScrollIndicator={false}
      >
        <Ionicons name="analytics-outline" size={40} color={accentColor} />
        <Text style={styles.stepTitle}>{t("onboarding", "loggingTitle")}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding", "loggingSubtitle")}</Text>
        {loggingContent}
      </ScrollView>
    );
  };

  const ModeOption = ({
    label,
    description,
    value,
    current,
    onSelect,
  }: {
    label: string;
    description: string;
    value: string;
    current: string;
    onSelect: () => void;
  }) => {
    const selected = current === value;
    return (
      <Pressable
        style={[
          styles.modeOption,
          selected && { borderColor: accentColor, borderWidth: 2 },
        ]}
        onPress={onSelect}
      >
        <View style={styles.modeOptionLeft}>
          <View
            style={[
              styles.radioOuter,
              selected && { borderColor: accentColor },
            ]}
          >
            {selected && (
              <View style={[styles.radioInner, { backgroundColor: accentColor }]} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.modeOptionLabel, selected && { color: accentColor }]}>
              {label}
            </Text>
            <Text style={styles.modeOptionDesc}>{description}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderHapticStep = () => {
    const hapticContent = (
      <>
        <View style={[styles.modeList, isLandscape && { gap: 6 }]}>
          <ModeOption label={t("onboarding", "hapticAll")} description={t("onboarding", "hapticAllDesc")} value="all" current={hapticMode} onSelect={() => setHapticMode("all")} />
          <ModeOption label={t("onboarding", "hapticAccent")} description={t("onboarding", "hapticAccentDesc")} value="accent" current={hapticMode} onSelect={() => setHapticMode("accent")} />
          <ModeOption label={t("onboarding", "hapticOff")} description={t("onboarding", "hapticOffDesc")} value="off" current={hapticMode} onSelect={() => setHapticMode("off")} />
        </View>

        <View style={[styles.demoSection, isLandscape && { marginTop: 8, paddingVertical: 10 }]}>
          <DemoBar activeBeat={hapticDemo.activeBeat} accentColor={accentColor} beatLabels={[t("beatTypes", "strong"), t("beatTypes", "accent"), t("beatTypes", "normal"), t("beatTypes", "mute")]} />
          <Pressable
            style={[
              styles.demoButton,
              isLandscape && { height: 32 },
              hapticDemo.playing
                ? { backgroundColor: Colors.surfaceLight, borderColor: accentColor, borderWidth: 1 }
                : { backgroundColor: accentColor },
            ]}
            onPress={hapticDemo.toggle}
          >
            <Ionicons name={hapticDemo.playing ? "stop" : "play"} size={16} color={hapticDemo.playing ? accentColor : Colors.background} />
            <Text style={[styles.demoButtonText, { color: hapticDemo.playing ? accentColor : Colors.background }]}>
              {hapticDemo.playing ? t("onboarding", "stop") : t("onboarding", "preview")}
            </Text>
          </Pressable>
        </View>
      </>
    );

    if (isLandscape) {
      return (
        <View style={styles.landRow}>
          {renderStepHeader(
            <Ionicons name="phone-portrait-outline" size={32} color={accentColor} />,
            "hapticTitle", "hapticSubtitle"
          )}
          <ScrollView style={styles.landContentCol} contentContainerStyle={styles.landContentInner} showsVerticalScrollIndicator={false}>
            {hapticContent}
          </ScrollView>
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Ionicons name="phone-portrait-outline" size={40} color={accentColor} />
        <Text style={styles.stepTitle}>{t("onboarding", "hapticTitle")}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding", "hapticSubtitle")}</Text>
        {hapticContent}
      </ScrollView>
    );
  };

  const renderFlashStep = () => {
    const flashContent = (
      <>
        <View style={[styles.modeList, isLandscape && { gap: 6 }]}>
          <ModeOption label={t("onboarding", "flashAll")} description={t("onboarding", "flashAllDesc")} value="all" current={flashMode} onSelect={() => setFlashMode("all")} />
          <ModeOption label={t("onboarding", "flashAccent")} description={t("onboarding", "flashAccentDesc")} value="accent" current={flashMode} onSelect={() => setFlashMode("accent")} />
          <ModeOption label={t("onboarding", "flashOff")} description={t("onboarding", "flashOffDesc")} value="off" current={flashMode} onSelect={() => setFlashMode("off")} />
        </View>

        <View style={[styles.demoSection, isLandscape && { marginTop: 8, paddingVertical: 10 }]}>
          <DemoBar activeBeat={flashDemo.activeBeat} accentColor={accentColor} beatLabels={[t("beatTypes", "strong"), t("beatTypes", "accent"), t("beatTypes", "normal"), t("beatTypes", "mute")]} />
          <Pressable
            style={[
              styles.demoButton,
              isLandscape && { height: 32 },
              flashDemo.playing
                ? { backgroundColor: Colors.surfaceLight, borderColor: accentColor, borderWidth: 1 }
                : { backgroundColor: accentColor },
            ]}
            onPress={flashDemo.toggle}
          >
            <Ionicons name={flashDemo.playing ? "stop" : "play"} size={16} color={flashDemo.playing ? accentColor : Colors.background} />
            <Text style={[styles.demoButtonText, { color: flashDemo.playing ? accentColor : Colors.background }]}>
              {flashDemo.playing ? t("onboarding", "stop") : t("onboarding", "preview")}
            </Text>
          </Pressable>
        </View>
      </>
    );

    if (isLandscape) {
      return (
        <View style={{ flex: 1 }}>
          <View style={styles.landRow}>
            {renderStepHeader(
              <Ionicons name="flash-outline" size={32} color={accentColor} />,
              "flashTitle", "flashSubtitle"
            )}
            <ScrollView style={styles.landContentCol} contentContainerStyle={styles.landContentInner} showsVerticalScrollIndicator={false}>
              {flashContent}
            </ScrollView>
          </View>
          <Animated.View pointerEvents="none" style={[styles.flashOverlay, { backgroundColor: accentColor, opacity: flashFlashAnim }]} />
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
          <Ionicons name="flash-outline" size={40} color={accentColor} />
          <Text style={styles.stepTitle}>{t("onboarding", "flashTitle")}</Text>
          <Text style={styles.stepSubtitle}>{t("onboarding", "flashSubtitle")}</Text>
          {flashContent}
        </ScrollView>
        <Animated.View pointerEvents="none" style={[styles.flashOverlay, { backgroundColor: accentColor, opacity: flashFlashAnim }]} />
      </View>
    );
  };

  const renderProfileStep = () => {
    const profileContent = (
      <>
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>{t("onboarding", "nicknameLabel")}</Text>
          <TextInput
            style={[styles.textInput, isLandscape && { height: 40 }, { borderColor: accentColor }]}
            value={username}
            onChangeText={setUsername}
            placeholder={t("onboarding", "nicknamePlaceholder")}
            placeholderTextColor={Colors.textTertiary}
            maxLength={20}
          />
        </View>
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>{t("onboarding", "roomLabel")}</Text>
          <TextInput
            style={[styles.textInput, isLandscape && { height: 40 }, { borderColor: accentColor }]}
            value={roomName}
            onChangeText={setRoomName}
            placeholder={t("onboarding", "roomPlaceholder")}
            placeholderTextColor={Colors.textTertiary}
            maxLength={30}
          />
          <View style={styles.locationHint}>
            <Ionicons name="location" size={14} color={accentColor} />
            <Text style={styles.locationHintText}>{t("onboarding", "roomHint")}</Text>
          </View>
        </View>
      </>
    );

    if (isLandscape) {
      return (
        <View style={styles.landRow}>
          {renderStepHeader(
            <Ionicons name="person-circle-outline" size={32} color={accentColor} />,
            "profileTitle", "profileSubtitle"
          )}
          <ScrollView style={styles.landContentCol} contentContainerStyle={styles.landContentInner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {profileContent}
          </ScrollView>
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
        <Ionicons name="person-circle-outline" size={40} color={accentColor} />
        <Text style={styles.stepTitle}>{t("onboarding", "profileTitle")}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding", "profileSubtitle")}</Text>
        {profileContent}
      </ScrollView>
    );
  };

  const renderCurrentStep = () => {
    switch (step) {
      case 0:
        return renderThemeStep();
      case 1:
        return renderLoggingStep();
      case 2:
        return renderHapticStep();
      case 3:
        return renderFlashStep();
      case 4:
        return renderProfileStep();
      default:
        return null;
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <View
        style={[
          styles.container,
          {
            paddingTop: (insets.top || webTopInset) + (isLandscape ? 4 : 12),
            paddingBottom: (insets.bottom || webBottomInset) + (isLandscape ? 4 : 12),
          },
          isLandscape && { paddingLeft: insets.left || 0, paddingRight: insets.right || 0 },
        ]}
      >
        <View style={[styles.topBar, isLandscape && { paddingVertical: 4 }]}>
          {step > 0 ? (
            <Pressable onPress={handleBack} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
            </Pressable>
          ) : (
            <View style={styles.backBtn} />
          )}
          {renderStepIndicator()}
          <Pressable onPress={handleSkip} hitSlop={10}>
            <Text style={styles.skipText}>{t("onboarding", "skip")}</Text>
          </Pressable>
        </View>

        <Animated.View
          style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}
        >
          {renderCurrentStep()}
        </Animated.View>

        <View style={[styles.bottomBar, isLandscape && { paddingVertical: 6, paddingHorizontal: 16 }]}>
          <Pressable
            style={[styles.nextButton, isLandscape && { height: 40, borderRadius: 10 }, { backgroundColor: accentColor }]}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>
              {step === TOTAL_STEPS - 1 ? t("onboarding", "start") : t("onboarding", "next")}
            </Text>
            {step < TOTAL_STEPS - 1 && (
              <Ionicons name="arrow-forward" size={18} color={Colors.background} />
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const demoStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  beatCol: {
    alignItems: "center",
    gap: 6,
  },
  beatDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  beatLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  backBtn: {
    width: 60,
  },
  skipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    width: 60,
    textAlign: "right",
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepDot: {
    height: 6,
    width: 6,
    borderRadius: 3,
  },
  stepContainer: {
    flex: 1,
  },
  stepContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 32,
    gap: 12,
  },
  stepTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 24,
    color: Colors.text,
    marginTop: 8,
  },
  stepSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 12,
  },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 16,
    marginTop: 8,
  },
  themeOption: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    width: (SCREEN_WIDTH - 56 - 32) / 3,
    minWidth: 90,
  },
  themeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  themeLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  infoCard: {
    width: "100%",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 12,
  },
  infoCardTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  infoText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 19,
  },
  bigToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    height: 48,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  bigToggleText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
  modeList: {
    width: "100%",
    gap: 8,
  },
  modeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modeOptionLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  modeOptionDesc: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  demoSection: {
    width: "100%",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  demoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 24,
    height: 38,
    borderRadius: 10,
  },
  demoButtonText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  flashOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  inputSection: {
    width: "100%",
    gap: 8,
  },
  inputLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  textInput: {
    width: "100%",
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  locationHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  locationHintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 17,
  },
  landRow: {
    flex: 1,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
  },
  landHeaderCol: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  landContentCol: {
    flex: 1,
  },
  landContentInner: {
    gap: 10,
    paddingVertical: 4,
    paddingRight: 4,
  },
  landStepTitle: {
    fontSize: 18,
    textAlign: "center",
  },
  landStepSubtitle: {
    fontSize: 12,
    textAlign: "center",
  },
  bottomBar: {
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 14,
  },
  nextButtonText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: Colors.background,
  },
});

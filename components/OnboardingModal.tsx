import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  Animated,
  Dimensions,
  ScrollView,
  useWindowDimensions,
  PanResponder,
} from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { Radius, FontSize, Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { ACCENT_PRESETS } from "@/constants/colors";
import type { ThemeColor } from "@/constants/colors";
import type { FlashMode, HapticMode } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGE_OPTIONS, type Language } from "@/lib/i18n";
import { Switch } from "react-native";
import { AssistantShortcutsGuide } from "@/components/AssistantShortcutsGuide";
import { Audio } from "expo-av";
import { ensurePermission } from "@/lib/permissions";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingModalProps {
  visible: boolean;
  onComplete: (settings: OnboardingResult) => void;
}

export interface OnboardingResult {
  themeColor: ThemeColor;
  customHex?: string;
  loggingEnabled: boolean;
  hapticMode: HapticMode;
  flashMode: FlashMode;
  username: string;
  practiceRoomName: string;
}

const HUE_COLORS = [
  "#FF0000", "#FF8000", "#FFFF00", "#80FF00",
  "#00FF00", "#00FF80", "#00FFFF", "#0080FF",
  "#0000FF", "#8000FF", "#FF00FF", "#FF0080", "#FF0000",
];

const THEME_OPTIONS: { key: ThemeColor; color: string; label: string }[] = [
  { key: "gold", color: ACCENT_PRESETS.gold.accent, label: "Gold" },
  { key: "green", color: ACCENT_PRESETS.green.accent, label: "Green" },
  { key: "orange", color: ACCENT_PRESETS.orange.accent, label: "Orange" },
  { key: "blue", color: ACCENT_PRESETS.blue.accent, label: "Blue" },
  { key: "cyan", color: ACCENT_PRESETS.cyan.accent, label: "Cyan" },
  { key: "pink", color: ACCENT_PRESETS.pink.accent, label: "Pink" },
  { key: "saintspurple", color: ACCENT_PRESETS.saintspurple.accent, label: "Saints" },
  { key: "deepred", color: ACCENT_PRESETS.deepred.accent, label: "Deep Red" },
  { key: "beige", color: ACCENT_PRESETS.beige.accent, label: "Beige" },
  { key: "rose", color: ACCENT_PRESETS.rose.accent, label: "Rose" },
  { key: "neon", color: ACCENT_PRESETS.neon.accent, label: "Neon" },
];

const TOTAL_STEPS = 9;

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
  const { colors: C } = useTheme();
  const demoStyles = make_demoStyles(C);
  return (
    <View style={demoStyles.bar}>
      {DEMO_BEAT_TYPES.map((type, i) => {
        const isActive = activeBeat === i;
        const dotColor = type === "mute" ? C.textTertiary : BEAT_COLORS[type];
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beatRef = useRef(-1);
  const playingRef = useRef(false);
  const hapticModeRef = useRef(hapticMode);
  const flashModeRef = useRef(flashMode);
  const startTimeRef = useRef(0);
  const beatCountRef = useRef(0);

  hapticModeRef.current = hapticMode;
  flashModeRef.current = flashMode;

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
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
    if (timerRef.current) clearTimeout(timerRef.current);
    playingRef.current = true;
    setPlaying(true);
    beatRef.current = -1;
    startTimeRef.current = performance.now();
    beatCountRef.current = 0;

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

      if (!playingRef.current) return;
      beatCountRef.current += 1;
      const nextTarget = startTimeRef.current + beatCountRef.current * DEMO_INTERVAL;
      const delay = Math.max(0, nextTarget - performance.now());
      timerRef.current = setTimeout(tick, delay);
    };

    tick();
  }, [mode, flashAnim, stop]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { activeBeat, playing, toggle, stop };
}

export function OnboardingModal({ visible, onComplete }: OnboardingModalProps) {
  const { colors: C } = useTheme();
  const styles = make_styles(C);
  const cpStyles = make_cpStyles(C);
  const { t, language, setLanguage } = useLanguage();
  const [showAssistantGuide, setShowAssistantGuide] = useState(false);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const [step, setStep] = useState(0);

  const [selectedTheme, setSelectedTheme] = useState<ThemeColor>("gold");
  const [customHex, setCustomHex] = useState("#D4A846");
  const [hexInput, setHexInput] = useState("#D4A846");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [hapticMode, setHapticMode] = useState<HapticMode>("all");
  const [flashMode, setFlashMode] = useState<FlashMode>("accent");
  const [username, setUsername] = useState("");
  const [roomName, setRoomName] = useState("");
  const [soundTestPlayed, setSoundTestPlayed] = useState(false);
  const [permMicGranted, setPermMicGranted] = useState(false);
  const [permLocationGranted, setPermLocationGranted] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const hueTrackRef = useRef<View>(null);
  const hueTrackWidthRef = useRef(0);

  const prevVisibleRef = useRef(visible);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setStep(0);
      setSelectedTheme("gold");
      setCustomHex("#D4A846");
      setHexInput("#D4A846");
      setShowCustomPicker(false);
      setLoggingEnabled(true);
      setHapticMode("all");
      setFlashMode("accent");
      setUsername("");
      setRoomName("");
      setSoundTestPlayed(false);
      setPermMicGranted(false);
      setPermLocationGranted(false);
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    }
    if (!visible && soundRef.current) {
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const hapticFlashAnim = useRef(new Animated.Value(0)).current;
  const flashFlashAnim = useRef(new Animated.Value(0)).current;

  const accentColor = selectedTheme === "custom"
    ? customHex
    : (ACCENT_PRESETS[selectedTheme]?.accent || ACCENT_PRESETS.gold.accent);

  const hueFromPosition = useCallback((ratio: number): string => {
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
          setSelectedTheme("custom");
        });
      }
    },
    [hueFromPosition]
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
        setSelectedTheme("custom");
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
    [hueFromPosition]
  );

  const handleHexSubmit = useCallback(() => {
    let h = hexInput.trim();
    if (!h.startsWith("#")) h = "#" + h;
    if (/^#[0-9A-Fa-f]{6}$/.test(h)) {
      setCustomHex(h.toUpperCase());
      setSelectedTheme("custom");
    } else {
      setHexInput(customHex);
    }
  }, [hexInput, customHex]);

  const hapticDemo = useDemo(step === 4, visible, "haptic", hapticMode, flashMode, hapticFlashAnim);
  const flashDemo = useDemo(step === 5, visible, "flash", hapticMode, flashMode, flashFlashAnim);

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
        customHex: selectedTheme === "custom" ? customHex : undefined,
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
    customHex,
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
      customHex: selectedTheme === "custom" ? customHex : undefined,
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

  const handlePlayTestSound = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.setPositionAsync(0);
        await soundRef.current.playAsync();
      } else {
        const { sound } = await Audio.Sound.createAsync(
          require("@/assets/sounds/click-strong.wav"),
          { shouldPlay: true }
        );
        soundRef.current = sound;
      }
      setSoundTestPlayed(true);
    } catch {
    }
  }, []);

  const handleAllowNow = useCallback(async () => {
    const micGranted = await ensurePermission("mic", t, { showAlertOnDeny: false });
    setPermMicGranted(micGranted);
    const locationGranted = await ensurePermission("location", t, { showAlertOnDeny: false });
    setPermLocationGranted(locationGranted);
  }, [t]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const renderStepIndicator = () => (
    <View
      style={styles.stepIndicator}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("onboarding", "stepProgress")}
      accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step + 1 }}
    >
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i === step
              ? { backgroundColor: accentColor, width: 24 }
              : { backgroundColor: C.textTertiary },
          ]}
        />
      ))}
    </View>
  );

  // i18n key 검증: scripts/check-i18n-keys.ts 가 정적 호출의 키 존재 여부를 점검합니다.
  // t() 의 오버로드 시그니처가 두 번째 인자를 첫 번째 인자에 따라 좁혀 두므로,
  // 헬퍼처럼 키를 변수로 받는 경우 `as never` 가 필요합니다.
  const renderStepHeader = (
    icon: React.ReactNode,
    titleKey: string,
    subtitleKey: string,
  ) => (
    <View style={isLandscape ? styles.landHeaderCol : undefined}>
      {icon}
      <Text style={[styles.stepTitle, isLandscape && styles.landStepTitle]}>{t("onboarding", titleKey as never)}</Text>
      <Text style={[styles.stepSubtitle, isLandscape && styles.landStepSubtitle]}>{t("onboarding", subtitleKey as never)}</Text>
      {isLandscape && (
        <Pressable
          style={[styles.landNextButton, { backgroundColor: accentColor }]}
          onPress={handleNext}
        >
          <Text style={styles.landNextButtonText}>
            {step === TOTAL_STEPS - 1 ? t("onboarding", "start") : t("onboarding", "next")}
          </Text>
          {step < TOTAL_STEPS - 1 && (
            <Ionicons name="arrow-forward" size={14} color={C.background} />
          )}
        </Pressable>
      )}
    </View>
  );

  const renderCustomPicker = () => (
    <View style={cpStyles.container}>
      <View
        ref={hueTrackRef}
        style={cpStyles.trackWrapper}
        onLayout={(e) => { hueTrackWidthRef.current = e.nativeEvent.layout.width; }}
        {...(Platform.OS !== "web" ? huePanResponder.panHandlers : {})}
        {...(Platform.OS === "web" ? { onMouseDown: handleHueWebMouse } as any : {})}
      >
        <LinearGradient
          colors={HUE_COLORS as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={cpStyles.track}
        />
        <View style={[cpStyles.thumb, { backgroundColor: customHex, borderColor: C.white }]} />
      </View>
      <View style={cpStyles.hexRow}>
        <View style={[cpStyles.preview, { backgroundColor: customHex }]} />
        <TextInput
          style={[cpStyles.hexInput, { borderColor: accentColor }]}
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
  );

  const renderThemeStep = () => {
    const gridGap = 8;
    const availW = isLandscape ? Math.min((winW - 80) * 0.42, winW * 0.4) : winW - 48;
    const tileSize = Math.floor((availW - gridGap * 2) / 3);
    const themeGrid = (
      <View style={[styles.themeGrid, isLandscape && { marginTop: 0 }]}>
        {THEME_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={[
              styles.themeOption,
              { width: tileSize, height: tileSize },
              selectedTheme === opt.key && {
                borderColor: opt.color,
                borderWidth: 2,
              },
            ]}
            onPress={() => { setSelectedTheme(opt.key); setShowCustomPicker(false); }}
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
        <Pressable
          style={[
            styles.themeOption,
            { width: tileSize, height: tileSize },
            selectedTheme === "custom" && { borderColor: customHex, borderWidth: 2 },
          ]}
          onPress={() => { setSelectedTheme("custom"); setShowCustomPicker(true); }}
        >
          <View style={[styles.themeCircle, isLandscape && { width: 32, height: 32, borderRadius: 16 }, selectedTheme === "custom" ? { backgroundColor: customHex } : { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }]}>
            {selectedTheme === "custom" ? (
              <Ionicons name="checkmark" size={isLandscape ? 16 : 20} color="#fff" />
            ) : (
              <Ionicons name="color-wand-outline" size={isLandscape ? 14 : 18} color={C.textSecondary} />
            )}
          </View>
          <Text style={[styles.themeLabel, selectedTheme === "custom" && { color: customHex }]}>Custom</Text>
        </Pressable>
      </View>
    );

    if (isLandscape) {
      return (
        <View style={styles.landRow}>
          {renderStepHeader(
            <MaterialCommunityIcons name="palette-outline" size={36} color={accentColor} />,
            "themeTitle", "themeSubtitle"
          )}
          <ScrollView style={styles.landContentCol} contentContainerStyle={styles.landContentInner} showsVerticalScrollIndicator={false}>
            {themeGrid}
            {(showCustomPicker || selectedTheme === "custom") && renderCustomPicker()}
          </ScrollView>
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <MaterialCommunityIcons name="palette-outline" size={40} color={accentColor} />
        <Text style={styles.stepTitle}>{t("onboarding", "themeTitle")}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding", "themeSubtitle")}</Text>
        {themeGrid}
        {(showCustomPicker || selectedTheme === "custom") && renderCustomPicker()}
      </ScrollView>
    );
  };

  const renderLoggingStep = () => {
    const loggingContent = (
      <>
        <View style={[styles.infoCard, isLandscape && { padding: 10, gap: Spacing.sm }]}>
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

        <View style={[styles.infoCard, isLandscape && { padding: 10, gap: Spacing.sm }]}>
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
            isLandscape && { height: 38, marginTop: Spacing.xs, marginBottom: Spacing.sm },
            loggingEnabled
              ? { backgroundColor: accentColor }
              : { backgroundColor: C.surfaceLight, borderWidth: 1, borderColor: C.border },
          ]}
          onPress={() => setLoggingEnabled(!loggingEnabled)}
        >
          <Ionicons
            name={loggingEnabled ? "checkmark-circle" : "close-circle-outline"}
            size={22}
            color={loggingEnabled ? C.background : C.textSecondary}
          />
          <Text
            style={[
              styles.bigToggleText,
              { color: loggingEnabled ? C.background : C.textSecondary },
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
            <Ionicons name="analytics-outline" size={36} color={accentColor} />,
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

        <View style={[styles.demoSection, isLandscape && { marginTop: Spacing.sm, paddingVertical: 10 }]}>
          <DemoBar activeBeat={hapticDemo.activeBeat} accentColor={accentColor} beatLabels={[t("beatTypes", "strong"), t("beatTypes", "accent"), t("beatTypes", "normal"), t("beatTypes", "mute")]} />
          <Pressable
            style={[
              styles.demoButton,
              isLandscape && { height: 32 },
              hapticDemo.playing
                ? { backgroundColor: C.surfaceLight, borderColor: accentColor, borderWidth: 1 }
                : { backgroundColor: accentColor },
            ]}
            onPress={hapticDemo.toggle}
          >
            <Ionicons name={hapticDemo.playing ? "stop" : "play"} size={16} color={hapticDemo.playing ? accentColor : C.background} />
            <Text style={[styles.demoButtonText, { color: hapticDemo.playing ? accentColor : C.background }]}>
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
            <Ionicons name="phone-portrait-outline" size={36} color={accentColor} />,
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

        <View style={[styles.demoSection, isLandscape && { marginTop: Spacing.sm, paddingVertical: 10 }]}>
          <DemoBar activeBeat={flashDemo.activeBeat} accentColor={accentColor} beatLabels={[t("beatTypes", "strong"), t("beatTypes", "accent"), t("beatTypes", "normal"), t("beatTypes", "mute")]} />
          <Pressable
            style={[
              styles.demoButton,
              isLandscape && { height: 32 },
              flashDemo.playing
                ? { backgroundColor: C.surfaceLight, borderColor: accentColor, borderWidth: 1 }
                : { backgroundColor: accentColor },
            ]}
            onPress={flashDemo.toggle}
          >
            <Ionicons name={flashDemo.playing ? "stop" : "play"} size={16} color={flashDemo.playing ? accentColor : C.background} />
            <Text style={[styles.demoButtonText, { color: flashDemo.playing ? accentColor : C.background }]}>
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
              <Ionicons name="flash-outline" size={36} color={accentColor} />,
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
            placeholderTextColor={C.textTertiary}
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
            placeholderTextColor={C.textTertiary}
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
            <Ionicons name="person-circle-outline" size={36} color={accentColor} />,
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

  const renderLanguageStep = () => {
    const options = LANGUAGE_OPTIONS;
    const content = (
      <View style={{ width: "100%", gap: 12, marginTop: Spacing.sm }}>
        {options.map((opt) => {
          const active = language === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setLanguage(opt.value)}
              style={{
                paddingVertical: 16,
                paddingHorizontal: 20,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: active ? accentColor : C.border,
                backgroundColor: active ? C.accentDim : C.surface,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              testID={`onboarding-lang-${opt.value}`}
            >
              <Text style={{ color: active ? accentColor : C.text, fontSize: 16, fontWeight: "600" }}>
                {opt.label}
              </Text>
              {active && <Ionicons name="checkmark-circle" size={22} color={accentColor} />}
            </Pressable>
          );
        })}
      </View>
    );

    if (isLandscape) {
      return (
        <View style={styles.landRow}>
          {renderStepHeader(
            <Ionicons name="language-outline" size={36} color={accentColor} />,
            "languageTitle", "languageSubtitle"
          )}
          <ScrollView style={styles.landContentCol} contentContainerStyle={styles.landContentInner} showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        </View>
      );
    }
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Ionicons name="language-outline" size={40} color={accentColor} />
        <Text style={styles.stepTitle}>{t("onboarding", "languageTitle")}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding", "languageSubtitle")}</Text>
        {content}
      </ScrollView>
    );
  };

  const renderVoiceStep = () => {
    const isKo = language === "ko";
    const content = (
      <>
        <View style={{
          width: "100%", marginTop: Spacing.sm, padding: 16, borderRadius: 12,
          backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
        }}>
          <Text style={{ color: C.textSecondary, fontSize: FontSize.small, marginBottom: Spacing.sm }}>
            {isKo
              ? "Siri 또는 Google 어시스턴트에 단축어를 등록하면 음성으로 메트로놈을 제어할 수 있습니다."
              : "Register shortcuts with Siri or Google Assistant to control the metronome by voice."}
          </Text>
          <Pressable
            onPress={() => setShowAssistantGuide(true)}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.overlay10,
            }}
            testID="onboarding-assistant-guide"
          >
            <Text style={{ color: C.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>
              {isKo ? "단축어 설정 방법 보기" : "How to set up shortcuts"}
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

    if (isLandscape) {
      return (
        <View style={styles.landRow}>
          {renderStepHeader(
            <Ionicons name="link-outline" size={36} color={accentColor} />,
            "voiceTitle", "voiceSubtitle"
          )}
          <ScrollView style={styles.landContentCol} contentContainerStyle={styles.landContentInner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        </View>
      );
    }
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Ionicons name="link-outline" size={40} color={accentColor} />
        <Text style={styles.stepTitle}>{t("onboarding", "voiceTitle")}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding", "voiceSubtitle")}</Text>
        {content}
      </ScrollView>
    );
  };

  const renderSoundTestStep = () => {
    const content = (
      <>
        <View style={[styles.demoSection, { paddingHorizontal: 20 }]}>
          <Ionicons name="musical-note-outline" size={isLandscape ? 36 : 48} color={accentColor} />
          <Pressable
            onPress={handlePlayTestSound}
            style={[
              styles.demoButton,
              { width: "80%", height: 52, marginTop: 8 },
              soundTestPlayed
                ? { backgroundColor: C.surfaceLight, borderWidth: 1, borderColor: accentColor }
                : { backgroundColor: accentColor },
            ]}
            testID="onboarding-sound-test-play"
          >
            <Ionicons
              name="volume-high-outline"
              size={20}
              color={soundTestPlayed ? accentColor : C.background}
            />
            <Text style={[styles.demoButtonText, { color: soundTestPlayed ? accentColor : C.background }]}>
              {t("onboarding", "soundTestPlay")}
            </Text>
          </Pressable>
          {soundTestPlayed && (
            <Text style={{ color: C.textSecondary, fontSize: 12, textAlign: "center", paddingHorizontal: 12, lineHeight: 18 }}>
              {t("onboarding", "soundTestMuteHint")}
            </Text>
          )}
        </View>
      </>
    );

    if (isLandscape) {
      return (
        <View style={styles.landRow}>
          {renderStepHeader(
            <Ionicons name="volume-high-outline" size={36} color={accentColor} />,
            "soundTestTitle", "soundTestSubtitle"
          )}
          <ScrollView style={styles.landContentCol} contentContainerStyle={styles.landContentInner} showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Ionicons name="volume-high-outline" size={40} color={accentColor} />
        <Text style={styles.stepTitle}>{t("onboarding", "soundTestTitle")}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding", "soundTestSubtitle")}</Text>
        {content}
      </ScrollView>
    );
  };

  const renderPermissionsStep = () => {
    const PermInfoRow = ({
      iconName,
      label,
      desc,
      granted,
    }: {
      iconName: string;
      label: string;
      desc: string;
      granted: boolean;
    }) => (
      <View style={[styles.infoCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
        <Ionicons name={iconName as any} size={24} color={accentColor} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.inputLabel, { marginBottom: 2 }]}>{label}</Text>
          <Text style={styles.modeOptionDesc}>{desc}</Text>
        </View>
        {granted && (
          <Ionicons name="checkmark-circle" size={22} color={accentColor} />
        )}
      </View>
    );

    const allGranted = permMicGranted && permLocationGranted;

    const content = (
      <>
        <PermInfoRow
          iconName="mic-outline"
          label={t("onboarding", "permMicLabel")}
          desc={t("onboarding", "permMicDesc")}
          granted={permMicGranted}
        />
        <PermInfoRow
          iconName="location-outline"
          label={t("onboarding", "permLocationLabel")}
          desc={t("onboarding", "permLocationDesc")}
          granted={permLocationGranted}
        />
        {!allGranted && (
          <Pressable
            onPress={handleAllowNow}
            testID="onboarding-perm-allow-now"
            style={[
              styles.demoButton,
              { width: "100%", height: 52, backgroundColor: accentColor, marginTop: 4 },
            ]}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={C.background} />
            <Text style={[styles.demoButtonText, { color: C.background }]}>
              {t("onboarding", "permAllowNow")}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleNext}
          testID="onboarding-perm-later"
          style={{ paddingVertical: 12, alignItems: "center" }}
        >
          <Text style={{ color: C.textTertiary, fontSize: 13, fontFamily: "SpaceGrotesk_400Regular" }}>
            {t("onboarding", "permLater")}
          </Text>
        </Pressable>
      </>
    );

    if (isLandscape) {
      return (
        <View style={styles.landRow}>
          {renderStepHeader(
            <Ionicons name="shield-checkmark-outline" size={36} color={accentColor} />,
            "permTitle", "permSubtitle"
          )}
          <ScrollView style={styles.landContentCol} contentContainerStyle={styles.landContentInner} showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Ionicons name="shield-checkmark-outline" size={40} color={accentColor} />
        <Text style={styles.stepTitle}>{t("onboarding", "permTitle")}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding", "permSubtitle")}</Text>
        {content}
      </ScrollView>
    );
  };

  const renderCurrentStep = () => {
    switch (step) {
      case 0:
        return renderLanguageStep();
      case 1:
        return renderVoiceStep();
      case 2:
        return renderThemeStep();
      case 3:
        return renderLoggingStep();
      case 4:
        return renderHapticStep();
      case 5:
        return renderFlashStep();
      case 6:
        return renderSoundTestStep();
      case 7:
        return renderPermissionsStep();
      case 8:
        return renderProfileStep();
      default:
        return null;
    }
  };

  return (
    <AnimatedModal visible={visible} transparent={false}>
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
        <View style={[styles.topBar, isLandscape && { paddingVertical: Spacing.xs }]}>
          {step > 0 ? (
            <Pressable onPress={handleBack} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={C.textSecondary} />
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

        {!isLandscape && (
          <View style={styles.bottomBar}>
            <Pressable
              style={[styles.nextButton, { backgroundColor: accentColor }]}
              onPress={handleNext}
            >
              <Text style={styles.nextButtonText}>
                {step === TOTAL_STEPS - 1 ? t("onboarding", "start") : t("onboarding", "next")}
              </Text>
              {step < TOTAL_STEPS - 1 && (
                <Ionicons name="arrow-forward" size={18} color={C.background} />
              )}
            </Pressable>
          </View>
        )}
      </View>
    </AnimatedModal>
  );
}

const make_demoStyles = (C: typeof Colors) => StyleSheet.create({
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
    fontSize: FontSize.micro,
    color: C.textSecondary,
  },
});

const make_styles = (C: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 60,
  },
  skipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.textSecondary,
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
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: Spacing.sm,
  },
  stepTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    color: C.text,
    marginTop: Spacing.xs,
  },
  stepSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  themeOption: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
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
    fontSize: FontSize.small,
    color: C.textSecondary,
  },
  infoCard: {
    width: "100%",
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  infoCardTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: C.text,
    marginBottom: Spacing.xxs,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  infoText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    flex: 1,
    lineHeight: 19,
  },
  bigToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    width: "100%",
    height: 48,
    borderRadius: 12,
    marginTop: Spacing.sm,
    marginBottom: 20,
  },
  bigToggleText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    color: C.text,
  },
  modeList: {
    width: "100%",
    gap: Spacing.sm,
  },
  modeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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
    borderColor: C.textTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: Radius.sm,
  },
  modeOptionLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: C.text,
  },
  modeOptionDesc: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.caption,
    color: C.textSecondary,
    marginTop: Spacing.xxs,
  },
  demoSection: {
    width: "100%",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.text,
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
    gap: Spacing.sm,
  },
  inputLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: C.text,
  },
  textInput: {
    width: "100%",
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
    color: C.text,
    backgroundColor: C.surface,
  },
  locationHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.xs,
  },
  locationHintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.small,
    color: C.textSecondary,
    flex: 1,
    lineHeight: 17,
  },
  landRow: {
    flex: 1,
    flexDirection: "row",
    gap: 20,
    paddingHorizontal: 20,
  },
  landHeaderCol: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  landContentCol: {
    flex: 1,
  },
  landContentInner: {
    gap: 10,
    paddingVertical: 6,
    paddingRight: Spacing.sm,
  },
  landStepTitle: {
    fontSize: 20,
    textAlign: "center",
  },
  landStepSubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  landNextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "85%",
    maxWidth: 220,
    height: 40,
    borderRadius: 12,
    marginTop: 14,
  },
  landNextButtonText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 15,
    color: C.white,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: 52,
    borderRadius: 14,
  },
  nextButtonText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: C.white,
  },
});

const make_cpStyles = (C: typeof Colors) => StyleSheet.create({
  container: {
    width: "100%",
    gap: 12,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  trackWrapper: {
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    justifyContent: "center",
    position: "relative",
  },
  track: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  thumb: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    left: "50%",
    marginLeft: -12,
  },
  hexRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  preview: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  hexInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.text,
    backgroundColor: C.surface,
  },
});

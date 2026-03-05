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
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { ACCENT_PRESETS } from "@/constants/colors";
import type { ThemeColor } from "@/constants/colors";
import type { FlashMode, HapticMode } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";

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

const THEME_OPTIONS: { key: ThemeColor; label: string; color: string }[] = [
  { key: "gold", label: "Gold", color: ACCENT_PRESETS.gold.accent },
  { key: "green", label: "Green", color: ACCENT_PRESETS.green.accent },
  { key: "orange", label: "Orange", color: ACCENT_PRESETS.orange.accent },
  { key: "blue", label: "Blue", color: ACCENT_PRESETS.blue.accent },
  { key: "rose", label: "Rose", color: ACCENT_PRESETS.rose.accent },
  { key: "neon", label: "Neon", color: ACCENT_PRESETS.neon.accent },
];

const TOTAL_STEPS = 5;

const DEMO_BEATS: { type: BeatType; label: string }[] = [
  { type: "strong", label: "Strong" },
  { type: "accent", label: "Accent" },
  { type: "normal", label: "Normal" },
  { type: "mute", label: "Mute" },
];

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
}: {
  activeBeat: number;
  accentColor: string;
}) {
  return (
    <View style={demoStyles.bar}>
      {DEMO_BEATS.map((beat, i) => {
        const isActive = activeBeat === i;
        const dotColor = beat.type === "mute" ? Colors.textTertiary : BEAT_COLORS[beat.type];
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
              {beat.label}
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

      const beatType = DEMO_BEATS[idx].type;
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
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);

  const [selectedTheme, setSelectedTheme] = useState<ThemeColor>("gold");
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [hapticMode, setHapticMode] = useState<HapticMode>("all");
  const [flashMode, setFlashMode] = useState<FlashMode>("accent");
  const [username, setUsername] = useState("");
  const [roomName, setRoomName] = useState("");

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
          toValue: direction * SCREEN_WIDTH,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -direction * SCREEN_WIDTH,
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
    [step, slideAnim]
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

  const renderThemeStep = () => (
    <View style={styles.stepContent}>
      <MaterialCommunityIcons name="palette-outline" size={40} color={accentColor} />
      <Text style={styles.stepTitle}>테마 색상</Text>
      <Text style={styles.stepSubtitle}>앱에서 사용할 색상을 선택하세요</Text>
      <View style={styles.themeGrid}>
        {THEME_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={[
              styles.themeOption,
              selectedTheme === opt.key && {
                borderColor: opt.color,
                borderWidth: 2,
              },
            ]}
            onPress={() => setSelectedTheme(opt.key)}
          >
            <View style={[styles.themeCircle, { backgroundColor: opt.color }]}>
              {selectedTheme === opt.key && (
                <Ionicons name="checkmark" size={20} color="#fff" />
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
    </View>
  );

  const renderLoggingStep = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.stepContent}
      showsVerticalScrollIndicator={false}
    >
      <Ionicons name="analytics-outline" size={40} color={accentColor} />
      <Text style={styles.stepTitle}>사용 로그 분석</Text>
      <Text style={styles.stepSubtitle}>연습 기록을 분석하여 실력 향상을 도와드립니다</Text>

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>왜 사용하나요?</Text>
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={18} color={accentColor} />
          <Text style={styles.infoText}>
            매일 얼마나 연습했는지 자동으로 기록합니다
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="musical-notes-outline" size={18} color={accentColor} />
          <Text style={styles.infoText}>
            비트모드와 바모드 사용 비율을 분석합니다
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={18} color={accentColor} />
          <Text style={styles.infoText}>
            연습실별 연습 시간을 추적할 수 있습니다
          </Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>어떻게 활용되나요?</Text>
        <View style={styles.infoRow}>
          <Ionicons name="bar-chart-outline" size={18} color={accentColor} />
          <Text style={styles.infoText}>
            Work Up 화면에서 주간·일간 연습 통계를 확인합니다
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="trophy-outline" size={18} color={accentColor} />
          <Text style={styles.infoText}>
            목표를 설정하고 달성률을 추적할 수 있습니다
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="share-social-outline" size={18} color={accentColor} />
          <Text style={styles.infoText}>
            연습 기록을 이미지로 캡처하여 공유할 수 있습니다
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="shield-checkmark-outline" size={18} color={accentColor} />
          <Text style={styles.infoText}>
            모든 데이터는 기기에만 저장되며 외부로 전송되지 않습니다
          </Text>
        </View>
      </View>

      <Pressable
        style={[
          styles.bigToggle,
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
          {loggingEnabled ? "사용함" : "사용 안 함"}
        </Text>
      </Pressable>
    </ScrollView>
  );

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

  const renderHapticStep = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.stepContent}
      showsVerticalScrollIndicator={false}
    >
      <Ionicons name="phone-portrait-outline" size={40} color={accentColor} />
      <Text style={styles.stepTitle}>햅틱 피드백</Text>
      <Text style={styles.stepSubtitle}>비트에 맞춰 진동으로 알려줍니다</Text>

      <View style={styles.modeList}>
        <ModeOption
          label="모든 비트"
          description="Strong, Accent, Normal 비트에 모두 진동"
          value="all"
          current={hapticMode}
          onSelect={() => setHapticMode("all")}
        />
        <ModeOption
          label="악센트만"
          description="Strong, Accent 비트에만 진동"
          value="accent"
          current={hapticMode}
          onSelect={() => setHapticMode("accent")}
        />
        <ModeOption
          label="끄기"
          description="진동 없이 소리와 시각으로만 확인"
          value="off"
          current={hapticMode}
          onSelect={() => setHapticMode("off")}
        />
      </View>

      <View style={styles.demoSection}>
        <DemoBar activeBeat={hapticDemo.activeBeat} accentColor={accentColor} />
        <Pressable
          style={[
            styles.demoButton,
            hapticDemo.playing
              ? { backgroundColor: Colors.surfaceLight, borderColor: accentColor, borderWidth: 1 }
              : { backgroundColor: accentColor },
          ]}
          onPress={hapticDemo.toggle}
        >
          <Ionicons
            name={hapticDemo.playing ? "stop" : "play"}
            size={16}
            color={hapticDemo.playing ? accentColor : Colors.background}
          />
          <Text
            style={[
              styles.demoButtonText,
              { color: hapticDemo.playing ? accentColor : Colors.background },
            ]}
          >
            {hapticDemo.playing ? "정지" : "미리보기"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );

  const renderFlashStep = () => (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.stepContent}
        showsVerticalScrollIndicator={false}
      >
        <Ionicons name="flash-outline" size={40} color={accentColor} />
        <Text style={styles.stepTitle}>화면 플래시</Text>
        <Text style={styles.stepSubtitle}>비트에 맞춰 화면이 깜빡입니다</Text>

        <View style={styles.modeList}>
          <ModeOption
            label="모든 비트"
            description="Strong, Accent, Normal 비트에 모두 플래시"
            value="all"
            current={flashMode}
            onSelect={() => setFlashMode("all")}
          />
          <ModeOption
            label="악센트만"
            description="Strong, Accent 비트에만 플래시"
            value="accent"
            current={flashMode}
            onSelect={() => setFlashMode("accent")}
          />
          <ModeOption
            label="끄기"
            description="플래시 없이 소리와 진동으로만 확인"
            value="off"
            current={flashMode}
            onSelect={() => setFlashMode("off")}
          />
        </View>

        <View style={styles.demoSection}>
          <DemoBar activeBeat={flashDemo.activeBeat} accentColor={accentColor} />
          <Pressable
            style={[
              styles.demoButton,
              flashDemo.playing
                ? { backgroundColor: Colors.surfaceLight, borderColor: accentColor, borderWidth: 1 }
                : { backgroundColor: accentColor },
            ]}
            onPress={flashDemo.toggle}
          >
            <Ionicons
              name={flashDemo.playing ? "stop" : "play"}
              size={16}
              color={flashDemo.playing ? accentColor : Colors.background}
            />
            <Text
              style={[
                styles.demoButtonText,
                { color: flashDemo.playing ? accentColor : Colors.background },
              ]}
            >
              {flashDemo.playing ? "정지" : "미리보기"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.flashOverlay,
          { backgroundColor: accentColor, opacity: flashFlashAnim },
        ]}
      />
    </View>
  );

  const renderProfileStep = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.stepContent}
      keyboardShouldPersistTaps="handled"
    >
      <Ionicons name="person-circle-outline" size={40} color={accentColor} />
      <Text style={styles.stepTitle}>프로필 설정</Text>
      <Text style={styles.stepSubtitle}>닉네임과 연습실을 설정하세요</Text>
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>닉네임</Text>
        <TextInput
          style={[styles.textInput, { borderColor: accentColor }]}
          value={username}
          onChangeText={setUsername}
          placeholder="닉네임을 입력하세요"
          placeholderTextColor={Colors.textTertiary}
          maxLength={20}
        />
      </View>
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>연습실 이름</Text>
        <TextInput
          style={[styles.textInput, { borderColor: accentColor }]}
          value={roomName}
          onChangeText={setRoomName}
          placeholder="연습실 이름 (예: 우리집)"
          placeholderTextColor={Colors.textTertiary}
          maxLength={30}
        />
        <View style={styles.locationHint}>
          <Ionicons name="location" size={14} color={accentColor} />
          <Text style={styles.locationHintText}>
            이름 입력 시 현재 위치가 자동으로 연습실로 등록됩니다
          </Text>
        </View>
      </View>
    </ScrollView>
  );

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
            paddingTop: (insets.top || webTopInset) + 12,
            paddingBottom: (insets.bottom || webBottomInset) + 12,
          },
        ]}
      >
        <View style={styles.topBar}>
          {step > 0 ? (
            <Pressable onPress={handleBack} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
            </Pressable>
          ) : (
            <View style={styles.backBtn} />
          )}
          {renderStepIndicator()}
          <Pressable onPress={handleSkip} hitSlop={10}>
            <Text style={styles.skipText}>건너뛰기</Text>
          </Pressable>
        </View>

        <Animated.View
          style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}
        >
          {renderCurrentStep()}
        </Animated.View>

        <View style={styles.bottomBar}>
          <Pressable
            style={[styles.nextButton, { backgroundColor: accentColor }]}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>
              {step === TOTAL_STEPS - 1 ? "시작하기" : "다음"}
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

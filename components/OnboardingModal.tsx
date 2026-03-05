import React, { useState, useRef, useCallback } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { ACCENT_PRESETS } from "@/constants/colors";
import type { ThemeColor } from "@/constants/colors";
import type { FlashMode, HapticMode } from "@/lib/storage";

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
];

const TOTAL_STEPS = 3;

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

  const animateToStep = useCallback((nextStep: number) => {
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
  }, [step, slideAnim]);

  const handleNext = useCallback(() => {
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
  }, [step, selectedTheme, loggingEnabled, hapticMode, flashMode, username, roomName, onComplete, animateToStep]);

  const handleSkip = useCallback(() => {
    onComplete({
      themeColor: selectedTheme,
      loggingEnabled,
      hapticMode,
      flashMode,
      username: username.trim(),
      practiceRoomName: roomName.trim(),
    });
  }, [selectedTheme, loggingEnabled, hapticMode, flashMode, username, roomName, onComplete]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      animateToStep(step - 1);
    }
  }, [step, animateToStep]);

  const accentColor = ACCENT_PRESETS[selectedTheme === "custom" ? "gold" : selectedTheme]?.accent || ACCENT_PRESETS.gold.accent;

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
            <Text style={[styles.themeLabel, selectedTheme === opt.key && { color: opt.color }]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const ToggleRow = ({
    icon,
    iconLib,
    label,
    description,
    value,
    onToggle,
  }: {
    icon: string;
    iconLib?: "ion" | "mci";
    label: string;
    description: string;
    value: boolean;
    onToggle: () => void;
  }) => (
    <Pressable style={styles.toggleRow} onPress={onToggle}>
      <View style={styles.toggleLeft}>
        {iconLib === "mci" ? (
          <MaterialCommunityIcons name={icon as any} size={22} color={accentColor} />
        ) : (
          <Ionicons name={icon as any} size={22} color={accentColor} />
        )}
        <View style={styles.toggleTextGroup}>
          <Text style={styles.toggleLabel}>{label}</Text>
          <Text style={styles.toggleDesc}>{description}</Text>
        </View>
      </View>
      <View
        style={[
          styles.toggleSwitch,
          value
            ? { backgroundColor: accentColor }
            : { backgroundColor: Colors.textTertiary },
        ]}
      >
        <Animated.View
          style={[
            styles.toggleKnob,
            { transform: [{ translateX: value ? 18 : 2 }] },
          ]}
        />
      </View>
    </Pressable>
  );

  const renderFeatureStep = () => (
    <View style={styles.stepContent}>
      <Ionicons name="settings-outline" size={40} color={accentColor} />
      <Text style={styles.stepTitle}>기능 설정</Text>
      <Text style={styles.stepSubtitle}>사용할 기능을 설정하세요</Text>
      <View style={styles.toggleList}>
        <ToggleRow
          icon="analytics-outline"
          label="사용 로그 분석"
          description="연습 시간과 패턴을 기록합니다"
          value={loggingEnabled}
          onToggle={() => setLoggingEnabled(!loggingEnabled)}
        />
        <ToggleRow
          icon="phone-portrait-outline"
          label="햅틱 피드백"
          description="비트에 맞춰 진동으로 알려줍니다"
          value={hapticMode !== "off"}
          onToggle={() => setHapticMode(hapticMode === "off" ? "all" : "off")}
        />
        <ToggleRow
          icon="flash-outline"
          label="화면 플래시"
          description="비트에 맞춰 화면이 깜빡입니다"
          value={flashMode !== "off"}
          onToggle={() => setFlashMode(flashMode === "off" ? "accent" : "off")}
        />
      </View>
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
        <Text style={styles.inputHint}>
          현재 위치가 연습실로 등록됩니다. 나중에 설정에서 변경할 수 있습니다.
        </Text>
      </View>
    </ScrollView>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 0:
        return renderThemeStep();
      case 1:
        return renderFeatureStep();
      case 2:
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
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 40,
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
    marginBottom: 20,
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
  toggleList: {
    width: "100%",
    gap: 4,
  },
  toggleRow: {
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
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  toggleTextGroup: {
    flex: 1,
  },
  toggleLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  toggleDesc: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  toggleSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
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
  inputHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    lineHeight: 16,
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

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { detectDeviceLanguage } from "@/lib/i18n";

export type PreparationStage =
  | "fonts"
  | "icons"
  | "audio"
  | "settings"
  | "error";

type PreparationLanguage = "ko" | "en";

export interface AppPreparationScreenProps {
  stage: PreparationStage;
  error?: string | null;
  onRetry?: () => void;
  onContinue?: () => void;
  language?: PreparationLanguage;
  testID?: string;
}

const DOT_COUNT = 16;
const ORBIT_SIZE = 188;
const DOT_SIZE = 10;
const ROTATION_MS = 2800;
const REDUCED_MOTION_STEP_MS = 900;

const copy = {
  ko: {
    title: "준비 중",
    subtitle: "메트로놈을 준비하고 있습니다",
    fonts: "폰트 준비 중",
    icons: "아이콘 준비 중",
    audio: "오디오 준비 중",
    settings: "저장된 설정 불러오는 중",
    errorTitle: "준비 중 문제가 발생했습니다",
    errorBody: "다시 시도하거나 기본 설정으로 계속할 수 있습니다.",
    retry: "다시 시도",
    continue: "계속 진행",
    trailLabel: (count: number) => `준비 애니메이션, 현재 박자 점 ${count}개`,
  },
  en: {
    title: "Getting ready",
    subtitle: "Preparing your metronome",
    fonts: "Preparing fonts",
    icons: "Preparing icons",
    audio: "Preparing audio",
    settings: "Loading saved settings",
    errorTitle: "We couldn't finish preparing the app",
    errorBody: "Try again, or continue with the default settings.",
    retry: "Try again",
    continue: "Continue",
    trailLabel: (count: number) => `Preparation animation, ${count} beat dots`,
  },
} as const;

function stageLabel(stage: PreparationStage, language: PreparationLanguage): string {
  const labels = copy[language];
  if (stage === "error") return labels.errorTitle;
  return labels[stage];
}

/**
 * The first visible surface while app resources are being prepared.
 *
 * The orbit intentionally does not represent a percentage. Its trail grows
 * from one dot to sixteen dots over complete clockwise rotations, then starts
 * over, which makes the state feel rhythmic without claiming a false ETA.
 */
export function AppPreparationScreen({
  stage,
  error,
  onRetry,
  onContinue,
  language = detectDeviceLanguage(),
  testID = "preparation-screen",
}: AppPreparationScreenProps) {
  const reduceMotion = useReducedMotion();
  const [dotCount, setDotCount] = useState(1);
  const rotation = useRef(new Animated.Value(0)).current;
  const labels = copy[language];

  useEffect(() => {
    rotation.stopAnimation();
    rotation.setValue(0);
    setDotCount(1);

    if (stage === "error") return;

    if (reduceMotion) {
      const timer = setInterval(() => {
        setDotCount((current) => (current >= DOT_COUNT ? 1 : current + 1));
      }, REDUCED_MOTION_STEP_MS);
      return () => clearInterval(timer);
    }

    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: ROTATION_MS,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    animation.start();
    const timer = setInterval(() => {
      setDotCount((current) => (current >= DOT_COUNT ? 1 : current + 1));
    }, ROTATION_MS);

    return () => {
      animation.stop();
      clearInterval(timer);
    };
  }, [reduceMotion, rotation, stage]);

  const dots = useMemo(
    () =>
      Array.from({ length: DOT_COUNT }, (_, index) => {
        const angle = (index / DOT_COUNT) * Math.PI * 2 - Math.PI / 2;
        const radius = ORBIT_SIZE / 2 - DOT_SIZE / 2;
        return {
          index,
          left: ORBIT_SIZE / 2 + Math.cos(angle) * radius - DOT_SIZE / 2,
          top: ORBIT_SIZE / 2 + Math.sin(angle) * radius - DOT_SIZE / 2,
        };
      }),
    [],
  );

  const orbitStyle = {
    transform: [
      {
        rotate: rotation.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", "360deg"],
        }),
      },
    ],
  };

  const isError = stage === "error";

  return (
    <View style={styles.screen} testID={testID} accessibilityRole="progressbar">
      <View style={styles.content}>
        <Text style={styles.brand}>PULPOR</Text>
        <Text style={styles.title}>{isError ? labels.errorTitle : labels.title}</Text>
        <Text style={styles.subtitle}>
          {isError ? labels.errorBody : labels.subtitle}
        </Text>

        <View
          style={styles.orbit}
          testID={`${testID}-trail`}
          accessibilityLabel={labels.trailLabel(dotCount)}
        >
          <Animated.View style={[styles.orbitLayer, orbitStyle]}>
            {dots.map((dot) => (
              <View
                key={dot.index}
                testID={`${testID}-dot-${dot.index + 1}`}
                style={[
                  styles.dot,
                  { left: dot.left, top: dot.top },
                  dot.index < dotCount ? styles.dotVisible : styles.dotHidden,
                  dot.index === dotCount - 1 && styles.dotHead,
                ]}
              />
            ))}
          </Animated.View>
          <View style={styles.orbitCenter} />
        </View>

        <Text style={styles.stage} testID={`${testID}-stage`}>
          {isError ? error || labels.errorTitle : stageLabel(stage, language)}
        </Text>

        {isError && (
          <View style={styles.actions}>
            {onRetry && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labels.retry}
                onPress={onRetry}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>{labels.retry}</Text>
              </Pressable>
            )}
            {onContinue && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labels.continue}
                onPress={onContinue}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryButtonText}>{labels.continue}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D1117",
    paddingHorizontal: 24,
  },
  content: {
    alignItems: "center",
    width: "100%",
    maxWidth: 420,
  },
  brand: {
    color: "#D4A846",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 24,
  },
  title: {
    color: "#F0F6FC",
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  subtitle: {
    color: "#8B949E",
    fontSize: 15,
    marginTop: 8,
    textAlign: "center",
  },
  orbit: {
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    marginVertical: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  orbitLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  dot: {
    position: "absolute",
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: "#D4A846",
  },
  dotVisible: {
    opacity: 0.72,
  },
  dotHidden: {
    opacity: 0,
  },
  dotHead: {
    opacity: 1,
    transform: [{ scale: 1.35 }],
  },
  orbitCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(212, 168, 70, 0.35)",
  },
  stage: {
    color: "#8B949E",
    fontSize: 13,
    textAlign: "center",
    minHeight: 20,
  },
  actions: {
    width: "100%",
    marginTop: 24,
    gap: 10,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D4A846",
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: "#0D1117",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#30363D",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: "#F0F6FC",
    fontSize: 15,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.72,
  },
});

export default AppPreparationScreen;
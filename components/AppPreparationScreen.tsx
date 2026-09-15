import React, { useEffect, useRef } from "react";
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

const LOGO_PULSE_MS = 900;

const copy = {
  ko: {
    status: "준비 중…",
    errorTitle: "준비 중 문제가 발생했습니다",
    errorBody: "다시 시도하거나 기본 설정으로 계속할 수 있습니다.",
    retry: "다시 시도",
    continue: "계속 진행",
  },
  en: {
    status: "Getting ready…",
    errorTitle: "We couldn't finish preparing the app",
    errorBody: "Try again, or continue with the default settings.",
    retry: "Try again",
    continue: "Continue",
  },
} as const;

/**
 * The first visible surface while app resources are being prepared. The normal
 * state stays intentionally quiet: the logo carries the animation and the
 * status line only confirms that preparation is still in progress.
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
  const logoScale = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const labels = copy[language];
  const isError = stage === "error";

  useEffect(() => {
    logoScale.stopAnimation();
    logoOpacity.stopAnimation();
    logoScale.setValue(1);
    logoOpacity.setValue(1);

    if (isError || reduceMotion) return;

    const useNativeDriver = Platform.OS !== "web";
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(logoScale, {
            toValue: 1.045,
            duration: LOGO_PULSE_MS / 2,
            easing: Easing.out(Easing.quad),
            useNativeDriver,
          }),
          Animated.timing(logoOpacity, {
            toValue: 0.82,
            duration: LOGO_PULSE_MS / 2,
            easing: Easing.out(Easing.quad),
            useNativeDriver,
          }),
        ]),
        Animated.parallel([
          Animated.timing(logoScale, {
            toValue: 1,
            duration: LOGO_PULSE_MS / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver,
          }),
          Animated.timing(logoOpacity, {
            toValue: 1,
            duration: LOGO_PULSE_MS / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver,
          }),
        ]),
      ]),
    );
    animation.start();

    return () => {
      animation.stop();
      logoScale.stopAnimation();
      logoOpacity.stopAnimation();
    };
  }, [isError, logoOpacity, logoScale, reduceMotion]);

  return (
    <View
      style={styles.screen}
      testID={testID}
      accessibilityRole={isError ? undefined : "progressbar"}
      accessibilityLabel={isError ? labels.errorTitle : labels.status}
    >
      <View style={styles.content}>
        <Animated.Text
          testID={`${testID}-logo`}
          accessibilityRole="image"
          accessibilityLabel="PULPOR"
          style={[
            styles.brand,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          PULPOR
        </Animated.Text>

        {isError ? (
          <>
            <Text style={styles.errorTitle}>{labels.errorTitle}</Text>
            <Text style={styles.errorBody}>{labels.errorBody}</Text>
            {error ? <Text style={styles.errorDetail}>{error}</Text> : null}
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
          </>
        ) : (
          <Text style={styles.status} testID={`${testID}-status`}>
            {labels.status}
          </Text>
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
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 6,
    textAlign: "center",
  },
  status: {
    color: "#8B949E",
    fontSize: 14,
    marginTop: 20,
    textAlign: "center",
  },
  errorTitle: {
    color: "#F0F6FC",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 28,
    textAlign: "center",
  },
  errorBody: {
    color: "#8B949E",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  errorDetail: {
    color: "#484F58",
    fontSize: 11,
    marginTop: 12,
    maxWidth: 360,
    textAlign: "center",
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
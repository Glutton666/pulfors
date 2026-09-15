import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Asset } from "expo-asset";
import { Image as ExpoImage } from "expo-image";
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

const APP_ICON = require("../assets/images/icon.png");

function resolveWebAssetUrl(src: number): string {
  const asset = Asset.fromModule(src);
  if (asset.uri) return asset.uri;

  const metadata = asset as typeof asset & {
    httpServerLocation?: string;
    name?: string;
    type?: string;
  };
  if (!metadata.httpServerLocation || !metadata.name || !metadata.type) {
    return "";
  }

  const relativePath = `${metadata.httpServerLocation.replace(/^\//, "")}/${metadata.name}.${metadata.type}`;
  return `/assets?unstable_path=${encodeURIComponent(relativePath)}`;
}

const APP_ICON_URI = resolveWebAssetUrl(APP_ICON);
const APP_ICON_SOURCE =
  Platform.OS === "web" && APP_ICON_URI ? { uri: APP_ICON_URI } : APP_ICON;
const MIN_ICON_SIZE = 120;
const MAX_ICON_SIZE = 240;

const copy = {
  ko: {
    stages: {
      fonts: "폰트 준비 중",
      icons: "아이콘 준비 중",
      audio: "오디오 준비 중",
      settings: "저장된 설정 불러오는 중",
    },
    errorTitle: "준비 중 문제가 발생했습니다",
    errorBody: "다시 시도하거나 기본 설정으로 계속할 수 있습니다.",
    retry: "다시 시도",
    continue: "계속 진행",
  },
  en: {
    stages: {
      fonts: "Preparing fonts",
      icons: "Preparing icons",
      audio: "Preparing audio",
      settings: "Loading saved settings",
    },
    errorTitle: "We couldn't finish preparing the app",
    errorBody: "Try again, or continue with the default settings.",
    retry: "Try again",
    continue: "Continue",
  },
} as const;

/**
 * The first visible surface while app resources are being prepared. The icon
 * stays centered while the resource currently being prepared is reported.
 * The bottom status reports the resource currently being prepared.
 */
export function AppPreparationScreen({
  stage,
  error,
  onRetry,
  onContinue,
  language = detectDeviceLanguage(),
  testID = "preparation-screen",
}: AppPreparationScreenProps) {
  const { width, height } = useWindowDimensions();
  const labels = copy[language];
  const isError = stage === "error";
  const iconSize = Math.max(
    MIN_ICON_SIZE,
    Math.min(MAX_ICON_SIZE, width * 0.56, height * 0.48),
  );
  const currentStatus = isError ? null : labels.stages[stage];
  return (
    <View
      style={styles.screen}
      testID={testID}
      accessibilityRole={isError ? undefined : "progressbar"}
      accessibilityLabel={isError ? labels.errorTitle : currentStatus ?? ""}
    >
      <View style={styles.content}>
        <View
          style={[styles.iconFrame, { width: iconSize, height: iconSize }]}
          testID={`${testID}-icon`}
        >
          <ExpoImage
            source={APP_ICON_SOURCE}
            style={styles.icon}
            contentFit="cover"
            accessibilityRole="image"
            accessibilityLabel="PULPOR app icon"
          />

        </View>

        {isError ? (
          <View style={styles.errorContent}>
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
          </View>
        ) : (
          <View
            style={styles.statusArea}
            pointerEvents="none"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.status} testID={`${testID}-status`}>
              {currentStatus}
            </Text>
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
    backgroundColor: "#05070B",
    paddingHorizontal: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 420,
  },
  iconFrame: {
    overflow: "hidden",
    backgroundColor: "#05070B",
  },
  icon: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  statusArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? 34 : 24,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  status: {
    color: "#8B949E",
    fontSize: 13,
    textAlign: "center",
  },
  errorContent: {
    alignItems: "center",
    width: "100%",
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
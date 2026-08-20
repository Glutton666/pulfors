import React, { useState } from "react";
import { reloadAppAsync } from "expo";
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  Text,
  Modal,
  useColorScheme,
  Platform,
} from "react-native";
import { logger } from "@/lib/logger";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useThemeSafe } from "@/contexts/ThemeContext";
import { Radius, FontSize } from "@/constants/tokens";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createT, detectDeviceLanguage, isLanguageCode, type Language } from "@/lib/i18n";
import { router } from "expo-router";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const appTheme = useThemeSafe();
  const systemColorScheme = useColorScheme();
  // 앱 테마가 마운트되어 있으면 그것을 우선 사용. 그렇지 않으면 시스템 테마.
  // (ErrorBoundary가 ThemeProvider 바깥에 위치하거나, ThemeProvider 자체에서
  // 에러가 났을 때 fallback)
  const isDark = appTheme
    ? appTheme.themeMode === "night"
    : systemColorScheme === "dark";
  const insets = useSafeAreaInsets();
  // ErrorBoundary는 LanguageProvider 바깥에 있으므로 컨텍스트 대신
  // 저장된 언어를 직접 읽고, 실패하면 기기 언어를 사용한다.
  const [language, setLanguage] = useState<Language>(() => detectDeviceLanguage());
  const t = createT(language);

  const theme = {
    background: isDark ? "#000000" : "#FFFFFF",
    backgroundSecondary: isDark ? "#1C1C1E" : "#F2F2F7",
    text: isDark ? "#FFFFFF" : "#000000",
    textSecondary: isDark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)",
    link: "#007AFF",
    buttonText: "#FFFFFF",
  };

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  React.useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem("metronome_language")
      .then((saved) => {
        if (mounted && isLanguageCode(saved)) setLanguage(saved);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleRestart = async () => {
    if (isRestarting) return;
    setIsRestarting(true);
    try {
      await reloadAppAsync();
    } catch (restartError) {
      logger.error("Failed to restart app:", restartError);
      setIsRestarting(false);
      resetError();
    }
  };

  const handleGoHome = () => {
    resetError();
    // reset 뒤 라우터가 다시 마운트된 다음 기본 경로로 이동한다.
    setTimeout(() => {
      try {
        router.replace("/");
      } catch (navigationError) {
        logger.warn("Failed to return home after an error:", navigationError);
      }
    }, 0);
  };

  const formatErrorDetails = (): string => {
    let details = `Error: ${error.message}\n\n`;
    if (error.stack) {
      details += `Stack Trace:\n${error.stack}`;
    }
    return details;
  };

  const monoFont = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {__DEV__ ? (
        <Pressable
          onPress={() => setIsModalVisible(true)}
          accessibilityLabel={t("errorFallback", "details")}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.topButton,
            {
              top: insets.top + 16,
              backgroundColor: theme.backgroundSecondary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="alert-circle" size={20} color={theme.text} />
        </Pressable>
      ) : null}

      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>
          {t("errorFallback", "title")}
        </Text>

        <Text style={[styles.message, { color: theme.textSecondary }]}>
          {t("errorFallback", "message")}
        </Text>
        <Text style={[styles.dataSafety, { color: theme.textSecondary }]}>
          {t("errorFallback", "dataSafe")}
        </Text>

        <Pressable
          onPress={handleRestart}
          accessibilityRole="button"
          accessibilityLabel={t("errorFallback", "retry")}
          accessibilityHint={t("errorFallback", "retryHint")}
          accessibilityState={{ busy: isRestarting, disabled: isRestarting }}
          testID="error-fallback-retry"
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.link,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.buttonText }]}>
            {isRestarting ? t("errorFallback", "retrying") : t("errorFallback", "retry")}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleGoHome}
          accessibilityRole="button"
          accessibilityLabel={t("errorFallback", "home")}
          accessibilityHint={t("errorFallback", "homeHint")}
          testID="error-fallback-home"
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor: theme.link, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.link }]}>
            {t("errorFallback", "home")}
          </Text>
        </Pressable>
      </View>

      {__DEV__ ? (
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContainer,
                { backgroundColor: theme.background },
              ]}
            >
              <View
                style={[
                  styles.modalHeader,
                  {
                    borderBottomColor: isDark
                      ? "rgba(255, 255, 255, 0.1)"
                      : "rgba(0, 0, 0, 0.1)",
                  },
                ]}
              >
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {t("errorFallback", "details")}
                </Text>
                <Pressable
                  onPress={() => setIsModalVisible(false)}
                  accessibilityLabel={t("errorFallback", "closeDetails")}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.closeButton,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Feather name="x" size={24} color={theme.text} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={[
                  styles.modalScrollContent,
                  { paddingBottom: insets.bottom + 16 },
                ]}
                showsVerticalScrollIndicator
              >
                <View
                  style={[
                    styles.errorContainer,
                    { backgroundColor: theme.backgroundSecondary },
                  ]}
                >
                  <Text
                    style={[
                      styles.errorText,
                      {
                        color: theme.text,
                        fontFamily: monoFont,
                      },
                    ]}
                    selectable
                  >
                    {formatErrorDetails()}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
    maxWidth: 600,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 40,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  dataSafety: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 520,
  },
  topButton: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  button: {
    paddingVertical: 16,
    borderRadius: Radius.md,
    paddingHorizontal: 24,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontWeight: "600",
    textAlign: "center",
    fontSize: 16,
  },
  secondaryButton: {
    minWidth: 200,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontWeight: "600",
    textAlign: "center",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    height: "90%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
  },
  errorContainer: {
    width: "100%",
    borderRadius: Radius.md,
    overflow: "hidden",
    padding: 16,
  },
  errorText: {
    fontSize: FontSize.small,
    lineHeight: 18,
    width: "100%",
  },
});

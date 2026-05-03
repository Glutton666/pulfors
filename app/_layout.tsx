import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated";
import { logger } from "@/lib/logger";

import * as Font from "expo-font";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { initErrorTracking } from "@/lib/error-tracking";
import { StorageErrorAlert } from "@/components/StorageErrorAlert";

import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";

import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";

// Reanimated Logger 설정 (한 번만 실행)
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  // 아이콘 폰트 로드 (useFonts와 함께 최적화)
  const loadIconFonts = useCallback(async () => {
    try {
      const iconFonts = {
        ...Ionicons.font,
        ...Feather.font,
        ...MaterialCommunityIcons.font,
      };
      await Font.loadAsync(iconFonts); // ← Font import 추가 필요
    } catch (e) {
      logger.warn("Icon font loading error:", e);
    }
  }, []);

  // Audio 설정 (expo-audio 최신 방식)
  const configureAudio = useCallback(async () => {
    if (Platform.OS === "web") return;

    try {
      const { AudioModule } = await import("expo-audio");
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "mixWithOthers",
        shouldPlayInBackground: true,
      });
    } catch (e) {
      logger.warn("Audio configuration failed:", e);
    }
  }, []);

  // 앱 시작 시 에러 트래킹 초기화 (DSN이 없으면 console-only 모드로 동작)
  useEffect(() => {
    initErrorTracking();
  }, []);

  // 앱 준비 완료 체크
  useEffect(() => {
    const prepareApp = async () => {
      try {
        await Promise.all([
          fontsLoaded ? Promise.resolve() : Promise.reject(),
          loadIconFonts(),
          configureAudio(),
        ]);
      } catch (e) {
        logger.warn("App preparation error:", e);
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    };

    if (fontsLoaded) {
      prepareApp();
    }
  }, [fontsLoaded, loadIconFonts, configureAudio]);

  if (!appIsReady) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LanguageProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <StorageErrorAlert />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="practice" />
                </Stack>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

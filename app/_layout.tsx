import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState, useCallback } from "react";
import { AppState, Platform } from "react-native";
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
import { VoiceAssistantProvider } from "@/contexts/VoiceAssistantContext";
import { initErrorTracking } from "@/lib/error-tracking";
import { StorageErrorAlert } from "@/components/StorageErrorAlert";
import { rollbackPendingRestoreIfAny } from "@/lib/backup/full";
import { notifyInterruptionBegin, notifyInterruptionEnd } from "@/lib/audio-session";

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
    // 이전 백업 복원이 강제 종료/오류로 끊긴 경우 자동 롤백.
    // 폰트 로딩과 병렬로 돌아 사용자에게 보이지 않게 동작한다.
    rollbackPendingRestoreIfAny().catch((e) => {
      logger.warn("Pending restore rollback failed:", e);
    });
  }, []);

  // 외부 OS 오디오 인터럽션(전화 수신, Siri, 알람, 다른 앱의 미디어 재생 등)
  // 처리. expo-audio가 JS 레벨 인터럽션 콜백을 노출하지 않으므로 AppState를
  // 신호원으로 사용한다.
  //
  // iOS (UIBackgroundModes에 "audio" 등록 → shouldPlayInBackground 실제 동작):
  //   - 인터럽션이 들어오면 시스템이 'inactive' 상태로 전이시킨다.
  //   - 'background'는 사용자가 의도적으로 백그라운드로 보낸 것이고 메트로놈은
  //     계속 재생되어야 하므로 건드리지 않는다.
  //   → 'inactive' = 인터럽션 시작, 'active' 복귀 = 인터럽션 종료.
  //
  // Android (foreground service 미구성 → 백그라운드 시 OS가 오디오를 강제
  // 중단):
  //   - 'inactive'는 거의 발생하지 않고, 인터럽션은 보통 'background'로 나타
  //     난다. 사용자 의도(잠금)와 OS 인터럽션(전화)을 구분할 수 없으므로
  //     일단 모든 'background' 진입을 인터럽션으로 간주한다 (어차피 오디오는
  //     멈춘다). 'active'로 돌아오면 사용자 의도가 아니었던 한 자동 재개한다.
  //   → 'background'·'inactive' = 인터럽션 시작, 'active' 복귀 = 인터럽션 종료.
  //
  // Android focus listener를 직접 구독하는 것이 정공법이지만 Expo Go에서는
  // expo-audio가 해당 콜백을 노출하지 않아 AppState로 근사한다.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const interruptStates: ReadonlyArray<string> =
      Platform.OS === "android" ? ["background", "inactive"] : ["inactive"];
    const sub = AppState.addEventListener("change", (next) => {
      if (interruptStates.includes(next)) {
        notifyInterruptionBegin();
      } else if (next === "active") {
        notifyInterruptionEnd();
      }
    });
    return () => sub.remove();
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
            <VoiceAssistantProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <StorageErrorAlert />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="practice" />
                  </Stack>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </VoiceAssistantProvider>
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

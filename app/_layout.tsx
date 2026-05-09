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
import { DeepLinkProvider } from "@/contexts/DeepLinkContext";
import { initErrorTracking } from "@/lib/error-tracking";
import { StorageErrorAlert } from "@/components/StorageErrorAlert";
import { rollbackPendingRestoreIfAny } from "@/lib/backup/full";
import {
  notifyInterruptionBegin,
  notifyInterruptionEnd,
  registerAndroidFocusProbeController,
} from "@/lib/audio-session";
import {
  initAndroidFocusCallbacks,
  startAndroidFocusProbe,
  stopAndroidFocusProbe,
} from "@/lib/android-audio-focus";

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

  // ── Android: expo-av 프로브 기반 오디오 포커스 모니터 ────────────────────────
  // Android는 AppState 'inactive'가 거의 발생하지 않아 전화 수신 같은 포그라운드
  // 인터럽션을 AppState만으로 감지할 수 없다.
  //
  // 구조:
  // 1. initAndroidFocusCallbacks — 인터럽션 콜백만 등록, 사운드 없음.
  // 2. registerAndroidFocusProbeController — 메트로놈이 실제로 재생을 시작/정지할
  //    때 audio-session.ts 가 start/stop 을 호출하도록 컨트롤러를 주입한다.
  //    프로브는 메트로놈이 실행 중일 때만 오디오 포커스를 점유한다.
  //
  // notifyInterruptionBegin / notifyInterruptionEnd 는 멱등하므로 아래 AppState
  // 백업과 중복 호출돼도 안전하다.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    initAndroidFocusCallbacks(notifyInterruptionBegin, notifyInterruptionEnd);
    registerAndroidFocusProbeController({
      start: () => { void startAndroidFocusProbe(); },
      stop: () => { void stopAndroidFocusProbe(); },
    });
    return () => {
      registerAndroidFocusProbeController(null);
      void stopAndroidFocusProbe();
    };
  }, []);

  // ── AppState 기반 인터럽션 감지 (iOS 주 경로, Android 백업) ─────────────────
  // iOS: 전화/Siri/알람 수신 시 시스템이 'inactive' 로 전이 → 인터럽션 시작.
  //      'background'는 사용자가 의도적으로 홈 버튼을 누른 것이며 메트로놈은
  //      백그라운드에서도 계속 재생되어야 하므로 건드리지 않는다.
  //   → 'inactive' = 인터럽션 시작, 'active' 복귀 = 인터럽션 종료.
  //
  // Android: 포그라운드 인터럽션(전화 수신 등)은 위 expo-av 프로브가 주로
  //          처리한다. 홈 버튼·화면 잠금은 사용자가 의도적으로 전환한 것이므로
  //          'background' 전환을 인터럽션으로 처리하지 않는다 (iOS 와 동일).
  //          foreground service 권한(FOREGROUND_SERVICE_MEDIA_PLAYBACK)이
  //          app.json 에 선언되어 있어 실제 빌드에서 백그라운드 오디오가 유지된다.
  //          notifyInterruptionBegin/End 가 멱등하므로 프로브와 중복 신호가
  //          발생해도 안전하다.
  //   → 'inactive' = 인터럽션 시작, 'active' 복귀 = 인터럽션 종료 (iOS/Android 동일).
  useEffect(() => {
    if (Platform.OS === "web") return;
    const interruptStates: ReadonlyArray<string> = ["inactive"];
    const sub = AppState.addEventListener("change", (next) => {
      logger.info(`[appState] → ${next} (interruption states: ${interruptStates.join(",")})`);
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
            <DeepLinkProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <StorageErrorAlert />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="practice" />
                  </Stack>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </DeepLinkProvider>
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

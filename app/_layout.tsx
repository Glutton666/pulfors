import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { setAudioModeAsync } from "expo-audio";
import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";

SplashScreen.preventAutoHideAsync();
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="practice" />
    </Stack>
  );
}

export default function RootLayout() {
  const [audioReady, setAudioReady] = useState(Platform.OS === "web");
  const [iconsReady, setIconsReady] = useState(false);
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    const loadIconFonts = async () => {
      try {
        const iconFonts = {
          ...Ionicons.font,
          ...Feather.font,
          ...MaterialCommunityIcons.font,
        };
        const alreadyLoaded = Object.keys(iconFonts).every((name) => Font.isLoaded(name));
        if (!alreadyLoaded) {
          await Font.loadAsync(iconFonts);
        }
      } catch (e) {
        console.warn("Icon font loading error:", e);
      }
      setIconsReady(true);
    };
    loadIconFonts();
  }, []);

  useEffect(() => {
    const configureAudio = async () => {
      try {
        if (Platform.OS !== "web") {
          await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: "mixWithOthers",
          });
        }
      } catch {}
      setAudioReady(true);
    };
    configureAudio();
  }, []);

  useEffect(() => {
    if (fontsLoaded && audioReady && iconsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, audioReady, iconsReady]);

  if (!fontsLoaded || !audioReady || !iconsReady) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LanguageProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

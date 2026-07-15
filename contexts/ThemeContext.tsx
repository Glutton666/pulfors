import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors, { getColors, type ThemeColor, type ThemeMode } from "@/constants/colors";
import { Duration } from "@/constants/tokens";

const THEME_KEY = "metronome_theme_color";
const CUSTOM_HEX_KEY = "metronome_custom_hex";
const HUB_IMAGES_KEY = "metronome_hub_images";
const THEME_MODE_KEY = "metronome_theme_mode";

export type BeatTypeKey = "normal" | "accent" | "strong";

export interface HubImage {
  id: string;
  uri: string;
  beatTypes: BeatTypeKey[];
}

interface ThemeContextValue {
  themeColor: ThemeColor;
  customHex: string;
  themeMode: ThemeMode;
  setThemeColor: (color: ThemeColor) => void;
  setCustomHex: (hex: string) => void;
  setThemeMode: (mode: ThemeMode) => void;
  colors: typeof Colors;
  hubImages: HubImage[];
  addHubImage: (uri: string) => void;
  removeHubImage: (id: string) => void;
  updateHubImageBeatTypes: (id: string, beatTypes: BeatTypeKey[]) => void;
  getImageForBeatType: (beatType: string) => string | null;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

let nextId = 1;
function genId() {
  return `hub_${Date.now()}_${nextId++}`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeColor, setThemeColorState] = useState<ThemeColor>("gold");
  const [customHex, setCustomHexState] = useState<string>("#D4A846");
  const [themeMode, setThemeModeState] = useState<ThemeMode>("night");
  const [hubImages, setHubImagesState] = useState<HubImage[]>([]);
  const beatTypeCycleRef = useRef<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const [saved, savedHex, savedImages, savedMode] = await Promise.all([
          AsyncStorage.getItem(THEME_KEY),
          AsyncStorage.getItem(CUSTOM_HEX_KEY),
          AsyncStorage.getItem(HUB_IMAGES_KEY),
          AsyncStorage.getItem(THEME_MODE_KEY),
        ]);
        if (saved) setThemeColorState(saved as ThemeColor);
        if (savedHex) setCustomHexState(savedHex);
        if (savedMode === "day" || savedMode === "night") setThemeModeState(savedMode);
        if (savedImages) {
          try {
            const parsed = JSON.parse(savedImages);
            if (Array.isArray(parsed)) setHubImagesState(parsed);
          } catch {}
        }
      } catch {}
    })();
  }, []);

  const persistHubImages = useCallback((images: HubImage[]) => {
    AsyncStorage.setItem(HUB_IMAGES_KEY, JSON.stringify(images)).catch(() => {});
  }, []);

  const setThemeColor = useCallback((color: ThemeColor) => {
    setThemeColorState(color);
    AsyncStorage.setItem(THEME_KEY, color).catch(() => {});
  }, []);

  const setCustomHex = useCallback((hex: string) => {
    setCustomHexState(hex);
    AsyncStorage.setItem(CUSTOM_HEX_KEY, hex).catch(() => {});
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_MODE_KEY, mode).catch(() => {});
  }, []);

  const addHubImage = useCallback((uri: string) => {
    setHubImagesState((prev) => {
      if (prev.length >= 3) return prev;
      const next = [...prev, { id: genId(), uri, beatTypes: ["normal" as BeatTypeKey] }];
      persistHubImages(next);
      return next;
    });
  }, [persistHubImages]);

  const removeHubImage = useCallback((id: string) => {
    setHubImagesState((prev) => {
      const next = prev.filter((img) => img.id !== id);
      persistHubImages(next);
      return next;
    });
  }, [persistHubImages]);

  const updateHubImageBeatTypes = useCallback((id: string, beatTypes: BeatTypeKey[]) => {
    setHubImagesState((prev) => {
      const next = prev.map((img) => (img.id === id ? { ...img, beatTypes } : img));
      persistHubImages(next);
      return next;
    });
  }, [persistHubImages]);

  const getImageForBeatType = useCallback((beatType: string) => {
    const key = beatType as BeatTypeKey;
    const matches = hubImages.filter((img) => img.beatTypes.includes(key));
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0].uri;
    const cycleKey = key;
    const idx = (beatTypeCycleRef.current[cycleKey] || 0) % matches.length;
    beatTypeCycleRef.current[cycleKey] = idx + 1;
    return matches[idx].uri;
  }, [hubImages]);

  const colors = useMemo(() => getColors(themeColor, customHex, themeMode), [themeColor, customHex, themeMode]);

  // 테마 전환 페이드 오버레이: themeMode 가 바뀔 때 짧게 화면을 덮어 색상 점프를 부드럽게.
  const transitionOpacity = useSharedValue(0);
  const transitionColor = useRef<string>(colors.background);
  const prevThemeModeRef = useRef<ThemeMode>(themeMode);
  const [transitionTick, setTransitionTick] = useState(0);

  useEffect(() => {
    if (prevThemeModeRef.current === themeMode) return;
    // 새 테마의 배경색을 페이드 오버레이로 사용해 자연스럽게 전환.
    transitionColor.current = colors.background;
    setTransitionTick((n) => n + 1);
    prevThemeModeRef.current = themeMode;
    transitionOpacity.value = 0.85;
    transitionOpacity.value = withTiming(0, {
      duration: Duration.themeTransition,
      easing: Easing.out(Easing.quad),
    });
  }, [themeMode, colors.background, transitionOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: transitionOpacity.value }));

  const value = useMemo(
    () => ({
      themeColor, customHex, themeMode, setThemeColor, setCustomHex, setThemeMode, colors,
      hubImages, addHubImage, removeHubImage, updateHubImageBeatTypes, getImageForBeatType,
    }),
    [themeColor, customHex, themeMode, setThemeColor, setCustomHex, setThemeMode, colors,
     hubImages, addHubImage, removeHubImage, updateHubImageBeatTypes, getImageForBeatType]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <Animated.View
        key={transitionTick}
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: transitionColor.current, zIndex: 99999 },
          overlayStyle,
        ]}
      />
    </ThemeContext.Provider>
  );
}

/**
 * Provider 외부에서도 안전하게 호출 가능한 테마 훅.
 * Provider가 없거나 에러로 마운트 안 된 경우 null을 반환합니다.
 * (ErrorFallback 같은 fallback UI에서 사용)
 */
export function useThemeSafe(): ThemeContextValue | null {
  return useContext(ThemeContext);
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

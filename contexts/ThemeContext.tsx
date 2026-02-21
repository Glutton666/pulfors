import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors, { getColors, type ThemeColor } from "@/constants/colors";

const THEME_KEY = "metronome_theme_color";
const CUSTOM_HEX_KEY = "metronome_custom_hex";
const HUB_IMAGES_KEY = "metronome_hub_images";

export type BeatTypeKey = "normal" | "accent" | "strong";

export interface HubImage {
  id: string;
  uri: string;
  beatTypes: BeatTypeKey[];
}

interface ThemeContextValue {
  themeColor: ThemeColor;
  customHex: string;
  setThemeColor: (color: ThemeColor) => void;
  setCustomHex: (hex: string) => void;
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
  const [hubImages, setHubImagesState] = useState<HubImage[]>([]);
  const beatTypeCycleRef = useRef<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const [saved, savedHex, savedImages] = await Promise.all([
          AsyncStorage.getItem(THEME_KEY),
          AsyncStorage.getItem(CUSTOM_HEX_KEY),
          AsyncStorage.getItem(HUB_IMAGES_KEY),
        ]);
        if (saved) setThemeColorState(saved as ThemeColor);
        if (savedHex) setCustomHexState(savedHex);
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

  const colors = useMemo(() => getColors(themeColor, customHex), [themeColor, customHex]);

  const value = useMemo(
    () => ({
      themeColor, customHex, setThemeColor, setCustomHex, colors,
      hubImages, addHubImage, removeHubImage, updateHubImageBeatTypes, getImageForBeatType,
    }),
    [themeColor, customHex, setThemeColor, setCustomHex, colors,
     hubImages, addHubImage, removeHubImage, updateHubImageBeatTypes, getImageForBeatType]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

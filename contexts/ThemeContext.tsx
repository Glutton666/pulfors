import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors, { getColors, type ThemeColor } from "@/constants/colors";

const THEME_KEY = "metronome_theme_color";
const CUSTOM_HEX_KEY = "metronome_custom_hex";
const CENTER_IMAGE_KEY = "metronome_center_image";
const ACCENT_IMAGE_KEY = "metronome_accent_image";
const STRONG_IMAGE_KEY = "metronome_strong_image";

interface ThemeContextValue {
  themeColor: ThemeColor;
  customHex: string;
  setThemeColor: (color: ThemeColor) => void;
  setCustomHex: (hex: string) => void;
  colors: typeof Colors;
  centerImageUri: string | null;
  setCenterImageUri: (uri: string | null) => void;
  accentImageUri: string | null;
  setAccentImageUri: (uri: string | null) => void;
  strongImageUri: string | null;
  setStrongImageUri: (uri: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [themeColor, setThemeColorState] = useState<ThemeColor>("gold");
  const [customHex, setCustomHexState] = useState<string>("#D4A846");
  const [centerImageUri, setCenterImageUriState] = useState<string | null>(null);
  const [accentImageUri, setAccentImageUriState] = useState<string | null>(null);
  const [strongImageUri, setStrongImageUriState] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [saved, savedHex, savedImage, savedAccent, savedStrong] = await Promise.all([
          AsyncStorage.getItem(THEME_KEY),
          AsyncStorage.getItem(CUSTOM_HEX_KEY),
          AsyncStorage.getItem(CENTER_IMAGE_KEY),
          AsyncStorage.getItem(ACCENT_IMAGE_KEY),
          AsyncStorage.getItem(STRONG_IMAGE_KEY),
        ]);
        if (saved) setThemeColorState(saved as ThemeColor);
        if (savedHex) setCustomHexState(savedHex);
        if (savedImage) setCenterImageUriState(savedImage);
        if (savedAccent) setAccentImageUriState(savedAccent);
        if (savedStrong) setStrongImageUriState(savedStrong);
      } catch {}
    })();
  }, []);

  const setThemeColor = useCallback((color: ThemeColor) => {
    setThemeColorState(color);
    AsyncStorage.setItem(THEME_KEY, color).catch(() => {});
  }, []);

  const setCustomHex = useCallback((hex: string) => {
    setCustomHexState(hex);
    AsyncStorage.setItem(CUSTOM_HEX_KEY, hex).catch(() => {});
  }, []);

  const setCenterImageUri = useCallback((uri: string | null) => {
    setCenterImageUriState(uri);
    if (uri) {
      AsyncStorage.setItem(CENTER_IMAGE_KEY, uri).catch(() => {});
    } else {
      AsyncStorage.removeItem(CENTER_IMAGE_KEY).catch(() => {});
    }
  }, []);

  const setAccentImageUri = useCallback((uri: string | null) => {
    setAccentImageUriState(uri);
    if (uri) {
      AsyncStorage.setItem(ACCENT_IMAGE_KEY, uri).catch(() => {});
    } else {
      AsyncStorage.removeItem(ACCENT_IMAGE_KEY).catch(() => {});
    }
  }, []);

  const setStrongImageUri = useCallback((uri: string | null) => {
    setStrongImageUriState(uri);
    if (uri) {
      AsyncStorage.setItem(STRONG_IMAGE_KEY, uri).catch(() => {});
    } else {
      AsyncStorage.removeItem(STRONG_IMAGE_KEY).catch(() => {});
    }
  }, []);

  const colors = useMemo(() => getColors(themeColor, customHex), [themeColor, customHex]);

  const value = useMemo(
    () => ({
      themeColor, customHex, setThemeColor, setCustomHex, colors,
      centerImageUri, setCenterImageUri,
      accentImageUri, setAccentImageUri,
      strongImageUri, setStrongImageUri,
    }),
    [themeColor, customHex, setThemeColor, setCustomHex, colors,
     centerImageUri, setCenterImageUri,
     accentImageUri, setAccentImageUri,
     strongImageUri, setStrongImageUri]
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

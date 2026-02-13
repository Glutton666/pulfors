import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors, { getColors, type ThemeColor } from "@/constants/colors";

const THEME_KEY = "metronome_theme_color";
const CUSTOM_HEX_KEY = "metronome_custom_hex";

interface ThemeContextValue {
  themeColor: ThemeColor;
  customHex: string;
  setThemeColor: (color: ThemeColor) => void;
  setCustomHex: (hex: string) => void;
  colors: typeof Colors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [themeColor, setThemeColorState] = useState<ThemeColor>("gold");
  const [customHex, setCustomHexState] = useState<string>("#D4A846");

  useEffect(() => {
    (async () => {
      try {
        const [saved, savedHex] = await Promise.all([
          AsyncStorage.getItem(THEME_KEY),
          AsyncStorage.getItem(CUSTOM_HEX_KEY),
        ]);
        if (saved) setThemeColorState(saved as ThemeColor);
        if (savedHex) setCustomHexState(savedHex);
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

  const colors = useMemo(() => getColors(themeColor, customHex), [themeColor, customHex]);

  const value = useMemo(
    () => ({ themeColor, customHex, setThemeColor, setCustomHex, colors }),
    [themeColor, customHex, setThemeColor, setCustomHex, colors]
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

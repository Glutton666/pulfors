import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors, { getColors, type ThemeColor } from "@/constants/colors";

const THEME_KEY = "metronome_theme_color";

interface ThemeContextValue {
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
  colors: typeof Colors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [themeColor, setThemeColorState] = useState<ThemeColor>("gold");

  const setThemeColor = useCallback((color: ThemeColor) => {
    setThemeColorState(color);
    AsyncStorage.setItem(THEME_KEY, color).catch(() => {});
  }, []);

  const colors = useMemo(() => getColors(themeColor), [themeColor]);

  const value = useMemo(
    () => ({ themeColor, setThemeColor, colors }),
    [themeColor, setThemeColor, colors]
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

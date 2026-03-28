export type ThemeColor = "gold" | "blue" | "green" | "red" | "purple" | "cyan" | "orange" | "pink" | "rose" | "neon" | "saintspurple" | "deepred" | "beige" | "custom";

export type ThemeMode = "day" | "night";

export interface AccentColors {
  accent: string;
  accentDim: string;
  accentMuted: string;
}

const ACCENT_PRESETS: Record<Exclude<ThemeColor, "custom">, AccentColors> = {
  gold: {
    accent: "#D4A846",
    accentDim: "rgba(212, 168, 70, 0.15)",
    accentMuted: "rgba(212, 168, 70, 0.4)",
  },
  blue: {
    accent: "#58A6FF",
    accentDim: "rgba(88, 166, 255, 0.15)",
    accentMuted: "rgba(88, 166, 255, 0.4)",
  },
  green: {
    accent: "#3FB950",
    accentDim: "rgba(63, 185, 80, 0.15)",
    accentMuted: "rgba(63, 185, 80, 0.4)",
  },
  red: {
    accent: "#F85149",
    accentDim: "rgba(248, 81, 73, 0.15)",
    accentMuted: "rgba(248, 81, 73, 0.4)",
  },
  purple: {
    accent: "#BC8CFF",
    accentDim: "rgba(188, 140, 255, 0.15)",
    accentMuted: "rgba(188, 140, 255, 0.4)",
  },
  cyan: {
    accent: "#39D2C0",
    accentDim: "rgba(57, 210, 192, 0.15)",
    accentMuted: "rgba(57, 210, 192, 0.4)",
  },
  orange: {
    accent: "#F0883E",
    accentDim: "rgba(240, 136, 62, 0.15)",
    accentMuted: "rgba(240, 136, 62, 0.4)",
  },
  pink: {
    accent: "#F778BA",
    accentDim: "rgba(247, 120, 186, 0.15)",
    accentMuted: "rgba(247, 120, 186, 0.4)",
  },
  rose: {
    accent: "#E07070",
    accentDim: "rgba(224, 112, 112, 0.15)",
    accentMuted: "rgba(224, 112, 112, 0.4)",
  },
  neon: {
    accent: "#39FF14",
    accentDim: "rgba(57, 255, 20, 0.15)",
    accentMuted: "rgba(57, 255, 20, 0.4)",
  },
  saintspurple: {
    accent: "#7B2D8E",
    accentDim: "rgba(123, 45, 142, 0.15)",
    accentMuted: "rgba(123, 45, 142, 0.4)",
  },
  deepred: {
    accent: "#8B1A2B",
    accentDim: "rgba(139, 26, 43, 0.15)",
    accentMuted: "rgba(139, 26, 43, 0.4)",
  },
  beige: {
    accent: "#C8AD7F",
    accentDim: "rgba(200, 173, 127, 0.15)",
    accentMuted: "rgba(200, 173, 127, 0.4)",
  },
};

export { ACCENT_PRESETS };

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export function accentFromHex(hex: string): AccentColors {
  const { r, g, b } = hexToRgb(hex);
  return {
    accent: hex,
    accentDim: `rgba(${r}, ${g}, ${b}, 0.15)`,
    accentMuted: `rgba(${r}, ${g}, ${b}, 0.4)`,
  };
}

export function accentForMode(base: AccentColors, mode: ThemeMode): AccentColors {
  if (mode === "night") return base;
  const { r, g, b } = hexToRgb(base.accent);
  const darken = (v: number) => Math.round(v * 0.82);
  const darkened = `#${darken(r).toString(16).padStart(2, "0")}${darken(g).toString(16).padStart(2, "0")}${darken(b).toString(16).padStart(2, "0")}`;
  return {
    accent: darkened,
    accentDim: `rgba(${r}, ${g}, ${b}, 0.12)`,
    accentMuted: `rgba(${r}, ${g}, ${b}, 0.3)`,
  };
}

const DarkColors = {
  background: "#0D1117",
  surface: "#161B22",
  surfaceLight: "#21262D",
  accent: "#D4A846",
  accentDim: "rgba(212, 168, 70, 0.15)",
  accentMuted: "rgba(212, 168, 70, 0.4)",
  text: "#F0F6FC",
  textSecondary: "#8B949E",
  textTertiary: "#484F58",
  border: "#30363D",
  backgroundSecondary: "#1C2028",
  danger: "#F85149",
  success: "#3FB950",
  white: "#FFFFFF",
  textPrimary: "#F0F6FC",
  overlay03: "rgba(255,255,255,0.03)",
  overlay05: "rgba(255,255,255,0.05)",
  overlay06: "rgba(255,255,255,0.06)",
  overlay07: "rgba(255,255,255,0.07)",
  overlay08: "rgba(255,255,255,0.08)",
  overlay10: "rgba(255,255,255,0.10)",
  scrim: "rgba(0,0,0,0.6)",
};

const LightColors = {
  background: "#FAFAF7",
  surface: "#E6E5DD",
  surfaceLight: "#D6D5CC",
  accent: "#B8922E",
  accentDim: "rgba(184, 146, 46, 0.12)",
  accentMuted: "rgba(184, 146, 46, 0.3)",
  text: "#1A1A1A",
  textSecondary: "#5C5C5C",
  textTertiary: "#7A7A72",
  border: "#B8B8AD",
  backgroundSecondary: "#EFEFEA",
  danger: "#D32F2F",
  success: "#2E7D32",
  white: "#FFFFFF",
  textPrimary: "#1A1A1A",
  overlay03: "rgba(0,0,0,0.06)",
  overlay05: "rgba(0,0,0,0.10)",
  overlay06: "rgba(0,0,0,0.12)",
  overlay07: "rgba(0,0,0,0.14)",
  overlay08: "rgba(0,0,0,0.16)",
  overlay10: "rgba(0,0,0,0.20)",
  scrim: "rgba(0,0,0,0.5)",
};

const Colors = DarkColors;

export { DarkColors, LightColors };

export function getBaseColors(mode: ThemeMode) {
  return mode === "day" ? LightColors : DarkColors;
}

export function getColors(theme: ThemeColor, customHex?: string, mode: ThemeMode = "night") {
  const base = getBaseColors(mode);
  if (theme === "custom" && customHex) {
    const custom = accentFromHex(customHex);
    const adjusted = mode === "day" ? accentForMode(custom, mode) : custom;
    return { ...base, ...adjusted };
  }
  const preset = ACCENT_PRESETS[theme === "custom" ? "gold" : theme];
  const adjusted = mode === "day" ? accentForMode(preset, mode) : preset;
  return {
    ...base,
    accent: adjusted.accent,
    accentDim: adjusted.accentDim,
    accentMuted: adjusted.accentMuted,
  };
}

export default Colors;

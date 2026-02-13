export type ThemeColor = "gold" | "blue" | "green" | "red" | "purple" | "cyan" | "orange" | "pink";

export interface AccentColors {
  accent: string;
  accentDim: string;
  accentMuted: string;
}

const ACCENT_PRESETS: Record<ThemeColor, AccentColors> = {
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
};

export { ACCENT_PRESETS };

const Colors = {
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
  danger: "#F85149",
  success: "#3FB950",
  white: "#FFFFFF",
};

export function getColors(theme: ThemeColor) {
  const preset = ACCENT_PRESETS[theme];
  return {
    ...Colors,
    accent: preset.accent,
    accentDim: preset.accentDim,
    accentMuted: preset.accentMuted,
  };
}

export default Colors;

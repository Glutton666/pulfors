import { ACCENT_PRESETS, type ThemeColor } from "@/constants/colors";

export type PresetColorLabelKey =
  | "colorGold"
  | "colorBlue"
  | "colorGreen"
  | "colorRed"
  | "colorPurple"
  | "colorCyan"
  | "colorOrange"
  | "colorPink"
  | "colorRose"
  | "colorNeon"
  | "colorSaints"
  | "colorDeepRed"
  | "colorBeige";

export interface PresetColor {
  value: Exclude<ThemeColor, "custom">;
  labelKey: PresetColorLabelKey;
  color: string;
}

export const PRESET_COLORS: PresetColor[] = [
  { value: "gold", labelKey: "colorGold", color: ACCENT_PRESETS.gold.accent },
  { value: "blue", labelKey: "colorBlue", color: ACCENT_PRESETS.blue.accent },
  { value: "green", labelKey: "colorGreen", color: ACCENT_PRESETS.green.accent },
  { value: "red", labelKey: "colorRed", color: ACCENT_PRESETS.red.accent },
  { value: "purple", labelKey: "colorPurple", color: ACCENT_PRESETS.purple.accent },
  { value: "cyan", labelKey: "colorCyan", color: ACCENT_PRESETS.cyan.accent },
  { value: "orange", labelKey: "colorOrange", color: ACCENT_PRESETS.orange.accent },
  { value: "pink", labelKey: "colorPink", color: ACCENT_PRESETS.pink.accent },
  { value: "rose", labelKey: "colorRose", color: ACCENT_PRESETS.rose.accent },
  { value: "neon", labelKey: "colorNeon", color: ACCENT_PRESETS.neon.accent },
  { value: "saintspurple", labelKey: "colorSaints", color: ACCENT_PRESETS.saintspurple.accent },
  { value: "deepred", labelKey: "colorDeepRed", color: ACCENT_PRESETS.deepred.accent },
  { value: "beige", labelKey: "colorBeige", color: ACCENT_PRESETS.beige.accent },
];

export const HUE_COLORS: string[] = [
  "#FF0000", "#FF8000", "#FFFF00", "#80FF00",
  "#00FF00", "#00FF80", "#00FFFF", "#0080FF",
  "#0000FF", "#8000FF", "#FF00FF", "#FF0080", "#FF0000",
];

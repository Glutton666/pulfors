/**
 * BarMode — shared types, constants, and pure helpers.
 * Imported by BarModeView, SwipeableBarRow, BarEditorPanel, and the modal
 * sub-components so no circular deps arise.
 */
import type React from "react";
import type { Ionicons } from "@expo/vector-icons";
import type { BarRepeat } from "@/components/beat-indicator.types";
import type { BarModeViewKey } from "@/lib/i18n";

// ─── Icon type helper ────────────────────────────────────────────────────────

export type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// ─── Colors ──────────────────────────────────────────────────────────────────

export interface BarModeColors {
  background: string;
  backgroundSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentMuted: string;
  danger: string;
  overlay06: string;
  overlay08: string;
  overlay10: string;
  white: string;
}

// ─── Symbol types ─────────────────────────────────────────────────────────────

export type SymbolType = "block" | "repeat" | "jump_from" | "jump_to" | "volta" | "end";

export const SYMBOL_INFO: Record<
  SymbolType,
  { icon: IoniconName; labelKey: BarModeViewKey; color: (c: BarModeColors) => string }
> = {
  block:     { icon: "code-slash",        labelKey: "symbolBlock",    color: c => c.accent },
  repeat:    { icon: "repeat",            labelKey: "symbolRepeat",   color: c => c.accent },
  jump_from: { icon: "arrow-forward",     labelKey: "symbolJumpFrom", color: _c => "#f0ad4e" },
  jump_to:   { icon: "arrow-back",        labelKey: "symbolJumpTo",   color: _c => "#f0ad4e" },
  volta:     { icon: "hourglass-outline", labelKey: "symbolVolta",    color: _c => "#7b68ee" },
  end:       { icon: "stop",              labelKey: "symbolEnd",      color: c => c.danger },
};

// ─── Sound set options ────────────────────────────────────────────────────────

export const SOUND_SET_OPTIONS: { key: string; labelKey: BarModeViewKey }[] = [
  { key: "classic",   labelKey: "ssClassic" },
  { key: "woodblock", labelKey: "ssWoodblock" },
  { key: "cowbell",   labelKey: "ssCowbell" },
  { key: "digital",   labelKey: "ssDigital" },
  { key: "jamblock",  labelKey: "ssJamblock" },
  { key: "sine",      labelKey: "ssSine" },
  { key: "blip",      labelKey: "ssBlip" },
  { key: "clave",     labelKey: "ssClave" },
  { key: "cajon",     labelKey: "ssCajon" },
  { key: "marimba",   labelKey: "ssMarimba" },
  { key: "stick",     labelKey: "ssStick" },
];

// ─── Layout constants ─────────────────────────────────────────────────────────

export const BAR_ROW_H = 44;
export const MIN_BEATS = 1;
export const MAX_BEATS = 16;
export const SWIPE_ACTION_THRESHOLD = 60;
export const MIN_BAR_DURATION_SECONDS = 1;
export const MAX_BAR_DURATION_SECONDS = 59 * 60 + 59;
export const BAR_REPEAT_COUNT_HOLD_DELAY_MS = 500;
export const BAR_REPEAT_COUNT_HOLD_INITIAL_INTERVAL_MS = 300;
export const BAR_REPEAT_COUNT_HOLD_MIN_INTERVAL_MS = 60;

export type BarDurationPart = "minutes" | "seconds";

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function formatBarCenterInfo(
  repeat: BarRepeat | null,
  bpm: number,
  _beatsPerMeasure: number,
): string | null {
  const effectiveBpm = (repeat?.bpm && repeat.bpm > 0) ? repeat.bpm : bpm;
  const barSec = 60 / Math.max(1, effectiveBpm);
  const bpmStr = String(Math.round(effectiveBpm));

  if (!repeat || (repeat.type === "count" && repeat.value <= 1 && !repeat.bpm)) {
    return `${bpmStr}`;
  }

  if (repeat.type === "count") {
    const totalSec = barSec * Math.max(1, repeat.value);
    const totalMm = Math.floor(totalSec / 60).toString().padStart(2, "0");
    const totalSs = Math.round(totalSec % 60).toString().padStart(2, "0");
    return `${bpmStr} / ×${repeat.value}(${totalMm}:${totalSs})`;
  } else {
    const count = barSec > 0 ? Math.round(repeat.value / barSec) : 0;
    const totalMm = Math.floor(repeat.value / 60).toString().padStart(2, "0");
    const totalSs = Math.round(repeat.value % 60).toString().padStart(2, "0");
    return `${bpmStr} / ×${count}(${totalMm}:${totalSs})`;
  }
}

export function nextJumpPairId(barRepeats: Record<number, BarRepeat>): number {
  let max = 0;
  for (const r of Object.values(barRepeats)) {
    if (r.jumpFromId && r.jumpFromId > max) max = r.jumpFromId;
    if (r.jumpToId && r.jumpToId > max) max = r.jumpToId;
  }
  return max + 1;
}

export function clampBarRepeatCount(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}

export function getBarRepeatCountHoldIntervalMs(elapsedMs: number): number {
  const elapsed = Math.max(0, elapsedMs);
  return Math.max(
    BAR_REPEAT_COUNT_HOLD_MIN_INTERVAL_MS,
    Math.round(
      BAR_REPEAT_COUNT_HOLD_INITIAL_INTERVAL_MS * Math.exp(-elapsed / 4500),
    ),
  );
}

export function clampBarBpm(value: number): number {
  return Math.max(20, Math.min(300, Math.round(value)));
}

export function clampBarDurationSeconds(value: number): number {
  return Math.max(
    MIN_BAR_DURATION_SECONDS,
    Math.min(MAX_BAR_DURATION_SECONDS, Math.round(value)),
  );
}

export function adjustBarDuration(
  totalSeconds: number,
  part: BarDurationPart,
  amount: number,
): number {
  const { minutes, seconds } = splitBarDuration(totalSeconds);
  if (part === "minutes") {
    return clampBarDurationSeconds(
      Math.max(0, Math.min(59, minutes + amount)) * 60 + seconds,
    );
  }
  return clampBarDurationSeconds(
    minutes * 60 + Math.max(0, Math.min(59, seconds + amount)),
  );
}

export function splitBarDuration(totalSeconds: number): { minutes: number; seconds: number } {
  const total = clampBarDurationSeconds(totalSeconds);
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

export function formatBarDuration(totalSeconds: number): string {
  const { minutes, seconds } = splitBarDuration(totalSeconds);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

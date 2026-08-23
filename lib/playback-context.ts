import type { BarConfig } from "@/app/index.helpers";
import { createT, type Language } from "@/lib/i18n";

export type PlaybackMode =
  | "beat"
  | "bar"
  | "note"
  | "score"
  | "polygon"
  | "stage"
  | "practice"
  | "menu"
  | "unknown";

export type PlaybackBpmSource = "global" | "bar_default" | "bar_override";

export interface PlaybackContext {
  mode: PlaybackMode;
  /** Compatible session-record value. Beat mode remains `dial` in old logs. */
  activityMode: Exclude<PlaybackMode, "beat"> | "dial";
  modeLabel: string;
  bpm: number;
  bpmSource: PlaybackBpmSource;
  activeBarIndex?: number;
}

export interface ResolvePlaybackContextInput {
  mode: unknown;
  language?: Language;
  globalBpm: number;
  barBpm: number;
  barConfig: Pick<BarConfig, "barRepeats">;
  activeBarIndex?: number | null;
}

const KNOWN_MODES = new Set<PlaybackMode>([
  "beat",
  "bar",
  "note",
  "score",
  "polygon",
  "stage",
  "practice",
  "menu",
  "unknown",
]);

function normalizeMode(mode: unknown): PlaybackMode {
  const normalized = typeof mode === "string" ? mode.trim().toLowerCase() : "";
  if (normalized === "dial") return "beat";
  return KNOWN_MODES.has(normalized as PlaybackMode)
    ? normalized as PlaybackMode
    : "unknown";
}

function safeBpm(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(20, Math.min(300, Math.round(value)));
}

/**
 * Resolves the user-visible playback state from the same bar data used by the
 * engine. A per-bar repeat BPM takes priority over the bar's base BPM.
 */
export function resolvePlaybackContext(input: ResolvePlaybackContextInput): PlaybackContext {
  const mode = normalizeMode(input.mode);
  const t = createT(input.language ?? "ko");
  const activeBarIndex = Number.isInteger(input.activeBarIndex) && (input.activeBarIndex ?? -1) >= 0
    ? input.activeBarIndex as number
    : undefined;

  const modeLabel = mode === "polygon"
    ? t("polygon", "title")
    : mode === "unknown"
    ? t("switcher", "unknown")
    : t("switcher", mode);

  if (mode === "bar") {
    const override = activeBarIndex === undefined
      ? undefined
      : input.barConfig.barRepeats[activeBarIndex]?.bpm;
    if (typeof override === "number" && Number.isFinite(override)) {
      return {
        mode,
        activityMode: "bar",
        modeLabel,
        bpm: safeBpm(override, safeBpm(input.barBpm, input.globalBpm)),
        bpmSource: "bar_override",
        activeBarIndex,
      };
    }
    return {
      mode,
      activityMode: "bar",
      modeLabel,
      bpm: safeBpm(input.barBpm, input.globalBpm),
      bpmSource: "bar_default",
      activeBarIndex,
    };
  }

  return {
    mode,
    activityMode: mode === "beat" ? "dial" : mode,
    modeLabel,
    bpm: safeBpm(input.globalBpm, 120),
    bpmSource: "global",
  };
}
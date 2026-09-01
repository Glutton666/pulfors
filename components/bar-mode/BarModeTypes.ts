/**
 * BarMode — shared types, constants, and pure helpers.
 * Imported by BarModeView, SwipeableBarRow, BarEditorPanel, and the modal
 * sub-components so no circular deps arise.
 */
import type React from "react";
import type { Ionicons } from "@expo/vector-icons";
import type { BarRepeat } from "@/components/beat-indicator.types";
import type { BarModeViewKey } from "@/lib/i18n";
import type { SampleSource } from "@/lib/note-samples";

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
  _meterNumerator: number,
  meterDenominator: 2 | 4 | 8,
): string | null {
  const effectiveBpm = (repeat?.bpm && repeat.bpm > 0) ? repeat.bpm : bpm;
  const barSec = (
    (60 / Math.max(1, effectiveBpm))
    * (4 / meterDenominator)
  );
  const bpmStr = String(Math.round(effectiveBpm));

  // Every newly created bar stores its own BPM. A normal single play should
  // still read as a concise tempo, not as an artificial ×1 duration.
  if (!repeat || (repeat.type === "count" && repeat.value <= 1)) {
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

export function getBarSampleCells(
  beat: number,
  cellCount: number,
  samples?: Record<string, string>,
): boolean[] {
  const count = Math.max(1, Math.floor(cellCount));
  return Array.from({ length: count }, (_, cell) => Boolean(samples?.[`${beat}-${cell}`]));
}

export type SampleCellCoverageKind = "direct" | "continued";

/**
 * A single visual cell can be claimed by several samples.  Keep the winning
 * source together with whether that source begins at the cell so the UI can
 * distinguish a trigger from the tail of a preceding sample.
 */
export interface SampleCellCoverage {
  source: SampleSource;
  kind: SampleCellCoverageKind;
}

export type SampleCellCoverageMap = Map<string, SampleCellCoverage>;

export interface SampleCoverageOptions {
  bpm: number | undefined;
  beatsPerMeasure: number;
  beatSubdivisions: Record<string, unknown[]>;
  barRepeats: Record<number, BarRepeat>;
  noteSamples?: Record<string, string>;
  noteSampleSources?: Record<string, SampleSource | string>;
  beatDenominator?: 2 | 4 | 8;
  halfTime?: boolean;
}

type BarTiming = {
  cellCount: number;
  baseDurationMs: number;
  totalDurationMs: number;
};

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getSampleTrimDurationMs(uri: string): number | null {
  const value = uri.trim();
  const fragmentIndex = value.indexOf("#");
  const baseUri = fragmentIndex >= 0 ? value.slice(0, fragmentIndex) : value;
  // Recorder/importer output is URI based. Reject corrupt persisted values
  // rather than treating arbitrary text as a playable sample.
  if (!/^[a-z][a-z\d+.-]*:/i.test(baseUri)) return null;

  if (fragmentIndex < 0) return 0;
  const fragment = value.slice(fragmentIndex);
  if (!fragment.startsWith("#t=")) return null;
  const parts = fragment.slice(3).split(",");
  if (parts.length !== 2) return null;

  const startMs = Number(parts[0]);
  const endMs = Number(parts[1]);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs < 0 ||
    endMs <= startMs
  ) {
    return null;
  }
  return endMs - startMs;
}

function getBarTiming(
  beat: number,
  options: SampleCoverageOptions,
): BarTiming | null {
  const repeat = options.barRepeats[beat];
  const bpm = isFinitePositive(repeat?.bpm) ? repeat.bpm : options.bpm;
  if (!isFinitePositive(bpm)) return null;

  const cells = options.beatSubdivisions[String(beat)];
  const cellCount = Math.max(1, Math.floor(cells?.length || 1));
  // The scheduler treats old rows as one engine beat. Their displayed cells
  // are subdivisions of that beat, not an implicit meter numerator.
  const denominator = repeat?.meterDenominator ?? options.beatDenominator ?? 4;
  // Keep the same display-BPM → internal quarter-BPM normalization as the
  // engine, including its guardrail clamp.
  const engineBpm = Math.max(20, Math.min(300, bpm * (4 / denominator)));
  const effectiveBpm = options.halfTime ? engineBpm / 2 : engineBpm;
  const baseDurationMs = 60_000 / effectiveBpm;

  let totalDurationMs = baseDurationMs;
  if (repeat?.type === "count") {
    totalDurationMs *= Math.ceil(Math.max(
      1,
      Number.isFinite(repeat.value) ? repeat.value : 1,
    ));
  } else if (repeat?.type === "duration" && isFinitePositive(repeat.value)) {
    totalDurationMs = baseDurationMs * Math.max(
      1,
      Math.round((repeat.value * 1_000) / baseDurationMs),
    );
  }

  return { cellCount, baseDurationMs, totalDurationMs };
}

function normalizeSampleSource(value: unknown): SampleSource {
  return value === "import" ? "import" : "recording";
}

function markCoveredCell(
  covered: SampleCellCoverageMap,
  key: string,
  source: SampleSource,
  kind: SampleCellCoverageKind,
): void {
  const previous = covered.get(key);
  const sourceWins = !previous || (source === "recording" && previous.source === "import");
  if (sourceWins) {
    covered.set(key, { source, kind });
  } else if (previous.source === source && kind === "direct" && previous.kind !== "direct") {
    covered.set(key, { source, kind });
  }
}

function markRowRange(
  covered: SampleCellCoverageMap,
  beat: number,
  timing: BarTiming,
  fromMs: number,
  toMs: number,
  source: SampleSource,
): void {
  if (!(toMs > fromMs)) return;
  const repeats = Math.max(1, Math.ceil(timing.totalDurationMs / timing.baseDurationMs));
  const cellDurationMs = timing.baseDurationMs / timing.cellCount;

  for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
    const repeatStartMs = repeatIndex * timing.baseDurationMs;
    if (repeatStartMs >= toMs) break;
    for (let cell = 0; cell < timing.cellCount; cell++) {
      const cellStartMs = repeatStartMs + cell * cellDurationMs;
      const cellEndMs = cellStartMs + cellDurationMs;
      if (cellStartMs < toMs && cellEndMs > fromMs) {
        markCoveredCell(covered, `${beat}-${cell}`, source, "continued");
      }
    }
  }
}

/**
 * Calculates every displayed cell occupied by a trimmed note sample.
 *
 * A row is a visual representation of all of its configured repeats, so a
 * sample that reaches a later repeat still covers the matching row cells.
 * Recording sources win over imported ones when their ranges overlap.
 */
export function getSampleCellCoverage(options: SampleCoverageOptions): SampleCellCoverageMap {
  const covered: SampleCellCoverageMap = new Map();
  if (!options.noteSamples) return covered;

  for (const [key, uri] of Object.entries(options.noteSamples)) {
    const match = /^(\d+)-(\d+)$/.exec(key);
    if (!match || typeof uri !== "string") continue;

    const beat = Number(match[1]);
    const cell = Number(match[2]);
    if (!Number.isSafeInteger(beat) || !Number.isSafeInteger(cell) || beat >= options.beatsPerMeasure) {
      continue;
    }

    const durationMs = getSampleTrimDurationMs(uri);
    if (durationMs === null) continue;

    const timing = getBarTiming(beat, options);
    if (!timing || cell >= timing.cellCount) continue;

    const source = normalizeSampleSource(options.noteSampleSources?.[key]);
    markCoveredCell(covered, key, source, "direct");
    if (durationMs <= 0) continue;

    const startMs = (cell * timing.baseDurationMs) / timing.cellCount;
    const firstRowEndMs = Math.min(timing.totalDurationMs, startMs + durationMs);
    markRowRange(covered, beat, timing, startMs, firstRowEndMs, source);

    let remainingMs = durationMs - (timing.totalDurationMs - startMs);
    for (let nextBeat = beat + 1; remainingMs > 0 && nextBeat < options.beatsPerMeasure; nextBeat++) {
      const nextTiming = getBarTiming(nextBeat, options);
      if (!nextTiming) break;
      const nextEndMs = Math.min(remainingMs, nextTiming.totalDurationMs);
      markRowRange(covered, nextBeat, nextTiming, 0, nextEndMs, source);
      remainingMs -= nextTiming.totalDurationMs;
    }
  }

  return covered;
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

/** New Lab documents deliberately do not share the legacy ScoreDocument schema. */
export interface Meter { numerator: number; denominator: number }
export interface Hit {
  id: string;
  /** Unmodified performance-clock time relative to the first recording beat. */
  onsetMs: number;
  releaseMs?: number;
  midi?: number;
  drum?: "snare" | "kick" | "hihat_closed";
  hand?: "R" | "L";
}
export interface Fraction { n: number; d: number }
export interface TupletSpan {
  id: string;
  eventIds: string[];
  actual: number;
  normal: number;
  parentId?: string;
}
export type Shape =
  | { id: string; type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { id: string; type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { id: string; type: "curve"; x1: number; y1: number; cx: number; cy: number; x2: number; y2: number };
export type SymbolRole = "rhythm" | "pitch" | "expression" | "structure";
export type SymbolMeaning = "flam" | "drag" | "diddle" | "accent" | "annotation";
export interface UserSymbol {
  id: string;
  name: string;
  shapes: Shape[];
  role: SymbolRole;
  meaning: SymbolMeaning;
  /** Unknown musical roles remain explicit annotations, never guessed execution. */
  description: string;
}
export interface InterpretationOverride {
  id: string;
  hitIds: string[];
  kind: "flam" | "drag" | "diddle" | "regular" | "accent";
  symbolId?: string;
  /** Last hit is primary for flam/drag; all original timestamps are preserved. */
  primaryHitId?: string;
}
export interface NotationEvent {
  id: string;
  hitIds: string[];
  kind: "note" | "rest";
  startQ: Fraction;
  durationQ: Fraction;
  measureIndex: number;
  /** Denominator of displayed ordinary note; non-power-of-two values use tuplets. */
  value: number;
  tuplet?: { actual: number; normal: number };
  graceHitIds?: string[];
  symbolId?: string;
  accent?: boolean;
  locked?: boolean;
  midi?: number[];
  drum?: Hit["drum"];
}
export interface RhythmDocument {
  version: 1;
  id: string;
  title: string;
  bpm: number;
  meter: Meter;
  createdAt: number;
  updatedAt: number;
  hits: Hit[];
  overrides: InterpretationOverride[];
  /** Explicit editing is independent of automatic candidate generation. */
  manualEvents?: NotationEvent[];
  tuplets: TupletSpan[];
  symbols: UserSymbol[];
  simplification: number;
  /** Positive values compensate consistently late taps, never change raw hits. */
  offsetMs: number;
  /** Intent approval is separate from measured similarity and invalidates on edit. */
  reviewConfirmations?: { measureIndex: number; fingerprint: string; eventIds: string[] }[];
}
export interface InterpretationCandidate {
  id: string;
  measureIndex: number;
  grid: number;
  label: string;
  score: number;
  events: NotationEvent[];
}
export interface Interpretation {
  events: NotationEvent[];
  candidates: InterpretationCandidate[];
}
export interface PlaybackHit { id: string; timeMs: number; durationMs?: number; midi?: number; accent?: boolean; drum?: Hit["drum"] }
export type Difficulty = "easy" | "normal" | "strict";
export interface PracticeResult {
  score: number;
  timingScore: number;
  coverageScore: number;
  missed: number;
  extra: number;
  matched: number;
  meanErrorMs: number;
  judgments: { expectedId?: string; actualId?: string; errorMs?: number; kind: "hit" | "miss" | "extra" }[];
}

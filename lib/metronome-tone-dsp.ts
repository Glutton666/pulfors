/**
 * Small, dependency-free DSP helpers for the metronome tone pad.
 *
 * The functions in this file deliberately operate on PCM rather than on an
 * AudioContext.  This keeps tone editing usable by both the interactive and
 * export renderers, and makes the numerical safety properties testable.
 */

export interface TonePosition {
  /** Horizontal position, where -1 and +1 are the left and right corners. */
  x: number;
  /** Vertical position, where -1 and +1 are the top and bottom corners. */
  y: number;
}

/** The one position at which tone processing is exactly bypassed. */
export const NEUTRAL: Readonly<TonePosition> = Object.freeze({ x: 0, y: 0 });

export interface ToneWeights {
  attack: number;
  high: number;
  resonance: number;
  low: number;
}

export interface StereoPCM {
  left: Float32Array;
  right: Float32Array;
}

export type ClickPCM = Float32Array | StereoPCM;

export interface ToneProcessOptions {
  position?: TonePosition;
  sampleRate?: number;
  /** Limiter ceiling. Values above 0.98 are intentionally capped. */
  ceiling?: number;
}

const DEFAULT_SAMPLE_RATE = 44_100;
const MAX_CEILING = 0.98;
// A Float32 cannot represent 0.98 exactly (it rounds slightly upwards). Keep
// a tiny margin so the stored samples satisfy the ceiling as well as the
// intermediate doubles.
const CEILING_MARGIN = 1e-6;

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampUnit(value: unknown): number {
  const n = finiteOr(value, 0);
  return Math.max(-1, Math.min(1, n));
}

/**
 * Sanitizes a pad position. Missing, NaN, and infinite coordinates are
 * treated as neutral; finite coordinates are clamped to the pad bounds.
 */
export function sanitizeTonePosition(position?: Partial<TonePosition> | null): TonePosition {
  const x = clampUnit(position?.x);
  const y = clampUnit(position?.y);
  // Returning the shared value also makes the neutral fast path observable
  // to callers that use identity checks.
  return x === 0 && y === 0 ? NEUTRAL : { x, y };
}

/** Alias useful to callers that describe the operation as clamping. */
export const clampTonePosition = sanitizeTonePosition;

/**
 * Bilinearly interpolates the four pad corners:
 *
 *   (-1,-1) attack       (+1,-1) high
 *   (-1,+1) resonance    (+1,+1) low
 *
 * Weights are non-negative and sum to one (up to floating point rounding).
 * Processing treats NEUTRAL specially, so its otherwise ordinary .25/.25/.25
 * / .25 interpolation does not add coloration.
 */
export function mapTonePositionToWeights(position?: TonePosition | null): ToneWeights {
  const p = sanitizeTonePosition(position);
  const tx = (p.x + 1) * 0.5;
  const ty = (p.y + 1) * 0.5;
  return {
    attack: (1 - tx) * (1 - ty),
    high: tx * (1 - ty),
    resonance: (1 - tx) * ty,
    low: tx * ty,
  };
}

/** Short alias for UI code and tests. */
export const tonePositionToWeights = mapTonePositionToWeights;
export const getToneWeights = mapTonePositionToWeights;
export const mapTonePosition = mapTonePositionToWeights;

function isStereo(pcm: ClickPCM): pcm is StereoPCM {
  return !(pcm instanceof Float32Array) && pcm != null &&
    pcm.left instanceof Float32Array && pcm.right instanceof Float32Array;
}

function validSampleRate(sampleRate: number): number {
  return Math.max(1, finiteOr(sampleRate, DEFAULT_SAMPLE_RATE));
}

function validCeiling(ceiling: number): number {
  const requested = finiteOr(ceiling, MAX_CEILING);
  // A non-positive ceiling is not useful, but retaining a small positive
  // value gives the limiter a deterministic and finite result.
  return Math.max(1e-9, Math.min(MAX_CEILING, requested));
}

function effectiveCeiling(ceiling: number): number {
  return Math.max(1e-9, validCeiling(ceiling) - CEILING_MARGIN);
}

function peakOf(pcm: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const value = pcm[i];
    if (Number.isFinite(value)) peak = Math.max(peak, Math.abs(value));
  }
  return peak;
}

function linkedPeak(pcm: ClickPCM): number {
  return isStereo(pcm)
    ? Math.max(peakOf(pcm.left), peakOf(pcm.right))
    : peakOf(pcm);
}

function hasOnlyFiniteSamples(pcm: Float32Array): boolean {
  for (let i = 0; i < pcm.length; i++) {
    if (!Number.isFinite(pcm[i])) return false;
  }
  return true;
}

function limitedMagnitude(magnitude: number, ceiling: number): number {
  const knee = Math.min(0.7, ceiling * 0.72);
  if (magnitude <= knee) return magnitude;
  const range = Math.max(1e-9, ceiling - knee);
  return ceiling - range * Math.exp(-(magnitude - knee) / range);
}

/**
 * Applies a sample-linked soft-knee limiter to mono or stereo PCM.
 *
 * In stereo each frame uses the louder channel to calculate one shared gain,
 * preserving the stereo image while allowing quieter parts of a boosted click
 * to remain louder instead of turning the whole file down to its single peak.
 */
export function limitLinkedPCM(pcm: ClickPCM, ceiling = MAX_CEILING): ClickPCM {
  const outputCeiling = effectiveCeiling(ceiling);
  const peak = linkedPeak(pcm);
  if (peak <= outputCeiling && (!isStereo(pcm)
    ? hasOnlyFiniteSamples(pcm)
    : hasOnlyFiniteSamples(pcm.left) && hasOnlyFiniteSamples(pcm.right))) {
    return pcm;
  }
  if (!isStereo(pcm)) {
    const out = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      const sample = Number.isFinite(pcm[i]) ? pcm[i] : 0;
      const magnitude = Math.abs(sample);
      const limited = limitedMagnitude(magnitude, outputCeiling);
      out[i] = sample < 0 ? -limited : limited;
    }
    return out;
  }
  const length = Math.max(pcm.left.length, pcm.right.length);
  const left = new Float32Array(pcm.left.length);
  const right = new Float32Array(pcm.right.length);
  for (let i = 0; i < length; i++) {
    const l = i < pcm.left.length && Number.isFinite(pcm.left[i]) ? pcm.left[i] : 0;
    const r = i < pcm.right.length && Number.isFinite(pcm.right[i]) ? pcm.right[i] : 0;
    const framePeak = Math.max(Math.abs(l), Math.abs(r));
    const gain = framePeak > 0 ? limitedMagnitude(framePeak, outputCeiling) / framePeak : 1;
    if (i < left.length) left[i] = l * gain;
    if (i < right.length) right[i] = r * gain;
  }
  return { left, right };
}

/** Mono-friendly spelling of the linked limiter. */
export const limitPCM = limitLinkedPCM;
export const limitLinkedOutput = limitLinkedPCM;
export const applyLinkedLimiter = limitLinkedPCM;

function processChannel(
  source: Float32Array,
  weights: ToneWeights,
  sampleRate: number,
): Float32Array {
  const out = new Float32Array(source.length);
  if (source.length === 0) return out;

  // One-pole low-pass provides complementary low/high components without a
  // potentially unstable high-order filter.  The cutoff leaves enough
  // distinction for ordinary click samples at common sample rates.
  const lowAlpha = Math.exp((-2 * Math.PI * 2_400) / sampleRate);
  let lowPass = 0;
  let previousResonator = 0;
  let previousResonator2 = 0;
  const resonanceFrequency = Math.min(3_500, sampleRate * 0.22);
  const resonanceRadius = 0.88; // safely inside the unit circle
  const resonanceAngle = (2 * Math.PI * resonanceFrequency) / sampleRate;
  const resonanceFeedback = 2 * resonanceRadius * Math.cos(resonanceAngle);
  const resonanceDamping = (1 - resonanceRadius) * 0.65;

  for (let i = 0; i < source.length; i++) {
    const input = Number.isFinite(source[i]) ? source[i] : 0;
    lowPass = (1 - lowAlpha) * input + lowAlpha * lowPass;
    const highPass = input - lowPass;

    // Corner weights are deliberately modest. This gives the limiter room
    // for transient clicks while still making each corner audibly distinct.
    let value = input;
    value += weights.high * 0.85 * highPass;
    value += weights.low * 0.85 * lowPass;

    // A damped resonator is bounded by radius < 1. The input contribution is
    // also damped to avoid a large impulse at sample zero.
    const resonator = resonanceFeedback * previousResonator
      - resonanceRadius * resonanceRadius * previousResonator2
      + resonanceDamping * input;
    previousResonator2 = previousResonator;
    previousResonator = Number.isFinite(resonator) ? resonator : 0;
    value += weights.resonance * 1.8 * previousResonator;

    // Attack is an onset-only envelope, not a sustained gain. Its 3ms decay
    // is intentionally sample-rate aware and remains finite at any rate.
    const attackEnvelope = Math.exp(-i / (sampleRate * 0.003));
    value *= 1 + weights.attack * 0.75 * attackEnvelope;
    out[i] = Number.isFinite(value) ? value : 0;
  }
  return out;
}

function parseProcessArguments(
  positionOrOptions: TonePosition | ToneProcessOptions | undefined,
  sampleRateOrOptions: number | ToneProcessOptions | undefined,
): { position: TonePosition; sampleRate: number; ceiling: number } {
  let position: TonePosition | undefined;
  let sampleRate = DEFAULT_SAMPLE_RATE;
  let ceiling = MAX_CEILING;

  if (positionOrOptions && typeof positionOrOptions === "object" &&
    ("sampleRate" in positionOrOptions || "ceiling" in positionOrOptions || "position" in positionOrOptions)) {
    const options = positionOrOptions as ToneProcessOptions;
    position = options.position;
    sampleRate = finiteOr(options.sampleRate, sampleRate);
    ceiling = finiteOr(options.ceiling, ceiling);
  } else {
    position = positionOrOptions as TonePosition | undefined;
    if (typeof sampleRateOrOptions === "number") {
      sampleRate = finiteOr(sampleRateOrOptions, sampleRate);
    } else if (sampleRateOrOptions) {
      sampleRate = finiteOr(sampleRateOrOptions.sampleRate, sampleRate);
      ceiling = finiteOr(sampleRateOrOptions.ceiling, ceiling);
    }
  }
  return { position: sanitizeTonePosition(position), sampleRate: validSampleRate(sampleRate), ceiling };
}

/**
 * Processes a click's tonal character and applies the linked output limiter.
 *
 * This function is pure: source arrays are never modified. The exact source
 * object is returned for neutral, finite PCM that already fits under the
 * ceiling; this is both a useful fast path and an exact neutral bypass.
 */
export function processClickPCM(
  pcm: ClickPCM,
  positionOrOptions: TonePosition | ToneProcessOptions = NEUTRAL,
  sampleRateOrOptions?: number | ToneProcessOptions,
): ClickPCM {
  const parsed = parseProcessArguments(positionOrOptions, sampleRateOrOptions);
  const neutral = parsed.position.x === 0 && parsed.position.y === 0;
  if (neutral && linkedPeak(pcm) <= effectiveCeiling(parsed.ceiling)
    && (!isStereo(pcm)
      ? hasOnlyFiniteSamples(pcm)
      : hasOnlyFiniteSamples(pcm.left) && hasOnlyFiniteSamples(pcm.right))) {
    return pcm;
  }

  if (neutral) return limitLinkedPCM(pcm, parsed.ceiling);
  const weights = mapTonePositionToWeights(parsed.position);
  const shaped: ClickPCM = isStereo(pcm)
    ? {
        left: processChannel(pcm.left, weights, parsed.sampleRate),
        right: processChannel(pcm.right, weights, parsed.sampleRate),
      }
    : processChannel(pcm, weights, parsed.sampleRate);
  return limitLinkedPCM(shaped, parsed.ceiling);
}

/** Descriptive aliases retained so callers need not know the implementation's
 * historical "click PCM" terminology. */
export const processMetronomeTone = processClickPCM;
export const applyMetronomeTone = processClickPCM;
export const processMetronomeClick = processClickPCM;

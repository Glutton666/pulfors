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

/**
 * Maps distance from the pad centre to audible effect strength. A small centre
 * dead-zone preserves the exact neutral sound, then smoothstep avoids a sudden
 * jump as a finger leaves the centre.
 */
export function toneEffectIntensity(position?: TonePosition | null): number {
  const p = sanitizeTonePosition(position);
  const distance = Math.max(Math.abs(p.x), Math.abs(p.y));
  const deadZone = 0.05;
  if (distance <= deadZone) return 0;
  const t = Math.min(1, (distance - deadZone) / (1 - deadZone));
  return t * t * (3 - 2 * t);
}

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

/**
 * Scans a channel once for both its peak (of finite samples only, matching
 * the previous peakOf behaviour) and whether every sample is finite. The
 * common no-op path used to do these as two separate full-array passes.
 */
function scanChannel(pcm: Float32Array): { peak: number; allFinite: boolean } {
  let peak = 0;
  let allFinite = true;
  for (let i = 0; i < pcm.length; i++) {
    const value = pcm[i];
    if (Number.isFinite(value)) {
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
    } else {
      allFinite = false;
    }
  }
  return { peak, allFinite };
}

/**
 * True when a channel (or, for stereo, both channels) is already finite and
 * under the ceiling — the common no-op case for both limitLinkedPCM and
 * processClickPCM's neutral fast path. One scanChannel pass per channel.
 */
function isUnderCeiling(pcm: ClickPCM, ceiling: number): boolean {
  if (!isStereo(pcm)) {
    const { peak, allFinite } = scanChannel(pcm);
    return peak <= ceiling && allFinite;
  }
  const l = scanChannel(pcm.left);
  const r = scanChannel(pcm.right);
  return Math.max(l.peak, r.peak) <= ceiling && l.allFinite && r.allFinite;
}

/**
 * Applies a sample-linked envelope limiter to mono or stereo PCM.
 *
 * In stereo each frame uses the louder channel to calculate one shared gain,
 * preserving the stereo image. Attack is immediate at the ceiling and release
 * is short, so boosted click body remains louder without a discontinuity when
 * a peak first crosses the ceiling.
 */
export function limitLinkedPCM(pcm: ClickPCM, ceiling = MAX_CEILING): ClickPCM {
  const outputCeiling = effectiveCeiling(ceiling);
  if (isUnderCeiling(pcm, outputCeiling)) return pcm;
  if (!isStereo(pcm)) {
    const out = new Float32Array(pcm.length);
    let gain = 1;
    for (let i = 0; i < pcm.length; i++) {
      const sample = Number.isFinite(pcm[i]) ? pcm[i] : 0;
      const magnitude = Math.abs(sample);
      const desiredGain = magnitude > outputCeiling ? outputCeiling / magnitude : 1;
      gain = desiredGain < gain ? desiredGain : gain + (desiredGain - gain) * 0.04;
      out[i] = Math.max(-outputCeiling, Math.min(outputCeiling, sample * gain));
    }
    return out;
  }
  const length = Math.max(pcm.left.length, pcm.right.length);
  const left = new Float32Array(pcm.left.length);
  const right = new Float32Array(pcm.right.length);
  let gain = 1;
  for (let i = 0; i < length; i++) {
    const l = i < pcm.left.length && Number.isFinite(pcm.left[i]) ? pcm.left[i] : 0;
    const r = i < pcm.right.length && Number.isFinite(pcm.right[i]) ? pcm.right[i] : 0;
    const framePeak = Math.max(Math.abs(l), Math.abs(r));
    const desiredGain = framePeak > outputCeiling ? outputCeiling / framePeak : 1;
    gain = desiredGain < gain ? desiredGain : gain + (desiredGain - gain) * 0.04;
    if (i < left.length) left[i] = l * gain;
    if (i < right.length) right[i] = r * gain;
  }
  return { left, right };
}

function processChannel(
  source: Float32Array,
  weights: ToneWeights,
  sampleRate: number,
  intensity: number,
): Float32Array {
  const tailSamples = Math.round(sampleRate * 0.075);
  const out = new Float32Array(source.length + tailSamples);
  if (source.length === 0) return out;

  // One-pole low-pass provides complementary low/high components without a
  // potentially unstable high-order filter.  The cutoff leaves enough
  // distinction for ordinary click samples at common sample rates.
  const lowAlpha = Math.exp((-2 * Math.PI * 1_800) / sampleRate);
  let lowPass = 0;
  let previousResonator = 0;
  let previousResonator2 = 0;
  const resonanceFrequency = Math.min(1_500, sampleRate * 0.18);
  const resonanceRadius = 0.9985; // safely inside the unit circle, with an audible tail
  const resonanceAngle = (2 * Math.PI * resonanceFrequency) / sampleRate;
  const resonanceFeedback = 2 * resonanceRadius * Math.cos(resonanceAngle);
  const resonanceDamping = 0.025;

  for (let i = 0; i < out.length; i++) {
    const input = i < source.length && Number.isFinite(source[i]) ? source[i] : 0;
    lowPass = (1 - lowAlpha) * input + lowAlpha * lowPass;
    const highPass = input - lowPass;

    // Each corner is a complete, deliberately distinct voicing. Interpolating
    // between the four outputs is more audible than adding small EQ offsets to
    // the same dry click.
    const attackEnvelope = Math.exp(-i / (sampleRate * 0.0018));
    const attackShape = input * (0.12 + 3.4 * attackEnvelope);
    const highShape = 3 * highPass + 0.08 * lowPass;
    const lowShape = 2.4 * lowPass + 0.08 * highPass;

    const resonator = resonanceFeedback * previousResonator
      - resonanceRadius * resonanceRadius * previousResonator2
      + resonanceDamping * input;
    previousResonator2 = previousResonator;
    previousResonator = Number.isFinite(resonator) ? resonator : 0;
    const resonanceShape = 0.35 * input + 8 * previousResonator;
    const blended = weights.attack * attackShape
      + weights.high * highShape
      + weights.resonance * resonanceShape
      + weights.low * lowShape;
    const value = input + intensity * (blended - input);
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
  if (neutral && isUnderCeiling(pcm, effectiveCeiling(parsed.ceiling))) {
    return pcm;
  }

  if (neutral) return limitLinkedPCM(pcm, parsed.ceiling);
  const weights = mapTonePositionToWeights(parsed.position);
  const intensity = toneEffectIntensity(parsed.position);
  if (intensity === 0) return limitLinkedPCM(pcm, parsed.ceiling);
  const shaped: ClickPCM = isStereo(pcm)
    ? {
        left: processChannel(pcm.left, weights, parsed.sampleRate, intensity),
        right: processChannel(pcm.right, weights, parsed.sampleRate, intensity),
      }
    : processChannel(pcm, weights, parsed.sampleRate, intensity);
  return limitLinkedPCM(shaped, parsed.ceiling);
}

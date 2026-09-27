import {
  getRenderSampleRate,
  releaseRenderedWav,
  resampleForPlaybackSpeed,
  saveRenderedWav,
} from "./audio-renderer";
import type {
  ClickPCMs,
  RenderMeasureParams,
  SamplePCMEntry,
  TickInfo,
} from "./audio-renderer";
import type { MetroChannel, SampleChannel } from "./stereo-channel";
import type { SparseClipDescriptor } from "../modules/sparse-metronome/src";

const MAX_EVENTS = 256;
const MAX_WAV_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_WAV_BYTES = 256 * 1024 * 1024;
const MAX_PERIOD_SECONDS = 60 * 60;
const MAX_EVENT_SECONDS = 30 * 60;

let nextPreparationId = 0;
let retainedWavBytes = 0;

type Voice = {
  uri: string;
  durationFrames: number;
  wavBytes: number;
};

type PrepareSparseEventsOptions = {
  /** AbortSignal for cancelling PCM preparation and WAV writes. */
  signal?: AbortSignal;
  /** Additional render-lifecycle cancellation check. */
  shouldAbort?: () => boolean;
};

export type PreparedSparseEvents = {
  clipDescriptors: SparseClipDescriptor[];
  periodFrames: number;
  dispose(): void;
};

type SparseEventRenderParams = Omit<RenderMeasureParams, "shouldAbort"> & {
  outputGain: number;
};

function checkAborted(options: PrepareSparseEventsOptions): void {
  if (options.signal?.aborted || options.shouldAbort?.()) {
    throw new Error("RENDER_ABORTED");
  }
}

function requireFiniteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite, non-negative number.`);
  }
  return value;
}

function routePCM(
  pcm: Float32Array,
  gain: number,
  channel: SampleChannel,
): Float32Array | { left: Float32Array; right: Float32Array } {
  if (!Number.isFinite(gain) || gain < 0) {
    throw new RangeError("Sparse audio gain must be finite and non-negative.");
  }
  let audible = false;
  const mono = new Float32Array(pcm.length);
  for (let frame = 0; frame < pcm.length; frame++) {
    const sample = pcm[frame];
    if (!Number.isFinite(sample)) {
      throw new RangeError("Sparse audio PCM contains a non-finite sample.");
    }
    const scaled = sample * gain;
    if (!Number.isFinite(scaled)) {
      throw new RangeError("Sparse audio gain produced a non-finite sample.");
    }
    mono[frame] = scaled;
    if (scaled !== 0) audible = true;
  }
  if (!audible) return new Float32Array(0);
  if (channel === "both") return mono;

  const left = channel === "left" ? mono : new Float32Array(mono.length);
  const right = channel === "right" ? mono : new Float32Array(mono.length);
  return { left, right };
}

function clickPCMForTick(
  tick: TickInfo,
  clickPCMs: ClickPCMs,
  layerClickPCMs?: Map<string, ClickPCMs>,
): Float32Array {
  let sounds = clickPCMs;
  if ((tick.layerIndex ?? 0) > 0 && layerClickPCMs) {
    sounds = (tick.layerSoundSet ? layerClickPCMs.get(tick.layerSoundSet) : undefined)
      ?? layerClickPCMs.get(`#${tick.layerIndex ?? 0}`)
      ?? clickPCMs;
  }
  if (tick.type === "strong") return sounds.strong;
  if (tick.type === "accent") return sounds.high;
  return sounds.low;
}

function sampleKeyForTick(tick: TickInfo, slot: string): string {
  return `${tick.beat}-${tick.subBeat}${slot}`;
}

function trimmedSample(sample: SamplePCMEntry, speed: number): Float32Array {
  const rate = getRenderSampleRate();
  requireFiniteNonNegative(sample.trimStartMs, "Sample trim start");
  requireFiniteNonNegative(sample.trimDurationMs, "Sample trim duration");
  const trimStart = Math.round((sample.trimStartMs / 1000) * rate);
  const trimLength = sample.trimDurationMs > 0
    ? Math.round((sample.trimDurationMs / 1000) * rate)
    : sample.pcm.length - trimStart;
  const start = Math.min(trimStart, sample.pcm.length);
  const end = Math.min(start + trimLength, sample.pcm.length);
  return resampleForPlaybackSpeed(sample.pcm.subarray(start, end), speed);
}

function createPreparationToken(id: number): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  const entropy = randomUUID ?? Math.random().toString(36).slice(2);
  return `${Date.now()}_${id}_${entropy}`;
}

/**
 * Converts a measure's click/sample inputs into individually scheduled event
 * WAVs. Repeated uses of the same voice share one private WAV; sample tails are
 * kept intact and may extend past the period boundary.
 */
export async function prepareSparseEvents(
  params: SparseEventRenderParams,
  options: PrepareSparseEventsOptions = {},
): Promise<PreparedSparseEvents> {
  const sampleRate = getRenderSampleRate();
  const { schedule, measureDurationMs } = params;
  if (!Number.isFinite(measureDurationMs) || measureDurationMs <= 0) {
    throw new RangeError("Sparse playback measure duration must be finite and positive.");
  }
  const periodFrames = Math.ceil((measureDurationMs / 1000) * sampleRate);
  if (!Number.isSafeInteger(periodFrames) || periodFrames < 1) {
    throw new RangeError("Sparse playback period is outside the supported frame range.");
  }
  if (periodFrames > sampleRate * MAX_PERIOD_SECONDS) {
    throw new RangeError("Sparse playback period exceeds Android's one-hour limit.");
  }
  const clickGain = requireFiniteNonNegative(params.clickVolume, "Click volume")
    * requireFiniteNonNegative(params.outputGain, "Output volume");
  const sampleGain = requireFiniteNonNegative(params.sampleVolume, "Sample volume")
    * params.outputGain;
  if (!Number.isFinite(clickGain) || !Number.isFinite(sampleGain)) {
    throw new RangeError("Sparse audio volume multiplication overflowed.");
  }

  const preparationId = nextPreparationId++;
  const fileToken = createPreparationToken(preparationId);
  const voices = new Map<string, Voice>();
  const clipDescriptors: SparseClipDescriptor[] = [];
  const ownedUris: string[] = [];
  const objectIds = new WeakMap<Float32Array, number>();
  let nextObjectId = 0;
  let reservedBytes = 0;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const uri of ownedUris) releaseRenderedWav(uri);
    ownedUris.length = 0;
    retainedWavBytes -= reservedBytes;
    reservedBytes = 0;
  };

  const objectId = (pcm: Float32Array): number => {
    let id = objectIds.get(pcm);
    if (id === undefined) {
      id = nextObjectId++;
      objectIds.set(pcm, id);
    }
    return id;
  };

  const getVoice = async (
    cacheKey: string,
    pcm: Float32Array,
    gain: number,
    channel: SampleChannel,
  ): Promise<Voice | null> => {
    const existing = voices.get(cacheKey);
    if (existing) return existing;
    const routed = routePCM(pcm, gain, channel);
    const durationFrames = routed instanceof Float32Array
      ? routed.length
      : routed.left.length;
    if (durationFrames === 0) return null;
    if (durationFrames > sampleRate * MAX_EVENT_SECONDS) {
      throw new RangeError("Sparse audio event exceeds Android's 30-minute duration limit.");
    }
    const channels = routed instanceof Float32Array ? 1 : 2;
    const wavBytes = 44 + durationFrames * channels * 2;
    if (wavBytes > MAX_WAV_BYTES) {
      throw new RangeError("Sparse audio event exceeds Android's 128 MiB WAV limit.");
    }
    // retainedWavBytes already includes files reserved by this preparation.
    if (retainedWavBytes + wavBytes > MAX_TOTAL_WAV_BYTES) {
      throw new RangeError("Prepared sparse WAVs exceed Android's 256 MiB retained-file limit.");
    }
    reservedBytes += wavBytes;
    retainedWavBytes += wavBytes;
    try {
      checkAborted(options);
      const uri = await saveRenderedWav(
        routed,
        `sparse_event_${fileToken}_${voices.size}.wav`,
      );
      ownedUris.push(uri);
      checkAborted(options);
      if (!uri.startsWith("file://")) {
        throw new Error("Sparse event WAVs must be app-private local files.");
      }
      const voice = { uri, durationFrames, wavBytes };
      voices.set(cacheKey, voice);
      return voice;
    } catch (error) {
      // A file may have been created before cancellation or URI validation.
      // It is owned by this preparation and released by dispose().
      throw error;
    }
  };

  const addEvent = async (
    tick: TickInfo,
    slot: string,
    cacheKey: string,
    pcm: Float32Array,
    gain: number,
    channel: SampleChannel,
  ) => {
    checkAborted(options);
    const frame = Math.round((tick.time / 1000) * sampleRate);
    const startFrame = frame >= periodFrames ? frame % periodFrames : frame;
    const voice = await getVoice(cacheKey, pcm, gain, channel);
    if (!voice) return;
    if (clipDescriptors.length >= MAX_EVENTS) {
      throw new RangeError(`Sparse playback exceeds Android's ${MAX_EVENTS}-event limit.`);
    }
    clipDescriptors.push({
      id: `sparse-event-${preparationId}-${clipDescriptors.length}-${slot}`,
      uri: voice.uri,
      startFrame,
      durationFrames: voice.durationFrames,
    });
  };

  try {
    if (retainedWavBytes > MAX_TOTAL_WAV_BYTES) {
      throw new RangeError("Prepared sparse WAVs exceed Android's 256 MiB retained-file limit.");
    }
    for (const tick of schedule) {
      checkAborted(options);
      if (!Number.isFinite(tick.time) || tick.time < 0 || tick.time > measureDurationMs) {
        throw new RangeError("Sparse playback tick time must be finite and within its measure.");
      }
      if (tick.type === "mute") continue;

      const metroChannel: MetroChannel =
        params.metroChannelsByBeat?.[String(tick.beat)] ?? params.metronomeChannel ?? "both";
      if (metroChannel !== "off" && clickGain > 0) {
        const click = clickPCMForTick(tick, params.clickPCMs, params.layerClickPCMs);
        const channel = metroChannel as SampleChannel;
        await addEvent(
          tick,
          "click",
          `click:${objectId(click)}:${clickGain}:${channel}`,
          click,
          clickGain,
          channel,
        );
      }

      if (tick.repeatIteration !== 0 || tick.barRepeatIteration !== 0) continue;
      for (const slot of ["", "~1", "~2"]) {
        const key = sampleKeyForTick(tick, slot);
        const sample = params.samplePCMs.get(key);
        if (!sample) continue;
        const perSampleGain = params.sampleVolumes?.[key] ?? 1;
        requireFiniteNonNegative(perSampleGain, `Sample volume for ${key}`);
        const gain = sampleGain * perSampleGain;
        if (!Number.isFinite(gain)) {
          throw new RangeError(`Sample volume multiplication overflowed for ${key}.`);
        }
        if (gain === 0) continue;
        const speed = params.sampleSpeeds?.[key] ?? 1;
        if (!Number.isFinite(speed)) {
          throw new RangeError(`Sample speed for ${key} must be finite.`);
        }
        const channel = params.sampleChannels?.[key] ?? "both";
        const pcm = trimmedSample(sample, speed);
        const cacheKey = `sample:${objectId(sample.pcm)}:${sample.trimStartMs}:${sample.trimDurationMs}:${speed}:${gain}:${channel}`;
        await addEvent(tick, slot || "sample", cacheKey, pcm, gain, channel);
      }
    }
    checkAborted(options);
    return { clipDescriptors, periodFrames, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
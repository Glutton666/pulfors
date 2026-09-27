import {
  getRenderSampleRate,
  releaseRenderedWav,
  saveRenderedWav,
} from "./audio-renderer";
import type { SparseClipDescriptor } from "../modules/sparse-metronome/src";
import {
  extractSparseAudibleIntervals,
  type RenderedMeasurePCM,
} from "./audio-sparse-intervals";

const MAX_CLIP_SEGMENTS = 256;
const MAX_WAV_BYTES = 1024 * 1024;
const MAX_TOTAL_WAV_BYTES = 16 * 1024 * 1024;
const MAX_PERIOD_SECONDS = 60 * 60;
let nextFileNonce = 0;
let ownedPreparedWavBytes = 0;

export interface PrepareSparseClipOptions {
  signal?: AbortSignal;
  /**
   * Custom samples are not supported by Android sparse playback. The adapter
   * receives mixed PCM, so callers must identify custom sample configurations.
   */
  hasCustomSamples?: boolean;
}

export interface PreparedSparseClips {
  clipDescriptors: SparseClipDescriptor[];
  periodFrames: number;
  dispose(): void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("EXPORT_ABORTED");
}

function createFileToken(preparationId: number): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  const entropy = randomUUID ?? Math.random().toString(36).slice(2);
  return `${Date.now()}_${preparationId}_${entropy}`;
}

function channelsOf(pcm: RenderedMeasurePCM): Float32Array[] {
  return pcm instanceof Float32Array ? [pcm] : [pcm.left, pcm.right];
}

function slicePCM(
  channels: Float32Array[],
  startFrame: number,
  endFrame: number,
): Float32Array | { left: Float32Array; right: Float32Array } {
  if (channels.length === 1) return channels[0].slice(startFrame, endFrame);
  return {
    left: channels[0].slice(startFrame, endFrame),
    right: channels[1].slice(startFrame, endFrame),
  };
}

function descriptorParts(
  interval: { startFrame: number; endFrame: number },
  periodFrames: number,
  intervalIndex: number,
  preparationId: number,
): Array<{
  startFrame: number;
  endFrame: number;
  wrapGroupId?: string;
  wrapRole?: "head" | "tail";
}> {
  if (interval.endFrame <= periodFrames) {
    return [{ startFrame: interval.startFrame, endFrame: interval.endFrame }];
  }

  const wrapGroupId = `sparse-wrap-${preparationId}-${intervalIndex}`;
  return [
    {
      startFrame: 0,
      endFrame: interval.endFrame - periodFrames,
      wrapGroupId,
      wrapRole: "head",
    },
    {
      startFrame: interval.startFrame,
      endFrame: periodFrames,
      wrapGroupId,
      wrapRole: "tail",
    },
  ];
}

/**
 * Converts final rendered PCM into private, short PCM16 WAV clips suitable
 * for SparseMetronome.prepare. No continuous-audio fallback is attempted.
 */
export async function prepareSparseClipFiles(
  pcm: RenderedMeasurePCM,
  options: PrepareSparseClipOptions = {},
): Promise<PreparedSparseClips> {
  const sampleRate = getRenderSampleRate();
  const channels = channelsOf(pcm);
  const periodFrames = channels[0].length;
  if (channels.some((channel) => channel.length !== periodFrames)) {
    throw new RangeError("Stereo PCM channels must have matching lengths");
  }

  if (options.hasCustomSamples) {
    throw new Error("Android sparse playback does not support custom samples.");
  }
  if (periodFrames > sampleRate * MAX_PERIOD_SECONDS) {
    throw new Error("This rendered loop exceeds Android sparse playback's one-hour period limit.");
  }

  throwIfAborted(options.signal);
  const { intervals } = extractSparseAudibleIntervals(pcm);
  if (intervals.length === 0) return { clipDescriptors: [], periodFrames, dispose() {} };

  const preparationId = nextFileNonce++;
  const parts = intervals.flatMap((interval, index) =>
    descriptorParts(interval, periodFrames, index, preparationId),
  );
  if (parts.length > MAX_CLIP_SEGMENTS) {
    throw new Error(
      `This pattern needs ${parts.length} clip segments; Android sparse playback supports at most ${MAX_CLIP_SEGMENTS}. Simplify the pattern.`,
    );
  }

  const bytesPerFrame = channels.length * 2;
  const maxFramesPerClip = Math.floor((MAX_WAV_BYTES - 44) / bytesPerFrame);
  let totalWavBytes = 0;
  for (const part of parts) {
    const durationFrames = part.endFrame - part.startFrame;
    if (durationFrames < 1) {
      throw new Error("A wrapping interval produced an empty clip segment.");
    }
    if (durationFrames > maxFramesPerClip) {
      throw new Error(
        "An audible region is too long for Android sparse playback's per-file 1 MiB WAV limit. Long or custom sample tails are not supported.",
      );
    }
    totalWavBytes += 44 + durationFrames * bytesPerFrame;
    if (totalWavBytes > MAX_TOTAL_WAV_BYTES) {
      throw new Error(
        "This pattern's WAV clips exceed Android sparse playback's 16 MiB total preloaded-file limit.",
      );
    }
  }

  const clipDescriptors: SparseClipDescriptor[] = [];
  const ownedUris: string[] = [];
  let disposed = false;
  let bytesReserved = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const uri of ownedUris) releaseRenderedWav(uri);
    ownedUris.length = 0;
    if (bytesReserved) {
      ownedPreparedWavBytes -= totalWavBytes;
      bytesReserved = false;
    }
  };

  if (ownedPreparedWavBytes + totalWavBytes > MAX_TOTAL_WAV_BYTES) {
    throw new Error(
      "Prepared sparse WAVs would exceed Android's 16 MiB total preloaded-file limit across sessions.",
    );
  }
  ownedPreparedWavBytes += totalWavBytes;
  bytesReserved = true;

  try {
    for (let index = 0; index < parts.length; index++) {
      throwIfAborted(options.signal);
      const part = parts[index];
      const durationFrames = part.endFrame - part.startFrame;
      const filename = `sparse_clip_${createFileToken(preparationId)}_${index}.wav`;
      const uri = await saveRenderedWav(
        slicePCM(channels, part.startFrame, part.endFrame),
        filename,
      );
      ownedUris.push(uri);
      throwIfAborted(options.signal);
      if (!uri.startsWith("file://")) {
        throw new Error("Sparse clips must be written as app-private local WAV files.");
      }
      clipDescriptors.push({
        id: `sparse-clip-${preparationId}-${index}`,
        uri,
        startFrame: part.startFrame,
        durationFrames,
        ...(part.wrapGroupId ? {
          wrapGroupId: part.wrapGroupId,
          wrapRole: part.wrapRole,
        } : {}),
      });
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return { clipDescriptors, periodFrames, dispose };
}
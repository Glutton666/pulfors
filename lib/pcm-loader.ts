import { decodeSampleFile, loadAssetPCM } from "./audio-renderer";

export type PCMSource =
  | number
  | string
  | { kind: "asset"; source: number | string };
export type PCMFailureKind = "cancelled" | "decode-failed";

export class PCMLoadError extends Error {
  readonly kind: PCMFailureKind;
  constructor(kind: PCMFailureKind, message: string) {
    super(message);
    this.name = "PCMLoadError";
    this.kind = kind;
  }
}

export function isPCMCancelled(error: unknown): boolean {
  return error instanceof PCMLoadError
    ? error.kind === "cancelled"
    : (error as Error)?.name === "AbortError"
      || (error as Error)?.message === "RENDER_ABORTED";
}

/** The only production boundary for decoding/resampling PCM. */
export async function loadPCM(
  source: PCMSource,
  signal?: AbortSignal,
): Promise<Float32Array> {
  if (signal?.aborted) throw new PCMLoadError("cancelled", "PCM load cancelled");
  try {
    const assetSource = typeof source === "object" ? source.source : source;
    const pcm = typeof source === "string"
      ? await decodeSampleFile(source, signal)
      : await loadAssetPCM(assetSource, signal);
    if (signal?.aborted) throw new PCMLoadError("cancelled", "PCM load cancelled");
    if (!pcm || pcm.length === 0) {
      throw new PCMLoadError("decode-failed", "PCM decoder returned no samples");
    }
    for (let i = 0; i < pcm.length; i++) {
      if (!Number.isFinite(pcm[i])) {
        throw new PCMLoadError("decode-failed", "PCM decoder returned non-finite samples");
      }
    }
    return pcm;
  } catch (error) {
    if (isPCMCancelled(error)) {
      throw error instanceof PCMLoadError
        ? error
        : new PCMLoadError("cancelled", "PCM load cancelled");
    }
    throw error instanceof PCMLoadError
      ? error
      : new PCMLoadError("decode-failed", String((error as Error)?.message ?? error));
  }
}
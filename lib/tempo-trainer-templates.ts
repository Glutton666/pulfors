import { prepareSparseEvents } from "./audio-sparse-event-preparation";
import type { RenderMeasureParams } from "./audio-renderer";
import type { TrainerTemplates, TrainerVoice } from "./tempo-trainer-kernel";

/** Reuses the actual click, sample, speech, channel and gain preparation path. */
export async function prepareTrainerTemplates(
  params: RenderMeasureParams, bpm: number, signal?: AbortSignal,
): Promise<TrainerTemplates> {
  let retainedBytes = 0;
  const collect = async (accent: boolean): Promise<TrainerVoice[]> => {
    const voices = new Map<string, { left: Float32Array; right: Float32Array }>();
    const first = params.schedule.find(t => (t.layerIndex ?? 0) === 0 && t.beat === 0 && t.subBeat === 0);
    const schedule = accent && first && first.type !== "mute"
      ? params.schedule.map(t => t === first ? { ...t, type: "strong" as const } : t)
      : params.schedule;
    const prepared = await prepareSparseEvents({ ...params, schedule, outputGain: 1 }, {
      signal,
      storePCM: pcm => {
        retainedBytes += pcm instanceof Float32Array ? pcm.byteLength : pcm.left.byteLength + pcm.right.byteLength;
        if (retainedBytes > 32 * 1024 * 1024) throw new Error("Trainer PCM exceeds the 32 MiB memory limit.");
        const id = `memory:${voices.size}`;
        voices.set(id, pcm instanceof Float32Array ? { left: pcm, right: pcm } : pcm);
        return id;
      },
    });
    try {
      return prepared.clipDescriptors.map(event => ({
        at: event.startFrame / prepared.periodFrames,
        ...voices.get(event.uri)!,
      })).sort((a, b) => a.at - b.at);
    } finally { prepared.dispose(); }
  };
  const normal = await collect(false);
  const accent = await collect(true);
  // Reject excessive tail overlap up front rather than allocating without a
  // bound on the real-time thread. Existing sparse/WAV size limits also apply.
  const shortestPeriod = params.measureDurationMs / 1000 * bpm / 300;
  const overlaps = normal.reduce((n, v) => n + Math.ceil(v.left.length / 44100 / shortestPeriod), 0);
  if (overlaps > 256) throw new Error("Trainer sample tails exceed the 256-voice limit.");
  return { normal, accent, baseBpm: bpm, periodSeconds: params.measureDurationMs / 1000 };
}

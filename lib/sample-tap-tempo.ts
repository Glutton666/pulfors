export const SAMPLE_TAP_TEMPO_MIN_BPM = 30;
export const SAMPLE_TAP_TEMPO_MAX_BPM = 300;
export const SAMPLE_TAP_TEMPO_RESET_MS = 2500;
export const SAMPLE_TAP_TEMPO_MAX_TAPS = 8;

export interface SampleTapTempoResult {
  tapTimes: number[];
  bpm: number | null;
  restarted: boolean;
}

export function registerSampleTempoTap(
  previousTapTimes: readonly number[],
  now: number,
): SampleTapTempoResult {
  const lastTap = previousTapTimes[previousTapTimes.length - 1];
  const restarted = lastTap !== undefined && now - lastTap > SAMPLE_TAP_TEMPO_RESET_MS;
  const usablePreviousTaps = restarted ? [] : previousTapTimes.filter((tap) => tap <= now);
  const tapTimes = [...usablePreviousTaps, now].slice(-SAMPLE_TAP_TEMPO_MAX_TAPS);

  if (tapTimes.length < 2) {
    return { tapTimes, bpm: null, restarted };
  }

  const elapsed = tapTimes[tapTimes.length - 1] - tapTimes[0];
  const averageInterval = elapsed / (tapTimes.length - 1);
  const rawBpm = averageInterval > 0 ? Math.round(60000 / averageInterval) : SAMPLE_TAP_TEMPO_MAX_BPM;
  const bpm = Math.max(SAMPLE_TAP_TEMPO_MIN_BPM, Math.min(SAMPLE_TAP_TEMPO_MAX_BPM, rawBpm));

  return { tapTimes, bpm, restarted };
}
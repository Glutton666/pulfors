import { realFFT } from "./signal-analysis";
import { signalGateRms } from "./signal-noise-gate";

export const LUG_MIN_HZ = 30;
export const LUG_MAX_HZ = 450;
export const LUG_FILTER_FRACTION = 0.2;

export type LugReading =
  | { kind: "waiting" | "measuring" | "retry" }
  | { kind: "hit"; frequency: number };

export interface LugReferenceCandidate {
  frequency: number;
  strikes: number;
}

const WAITING: LugReading = { kind: "waiting" };
const MEASURING: LugReading = { kind: "measuring" };
const RETRY: LugReading = { kind: "retry" };
const HIT_SECONDS = 0.36;
const FRAME_SECONDS = 0.13;
const FRAME_OFFSETS = [0.025, 0.075, 0.125, 0.175, 0.225];
const roundHz = (hz: number) => Math.round(hz * 10) / 10;
const nearby = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, a * 0.012);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const center = sorted.length >> 1;
  return sorted.length % 2 ? sorted[center] : (sorted[center - 1] + sorted[center]) / 2;
};

export function lugFrequencyBand(reference: number | null): [number, number] {
  return reference === null ? [LUG_MIN_HZ, LUG_MAX_HZ] : [
    Math.max(LUG_MIN_HZ, reference * (1 - LUG_FILTER_FRACTION)),
    Math.min(LUG_MAX_HZ, reference * (1 + LUG_FILTER_FRACTION)),
  ];
}

/** Find a recurring resonance after the attack, not the spectrum maximum of one frame. */
function analyzeHit(pcm: Float32Array, rate: number, gate: number, reference: number | null) {
  const length = Math.round(rate * FRAME_SECONDS);
  const fftSize = 2 ** Math.ceil(Math.log2(length * 4));
  const binHz = rate / fftSize;
  const [minHz, maxHz] = lugFrequencyBand(reference);
  const clusters: { frequencies: number[]; levels: number[]; lastFrame: number }[] = [];
  const window = Float32Array.from({ length }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1)));
  for (let frame = 0; frame < FRAME_OFFSETS.length; frame++) {
    const from = Math.round(rate * FRAME_OFFSETS[frame]);
    if (from + length > pcm.length) break;
    const spectrumInput = new Float32Array(fftSize);
    let sum = 0;
    let power = 0;
    for (let i = 0; i < length; i++) {
      const sample = pcm[from + i];
      sum += sample;
      power += sample * sample;
    }
    const mean = sum / length;
    if (Math.sqrt(Math.max(0, power / length - mean * mean)) < gate * 0.32) continue;
    for (let i = 0; i < length; i++) spectrumInput[i] = (pcm[from + i] - mean) * window[i];
    const magnitude = realFFT(spectrumInput);
    const low = Math.max(2, Math.floor(LUG_MIN_HZ / binHz));
    const high = Math.min(magnitude.length - 2, Math.ceil(LUG_MAX_HZ / binHz));
    const noise = median(Array.from(magnitude.subarray(low, high + 1)));
    let strongest = -Infinity;
    // Compare against out-of-band leakage too; a loud wrong note must not
    // produce a reading from one of its quiet spectral sidelobes.
    for (let i = low; i <= Math.min(magnitude.length - 2, Math.ceil(3000 / binHz)); i++) {
      strongest = Math.max(strongest, magnitude[i]);
    }
    const floor = Math.max(noise + 16, strongest - 30);
    const peaks: { hz: number; db: number }[] = [];
    for (let i = Math.max(low, Math.floor(minHz / binHz)); i <= Math.min(high, Math.ceil(maxHz / binHz)); i++) {
      const left = magnitude[i - 1], db = magnitude[i], right = magnitude[i + 1];
      if (db < floor || db <= left || db < right) continue;
      const curvature = left - 2 * db + right;
      const hz = (i + Math.max(-0.5, Math.min(0.5, curvature === 0 ? 0 : 0.5 * (left - right) / curvature))) * binHz;
      if (hz >= minHz && hz <= maxHz) peaks.push({ hz, db });
    }
    for (const { hz, db } of peaks.sort((a, b) => b.db - a.db).slice(0, 6)) {
      const cluster = clusters.find(({ frequencies }) => nearby(median(frequencies), hz));
      if (!cluster) {
        clusters.push({ frequencies: [hz], levels: [db], lastFrame: frame });
      } else if (cluster.lastFrame !== frame) {
        cluster.frequencies.push(hz);
        cluster.levels.push(db);
        cluster.lastFrame = frame;
      }
    }
  }
  return clusters.filter(({ frequencies }) => frequencies.length >= 2)
    .map(({ frequencies, levels }) => ({ hz: median(frequencies), count: frequencies.length, db: median(levels) }))
    .sort((a, b) => b.db - a.db);
}

type Peak = ReturnType<typeof analyzeHit>[number];

/** Sample-clock based; neither path depends on UI updates or recorder chunks. */
function createStrikeStream(onStrike: (peaks: Peak[]) => void) {
  let rate = 0;
  let lastSensitivity = -1;
  let quietBlocks = 0;
  let armed = false;
  let blockSamples = 0;
  let blockPower = 0;
  let block: Float32Array = new Float32Array(0);
  let hit: Float32Array | null = null;
  let hitSamples = 0;

  function resetCapture() {
    rate = 0;
    lastSensitivity = -1;
    quietBlocks = 0;
    armed = false;
    blockSamples = 0;
    blockPower = 0;
    hit = null;
    hitSamples = 0;
  }

  function push(samples: Float32Array, sampleRate: number, sensitivity: number, reference: number | null, onState?: (state: LugReading) => void) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) return;
    if (rate !== sampleRate || lastSensitivity !== sensitivity) {
      if (rate !== 0) onState?.(WAITING);
      resetCapture();
      rate = sampleRate;
      lastSensitivity = sensitivity;
      block = new Float32Array(Math.round(rate / 100));
    }
    const gate = signalGateRms(sensitivity);
    if (!Number.isFinite(gate)) return;
    for (let i = 0; i < samples.length; i++) {
      const sample = Number.isFinite(samples[i]) ? samples[i] : 0;
      block[blockSamples++] = sample;
      blockPower += sample * sample;
      if (blockSamples < block.length) continue;
      const rms = Math.sqrt(blockPower / block.length);
      blockSamples = 0;
      blockPower = 0;
      if (hit) {
        const count = Math.min(block.length, hit.length - hitSamples);
        hit.set(block.subarray(0, count), hitSamples);
        hitSamples += count;
        if (hitSamples !== hit.length) continue;
        const pcm = hit;
        hit = null;
        onStrike(analyzeHit(pcm, rate, gate, reference));
        continue;
      }
      if (rms < gate * 0.7) {
        if (++quietBlocks >= 4) armed = true;
      } else {
        quietBlocks = 0;
        if (armed && rms >= gate) {
          hit = new Float32Array(Math.round(rate * HIT_SECONDS));
          hit.set(block);
          hitSamples = block.length;
          armed = false;
          onState?.(MEASURING);
        }
      }
    }
  }
  function flush() {
    if (!hit) return;
    const pcm = hit.subarray(0, hitSamples + blockSamples);
    pcm.set(block.subarray(0, pcm.length - hitSamples), hitSamples);
    hit = null;
    onStrike(analyzeHit(pcm, rate, signalGateRms(lastSensitivity), null));
  }
  return { push, resetCapture, flush };
}

export function createDrumLugMeasurement() {
  let reference: number | null = null;
  let event: LugReading | null = null;
  const stream = createStrikeStream((peaks) => {
    const [best, second] = peaks;
    // Selecting the closest value when two peaks are comparable would bias
    // measured differences toward zero instead of reporting ambiguity.
    event = best && best.count >= 3 && (!second || best.db - second.db >= 6)
      ? { kind: "hit", frequency: roundHz(best.hz) } : RETRY;
  });
  return {
    push(samples: Float32Array, sampleRate: number, sensitivity: number) {
      event = null;
      stream.push(samples, sampleRate, sensitivity, reference, (reading) => { event = reading; });
      return event as LugReading | null;
    },
    setReference(next: number | null) {
      stream.resetCapture();
      reference = next;
    },
    resetCapture: stream.resetCapture,
  };
}

export function createDrumLugDiscovery() {
  const groups: { frequencies: number[]; strikes: number; lastStrike: number }[] = [];
  let strike = 0;
  const stream = createStrikeStream((peaks) => {
    strike++;
    for (const peak of peaks.filter(({ count }) => count >= 3).slice(0, 6)) {
      const group = groups.find(({ frequencies }) => nearby(median(frequencies), peak.hz));
      if (!group) {
        groups.push({ frequencies: [peak.hz], strikes: 1, lastStrike: strike });
      } else if (group.lastStrike !== strike) {
        group.strikes++;
        group.lastStrike = strike;
        // Count all distinct hits, but keep the median sample bounded.
        group.frequencies = [...group.frequencies.slice(-14), peak.hz];
      }
    }
  });
  return {
    push(samples: Float32Array, sampleRate: number, sensitivity: number) {
      stream.push(samples, sampleRate, sensitivity, null);
    },
    finish(): LugReferenceCandidate[] {
      stream.flush();
      return groups.map(({ frequencies, strikes }) => ({ frequency: roundHz(median(frequencies)), strikes }))
        .sort((a, b) => b.strikes - a.strikes || a.frequency - b.frequency).slice(0, 8);
    },
  };
}

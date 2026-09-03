/**
 * Repeatable baseline for the existing web pre-render mixer.
 *
 * Run with:
 *   npx tsx --require ./tests/_stubs/setup.cjs scripts/benchmark-audio-renderer.ts
 *
 * This intentionally measures the current renderMeasure implementation only.
 * The browser benchmark in docs/audio-worklet-benchmark.html measures the
 * isolated worklet-vs-main-thread scheduling failure mode.
 */
import type { RenderMeasureParams, TickInfo } from "../lib/audio-renderer";

const RENDER_SAMPLE_RATE = 44100;
const ITERATIONS = Math.max(20, Number(process.env.AUDIO_BENCH_ITERATIONS ?? 200));

function makePcm(durationMs: number, amplitude: number): Float32Array {
  const pcm = new Float32Array(Math.round((durationMs / 1000) * RENDER_SAMPLE_RATE));
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = Math.sin(i * 0.17) * amplitude * Math.exp(-i / (pcm.length * 0.35));
  }
  return pcm;
}

function makeParams(): RenderMeasureParams {
  const schedule: TickInfo[] = [];
  for (let beat = 0; beat < 4; beat++) {
    for (let subBeat = 0; subBeat < 4; subBeat++) {
      schedule.push({
        time: beat * 250 + subBeat * 62.5,
        type: beat === 0 && subBeat === 0 ? "strong" : "normal",
        beat,
        subBeat,
        repeatIteration: 0,
        barRepeatIteration: 0,
        layerIndex: 0,
      });
    }
  }

  return {
    schedule,
    measureDurationMs: 1000,
    clickPCMs: {
      strong: makePcm(25, 0.8),
      high: makePcm(20, 0.6),
      low: makePcm(16, 0.45),
    },
    samplePCMs: new Map([
      ["0-0", { pcm: makePcm(110, 0.7), trimStartMs: 4, trimDurationMs: 90 }],
      ["1-2", { pcm: makePcm(80, 0.5), trimStartMs: 0, trimDurationMs: 0 }],
    ]),
    clickVolume: 1,
    sampleVolume: 0.7,
    sampleVolumes: { "0-0": 0.8, "1-2": 0.6 },
    sampleSpeeds: { "0-0": 1.25, "1-2": 0.85 },
    metronomeChannel: "both",
    sampleChannels: { "0-0": "left", "1-2": "right" },
  };
}

function bytesForFloatArrays(value: Float32Array | { left: Float32Array; right: Float32Array }): number {
  return value instanceof Float32Array
    ? value.byteLength
    : value.left.byteLength + value.right.byteLength;
}

function collectMemory(): { heapUsed: number; arrayBuffers: number; rss: number } {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    arrayBuffers: usage.arrayBuffers,
    rss: usage.rss,
  };
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

async function main(): Promise<void> {
  // The existing Node stubs use jest.fn() for otherwise-unused RN APIs.
  (globalThis as any).jest ??= {
    fn: (impl = () => undefined) => impl,
  };
  const { renderMeasure } = await import("../lib/audio-renderer");
  const params = makeParams();
  for (let i = 0; i < 10; i++) renderMeasure(params);
  if (typeof global.gc === "function") global.gc();

  const before = collectMemory();
  const started = process.hrtime.bigint();
  let outputBytes = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    outputBytes += bytesForFloatArrays(renderMeasure(params));
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const after = collectMemory();

  console.log(JSON.stringify({
    benchmark: "existing-renderMeasure",
    pattern: "4/4, 16 subdivisions, 2 note samples, stereo channels",
    sampleRate: RENDER_SAMPLE_RATE,
    iterations: ITERATIONS,
    renderedOutputBytesPerIteration: outputBytes / ITERATIONS,
    totalWallMs: Number(elapsedMs.toFixed(2)),
    wallMsPerIteration: Number((elapsedMs / ITERATIONS).toFixed(3)),
    realtimeBudgetMsPerMeasure: 1000,
    realtimeBudgetPercentUsed: Number(((elapsedMs / ITERATIONS) / 1000 * 100).toFixed(3)),
    memoryBefore: {
      heapUsed: formatBytes(before.heapUsed),
      arrayBuffers: formatBytes(before.arrayBuffers),
      rss: formatBytes(before.rss),
    },
    memoryAfter: {
      heapUsed: formatBytes(after.heapUsed),
      arrayBuffers: formatBytes(after.arrayBuffers),
      rss: formatBytes(after.rss),
    },
    memoryDelta: {
      heapUsed: formatBytes(after.heapUsed - before.heapUsed),
      arrayBuffers: formatBytes(after.arrayBuffers - before.arrayBuffers),
      rss: formatBytes(after.rss - before.rss),
    },
  }, null, 2));
}

void main();
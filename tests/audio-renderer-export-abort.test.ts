import { renderMeasureAbortable } from "../lib/audio-renderer";
import assert from "node:assert/strict";

describe("renderMeasureAbortable", () => {
  it("applies per-sample gain for exported audio", async () => {
    const result = await renderMeasureAbortable({
      schedule: [{ beat: 0, subBeat: 0, time: 0, type: "normal", repeatIteration: 0, barRepeatIteration: 0 }],
      measureDurationMs: 1000,
      clickPCMs: {
        strong: new Float32Array([0]),
        high: new Float32Array([0]),
        low: new Float32Array([0]),
      },
      samplePCMs: new Map([["0-0", { pcm: new Float32Array(64).fill(0.8), trimStartMs: 0, trimDurationMs: 0 }]]),
      clickVolume: 0,
      sampleVolume: 1,
      sampleVolumes: { "0-0": 0.25 },
    });
    const pcm = result instanceof Float32Array ? result : result.left;
    assert.ok(Math.abs(pcm[0] - 0.2) < 0.02, `expected export gain 0.2, got ${pcm[0]}`);
  });

  it("observes a timer-driven abort while mixing a long sample", async () => {
    const controller = new AbortController();
    const longSample = new Float32Array(4096 * 12).fill(0.4);
    const pending = renderMeasureAbortable(
      {
        schedule: [{ beat: 0, subBeat: 0, time: 0, type: "normal", repeatIteration: 0, barRepeatIteration: 0 }],
        measureDurationMs: 1000,
        clickPCMs: {
          strong: new Float32Array([0.2]),
          high: new Float32Array([0.2]),
          low: new Float32Array([0.2]),
        },
        samplePCMs: new Map([["0-0", { pcm: longSample, trimStartMs: 0, trimDurationMs: 0 }]]),
        clickVolume: 1,
        sampleVolume: 1,
      },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 0);

    await expect(pending).rejects.toThrow("EXPORT_ABORTED");
  });
});
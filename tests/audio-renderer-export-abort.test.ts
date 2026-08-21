import { renderMeasureAbortable } from "../lib/audio-renderer";

describe("renderMeasureAbortable", () => {
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
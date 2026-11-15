import { prepareTrainerTemplates } from "@/lib/tempo-trainer-templates";
import type { RenderMeasureParams } from "@/lib/audio-renderer";

const pcm = (n: number) => new Float32Array([n]);
function params(): RenderMeasureParams {
  return {
    schedule: [0, 1, 2, 3].map(beat => ({ time: beat * 500, type: "normal", beat, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0 })),
    measureDurationMs: 2000,
    clickPCMs: { high: pcm(0.2), low: pcm(0.1), strong: pcm(0.7) },
    samplePCMs: new Map(), sampleVolume: 1, clickVolume: 1,
  };
}
test("only the first click is replaced; the user's pattern stays unchanged", async () => {
  const p = params();
  const templates = await prepareTrainerTemplates(p, 120);
  expect(templates.normal.map(e => e.left[0])).toEqual([0.1, 0.1, 0.1, 0.1].map(Math.fround));
  expect(templates.accent.map(e => e.left[0])).toEqual([0.7, 0.1, 0.1, 0.1].map(Math.fround));
  expect(p.schedule.map(t => t.type)).toEqual(["normal", "normal", "normal", "normal"]);
});
test("muted first beats and disabled metronome channels stay silent", async () => {
  const p = params();
  p.schedule[0].type = "mute";
  const templates = await prepareTrainerTemplates(p, 120);
  expect(templates.accent).toHaveLength(3);
  expect(templates.accent[0].at).toBeCloseTo(0.25);
  p.metroChannelsByBeat = { "0": "off", "1": "off", "2": "off", "3": "off" };
  expect((await prepareTrainerTemplates(p, 120)).accent).toHaveLength(0);
});
test("stereo routing and user samples are kept when replacing a click", async () => {
  const p = params();
  p.samplePCMs.set("0-0", { pcm: pcm(0.3), trimStartMs: 0, trimDurationMs: 0 });
  p.metronomeChannel = "left";
  p.sampleChannels = { "0-0": "right" };
  const templates = await prepareTrainerTemplates(p, 120);
  expect(templates.accent).toHaveLength(5);
  const first = templates.accent.filter(e => e.at === 0);
  expect(first.map(e => e.left[0])).toEqual([Math.fround(0.7), 0]);
  expect(first.map(e => e.right[0])).toEqual([0, Math.fround(0.3)]);
});
test("preparation cancellation rejects instead of installing stale PCM", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(prepareTrainerTemplates(params(), 120, controller.signal)).rejects.toThrow("RENDER_ABORTED");
});

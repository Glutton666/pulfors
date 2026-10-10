import { emphasizeCountPCM, voiceCountEvent, KOREAN_COUNT_WORDS } from "@/lib/voice-count";
import { renderMeasure, renderMeasureAbortable, type ClickPCMs, type TickInfo } from "@/lib/audio-renderer";
import { AUDIO_OUTPUT_CEILING } from "@/lib/audio-tone-snapshot";

const slot = (beat: number, subBeat = 0, type: TickInfo["type"] = "normal", layerIndex = 0): TickInfo =>
  ({ beat, subBeat, type, time: (beat * 4 + subBeat) * 125, layerIndex, repeatIteration: 0, barRepeatIteration: 0 });
const silent: ClickPCMs = { strong: new Float32Array(1), high: new Float32Array(1), low: new Float32Array(1) };
const roles = (n: number): ClickPCMs => ({
  strong: new Float32Array([n * 0.003]),
  high: new Float32Array([n * 0.002]),
  low: new Float32Array([n * 0.001]),
});
describe("offline count identity and emphasis", () => {
  it("uses the exact Korean ones-digit words, including 10/12/14/16", () => {
    expect(KOREAN_COUNT_WORDS).toEqual(["공", "일", "둘", "삼", "넷", "오", "육", "칠", "팔", "구"]);
    for (const [beat, expected] of [[0, "일"], [9, "공"], [11, "둘"], [13, "넷"], [15, "육"]] as const) {
      expect(KOREAN_COUNT_WORDS[voiceCountEvent(slot(beat), "ko")!.clip]).toBe(expected);
      expect(voiceCountEvent(slot(beat), "en")!.clip).toBe(beat + 1);
    }
  });
  it("counts the first subdivision by basic beat, later slots by ordinal", () => {
    expect([0, 1, 2].map(beat => Array.from({ length: 4 }, (_, sub) => voiceCountEvent(slot(beat, sub), "ko")!.number)))
      .toEqual([[1, 2, 3, 4], [2, 2, 3, 4], [3, 2, 3, 4]]);
    expect(Array.from({ length: 9 }, (_, sub) => voiceCountEvent(slot(15, sub), "ko")!.clip))
      .toEqual([6, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("does not shift after mute or speak an additional rhythm layer", () => {
    expect(voiceCountEvent(slot(0, 0, "mute"), "ko")).toBeNull();
    expect(voiceCountEvent(slot(1), "ko")!.number).toBe(2);
    expect(voiceCountEvent(slot(0, 2, "mute"), "ko")).toBeNull();
    expect(voiceCountEvent(slot(0, 3), "ko")!.number).toBe(4);
    expect(voiceCountEvent(slot(0, 0, "strong", 1), "ko")).toBeNull();
    expect(voiceCountEvent(slot(0), "off")).toBeNull();
  });
  it("emphasizes the actual role, not the first position", () => {
    expect(voiceCountEvent(slot(0), "ko")!.role).toBe("low");
    expect(voiceCountEvent(slot(2, 3, "strong"), "ko")!.role).toBe("strong");
    expect(voiceCountEvent(slot(2, 3, "accent"), "ko")!.role).toBe("high");
    const src = new Float32Array([0.2, 0.5, -0.3, 0]);
    const original = Array.from(src);
    const power = (pcm: Float32Array) => pcm.reduce((sum, v) => sum + v * v, 0);
    expect(power(emphasizeCountPCM(src, "strong"))).toBeGreaterThan(power(emphasizeCountPCM(src, "high")));
    expect(power(emphasizeCountPCM(src, "high"))).toBeGreaterThan(power(emphasizeCountPCM(src, "low")));
    expect(Array.from(src)).toEqual(original);
  });
});
describe("count speech shares rendered onset, stereo routing, limiter and cancellation", () => {
  const base = { clickPCMs: silent, samplePCMs: new Map(), clickVolume: 1, sampleVolume: 0 };
  it.each(["ko", "en"] as const)("voice-only %s removes primary/layer clicks without removing samples", async language => {
    const clicks = { strong: new Float32Array([0.1]), high: new Float32Array([0.1]), low: new Float32Array([0.1]) };
    const params = { ...base, clickPCMs: clicks,
      layerClickPCMs: new Map([["#1", clicks]]),
      schedule: [{ ...slot(0), time: 0 }, { ...slot(0, 1, "normal", 1), time: 100 }],
      measureDurationMs: 500, voiceCountLanguage: language, voiceCountOutput: "voice-only" as const,
      voiceCountPCMs: new Map([[1, roles(1)]]),
      sampleVolume: 1, samplePCMs: new Map([["0-0", { pcm: new Float32Array([0.02]), trimStartMs: 0, trimDurationMs: 0 }]]) };
    const pcm = renderMeasure(params) as Float32Array;
    expect(pcm[0]).toBeCloseTo(0.021);
    expect(pcm[4410]).toBe(0);
    expect(await renderMeasureAbortable(params)).toEqual(pcm);
    const mixed = renderMeasure({ ...params, voiceCountOutput: "mixed" }) as Float32Array;
    expect(mixed[0]).toBeCloseTo(0.121);
    expect(mixed[4410]).toBeCloseTo(0.1);
    const off = renderMeasure({ ...params, voiceCountLanguage: "off" }) as Float32Array;
    expect(off[0]).toBeCloseTo(0.12);
    expect(off[4410]).toBeCloseTo(0.1);
  });
  it("voice-only respects metro-off while independent samples retain their channel", async () => {
    const params = { ...base, schedule: [{ ...slot(0), time: 0 }], measureDurationMs: 500,
      voiceCountLanguage: "ko" as const, voiceCountOutput: "voice-only" as const,
      voiceCountPCMs: new Map([[1, roles(1)]]),
      metroChannelsByBeat: { "0": "off" as const }, sampleVolume: 1,
      sampleChannels: { "0-0": "right" as const },
      samplePCMs: new Map([["0-0", { pcm: new Float32Array([0.02]), trimStartMs: 0, trimDurationMs: 0 }]]) };
    const pcm = renderMeasure(params) as { left: Float32Array; right: Float32Array };
    expect(pcm.left.every(v => v === 0)).toBe(true);
    expect(pcm.right[0]).toBeCloseTo(0.02);
    expect(await renderMeasureAbortable(params)).toEqual(pcm);
  });
  it("speaks once per primary slot and preserves a muted first beat", async () => {
    const schedule = [slot(0, 0, "mute"), slot(0, 1, "strong"), slot(1), slot(1, 0, "strong", 1)];
    const params = { ...base, schedule, measureDurationMs: 2000, voiceCountLanguage: "ko" as const,
      voiceCountPCMs: new Map([[2, roles(2)]]) };
    const sync = renderMeasure(params) as Float32Array;
    const asyncPCM = await renderMeasureAbortable(params) as Float32Array;
    expect(asyncPCM).toEqual(sync);
    expect(sync[0]).toBe(0);
    expect(sync[Math.round(125 / 1000 * 44100)]).toBeCloseTo(0.006);
    // Layer 1 adds zero speech; the basic slot is normal, hence low emphasis.
    expect(sync[Math.round(500 / 1000 * 44100)]).toBeCloseTo(0.002);
  });
  it("keeps all dense 240 BPM × nine-slot onsets without changing tempo", async () => {
    const schedule = Array.from({ length: 9 }, (_, sub) => ({ ...slot(0, sub), time: sub * 250 / 9 }));
    const pcm = await renderMeasureAbortable({ ...base, schedule, measureDurationMs: 250,
      voiceCountLanguage: "en", voiceCountPCMs: new Map(Array.from({ length: 9 }, (_, n) => [n + 1, roles(n + 1)])) }) as Float32Array;
    expect(pcm.length).toBe(Math.ceil(250 / 1000 * 44100) * 2);
    schedule.forEach((tick, n) => expect(pcm[Math.round(tick.time / 1000 * 44100)]).toBeCloseTo((n + 1) * 0.001));
  });
  it("preserves long speech tails over very short looping units, both channels", async () => {
    const tail = new Float32Array(20000).fill(0.001);
    const params = { ...base, schedule: [{ ...slot(0), time: 0 }], measureDurationMs: 100,
      metronomeChannel: "right" as const, voiceCountLanguage: "ko" as const,
      voiceCountPCMs: new Map([[1, { strong: tail, high: tail, low: tail }]]) };
    const sync = renderMeasure(params) as { left: Float32Array; right: Float32Array };
    const asyncPCM = await renderMeasureAbortable(params) as typeof sync;
    expect(asyncPCM).toEqual(sync);
    expect(sync.left.every(v => v === 0)).toBe(true);
    expect(sync.right.every(v => v > 0)).toBe(true);
    expect(Math.max(...sync.right)).toBeLessThanOrEqual(AUDIO_OUTPUT_CEILING);
  });
  it("fails explicitly on missing speech and rejects a cancelled render", async () => {
    const params = { ...base, schedule: [slot(0)], measureDurationMs: 500, voiceCountLanguage: "en" as const };
    expect(() => renderMeasure(params)).toThrow(/Voice count PCM unavailable/);
    const controller = new AbortController(); controller.abort();
    await expect(renderMeasureAbortable(params, controller.signal)).rejects.toThrow();
  });
});

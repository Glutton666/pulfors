import { prepareVoiceCountPCMs } from "@/lib/voice-count-assets";
import { getDecodedPCM } from "@/lib/pcm-cache";
import { createAudioToneSnapshot } from "@/lib/audio-tone-snapshot";

jest.mock("@/lib/pcm-cache", () => ({
  getDecodedPCM: jest.fn(async () => new Float32Array([0.1, -0.1])),
  getClickPCM: jest.fn(async (_key: string, loader: (signal: AbortSignal) => Promise<unknown>, signal?: AbortSignal) =>
    loader(signal ?? new AbortController().signal)),
}));
jest.mock("@/lib/pcm-loader", () => ({ loadPCM: jest.fn() }));

const tick = { time: 0, beat: 0, subBeat: 0, type: "normal" as const };
beforeEach(() => jest.clearAllMocks());
test("each offline language/speaker owns an independent cache identity", async () => {
  for (const language of ["ko", "en"] as const) {
    for (const speaker of ["male", "female"] as const) {
      const controller = new AbortController();
      const clips = await prepareVoiceCountPCMs([tick], language, controller.signal, speaker);
      expect(clips.get(1)?.low.length).toBe(2);
      expect(getDecodedPCM).toHaveBeenLastCalledWith(`voice:${language}:${speaker}:1`, expect.any(Function), controller.signal);
    }
  }
  expect(await prepareVoiceCountPCMs([tick], "off")).toEqual(new Map());
  expect(getDecodedPCM).toHaveBeenCalledTimes(4);
});
test("only strong count receives a slight pitch rise without changing clip duration", async () => {
  const sampleRate = 44100;
  const source = Float32Array.from(
    { length: sampleRate },
    (_, i) => 0.4 * Math.sin(2 * Math.PI * 220 * i / sampleRate),
  );
  jest.mocked(getDecodedPCM).mockResolvedValue(source);
  const roles = (await prepareVoiceCountPCMs([tick], "ko", undefined, "female")).get(1)!;
  const estimatePitch = (pcm: Float32Array) => {
    let best = -Infinity;
    let period = 0;
    for (let lag = 160; lag <= 250; lag++) {
      let correlation = 0;
      for (let i = 5000; i < 12000; i++) correlation += pcm[i] * pcm[i + lag];
      if (correlation > best) { best = correlation; period = lag; }
    }
    return sampleRate / period;
  };
  expect(roles.strong.length).toBe(source.length);
  expect(roles.high.length).toBe(source.length);
  expect(roles.low.length).toBe(source.length);
  expect(estimatePitch(roles.strong) / estimatePitch(roles.low)).toBeGreaterThan(1.04);
  expect(estimatePitch(roles.strong) / estimatePitch(roles.low)).toBeLessThan(1.08);
  expect(estimatePitch(roles.high) / estimatePitch(roles.low)).toBeCloseTo(1, 2);
});
test("snapshot freezes the speaker/output chosen before async preparation", () => {
  const input = { volume: 1, defaultSoundSet: "classic", voiceCountLanguage: "ko" as const,
    voiceCountSpeaker: "male" as "male" | "female", voiceCountOutput: "voice-only" as "mixed" | "voice-only" };
  const snapshot = createAudioToneSnapshot(input);
  input.voiceCountSpeaker = "female";
  input.voiceCountOutput = "mixed";
  expect(snapshot.voiceCountSpeaker).toBe("male");
  expect(snapshot.voiceCountOutput).toBe("voice-only");
  expect(Object.isFrozen(snapshot)).toBe(true);
});

import { prepareVoiceCountPCMs } from "@/lib/voice-count-assets";
import { getClickPCM, getDecodedPCM } from "@/lib/pcm-cache";
import { createAudioToneSnapshot } from "@/lib/audio-tone-snapshot";
import { loadPCM } from "@/lib/pcm-loader";
import { noteTtsNative } from "@/lib/note-tts-runtime";

jest.mock("@/lib/pcm-cache", () => ({
  getDecodedPCM: jest.fn(async (_key: string, loader: (signal: AbortSignal) => Promise<Float32Array>, signal?: AbortSignal) => {
    const loadController = new AbortController();
    const abort = () => loadController.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    try { return await loader(loadController.signal); }
    finally { signal?.removeEventListener("abort", abort); }
  }),
  getClickPCM: jest.fn(async (
    _key: string,
    loader: (signal: AbortSignal) => Promise<unknown>,
    signal?: AbortSignal,
  ) => loader(signal ?? new AbortController().signal)),
}));
jest.mock("@/lib/pcm-loader", () => ({
  loadPCM: jest.fn(async () => new Float32Array([0.1, -0.1])),
}));
jest.mock("@/lib/note-tts-runtime", () => ({
  noteTtsNative: {
    getVoices: jest.fn(async () => []),
    getOfflineKoreanCountVoices: jest.fn(async () => []),
    generate: jest.fn(),
    claim: jest.fn(async () => {}),
    cancel: jest.fn(async () => {}),
    discard: jest.fn(async () => {}),
    listFiles: jest.fn(async () => []),
  },
}));
jest.mock("@/lib/note-tts-file", () => ({
  prepareNoteTtsFile: async (result: { uri: string }) => ({ ...result, duration: 0.25 }),
}));

const tick = { time: 0, beat: 0, subBeat: 0, type: "normal" as const };
const native = noteTtsNative!;

beforeEach(() => jest.clearAllMocks());

test("prepares distinct installed offline male and female voices before playback", async () => {
  const voices = native.getOfflineKoreanCountVoices as jest.Mock;
  const generate = native.generate as jest.Mock;
  voices.mockResolvedValue([
    { id: "ko-local-male", name: "Male Korean", language: "ko-KR", gender: "male" },
    { id: "ko-local-female", name: "Female Korean", language: "ko-KR", gender: "female" },
  ]);
  generate.mockImplementation(async (word: string, voiceId: string) =>
    ({ uri: `file:///tts-samples/${voiceId}-${encodeURIComponent(word)}.wav`, duration: 0.25 }));

  const controller = new AbortController();
  for (const speaker of ["male", "female"] as const) {
    const clips = await prepareVoiceCountPCMs([tick], "ko", controller.signal, speaker);
    expect(clips.get(1)?.low.length).toBe(2);
  }

  expect(voices).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls.map(call => call.slice(0, 2))).toEqual([
    ["일", "ko-local-male"], ["일", "ko-local-female"],
  ]);
  expect(getDecodedPCM).toHaveBeenCalledWith(
    "voice:ko:native:ko-local-male:1", expect.any(Function), controller.signal,
  );
  expect(getDecodedPCM).toHaveBeenCalledWith(
    "voice:ko:native:ko-local-female:1", expect.any(Function), controller.signal,
  );
  expect(getClickPCM).toHaveBeenCalledWith(
    "voice:roles:ko:ko-local-male:1", expect.any(Function), controller.signal,
  );
  expect(getClickPCM).toHaveBeenCalledWith(
    "voice:roles:ko:ko-local-female:1", expect.any(Function), controller.signal,
  );
  expect(loadPCM).toHaveBeenCalledWith(
    "file:///tts-samples/ko-local-male-%EC%9D%BC.wav", expect.any(AbortSignal),
  );
  expect(native.discard).toHaveBeenCalledTimes(2);
  expect(await prepareVoiceCountPCMs([tick], "off")).toEqual(new Map());
});

test("generates the exact Hangul digits one native job at a time", async () => {
  (native.getOfflineKoreanCountVoices as jest.Mock).mockResolvedValue([
    { id: "ios-local-female", name: "Korean Female", language: "ko-KR", gender: "female" },
  ]);
  let jobsInFlight = 0;
  (native.generate as jest.Mock).mockImplementation(async (_word: string, voiceId: string) => {
    jobsInFlight++;
    expect(jobsInFlight).toBe(1);
    await Promise.resolve();
    jobsInFlight--;
    return { uri: `file:///tts-samples/${voiceId}.wav`, duration: 0.25 };
  });

  const schedule = Array.from({ length: 10 }, (_, beat) => ({ ...tick, beat }));
  const prepared = await prepareVoiceCountPCMs(schedule, "ko", undefined, "female");
  expect(prepared.size).toBe(10);
  expect((native.generate as jest.Mock).mock.calls.map(([word]) => word))
    .toEqual(["일", "둘", "삼", "넷", "오", "육", "칠", "팔", "구", "공"]);
  expect(jobsInFlight).toBe(0);
});

test("fails explicitly instead of substituting a wrong or network-only voice", async () => {
  (native.getOfflineKoreanCountVoices as jest.Mock).mockResolvedValue([
    { id: "english-female", name: "English", language: "en-US", gender: "female" },
    { id: "korean-unknown", name: "Korean", language: "ko-KR", gender: "unknown" },
  ]);
  await expect(prepareVoiceCountPCMs([tick], "ko", undefined, "male"))
    .rejects.toThrow(/No installed offline Korean male voice/);
  expect(native.generate).not.toHaveBeenCalled();
});

test("aborting preparation cancels a pending native utterance", async () => {
  (native.getOfflineKoreanCountVoices as jest.Mock).mockResolvedValue([
    { id: "ko-local-male", name: "Male Korean", language: "ko-KR", gender: "male" },
  ]);
  (native.generate as jest.Mock).mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const preparing = prepareVoiceCountPCMs([tick], "ko", controller.signal, "male");
  for (let turn = 0; turn < 10 && !(native.generate as jest.Mock).mock.calls.length; turn++) {
    await Promise.resolve();
  }
  expect(native.generate).toHaveBeenCalledTimes(1);
  controller.abort();
  await expect(preparing).rejects.toThrow("RENDER_ABORTED");
  expect(native.cancel).toHaveBeenCalledWith(expect.any(String));
});

test("English stays bundled and the count-off setting prepares no audio", async () => {
  const controller = new AbortController();
  const clips = await prepareVoiceCountPCMs([tick], "en", controller.signal, "female");
  expect(clips.get(1)?.low.length).toBe(2);
  expect(getDecodedPCM).toHaveBeenCalledWith(
    "voice:en:female:1", expect.any(Function), controller.signal,
  );
  expect(getClickPCM).toHaveBeenCalledWith(
    "voice:roles:en:female:1", expect.any(Function), controller.signal,
  );
  expect(native.getOfflineKoreanCountVoices).not.toHaveBeenCalled();
  expect(await prepareVoiceCountPCMs([tick], "off")).toEqual(new Map());
});

test("only the strong count role gets a slight pitch rise without changing clip duration", async () => {
  const sampleRate = 44100;
  const source = Float32Array.from(
    { length: sampleRate },
    (_, i) => 0.4 * Math.sin(2 * Math.PI * 220 * i / sampleRate),
  );
  jest.mocked(getDecodedPCM).mockResolvedValue(source);
  const roles = (await prepareVoiceCountPCMs([tick], "en", undefined, "female")).get(1)!;
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

test("snapshot freezes the speaker and output selected before asynchronous preparation", () => {
  const input = {
    volume: 1,
    defaultSoundSet: "classic",
    voiceCountLanguage: "ko" as const,
    voiceCountSpeaker: "male" as "male" | "female",
    voiceCountOutput: "voice-only" as "mixed" | "voice-only",
  };
  const snapshot = createAudioToneSnapshot(input);
  input.voiceCountSpeaker = "female";
  input.voiceCountOutput = "mixed";
  expect(snapshot.voiceCountSpeaker).toBe("male");
  expect(snapshot.voiceCountOutput).toBe("voice-only");
  expect(Object.isFrozen(snapshot)).toBe(true);
});

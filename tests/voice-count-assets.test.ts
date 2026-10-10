import { prepareVoiceCountPCMs } from "@/lib/voice-count-assets";
import { getDecodedPCM } from "@/lib/pcm-cache";
import { createAudioToneSnapshot } from "@/lib/audio-tone-snapshot";

jest.mock("@/lib/pcm-cache", () => ({
  getDecodedPCM: jest.fn(async () => new Float32Array([0.1, -0.1])),
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

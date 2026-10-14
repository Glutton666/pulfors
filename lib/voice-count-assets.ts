import { loadPCM } from "./pcm-loader";
import { getClickPCM, getDecodedPCM } from "./pcm-cache";
import { emphasizeCountPCM, voiceCountEvent, type VoiceCountLanguage, type VoiceCountSlot, type VoiceCountSpeaker } from "./voice-count";
import type { ClickPCMs } from "./audio-renderer";
import { raiseVoiceCountPitch } from "./voice-count-pitch";

// Static requires are intentional: Metro must include every offline speaker.
import { NoteTtsSession, OFFLINE_KOREAN_COUNT_WORDS } from "./note-tts";
import { noteTtsNative } from "@/lib/note-tts-runtime";
import { prepareNoteTtsFile } from "./note-tts-file";
const catalog = {
  en: {
    male: [
      require("@/assets/sounds/count/en-male-0.wav"), require("@/assets/sounds/count/en-male-1.wav"),
      require("@/assets/sounds/count/en-male-2.wav"), require("@/assets/sounds/count/en-male-3.wav"),
      require("@/assets/sounds/count/en-male-4.wav"), require("@/assets/sounds/count/en-male-5.wav"),
      require("@/assets/sounds/count/en-male-6.wav"), require("@/assets/sounds/count/en-male-7.wav"),
      require("@/assets/sounds/count/en-male-8.wav"), require("@/assets/sounds/count/en-male-9.wav"),
      require("@/assets/sounds/count/en-male-10.wav"), require("@/assets/sounds/count/en-male-11.wav"),
      require("@/assets/sounds/count/en-male-12.wav"), require("@/assets/sounds/count/en-male-13.wav"),
      require("@/assets/sounds/count/en-male-14.wav"), require("@/assets/sounds/count/en-male-15.wav"),
      require("@/assets/sounds/count/en-male-16.wav"),
    ],
    female: [
      require("@/assets/sounds/count/en-female-0.wav"), require("@/assets/sounds/count/en-female-1.wav"),
      require("@/assets/sounds/count/en-female-2.wav"), require("@/assets/sounds/count/en-female-3.wav"),
      require("@/assets/sounds/count/en-female-4.wav"), require("@/assets/sounds/count/en-female-5.wav"),
      require("@/assets/sounds/count/en-female-6.wav"), require("@/assets/sounds/count/en-female-7.wav"),
      require("@/assets/sounds/count/en-female-8.wav"), require("@/assets/sounds/count/en-female-9.wav"),
      require("@/assets/sounds/count/en-female-10.wav"), require("@/assets/sounds/count/en-female-11.wav"),
      require("@/assets/sounds/count/en-female-12.wav"), require("@/assets/sounds/count/en-female-13.wav"),
      require("@/assets/sounds/count/en-female-14.wav"), require("@/assets/sounds/count/en-female-15.wav"),
      require("@/assets/sounds/count/en-female-16.wav"),
    ],
  },
};

let koreanTtsQueue = Promise.resolve();

type PreparedKoreanCount = { voiceId: string; pcmByNumber: Map<number, Float32Array> };

/** Per-render immutable inputs; canonical decoding cache owns reuse/cancellation. */
export async function prepareVoiceCountPCMs(
  schedule: readonly VoiceCountSlot[], language: VoiceCountLanguage = "off", signal?: AbortSignal,
  speaker: VoiceCountSpeaker = "female",
): Promise<Map<number, ClickPCMs>> {
  if (language === "off") return new Map();
  const clips = new Set(schedule.map(tick => voiceCountEvent(tick, language)?.clip).filter(n => n !== undefined));
  if (!clips.size) return new Map();
  const koreanPCMs = language === "ko"
    ? await prepareOfflineKoreanCount([...clips] as number[], speaker, signal)
    : undefined;
  const prepared = await Promise.all([...clips].map(async number => {
    let pcm: Float32Array | undefined;
    if (language === "ko") {
      pcm = koreanPCMs?.pcmByNumber.get(number!);
    } else {
      const asset = catalog.en[speaker][number!];
      if (asset !== undefined) {
        pcm = await getDecodedPCM(
          `voice:en:${speaker}:${number}`,
          s => loadPCM({ kind: "asset", source: asset }, s),
          signal,
        );
      }
    }
    if (!pcm) throw new Error(`Missing ${language} voice count ${number}`);
    const rolesCacheKey = language === "ko"
      ? `voice:roles:ko:${koreanPCMs!.voiceId}:${number}`
      : `voice:roles:en:${speaker}:${number}`;
    const roles = await getClickPCM(rolesCacheKey, async () => ({
      strong: raiseVoiceCountPitch(emphasizeCountPCM(pcm!, "strong")),
      high: emphasizeCountPCM(pcm!, "high"),
      low: emphasizeCountPCM(pcm!, "low"),
    }), signal);
    return [number!, roles] as const;
  }));
  return new Map(prepared);
}

async function synthesizeKoreanCountPCM(
  word: string,
  voiceId: string,
  signal: AbortSignal,
): Promise<Float32Array> {
  const session = new NoteTtsSession(noteTtsNative!, prepareNoteTtsFile);
  let abortHandler: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    abortHandler = () => {
      void session.reset().catch(() => {});
      reject(new Error("RENDER_ABORTED"));
    };
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  try {
    const result = await Promise.race([session.generate(word, voiceId), abortPromise]);
    if (!result || signal.aborted) throw new Error("RENDER_ABORTED");
    const decoded = await loadPCM(result.uri, signal);
    if (!decoded) throw new Error("Korean voice produced invalid PCM.");
    return decoded;
  } finally {
    if (abortHandler) signal.removeEventListener("abort", abortHandler);
    await session.reset();
  }
}

async function prepareOfflineKoreanCount(
  numbers: readonly number[],
  speaker: VoiceCountSpeaker,
  signal?: AbortSignal,
): Promise<PreparedKoreanCount> {
  if (!noteTtsNative) {
    throw new Error("Offline Korean voice count is unavailable on this platform.");
  }
  if (signal?.aborted) throw new Error("RENDER_ABORTED");
  const voices = await noteTtsNative.getOfflineKoreanCountVoices();
  const voice = voices.find(candidate => candidate.language.toLowerCase().startsWith("ko")
    && candidate.gender === speaker);
  if (!voice) {
    throw new Error(`No installed offline Korean ${speaker} voice. Install a Korean ${speaker} TTS voice in device settings.`);
  }

  const pcmByNumber = new Map<number, Float32Array>();
  // Both platform engines write one utterance at a time. Pre-render before
  // playback so the normal metronome PCM renderer owns every count onset.
  for (const number of numbers) {
    if (signal?.aborted) throw new Error("RENDER_ABORTED");
    const word = OFFLINE_KOREAN_COUNT_WORDS[number];
    if (!word) throw new Error(`Unsupported Korean count slot: ${number}`);
    const key = `voice:ko:native:${voice.id}:${number}`;
    const pcm = await getDecodedPCM(
      key,
      loadSignal => withKoreanTtsLock(loadSignal, () => synthesizeKoreanCountPCM(word, voice.id, loadSignal)),
      signal,
    );
    pcmByNumber.set(number, pcm);
  }
  return { voiceId: voice.id, pcmByNumber };
}

async function withKoreanTtsLock<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
  const previous = koreanTtsQueue;
  let release!: () => void;
  koreanTtsQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    if (signal.aborted) throw new Error("RENDER_ABORTED");
    return await task();
  } finally {
    release();
  }
}

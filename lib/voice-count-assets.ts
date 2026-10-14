import { loadPCM } from "./pcm-loader";
import { getClickPCM, getDecodedPCM } from "./pcm-cache";
import { emphasizeCountPCM, voiceCountEvent, type VoiceCountLanguage, type VoiceCountSlot, type VoiceCountSpeaker } from "./voice-count";
import type { ClickPCMs } from "./audio-renderer";
import { raiseVoiceCountPitch } from "./voice-count-pitch";

// Static requires are intentional: Metro must include every offline speaker.
const catalog = {
  ko: {
    male: [
      require("@/assets/sounds/count/ko-male-0.wav"), require("@/assets/sounds/count/ko-male-1.wav"),
      require("@/assets/sounds/count/ko-male-2.wav"), require("@/assets/sounds/count/ko-male-3.wav"),
      require("@/assets/sounds/count/ko-male-4.wav"), require("@/assets/sounds/count/ko-male-5.wav"),
      require("@/assets/sounds/count/ko-male-6.wav"), require("@/assets/sounds/count/ko-male-7.wav"),
      require("@/assets/sounds/count/ko-male-8.wav"), require("@/assets/sounds/count/ko-male-9.wav"),
    ],
    female: [
      require("@/assets/sounds/count/ko-female-0.wav"), require("@/assets/sounds/count/ko-female-1.wav"),
      require("@/assets/sounds/count/ko-female-2.wav"), require("@/assets/sounds/count/ko-female-3.wav"),
      require("@/assets/sounds/count/ko-female-4.wav"), require("@/assets/sounds/count/ko-female-5.wav"),
      require("@/assets/sounds/count/ko-female-6.wav"), require("@/assets/sounds/count/ko-female-7.wav"),
      require("@/assets/sounds/count/ko-female-8.wav"), require("@/assets/sounds/count/ko-female-9.wav"),
    ],
  },
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

/** Per-render immutable inputs; canonical decoding cache owns reuse/cancellation. */
export async function prepareVoiceCountPCMs(
  schedule: readonly VoiceCountSlot[], language: VoiceCountLanguage = "off", signal?: AbortSignal,
  speaker: VoiceCountSpeaker = "female",
): Promise<Map<number, ClickPCMs>> {
  if (language === "off") return new Map();
  const clips = new Set(schedule.map(tick => voiceCountEvent(tick, language)?.clip).filter(n => n !== undefined));
  const prepared = await Promise.all([...clips].map(async number => {
    const asset = catalog[language][speaker][number!];
    if (asset === undefined) throw new Error(`Missing ${language} voice count ${number}`);
    const roles = await getClickPCM(`voice:roles:${language}:${speaker}:${number}`, async sharedSignal => {
      const pcm = await getDecodedPCM(
        `voice:${language}:${speaker}:${number}`,
        s => loadPCM({ kind: "asset", source: asset }, s),
        sharedSignal,
      );
      return {
        strong: raiseVoiceCountPitch(emphasizeCountPCM(pcm, "strong")),
        high: emphasizeCountPCM(pcm, "high"),
        low: emphasizeCountPCM(pcm, "low"),
      };
    }, signal);
    return [number!, roles] as const;
  }));
  return new Map(prepared);
}

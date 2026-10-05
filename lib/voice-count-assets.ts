import { loadPCM } from "./pcm-loader";
import { getDecodedPCM } from "./pcm-cache";
import { emphasizeCountPCM, voiceCountEvent, type VoiceCountLanguage, type VoiceCountSlot } from "./voice-count";
import type { ClickPCMs } from "./audio-renderer";

const korean = [
  require("@/assets/sounds/count/ko-0.wav"), require("@/assets/sounds/count/ko-1.wav"),
  require("@/assets/sounds/count/ko-2.wav"), require("@/assets/sounds/count/ko-3.wav"),
  require("@/assets/sounds/count/ko-4.wav"), require("@/assets/sounds/count/ko-5.wav"),
  require("@/assets/sounds/count/ko-6.wav"), require("@/assets/sounds/count/ko-7.wav"),
  require("@/assets/sounds/count/ko-8.wav"), require("@/assets/sounds/count/ko-9.wav"),
];
const english = [
  require("@/assets/sounds/count/en-0.wav"), require("@/assets/sounds/count/en-1.wav"),
  require("@/assets/sounds/count/en-2.wav"), require("@/assets/sounds/count/en-3.wav"),
  require("@/assets/sounds/count/en-4.wav"), require("@/assets/sounds/count/en-5.wav"),
  require("@/assets/sounds/count/en-6.wav"), require("@/assets/sounds/count/en-7.wav"),
  require("@/assets/sounds/count/en-8.wav"), require("@/assets/sounds/count/en-9.wav"),
  require("@/assets/sounds/count/en-10.wav"), require("@/assets/sounds/count/en-11.wav"),
  require("@/assets/sounds/count/en-12.wav"), require("@/assets/sounds/count/en-13.wav"),
  require("@/assets/sounds/count/en-14.wav"), require("@/assets/sounds/count/en-15.wav"),
  require("@/assets/sounds/count/en-16.wav"),
];

/** Per-render immutable inputs; canonical decoding cache owns reuse/cancellation. */
export async function prepareVoiceCountPCMs(
  schedule: readonly VoiceCountSlot[], language: VoiceCountLanguage = "off", signal?: AbortSignal,
): Promise<Map<number, ClickPCMs>> {
  const clips = new Set(schedule.map(tick => voiceCountEvent(tick, language)?.clip).filter(n => n !== undefined));
  const prepared = await Promise.all([...clips].map(async number => {
    const asset = (language === "ko" ? korean : english)[number!];
    if (asset === undefined) throw new Error(`Missing ${language} voice count ${number}`);
    const pcm = await getDecodedPCM(`voice:${language}:${number}`, s => loadPCM({ kind: "asset", source: asset }, s), signal);
    return [number!, {
      strong: emphasizeCountPCM(pcm, "strong"),
      high: emphasizeCountPCM(pcm, "high"),
      low: emphasizeCountPCM(pcm, "low"),
    }] as const;
  }));
  return new Map(prepared);
}

import type { BeatType } from "./metronome-engine";

export type VoiceCountLanguage = "off" | "ko" | "en";
export type VoiceCountOutput = "mixed" | "voice-only";
export type VoiceCountSpeaker = "male" | "female";
export function sanitizeVoiceCountOutput(value: unknown): VoiceCountOutput {
  return value === "voice-only" ? value : "mixed";
}
export function sanitizeVoiceCountSpeaker(value: unknown): VoiceCountSpeaker {
  return value === "male" ? value : "female";
}
/** Off always restores clicks, even if the remembered output is voice-only. */
export function shouldPlayCountClicks(language: VoiceCountLanguage = "off", output: VoiceCountOutput = "mixed"): boolean {
  return language === "off" || output !== "voice-only";
}
export const KOREAN_COUNT_WORDS = ["공", "일", "둘", "삼", "넷", "오", "육", "칠", "팔", "구"] as const;
export const ENGLISH_COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"] as const;
export function sanitizeVoiceCountLanguage(value: unknown): VoiceCountLanguage {
  return value === "ko" || value === "en" ? value : "off";
}
export interface VoiceCountSlot {
  readonly time: number;
  readonly beat: number;
  readonly subBeat: number;
  readonly type: BeatType;
  readonly layerIndex?: number;
}
export interface VoiceCountEvent {
  readonly time: number;
  readonly number: number;
  readonly clip: number;
  readonly role: "strong" | "high" | "low";
}
/** Number identity comes from immutable slot position, never audible-event count. */
export function voiceCountEvent(slot: VoiceCountSlot, language: VoiceCountLanguage): Readonly<VoiceCountEvent> | null {
  if (language === "off" || slot.type === "mute" || (slot.layerIndex ?? 0) > 0) return null;
  const number = slot.subBeat === 0 ? slot.beat + 1 : slot.subBeat + 1;
  if (!Number.isInteger(number) || number < 1 || (language === "en" && number > 16)) {
    throw new Error(`Unsupported ${language} count position: ${number}`);
  }
  return Object.freeze({
    time: slot.time, number, clip: language === "ko" ? number % 10 : number,
    role: slot.type === "strong" ? "strong" : slot.type === "accent" ? "high" : "low",
  });
}

/** Speech emphasis is separate from number identity, with unchanged onset. */
export function emphasizeCountPCM(source: Float32Array, role: VoiceCountEvent["role"]): Float32Array {
  const gain = role === "strong" ? 0.22 : role === "high" ? 0.17 : 0.115;
  const brightness = role === "strong" ? 0.16 : role === "high" ? 0.08 : 0;
  const out = new Float32Array(source.length);
  let previous = 0;
  for (let i = 0; i < source.length; i++) {
    const value = source[i];
    out[i] = gain * (value + brightness * (value - previous));
    previous = value;
  }
  return out;
}

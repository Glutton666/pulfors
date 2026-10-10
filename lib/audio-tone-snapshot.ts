import type { SoundSet } from "@/lib/storage";
import type { SoundSetOverlays } from "./sound-overlays";
import { sanitizeVoiceCountOutput, sanitizeVoiceCountSpeaker, type VoiceCountLanguage, type VoiceCountOutput, type VoiceCountSpeaker } from "./voice-count";
import {
  NEUTRAL,
  processClickPCM,
  sanitizeTonePosition,
  toneEffectIntensity,
  type ClickPCM,
  type TonePosition,
} from "@/lib/metronome-tone-dsp";

export const BUILTIN_CLICK_SOURCE_GAIN = 3.6;
export const AUDIO_OUTPUT_CEILING = 0.98;
const NEUTRAL_TONE = Object.freeze({
  position: NEUTRAL,
  intensity: 0,
  active: false,
});

export interface AudioToneSnapshotInput {
  readonly volume: number;
  readonly defaultSoundSet: SoundSet | string;
  readonly defaultPosition?: Readonly<TonePosition> | null;
  readonly positions?: Readonly<Partial<Record<SoundSet | string, Readonly<TonePosition>>>>;
  readonly overlays?: Readonly<SoundSetOverlays>;
  readonly voiceCountLanguage?: VoiceCountLanguage;
  readonly voiceCountOutput?: VoiceCountOutput;
  readonly voiceCountSpeaker?: VoiceCountSpeaker;
}

export interface AudioToneSnapshot {
  readonly volume: number;
  readonly outputGain: number;
  readonly renderGain: number;
  readonly realtimeGain: number;
  readonly boosted: boolean;
  readonly toneShaped: boolean;
  readonly defaultSoundSet: SoundSet | string;
  readonly defaultTone: AudioToneShape;
  readonly tones: Readonly<Record<string, AudioToneShape>>;
  readonly ceiling: number;
  readonly overlays?: Readonly<SoundSetOverlays>;
  readonly voiceCountLanguage?: VoiceCountLanguage;
  readonly voiceCountOutput?: VoiceCountOutput;
  readonly voiceCountSpeaker?: VoiceCountSpeaker;
}

export interface AudioToneShape {
  readonly position: Readonly<TonePosition>;
  readonly intensity: number;
  readonly active: boolean;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function createAudioToneSnapshot(
  input: AudioToneSnapshotInput,
): AudioToneSnapshot {
  const volume = finiteNonNegative(input.volume);
  const makeTone = (position?: Readonly<TonePosition> | null): AudioToneShape => {
    const sanitized = Object.freeze({ ...sanitizeTonePosition(position) });
    const intensity = toneEffectIntensity(sanitized);
    return Object.freeze({ position: sanitized, intensity, active: intensity > 0 });
  };
  const tones = Object.freeze(Object.fromEntries(
    Object.entries(input.positions ?? {}).map(([set, position]) => [set, makeTone(position)]),
  ));
  const defaultTone = makeTone(
    input.defaultPosition ?? tones[input.defaultSoundSet]?.position ?? NEUTRAL,
  );
  const outputGain = Math.min(1, volume);
  const renderGain = volume === 0 ? 0 : BUILTIN_CLICK_SOURCE_GAIN;
  const realtimeGain = outputGain * BUILTIN_CLICK_SOURCE_GAIN;

  return Object.freeze({
    volume,
    outputGain,
    renderGain,
    realtimeGain,
    // Retained for playback-plan compatibility; built-in volume no longer
    // supports an above-100% amplification mode.
    boosted: false,
    toneShaped: defaultTone.active,
    defaultSoundSet: input.defaultSoundSet,
    defaultTone,
    tones,
    ceiling: AUDIO_OUTPUT_CEILING,
    overlays: Object.freeze({ ...input.overlays }),
    voiceCountLanguage: input.voiceCountLanguage ?? "off",
    voiceCountOutput: sanitizeVoiceCountOutput(input.voiceCountOutput),
    voiceCountSpeaker: sanitizeVoiceCountSpeaker(input.voiceCountSpeaker),
  });
}

export function readAudioToneSnapshot(
  snapshot: AudioToneSnapshot,
  soundSet: SoundSet | string = snapshot.defaultSoundSet,
): AudioToneShape {
  return soundSet === snapshot.defaultSoundSet
    ? snapshot.defaultTone
    : snapshot.tones[soundSet] ?? NEUTRAL_TONE;
}

export function applyAudioToneSnapshot(
  pcm: ClickPCM,
  snapshot: AudioToneSnapshot,
  soundSet: SoundSet | string = snapshot.defaultSoundSet,
  sampleRate = 44_100,
): ClickPCM {
  const tone = readAudioToneSnapshot(snapshot, soundSet);
  return processClickPCM(pcm, {
    position: tone.position,
    sampleRate,
    ceiling: snapshot.ceiling,
  });
}
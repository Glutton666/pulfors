import type { PolygonLayer } from "@/components/polygon-mode/PolygonTypes";
import { applyDialConfigToEngine } from "@/lib/dial-engine-boundary";
import type { BarConfig, DialConfig } from "@/lib/index.helpers";
import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";
import { toEngineBpm } from "@/lib/metronome-engine-pure";
import type { NoteSampleChannelMap, NoteSampleMap, NoteSampleMetroChannelMap, NoteSampleSpeedMap, NoteSampleVolumeMap } from "@/lib/note-samples";
import type { PlayEvent } from "@/lib/score-playback";
import type { SampleChannel } from "@/lib/stereo-channel";
import type { CustomSoundSetConfig, SoundSet } from "@/lib/storage";
import {
  readAudioToneSnapshot,
  type AudioToneSnapshot,
} from "@/lib/audio-tone-snapshot";

export type PlaybackPlatform = "web" | "native";
export type PlaybackOutputStrategy = "realtime" | "prerender" | "scheduled-notes" | "polygon-realtime";

export interface PlaybackAudioSnapshot {
  readonly soundSet: SoundSet;
  readonly tone: AudioToneSnapshot;
  readonly sampleVolume: number;
  readonly customSoundSets: Readonly<Record<string, Readonly<CustomSoundSetConfig>>>;
  readonly noteSamples: Readonly<NoteSampleMap>;
  readonly noteSampleChannels: Readonly<NoteSampleChannelMap>;
  readonly noteSampleVolumes: Readonly<NoteSampleVolumeMap>;
  readonly noteSampleSpeeds: Readonly<NoteSampleSpeedMap>;
  readonly metronomeChannel: SampleChannel;
  readonly noteSampleMetroChannels: Readonly<NoteSampleMetroChannelMap>;
  readonly layerSoundSets: Readonly<Record<number, SoundSet>>;
}

export interface PlaybackPlanHeader {
  readonly createdAtMs: number;
  readonly platform: PlaybackPlatform;
  readonly bpm: number;
  readonly output: Readonly<{
    strategy: PlaybackOutputStrategy;
    boosted: boolean;
    toneShaped: boolean;
  }>;
}

export interface BeatPlaybackPlan extends PlaybackPlanHeader {
  readonly mode: "beat";
  readonly audio: PlaybackAudioSnapshot;
  readonly unit: Readonly<{
    kind: "meter";
    config: DialConfig;
  }>;
}

export interface BarPlaybackPlan extends PlaybackPlanHeader {
  readonly mode: "bar";
  readonly audio: PlaybackAudioSnapshot;
  readonly unit: Readonly<{
    kind: "bars";
    config: BarConfig;
    startBeat?: number;
    denominator: 2 | 4 | 8;
    blockPlayMode: "sequential" | "loop" | "random";
  }>;
}

export interface NotePlaybackPlan extends PlaybackPlanHeader {
  readonly mode: "note";
  readonly audio: PlaybackAudioSnapshot;
  readonly unit: Readonly<{
    kind: "configured-entry";
    stopAfterMeasure: boolean;
  }>;
}

export interface ScorePlaybackPlan extends PlaybackPlanHeader {
  readonly mode: "score";
  readonly unit: Readonly<{
    kind: "timeline";
    documentId: string;
    timeline: readonly PlayEvent[];
    linkedEntryIds: readonly (string | undefined)[];
    muteAudio: boolean;
  }>;
}

export interface PolygonPlaybackPlan extends PlaybackPlanHeader {
  readonly mode: "polygon";
  readonly tone: AudioToneSnapshot;
  readonly unit: Readonly<{
    kind: "polygon-layers";
    beatsPerMeasure: number;
    layers: readonly PolygonLayer[];
  }>;
}

export type MetronomePlaybackPlan = BeatPlaybackPlan | BarPlaybackPlan | NotePlaybackPlan;
export type PlaybackPlan = MetronomePlaybackPlan | ScorePlaybackPlan | PolygonPlaybackPlan;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

type MetronomeInputBase = {
  platform: PlaybackPlatform;
  bpm: number;
  createdAtMs?: number;
  audio: PlaybackAudioSnapshot;
};

export type BuildPlaybackPlanInput =
  | (MetronomeInputBase & { mode: "beat"; config: DialConfig })
  | (MetronomeInputBase & {
      mode: "bar";
      config: BarConfig;
      startBeat?: number;
      denominator: 2 | 4 | 8;
      blockPlayMode: "sequential" | "loop" | "random";
    })
  | (MetronomeInputBase & { mode: "note"; stopAfterMeasure: boolean });

function cloneRecordOfArrays<T>(value: Record<string, T[]>): Record<string, T[]> {
  return Object.fromEntries(Object.entries(value).map(([key, items]) => [key, [...items]]));
}

function cloneAudio(audio: PlaybackAudioSnapshot): PlaybackAudioSnapshot {
  return {
    soundSet: audio.soundSet,
    tone: audio.tone,
    sampleVolume: audio.sampleVolume,
    customSoundSets: Object.fromEntries(
      Object.entries(audio.customSoundSets).map(([set, config]) => [
        set,
        {
          ...config,
          strong: { ...config.strong },
          accent: { ...config.accent },
          normal: { ...config.normal },
        },
      ]),
    ),
    noteSamples: { ...audio.noteSamples },
    noteSampleChannels: { ...audio.noteSampleChannels },
    noteSampleVolumes: { ...audio.noteSampleVolumes },
    noteSampleSpeeds: { ...audio.noteSampleSpeeds },
    metronomeChannel: audio.metronomeChannel,
    noteSampleMetroChannels: { ...audio.noteSampleMetroChannels },
    layerSoundSets: { ...audio.layerSoundSets },
  };
}

function cloneDialConfig(config: DialConfig): DialConfig {
  return {
    ...config,
    beatTypes: [...config.beatTypes],
    beatSubdivisions: cloneRecordOfArrays(config.beatSubdivisions),
    subdivisionPattern: config.subdivisionPattern ? [...config.subdivisionPattern] : undefined,
    noteSamples: { ...config.noteSamples },
    noteSampleNames: { ...config.noteSampleNames },
    noteSampleSources: { ...config.noteSampleSources },
    noteSampleChannels: { ...config.noteSampleChannels },
    noteSampleVolumes: config.noteSampleVolumes ? { ...config.noteSampleVolumes } : undefined,
    noteSampleSpeeds: config.noteSampleSpeeds ? { ...config.noteSampleSpeeds } : undefined,
  };
}

function cloneBarConfig(config: BarConfig): BarConfig {
  return {
    ...config,
    beatTypes: [...config.beatTypes],
    beatSubdivisions: cloneRecordOfArrays(config.beatSubdivisions),
    subdivisionPattern: config.subdivisionPattern ? [...config.subdivisionPattern] : undefined,
    barRepeats: Object.fromEntries(
      Object.entries(config.barRepeats).map(([key, repeat]) => [
        key,
        {
          ...repeat,
          layers: repeat.layers?.map((layer) => ({
            ...layer,
            subdivisions: layer.subdivisions ? [...layer.subdivisions] : undefined,
          })),
        },
      ]),
    ),
    loopBlocks: config.loopBlocks.map((block) => ({
      ...block,
      ownBeatTypes: block.ownBeatTypes ? { ...block.ownBeatTypes } : undefined,
      ownSubdivisions: block.ownSubdivisions
        ? cloneRecordOfArrays(block.ownSubdivisions)
        : undefined,
    })),
    noteSamples: { ...config.noteSamples },
    noteSampleNames: { ...config.noteSampleNames },
    noteSampleSources: { ...config.noteSampleSources },
    noteSampleChannels: { ...config.noteSampleChannels },
    noteSampleVolumes: config.noteSampleVolumes ? { ...config.noteSampleVolumes } : undefined,
    noteSampleSpeeds: config.noteSampleSpeeds ? { ...config.noteSampleSpeeds } : undefined,
    noteSampleMetroChannels: config.noteSampleMetroChannels
      ? { ...config.noteSampleMetroChannels }
      : undefined,
  };
}

function outputFor(input: MetronomeInputBase, mode: "beat" | "bar" | "note"): PlaybackPlanHeader["output"] {
  const relevantSoundSets = new Set<string>([
    input.audio.soundSet,
    ...Object.values(input.audio.layerSoundSets),
  ]);
  const toneShaped = [...relevantSoundSets].some(
    (soundSet) => readAudioToneSnapshot(input.audio.tone, soundSet).active,
  );
  const boosted = input.audio.tone.boosted;
  const strategy: PlaybackOutputStrategy = input.platform === "native"
    || (input.platform === "web"
      && (mode === "bar" || String(input.audio.soundSet).startsWith("custom") || boosted || toneShaped))
    ? "prerender"
    : "realtime";
  return { strategy, boosted, toneShaped };
}

/** Creates the immutable decision snapshot consumed by the active metronome start. */
export function buildPlaybackPlan(input: BuildPlaybackPlanInput): MetronomePlaybackPlan {
  const header = {
    createdAtMs: input.createdAtMs ?? Date.now(),
    platform: input.platform,
    bpm: input.bpm,
    output: outputFor(input, input.mode),
  } as const;
  const audio = cloneAudio(input.audio);
  if (input.mode === "bar") {
    return deepFreeze({
      ...header,
      mode: "bar",
      audio,
      unit: {
        kind: "bars",
        config: cloneBarConfig(input.config),
        startBeat: input.startBeat,
        denominator: input.denominator,
        blockPlayMode: input.blockPlayMode,
      },
    });
  }
  if (input.mode === "note") {
    return deepFreeze({
      ...header,
      mode: "note",
      audio,
      unit: { kind: "configured-entry", stopAfterMeasure: input.stopAfterMeasure },
    });
  }
  return deepFreeze({
    ...header,
    mode: "beat",
    audio,
    unit: { kind: "meter", config: cloneDialConfig(input.config) },
  });
}

export function buildScorePlaybackPlan(input: {
  documentId: string;
  bpm: number;
  platform: PlaybackPlatform;
  timeline: readonly PlayEvent[];
  linkedEntryIds: readonly (string | undefined)[];
  muteAudio: boolean;
  createdAtMs?: number;
}): ScorePlaybackPlan {
  return deepFreeze({
    mode: "score",
    createdAtMs: input.createdAtMs ?? Date.now(),
    platform: input.platform,
    bpm: input.bpm,
    output: { strategy: "scheduled-notes", boosted: false, toneShaped: false },
    unit: {
      kind: "timeline",
      documentId: input.documentId,
      timeline: input.timeline.map((event) => ({
        ...event,
        notes: event.notes.map((note) => ({ ...note })),
      })),
      linkedEntryIds: [...input.linkedEntryIds],
      muteAudio: input.muteAudio,
    },
  });
}

export function buildPolygonPlaybackPlan(input: {
  bpm: number;
  platform: PlaybackPlatform;
  beatsPerMeasure: number;
  layers: readonly PolygonLayer[];
  tone: AudioToneSnapshot;
  createdAtMs?: number;
}): PolygonPlaybackPlan {
  return deepFreeze({
    mode: "polygon",
    createdAtMs: input.createdAtMs ?? Date.now(),
    platform: input.platform,
    bpm: input.bpm,
    output: {
      strategy: "polygon-realtime",
      boosted: input.tone.boosted,
      toneShaped: input.tone.toneShaped,
    },
    tone: input.tone,
    unit: {
      kind: "polygon-layers",
      beatsPerMeasure: Math.max(1, Math.floor(input.beatsPerMeasure || 4)),
      layers: input.layers.map((layer) => ({
        ...layer,
        offsets: [...layer.offsets],
        beatTypes: [...layer.beatTypes],
      })),
    },
  });
}

/** Applies only the schedule portion; output resources remain owned by the existing pipeline. */
export function applyMetronomePlaybackPlan(engine: MetronomeEngine, plan: MetronomePlaybackPlan): void {
  if (plan.mode === "bar") {
    const cfg = plan.unit.config;
    engine.setBeatTypes([...(cfg.beatTypes || [])]);
    engine.setAllBeatSubdivisions(cfg.beatSubdivisions || {});
    engine.setAllBarRepeats(cfg.barRepeats || {});
    engine.setLoopBlocks(cfg.loopBlocks || []);
    engine.setBlockPlayMode(cfg.blockPlayMode ?? plan.unit.blockPlayMode);
    const bpmOverrides: Record<number, number> = {};
    for (const [key, repeat] of Object.entries(cfg.barRepeats || {})) {
      if (repeat.bpm) {
        bpmOverrides[Number(key)] = toEngineBpm(repeat.bpm, repeat.meterDenominator ?? plan.unit.denominator);
      }
    }
    engine.setAllBarBpmOverrides(bpmOverrides);
    engine.buildScheduleOnly();
    return;
  }
  if (plan.mode === "beat") {
    const cfg = plan.unit.config;
    applyDialConfigToEngine(engine, {
      beatsPerMeasure: cfg.beatsPerMeasure,
      beatTypes: [...cfg.beatTypes],
      beatSubdivisions: cloneRecordOfArrays(cfg.beatSubdivisions),
    });
    engine.buildScheduleOnly();
  }
}
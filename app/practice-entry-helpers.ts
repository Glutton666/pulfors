import { toEngineBpm } from "@/lib/metronome-engine";
import type { BeatType } from "@/lib/metronome-engine";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import type { NoteSampleMap, NoteSampleNameMap, NoteSampleSourceMap, NoteSampleChannelMap, NoteSampleVolumeMap, NoteSampleSpeedMap } from "@/lib/note-samples";
import type { PracticeEntry, SoundSet } from "@/lib/storage";
import type { BarConfig, BarLoopMode, BlockPlayMode } from "./bar-config-helpers";

/** loopBlocks.layerOf를 barRepeats.layers로 마이그레이션하는 순수 함수.
 *  layerOf가 있는 블록들을 barRepeats[beat].layers 배열에 통합하고 loopBlocks에서 제거한다.
 */
export function migrateLayerBlocks(
  loopBlocks: LoopBlock[],
  barRepeats: Record<number, BarRepeat>,
): { barRepeats: Record<number, BarRepeat>; loopBlocks: LoopBlock[] } {
  const layerBlocks = loopBlocks.filter(b => b.layerOf !== undefined);
  if (layerBlocks.length === 0) return { barRepeats, loopBlocks };

  const nextRepeats: Record<number, BarRepeat> = { ...barRepeats };
  for (const lb of layerBlocks) {
    for (let beat = lb.startBeat; beat <= lb.endBeat; beat++) {
      const existing = nextRepeats[beat] ?? ({ type: "count", value: 1 } as BarRepeat);
      const layer: NonNullable<BarRepeat["layers"]>[number] = {
        beatType: (lb.ownBeatTypes?.[beat] ?? "normal") as BeatType,
        subdivisions: lb.ownSubdivisions?.[String(beat)] as BeatType[] | undefined,
        ...(lb.soundSet ? { soundSet: lb.soundSet as SoundSet } : {}),
      };
      const existingLayers = existing.layers ?? [];
      nextRepeats[beat] = { ...existing, layers: [...existingLayers, layer] };
    }
  }
  const nextBlocks = loopBlocks.filter(b => b.layerOf === undefined);
  return { barRepeats: nextRepeats, loopBlocks: nextBlocks };
}

export interface AppliedEntryState {
  bpm: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeat>;
  loopBlocks: LoopBlock[];
  barLoopMode: BarLoopMode;
  blockPlayMode: BlockPlayMode;
  subdivisionPattern: BeatType[] | null;
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
  noteSampleChannels: NoteSampleChannelMap;
  noteSampleVolumes?: NoteSampleVolumeMap;
  noteSampleSpeeds?: NoteSampleSpeedMap;
  bpmOverrides: Record<number, number>;
}

/**
 * Pure reducer mirroring the React-state side effects of applyEntryToEngine.
 * Returns the values that the live component would set on bpm/beatsPerMeasure/
 * note-sample maps/etc when loading the entry. Engine-level calls are
 * deliberately not modeled here; tests can verify state-roundtrip without a
 * real engine instance.
 */
export function applyEntryToState(entry: PracticeEntry): AppliedEntryState {
  const rawBlocks = entry.loopBlocks ?? [];
  const rawRepeats = { ...(entry.barRepeats || {}) } as Record<number, BarRepeat>;
  const { barRepeats: migratedRepeats, loopBlocks: blocks } = migrateLayerBlocks(rawBlocks, rawRepeats);
  // BPM 오버라이드 정책: 양수만 통과. applyEntryToEngine과 동일하게 0/음수/누락은
  // "오버라이드 없음"으로 간주해 두 헬퍼가 같은 의미를 갖도록 잠근다.
  const bpmOverrides: Record<number, number> = {};
  for (const [k, v] of Object.entries(migratedRepeats)) {
    if (typeof v.bpm === "number" && v.bpm > 0) bpmOverrides[Number(k)] = v.bpm;
  }
  return {
    bpm: entry.bpm,
    beatsPerMeasure: entry.beatsPerMeasure,
    beatTypes: [...entry.beatTypes],
    beatSubdivisions: { ...entry.beatSubdivisions },
    barRepeats: migratedRepeats,
    loopBlocks: [...blocks],
    barLoopMode: entry.barLoopMode || "once",
    blockPlayMode: entry.blockPlayMode || "loop",
    subdivisionPattern: entry.subdivisionPattern ? [...entry.subdivisionPattern] : null,
    noteSamples: { ...(entry.noteSamples || {}) } as NoteSampleMap,
    noteSampleNames: { ...(entry.noteSampleNames || {}) } as NoteSampleNameMap,
    noteSampleSources: { ...(entry.noteSampleSources || {}) } as NoteSampleSourceMap,
    noteSampleChannels: { ...(entry.noteSampleChannels || {}) } as NoteSampleChannelMap,
    noteSampleVolumes: { ...(entry.noteSampleVolumes || {}) },
    noteSampleSpeeds: { ...(entry.noteSampleSpeeds || {}) },
    bpmOverrides,
  };
}

/**
 * Pure projection of a PracticeEntry into the BarConfig shape held in barConfigRef.
 * Centralizes default values for blockPlayMode/barClockMode/barTimerDuration so
 * apply (write) and selectCurrentBarConfig (read) stay in lockstep and can be
 * verified via roundtrip tests.
 *
 * Notes:
 * - barLoopMode is forced to "once" to match legacy applyEntryToEngine behavior;
 *   the entry's own barLoopMode is dropped intentionally (kept for parity).
 * - Maps are shallow-cloned so callers can mutate without affecting the entry.
 */
export function entryToBarConfig(entry: PracticeEntry): BarConfig {
  const rawBlocks = entry.loopBlocks ?? [];
  const rawRepeats = { ...(entry.barRepeats || {}) } as Record<number, BarRepeat>;
  const { barRepeats: migratedRepeats, loopBlocks: blocks } = migrateLayerBlocks(rawBlocks, rawRepeats);
  return {
    beatsPerMeasure: entry.beatsPerMeasure,
    beatTypes: [...entry.beatTypes],
    beatSubdivisions: { ...entry.beatSubdivisions },
    barRepeats: migratedRepeats,
    loopBlocks: [...blocks],
    barClockMode: entry.barClockMode || "stopwatch",
    barTimerDuration: entry.barTimerDuration ?? 180,
    noteSamples: { ...(entry.noteSamples || {}) } as NoteSampleMap,
    noteSampleNames: { ...(entry.noteSampleNames || {}) } as NoteSampleNameMap,
    noteSampleSources: { ...(entry.noteSampleSources || {}) } as NoteSampleSourceMap,
    noteSampleChannels: { ...(entry.noteSampleChannels || {}) } as NoteSampleChannelMap,
    noteSampleVolumes: { ...(entry.noteSampleVolumes || {}) },
    noteSampleSpeeds: { ...(entry.noteSampleSpeeds || {}) },
    barLoopMode: "once",
    blockPlayMode: entry.blockPlayMode || "loop",
    hasBeenConfigured: true,
  };
}

/**
 * 엔진 setter 시퀀스 추출. 라이브 컴포넌트(`applyEntryToEngine`,
 * `noteStartPlayingEntry`)에서 똑같이 호출되던 8단 setter 호출을 한 곳에 모아
 * - 호출 순서가 바뀔 일이 없게 단일 source로 만들고
 * - fake 엔진 spy로 단위 테스트가 가능하도록 한다.
 *
 * 인자 `engine`은 `MetronomeEngine`의 사용 메서드만 추린 부분 인터페이스라
 * 테스트에서 spy 객체로 그대로 주입할 수 있다.
 *
 * 호출 순서·인자가 바뀌면 사용자가 연습 항목을 불러올 때 마지막에 적용된 값이
 * 이전 값을 덮어써서 화면과 실제 재생이 어긋나는 사고가 가능하므로, 이 헬퍼를
 * 단일 진입점으로 유지한다.
 */
export interface EntryEngineSetters {
  setBpm(bpm: number): void;
  setBeatsPerMeasure(beats: number): void;
  setBeatTypes(types: BeatType[]): void;
  setAllBeatSubdivisions(subs: Record<string, BeatType[]>): void;
  setLoopBlocks(blocks: LoopBlock[]): void;
  setBlockPlayMode(mode: BlockPlayMode): void;
  setRandomBarOrder?(order: number[] | null): void;
  setAllBarRepeats(repeats: Record<number, BarRepeat>): void;
  setAllBarBpmOverrides(overrides: Record<number, number>): void;
}

export function applyEntryToEngine(engine: EntryEngineSetters, entry: PracticeEntry, denominator: 2 | 4 | 8 = 4): void {
  const rawBlocks = entry.loopBlocks ?? [];
  const rawRepeats = { ...(entry.barRepeats || {}) } as Record<number, BarRepeat>;
  const { barRepeats: migratedRepeats, loopBlocks: blocks } = migrateLayerBlocks(rawBlocks, rawRepeats);
  engine.setBpm(entry.bpm * (4 / denominator));
  engine.setBeatsPerMeasure(entry.beatsPerMeasure);
  engine.setBeatTypes([...entry.beatTypes]);
  engine.setAllBeatSubdivisions({ ...entry.beatSubdivisions });
  engine.setLoopBlocks([...blocks] as LoopBlock[]);
  engine.setBlockPlayMode(entry.blockPlayMode || "loop");
  engine.setRandomBarOrder?.(entry.randomBarOrder?.length ? entry.randomBarOrder : null);
  engine.setAllBarRepeats(migratedRepeats);
  // BPM 오버라이드는 양수만 추출. 0/음수/누락은 "오버라이드 없음"으로 간주
  // (이전 인라인 코드의 truthy 체크와 동일 의도). 엔진은 20~300으로 클램프하므로
  // 0을 흘려보내면 20으로 잘못 강제될 수 있어, 이 경계는 헬퍼에서 막는다.
  // denominator 정규화: 바 오버라이드 BPM도 메인 BPM과 동일하게 quarter-note 단위로
  // 변환해 엔진에 넘긴다. 미변환 시 6/8 등 비4/4 박자에서 2배 속도 차이가 발생한다.
  const bpmOverrides: Record<number, number> = {};
  for (const [k, v] of Object.entries(migratedRepeats)) {
    if (typeof v.bpm === "number" && v.bpm > 0) {
      bpmOverrides[Number(k)] = toEngineBpm(
        v.bpm,
        v.meterDenominator ?? denominator,
      );
    }
  }
  engine.setAllBarBpmOverrides(bpmOverrides);
}

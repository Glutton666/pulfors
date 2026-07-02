import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type BeatType = "strong" | "accent" | "normal" | "mute";
export type HapticMode = "all" | "accent" | "off";

export interface ProgressInfo {
  beat: number;
  barRepeatCurrent: number;
  barRepeatTotal: number;
  blockIndex: number;
  blockRepeatCurrent: number;
  blockRepeatTotal: number;
  jumpCurrent?: number;
  jumpTotal?: number;
  jumpSourceBlockIndex?: number;
  layerIndex?: number;
  layerBeat?: number;
}


export const soundSets = {
  classic: {
    high: require("@/assets/sounds/click-high.wav"),
    low: require("@/assets/sounds/click-low.wav"),
    strong: require("@/assets/sounds/click-strong.wav"),
  },
  woodblock: {
    high: require("@/assets/sounds/woodblock-high.wav"),
    low: require("@/assets/sounds/woodblock-low.wav"),
    strong: require("@/assets/sounds/woodblock-strong.wav"),
  },
  cowbell: {
    high: require("@/assets/sounds/cowbell-high.wav"),
    low: require("@/assets/sounds/cowbell-low.wav"),
    strong: require("@/assets/sounds/cowbell-strong.wav"),
  },
  digital: {
    high: require("@/assets/sounds/digital-high.wav"),
    low: require("@/assets/sounds/digital-low.wav"),
    strong: require("@/assets/sounds/digital-strong.wav"),
  },
  rimshot: {
    high: require("@/assets/sounds/rimshot-high.wav"),
    low: require("@/assets/sounds/rimshot-low.wav"),
    strong: require("@/assets/sounds/rimshot-strong.wav"),
  },
  triangle: {
    high: require("@/assets/sounds/triangle-high.wav"),
    low: require("@/assets/sounds/triangle-low.wav"),
    strong: require("@/assets/sounds/triangle-strong.wav"),
  },
  hihat: {
    high: require("@/assets/sounds/hihat-high.wav"),
    low: require("@/assets/sounds/hihat-low.wav"),
    strong: require("@/assets/sounds/hihat-strong.wav"),
  },
  jamblock: {
    high: require("@/assets/sounds/jamblock-high.wav"),
    low: require("@/assets/sounds/jamblock-low.wav"),
    strong: require("@/assets/sounds/jamblock-strong.wav"),
  },
};

/**
 * Drum-machine sounds used exclusively by the drum pad.
 * Kept separate from soundSets so they don't appear in the metronome sound picker.
 */
export const drumPadSounds = {
  kick: {
    strong: require("@/assets/sounds/kick-strong.wav"),
    high: require("@/assets/sounds/kick-high.wav"),
    low: require("@/assets/sounds/kick-low.wav"),
  },
  snare: {
    strong: require("@/assets/sounds/snare-strong.wav"),
    high: require("@/assets/sounds/snare-high.wav"),
    low: require("@/assets/sounds/snare-low.wav"),
  },
  clap: {
    strong: require("@/assets/sounds/clap-strong.wav"),
    high: require("@/assets/sounds/clap-high.wav"),
    low: require("@/assets/sounds/clap-low.wav"),
  },
  openhat: {
    strong: require("@/assets/sounds/openhat-strong.wav"),
    high: require("@/assets/sounds/openhat-high.wav"),
    low: require("@/assets/sounds/openhat-low.wav"),
  },
  tom: {
    strong: require("@/assets/sounds/tom-strong.wav"),
    high: require("@/assets/sounds/tom-high.wav"),
    low: require("@/assets/sounds/tom-low.wav"),
  },
  crash: {
    strong: require("@/assets/sounds/crash-strong.wav"),
    high: require("@/assets/sounds/crash-high.wav"),
    low: require("@/assets/sounds/crash-low.wav"),
  },
};

export const highClickSource = soundSets.classic.high;
export const lowClickSource = soundSets.classic.low;
export const strongClickSource = soundSets.classic.strong;

export interface ScheduledTick {
  time: number;
  beat: number;
  subBeat: number;
  type: BeatType;
  isMainBeat: boolean;
  repeatIteration: number;
  barRepeatIteration: number;
  barRepeatTotal: number;
  blockIndex: number;
  blockRepeatTotal: number;
  jumpIteration: number;
  jumpTotal: number;
  jumpSourceBlockIndex: number;
  layerIndex: number;
  layerBeat: number;
  layerSoundSet?: string;
  /** isEnd 심볼의 마지막 허용 반복에서 발생 — 이 tick 재생 후 엔진 전체 정지 */
  stopAfterThis?: boolean;
}

export interface LoopBlockData {
  startBeat: number;
  endBeat: number;
  type: "count" | "duration";
  value: number;
  jumpToBlock?: number;
  jumpCount?: number;
  bpm?: number;
  soundSet?: string;
  layerOf?: number;
  ownBeatTypes?: Record<number, string>;
  ownSubdivisions?: Record<string, string[]>;
}

export type BarRepeatSpec = {
  type: "count" | "duration";
  value: number;
  /** N회 부호: blockIteration >= voltaMax 이면 이 바를 건너뜀 */
  voltaMax?: number;
  /** 끝 부호: 마지막 외부 반복 패스(outerIter === outerRepTotal-1)에서 이 바 이후 정지 */
  isEnd?: boolean;
  /** →N 점프 출발지: 매칭 jumpToId 바로 리다이렉트 (1회) */
  jumpFromId?: number;
  /** ←N 점프 목적지 */
  jumpToId?: number;
  /** 바 단위 레이어: 각 레이어는 독립적인 subdivision 패턴으로 메인 비트와 동시에 재생됨 */
  layers?: Array<{ beatType?: string; subdivisions?: string[]; soundSet?: string }>;
};

export interface ScheduleInputs {
  bpm: number;
  halfTime: boolean;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Map<number, BeatType[]>;
  barRepeats: Map<number, BarRepeatSpec>;
  barBpmOverrides: Map<number, number>;
  sortedBlocks: LoopBlockData[];
  origToSorted: Map<number, number>;
  sortedToOrig: Map<number, number>;
  startBeatToBlocks: Map<number, number[]>;
  loopBlocks: LoopBlockData[];
}

export interface JumpState {
  iteration: number;
  total: number;
  sourceBlockIndex: number;
}

export interface EmitState {
  ticks: ScheduledTick[];
  time: number;
  jump: JumpState;
}

/** 순수 함수: 한 비트의 실제 길이(ms)를 반환. */
export function pureGetBeatDur(
  inputs: Pick<ScheduleInputs, "bpm" | "halfTime" | "barBpmOverrides">,
  beat: number,
  blockBpm?: number,
): number {
  const bpm = inputs.barBpmOverrides.get(beat) ?? blockBpm ?? inputs.bpm;
  const effectiveBpm = inputs.halfTime ? bpm / 2 : bpm;
  return 60000 / effectiveBpm;
}

/** 순수 함수: 한 비트에 적용될 서브디비전 패턴을 반환. */
export function pureGetSubPattern(
  beatTypes: BeatType[],
  beatSubdivisions: Map<number, BeatType[]>,
  beat: number,
): BeatType[] {
  const beatType = beatTypes[beat] || "normal";
  const custom = beatSubdivisions.get(beat);
  if (!custom || custom.length === 0) return [beatType];
  if (beatType === "mute") return custom.map(() => "mute" as BeatType);
  if (beatType === "strong") {
    const result = [...custom];
    if (result[0] === "normal" || result[0] === "accent") result[0] = "strong";
    return result;
  }
  if (beatType === "accent") {
    const result = [...custom];
    if (result[0] === "normal") result[0] = "accent";
    return result;
  }
  return custom;
}

/** 순수 함수: 주어진 범위의 첫 비트에서 시작하는 가장 가까운 자식(non-layer) 블록 인덱스. 없으면 -1. */
export function pureFindInnerBlock(
  sortedBlocks: LoopBlockData[],
  startBeatToBlocks: Map<number, number[]>,
  startB: number,
  endB: number,
  parentBlockIdx: number,
): number {
  const candidates = startBeatToBlocks.get(startB);
  if (!candidates) return -1;
  for (const iIdx of candidates) {
    if (iIdx === parentBlockIdx) continue;
    const ib = sortedBlocks[iIdx];
    if (ib.layerOf !== undefined) continue;
    if (ib.startBeat >= startB && ib.endBeat <= endB) return iIdx;
  }
  return -1;
}

/** 순수 함수: 블록 한 번 통과하는 길이(ms)를 재귀적으로 계산. durCache로 메모이즈. */
export function pureCalcSinglePassDur(
  inputs: ScheduleInputs,
  durCache: Map<string, number>,
  startB: number,
  endB: number,
  parentBlockIdx: number,
  blockBpm?: number,
): number {
  const cacheKey = `${startB}:${endB}:${parentBlockIdx}:${blockBpm ?? ""}`;
  const cached = durCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let dur = 0;
  let b = startB;
  while (b <= endB) {
    const innerIdx = pureFindInnerBlock(inputs.sortedBlocks, inputs.startBeatToBlocks, b, endB, parentBlockIdx);
    if (innerIdx >= 0) {
      const inner = inputs.sortedBlocks[innerIdx];
      const innerEnd = Math.min(inner.endBeat, endB);
      const innerBpm = inner.bpm ?? blockBpm;
      const innerPassDur = pureCalcSinglePassDur(inputs, durCache, inner.startBeat, innerEnd, innerIdx, innerBpm);
      let innerRepCount = 1;
      if (inner.type === "count") innerRepCount = Math.max(1, inner.value);
      else innerRepCount = Math.max(1, Math.round((inner.value * 1000) / (innerPassDur || 1)));
      dur += innerPassDur * innerRepCount;
      b = innerEnd + 1;
    } else {
      const bd = pureGetBeatDur(inputs, b, blockBpm);
      const barRep = inputs.barRepeats.get(b);
      const barRepCount = barRep
        ? (barRep.type === "count" ? Math.max(1, barRep.value) : Math.max(1, Math.round((barRep.value * 1000) / bd)))
        : 1;
      dur += bd * barRepCount;
      b++;
    }
  }
  durCache.set(cacheKey, dur);
  return dur;
}

/** 순수 함수(state mutate): 한 비트(서브디비전 포함)의 ticks를 state에 추가하고 state.time을 전진시킨다. */
export function pureAddBeatTicks(
  inputs: ScheduleInputs,
  state: EmitState,
  beat: number,
  iteration: number,
  barRepIter: number,
  barRepTotal: number,
  blkIdx: number,
  blkRepTotal: number,
  blockBpm?: number,
): void {
  const subPattern = pureGetSubPattern(inputs.beatTypes, inputs.beatSubdivisions, beat);
  const beatDur = pureGetBeatDur(inputs, beat, blockBpm);
  const subDur = beatDur / subPattern.length;
  for (let sub = 0; sub < subPattern.length; sub++) {
    state.ticks.push({
      time: state.time,
      beat,
      subBeat: sub,
      type: subPattern[sub],
      isMainBeat: sub === 0,
      repeatIteration: iteration,
      barRepeatIteration: barRepIter,
      barRepeatTotal: barRepTotal,
      blockIndex: blkIdx,
      blockRepeatTotal: blkRepTotal,
      jumpIteration: state.jump.iteration,
      jumpTotal: state.jump.total,
      jumpSourceBlockIndex: state.jump.sourceBlockIndex,
      layerIndex: 0,
      layerBeat: beat,
    });
    state.time += subDur;
  }
}

/** 순수 함수(state mutate): barRepeats.layers의 레이어 ticks를 beatStartTime 기준으로 추가. */
function pureAddBarLayerTicks(
  inputs: ScheduleInputs,
  state: EmitState,
  beat: number,
  iteration: number,
  barRepIter: number,
  barRepTotal: number,
  blkIdx: number,
  blkRepTotal: number,
  blockBpm: number | undefined,
  beatStartTime: number,
  beatDur: number,
  layers: Array<{ beatType?: string; subdivisions?: string[]; soundSet?: string }>,
): void {
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const subPattern: BeatType[] = layer.subdivisions?.length
      ? (layer.subdivisions as BeatType[])
      : (layer.beatType ? [layer.beatType as BeatType] : ["normal"]);
    const subDur = beatDur / subPattern.length;
    for (let sub = 0; sub < subPattern.length; sub++) {
      state.ticks.push({
        time: beatStartTime + sub * subDur,
        beat,
        subBeat: sub,
        type: subPattern[sub],
        isMainBeat: sub === 0,
        repeatIteration: iteration,
        barRepeatIteration: barRepIter,
        barRepeatTotal: barRepTotal,
        blockIndex: blkIdx,
        blockRepeatTotal: blkRepTotal,
        jumpIteration: state.jump.iteration,
        jumpTotal: state.jump.total,
        jumpSourceBlockIndex: state.jump.sourceBlockIndex,
        layerIndex: li + 1,
        layerBeat: beat,
        layerSoundSet: layer.soundSet,
      });
    }
  }
}

/** 순수 함수(state mutate): 바 반복(barRepeats)을 고려하여 한 비트의 ticks를 state에 추가. */
export function pureAddBarWithRepeat(
  inputs: ScheduleInputs,
  state: EmitState,
  beat: number,
  blockIteration: number,
  blkIdx: number,
  blkRepTotal: number,
  blockBpm?: number,
): void {
  const barRep = inputs.barRepeats.get(beat);
  // voltaMax: 이 바를 최대 voltaMax번만 재생. blockIteration >= voltaMax 이면 건너뜀.
  if (barRep?.voltaMax && barRep.voltaMax > 0 && blockIteration >= barRep.voltaMax) {
    return;
  }
  const beatDur = pureGetBeatDur(inputs, beat, blockBpm);
  if (barRep) {
    let barRepeatCount = 1;
    if (barRep.type === "count") barRepeatCount = Math.max(1, barRep.value);
    else barRepeatCount = Math.max(1, Math.round((barRep.value * 1000) / beatDur));
    for (let r = 0; r < barRepeatCount; r++) {
      const beatStartTime = state.time;
      pureAddBeatTicks(inputs, state, beat, blockIteration, r, barRepeatCount, blkIdx, blkRepTotal, blockBpm);
      if (barRep.layers && barRep.layers.length > 0) {
        pureAddBarLayerTicks(inputs, state, beat, blockIteration, r, barRepeatCount, blkIdx, blkRepTotal, blockBpm, beatStartTime, beatDur, barRep.layers);
      }
    }
  } else {
    pureAddBeatTicks(inputs, state, beat, blockIteration, 0, 1, blkIdx, blkRepTotal, blockBpm);
  }
}

/** 순수 함수(state mutate): [startB, endB] 범위의 비트들을 차례로 emit. inner 블록을 만나면 재귀로 처리.
 *  - isEnd 바에서 범위 emit을 조기 종료.
 *  - jumpFromId 바에서 매칭 jumpToId 바로 1회 리다이렉트.
 */
export function pureEmitBeatsInRange(
  inputs: ScheduleInputs,
  state: EmitState,
  durCache: Map<string, number>,
  startB: number,
  endB: number,
  outerBlockIdx: number,
  outerIter: number,
  outerRepTotal: number,
  blockBpm: number | undefined,
): void {
  const { sortedBlocks, sortedToOrig, startBeatToBlocks } = inputs;
  let b = startB;
  /** jumpFromId → 이미 점프 실행된 ID 집합 (동일 패스 내 무한루프 방지) */
  const usedJumpIds = new Set<number>();
  while (b <= endB) {
    const innerIdx = pureFindInnerBlock(sortedBlocks, startBeatToBlocks, b, endB, outerBlockIdx);
    if (innerIdx >= 0) {
      const inner = sortedBlocks[innerIdx];
      const innerEnd = Math.min(inner.endBeat, endB);
      const innerBpm = inner.bpm ?? blockBpm;
      const innerPassDur = pureCalcSinglePassDur(inputs, durCache, inner.startBeat, innerEnd, innerIdx, innerBpm);
      let innerRepCount = 1;
      if (inner.type === "count") innerRepCount = Math.max(1, inner.value);
      else innerRepCount = Math.max(1, Math.round((inner.value * 1000) / (innerPassDur || 1)));
      for (let ir = 0; ir < innerRepCount; ir++) {
        const innerStartTime = state.time;
        pureEmitBeatsInRange(inputs, state, durCache, inner.startBeat, innerEnd, innerIdx, ir, innerRepCount, innerBpm);
        const innerOrigIdx = sortedToOrig.get(innerIdx) ?? innerIdx;
        const innerDur = state.time - innerStartTime;
        if (innerDur > 0) {
          pureEmitStackedBlockTicks(inputs, state, innerOrigIdx, innerStartTime, innerDur, ir, innerRepCount);
        }
      }
      b = innerEnd + 1;
    } else {
      pureAddBarWithRepeat(inputs, state, b, outerIter, outerBlockIdx, outerRepTotal, blockBpm);
      const barRep = inputs.barRepeats.get(b);
      // isEnd: volta 조건이 소진된 마지막 허용 반복에서 이 바 이후 재생 정지.
      // voltaMax가 있으면 outerIter >= voltaMax - 1 이 소진 기준, 없으면 마지막 외부 반복.
      if (barRep?.isEnd) {
        const isLastVolta = barRep.voltaMax ? (outerIter >= barRep.voltaMax - 1) : (outerIter >= outerRepTotal - 1);
        if (isLastVolta) {
          // 마지막 tick에 stopAfterThis 플래그 설정 → 엔진 루프에서 재생 즉시 정지
          if (state.ticks.length > 0) {
            state.ticks[state.ticks.length - 1] = {
              ...state.ticks[state.ticks.length - 1],
              stopAfterThis: true,
            };
          }
          break;
        }
      }
      // jumpFromId: 매칭 jumpToId 바로 1회 리다이렉트 (이전 바 중 검색)
      if (barRep?.jumpFromId && !usedJumpIds.has(barRep.jumpFromId)) {
        const jumpId = barRep.jumpFromId;
        let jumpTarget = -1;
        for (let jb = startB; jb < b; jb++) {
          const jr = inputs.barRepeats.get(jb);
          if (jr?.jumpToId === jumpId) { jumpTarget = jb; break; }
        }
        if (jumpTarget >= 0) {
          usedJumpIds.add(jumpId);
          b = jumpTarget;
          continue;
        }
      }
      b++;
    }
  }
}

/** 순수 함수(state mutate): 한 블록의 모든 반복(count/duration)을 emit. layer 블록은 스킵. */
export function pureEmitBlock(
  inputs: ScheduleInputs,
  state: EmitState,
  durCache: Map<string, number>,
  blockIdx: number,
  jumpVisited: Set<number>,
): void {
  const { sortedBlocks, sortedToOrig, beatsPerMeasure } = inputs;
  if (jumpVisited.has(blockIdx) || blockIdx < 0 || blockIdx >= sortedBlocks.length) return;
  jumpVisited.add(blockIdx);
  const block = sortedBlocks[blockIdx];
  const origIdx = sortedToOrig.get(blockIdx) ?? blockIdx;
  if (block.layerOf !== undefined && block.layerOf !== null) return;
  const endBeat = Math.min(block.endBeat, beatsPerMeasure - 1);

  const blockBpm = block.bpm;
  const singlePassDurMs = pureCalcSinglePassDur(inputs, durCache, block.startBeat, endBeat, blockIdx, blockBpm);

  let blockRepeatCount = 1;
  if (block.type === "count") {
    blockRepeatCount = Math.max(1, block.value);
  } else {
    blockRepeatCount = Math.max(1, Math.round((block.value * 1000) / (singlePassDurMs || 1)));
  }

  for (let r = 0; r < blockRepeatCount; r++) {
    const passStartTime = state.time;
    pureEmitBeatsInRange(inputs, state, durCache, block.startBeat, endBeat, blockIdx, r, blockRepeatCount, blockBpm);
    const passDur = state.time - passStartTime;
    if (passDur > 0) {
      pureEmitStackedBlockTicks(inputs, state, origIdx, passStartTime, passDur, r, blockRepeatCount);
    }
  }
}

/** 순수 함수(state mutate): 한 블록을 처리. jumpToBlock이 있으면 jumpCount만큼 자기 자신과 점프 대상 블록을 교대 emit. */
export function pureProcessBlock(
  inputs: ScheduleInputs,
  state: EmitState,
  durCache: Map<string, number>,
  jumpProcessed: Set<number>,
  blockIdx: number,
  jumpVisited: Set<number>,
): void {
  const { sortedBlocks, origToSorted, sortedToOrig } = inputs;
  if (blockIdx < 0 || blockIdx >= sortedBlocks.length) return;
  const block = sortedBlocks[blockIdx];

  if (block.jumpToBlock !== undefined && block.jumpToBlock !== null) {
    const jumpSortedIdx = origToSorted.get(block.jumpToBlock);
    if (jumpSortedIdx !== undefined) {
      const jumpCount = Math.max(1, block.jumpCount || 1);
      const prevJumpTotal = state.jump.total;
      const prevJumpIteration = state.jump.iteration;
      const prevJumpSource = state.jump.sourceBlockIndex;
      state.jump.total = jumpCount;
      state.jump.sourceBlockIndex = sortedToOrig.get(blockIdx) ?? blockIdx;

      for (let ji = 0; ji < jumpCount; ji++) {
        state.jump.iteration = ji;
        pureEmitBlock(inputs, state, durCache, blockIdx, new Set(jumpVisited));
        const jumpVisitedCopy = new Set(jumpVisited);
        pureEmitBlock(inputs, state, durCache, jumpSortedIdx, jumpVisitedCopy);
      }

      state.jump.iteration = prevJumpIteration;
      state.jump.total = prevJumpTotal;
      state.jump.sourceBlockIndex = prevJumpSource;

      jumpProcessed.add(jumpSortedIdx);
      return;
    }
  }

  pureEmitBlock(inputs, state, durCache, blockIdx, jumpVisited);
}

/** 외부에서 주입되는 블록 emit 캐시 핸들. */
export interface BlockEmitCacheHandle {
  cache: Map<string, { ticks: ScheduledTick[]; durMs: number }>;
  cacheMax: number;
  computeFingerprint: (outerSortedIdx: number) => string | null;
  onReuse: () => void;
  onBuild: () => void;
}

/** 순수 함수(state+cache mutate): outer 블록을 처리하되 fingerprint 적중 시 캐시된 ticks를 재사용. */
export function pureProcessOuterCached(
  inputs: ScheduleInputs,
  state: EmitState,
  durCache: Map<string, number>,
  jumpProcessed: Set<number>,
  cacheHandle: BlockEmitCacheHandle,
  outerIdx: number,
): void {
  const { sortedBlocks, origToSorted } = inputs;
  if (outerIdx < 0 || outerIdx >= sortedBlocks.length) {
    pureProcessBlock(inputs, state, durCache, jumpProcessed, outerIdx, new Set());
    return;
  }
  const inJump =
    state.jump.iteration !== 0 ||
    state.jump.total !== 0 ||
    state.jump.sourceBlockIndex !== -1;
  const fp = inJump ? null : cacheHandle.computeFingerprint(outerIdx);
  const cached = fp ? cacheHandle.cache.get(fp) : undefined;
  if (cached) {
    const startTime = state.time;
    for (const t of cached.ticks) {
      state.ticks.push({ ...t, time: t.time + startTime });
    }
    state.time = startTime + cached.durMs;
    const block = sortedBlocks[outerIdx];
    if (block.jumpToBlock !== undefined && block.jumpToBlock !== null) {
      const jSorted = origToSorted.get(block.jumpToBlock);
      if (jSorted !== undefined) jumpProcessed.add(jSorted);
    }
    cacheHandle.cache.delete(fp!);
    cacheHandle.cache.set(fp!, cached);
    cacheHandle.onReuse();
    return;
  }
  const startTime = state.time;
  const startTickIdx = state.ticks.length;
  pureProcessBlock(inputs, state, durCache, jumpProcessed, outerIdx, new Set());
  if (fp) {
    const slice = state.ticks.slice(startTickIdx).map(t => {
      const copy: ScheduledTick = { ...t, time: t.time - startTime };
      Object.freeze(copy);
      return copy;
    });
    Object.freeze(slice);
    cacheHandle.cache.set(fp, { ticks: slice, durMs: state.time - startTime });
    cacheHandle.onBuild();
    while (cacheHandle.cache.size > cacheHandle.cacheMax) {
      const firstKey = cacheHandle.cache.keys().next().value;
      if (firstKey === undefined) break;
      cacheHandle.cache.delete(firstKey);
    }
  }
}

/** 순수 함수(state mutate): 부모 블록 위에 stacked layer 블록의 ticks를 state에 추가. state.time은 변경 없음. */
export function pureEmitStackedBlockTicks(
  inputs: ScheduleInputs,
  state: EmitState,
  parentOrigIdx: number,
  blockStartTime: number,
  blockDurMs: number,
  repIteration: number,
  repTotal: number,
): void {
  const stackedBlocks: { block: LoopBlockData; origIdx: number; layerNum: number }[] = [];
  let layerNum = 1;
  for (let oi = 0; oi < inputs.loopBlocks.length; oi++) {
    if (inputs.loopBlocks[oi].layerOf === parentOrigIdx) {
      const si = inputs.origToSorted.get(oi);
      if (si !== undefined) {
        stackedBlocks.push({ block: inputs.sortedBlocks[si], origIdx: oi, layerNum: layerNum++ });
      }
    }
  }
  if (stackedBlocks.length === 0) return;

  for (const { block: stackBlock, origIdx: stackOrigIdx, layerNum: ln } of stackedBlocks) {
    const stackBeats = Math.max(1, stackBlock.endBeat - stackBlock.startBeat + 1);
    const stackBpm = stackBlock.bpm;
    const stackBeatDur = stackBpm
      ? 60000 / (inputs.halfTime ? stackBpm / 2 : stackBpm)
      : blockDurMs / stackBeats;

    for (let lb = 0; lb < stackBeats; lb++) {
      const beatStartTime = blockStartTime + lb * stackBeatDur;
      if (beatStartTime >= blockStartTime + blockDurMs) break;
      const lbBeat = stackBlock.startBeat + lb;
      const rawBlock = inputs.loopBlocks[stackOrigIdx];
      let subPat: BeatType[];
      if (rawBlock?.ownSubdivisions) {
        const ownSub = rawBlock.ownSubdivisions[String(lbBeat)];
        if (ownSub) {
          subPat = ownSub as BeatType[];
        } else {
          const ownType = (rawBlock.ownBeatTypes?.[lbBeat] as BeatType) || "normal";
          subPat = [ownType];
        }
      } else if (rawBlock?.ownBeatTypes) {
        const ownType = (rawBlock.ownBeatTypes[lbBeat] as BeatType) || "normal";
        subPat = pureGetSubPattern(inputs.beatTypes, inputs.beatSubdivisions, lbBeat);
        if (subPat.length === 1) subPat = [ownType];
        else subPat = subPat.map((s, si) => (si === 0 ? ownType : s));
      } else {
        subPat = pureGetSubPattern(inputs.beatTypes, inputs.beatSubdivisions, lbBeat);
      }
      const subDur = stackBeatDur / subPat.length;
      for (let sub = 0; sub < subPat.length; sub++) {
        const tickTime = beatStartTime + sub * subDur;
        if (tickTime >= blockStartTime + blockDurMs) break;
        state.ticks.push({
          time: tickTime,
          beat: -1,
          subBeat: sub,
          type: subPat[sub],
          isMainBeat: sub === 0,
          repeatIteration: repIteration,
          barRepeatIteration: 0,
          barRepeatTotal: 1,
          blockIndex: stackOrigIdx,
          blockRepeatTotal: repTotal,
          jumpIteration: state.jump.iteration,
          jumpTotal: state.jump.total,
          jumpSourceBlockIndex: state.jump.sourceBlockIndex,
          layerIndex: ln,
          layerBeat: lb,
        });
      }
    }
  }
}

export class MetronomeEngine {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private isRunning = false;
  private bpm = 120;
  private halfTime = false;
  private beatsPerMeasure = 4;
  private currentBeat = 0;
  private currentSubBeat = 0;
  private beatTypes: BeatType[] = ["accent", "normal", "normal", "normal"];
  private beatSubdivisions: Map<number, BeatType[]> = new Map();
  private onBeat: ((beat: number, isAccent: boolean) => void) | null = null;
  private onSubBeat: ((beat: number, subBeat: number) => void) | null = null;
  private onMeasureComplete: (() => void) | null = null;
  private stopAfterMeasure = false;
  private playStrongClick: (() => void) | null = null;
  private playHighClick: (() => void) | null = null;
  private playLowClick: (() => void) | null = null;
  private playCustomSample: ((beat: number, subBeat: number) => boolean) | null = null;
  private hapticMode: HapticMode = "all";
  private audioOffsetMs: number = 0;
  private loopBlocks: { startBeat: number; endBeat: number; type: "count" | "duration"; value: number; jumpToBlock?: number; jumpCount?: number; bpm?: number; soundSet?: string; layerOf?: number; ownBeatTypes?: Record<number, string>; ownSubdivisions?: Record<string, string[]> }[] = [];
  private blockPlayMode: "sequential" | "loop" | "random" = "loop";
  private barRepeats: Map<number, BarRepeatSpec> = new Map();
  private barBpmOverrides: Map<number, number> = new Map();
  private preRenderedAudio = false;
  private pendingMeasureStartAction: (() => void) | null = null;
  private onProgress: ((info: ProgressInfo) => void) | null = null;
  private onScheduleRebuild: (() => void) | null = null;

  private schedule: ScheduledTick[] = [];
  private cachedSchedule: ScheduledTick[] | null = null;
  private cachedMeasureDurationMs = 0;
  private scheduleDirty = true;
  private scheduleIndex = 0;
  private measureStartTime = 0;
  private measureDurationMs = 0;
  private measureCount = 0;
  private anchorWallTime = 0;
  private anchorMeasureCount = 0;
  private anchorMeasureDurationMs = 0;
  private pendingOffsetTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  private static readonly SCHEDULE_CACHE_MAX = 16;
  private scheduleCache: Map<string, { ticks: ScheduledTick[]; durationMs: number }> = new Map();
  private lastScheduleCacheHit = false;

  private static readonly BLOCK_CACHE_MAX = 64;
  private blockEmitCache: Map<string, { ticks: ScheduledTick[]; durMs: number }> = new Map();
  private lastBlockCacheReused = 0;
  private lastBlockCacheBuilt = 0;

  setAudioCallbacks(playHigh: () => void, playLow: () => void, playStrong?: () => void) {
    this.playHighClick = playHigh;
    this.playLowClick = playLow;
    this.playStrongClick = playStrong || null;
  }

  private playLayerClick: ((layerIndex: number, role: "high" | "low" | "strong", soundSet?: string) => void) | null = null;
  private playBlockClick: ((blockIndex: number, role: "high" | "low" | "strong") => void) | null = null;
  private onClickEmitted: ((at: number) => void) | null = null;

  setOnClickEmitted(cb: ((at: number) => void) | null) {
    this.onClickEmitted = cb;
  }

  setLayerAudioCallback(cb: (layerIndex: number, role: "high" | "low" | "strong", soundSet?: string) => void) {
    this.playLayerClick = cb;
  }

  setBlockAudioCallback(cb: (blockIndex: number, role: "high" | "low" | "strong") => void) {
    this.playBlockClick = cb;
  }

  setCustomSampleCallback(callback: ((beat: number, subBeat: number) => boolean) | null) {
    this.playCustomSample = callback;
  }

  setHapticMode(mode: HapticMode) {
    this.hapticMode = mode;
  }

  setAudioOffsetMs(offset: number) {
    this.audioOffsetMs = Math.max(-100, Math.min(100, offset));
  }

  setPreRenderedAudio(enabled: boolean) {
    this.preRenderedAudio = enabled;
  }

  setPendingMeasureStartAction(action: (() => void) | null) {
    this.pendingMeasureStartAction = action;
  }

  setOnBeat(callback: (beat: number, isAccent: boolean) => void) {
    this.onBeat = callback;
  }

  setOnSubBeat(callback: ((beat: number, subBeat: number) => void) | null) {
    this.onSubBeat = callback;
  }

  setOnMeasureComplete(callback: (() => void) | null) {
    this.onMeasureComplete = callback;
  }

  setOnScheduleRebuild(callback: (() => void) | null) {
    this.onScheduleRebuild = callback;
  }

  requestStopAfterMeasure() {
    if (!this.isRunning) return;
    this.stopAfterMeasure = true;
  }

  getBeatsPerMeasure() {
    return this.beatsPerMeasure;
  }

  getCurrentBeat() {
    return this.currentBeat;
  }

  private invalidateScheduleCache() {
    this.scheduleDirty = true;
    this.cachedSchedule = null;
  }

  setBpm(bpm: number) {
    this.bpm = Math.max(20, Math.min(300, bpm));
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  setBeatsPerMeasure(beats: number) {
    this.beatsPerMeasure = beats;
    this.currentBeat = 0;
    this.currentSubBeat = 0;
    for (const key of this.beatSubdivisions.keys()) {
      if (key >= beats) {
        this.beatSubdivisions.delete(key);
      }
    }
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  setBeatTypes(types: BeatType[]) {
    this.beatTypes = types;
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  getBeatTypes(): BeatType[] {
    return this.beatTypes;
  }

  setBeatSubdivision(beatIndex: number, pattern: BeatType[] | null) {
    if (pattern === null || pattern.length <= 1) {
      this.beatSubdivisions.delete(beatIndex);
    } else {
      this.beatSubdivisions.set(beatIndex, [...pattern]);
    }
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  getBeatSubdivision(beatIndex: number): BeatType[] | null {
    return this.beatSubdivisions.get(beatIndex) || null;
  }

  getAllBeatSubdivisions(): Record<string, BeatType[]> {
    const result: Record<string, BeatType[]> = {};
    for (const [key, value] of this.beatSubdivisions.entries()) {
      result[String(key)] = [...value];
    }
    return result;
  }

  setAllBeatSubdivisions(subs: Record<string, BeatType[]>) {
    this.beatSubdivisions.clear();
    for (const [key, value] of Object.entries(subs)) {
      this.beatSubdivisions.set(Number(key), [...value]);
    }
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  setLoopBlocks(blocks: { startBeat: number; endBeat: number; type: "count" | "duration"; value: number; jumpToBlock?: number; jumpCount?: number; bpm?: number; soundSet?: string; layerOf?: number; ownBeatTypes?: Record<number, string>; ownSubdivisions?: Record<string, string[]> }[]) {
    this.loopBlocks = blocks.map(b => ({ ...b }));
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  setBlockPlayMode(mode: "sequential" | "loop" | "random") {
    this.blockPlayMode = mode;
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  clearLoopBlocks() {
    this.loopBlocks = [];
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  getLoopBlocks() {
    return this.loopBlocks.map(b => ({ ...b }));
  }

  getBlockPlayMode() {
    return this.blockPlayMode;
  }

  getAllBarRepeats(): Record<number, BarRepeatSpec> {
    const result: Record<number, BarRepeatSpec> = {};
    for (const [k, v] of this.barRepeats.entries()) {
      result[k] = { ...v, layers: v.layers ? v.layers.map(l => ({ ...l })) : undefined };
    }
    return result;
  }

  setBarBpmOverride(beat: number, bpm: number | null) {
    if (bpm !== null) {
      this.barBpmOverrides.set(beat, Math.max(20, Math.min(300, bpm)));
    } else {
      this.barBpmOverrides.delete(beat);
    }
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  setAllBarBpmOverrides(overrides: Record<number, number>) {
    this.barBpmOverrides.clear();
    for (const [key, value] of Object.entries(overrides)) {
      this.barBpmOverrides.set(Number(key), Math.max(20, Math.min(300, value)));
    }
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  clearBarBpmOverrides() {
    this.barBpmOverrides.clear();
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  getBarBpmOverrides(): Record<number, number> {
    const result: Record<number, number> = {};
    for (const [key, value] of this.barBpmOverrides.entries()) {
      result[key] = value;
    }
    return result;
  }

  setOnProgress(callback: ((info: ProgressInfo) => void) | null) {
    this.onProgress = callback;
  }

  setBarRepeat(beat: number, repeat: BarRepeatSpec | null) {
    if (repeat) {
      this.barRepeats.set(beat, { ...repeat, layers: repeat.layers ? repeat.layers.map(l => ({ ...l })) : undefined });
    } else {
      this.barRepeats.delete(beat);
    }
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  setAllBarRepeats(repeats: Record<number, BarRepeatSpec>) {
    this.barRepeats.clear();
    for (const [key, value] of Object.entries(repeats)) {
      this.barRepeats.set(Number(key), { ...value, layers: value.layers ? value.layers.map(l => ({ ...l })) : undefined });
    }
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  clearBarRepeats() {
    this.barRepeats.clear();
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  getBpm() {
    return this.bpm;
  }

  buildScheduleOnly() {
    this.schedule = this.buildScheduleMemoized();
    this.cachedSchedule = this.schedule;
    this.cachedMeasureDurationMs = this.measureDurationMs;
    this.scheduleDirty = false;
    this.scheduleIndex = 0;
  }

  /**
   * Drop any pre-built schedule and cache so that the next start (or
   * getScheduleInfo) rebuilds from the current configuration. Use after
   * mode switches or config changes that should not carry over leftover
   * ticks. Does NOT stop a running engine.
   */
  flushSchedule() {
    this.invalidateScheduleCache();
    this.schedule = [];
    this.scheduleIndex = 0;
  }

  getScheduleInfo(): { ticks: ScheduledTick[]; durationMs: number } {
    if (this.schedule.length === 0 || this.scheduleDirty) {
      this.buildScheduleOnly();
    }
    return {
      ticks: this.schedule.slice(),
      durationMs: this.measureDurationMs,
    };
  }

  getIsRunning() {
    return this.isRunning;
  }

  setHalfTime(enabled: boolean) {
    this.halfTime = enabled;
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  getHalfTime() {
    return this.halfTime;
  }

  private computeOuterBlockFingerprint(
    outerSortedIdx: number,
    sortedBlocks: typeof this.loopBlocks,
    origToSorted: Map<number, number>,
    sortedToOrig: Map<number, number>,
  ): string | null {
    const block = sortedBlocks[outerSortedIdx];
    if (!block || block.layerOf !== undefined) return null;

    const involvedSorted = new Set<number>();
    const stack = [outerSortedIdx];
    while (stack.length) {
      const sIdx = stack.pop()!;
      if (involvedSorted.has(sIdx)) continue;
      involvedSorted.add(sIdx);
      const blk = sortedBlocks[sIdx];
      const origIdx = sortedToOrig.get(sIdx) ?? sIdx;
      const startB = blk.startBeat;
      const endB = blk.endBeat;
      for (let s = 0; s < sortedBlocks.length; s++) {
        if (s === sIdx) continue;
        const ob = sortedBlocks[s];
        if (ob.layerOf === undefined && ob.startBeat >= startB && ob.endBeat <= endB) {
          if (!involvedSorted.has(s)) stack.push(s);
        }
      }
      for (let s = 0; s < sortedBlocks.length; s++) {
        const ob = sortedBlocks[s];
        if (ob.layerOf === origIdx && !involvedSorted.has(s)) stack.push(s);
      }
      if (blk.jumpToBlock !== undefined && blk.jumpToBlock !== null) {
        const jSorted = origToSorted.get(blk.jumpToBlock);
        if (jSorted !== undefined && !involvedSorted.has(jSorted)) stack.push(jSorted);
      }
    }

    const involvedList = [...involvedSorted].sort((a, b) => a - b);
    const blocksData = involvedList.map(s => [sortedToOrig.get(s) ?? s, sortedBlocks[s]] as const);

    let minBeat = block.startBeat;
    let maxBeat = Math.min(block.endBeat, this.beatsPerMeasure - 1);
    for (const s of involvedList) {
      const b = sortedBlocks[s];
      minBeat = Math.min(minBeat, b.startBeat);
      maxBeat = Math.max(maxBeat, Math.min(b.endBeat, this.beatsPerMeasure - 1));
    }
    if (minBeat < 0) minBeat = 0;
    if (maxBeat < minBeat) maxBeat = minBeat;

    const btSlice = this.beatTypes.slice(minBeat, maxBeat + 1);
    const subs: Array<[number, BeatType[]]> = [];
    const reps: Array<[number, BarRepeatSpec]> = [];
    const ovs: Array<[number, number]> = [];
    for (let b = minBeat; b <= maxBeat; b++) {
      const s = this.beatSubdivisions.get(b);
      if (s) subs.push([b, s]);
      const r = this.barRepeats.get(b);
      if (r) reps.push([b, r]);
      const o = this.barBpmOverrides.get(b);
      if (o !== undefined) ovs.push([b, o]);
    }

    // Safety note: `reps` contains the full BarRepeatSpec for each beat,
    // including jumpFromId and jumpToId.  These are *structural/behavioral*
    // fields — two bars with different jump IDs produce genuinely different
    // playback outcomes — so including them in the fingerprint is intentional
    // and prevents false cache hits between different jump configurations.
    // They are NOT opaque object-reference IDs; their values encode the jump
    // target relationship directly (matching jumpFromId === jumpToId pairs),
    // so content-equal configurations naturally produce equal fingerprints.
    return JSON.stringify({
      bpm: this.bpm,
      ht: this.halfTime,
      bpm_: this.beatsPerMeasure,
      btStart: minBeat,
      bt: btSlice,
      sub: subs,
      rep: reps,
      ov: ovs,
      blks: blocksData,
      entry: sortedToOrig.get(outerSortedIdx) ?? outerSortedIdx,
    });
  }

  private prepareScheduleInputs(): ScheduleInputs {
    const filteredWithOrigIdx = this.loopBlocks
      .map((b, i) => ({ block: b as LoopBlockData, origIdx: i }))
      .filter(({ block: b }) => b.startBeat < this.beatsPerMeasure && b.endBeat >= b.startBeat)
      .sort((a, b) => a.block.startBeat - b.block.startBeat);
    const sortedBlocks = filteredWithOrigIdx.map(e => e.block);
    const origToSorted = new Map<number, number>();
    const sortedToOrig = new Map<number, number>();
    filteredWithOrigIdx.forEach((e, sortedIdx) => {
      origToSorted.set(e.origIdx, sortedIdx);
      sortedToOrig.set(sortedIdx, e.origIdx);
    });
    const startBeatToBlocks = new Map<number, number[]>();
    sortedBlocks.forEach((blk, idx) => {
      const arr = startBeatToBlocks.get(blk.startBeat);
      if (arr) arr.push(idx);
      else startBeatToBlocks.set(blk.startBeat, [idx]);
    });
    return {
      bpm: this.bpm,
      halfTime: this.halfTime,
      beatsPerMeasure: this.beatsPerMeasure,
      beatTypes: this.beatTypes,
      beatSubdivisions: this.beatSubdivisions,
      barRepeats: this.barRepeats,
      barBpmOverrides: this.barBpmOverrides,
      sortedBlocks,
      origToSorted,
      sortedToOrig,
      startBeatToBlocks,
      loopBlocks: this.loopBlocks as LoopBlockData[],
    };
  }

  private buildSchedule(): ScheduledTick[] {
    this.lastBlockCacheReused = 0;
    this.lastBlockCacheBuilt = 0;

    const inputs = this.prepareScheduleInputs();
    const { sortedBlocks, origToSorted, sortedToOrig, startBeatToBlocks } = inputs;

    const state: EmitState = {
      ticks: [],
      time: 0,
      jump: { iteration: 0, total: 0, sourceBlockIndex: -1 },
    };
    const ticks = state.ticks;
    const durCache = new Map<string, number>();
    const jumpProcessed = new Set<number>();

    const cacheHandle: BlockEmitCacheHandle = {
      cache: this.blockEmitCache,
      cacheMax: MetronomeEngine.BLOCK_CACHE_MAX,
      computeFingerprint: (outerSortedIdx: number) =>
        this.computeOuterBlockFingerprint(outerSortedIdx, sortedBlocks, origToSorted, sortedToOrig),
      onReuse: () => { this.lastBlockCacheReused++; },
      onBuild: () => { this.lastBlockCacheBuilt++; },
    };
    const processOuterCached = (outerIdx: number) =>
      pureProcessOuterCached(inputs, state, durCache, jumpProcessed, cacheHandle, outerIdx);

    if (this.blockPlayMode === "random" && sortedBlocks.length >= 2) {
      const outerBlocks: number[] = [];
      for (let idx = 0; idx < sortedBlocks.length; idx++) {
        const blk = sortedBlocks[idx];
        if (blk.layerOf !== undefined) continue;
        const isNested = sortedBlocks.some((ob, oi) =>
          oi !== idx && ob.layerOf === undefined && ob.startBeat <= blk.startBeat && ob.endBeat >= blk.endBeat
        );
        if (!isNested) outerBlocks.push(idx);
      }
      if (outerBlocks.length >= 2) {
        const randomIdx = outerBlocks[Math.floor(Math.random() * outerBlocks.length)];
        processOuterCached(randomIdx);
      } else {
        processOuterCached(outerBlocks[0] ?? 0);
      }
    } else {
      const processed = new Set<number>();
      let beat = 0;
      while (beat < this.beatsPerMeasure) {
        let outerIdx = -1;
        let outerSpan = -1;
        const candidates = startBeatToBlocks.get(beat);
        if (candidates) {
          for (const idx of candidates) {
            if (!processed.has(idx) && !jumpProcessed.has(idx) && sortedBlocks[idx].layerOf === undefined) {
              const blk = sortedBlocks[idx];
              const isNested = sortedBlocks.some((ob, oi) =>
                oi !== idx && ob.layerOf === undefined && ob.startBeat <= blk.startBeat && ob.endBeat >= blk.endBeat && !processed.has(oi) && !jumpProcessed.has(oi)
              );
              if (!isNested) {
                const span = blk.endBeat - blk.startBeat;
                if (span > outerSpan) {
                  outerSpan = span;
                  outerIdx = idx;
                }
              }
            }
          }
        }
        if (outerIdx >= 0) {
          const block = sortedBlocks[outerIdx];
          const endBeat = Math.min(block.endBeat, this.beatsPerMeasure - 1);
          processOuterCached(outerIdx);
          for (let bi = 0; bi < sortedBlocks.length; bi++) {
            if (sortedBlocks[bi].startBeat >= block.startBeat && sortedBlocks[bi].endBeat <= endBeat) {
              processed.add(bi);
            }
          }
          beat = endBeat + 1;
        } else {
          if (candidates && candidates.some(idx => jumpProcessed.has(idx))) {
            const jumpedBlock = sortedBlocks[candidates.find(idx => jumpProcessed.has(idx))!];
            beat = Math.min(jumpedBlock.endBeat + 1, this.beatsPerMeasure);
          } else {
            pureAddBarWithRepeat(inputs, state, beat, 0, -1, 1);
            const barRepEnd = inputs.barRepeats.get(beat);
            if (barRepEnd?.isEnd) {
              if (state.ticks.length > 0) {
                state.ticks[state.ticks.length - 1] = {
                  ...state.ticks[state.ticks.length - 1],
                  stopAfterThis: true,
                };
              }
              break;
            }
            beat++;
          }
        }
      }
    }

    this.measureDurationMs = state.time;
    ticks.sort((a, b) => a.time - b.time);
    return ticks;
  }

  private isRandomNonDeterministic(): boolean {
    if (this.blockPlayMode !== "random") return false;
    let outerCount = 0;
    for (const blk of this.loopBlocks) {
      if (blk.layerOf !== undefined) continue;
      if (blk.startBeat >= this.beatsPerMeasure || blk.endBeat < blk.startBeat) continue;
      const isNested = this.loopBlocks.some(ob =>
        ob !== blk && ob.layerOf === undefined &&
        ob.startBeat <= blk.startBeat && ob.endBeat >= blk.endBeat
      );
      if (!isNested) {
        outerCount++;
        if (outerCount >= 2) return true;
      }
    }
    return false;
  }

  private computeScheduleCacheKey(): string {
    const subKeys = [...this.beatSubdivisions.keys()].sort((a, b) => a - b);
    const subs: Array<[number, BeatType[]]> = subKeys.map(k => [k, this.beatSubdivisions.get(k)!]);
    const repKeys = [...this.barRepeats.keys()].sort((a, b) => a - b);
    const reps: Array<[number, BarRepeatSpec]> = repKeys.map(k => [k, this.barRepeats.get(k)!]);
    const ovKeys = [...this.barBpmOverrides.keys()].sort((a, b) => a - b);
    const ovs: Array<[number, number]> = ovKeys.map(k => [k, this.barBpmOverrides.get(k)!]);
    return JSON.stringify({
      bpm: this.bpm,
      ht: this.halfTime,
      bpm_: this.beatsPerMeasure,
      bt: this.beatTypes,
      sub: subs,
      rep: reps,
      ov: ovs,
      lb: this.loopBlocks,
      mode: this.blockPlayMode,
    });
  }

  private buildScheduleMemoized(): ScheduledTick[] {
    if (this.isRandomNonDeterministic()) {
      this.lastScheduleCacheHit = false;
      return this.buildSchedule();
    }
    const key = this.computeScheduleCacheKey();
    const cached = this.scheduleCache.get(key);
    if (cached) {
      this.scheduleCache.delete(key);
      this.scheduleCache.set(key, cached);
      this.measureDurationMs = cached.durationMs;
      this.lastScheduleCacheHit = true;
      return cached.ticks;
    }
    const ticks = this.buildSchedule();
    const durationMs = this.measureDurationMs;
    for (const t of ticks) Object.freeze(t);
    Object.freeze(ticks);
    this.scheduleCache.set(key, { ticks, durationMs });
    while (this.scheduleCache.size > MetronomeEngine.SCHEDULE_CACHE_MAX) {
      const firstKey = this.scheduleCache.keys().next().value;
      if (firstKey === undefined) break;
      this.scheduleCache.delete(firstKey);
    }
    this.lastScheduleCacheHit = false;
    return ticks;
  }

  /** @internal 테스트용. 마지막 buildScheduleMemoized 호출이 캐시 적중이었는지 */
  _wasLastBuildCacheHit(): boolean {
    return this.lastScheduleCacheHit;
  }

  /** @internal 테스트용. 현재 캐시 항목 수 */
  _getScheduleCacheSize(): number {
    return this.scheduleCache.size;
  }

  /** @internal 테스트용. 블록 단위 캐시 항목 수 */
  _getBlockCacheSize(): number {
    return this.blockEmitCache.size;
  }

  /** @internal 테스트용. 마지막 buildSchedule에서 블록 캐시 적중으로 재사용된 outer block 수 */
  _getLastBlockCacheReused(): number {
    return this.lastBlockCacheReused;
  }

  /** @internal 테스트용. 마지막 buildSchedule에서 블록 캐시에 새로 저장된 outer block 수 */
  _getLastBlockCacheBuilt(): number {
    return this.lastBlockCacheBuilt;
  }

  private rebuildSchedule() {
    const oldSchedule = this.schedule;
    const oldIndex = this.scheduleIndex;
    const oldMeasureStartTime = this.measureStartTime;
    const oldMeasureDurationMs = this.measureDurationMs;

    this.schedule = this.buildScheduleMemoized();
    this.cachedSchedule = this.schedule;
    this.cachedMeasureDurationMs = this.measureDurationMs;
    this.scheduleDirty = false;

    if (oldSchedule.length > 0 && this.schedule.length > 0) {
      const lastFiredOldIdx = oldIndex - 1;
      if (lastFiredOldIdx >= 0 && lastFiredOldIdx < oldSchedule.length) {
        const lastFiredTick = oldSchedule[lastFiredOldIdx];
        const lastFiredAbsTime = oldMeasureStartTime + lastFiredTick.time;
        let newLastIdx = -1;
        for (let i = 0; i < this.schedule.length; i++) {
          if (this.schedule[i].beat === lastFiredTick.beat && this.schedule[i].subBeat === lastFiredTick.subBeat) {
            newLastIdx = i;
            break;
          }
        }
        if (newLastIdx >= 0) {
          this.measureStartTime = lastFiredAbsTime - this.schedule[newLastIdx].time;
          this.scheduleIndex = newLastIdx + 1;
          if (this.scheduleIndex >= this.schedule.length) {
            this.scheduleIndex = 0;
            this.measureStartTime += this.measureDurationMs;
          }
        } else {
          this.scheduleIndex = Math.min(oldIndex, this.schedule.length - 1);
        }
      } else if (oldIndex === 0) {
        this.scheduleIndex = 0;
      } else {
        this.scheduleIndex = 0;
        this.measureStartTime = oldMeasureStartTime + (oldMeasureDurationMs || this.measureDurationMs);
      }
    }

    // 마디 중간에 schedule이 재구성됐으니 anchor를 현재 measureStartTime/durationMs에
    // 다시 고정한다. 새 길이가 바뀌었어도 이후 마디 진행은 안정적인 절대 기준으로 누적된다.
    this.anchorWallTime = this.measureStartTime;
    this.anchorMeasureCount = this.measureCount;
    this.anchorMeasureDurationMs = this.measureDurationMs;

    if (this.preRenderedAudio) {
      // takeover 핸드셰이크: 외부 콜백이 등록되어 있다면 콜백이 책임지고 player를
      // 정리하고 명시적으로 setPreRenderedAudio(false)를 호출해야 한다. 그 사이에는
      // preRenderedAudio가 true로 유지되어 fireTick의 실시간 발화가 short-circuit된다.
      // (동기 콜백이라 보통은 즉시 false로 떨어지지만, 비동기 정리 중에도 이중 발화가
      //  나지 않도록 자동 false 전환을 제거했다.)
      if (this.onScheduleRebuild) {
        this.onScheduleRebuild();
      } else {
        this.preRenderedAudio = false;
      }
    }
  }

  private playTickAudio(beat: number, subBeat: number, isStrong: boolean, isAccent: boolean, isMute: boolean, layerIndex: number = 0, blockIndex: number = -1, layerSoundSet?: string) {
    if (!isMute) {
      try {
        if (layerIndex > 0 && this.playLayerClick) {
          const role = isStrong ? "strong" : isAccent ? "high" : "low";
          this.playLayerClick(layerIndex, role, layerSoundSet);
        } else if (blockIndex >= 0 && this.loopBlocks[blockIndex]?.soundSet && this.playBlockClick) {
          const role = isStrong ? "strong" : isAccent ? "high" : "low";
          this.playBlockClick(blockIndex, role);
        } else {
          if (isStrong) {
            this.playStrongClick?.();
          } else if (isAccent) {
            this.playHighClick?.();
          } else {
            this.playLowClick?.();
          }
        }
      } catch (e) {}
    }
    if (this.playCustomSample) {
      this.playCustomSample(beat, subBeat);
    }
  }

  private fireTickHaptic(isMute: boolean, isStrong: boolean, isAccent: boolean, isMainBeat: boolean) {
    if (!isMute && Platform.OS !== "web" && this.hapticMode !== "off") {
      const shouldHaptic = this.hapticMode === "all" || (this.hapticMode === "accent" && isAccent);
      if (shouldHaptic) {
        try {
          Haptics.impactAsync(
            isStrong || isAccent
              ? Haptics.ImpactFeedbackStyle.Heavy
              : isMainBeat
              ? Haptics.ImpactFeedbackStyle.Light
              : Haptics.ImpactFeedbackStyle.Soft
          );
        } catch (e) {}
      }
    }
  }

  private fireTick(tick: ScheduledTick) {
    const isLayerTick = tick.layerIndex > 0;

    if (!isLayerTick) {
      this.currentBeat = tick.beat;
      this.currentSubBeat = tick.subBeat;
    }

    const isStrong = tick.type === "strong";
    const isAccent = tick.type === "accent" || isStrong;
    const isMute = tick.type === "mute";

    if (!isLayerTick) {
      this.onSubBeat?.(tick.beat, tick.subBeat);
      if (tick.isMainBeat) {
        this.onBeat?.(tick.beat, isAccent);
      }
    }

    if (tick.isMainBeat && this.onProgress) {
      if (isLayerTick) {
        this.onProgress({
          beat: this.currentBeat,
          barRepeatCurrent: tick.barRepeatIteration,
          barRepeatTotal: tick.barRepeatTotal,
          blockIndex: tick.blockIndex,
          blockRepeatCurrent: tick.repeatIteration,
          blockRepeatTotal: tick.blockRepeatTotal,
          jumpCurrent: tick.jumpIteration,
          jumpTotal: tick.jumpTotal,
          jumpSourceBlockIndex: tick.jumpSourceBlockIndex >= 0 ? tick.jumpSourceBlockIndex : undefined,
          layerIndex: tick.layerIndex,
          layerBeat: tick.layerBeat,
        });
      } else {
        this.onProgress({
          beat: tick.beat,
          barRepeatCurrent: tick.barRepeatIteration,
          barRepeatTotal: tick.barRepeatTotal,
          blockIndex: tick.blockIndex,
          blockRepeatCurrent: tick.repeatIteration,
          blockRepeatTotal: tick.blockRepeatTotal,
          jumpCurrent: tick.jumpIteration,
          jumpTotal: tick.jumpTotal,
          jumpSourceBlockIndex: tick.jumpSourceBlockIndex >= 0 ? tick.jumpSourceBlockIndex : undefined,
        });
      }
    }

    const offset = this.audioOffsetMs;

    // 가청 클릭 발화 통지 — mute가 아닌 모든 경로(일반/레이어/블록/프리렌더)에 대해
    // 동기적으로 한 번씩 호출된다. audioOffsetMs는 시각/햅틱 타이밍 보정용이므로 무시한다.
    if (!isMute && this.onClickEmitted) {
      try { this.onClickEmitted(Date.now()); } catch {}
    }

    if (this.preRenderedAudio) {
      if (this.playCustomSample) {
        this.playCustomSample(tick.beat, tick.subBeat);
      }
      this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat);
    } else if (offset > 0) {
      this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat);
      const li = tick.layerIndex;
      const bi = tick.blockIndex;
      const lss = tick.layerSoundSet;
      this.scheduleOffsetCallback(
        () => this.playTickAudio(tick.beat, tick.subBeat, isStrong, isAccent, isMute, li, bi, lss),
        offset,
      );
    } else if (offset < 0) {
      this.playTickAudio(tick.beat, tick.subBeat, isStrong, isAccent, isMute, tick.layerIndex, tick.blockIndex, tick.layerSoundSet);
      this.scheduleOffsetCallback(
        () => this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat),
        Math.abs(offset),
      );
    } else {
      this.playTickAudio(tick.beat, tick.subBeat, isStrong, isAccent, isMute, tick.layerIndex, tick.blockIndex, tick.layerSoundSet);
      this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat);
    }
  }

  private scheduleOffsetCallback(fn: () => void, delay: number) {
    let id: ReturnType<typeof setTimeout>;
    id = setTimeout(() => {
      this.pendingOffsetTimers.delete(id);
      if (!this.isRunning) return;
      fn();
    }, delay);
    this.pendingOffsetTimers.add(id);
  }

  private clearPendingOffsetTimers() {
    for (const id of this.pendingOffsetTimers) {
      clearTimeout(id);
    }
    this.pendingOffsetTimers.clear();
  }

  private rolloverToNextMeasure() {
    this.onMeasureComplete?.();
    this.measureCount += 1;
    this.measureStartTime =
      this.anchorWallTime +
      (this.measureCount - this.anchorMeasureCount) * this.anchorMeasureDurationMs;
    if (this.scheduleDirty || !this.cachedSchedule || this.blockPlayMode === "random") {
      this.schedule = this.buildScheduleMemoized();
      if (this.blockPlayMode !== "random") {
        this.cachedSchedule = this.schedule;
        this.cachedMeasureDurationMs = this.measureDurationMs;
      }
      this.scheduleDirty = false;
    } else {
      this.schedule = this.cachedSchedule;
      this.measureDurationMs = this.cachedMeasureDurationMs;
    }
    // 마디 길이가 바뀌면 anchor를 새 길이의 시작점으로 다시 고정한다.
    if (this.measureDurationMs !== this.anchorMeasureDurationMs) {
      this.anchorWallTime = this.measureStartTime;
      this.anchorMeasureCount = this.measureCount;
      this.anchorMeasureDurationMs = this.measureDurationMs;
    }
    this.scheduleIndex = 0;
  }

  private getElapsed(): number {
    return performance.now() - this.measureStartTime;
  }

  getMeasureElapsedMs(): number {
    if (!this.isRunning) return 0;
    return performance.now() - this.measureStartTime;
  }

  getMeasureDurationMs(): number {
    return this.measureDurationMs;
  }

  private loop = () => {
    if (!this.isRunning) return;

    if (this.pendingMeasureStartAction && this.scheduleIndex === 0) {
      const action = this.pendingMeasureStartAction;
      this.pendingMeasureStartAction = null;
      action();
    }

    const now = performance.now();
    const elapsed = now - this.measureStartTime;

    while (this.isRunning && this.scheduleIndex < this.schedule.length) {
      const tick = this.schedule[this.scheduleIndex];
      if (tick.time > elapsed + 1) break;

      this.fireTick(tick);
      this.scheduleIndex++;

      // isEnd 심볼 — volta 소진 후 전체 정지
      if (tick.stopAfterThis && this.isRunning) {
        this.stop();
        this.onMeasureComplete?.();
        return;
      }

      if (this.scheduleIndex >= this.schedule.length) {
        if (this.stopAfterMeasure || (this.blockPlayMode === "sequential" && this.loopBlocks.length > 0)) {
          this.stopAfterMeasure = false;
          this.stop();
          this.onMeasureComplete?.();
          return;
        }
        this.rolloverToNextMeasure();
        break;
      }
    }

    if (this.isRunning) {
      this.scheduleNext();
    }
  };

  private scheduleNext() {
    const nextTick = this.schedule[this.scheduleIndex];
    if (!nextTick) return;
    const nextAbsolute = this.measureStartTime + nextTick.time;
    const wait = nextAbsolute - performance.now();

    if (wait > 100) {
      this.timerId = setTimeout(this.loop, wait - 80);
    } else if (wait > 25) {
      this.timerId = setTimeout(this.loop, wait - 16);
    } else if (wait > 4) {
      this.timerId = setTimeout(this.loop, 1);
    } else {
      this.scheduleRAF();
    }
  }

  private rafLoop = () => {
    this.rafId = null;
    if (!this.isRunning) return;
    this.loop();
  };

  private scheduleRAF() {
    if (this.rafId !== null) return;
    if (typeof requestAnimationFrame !== "undefined") {
      this.rafId = requestAnimationFrame(this.rafLoop);
    } else {
      this.timerId = setTimeout(this.loop, 0);
    }
  }

  private cancelRAF() {
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
  }

  start(arg?: number | { startFromBeat?: number; startAtPerformanceTime?: number }) {
    if (this.isRunning) return;
    let startFromBeat: number | undefined;
    let startAtPerformanceTime: number | undefined;
    if (typeof arg === "number") {
      startFromBeat = arg;
    } else if (arg && typeof arg === "object") {
      startFromBeat = arg.startFromBeat;
      startAtPerformanceTime = arg.startAtPerformanceTime;
    }

    if (
      typeof startAtPerformanceTime === "number" &&
      Number.isFinite(startAtPerformanceTime)
    ) {
      const now =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      const delay = startAtPerformanceTime - now;
      if (delay > 0) {
        if (this.timerId) {
          clearTimeout(this.timerId);
          this.timerId = null;
        }
        this.timerId = setTimeout(() => {
          this.timerId = null;
          this.start({ startFromBeat });
        }, delay);
        return;
      }
    }

    if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
    this.cancelRAF();
    this.isRunning = true;
    if (this.schedule.length === 0 || this.scheduleDirty) {
      this.buildScheduleOnly();
    }

    if (startFromBeat !== undefined && startFromBeat > 0 && startFromBeat < this.beatsPerMeasure) {
      const idx = this.schedule.findIndex(t => t.beat === startFromBeat && t.subBeat === 0);
      if (idx >= 0) {
        this.scheduleIndex = idx;
        this.currentBeat = startFromBeat;
        this.currentSubBeat = 0;
        const timeOffset = this.schedule[idx].time;
        this.measureStartTime = performance.now() - timeOffset;
      } else {
        this.scheduleIndex = 0;
        this.currentBeat = 0;
        this.currentSubBeat = 0;
        this.measureStartTime = performance.now();
      }
    } else {
      this.currentBeat = 0;
      this.currentSubBeat = 0;
      this.scheduleIndex = 0;
      this.measureStartTime = performance.now();
    }
    // 절대 기준선 anchor 초기화. 이후 매 마디 시작 시각은
    // anchorWallTime + (measureCount - anchorMeasureCount) * anchorMeasureDurationMs
    // 로 재계산되어 누적 부동소수점 drift가 발생하지 않는다.
    this.measureCount = 0;
    this.anchorWallTime = this.measureStartTime;
    this.anchorMeasureCount = 0;
    this.anchorMeasureDurationMs = this.measureDurationMs;
    this.loop();
  }

  stop() {
    this.isRunning = false;
    this.stopAfterMeasure = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.cancelRAF();
    this.clearPendingOffsetTimers();
    this.pendingMeasureStartAction = null;
    this.currentBeat = 0;
    this.currentSubBeat = 0;
    this.schedule = [];
    this.scheduleIndex = 0;
  }

  resyncTiming() {
    if (!this.isRunning || this.schedule.length === 0) return;
    const currentTickTime =
      this.scheduleIndex < this.schedule.length
        ? this.schedule[this.scheduleIndex].time
        : 0;
    this.measureStartTime = performance.now() - currentTickTime;
    // resync 후에는 anchor를 현재 마디 시작 시각으로 다시 고정한다.
    this.anchorWallTime = this.measureStartTime;
    this.anchorMeasureCount = this.measureCount;
    this.anchorMeasureDurationMs = this.measureDurationMs;
  }

  cleanup() {
    this.stop();
  }
}

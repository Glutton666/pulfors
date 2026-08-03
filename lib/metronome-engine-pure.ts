// ============================================================
// metronome-engine-pure.ts
// 순수 스케줄링 계산 함수와 관련 타입만 포함.
// 외부 런타임 의존성(Haptics, Platform, asset require) 없음.
// ============================================================

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

/** 외부에서 주입되는 블록 emit 캐시 핸들. */
export interface BlockEmitCacheHandle {
  cache: Map<string, { ticks: ScheduledTick[]; durMs: number }>;
  cacheMax: number;
  computeFingerprint: (outerSortedIdx: number) => string | null;
  onReuse: () => void;
  onBuild: () => void;
}

/**
 * 순수 함수: 사용자 표시용 BPM을 엔진 내부 quarter-note BPM으로 변환.
 *
 * 메인 BPM 경로(`updateBpm`의 `clampedBpm * (4 / beatDenominator)`)와 동일한
 * 정규화를 적용한다. 바 BPM 오버라이드를 `setBarBpmOverride` / `setAllBarBpmOverrides`
 * 에 넘기기 전에 반드시 이 함수로 변환해야 한다.
 *
 * @param displayBpm 사용자가 UI에서 보고 입력한 BPM 값
 * @param denominator 현재 박자 분모 (2 | 4 | 8)
 */
export function toEngineBpm(displayBpm: number, denominator: 2 | 4 | 8): number {
  return displayBpm * (4 / denominator);
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

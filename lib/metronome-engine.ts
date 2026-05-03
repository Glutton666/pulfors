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
};

export const highClickSource = soundSets.classic.high;
export const lowClickSource = soundSets.classic.low;
export const strongClickSource = soundSets.classic.strong;

interface ScheduledTick {
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
  private barRepeats: Map<number, { type: "count" | "duration"; value: number }> = new Map();
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

  setAudioCallbacks(playHigh: () => void, playLow: () => void, playStrong?: () => void) {
    this.playHighClick = playHigh;
    this.playLowClick = playLow;
    this.playStrongClick = playStrong || null;
  }

  private playLayerClick: ((layerIndex: number, role: "high" | "low" | "strong") => void) | null = null;
  private playBlockClick: ((blockIndex: number, role: "high" | "low" | "strong") => void) | null = null;

  setLayerAudioCallback(cb: (layerIndex: number, role: "high" | "low" | "strong") => void) {
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

  getAllBarRepeats(): Record<number, { type: "count" | "duration"; value: number }> {
    const result: Record<number, { type: "count" | "duration"; value: number }> = {};
    for (const [k, v] of this.barRepeats.entries()) {
      result[k] = { ...v };
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

  setBarRepeat(beat: number, repeat: { type: "count" | "duration"; value: number } | null) {
    if (repeat) {
      this.barRepeats.set(beat, { ...repeat });
    } else {
      this.barRepeats.delete(beat);
    }
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  setAllBarRepeats(repeats: Record<number, { type: "count" | "duration"; value: number }>) {
    this.barRepeats.clear();
    for (const [key, value] of Object.entries(repeats)) {
      this.barRepeats.set(Number(key), { ...value });
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
    this.schedule = this.buildSchedule();
    this.cachedSchedule = this.schedule;
    this.cachedMeasureDurationMs = this.measureDurationMs;
    this.scheduleDirty = false;
    this.scheduleIndex = 0;
  }

  getScheduleInfo(): { ticks: { time: number; type: BeatType; beat: number; subBeat: number; repeatIteration: number; barRepeatIteration: number }[]; durationMs: number } {
    if (this.schedule.length === 0 || this.scheduleDirty) {
      this.buildScheduleOnly();
    }
    return {
      ticks: this.schedule.map(t => ({ time: t.time, type: t.type, beat: t.beat, subBeat: t.subBeat, repeatIteration: t.repeatIteration, barRepeatIteration: t.barRepeatIteration })),
      durationMs: this.measureDurationMs,
    };
  }

  getIsRunning() {
    return this.isRunning;
  }

  private getSubPattern(beat: number): BeatType[] {
    const beatType = this.beatTypes[beat] || "normal";
    const custom = this.beatSubdivisions.get(beat);

    if (!custom || custom.length === 0) {
      return [beatType];
    }

    if (beatType === "mute") {
      return custom.map(() => "mute" as BeatType);
    }

    if (beatType === "strong") {
      const result = [...custom];
      if (result[0] === "normal" || result[0] === "accent") {
        result[0] = "strong";
      }
      return result;
    }

    if (beatType === "accent") {
      const result = [...custom];
      if (result[0] === "normal") {
        result[0] = "accent";
      }
      return result;
    }

    return custom;
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

  private getBeatDur(beat: number, blockBpm?: number): number {
    const bpm = this.barBpmOverrides.get(beat) ?? blockBpm ?? this.bpm;
    const effectiveBpm = this.halfTime ? bpm / 2 : bpm;
    return 60000 / effectiveBpm;
  }

  private buildSchedule(): ScheduledTick[] {
    const ticks: ScheduledTick[] = [];
    let time = 0;

    const filteredWithOrigIdx = this.loopBlocks
      .map((b, i) => ({ block: b, origIdx: i }))
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

    const durCache = new Map<string, number>();

    let currentJumpIteration = 0;
    let currentJumpTotal = 0;
    let currentJumpSourceBlockIndex = -1;

    const addBeatTicks = (beat: number, iteration: number, barRepIter: number, barRepTotal: number, blkIdx: number, blkRepTotal: number, blockBpm?: number) => {
      const subPattern = this.getSubPattern(beat);
      const beatDur = this.getBeatDur(beat, blockBpm);
      const subDur = beatDur / subPattern.length;
      for (let sub = 0; sub < subPattern.length; sub++) {
        ticks.push({
          time,
          beat,
          subBeat: sub,
          type: subPattern[sub],
          isMainBeat: sub === 0,
          repeatIteration: iteration,
          barRepeatIteration: barRepIter,
          barRepeatTotal: barRepTotal,
          blockIndex: blkIdx,
          blockRepeatTotal: blkRepTotal,
          jumpIteration: currentJumpIteration,
          jumpTotal: currentJumpTotal,
          jumpSourceBlockIndex: currentJumpSourceBlockIndex,
          layerIndex: 0,
          layerBeat: beat,
        });
        time += subDur;
      }
    };

    const addBarWithRepeat = (beat: number, blockIteration: number, blkIdx: number, blkRepTotal: number, blockBpm?: number) => {
      const barRep = this.barRepeats.get(beat);
      const beatDur = this.getBeatDur(beat, blockBpm);
      if (barRep) {
        let barRepeatCount = 1;
        if (barRep.type === "count") {
          barRepeatCount = Math.max(1, barRep.value);
        } else {
          barRepeatCount = Math.max(1, Math.round((barRep.value * 1000) / beatDur));
        }
        for (let r = 0; r < barRepeatCount; r++) {
          addBeatTicks(beat, blockIteration, r, barRepeatCount, blkIdx, blkRepTotal, blockBpm);
        }
      } else {
        addBeatTicks(beat, blockIteration, 0, 1, blkIdx, blkRepTotal, blockBpm);
      }
    };

    const findInnerBlock = (startB: number, endB: number, parentBlockIdx: number): number => {
      const candidates = startBeatToBlocks.get(startB);
      if (!candidates) return -1;
      for (const iIdx of candidates) {
        if (iIdx !== parentBlockIdx) {
          const ib = sortedBlocks[iIdx];
          if (ib.layerOf !== undefined) continue;
          if (ib.startBeat >= startB && ib.endBeat <= endB) return iIdx;
        }
      }
      return -1;
    };

    const calcSinglePassDur = (startB: number, endB: number, parentBlockIdx: number, blockBpm?: number): number => {
      const cacheKey = `${startB}:${endB}:${parentBlockIdx}:${blockBpm ?? ""}`;
      const cached = durCache.get(cacheKey);
      if (cached !== undefined) return cached;

      let dur = 0;
      let b = startB;
      while (b <= endB) {
        const innerIdx = findInnerBlock(b, endB, parentBlockIdx);
        if (innerIdx >= 0) {
          const inner = sortedBlocks[innerIdx];
          const innerEnd = Math.min(inner.endBeat, endB);
          const innerBpm = inner.bpm ?? blockBpm;
          const innerPassDur = calcSinglePassDur(inner.startBeat, innerEnd, innerIdx, innerBpm);
          let innerRepCount = 1;
          if (inner.type === "count") innerRepCount = Math.max(1, inner.value);
          else innerRepCount = Math.max(1, Math.round((inner.value * 1000) / (innerPassDur || 1)));
          dur += innerPassDur * innerRepCount;
          b = innerEnd + 1;
        } else {
          const bd = this.getBeatDur(b, blockBpm);
          const barRep = this.barRepeats.get(b);
          const barRepCount = barRep ? (barRep.type === "count" ? Math.max(1, barRep.value) : Math.max(1, Math.round((barRep.value * 1000) / bd))) : 1;
          dur += bd * barRepCount;
          b++;
        }
      }
      durCache.set(cacheKey, dur);
      return dur;
    };

    const emitBeatsInRange = (startB: number, endB: number, outerBlockIdx: number, outerIter: number, outerRepTotal: number, blockBpm?: number) => {
      let b = startB;
      while (b <= endB) {
        const innerIdx = findInnerBlock(b, endB, outerBlockIdx);
        if (innerIdx >= 0) {
          const inner = sortedBlocks[innerIdx];
          const innerEnd = Math.min(inner.endBeat, endB);
          const innerBpm = inner.bpm ?? blockBpm;
          const innerPassDur = calcSinglePassDur(inner.startBeat, innerEnd, innerIdx, innerBpm);
          let innerRepCount = 1;
          if (inner.type === "count") innerRepCount = Math.max(1, inner.value);
          else innerRepCount = Math.max(1, Math.round((inner.value * 1000) / (innerPassDur || 1)));
          for (let ir = 0; ir < innerRepCount; ir++) {
            const innerStartTime = time;
            emitBeatsInRange(inner.startBeat, innerEnd, innerIdx, ir, innerRepCount, innerBpm);
            const innerOrigIdx = sortedToOrig.get(innerIdx) ?? innerIdx;
            const innerDur = time - innerStartTime;
            if (innerDur > 0) {
              emitStackedBlockTicks(innerIdx, innerOrigIdx, innerStartTime, innerDur, ir, innerRepCount);
            }
          }
          b = innerEnd + 1;
        } else {
          addBarWithRepeat(b, outerIter, outerBlockIdx, outerRepTotal, blockBpm);
          b++;
        }
      }
    };

    const jumpProcessed = new Set<number>();

    const emitStackedBlockTicks = (parentBlockIdx: number, parentOrigIdx: number, blockStartTime: number, blockDurMs: number, repIteration: number, repTotal: number) => {
      const stackedBlocks: { block: typeof sortedBlocks[0]; origIdx: number; layerNum: number }[] = [];
      let layerNum = 1;
      for (let oi = 0; oi < this.loopBlocks.length; oi++) {
        if (this.loopBlocks[oi].layerOf === parentOrigIdx) {
          const si = origToSorted.get(oi);
          if (si !== undefined) {
            stackedBlocks.push({ block: sortedBlocks[si], origIdx: oi, layerNum: layerNum++ });
          }
        }
      }
      if (stackedBlocks.length === 0) return;

      for (const { block: stackBlock, origIdx: stackOrigIdx, layerNum: ln } of stackedBlocks) {
        const stackBeats = Math.max(1, stackBlock.endBeat - stackBlock.startBeat + 1);
        const stackBpm = stackBlock.bpm;
        const stackBeatDur = stackBpm
          ? 60000 / (this.halfTime ? stackBpm / 2 : stackBpm)
          : blockDurMs / stackBeats;

        for (let lb = 0; lb < stackBeats; lb++) {
          const beatStartTime = blockStartTime + lb * stackBeatDur;
          if (beatStartTime >= blockStartTime + blockDurMs) break;
          const lbBeat = stackBlock.startBeat + lb;
          const rawBlock = this.loopBlocks[stackOrigIdx];
          let subPat: BeatType[];
          if (rawBlock?.ownSubdivisions) {
            const ownSub = rawBlock.ownSubdivisions[String(lbBeat)];
            if (ownSub) {
              subPat = ownSub as BeatType[];
            } else {
              const ownType = rawBlock.ownBeatTypes?.[lbBeat] as BeatType || "normal";
              subPat = [ownType];
            }
          } else if (rawBlock?.ownBeatTypes) {
            const ownType = rawBlock.ownBeatTypes[lbBeat] as BeatType || "normal";
            subPat = this.getSubPattern(lbBeat);
            if (subPat.length === 1) subPat = [ownType];
            else subPat = subPat.map((s, si) => si === 0 ? ownType : s);
          } else {
            subPat = this.getSubPattern(lbBeat);
          }
          const subDur = stackBeatDur / subPat.length;
          for (let sub = 0; sub < subPat.length; sub++) {
            const tickTime = beatStartTime + sub * subDur;
            if (tickTime >= blockStartTime + blockDurMs) break;
            ticks.push({
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
              jumpIteration: currentJumpIteration,
              jumpTotal: currentJumpTotal,
              jumpSourceBlockIndex: currentJumpSourceBlockIndex,
              layerIndex: ln,
              layerBeat: lb,
            });
          }
        }
      }
    };

    const emitBlock = (blockIdx: number, jumpVisited: Set<number>) => {
      if (jumpVisited.has(blockIdx) || blockIdx < 0 || blockIdx >= sortedBlocks.length) return;
      jumpVisited.add(blockIdx);
      const block = sortedBlocks[blockIdx];
      const origIdx = sortedToOrig.get(blockIdx) ?? blockIdx;
      if (block.layerOf !== undefined && block.layerOf !== null) return;
      const endBeat = Math.min(block.endBeat, this.beatsPerMeasure - 1);

      const blockBpm = block.bpm;
      const singlePassDurMs = calcSinglePassDur(block.startBeat, endBeat, blockIdx, blockBpm);

      let blockRepeatCount = 1;
      if (block.type === "count") {
        blockRepeatCount = Math.max(1, block.value);
      } else {
        blockRepeatCount = Math.max(1, Math.round((block.value * 1000) / (singlePassDurMs || 1)));
      }

      for (let r = 0; r < blockRepeatCount; r++) {
        const passStartTime = time;
        emitBeatsInRange(block.startBeat, endBeat, blockIdx, r, blockRepeatCount, blockBpm);
        const passEndTime = time;
        const passDur = passEndTime - passStartTime;
        if (passDur > 0) {
          emitStackedBlockTicks(blockIdx, origIdx, passStartTime, passDur, r, blockRepeatCount);
        }
      }
    };

    const processBlock = (blockIdx: number, jumpVisited: Set<number>) => {
      if (blockIdx < 0 || blockIdx >= sortedBlocks.length) return;
      const block = sortedBlocks[blockIdx];

      if (block.jumpToBlock !== undefined && block.jumpToBlock !== null) {
        const jumpSortedIdx = origToSorted.get(block.jumpToBlock);
        if (jumpSortedIdx !== undefined) {
          const jumpCount = Math.max(1, block.jumpCount || 1);
          const prevJumpTotal = currentJumpTotal;
          const prevJumpIteration = currentJumpIteration;
          const prevJumpSource = currentJumpSourceBlockIndex;
          currentJumpTotal = jumpCount;
          currentJumpSourceBlockIndex = sortedToOrig.get(blockIdx) ?? blockIdx;

          for (let ji = 0; ji < jumpCount; ji++) {
            currentJumpIteration = ji;
            emitBlock(blockIdx, new Set(jumpVisited));
            const jumpVisitedCopy = new Set(jumpVisited);
            emitBlock(jumpSortedIdx, jumpVisitedCopy);
          }

          currentJumpIteration = prevJumpIteration;
          currentJumpTotal = prevJumpTotal;
          currentJumpSourceBlockIndex = prevJumpSource;

          jumpProcessed.add(jumpSortedIdx);
          return;
        }
      }

      emitBlock(blockIdx, jumpVisited);
    };

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
        processBlock(randomIdx, new Set());
      } else {
        processBlock(outerBlocks[0] ?? 0, new Set());
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
          processBlock(outerIdx, new Set());
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
            addBarWithRepeat(beat, 0, -1, 1);
            beat++;
          }
        }
      }
    }

    this.measureDurationMs = time;
    ticks.sort((a, b) => a.time - b.time);
    return ticks;
  }

  private rebuildSchedule() {
    const oldSchedule = this.schedule;
    const oldIndex = this.scheduleIndex;
    const oldMeasureStartTime = this.measureStartTime;
    const oldMeasureDurationMs = this.measureDurationMs;

    this.schedule = this.buildSchedule();
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

    if (this.preRenderedAudio) {
      this.preRenderedAudio = false;
      this.onScheduleRebuild?.();
    }
  }

  private playTickAudio(beat: number, subBeat: number, isStrong: boolean, isAccent: boolean, isMute: boolean, layerIndex: number = 0, blockIndex: number = -1) {
    if (!isMute) {
      try {
        if (layerIndex > 0 && this.playLayerClick) {
          const role = isStrong ? "strong" : isAccent ? "high" : "low";
          this.playLayerClick(layerIndex, role);
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

    if (this.preRenderedAudio) {
      if (this.playCustomSample) {
        this.playCustomSample(tick.beat, tick.subBeat);
      }
      this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat);
    } else if (offset > 0) {
      this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat);
      const li = tick.layerIndex;
      const bi = tick.blockIndex;
      setTimeout(() => this.playTickAudio(tick.beat, tick.subBeat, isStrong, isAccent, isMute, li, bi), offset);
    } else if (offset < 0) {
      this.playTickAudio(tick.beat, tick.subBeat, isStrong, isAccent, isMute, tick.layerIndex, tick.blockIndex);
      setTimeout(() => this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat), Math.abs(offset));
    } else {
      this.playTickAudio(tick.beat, tick.subBeat, isStrong, isAccent, isMute, tick.layerIndex, tick.blockIndex);
      this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat);
    }
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

      if (this.scheduleIndex >= this.schedule.length) {
        if (this.stopAfterMeasure || (this.blockPlayMode === "sequential" && this.loopBlocks.length > 0)) {
          this.stopAfterMeasure = false;
          this.stop();
          this.onMeasureComplete?.();
          return;
        }
        this.onMeasureComplete?.();
        this.measureStartTime += this.measureDurationMs;
        if (this.scheduleDirty || !this.cachedSchedule || this.blockPlayMode === "random") {
          this.schedule = this.buildSchedule();
          if (this.blockPlayMode !== "random") {
            this.cachedSchedule = this.schedule;
            this.cachedMeasureDurationMs = this.measureDurationMs;
          }
          this.scheduleDirty = false;
        } else {
          this.schedule = this.cachedSchedule;
          this.measureDurationMs = this.cachedMeasureDurationMs;
        }
        this.scheduleIndex = 0;
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
  }

  cleanup() {
    this.stop();
  }
}

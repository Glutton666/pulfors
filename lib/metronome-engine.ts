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
}

export class MetronomeEngine {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private isRunning = false;
  private bpm = 120;
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
  private loopBlocks: { startBeat: number; endBeat: number; type: "count" | "duration"; value: number; jumpToBlock?: number; jumpCount?: number }[] = [];
  private blockPlayMode: "sequential" | "random" = "sequential";
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

  setLoopBlocks(blocks: { startBeat: number; endBeat: number; type: "count" | "duration"; value: number; jumpToBlock?: number; jumpCount?: number }[]) {
    this.loopBlocks = blocks.map(b => ({ ...b }));
    this.invalidateScheduleCache();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  setBlockPlayMode(mode: "sequential" | "random") {
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

  private getBeatDur(beat: number): number {
    const bpm = this.barBpmOverrides.get(beat) ?? this.bpm;
    return 60000 / bpm;
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

    const addBeatTicks = (beat: number, iteration: number, barRepIter: number, barRepTotal: number, blkIdx: number, blkRepTotal: number) => {
      const subPattern = this.getSubPattern(beat);
      const beatDur = this.getBeatDur(beat);
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
        });
        time += subDur;
      }
    };

    const addBarWithRepeat = (beat: number, blockIteration: number, blkIdx: number, blkRepTotal: number) => {
      const barRep = this.barRepeats.get(beat);
      const beatDur = this.getBeatDur(beat);
      if (barRep) {
        let barRepeatCount = 1;
        if (barRep.type === "count") {
          barRepeatCount = Math.max(1, barRep.value);
        } else {
          barRepeatCount = Math.max(1, Math.round((barRep.value * 1000) / beatDur));
        }
        for (let r = 0; r < barRepeatCount; r++) {
          addBeatTicks(beat, blockIteration, r, barRepeatCount, blkIdx, blkRepTotal);
        }
      } else {
        addBeatTicks(beat, blockIteration, 0, 1, blkIdx, blkRepTotal);
      }
    };

    const findInnerBlock = (startB: number, endB: number, parentBlockIdx: number): number => {
      const candidates = startBeatToBlocks.get(startB);
      if (!candidates) return -1;
      for (const iIdx of candidates) {
        if (iIdx !== parentBlockIdx) {
          const ib = sortedBlocks[iIdx];
          if (ib.startBeat >= startB && ib.endBeat <= endB) return iIdx;
        }
      }
      return -1;
    };

    const calcSinglePassDur = (startB: number, endB: number, parentBlockIdx: number): number => {
      const cacheKey = `${startB}:${endB}:${parentBlockIdx}`;
      const cached = durCache.get(cacheKey);
      if (cached !== undefined) return cached;

      let dur = 0;
      let b = startB;
      while (b <= endB) {
        const innerIdx = findInnerBlock(b, endB, parentBlockIdx);
        if (innerIdx >= 0) {
          const inner = sortedBlocks[innerIdx];
          const innerEnd = Math.min(inner.endBeat, endB);
          const innerPassDur = calcSinglePassDur(inner.startBeat, innerEnd, innerIdx);
          let innerRepCount = 1;
          if (inner.type === "count") innerRepCount = Math.max(1, inner.value);
          else innerRepCount = Math.max(1, Math.round((inner.value * 1000) / (innerPassDur || 1)));
          dur += innerPassDur * innerRepCount;
          b = innerEnd + 1;
        } else {
          const bd = this.getBeatDur(b);
          const barRep = this.barRepeats.get(b);
          const barRepCount = barRep ? (barRep.type === "count" ? Math.max(1, barRep.value) : Math.max(1, Math.round((barRep.value * 1000) / bd))) : 1;
          dur += bd * barRepCount;
          b++;
        }
      }
      durCache.set(cacheKey, dur);
      return dur;
    };

    const emitBeatsInRange = (startB: number, endB: number, outerBlockIdx: number, outerIter: number, outerRepTotal: number) => {
      let b = startB;
      while (b <= endB) {
        const innerIdx = findInnerBlock(b, endB, outerBlockIdx);
        if (innerIdx >= 0) {
          const inner = sortedBlocks[innerIdx];
          const innerEnd = Math.min(inner.endBeat, endB);
          const innerPassDur = calcSinglePassDur(inner.startBeat, innerEnd, innerIdx);
          let innerRepCount = 1;
          if (inner.type === "count") innerRepCount = Math.max(1, inner.value);
          else innerRepCount = Math.max(1, Math.round((inner.value * 1000) / (innerPassDur || 1)));
          for (let ir = 0; ir < innerRepCount; ir++) {
            emitBeatsInRange(inner.startBeat, innerEnd, innerIdx, ir, innerRepCount);
          }
          b = innerEnd + 1;
        } else {
          addBarWithRepeat(b, outerIter, outerBlockIdx, outerRepTotal);
          b++;
        }
      }
    };

    const processBlock = (blockIdx: number, jumpVisited: Set<number>) => {
      if (jumpVisited.has(blockIdx) || blockIdx < 0 || blockIdx >= sortedBlocks.length) return;
      jumpVisited.add(blockIdx);
      const block = sortedBlocks[blockIdx];
      const endBeat = Math.min(block.endBeat, this.beatsPerMeasure - 1);

      const singlePassDurMs = calcSinglePassDur(block.startBeat, endBeat, blockIdx);

      let blockRepeatCount = 1;
      if (block.type === "count") {
        blockRepeatCount = Math.max(1, block.value);
      } else {
        blockRepeatCount = Math.max(1, Math.round((block.value * 1000) / (singlePassDurMs || 1)));
      }

      for (let r = 0; r < blockRepeatCount; r++) {
        emitBeatsInRange(block.startBeat, endBeat, blockIdx, r, blockRepeatCount);
      }

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
            const jumpVisitedCopy = new Set(jumpVisited);
            processBlock(jumpSortedIdx, jumpVisitedCopy);
          }
          currentJumpIteration = prevJumpIteration;
          currentJumpTotal = prevJumpTotal;
          currentJumpSourceBlockIndex = prevJumpSource;
        }
      }
    };

    if (this.blockPlayMode === "random" && sortedBlocks.length >= 2) {
      const outerBlocks: number[] = [];
      for (let idx = 0; idx < sortedBlocks.length; idx++) {
        const blk = sortedBlocks[idx];
        const isNested = sortedBlocks.some((ob, oi) =>
          oi !== idx && ob.startBeat <= blk.startBeat && ob.endBeat >= blk.endBeat
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
            if (!processed.has(idx)) {
              const blk = sortedBlocks[idx];
              const isNested = sortedBlocks.some((ob, oi) =>
                oi !== idx && ob.startBeat <= blk.startBeat && ob.endBeat >= blk.endBeat && !processed.has(oi)
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
          addBarWithRepeat(beat, 0, -1, 1);
          beat++;
        }
      }
    }

    this.measureDurationMs = time;
    return ticks;
  }

  private rebuildSchedule() {
    const oldSchedule = this.schedule;
    const oldIndex = this.scheduleIndex;

    this.schedule = this.buildSchedule();
    this.cachedSchedule = this.schedule;
    this.cachedMeasureDurationMs = this.measureDurationMs;
    this.scheduleDirty = false;

    if (oldSchedule.length > 0 && oldIndex < oldSchedule.length) {
      const currentTick = oldSchedule[oldIndex];
      let bestIdx = 0;
      for (let i = 0; i < this.schedule.length; i++) {
        if (this.schedule[i].beat === currentTick.beat && this.schedule[i].subBeat === currentTick.subBeat) {
          bestIdx = i;
          break;
        }
      }
      const elapsed = performance.now() - this.measureStartTime;
      this.measureStartTime = performance.now() - this.schedule[bestIdx].time;
      this.scheduleIndex = bestIdx;
    }

    if (this.preRenderedAudio) {
      this.preRenderedAudio = false;
      this.onScheduleRebuild?.();
    }
  }

  private playTickAudio(beat: number, subBeat: number, isStrong: boolean, isAccent: boolean, isMute: boolean) {
    if (!isMute) {
      try {
        if (isStrong) {
          this.playStrongClick?.();
        } else if (isAccent) {
          this.playHighClick?.();
        } else {
          this.playLowClick?.();
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
    this.currentBeat = tick.beat;
    this.currentSubBeat = tick.subBeat;

    const isStrong = tick.type === "strong";
    const isAccent = tick.type === "accent" || isStrong;
    const isMute = tick.type === "mute";

    this.onSubBeat?.(tick.beat, tick.subBeat);
    if (tick.isMainBeat) {
      this.onBeat?.(tick.beat, isAccent);
    }

    if (tick.isMainBeat && this.onProgress) {
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

    const offset = this.audioOffsetMs;

    if (this.preRenderedAudio) {
      if (this.playCustomSample) {
        this.playCustomSample(tick.beat, tick.subBeat);
      }
      this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat);
    } else if (offset > 0) {
      this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat);
      setTimeout(() => this.playTickAudio(tick.beat, tick.subBeat, isStrong, isAccent, isMute), offset);
    } else if (offset < 0) {
      this.playTickAudio(tick.beat, tick.subBeat, isStrong, isAccent, isMute);
      setTimeout(() => this.fireTickHaptic(isMute, isStrong, isAccent, tick.isMainBeat), Math.abs(offset));
    } else {
      this.playTickAudio(tick.beat, tick.subBeat, isStrong, isAccent, isMute);
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
        if (this.stopAfterMeasure) {
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

  start(startFromBeat?: number) {
    if (this.isRunning) return;
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

  cleanup() {
    this.stop();
  }
}

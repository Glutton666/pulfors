import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// ── 순수 스케줄링 함수·타입은 metronome-engine-pure.ts에서 가져와 re-export ──
export * from "./metronome-engine-pure";
import type {
  BeatType,
  HapticMode,
  BarRepeatSpec,
  ScheduledTick,
  LoopBlockData,
  ScheduleInputs,
  EmitState,
  BlockEmitCacheHandle,
  ProgressInfo,
} from "./metronome-engine-pure";
import {
  pureGetBeatDur,
  pureGetSubPattern,
  pureCalcSinglePassDur,
  pureAddBarWithRepeat,
  pureEmitBeatsInRange,
  pureEmitBlock,
  pureProcessBlock,
  pureProcessOuterCached,
  pureEmitStackedBlockTicks,
} from "./metronome-engine-pure";

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
  jamblock: {
    high: require("@/assets/sounds/jamblock-high.wav"),
    low: require("@/assets/sounds/jamblock-low.wav"),
    strong: require("@/assets/sounds/jamblock-strong.wav"),
  },
  sine: {
    high: require("@/assets/sounds/sine-high.wav"),
    low: require("@/assets/sounds/sine-low.wav"),
    strong: require("@/assets/sounds/sine-strong.wav"),
  },
  blip: {
    high: require("@/assets/sounds/blip-high.wav"),
    low: require("@/assets/sounds/blip-low.wav"),
    strong: require("@/assets/sounds/blip-strong.wav"),
  },
  clave: {
    high: require("@/assets/sounds/clave-high.wav"),
    low: require("@/assets/sounds/clave-low.wav"),
    strong: require("@/assets/sounds/clave-strong.wav"),
  },
  cajon: {
    high: require("@/assets/sounds/cajon-high.wav"),
    low: require("@/assets/sounds/cajon-low.wav"),
    strong: require("@/assets/sounds/cajon-strong.wav"),
  },
  marimba: {
    high: require("@/assets/sounds/marimba-high.wav"),
    low: require("@/assets/sounds/marimba-low.wav"),
    strong: require("@/assets/sounds/marimba-strong.wav"),
  },
  stick: {
    high: require("@/assets/sounds/stick-high.wav"),
    low: require("@/assets/sounds/stick-low.wav"),
    strong: require("@/assets/sounds/stick-strong.wav"),
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
  rimshot: {
    strong: require("@/assets/sounds/rimshot-strong.wav"),
    high: require("@/assets/sounds/rimshot-high.wav"),
    low: require("@/assets/sounds/rimshot-low.wav"),
  },
  triangle: {
    strong: require("@/assets/sounds/triangle-strong.wav"),
    high: require("@/assets/sounds/triangle-high.wav"),
    low: require("@/assets/sounds/triangle-low.wav"),
  },
  hihat: {
    strong: require("@/assets/sounds/hihat-strong.wav"),
    high: require("@/assets/sounds/hihat-high.wav"),
    low: require("@/assets/sounds/hihat-low.wav"),
  },
};

export const highClickSource = soundSets.classic.high;
export const lowClickSource = soundSets.classic.low;
export const strongClickSource = soundSets.classic.strong;

export class MetronomeEngine {
  private static readonly REALTIME_LOOKAHEAD_MS = 160;
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
  private randomBarOrder: number[] | null = null;
  private barRepeats: Map<number, BarRepeatSpec> = new Map();
  private barBpmOverrides: Map<number, number> = new Map();
  private preRenderedAudio = false;
  // 폴리곤 모드처럼 엔진 타이밍/콜백은 유지하면서 기본 클릭만 끌 때 사용한다.
  // bar-layer 클릭은 독립 채널이므로 이 플래그의 영향을 받지 않는다.
  private baseClickMuted = false;
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
  private realtimeAudioScheduler: ((tick: ScheduledTick, atPerformanceTime: number) => boolean) | null = null;
  private clearRealtimeAudio: (() => void) | null = null;
  private realtimeScheduledTicks = new Set<ScheduledTick>();

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
    if (enabled) this.clearRealtimeAudioQueue();
    this.preRenderedAudio = enabled;
  }

  setRealtimeAudioScheduler(
    scheduler: ((tick: ScheduledTick, atPerformanceTime: number) => boolean) | null,
    clear?: (() => void) | null,
  ) {
    this.clearRealtimeAudioQueue();
    this.realtimeAudioScheduler = scheduler;
    this.clearRealtimeAudio = clear ?? null;
  }

  private clearRealtimeAudioQueue() {
    this.realtimeScheduledTicks.clear();
    try { this.clearRealtimeAudio?.(); } catch {}
  }

  /**
   * 기본 메트로놈 클릭과 연결된 샘플만 음소거한다.
   * onBeat/onSubBeat 콜백은 계속 발화하므로 폴리곤의 자체 스케줄링은 유지된다.
   */
  setBaseClickMuted(muted: boolean) {
    this.baseClickMuted = muted;
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

  /**
   * Uses a caller-owned random bar sequence for the next schedule. This is
   * separate from block randomization so a session can preview and replay the
   * exact same order without changing normal loop-block behavior.
   */
  setRandomBarOrder(order: number[] | null) {
    this.randomBarOrder = order?.filter(index => Number.isInteger(index) && index >= 0) ?? null;
    this.invalidateScheduleCache();
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

  /**
   * 특정 바(beat)의 BPM 오버라이드를 설정한다.
   * @param bpm 반드시 `toEngineBpm(displayBpm, denominator)` 로 변환한
   *            quarter-note BPM 값을 전달해야 한다.
   *            null을 전달하면 해당 바의 오버라이드가 해제된다.
   */
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

  /**
   * 모든 바의 BPM 오버라이드를 일괄 교체한다.
   * @param overrides 바 인덱스 → quarter-note BPM 맵.
   *                 값은 반드시 `toEngineBpm(displayBpm, denominator)` 로 변환한
   *                 엔진 내부 단위이어야 한다.
   */
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

    if (
      this.blockPlayMode === "random" &&
      (this.randomBarOrder?.length || sortedBlocks.length === 0)
    ) {
      let candidateCount = this.beatsPerMeasure;
      for (let beat = 0; beat < this.beatsPerMeasure; beat++) {
        if (inputs.barRepeats.get(beat)?.isEnd) {
          candidateCount = beat + 1;
          break;
        }
      }
      const suppliedOrder = this.randomBarOrder?.filter(beat => beat < candidateCount);
      const shuffledBeats = suppliedOrder?.length
        ? suppliedOrder
        : Array.from({ length: candidateCount }, (_, beat) => beat);
      if (!suppliedOrder?.length) {
        for (let i = shuffledBeats.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledBeats[i], shuffledBeats[j]] = [shuffledBeats[j], shuffledBeats[i]];
        }
      }
      for (let sequenceIndex = 0; sequenceIndex < shuffledBeats.length; sequenceIndex += 1) {
        const beat = shuffledBeats[sequenceIndex];
        const firstTick = state.ticks.length;
        pureAddBarWithRepeat(inputs, state, beat, 0, -1, 1);
        for (let tickIndex = firstTick; tickIndex < state.ticks.length; tickIndex += 1) {
          state.ticks[tickIndex].randomSequenceIndex = sequenceIndex;
        }
      }
    } else if (this.blockPlayMode === "random" && sortedBlocks.length >= 2) {
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
    if (outerCount > 0) return false;
    let candidateCount = this.beatsPerMeasure;
    for (let beat = 0; beat < this.beatsPerMeasure; beat++) {
      if (this.barRepeats.get(beat)?.isEnd) {
        candidateCount = beat + 1;
        break;
      }
    }
    return candidateCount >= 2;
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
    this.clearRealtimeAudioQueue();
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
    // scheduleOffsetCallback에서 지연 발화될 때 preRenderedAudio가 이미 true로
    // 전환됐을 수 있다. 이 경우 rendered 오디오가 동일한 클릭을 재생하므로
    // per-tick 발화를 건너뛰어 이중 재생(double-play)을 방지한다.
    if (this.preRenderedAudio) return;
    // 폴리곤 모드에서는 엔진의 base-layer 클릭(및 연결 샘플)만 억제한다.
    // 비트 콜백은 playTickAudio 전에 실행되므로 폴리곤 자체 사운드는 별도 재생된다.
    const suppressBaseAudio = this.baseClickMuted && layerIndex === 0;
    if (!isMute && !suppressBaseAudio) {
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
    if (!suppressBaseAudio && this.playCustomSample) {
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
          randomSequenceIndex: tick.randomSequenceIndex,
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
          randomSequenceIndex: tick.randomSequenceIndex,
        });
      }
    }

    const offset = this.audioOffsetMs;
    const realtimeAudioWasScheduled = this.realtimeScheduledTicks.delete(tick);

    // 가청 클릭 발화 통지 — mute가 아닌 모든 경로(일반/레이어/블록/프리렌더)에 대해
    // 동기적으로 한 번씩 호출된다. audioOffsetMs는 시각/햅틱 타이밍 보정용이므로 무시한다.
    if (!isMute && this.onClickEmitted) {
      try { this.onClickEmitted(Date.now()); } catch {}
    }

    if (this.preRenderedAudio || realtimeAudioWasScheduled) {
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
    this.clearRealtimeAudioQueue();
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
      } else if (this.preRenderedAudio) {
        // A rendered player contains the previous random pass and would keep
        // looping that old order. Hand audio back to live tick playback as
        // soon as the next shuffled pass has been built.
        if (this.onScheduleRebuild) {
          this.onScheduleRebuild();
        } else {
          this.preRenderedAudio = false;
        }
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

  /** stop() 후에도 보존되는 현재 마디 시작 시각 (performance.now 기준) */
  getMeasureStartTime(): number {
    return this.measureStartTime;
  }

  /**
   * Re-anchor visual/progress scheduling to an external master timeline.
   * The caller supplies a phase within the current measure; audio playback is
   * never sought or restarted. This is used only while pre-rendered output owns
   * the audible timeline.
   */
  syncToMeasureElapsedMs(elapsedMs: number, thresholdMs = 40): boolean {
    if (!this.isRunning || !this.preRenderedAudio || this.measureDurationMs <= 0) return false;
    const normalized = ((elapsedMs % this.measureDurationMs) + this.measureDurationMs) % this.measureDurationMs;
    const current = ((this.getMeasureElapsedMs() % this.measureDurationMs) + this.measureDurationMs) % this.measureDurationMs;
    let delta = normalized - current;
    if (delta > this.measureDurationMs / 2) delta -= this.measureDurationMs;
    if (delta < -this.measureDurationMs / 2) delta += this.measureDurationMs;
    if (Math.abs(delta) < thresholdMs) return false;

    this.measureStartTime = performance.now() - normalized;
    this.anchorWallTime = this.measureStartTime;
    this.anchorMeasureCount = this.measureCount;
    this.anchorMeasureDurationMs = this.measureDurationMs;
    const nextIndex = this.schedule.findIndex((tick) => tick.time > normalized + 1);
    this.scheduleIndex = nextIndex >= 0 ? nextIndex : this.schedule.length;
    return true;
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
    this.fillRealtimeAudioLookAhead(now);

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

  private fillRealtimeAudioLookAhead(now: number) {
    if (this.preRenderedAudio || !this.realtimeAudioScheduler) return;
    const horizon = now + MetronomeEngine.REALTIME_LOOKAHEAD_MS;
    for (let i = this.scheduleIndex; i < this.schedule.length; i++) {
      const tick = this.schedule[i];
      const at = this.measureStartTime + tick.time + Math.max(0, this.audioOffsetMs);
      if (at > horizon) break;
      const hasSpecializedAudio =
        tick.layerIndex > 0 ||
        (tick.blockIndex >= 0 && Boolean(this.loopBlocks[tick.blockIndex]?.soundSet));
      const baseAudioSuppressed = this.baseClickMuted && tick.layerIndex === 0;
      if (
        tick.type === "mute" ||
        hasSpecializedAudio ||
        baseAudioSuppressed ||
        this.realtimeScheduledTicks.has(tick)
      ) continue;
      try {
        if (this.realtimeAudioScheduler(tick, at)) this.realtimeScheduledTicks.add(tick);
      } catch {}
    }
  }

  private scheduleNext() {
    const nextTick = this.schedule[this.scheduleIndex];
    if (!nextTick) return;
    const nextAbsolute = this.measureStartTime + nextTick.time;
    const wait = nextAbsolute - performance.now();

    if (wait > 100) {
      this.timerId = setTimeout(this.loop, wait - 80);
    } else if (wait > 25) {
      this.timerId = setTimeout(this.loop, wait - 16);
    } else {
      // wait ≤ 25ms: RAF는 프레임 경계(~16ms)에 고정되어 틱이 최대 ~12ms 늦게
      // 발화될 수 있다. setTimeout(0)은 다음 이벤트 루프 반복(~1ms)에 실행되므로
      // wait이 얼마든 무조건 setTimeout(0)으로 통일한다.
      this.timerId = setTimeout(this.loop, 0);
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

  start(arg?: number | { startFromBeat?: number; startAtPerformanceTime?: number; measureStartAt?: number }) {
    if (this.isRunning) return;
    let startFromBeat: number | undefined;
    let startAtPerformanceTime: number | undefined;
    let measureStartAt: number | undefined;
    if (typeof arg === "number") {
      startFromBeat = arg;
    } else if (arg && typeof arg === "object") {
      startFromBeat = arg.startFromBeat;
      startAtPerformanceTime = arg.startAtPerformanceTime;
      measureStartAt = arg.measureStartAt;
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
      // measureStartAt이 주어지면 그 시각을 마디 기준점으로 사용.
      // 이 값이 미래라면 loop()의 elapsed < 0 → 모든 tick이 대기 상태가 되어
      // 정확한 wall-clock 시각에 비트 1이 발화된다 (seamless 전환용).
      this.measureStartTime = (typeof measureStartAt === "number" && Number.isFinite(measureStartAt))
        ? measureStartAt
        : performance.now();
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
    this.clearRealtimeAudioQueue();
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

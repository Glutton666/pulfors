import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type BeatType = "strong" | "accent" | "normal" | "mute";
export type HapticMode = "all" | "accent" | "off";

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
  private barRepeats: Map<number, { type: "count" | "duration"; value: number }> = new Map();
  private preRenderedAudio = false;

  private schedule: ScheduledTick[] = [];
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

  setOnBeat(callback: (beat: number, isAccent: boolean) => void) {
    this.onBeat = callback;
  }

  setOnSubBeat(callback: ((beat: number, subBeat: number) => void) | null) {
    this.onSubBeat = callback;
  }

  setOnMeasureComplete(callback: (() => void) | null) {
    this.onMeasureComplete = callback;
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

  setBpm(bpm: number) {
    this.bpm = Math.max(20, Math.min(300, bpm));
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
  }

  setBeatTypes(types: BeatType[]) {
    this.beatTypes = types;
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
  }

  setBarRepeats(repeats: Record<number, { type: "count" | "duration"; value: number }>) {
    this.barRepeats.clear();
    for (const [k, v] of Object.entries(repeats)) {
      this.barRepeats.set(Number(k), v);
    }
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  clearBarRepeats() {
    this.barRepeats.clear();
    if (this.isRunning) {
      this.rebuildSchedule();
    }
  }

  getBpm() {
    return this.bpm;
  }

  buildScheduleOnly() {
    this.schedule = this.buildSchedule();
    this.scheduleIndex = 0;
  }

  getScheduleInfo(): { ticks: { time: number; type: BeatType; beat: number; subBeat: number; repeatIteration: number }[]; durationMs: number } {
    if (this.schedule.length === 0) {
      this.schedule = this.buildSchedule();
    }
    return {
      ticks: this.schedule.map(t => ({ time: t.time, type: t.type, beat: t.beat, subBeat: t.subBeat, repeatIteration: t.repeatIteration })),
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

  private buildSchedule(): ScheduledTick[] {
    const beatDur = 60000 / this.bpm;
    const ticks: ScheduledTick[] = [];
    let time = 0;

    for (let beat = 0; beat < this.beatsPerMeasure; beat++) {
      const subPattern = this.getSubPattern(beat);
      const subDur = beatDur / subPattern.length;
      const repeat = this.barRepeats.get(beat);
      let repeatCount = 1;

      if (repeat) {
        if (repeat.type === "count") {
          repeatCount = Math.max(1, repeat.value);
        } else {
          const durationMs = repeat.value * 1000;
          repeatCount = Math.max(1, Math.round(durationMs / beatDur));
        }
      }

      for (let r = 0; r < repeatCount; r++) {
        for (let sub = 0; sub < subPattern.length; sub++) {
          ticks.push({
            time,
            beat,
            subBeat: sub,
            type: subPattern[sub],
            isMainBeat: sub === 0,
            repeatIteration: r,
          });
          time += subDur;
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
  }

  private fireTick(tick: ScheduledTick) {
    this.currentBeat = tick.beat;
    this.currentSubBeat = tick.subBeat;

    const isStrong = tick.type === "strong";
    const isAccent = tick.type === "accent" || isStrong;
    const isMute = tick.type === "mute";

    const playAudio = () => {
      if (isMute) return;
      try {
        if (isStrong) {
          this.playStrongClick?.();
        } else if (isAccent) {
          this.playHighClick?.();
        } else {
          this.playLowClick?.();
        }
      } catch (e) {}
      if (tick.repeatIteration === 0 && this.playCustomSample) {
        this.playCustomSample(tick.beat, tick.subBeat);
      }
    };

    const fireVisual = () => {
      this.onSubBeat?.(tick.beat, tick.subBeat);
      if (tick.isMainBeat) {
        this.onBeat?.(tick.beat, isAccent);
      }
    };

    const fireHaptic = () => {
      if (!isMute && Platform.OS !== "web" && this.hapticMode !== "off") {
        const shouldHaptic = this.hapticMode === "all" || (this.hapticMode === "accent" && isAccent);
        if (shouldHaptic) {
          try {
            Haptics.impactAsync(
              isStrong
                ? Haptics.ImpactFeedbackStyle.Heavy
                : isAccent
                ? Haptics.ImpactFeedbackStyle.Heavy
                : tick.isMainBeat
                ? Haptics.ImpactFeedbackStyle.Light
                : Haptics.ImpactFeedbackStyle.Soft
            );
          } catch (e) {}
        }
      }
    };

    const offset = this.audioOffsetMs;

    fireVisual();

    if (this.preRenderedAudio) {
      fireHaptic();
    } else if (offset > 0) {
      fireHaptic();
      setTimeout(playAudio, offset);
    } else if (offset < 0) {
      playAudio();
      setTimeout(fireHaptic, Math.abs(offset));
    } else {
      playAudio();
      fireHaptic();
    }
  }

  private getElapsed(): number {
    return performance.now() - this.measureStartTime;
  }

  private loop = () => {
    if (!this.isRunning) return;

    while (this.isRunning && this.scheduleIndex < this.schedule.length) {
      const tick = this.schedule[this.scheduleIndex];
      if (tick.time > this.getElapsed() + 1) break;

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
        this.schedule = this.buildSchedule();
        this.scheduleIndex = 0;
        break;
      }
    }

    if (this.isRunning) {
      const nextTick = this.schedule[this.scheduleIndex];
      if (nextTick) {
        const nextAbsolute = this.measureStartTime + nextTick.time;
        const wait = nextAbsolute - performance.now();
        if (wait > 50) {
          this.timerId = setTimeout(this.loop, Math.min(wait - 30, 40));
        } else {
          this.scheduleRAF();
        }
      }
    }
  };

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
      this.timerId = setTimeout(this.loop, 1);
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
    this.isRunning = true;
    if (this.schedule.length === 0) {
      this.schedule = this.buildSchedule();
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
    this.currentBeat = 0;
    this.currentSubBeat = 0;
    this.schedule = [];
    this.scheduleIndex = 0;
  }

  cleanup() {
    this.stop();
  }
}

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type BeatType = "accent" | "normal" | "mute";

export const highClickSource = require("@/assets/sounds/click-high.wav");
export const lowClickSource = require("@/assets/sounds/click-low.wav");

export class MetronomeEngine {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private bpm = 120;
  private beatsPerMeasure = 4;
  private currentBeat = 0;
  private currentSubBeat = 0;
  private beatTypes: BeatType[] = ["accent", "normal", "normal", "normal"];
  private beatSubdivisions: Map<number, BeatType[]> = new Map();
  private onBeat: ((beat: number, isAccent: boolean) => void) | null = null;
  private onMeasureComplete: (() => void) | null = null;
  private stopAfterMeasure = false;
  private playHighClick: (() => void) | null = null;
  private playLowClick: (() => void) | null = null;

  setAudioCallbacks(playHigh: () => void, playLow: () => void) {
    this.playHighClick = playHigh;
    this.playLowClick = playLow;
  }

  setOnBeat(callback: (beat: number, isAccent: boolean) => void) {
    this.onBeat = callback;
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
      this.stop();
      this.start();
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
    if (this.isRunning) {
      this.stop();
      this.start();
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

  getBpm() {
    return this.bpm;
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

    if (beatType === "accent") {
      const result = [...custom];
      if (result[0] === "normal") {
        result[0] = "accent";
      }
      return result;
    }

    return custom;
  }

  private tick() {
    const subPattern = this.getSubPattern(this.currentBeat);
    const subBeatType = subPattern[this.currentSubBeat] || "normal";
    const isMainBeat = this.currentSubBeat === 0;
    const isAccent = subBeatType === "accent";
    const isMute = subBeatType === "mute";

    if (!isMute) {
      try {
        if (isAccent) {
          this.playHighClick?.();
        } else {
          this.playLowClick?.();
        }
      } catch (e) {}

      if (Platform.OS !== "web") {
        try {
          Haptics.impactAsync(
            isAccent
              ? Haptics.ImpactFeedbackStyle.Heavy
              : isMainBeat
              ? Haptics.ImpactFeedbackStyle.Light
              : Haptics.ImpactFeedbackStyle.Soft
          );
        } catch (e) {}
      }
    }

    if (isMainBeat) {
      this.onBeat?.(this.currentBeat, isAccent);
    }

    this.currentSubBeat++;
    if (this.currentSubBeat >= subPattern.length) {
      this.currentSubBeat = 0;
      const nextBeat = (this.currentBeat + 1) % this.beatsPerMeasure;
      if (nextBeat === 0) {
        this.onMeasureComplete?.();
        if (this.stopAfterMeasure) {
          this.stopAfterMeasure = false;
          this.stop();
          return;
        }
      }
      this.currentBeat = nextBeat;
    }

    if (this.isRunning) {
      const nextSubPattern = this.getSubPattern(this.currentBeat);
      const beatDuration = 60000 / this.bpm;
      const subBeatDuration = beatDuration / nextSubPattern.length;
      this.timeoutId = setTimeout(() => this.tick(), subBeatDuration);
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentBeat = 0;
    this.currentSubBeat = 0;
    this.tick();
  }

  stop() {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.currentBeat = 0;
    this.currentSubBeat = 0;
  }

  cleanup() {
    this.stop();
  }
}

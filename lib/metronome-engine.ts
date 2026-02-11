import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type BeatType = "accent" | "normal" | "mute";

export const highClickSource = require("@/assets/sounds/click-high.wav");
export const lowClickSource = require("@/assets/sounds/click-low.wav");

export class MetronomeEngine {
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private bpm = 120;
  private beatsPerMeasure = 4;
  private subdivisions = 1;
  private currentBeat = 0;
  private currentSubBeat = 0;
  private beatTypes: BeatType[] = ["accent", "normal", "normal", "normal"];
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
  }

  setBeatTypes(types: BeatType[]) {
    this.beatTypes = types;
  }

  setSubdivisions(subs: number) {
    this.subdivisions = Math.max(1, Math.min(4, subs));
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  getSubdivisions() {
    return this.subdivisions;
  }

  getBpm() {
    return this.bpm;
  }

  getIsRunning() {
    return this.isRunning;
  }

  private tick() {
    const isMainBeat = this.currentSubBeat === 0;
    const beatType = this.beatTypes[this.currentBeat] || "normal";
    const isAccent = beatType === "accent" && isMainBeat;
    const isMute = beatType === "mute";

    if (!isMute) {
      try {
        if (isMainBeat && isAccent) {
          this.playHighClick?.();
        } else {
          this.playLowClick?.();
        }
      } catch (e) {
      }

      if (Platform.OS !== "web") {
        try {
          Haptics.impactAsync(
            isMainBeat && isAccent
              ? Haptics.ImpactFeedbackStyle.Heavy
              : isMainBeat
              ? Haptics.ImpactFeedbackStyle.Light
              : Haptics.ImpactFeedbackStyle.Soft
          );
        } catch (e) {
        }
      }
    }

    if (isMainBeat) {
      this.onBeat?.(this.currentBeat, isAccent);
    }

    this.currentSubBeat++;
    if (this.currentSubBeat >= this.subdivisions) {
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
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentBeat = 0;
    this.currentSubBeat = 0;

    const intervalMs = 60000 / (this.bpm * this.subdivisions);

    this.tick();

    this.intervalId = setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.currentBeat = 0;
    this.currentSubBeat = 0;
  }

  cleanup() {
    this.stop();
  }
}

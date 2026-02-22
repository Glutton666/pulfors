import { Platform } from "react-native";

export interface TimingResult {
  offsetMs: number;
  timestamp: number;
}

export class RhythmAccuracyEngine {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private active = false;

  private onsetThreshold = 0.15;
  private lastOnsetTime = 0;
  private minOnsetGapMs = 80;
  private prevRms = 0;
  private onsetCooldown = false;

  private expectedTickTimes: number[] = [];
  private calibrationOffsetMs = 0;

  private onTimingResult: ((result: TimingResult) => void) | null = null;
  private timingResults: TimingResult[] = [];

  setCalibrationOffset(ms: number) {
    this.calibrationOffsetMs = ms;
  }

  setOnTimingResult(cb: ((result: TimingResult) => void) | null) {
    this.onTimingResult = cb;
  }

  registerTick(time: number) {
    this.expectedTickTimes.push(time);
    if (this.expectedTickTimes.length > 20) {
      this.expectedTickTimes.shift();
    }
  }

  getResults(): TimingResult[] {
    return [...this.timingResults];
  }

  getAverageOffset(): number {
    if (this.timingResults.length === 0) return 0;
    const sum = this.timingResults.reduce((a, r) => a + r.offsetMs, 0);
    return sum / this.timingResults.length;
  }

  getAccuracyPercent(): number {
    if (this.timingResults.length === 0) return 0;
    const perfect = this.timingResults.filter(r => Math.abs(r.offsetMs) <= 20).length;
    const good = this.timingResults.filter(r => Math.abs(r.offsetMs) <= 50).length;
    const total = this.timingResults.length;
    return Math.round(((perfect * 1.0 + (good - perfect) * 0.5) / total) * 100);
  }

  clearResults() {
    this.timingResults = [];
  }

  async start(): Promise<boolean> {
    if (Platform.OS !== "web") return false;
    if (this.active) return true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioContext = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      this.analyser = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      this.source = source;

      this.active = true;
      this.prevRms = 0;
      this.lastOnsetTime = 0;
      this.onsetCooldown = false;
      this.timingResults = [];
      this.expectedTickTimes = [];

      const buf = new Float32Array(analyser.fftSize);
      const detect = () => {
        if (!this.active) return;
        analyser.getFloatTimeDomainData(buf);

        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) {
          sumSq += buf[i] * buf[i];
        }
        const rms = Math.sqrt(sumSq / buf.length);

        const now = performance.now();
        const rmsJump = rms - this.prevRms;

        if (
          rmsJump > this.onsetThreshold &&
          rms > 0.05 &&
          !this.onsetCooldown &&
          now - this.lastOnsetTime > this.minOnsetGapMs
        ) {
          this.lastOnsetTime = now;
          this.onsetCooldown = true;
          setTimeout(() => { this.onsetCooldown = false; }, this.minOnsetGapMs);

          this.matchOnset(now);
        }

        this.prevRms = rms * 0.7 + this.prevRms * 0.3;
        this.rafId = requestAnimationFrame(detect);
      };

      this.rafId = requestAnimationFrame(detect);
      return true;
    } catch (e) {
      console.warn("[RhythmAccuracy] Failed to start:", e);
      return false;
    }
  }

  private matchOnset(onsetTime: number) {
    if (this.expectedTickTimes.length === 0) return;

    let closestDiff = Infinity;
    for (const tickTime of this.expectedTickTimes) {
      const diff = onsetTime - tickTime - this.calibrationOffsetMs;
      if (Math.abs(diff) < Math.abs(closestDiff)) {
        closestDiff = diff;
      }
    }

    if (Math.abs(closestDiff) > 300) return;

    const result: TimingResult = {
      offsetMs: Math.round(closestDiff),
      timestamp: onsetTime,
    };

    this.timingResults.push(result);
    if (this.timingResults.length > 500) {
      this.timingResults.shift();
    }

    this.onTimingResult?.(result);
  }

  stop() {
    this.active = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.analyser = null;
  }

  isActive(): boolean {
    return this.active;
  }

  cleanup() {
    this.stop();
    this.timingResults = [];
    this.expectedTickTimes = [];
    this.onTimingResult = null;
  }
}

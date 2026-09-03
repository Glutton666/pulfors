export type AudioOutputMode = "idle" | "rendering" | "prerender" | "realtime" | "transitioning" | "recovering" | "failed";

export interface ClockSource {
  nowSeconds(): number;
}

export interface AudioTimelineSnapshot {
  audioTimeSeconds: number;
  performanceTimeMs: number;
  positionSeconds: number;
  driftMs: number;
}

export interface AudioTimingSummary {
  sampleCount: number;
  elapsedMinutes: number;
  driftPerMinuteMs: number;
  currentDriftMs: number;
  maxAbsDriftMs: number;
  maxJitterMs: number;
}

export const AUDIO_TIMING_LIMITS = {
  diagnosticSampleIntervalMs: 1000,
  uiResyncThresholdMs: 40,
  uiResyncIntervalMs: 1000,
  staleHapticThresholdMs: 80,
} as const;

export class AudioClockAdapter {
  private audioOriginSeconds = 0;
  private performanceOriginMs = 0;
  private timelineOffsetSeconds = 0;
  private mapped = false;

  constructor(
    private readonly audioClock: ClockSource,
    private readonly performanceClock: ClockSource = {
      nowSeconds: () => performance.now() / 1000,
    },
  ) {}

  map(timelineOffsetSeconds = 0): void {
    this.audioOriginSeconds = this.audioClock.nowSeconds();
    this.performanceOriginMs = this.performanceClock.nowSeconds() * 1000;
    this.timelineOffsetSeconds = timelineOffsetSeconds;
    this.mapped = true;
  }

  invalidate(): void {
    this.mapped = false;
  }

  isMapped(): boolean {
    return this.mapped;
  }

  now(): AudioTimelineSnapshot | null {
    if (!this.mapped) return null;
    const audioTimeSeconds = this.audioClock.nowSeconds();
    const performanceTimeMs = this.performanceClock.nowSeconds() * 1000;
    const audioElapsedMs = (audioTimeSeconds - this.audioOriginSeconds) * 1000;
    const performanceElapsedMs = performanceTimeMs - this.performanceOriginMs;
    return {
      audioTimeSeconds,
      performanceTimeMs,
      positionSeconds: this.timelineOffsetSeconds + audioElapsedMs / 1000,
      driftMs: audioElapsedMs - performanceElapsedMs,
    };
  }

  audioTimeToPerformanceMs(audioTimeSeconds: number): number | null {
    if (!this.mapped) return null;
    return this.performanceOriginMs + (audioTimeSeconds - this.audioOriginSeconds) * 1000;
  }

  performanceTimeToAudioSeconds(performanceTimeMs: number): number | null {
    if (!this.mapped) return null;
    return this.audioOriginSeconds + (performanceTimeMs - this.performanceOriginMs) / 1000;
  }
}

export class AudioTimingDiagnostics {
  private firstPerformanceMs: number | null = null;
  private firstDriftMs = 0;
  private previousDriftMs: number | null = null;
  private latestDriftMs = 0;
  private maxAbsDriftMs = 0;
  private maxJitterMs = 0;
  private sampleCount = 0;

  constructor(private readonly enabled: boolean) {}

  record(sample: AudioTimelineSnapshot): void {
    if (!this.enabled) return;
    if (this.firstPerformanceMs === null) {
      this.firstPerformanceMs = sample.performanceTimeMs;
      this.firstDriftMs = sample.driftMs;
    }
    if (this.previousDriftMs !== null) {
      this.maxJitterMs = Math.max(this.maxJitterMs, Math.abs(sample.driftMs - this.previousDriftMs));
    }
    this.previousDriftMs = sample.driftMs;
    this.latestDriftMs = sample.driftMs;
    this.maxAbsDriftMs = Math.max(this.maxAbsDriftMs, Math.abs(sample.driftMs));
    this.sampleCount += 1;
  }

  summary(nowPerformanceMs?: number): AudioTimingSummary | null {
    if (!this.enabled || this.firstPerformanceMs === null || this.sampleCount === 0) return null;
    const endMs = nowPerformanceMs ?? this.firstPerformanceMs;
    const elapsedMinutes = Math.max(0, (endMs - this.firstPerformanceMs) / 60000);
    return {
      sampleCount: this.sampleCount,
      elapsedMinutes,
      driftPerMinuteMs: elapsedMinutes > 0
        ? (this.latestDriftMs - this.firstDriftMs) / elapsedMinutes
        : 0,
      currentDriftMs: this.latestDriftMs,
      maxAbsDriftMs: this.maxAbsDriftMs,
      maxJitterMs: this.maxJitterMs,
    };
  }
}

export class AudioOutputStateMachine {
  private mode: AudioOutputMode = "idle";
  private generation = 0;

  transition(mode: AudioOutputMode): number {
    this.mode = mode;
    if (mode === "rendering" || mode === "transitioning" || mode === "recovering" || mode === "idle") {
      this.generation += 1;
    }
    return this.generation;
  }

  snapshot(): { mode: AudioOutputMode; generation: number } {
    return { mode: this.mode, generation: this.generation };
  }

  owns(generation: number): boolean {
    return generation === this.generation;
  }
}
import { getWebAudioContext, playWebRenderedLoop, scheduleWebClickAt, type ScheduledWebAudio, type WebRenderedLoop } from "./audio-renderer";
import type { SampleChannel, MetroChannel } from "./stereo-channel";

export type WebPCM = Float32Array | { left: Float32Array; right: Float32Array };

export interface WebOutputResource {
  stop: (atAudioTime?: number) => void;
  release: (atAudioTime?: number) => void;
  isRunning?: () => boolean;
  setVolume?: (volume: number, atAudioTime?: number) => void;
  getPositionSeconds?: () => number;
  getNextBoundaryTime?: () => number;
  getDurationSeconds?: () => number;
  onEnded?: (listener: () => void) => void;
}

/** Adapter around Web Audio output primitives. No resource is retained globally. */
export function createWebAudioOutput() {
  const rendered = (
    pcm: WebPCM,
    volume = 1,
    channel: SampleChannel = "both",
    startAtAudioTime?: number,
  ): WebOutputResource => {
    const endedListeners = new Set<() => void>();
    const ctx = getWebAudioContext();
    let boundaryTimer: ReturnType<typeof setTimeout> | null = null;
    let completionReported = false;
    const reportCompletion = () => {
      if (completionReported) return;
      completionReported = true;
      endedListeners.forEach((listener) => listener());
    };
    const loop = playWebRenderedLoop(
      pcm as any,
      reportCompletion,
      channel,
      volume,
      startAtAudioTime,
    );
    let stopKind: "none" | "scheduled" | "immediate" = "none";
    let released = false;
    const stop = (atAudioTime?: number) => {
      if (boundaryTimer) {
        clearTimeout(boundaryTimer);
        boundaryTimer = null;
      }
      loop.stop(atAudioTime);
      if (ctx && atAudioTime !== undefined && atAudioTime > ctx.currentTime) {
        stopKind = "scheduled";
        boundaryTimer = setTimeout(
          reportCompletion,
          Math.max(0, (atAudioTime - ctx.currentTime) * 1000) + 20,
        );
      } else {
        stopKind = "immediate";
      }
    };
    const release = (atAudioTime?: number) => {
      if (released) return;
      released = true;
      if (boundaryTimer && atAudioTime === undefined) {
        clearTimeout(boundaryTimer);
        boundaryTimer = null;
      }
      if (stopKind !== "immediate") stop(atAudioTime);
    };
    return {
      stop,
      release,
      isRunning: () => loop.isRunning(),
      setVolume: loop.setVolume,
      getPositionSeconds: loop.getPositionSeconds,
      getNextBoundaryTime: loop.getNextBoundaryTime,
      getDurationSeconds: loop.getDurationSeconds,
      onEnded: (listener) => { endedListeners.add(listener); },
    };
  };

  const click = (
    role: "strong" | "high" | "low",
    channel: MetroChannel = "both",
    gain = 1,
    when?: number,
  ): WebOutputResource | null => {
    const source = scheduleWebClickAt(role, channel, gain, when);
    return source ? scheduled(source) : null;
  };

  const pcmRealtime = (
    pcm: WebPCM,
    volume = 1,
    channel: SampleChannel = "both",
    when?: number,
  ): WebOutputResource | null => {
    const ctx = getWebAudioContext();
    if (!ctx) return null;
    try {
      const stereo = !(pcm instanceof Float32Array);
      const length = stereo
        ? Math.min(pcm.left.length, pcm.right.length)
        : pcm.length;
      if (!length) return null;
      const buffer = ctx.createBuffer(stereo ? 2 : 1, length, ctx.sampleRate);
      buffer.getChannelData(0).set(stereo ? pcm.left.subarray(0, length) : pcm);
      if (stereo) buffer.getChannelData(1).set(pcm.right.subarray(0, length));
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(4, volume));
      source.buffer = buffer;
      source.connect(gain);
      if (!stereo && channel !== "both" && typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.value = channel === "left" ? -1 : 1;
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        gain.connect(ctx.destination);
      }
      let released = false;
      const endedListeners = new Set<() => void>();
      const release = () => {
        if (released) return;
        released = true;
        try { source.stop(); } catch {}
        try { source.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
      };
      source.onended = () => {
        try { source.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
        endedListeners.forEach((listener) => listener());
      };
      source.start(Math.max(ctx.currentTime, when ?? ctx.currentTime));
      return {
        stop: release,
        release,
        isRunning: () => !released && ctx.state === "running",
        onEnded: (listener) => { endedListeners.add(listener); },
      };
    } catch {
      return null;
    }
  };

  return { rendered, click, pcmRealtime };
}

function scheduled(source: ScheduledWebAudio): WebOutputResource {
  let released = false;
  const endedListeners = new Set<() => void>();
  source.onEnded?.(() => endedListeners.forEach((listener) => listener()));
  const release = () => {
    if (released) return;
    released = true;
    source.cancel();
  };
  return { stop: release, release, onEnded: (listener) => { endedListeners.add(listener); } };
}

export type WebAudioOutput = ReturnType<typeof createWebAudioOutput>;
export type WebRenderedResource = WebRenderedLoop;
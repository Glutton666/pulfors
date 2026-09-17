import { Platform } from "react-native";
import { createWebAudioOutput, type WebAudioOutput, type WebPCM } from "./web-audio-output";
import { createNativeAudioOutput, type NativeAudioOutput, type NativePool } from "./native-audio-output";
import type { SampleChannel, MetroChannel } from "./stereo-channel";

export type AudioOutputResource = {
  stop?: (atAudioTime?: number) => void;
  release: (atAudioTime?: number) => void;
  setVolume?: (volume: number, atAudioTime?: number) => void;
  isRunning?: () => boolean;
  getPositionSeconds?: () => number;
  getNextBoundaryTime?: () => number;
  getDurationSeconds?: () => number;
  playAndConfirm?: (label?: string) => Promise<boolean>;
  uri?: string;
  onEnded?: (listener: () => void) => void;
};
export type AudioOutputOwner = ReturnType<typeof createAudioOutputOwner>;
export type OutputAdapter = WebAudioOutput | NativeAudioOutput;

export interface AudioOutputOwnerOptions {
  adapter?: OutputAdapter;
}

/** Single ownership boundary for active, handoff, and one-shot output. */
export function createAudioOutputOwner(options: AudioOutputOwnerOptions = {}) {
  const adapter = options.adapter ?? (Platform.OS === "web" ? createWebAudioOutput() : createNativeAudioOutput());
  const nativeAdapter = adapter && "createPool" in adapter
    ? adapter as NativeAudioOutput
    : createNativeAudioOutput();
  let active: AudioOutputResource | null = null;
  let handoff: AudioOutputResource | null = null;
  const realtime = new Set<AudioOutputResource>();
  const retiring = new Set<AudioOutputResource>();
  const managed = new Map<object, AudioOutputResource>();
  const released = new WeakSet<object>();
  let disposed = false;
  let mode: "idle" | "realtime" | "prerender" | "transitioning" | "recovering" | "failed" = "idle";
  let generation = 0;
  const release = (resource: AudioOutputResource | null, atAudioTime?: number) => {
    if (!resource || released.has(resource)) return;
    released.add(resource);
    try { resource.stop?.(atAudioTime); } catch {}
    try { resource.release(atAudioTime); } catch {}
  };
  const replace = (
    slot: "active" | "handoff",
    resource: AudioOutputResource | null,
    atAudioTime?: number,
  ) => {
    if (disposed) { release(resource); return false; }
    const old = slot === "active" ? active : handoff;
    if (old === resource) return true;
    if (old && atAudioTime !== undefined && slot === "active") {
      try { old.stop?.(atAudioTime); } catch {}
      retiring.add(old);
      old.onEnded?.(() => {
        retiring.delete(old);
        release(old);
      });
    } else {
      release(old);
    }
    if (slot === "active") active = resource;
    else handoff = resource;
    return true;
  };
  return {
    adapter,
    nativeAdapter,
    activate() { disposed = false; },
    publish(resource: AudioOutputResource | null, atAudioTime?: number) {
      return replace("active", resource, atAudioTime);
    },
    publishHandoff(resource: AudioOutputResource | null) { return replace("handoff", resource); },
    commitHandoff(atAudioTime?: number) {
      if (!handoff) return false;
      const next = handoff; handoff = null;
      return replace("active", next, atAudioTime);
    },
    discardHandoff() { release(handoff); handoff = null; },
    trackRealtime(resource: AudioOutputResource | null) {
      if (!resource || disposed) { release(resource); return null; }
      realtime.add(resource);
      resource.onEnded?.(() => realtime.delete(resource));
      return resource;
    },
    manage(key: object, resource: AudioOutputResource) {
      if (disposed) {
        release(resource);
        return false;
      }
      const previous = managed.get(key);
      if (previous && previous !== resource) release(previous);
      managed.set(key, resource);
      return true;
    },
    releaseManaged(key: object) {
      const resource = managed.get(key);
      if (!resource) return false;
      managed.delete(key);
      release(resource);
      return true;
    },
    clearRealtime() { realtime.forEach((resource) => release(resource)); realtime.clear(); },
    active: () => active,
    transition(next: typeof mode) {
      mode = next;
      if (next === "idle" || next === "transitioning" || next === "recovering") generation += 1;
      return generation;
    },
    owns(candidate: number) { return candidate === generation; },
    stop() {
      release(active); active = null;
      release(handoff); handoff = null;
      retiring.forEach((resource) => release(resource)); retiring.clear();
      this.clearRealtime();
      managed.forEach((resource) => {
        try { resource.stop?.(); } catch {}
      });
      mode = "idle";
      generation += 1;
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        this.stop();
        managed.forEach((resource) => release(resource));
        managed.clear();
      }
    },
    snapshot: () => ({
      active,
      handoff,
      realtimeCount: realtime.size,
      retiringCount: retiring.size,
      managedCount: managed.size,
      disposed,
      mode,
      generation,
    }),
  };
}

export function publishAudioOutput(
  owner: AudioOutputOwner,
  output: AudioOutputResource | null,
  options?: { handoff?: boolean; replaceAtAudioTime?: number },
): boolean {
  return options?.handoff
    ? owner.publishHandoff(output)
    : owner.publish(output, options?.replaceAtAudioTime);
}

export interface PolygonAudioRequest {
  soundSet: string;
  role: "strong" | "high" | "low";
  volume?: number;
  pcm?: WebPCM;
  channel?: SampleChannel;
  when?: number;
  pools?: Record<string, NativePool>;
}

export function playPolygonAudioOutput(
  owner: AudioOutputOwner,
): (request: PolygonAudioRequest) => boolean;
export function playPolygonAudioOutput(
  owner: AudioOutputOwner,
  request: PolygonAudioRequest,
): boolean;
export function playPolygonAudioOutput(
  owner: AudioOutputOwner,
  request?: PolygonAudioRequest,
): boolean | ((next: PolygonAudioRequest) => boolean) {
  if (!request) return (next) => playPolygonAudioOutput(owner, next);
  if (owner.snapshot().disposed) return false;
  if (Platform.OS === "web") {
    const web = owner.adapter as WebAudioOutput;
    const pcmOutput = request.pcm
      ? web.pcmRealtime(request.pcm, request.volume, request.channel, request.when)
      : null;
    const output = pcmOutput
      ?? web.click(request.role, (request.channel ?? "both") as MetroChannel, request.volume, request.when);
    return !!owner.trackRealtime(output as AudioOutputResource | null);
  }
  const native = owner.adapter as NativeAudioOutput;
  return !!request.pools && native.polygon(request.pools, request.soundSet, request.role, request.volume ?? 1, nativeCursors(owner));
}

const cursorsByOwner = new WeakMap<object, Map<string, number>>();
function nativeCursors(owner: object) {
  let cursors = cursorsByOwner.get(owner);
  if (!cursors) { cursors = new Map(); cursorsByOwner.set(owner, cursors); }
  return cursors;
}
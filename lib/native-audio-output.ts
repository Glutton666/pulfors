import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { safePlayAndConfirm, safePlayWithVolume } from "./audio-utils";
import type { AudioSource } from "expo-audio";

export type NativePlayer = AudioPlayer & { remove?: () => void };
export type NativePool = Record<string, NativePlayer> | {
  highA: NativePlayer; highB: NativePlayer; highC: NativePlayer; highD: NativePlayer;
  lowA: NativePlayer; lowB: NativePlayer; lowC: NativePlayer; lowD: NativePlayer;
  strongA: NativePlayer; strongB: NativePlayer; strongC: NativePlayer; strongD: NativePlayer;
};
export type NativeSoundSetDefinition = {
  high: AudioSource;
  low: AudioSource;
  strong: AudioSource;
};

export interface NativeOutputResource {
  player: NativePlayer;
  uri: string;
  stop: () => void;
  release: () => void;
  setVolume: (volume: number) => void;
  isRunning: () => boolean;
  playAndConfirm: (label?: string) => Promise<boolean>;
}

export function createNativeAudioOutput() {
  const released = new WeakSet<object>();
  const createPlayer = (
    source: Parameters<typeof createAudioPlayer>[0],
    options?: Parameters<typeof createAudioPlayer>[1],
  ) => createAudioPlayer(source, options);
  const releasePlayer = (player: NativePlayer | null | undefined) => {
    if (!player || released.has(player)) return;
    released.add(player);
    try { player.release(); } catch {}
  };
  const rendered = (
    uri: string,
    volume = 1,
    releaseUri?: (uri: string) => void,
  ): NativeOutputResource => {
    const player = createAudioPlayer(uri);
    player.loop = true;
    player.volume = Math.max(0, Math.min(1, volume));
    let stopped = false;
    let releasedResource = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try { player.pause(); } catch {}
    };
    return {
      player,
      uri,
      stop,
      release: () => {
        if (releasedResource) return;
        releasedResource = true;
        stop();
        releasePlayer(player);
        releaseUri?.(uri);
      },
      setVolume: (nextVolume) => {
        player.volume = Math.max(0, Math.min(1, nextVolume));
      },
      isRunning: () => player.playing,
      playAndConfirm: (label = "native.output") => safePlayAndConfirm(player, label),
    };
  };
  const createPool = (definition: NativeSoundSetDefinition): NativePool => ({
    highA: createAudioPlayer(definition.high), highB: createAudioPlayer(definition.high),
    highC: createAudioPlayer(definition.high), highD: createAudioPlayer(definition.high),
    lowA: createAudioPlayer(definition.low), lowB: createAudioPlayer(definition.low),
    lowC: createAudioPlayer(definition.low), lowD: createAudioPlayer(definition.low),
    strongA: createAudioPlayer(definition.strong), strongB: createAudioPlayer(definition.strong),
    strongC: createAudioPlayer(definition.strong), strongD: createAudioPlayer(definition.strong),
  });
  const disposePool = (pool: NativePool) => {
    for (const player of Object.values(pool) as NativePlayer[]) {
      try { player.pause(); } catch {}
      releasePlayer(player);
      try { player.remove?.(); } catch {}
    }
  };
  const stopPool = (pool: NativePool) => {
    for (const player of Object.values(pool) as NativePlayer[]) {
      try { player.pause(); } catch {}
    }
  };
  const play = (player: NativePlayer, volume = 1): boolean => {
    try {
      safePlayWithVolume(player, volume, "polygon.beat");
      return true;
    } catch {
      return false;
    }
  };
  const polygon = (
    pools: Record<string, NativePool>,
    soundSet: string,
    role: "strong" | "high" | "low",
    volume: number,
    cursors: Map<string, number>,
  ): boolean => {
    const pool = pools[soundSet] ?? pools.classic;
    if (!pool) return false;
    const names = role === "strong"
      ? ["strongA", "strongB", "strongC", "strongD"]
      : role === "high" ? ["highA", "highB", "highC", "highD"] : ["lowA", "lowB", "lowC", "lowD"];
    const key = `${soundSet}:${role}`;
    const index = cursors.get(key) ?? 0;
    cursors.set(key, (index + 1) % names.length);
    const player = (pool as Record<string, NativePlayer>)[names[index]];
    return !!player && play(player, volume);
  };
  return { rendered, play, polygon, createPlayer, releasePlayer, createPool, stopPool, disposePool };
}

export type NativeAudioOutput = ReturnType<typeof createNativeAudioOutput>;
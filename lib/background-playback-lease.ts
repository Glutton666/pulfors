import { Platform } from "react-native";
import type { AudioPlayer } from "expo-audio";
import { ensureBackgroundPlaybackAudioMode, isBackgroundPlaybackEnabled } from "./audio-session";
import {
  relinquishForegroundPlayback,
  requestForegroundPlayback,
} from "./android-foreground-service";
import { logger } from "./logger";
import { safePlayAndConfirm } from "./audio-utils";

export type BackgroundPlaybackLease = symbol;

export interface BackgroundPlaybackLeaseStart {
  token: BackgroundPlaybackLease | null;
  ready: Promise<boolean>;
}

export interface BackgroundPlaybackTransportControls {
  isPlaying: () => boolean;
  pause: () => unknown;
  resume: () => unknown;
}

const ACTIVE_PLAYBACK_OWNER = "active-playback";
const owners = new Map<BackgroundPlaybackLease, BackgroundPlaybackTransportControls | null>();
let keepalivePlayer: AudioPlayer | null = null;
let activationPromise: Promise<boolean> | null = null;
let activationGeneration = -1;
let generation = 0;
let lastActivationFailure: string | null = null;

/** Reason the most recent lease activation failed (for field diagnostics). */
export function getBackgroundPlaybackLeaseFailure(): string | null {
  return lastActivationFailure;
}

function disposePlayer(player: AudioPlayer | null): void {
  if (player) {
    if (Platform.OS === "android") {
      try { player.clearLockScreenControls(); } catch {}
    }
    try { player.pause(); } catch {}
    try { player.release(); } catch {}
  }
}

function stopKeepalive(): void {
  const player = keepalivePlayer;
  keepalivePlayer = null;
  disposePlayer(player);
  relinquishForegroundPlayback(ACTIVE_PLAYBACK_OWNER);
}

async function activate(expectedGeneration: number): Promise<boolean> {
  let player: AudioPlayer | null = null;
  try {
    lastActivationFailure = null;
    await ensureBackgroundPlaybackAudioMode();
    if (Platform.OS === "android") {
      await requestForegroundPlayback(ACTIVE_PLAYBACK_OWNER);
    }
    if (owners.size === 0 || generation !== expectedGeneration) {
      if (owners.size === 0) relinquishForegroundPlayback(ACTIVE_PLAYBACK_OWNER);
      return false;
    }

    // Keep the native render thread continuously active between sparse Polygon
    // and Score events, and across rendered-buffer handoffs in other modes.
    // This is a real playback lease and exists only while playback is active.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAudioPlayer } = require("expo-audio") as typeof import("expo-audio");
    player = createAudioPlayer(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/assets/sounds/silence.wav"),
      { updateInterval: 10_000 },
    );
    player.loop = true;
    player.volume = 0;
    // The independent foreground service owns Android background lifetime.
    // Never activate lock-screen controls on this silent helper: doing so
    // registers an Expo Audio MediaSession and recreates the system media card.
    const accepted = await safePlayAndConfirm(player, "background.keepalive");
    if (!accepted || owners.size === 0 || generation !== expectedGeneration) {
      disposePlayer(player);
      player = null;
      if (owners.size === 0) relinquishForegroundPlayback(ACTIVE_PLAYBACK_OWNER);
      return false;
    }
    keepalivePlayer = player;
    player = null;
    logger.info("[background-playback] continuous native lease activated");
    return true;
  } catch (error) {
    disposePlayer(player);
    if (owners.size === 0) relinquishForegroundPlayback(ACTIVE_PLAYBACK_OWNER);
    lastActivationFailure = error instanceof Error ? error.message : String(error);
    logger.warn("[background-playback] lease activation failed:", error);
    return false;
  }
}

export function beginBackgroundPlaybackLease(
  controls: BackgroundPlaybackTransportControls | null = null,
): BackgroundPlaybackLeaseStart {
  if (Platform.OS === "web" || !isBackgroundPlaybackEnabled()) {
    return { token: null, ready: Promise.resolve(false) };
  }

  const token = Symbol("background-playback");
  owners.set(token, controls);
  if (!keepalivePlayer && (!activationPromise || activationGeneration !== generation)) {
    const expectedGeneration = generation;
    activationGeneration = expectedGeneration;
    const currentActivation = activate(expectedGeneration).finally(() => {
      if (activationPromise === currentActivation) {
        activationPromise = null;
        activationGeneration = -1;
      }
    });
    activationPromise = currentActivation;
  }
  return {
    token,
    ready: activationPromise ?? Promise.resolve(Boolean(keepalivePlayer)),
  };
}

export function endBackgroundPlaybackLease(token: BackgroundPlaybackLease | null): void {
  if (!token || !owners.delete(token)) return;
  if (owners.size > 0) return;
  generation += 1;
  stopKeepalive();
  logger.info("[background-playback] continuous native lease released");
}

/** Invalidate ownerless background work before a sparse-output handoff.
 * Active owners (including independent Score playback) remain untouched.
 */
export function releaseDormantBackgroundPlaybackControls(): void {
  if (owners.size > 0) return;
  generation += 1;
  stopKeepalive();
}

export function _resetBackgroundPlaybackLeaseForTests(): void {
  owners.clear();
  generation += 1;
  activationPromise = null;
  activationGeneration = -1;
  stopKeepalive();
}

export function _backgroundPlaybackLeaseDebugState() {
  return {
    ownerCount: owners.size,
    hasKeepalivePlayer: keepalivePlayer !== null,
    activationPending: activationPromise !== null,
  };
}
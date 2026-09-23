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
let keepaliveStatusSubscription: { remove: () => void } | null = null;
let activationPromise: Promise<boolean> | null = null;
let activationGeneration = -1;
let generation = 0;
let remotePauseInProgress = false;
let dormantRemoteControls: BackgroundPlaybackTransportControls | null = null;
let acceptsRemoteStatus = false;
let lastKeepalivePlaying = false;
let acceptsRemoteStatusAt = 0;

// A freshly created native player can report a spurious transient
// playing=false (or true) status right around creation — the same class of
// instability documented in android-audio-focus.ts's focus probe
// (.agents/memory/android-focus-probe-stabilization.md). Unlike that probe's
// noisy periodic polling, a genuine remote MediaSession command is a single
// deliberate event and must stay instant, so this cannot be a multi-sample
// debounce — it only needs to ignore status flips in the brief window right
// after (re)activation. Without this guard, a spurious flip right after
// activate() calls controls.pause()/resume() (mapped to togglePlayPause),
// which stops/restarts real playback, which re-activates a new keepalive
// player, which can flip again — a self-sustaining loop that starves the
// heap via repeated MediaSession/AudioTrack churn (2026-09-24 실기기에서
// 7초 안에 OOM 크래시 반복 확인됨).
const REMOTE_STATUS_GRACE_MS = 500;

function currentTransportControls(): BackgroundPlaybackTransportControls | null {
  const controls = [...owners.values()].filter(
    (value): value is BackgroundPlaybackTransportControls => value !== null,
  );
  return controls.at(-1) ?? dormantRemoteControls;
}

function settleRemoteCommand(result: unknown, onFailure: () => void): void {
  Promise.resolve(result)
    .then((accepted) => {
      if (accepted === false) onFailure();
    })
    .catch((error) => {
      logger.warn("[background-playback] remote transport command failed:", error);
      onFailure();
    });
}

function handleKeepaliveStatus(playing: boolean): void {
  if (!acceptsRemoteStatus || playing === lastKeepalivePlaying) return;
  if (Date.now() - acceptsRemoteStatusAt < REMOTE_STATUS_GRACE_MS) return;
  lastKeepalivePlaying = playing;
  const controls = currentTransportControls();
  if (!controls) return;

  if (!playing && controls.isPlaying()) {
    remotePauseInProgress = true;
    dormantRemoteControls = controls;
    let result: unknown;
    try {
      result = controls.pause();
    } finally {
      remotePauseInProgress = false;
    }
    settleRemoteCommand(result, stopKeepalive);
  } else if (playing && !controls.isPlaying()) {
    dormantRemoteControls = null;
    settleRemoteCommand(controls.resume(), stopKeepalive);
  }
}

function disposePlayer(player: AudioPlayer | null): void {
  if (player) {
    acceptsRemoteStatus = false;
    keepaliveStatusSubscription?.remove();
    keepaliveStatusSubscription = null;
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
    if (Platform.OS === "android") {
      // expo-audio starts AudioControlsService as a mediaPlayback foreground
      // service only when a player is active for lock-screen controls.
      player.setActiveForLockScreen(true, {
        title: "Metronome",
        artist: "Continuous background playback",
      }, {
        showSeekBackward: false,
        showSeekForward: false,
      });
      keepaliveStatusSubscription = player.addListener(
        "playbackStatusUpdate",
        (status) => handleKeepaliveStatus(status.playing),
      );
    }
    const accepted = await safePlayAndConfirm(player, "background.keepalive");
    if (!accepted || owners.size === 0 || generation !== expectedGeneration) {
      disposePlayer(player);
      player = null;
      if (owners.size === 0) relinquishForegroundPlayback(ACTIVE_PLAYBACK_OWNER);
      return false;
    }
    keepalivePlayer = player;
    lastKeepalivePlaying = true;
    acceptsRemoteStatus = Platform.OS === "android";
    acceptsRemoteStatusAt = Date.now();
    player = null;
    logger.info("[background-playback] continuous native lease activated");
    return true;
  } catch (error) {
    disposePlayer(player);
    if (owners.size === 0) relinquishForegroundPlayback(ACTIVE_PLAYBACK_OWNER);
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
  dormantRemoteControls = null;
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
  if (remotePauseInProgress && keepalivePlayer) {
    // Preserve the active MediaSession after a system Pause so its Play command
    // can resume the real transport. A normal in-app pause still fully releases.
    return;
  }
  generation += 1;
  dormantRemoteControls = null;
  stopKeepalive();
  logger.info("[background-playback] continuous native lease released");
}

export function _resetBackgroundPlaybackLeaseForTests(): void {
  owners.clear();
  generation += 1;
  activationPromise = null;
  activationGeneration = -1;
  remotePauseInProgress = false;
  dormantRemoteControls = null;
  stopKeepalive();
}

export function _backgroundPlaybackLeaseDebugState() {
  return {
    ownerCount: owners.size,
    hasKeepalivePlayer: keepalivePlayer !== null,
    activationPending: activationPromise !== null,
  };
}
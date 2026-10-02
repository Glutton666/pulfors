/** Android background ownership uses a plain foreground service, never a
 * MediaSession. Existing audible and true-silence players remain unchanged.
 */

import { Platform } from "react-native";
import { logger } from "./logger";
import { applyAudioModeIfChanged } from "./audio-mode-cache";
import type { AudioPlayer } from "expo-audio";
import { BackgroundPlaybackService } from "@/modules/sparse-metronome/src";

/**
 * 포그라운드 서비스 활성 여부를 추적합니다.
 * 중복 호출 시 setAudioModeAsync 재실행을 방지합니다.
 */
let isForegroundActive = false;
const foregroundOwners = new Set<string>();
let activationPromise: Promise<void> | null = null;
let nativeForegroundToken: string | null = null;
let foregroundGeneration = 0;
let pausedNotificationPlayer: AudioPlayer | null = null;
let pausedNotificationGeneration = 0;
let pausedNotificationOwner: string | null = null;
let pausedNotificationActivationPromise: Promise<void> | null = null;

/**
 * 정지 알림의 재생 액션을 앱 화면 없이 받을 수 있도록 무음 AudioPlayer로
 * 일반 포그라운드 서비스를 유지한다. 실제 무음 WAV를 사용해 volume 적용 레이스에도
 * 소리가 새어 나오지 않는다.
 */
export async function holdForegroundForPausedNotification(): Promise<void> {
  if (Platform.OS !== "android" || pausedNotificationPlayer) return;
  if (pausedNotificationActivationPromise) return pausedNotificationActivationPromise;

  const generation = ++pausedNotificationGeneration;
  const owner = `paused-notification:${generation}`;
  pausedNotificationOwner = owner;
  const activation = (async () => {
    try {
      await requestForegroundPlayback(owner);
    } catch (error) {
      if (pausedNotificationOwner === owner) {
        pausedNotificationOwner = null;
        relinquishForegroundPlayback(owner);
      }
      throw error;
    }
    // releasePausedNotificationHold() can invalidate this acquire while audio
    // mode activation is pending. Never create a player for an obsolete hold.
    if (generation !== pausedNotificationGeneration || pausedNotificationOwner !== owner) return;

    let player: AudioPlayer | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createAudioPlayer } = require("expo-audio") as typeof import("expo-audio");
      player = createAudioPlayer(
        require("@/assets/sounds/silence.wav"),
        { updateInterval: 10_000 },
      );
      player.loop = true;
      player.volume = 0;
      player.play();
      if (generation !== pausedNotificationGeneration || pausedNotificationOwner !== owner) {
        try { player.pause(); } catch {}
        try { player.release(); } catch {}
        relinquishForegroundPlayback(owner);
        return;
      }
      pausedNotificationPlayer = player;
      logger.info("[foreground-service] paused notification hold started");
    } catch (e) {
      try { player?.pause(); } catch {}
      try { player?.release(); } catch {}
      if (pausedNotificationOwner === owner) {
        pausedNotificationOwner = null;
        relinquishForegroundPlayback(owner);
      }
      logger.warn("[foreground-service] paused notification hold failed:", e);
    }
  })().finally(() => {
    // An old activation can settle after a fresh acquire has started.
    if (pausedNotificationActivationPromise === activation) {
      pausedNotificationActivationPromise = null;
    }
  });
  pausedNotificationActivationPromise = activation;
  return activation;
}

export function releasePausedNotificationHold(): void {
  pausedNotificationGeneration += 1;
  const owner = pausedNotificationOwner;
  pausedNotificationOwner = null;
  // Do not let a subsequent acquire dedupe against the canceled activation.
  pausedNotificationActivationPromise = null;
  const player = pausedNotificationPlayer;
  pausedNotificationPlayer = null;
  if (player) {
    try { player.pause(); } catch {}
    try { player.release(); } catch {}
  }
  // The owner exists as soon as acquire starts, even when no player has been
  // created yet. Always remove it; relinquish preserves other active owners.
  if (owner) relinquishForegroundPlayback(owner);
  if (player || owner) logger.info("[foreground-service] paused notification hold released");
}

/** Acquire a shared, acknowledged non-MediaSession foreground hold. */
export async function requestForegroundPlayback(owner = "legacy"): Promise<void> {
  if (Platform.OS !== "android") return;
  foregroundOwners.add(owner);
  if (isForegroundActive) return;
  if (!activationPromise) {
    const token = `background-playback:${Date.now()}:${++foregroundGeneration}`;
    nativeForegroundToken = token;
    const activation = (async () => {
      // Match the Android focus probe to avoid audio-mode/AudioTrack races.
      await applyAudioModeIfChanged({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: "mixWithOthers",
        shouldPlayInBackground: true,
      });
      if (nativeForegroundToken !== token || foregroundOwners.size === 0) return;
      await BackgroundPlaybackService.acquire(token);
      if (nativeForegroundToken !== token || foregroundOwners.size === 0) {
        await BackgroundPlaybackService.release(token);
        return;
      }
      isForegroundActive = true;
      logger.info("[foreground-service] non-MediaSession foreground hold activated");
    })();
    const currentActivation = activation.finally(() => {
      if (activationPromise === currentActivation) activationPromise = null;
    });
    activationPromise = currentActivation;
  }
  const expectedGeneration = foregroundGeneration;
  try {
    await activationPromise;
  } catch (error) {
    if (foregroundGeneration === expectedGeneration) relinquishForegroundPlayback(owner);
    logger.warn("[foreground-service] requestForegroundPlayback failed:", error);
    throw error;
  }
}

/** Release only after the last owner leaves; invalidate pending acquisitions. */
export function relinquishForegroundPlayback(owner = "legacy"): void {
  if (Platform.OS !== "android") return;
  foregroundOwners.delete(owner);
  if (foregroundOwners.size > 0) return;
  const token = nativeForegroundToken;
  nativeForegroundToken = null;
  foregroundGeneration += 1;
  activationPromise = null;
  isForegroundActive = false;
  if (token) {
    void BackgroundPlaybackService.release(token).catch((error) => {
      logger.warn("[foreground-service] foreground hold release failed:", error);
    });
  }
}

export function _foregroundPlaybackDebugState() {
  return {
    isForegroundActive,
    owners: [...foregroundOwners],
    activationPending: activationPromise !== null,
  };
}

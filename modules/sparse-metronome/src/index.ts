import { requireOptionalNativeModule } from 'expo-modules-core';

export type SparseClipDescriptor = {
  /** Stable identifier unique within a prepared session. */
  id: string;
  /** A file:// URI under this app's private files/cache/no-backup directories. */
  uri: string;
  /** Frame offset within the complete rendered loop (44.1 kHz). */
  startFrame: number;
  /** PCM frames in this segment; the WAV must be exactly this long at 44.1 kHz. */
  durationFrames: number;
  /**
   * Optional pair for an interval crossing the loop boundary. Supply one head
   * at frame 0 and one tail ending at periodFrames, with matching group ids.
   */
  wrapGroupId?: string;
  wrapRole?: 'head' | 'tail';
};

export type SparseSessionAck = {
  sessionId: string;
  status: 'prepared' | 'started' | 'replacementScheduled' | 'stopped';
  /** Present for started; exact decimal elapsedRealtimeNanos anchor for the first loop frame. */
  startElapsedRealtimeNanos?: string;
  /** Present for replacementScheduled; Android elapsedRealtimeNanos clock. */
  nextBoundaryElapsedRealtimeNanos?: string;
};

export type SparseMetronomeErrorEvent = {
  code: string;
  message: string;
  sessionId?: string;
};

export type SparseMetronomeInterruptionEvent = {
  reason: 'audioFocusLoss';
  sessionId: string;
};

export type SparseMetronomeReplacementEvent = {
  previousSessionId: string;
  sessionId: string;
  boundaryElapsedRealtimeNanos: string;
};

/** Recoverable schedule delay; skipped clips/cycles do not stop playback. */
export type SparseMetronomeTimingOverrunEvent = {
  code: 'SCHEDULE_OVERRUN';
  message: string;
  sessionId: string;
};

type NativeSparseMetronome = {
  prepare(
    sessionId: string,
    clipDescriptors: SparseClipDescriptor[],
    periodFrames: number,
  ): Promise<SparseSessionAck>;
  start(sessionId: string): Promise<SparseSessionAck>;
  replace(nextBoundary: { sessionId: string }): Promise<SparseSessionAck>;
  stop(sessionId: string): Promise<SparseSessionAck>;
  addListener(
    eventName: 'onError',
    listener: (event: SparseMetronomeErrorEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onInterruption',
    listener: (event: SparseMetronomeInterruptionEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onSessionReplaced',
    listener: (event: SparseMetronomeReplacementEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onTimingOverrun',
    listener: (event: SparseMetronomeTimingOverrunEvent) => void,
  ): { remove(): void };
};

const nativeModule = requireOptionalNativeModule<NativeSparseMetronome>('SparseMetronome');

/** True when this runtime includes the Android native module (false in Expo Go without a custom native build). */
export const isSparseMetronomeAvailable = nativeModule !== null;

const unsupported = async (): Promise<never> => {
  throw new Error(
    'SparseMetronome native module is unavailable in this runtime. Check isSparseMetronomeAvailable and choose an explicit compatibility path.',
  );
};

/**
 * Best-effort sparse clip scheduler. Clips are preloaded with SoundPool and
 * triggered from a native HandlerThread against elapsedRealtimeNanos. Android
 * mixer/device latency is variable; this API does not promise sample-exact
 * timing or that the hardware DAC is idle between clips.
 *
 * The module lookup is optional, so importing this API is safe in Expo Go and
 * on unsupported platforms. Check `isSparseMetronomeAvailable` before choosing
 * an explicit compatibility path. On Android 13+, denying POST_NOTIFICATIONS
 * does not prevent foreground-service playback: Android may omit its drawer
 * notification while still showing the service in system Task Manager. The
 * service always attempts `startForeground`; actual startup failures reject
 * the command with `FOREGROUND_SERVICE_START_FAILED`.
 *
 * Limits: up to 256 clip segments and 32 concurrent SoundPool streams per
 * session, <=1 MiB per WAV, 16 MiB total across prepared/retiring WAV files,
 * a loop of at most one hour at 44.1 kHz, and at most two loaded sessions.
 * Empty (all-silent) loops are valid: the service maintains the clock and
 * notification without submitting audio. Wrapping intervals are supplied as
 * a head at frame 0 and a tail ending at periodFrames.
 * Segments may not cross a loop boundary.
 * Clips more than 50 ms overdue are skipped rather than burst-played. Duration
 * is caller supplied and must match the WAV frame count; SoundPool/device
 * playback duration remains best-effort. Over-limit preparation rejects with
 * explicit size/interval errors and never falls back to another audio backend.
 * Recoverable scheduling delays are emitted through the separate
 * `onTimingOverrun` listener, not the fatal `onError` channel.
 * Old samples remain loaded through
 * their declared tail duration plus a 150 ms cleanup grace after replacement.
 * Native monotonic timestamps are decimal strings to avoid JS Number precision
 * loss; convert with BigInt when needed.
 */
export const SparseMetronome = {
  prepare(
    sessionId: string,
    clipDescriptors: SparseClipDescriptor[],
    periodFrames: number,
  ): Promise<SparseSessionAck> {
    if (!nativeModule) return unsupported();
    return nativeModule.prepare(sessionId, clipDescriptors, periodFrames);
  },

  start(sessionId: string): Promise<SparseSessionAck> {
    if (!nativeModule) return unsupported();
    return nativeModule.start(sessionId);
  },

  /** Schedule an already prepared session to replace the active one at its next loop boundary. */
  replace(nextBoundary: { sessionId: string }): Promise<SparseSessionAck> {
    if (!nativeModule) return unsupported();
    return nativeModule.replace(nextBoundary);
  },

  stop(sessionId: string): Promise<SparseSessionAck> {
    if (!nativeModule) return unsupported();
    return nativeModule.stop(sessionId);
  },
};

export function addSparseMetronomeErrorListener(
  listener: (event: SparseMetronomeErrorEvent) => void,
) {
  return nativeModule?.addListener('onError', listener);
}

export function addSparseMetronomeInterruptionListener(
  listener: (event: SparseMetronomeInterruptionEvent) => void,
) {
  return nativeModule?.addListener('onInterruption', listener);
}

export function addSparseMetronomeReplacementListener(
  listener: (event: SparseMetronomeReplacementEvent) => void,
) {
  return nativeModule?.addListener('onSessionReplaced', listener);
}

export function addSparseMetronomeTimingOverrunListener(
  listener: (event: SparseMetronomeTimingOverrunEvent) => void,
) {
  return nativeModule?.addListener('onTimingOverrun', listener);
}
import { requireOptionalNativeModule } from 'expo-modules-core';

export type SparseClipDescriptor = {
  /** Stable event identifier unique within a prepared session. */
  id: string;
  /** A file:// URI under this app's private files/cache/no-backup directories; unique samples may reuse it. */
  uri: string;
  /** Event frame offset within a loop (44.1 kHz). */
  startFrame: number;
  /** PCM frames in this event; may extend across loop boundaries and must match the WAV's exact frame count. */
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
  /** Present for started; elapsedRealtimeNanos anchor for the first loop frame, scheduled 120 ms ahead. */
  startElapsedRealtimeNanos?: string;
  /** Android wall-clock estimate corresponding to startElapsedRealtimeNanos. */
  startWallClockTimeMillis?: number;
  /** Present for replacementScheduled; next loop boundary in Android elapsedRealtimeNanos. */
  nextBoundaryElapsedRealtimeNanos?: string;
  /** Android wall-clock estimate corresponding to nextBoundaryElapsedRealtimeNanos. */
  nextBoundaryWallClockTimeMillis?: number;
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
  /** Android wall-clock estimate corresponding to boundaryElapsedRealtimeNanos. */
  boundaryWallClockTimeMillis?: number;
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
 * Best-effort sparse PCM WAV event scheduler. Unique WAV URIs are prepared
 * once per session and may be reused by multiple event descriptors; each
 * descriptor keeps its own start frame and duration. Android MediaPlayer
 * voices are started by a native HandlerThread against elapsedRealtimeNanos.
 * Android mixer/device latency is variable; this API does not promise
 * sample-exact output timing or that the hardware audio path/DAC is idle
 * between events.
 *
 * The module lookup is optional, so importing this API is safe in Expo Go and
 * on unsupported platforms. Check `isSparseMetronomeAvailable` before choosing
 * an explicit compatibility path. On Android 13+, denying POST_NOTIFICATIONS
 * does not prevent foreground-service playback: Android may omit its drawer
 * notification while still showing the service in system Task Manager. The
 * service always attempts `startForeground`; actual startup failures reject
 * the command with `FOREGROUND_SERVICE_START_FAILED`.
 *
 * Limits: up to 256 event descriptors, 32 required overlapping playback
 * voices per session, <=128 MiB per PCM16 WAV, 256 MiB total unique WAV files
 * across prepared/retiring sessions, an event duration of at most 30 minutes,
 * a loop of at most one hour at 44.1 kHz, and at most two loaded sessions.
 * WAVs must be mono/stereo 16-bit integer PCM at 44.1 kHz and their frame
 * counts must exactly match durationFrames. A repeated URI must declare the
 * same durationFrames on every descriptor. Durations may cross any number of
 * loop boundaries; the service prepares enough voices to preserve overlaps.
 * Unsupported WAVs, size/voice limits, and decoder failures reject explicitly.
 * Empty (all-silent) loops are valid: the service maintains the clock and
 * general foreground-service notification without submitting audio. This
 * module does not create a MediaSession or media notification card. Legacy
 * wrapping head/tail descriptors remain accepted.
 * Clips more than 50 ms overdue are skipped rather than burst-played. Duration
 * is caller supplied and validated against the WAV frame count; Android
 * decoder/device playback duration remains best-effort. Over-limit preparation
 * rejects with explicit size/interval errors and never falls back to a
 * continuous/silent audio backend.
 * Recoverable scheduling delays are emitted through the separate
 * `onTimingOverrun` listener, not the fatal `onError` channel.
 * `startElapsedRealtimeNanos` is a future first-frame scheduling anchor with a
 * 120 ms lead, so JS can receive the acknowledgement before that frame is
 * scheduled to run. Its paired wall-clock estimate (and the corresponding
 * replacement-boundary pair) can correlate Android monotonic times with JS
 * wall/performance clocks; wall-clock changes still apply.
 * Old samples remain loaded through their declared tail duration plus a 150 ms
 * cleanup grace after replacement.
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
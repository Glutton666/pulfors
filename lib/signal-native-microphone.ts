import type { AudioRecorder } from "react-native-audio-api";
import { acquireAudioSession, releaseAudioSession } from "./audio-session";
import { logger } from "./logger";

export class NativeMicrophoneUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Native microphone backend is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "NativeMicrophoneUnavailableError";
  }
}

let sessionSerial = 0;
let captureTail: Promise<void> = Promise.resolve();

/** One capture lifetime, with float PCM and the hardware's actual sample rate.
 * Import the JSI backend only on demand: a missing binary must not crash boot.
 * The legacy react-native-audio-record module intentionally stays unlinked. */
export function createNativeMicrophone(
  onSamples: (samples: Float32Array, sampleRate: number) => void,
  onError: (error: Error) => void,
) {
  const owner = `signal-microphone-${++sessionSerial}`;
  let recorder: AudioRecorder | null = null;
  let cancelled = false;
  let hasLease = false;
  let startup: Promise<boolean> | null = null;
  let teardown: Promise<void> | null = null;
  let releaseCaptureTurn: (() => void) | null = null;

  const removeCallbacks = () => {
    try { recorder?.clearOnAudioReady(); } catch {}
    try { recorder?.clearOnError(); } catch {}
  };
  const dispose = (): Promise<void> => {
    if (teardown) return teardown;
    teardown = (async () => {
      removeCallbacks();
      try { await recorder?.stop(); }
      catch (error) { logger.warn("[SignalMic] Recorder cleanup failed", error); }
      if (hasLease) {
        hasLease = false;
        try { await releaseAudioSession(owner); }
        catch (error) { logger.warn("[SignalMic] Session release failed", error); }
      }
      releaseCaptureTurn?.();
      releaseCaptureTurn = null;
    })();
    return teardown;
  };
  const stop = () => {
    cancelled = true;
    removeCallbacks();
    // A stop before native start settles must also stop the late completion.
    // Keep this lifetime's session lease until its recorder has really stopped.
    if (startup) void startup.catch(() => false).then(dispose);
    else void dispose();
  };
  const run = async (): Promise<boolean> => {
    try {
      if (cancelled) return false;
      // Serialize native ownership through stop completion, not just JS state.
      // An old pending start/stop must not detach a newly started input node.
      const previousCapture = captureTail;
      captureTail = new Promise<void>((resolve) => { releaseCaptureTurn = resolve; });
      await previousCapture;
      if (cancelled) return false;
      let api: typeof import("react-native-audio-api");
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        api = require("react-native-audio-api") as typeof import("react-native-audio-api");
        recorder = new api.AudioRecorder();
      } catch (error) {
        throw new NativeMicrophoneUnavailableError(error);
      }
      // The shared session manager preserves other playback owners and returns
      // iOS from record-enabled mode only after all microphone users release.
      hasLease = true;
      await acquireAudioSession(owner, "mic");
      if (cancelled) return false;
      // Audio API's iOS engine also activates its own desired session category.
      // Match the shared record-enabled session rather than its playback default.
      api.AudioManager.setAudioSessionOptions({
        iosCategory: "playAndRecord",
        iosMode: "measurement",
        iosOptions: ["defaultToSpeaker", "mixWithOthers", "allowBluetoothHFP"],
      });
      recorder.onError((event) => {
        if (cancelled) return;
        stop();
        onError(new Error(event.message));
      });
      const callbackResult = recorder.onAudioReady({
        sampleRate: 44100, bufferLength: 2048, channelCount: 1,
      }, (event) => {
        if (cancelled) return;
        try {
          const buffer = event.buffer;
          const samples = buffer.getChannelData(0);
          if (!samples.length || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0) return;
          onSamples(samples, buffer.sampleRate);
        } catch (error) {
          stop();
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      });
      if (callbackResult.status === "error") throw new Error(callbackResult.message);
      const result = await recorder.start();
      if (result.status === "error") throw new Error(result.message);
      return !cancelled;
    } catch (error) {
      if (cancelled) return false;
      cancelled = true;
      await dispose();
      throw error;
    } finally {
      if (cancelled) await dispose();
    }
  };
  return {
    start(): Promise<boolean> {
      if (!startup) startup = run();
      return startup;
    },
    stop,
  };
}

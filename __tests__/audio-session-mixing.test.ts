/**
 * @jest-environment jsdom
 */

import { Platform } from "react-native";
import {
  _resetAudioSessionForTests,
  acquireAudioSession,
  registerMetronomeBridge,
  releaseAudioSession,
} from "@/lib/audio-session";
import { applyAudioModeIfChanged } from "@/lib/audio-mode-cache";

jest.mock("@/lib/audio-mode-cache", () => ({
  applyAudioModeIfChanged: jest.fn().mockResolvedValue(undefined),
  _resetAudioModeCacheForTests: jest.fn(),
}));

describe("audio session mixing", () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    Platform.OS = "ios";
    _resetAudioSessionForTests();
    jest.clearAllMocks();
  });

  afterAll(() => {
    Platform.OS = originalPlatform;
  });

  it.each(["recording", "mic"] as const)(
    "keeps metronome playback running when a %s session starts",
    async (mode) => {
      const pause = jest.fn();
      const resume = jest.fn();
      registerMetronomeBridge({
        isRunning: () => true,
        pause,
        resume,
      });

      await acquireAudioSession(`test-${mode}`, mode);

      expect(pause).not.toHaveBeenCalled();
      expect(applyAudioModeIfChanged).toHaveBeenLastCalledWith({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: "mixWithOthers",
        shouldPlayInBackground: false,
      });

      await releaseAudioSession(`test-${mode}`);
      expect(resume).not.toHaveBeenCalled();
    },
  );
});
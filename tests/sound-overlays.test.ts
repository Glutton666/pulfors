import { mixOverlayPCM, overlaySoundSet, sanitizeSoundSetOverlays } from "@/lib/sound-overlays";
import { createAudioToneSnapshot } from "@/lib/audio-tone-snapshot";
import { buildPlaybackPlan } from "@/lib/audio-playback-plan";

describe("direct click overlays", () => {
  it("rejects self, voice, unknown and missing user sets", () => {
    expect(sanitizeSoundSetOverlays({ classic: "classic", tempo: "en", cowbell: "custom1", woodblock: "tempo" },
      ["classic", "tempo", "cowbell", "woodblock"])).toEqual({ woodblock: "tempo" });
  });
  it("links only one level even when other bases also have links", () => {
    const links = { classic: "woodblock", woodblock: "tempo", tempo: "classic" } as const;
    expect(overlaySoundSet(links, "classic")).toBe("woodblock");
    expect(overlaySoundSet(links, "woodblock")).toBe("tempo");
    const a = new Float32Array([0.1, 0.2]); const b = new Float32Array([0.3, 0.4, 0.1]);
    expect(Array.from(mixOverlayPCM(a, b))).toEqual([expect.closeTo(0.28), expect.closeTo(0.42), expect.closeTo(0.07)]);
    expect(Array.from(a)).toEqual([expect.closeTo(0.1), expect.closeTo(0.2)]);
  });
  it("snapshots links and count language before asynchronous preparation", () => {
    const overlays = { classic: "tempo" as const };
    const snapshot = createAudioToneSnapshot({ volume: 0.5, defaultSoundSet: "classic", overlays, voiceCountLanguage: "ko" });
    delete (overlays as any).classic;
    expect(Object.isFrozen(snapshot.overlays)).toBe(true);
    expect(snapshot.overlays).toEqual({ classic: "tempo" });
    expect(snapshot.voiceCountLanguage).toBe("ko");
  });
  const audio = (tone: ReturnType<typeof createAudioToneSnapshot>) => ({
    tone, soundSet: "classic" as const, sampleVolume: 1, customSoundSets: {}, noteSamples: {}, noteSampleChannels: {},
    noteSampleVolumes: {}, noteSampleSpeeds: {}, metronomeChannel: "both" as const, noteSampleMetroChannels: {}, layerSoundSets: {},
  });
  it("uses the existing rendered backend for optional speech/overlays, plain click remains realtime", () => {
    const make = (extras: Parameters<typeof createAudioToneSnapshot>[0]) => buildPlaybackPlan({
      mode: "beat", platform: "web", bpm: 120, audio: audio(createAudioToneSnapshot(extras)),
      config: { beatsPerMeasure: 4, beatTypes: ["strong", "normal", "normal", "normal"], beatSubdivisions: {},
        noteSamples: {}, noteSampleNames: {}, noteSampleSources: {}, noteSampleChannels: {} },
    });
    expect(make({ volume: 1, defaultSoundSet: "classic" }).output.strategy).toBe("realtime");
    expect(make({ volume: 1, defaultSoundSet: "classic", voiceCountLanguage: "ko" }).output.strategy).toBe("prerender");
    expect(make({ volume: 1, defaultSoundSet: "classic", overlays: { classic: "tempo" } }).output.strategy).toBe("prerender");
    expect(make({ volume: 1, defaultSoundSet: "classic", overlays: { woodblock: "tempo" } }).output.strategy).toBe("realtime");
  });
});

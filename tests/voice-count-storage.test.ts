import { loadSettings, saveSettings, saveCustomSoundSets, type MetronomeSettings } from "@/lib/storage";
const storage = require("./_stubs/async-storage");
const builtin = (sourceRole: "strong" | "high" | "low") => ({ type: "builtin" as const, sourceSet: "classic" as const, sourceRole, duration: 0.1 });
beforeEach(() => storage.__reset());
describe("sound enhancements persist with safe legacy and deletion handling", () => {
  it("defaults to count off and zero overlays in old settings", async () => {
    await storage.setItem("metronome_settings", JSON.stringify({ bpm: 120 }));
    const settings = await loadSettings();
    expect(settings.voiceCountLanguage).toBe("off");
    expect(settings.soundSetOverlays).toEqual({});
  });
  it("roundtrips Tempo, Korean count, direct links and independent tone positions", async () => {
    await saveCustomSoundSets({ custom1: { name: "My click", strong: builtin("strong"), accent: builtin("high"), normal: builtin("low") } });
    await saveSettings({ bpm: 120, beatsPerMeasure: 4, subdivisions: 1, soundSet: "tempo",
      voiceCountLanguage: "ko", soundSetOverlays: { classic: "custom1", woodblock: "tempo", tempo: "classic" },
      soundSetTonePositions: { tempo: { x: 0.6, y: -0.7 }, classic: { x: -0.2, y: 0.4 } },
    } as MetronomeSettings);
    const settings = await loadSettings();
    expect(settings.soundSet).toBe("tempo");
    expect(settings.voiceCountLanguage).toBe("ko");
    expect(settings.soundSetOverlays).toEqual({ classic: "custom1", woodblock: "tempo", tempo: "classic" });
    expect(settings.soundSetTonePositions).toEqual({ tempo: { x: 0.6, y: -0.7 }, classic: { x: -0.2, y: 0.4 } });
    // The same serialized settings value is backed up generically by storage.
    const exported = await storage.getItem("metronome_settings");
    storage.__reset(); await storage.setItem("metronome_settings", exported);
    expect((await loadSettings()).soundSetOverlays).toEqual({ woodblock: "tempo", tempo: "classic" });
  });
  it("drops deleted custom sources and malformed/self/non-click links on restore", async () => {
    await storage.setItem("metronome_settings", JSON.stringify({ voiceCountLanguage: "zz",
      soundSetOverlays: { classic: "custom1", custom1: "tempo", tempo: "tempo", woodblock: "ko", digital: "classic" } }));
    const settings = await loadSettings();
    expect(settings.voiceCountLanguage).toBe("off");
    expect(settings.soundSetOverlays).toEqual({ digital: "classic" });
  });
});

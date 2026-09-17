import {
  applyMetronomePlaybackPlan,
  buildPlaybackPlan,
  buildPolygonPlaybackPlan,
  buildScorePlaybackPlan,
} from "@/lib/audio-playback-plan";
import { createAudioToneSnapshot } from "@/lib/audio-tone-snapshot";

const audio = {
  soundSet: "classic" as const,
  tone: createAudioToneSnapshot({
    volume: 0.75,
    defaultSoundSet: "classic",
  }),
  sampleVolume: 0.8,
  customSoundSets: {},
  noteSamples: { "0-0": "file:///sample.wav" },
  noteSampleChannels: { "0-0": "left" as const },
  noteSampleVolumes: { "0-0": 0.5 },
  noteSampleSpeeds: { "0-0": 1.25 },
  metronomeChannel: "both" as const,
  noteSampleMetroChannels: {},
  layerSoundSets: {},
};

const dialConfig = {
  beatsPerMeasure: 4,
  beatTypes: ["strong", "normal", "normal", "normal"] as const,
  beatSubdivisions: { "1": ["normal", "accent"] },
};

describe("audio playback plans", () => {
  test("uses discriminated mode-specific playback units", () => {
    const beat = buildPlaybackPlan({
      mode: "beat",
      platform: "web",
      bpm: 120,
      audio,
      config: dialConfig as any,
      createdAtMs: 1,
    });
    const bar = buildPlaybackPlan({
      mode: "bar",
      platform: "web",
      bpm: 100,
      audio,
      config: {
        beatTypes: ["strong"],
        beatSubdivisions: {},
        barRepeats: {},
        loopBlocks: [],
        blockPlayMode: "loop",
      } as any,
      denominator: 4,
      startBeat: 2,
      blockPlayMode: "loop",
      createdAtMs: 2,
    });
    const note = buildPlaybackPlan({
      mode: "note",
      platform: "native",
      bpm: 90,
      audio,
      stopAfterMeasure: true,
      createdAtMs: 3,
    });

    expect(beat.unit.kind).toBe("meter");
    expect(bar.unit).toMatchObject({ kind: "bars", startBeat: 2, denominator: 4 });
    expect(note.unit).toEqual({ kind: "configured-entry", stopAfterMeasure: true });
  });

  test("chooses output strategy from the start snapshot", () => {
    const realtime = buildPlaybackPlan({
      mode: "beat",
      platform: "web",
      bpm: 120,
      audio,
      config: dialConfig as any,
    });
    const boosted = buildPlaybackPlan({
      mode: "beat",
      platform: "web",
      bpm: 120,
      audio: {
        ...audio,
        tone: createAudioToneSnapshot({
          volume: 1.2,
          defaultSoundSet: "classic",
        }),
      },
      config: dialConfig as any,
    });
    const bar = buildPlaybackPlan({
      mode: "bar",
      platform: "web",
      bpm: 120,
      audio,
      config: {
        beatTypes: ["strong"],
        beatSubdivisions: {},
        barRepeats: {},
        loopBlocks: [],
        blockPlayMode: "loop",
      } as any,
      denominator: 4,
      blockPlayMode: "loop",
    });

    expect(realtime.output.strategy).toBe("realtime");
    expect(boosted.output).toMatchObject({ strategy: "prerender", boosted: true });
    expect(bar.output.strategy).toBe("prerender");
  });

  test("ignores tone positions for sound sets outside the active plan", () => {
    const plan = buildPlaybackPlan({
      mode: "beat",
      platform: "web",
      bpm: 120,
      audio: {
        ...audio,
        tone: createAudioToneSnapshot({
          volume: 0.75,
          defaultSoundSet: "classic",
          positions: { wood: { x: 1, y: 1 } },
        }),
      },
      config: dialConfig as any,
    });

    expect(plan.output).toMatchObject({
      strategy: "realtime",
      toneShaped: false,
    });
  });

  test("clones mutable UI settings into the active plan", () => {
    const mutableAudio = {
      ...audio,
      noteSamples: { ...audio.noteSamples },
      noteSampleVolumes: { ...audio.noteSampleVolumes },
      customSoundSets: {
        "custom-1": {
          name: "Custom",
          strong: { type: "custom" as const, sampleUri: "file:///strong.wav", duration: 1 },
          accent: { type: "builtin" as const, sourceSet: "classic" as const, sourceRole: "high" as const, duration: 1 },
          normal: { type: "builtin" as const, sourceSet: "classic" as const, sourceRole: "low" as const, duration: 1 },
        },
      },
    };
    const mutableConfig = {
      beatsPerMeasure: 4,
      beatTypes: ["strong", "normal"],
      beatSubdivisions: { "0": ["strong", "normal"] },
      subdivisionPattern: ["accent"],
      noteSamples: { "0-0": "file:///config.wav" },
      noteSampleNames: { "0-0": "Config sample" },
      noteSampleSources: { "0-0": "import" },
      noteSampleChannels: { "0-0": "left" },
      noteSampleVolumes: { "0-0": 0.4 },
      noteSampleSpeeds: { "0-0": 0.8 },
    };
    const plan = buildPlaybackPlan({
      mode: "beat",
      platform: "web",
      bpm: 120,
      audio: mutableAudio,
      config: mutableConfig as any,
    });

    mutableAudio.noteSamples["0-0"] = "file:///changed.wav";
    mutableAudio.noteSampleVolumes["0-0"] = 1;
    mutableAudio.customSoundSets["custom-1"].strong.sampleUri = "file:///changed-strong.wav";
    mutableConfig.beatTypes[0] = "mute";
    mutableConfig.beatSubdivisions["0"][0] = "mute";
    mutableConfig.subdivisionPattern[0] = "mute";
    mutableConfig.noteSamples["0-0"] = "file:///changed-config.wav";
    mutableConfig.noteSampleNames["0-0"] = "Changed";

    expect(plan.mode).toBe("beat");
    if (plan.mode !== "beat") throw new Error("expected Beat plan");
    expect(plan.audio.noteSamples["0-0"]).toBe("file:///sample.wav");
    expect(plan.audio.noteSampleVolumes["0-0"]).toBe(0.5);
    expect(plan.audio.customSoundSets["custom-1"].strong.sampleUri).toBe("file:///strong.wav");
    expect(plan.unit.config.beatTypes[0]).toBe("strong");
    expect(plan.unit.config.beatSubdivisions["0"][0]).toBe("strong");
    expect(plan.unit.config.subdivisionPattern?.[0]).toBe("accent");
    expect(plan.unit.config.noteSamples["0-0"]).toBe("file:///config.wav");
    expect(plan.unit.config.noteSampleNames["0-0"]).toBe("Config sample");
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.unit.config.beatSubdivisions["0"])).toBe(true);
    expect(Object.isFrozen(mutableConfig)).toBe(false);
    expect(Object.isFrozen(mutableConfig.subdivisionPattern)).toBe(false);
    expect(Object.isFrozen(mutableConfig.noteSamples)).toBe(false);
    expect(Object.isFrozen(mutableAudio.customSoundSets["custom-1"].strong)).toBe(false);
  });

  test("keeps Score timeline and Polygon layers as different units", () => {
    const score = buildScorePlaybackPlan({
      documentId: "score-1",
      bpm: 88,
      platform: "native",
      timeline: [{
        seqIdx: 0,
        measureIdx: 0,
        startTimeMs: 0,
        durationMs: 1000,
        effectiveBpm: 88,
        endBpm: 88,
        notes: [],
        isPercussion: false,
        instrumentId: "piano",
      }],
      linkedEntryIds: ["entry-1"],
      muteAudio: false,
    });
    const polygonLayers = [{
      id: "layer-1",
      sides: 3,
      color: "#fff",
      soundSet: "classic",
      role: "high" as const,
      volume: 1,
      offsets: [0, 0, 0],
      beatTypes: ["strong", "normal", "normal"] as const,
    }];
    const polygon = buildPolygonPlaybackPlan({
      bpm: 120,
      platform: "web",
      beatsPerMeasure: 4,
      layers: polygonLayers as any,
      tone: audio.tone,
    });

    expect(score.unit).toMatchObject({ kind: "timeline", documentId: "score-1" });
    expect(polygon.unit).toMatchObject({ kind: "polygon-layers", beatsPerMeasure: 4 });
    polygonLayers[0].offsets[0] = 0.4;
    expect(polygon.unit.layers[0].offsets[0]).toBe(0);
  });

  test("applies Beat and Bar schedule snapshots without owning output", () => {
    const engine = {
      setBeatTypes: jest.fn(),
      setAllBeatSubdivisions: jest.fn(),
      setAllBarRepeats: jest.fn(),
      setLoopBlocks: jest.fn(),
      setBlockPlayMode: jest.fn(),
      setAllBarBpmOverrides: jest.fn(),
      buildScheduleOnly: jest.fn(),
      setBeatsPerMeasure: jest.fn(),
      clearLoopBlocks: jest.fn(),
      clearBarRepeats: jest.fn(),
      clearBarBpmOverrides: jest.fn(),
    };
    const beat = buildPlaybackPlan({
      mode: "beat",
      platform: "web",
      bpm: 120,
      audio,
      config: dialConfig as any,
    });
    applyMetronomePlaybackPlan(engine as any, beat);

    expect(engine.setBeatTypes).toHaveBeenCalledWith(["strong", "normal", "normal", "normal"]);
    expect(engine.clearBarRepeats).toHaveBeenCalledTimes(1);
    expect(engine.clearLoopBlocks).toHaveBeenCalledTimes(1);
    expect(engine.clearBarBpmOverrides).toHaveBeenCalledTimes(1);
    expect(engine.buildScheduleOnly).toHaveBeenCalledTimes(1);
  });
});
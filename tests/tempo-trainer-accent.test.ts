import { MetronomeEngine } from "@/lib/metronome-engine";

it("emits the trainer cue only during active, unmuted playback without changing the pattern", () => {
  jest.useFakeTimers();
  const engine = new MetronomeEngine();
  const high = jest.fn();
  const low = jest.fn();
  const strong = jest.fn();
  engine.setAudioCallbacks(high, low, strong);
  engine.setBeatTypes(["normal", "mute", "accent", "strong"]);
  const before = engine.getScheduleInfo().ticks.map(t => t.type);
  try {
    engine.playTempoChangeAccent();
    expect(strong).not.toHaveBeenCalled();
    engine.start();
    high.mockClear();
    low.mockClear();
    strong.mockClear();
    engine.playTempoChangeAccent();
    expect(strong).toHaveBeenCalledTimes(1);
    expect(high).not.toHaveBeenCalled();
    expect(low).not.toHaveBeenCalled();
    expect(engine.getScheduleInfo().ticks.map(t => t.type)).toEqual(before);
    engine.setBaseClickMuted(true);
    engine.playTempoChangeAccent();
    expect(strong).toHaveBeenCalledTimes(1);
    engine.stop();
    engine.playTempoChangeAccent();
    expect(strong).toHaveBeenCalledTimes(1);
  } finally {
    engine.stop();
    jest.useRealTimers();
  }
});

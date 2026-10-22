import { createRhythmAudioSession } from "../lib/rhythm-lab/audio";
import { prepareScoreAudio, prepareDrumAudio, scheduleMeasureNotes } from "../lib/score-audio";

jest.mock("../lib/score-audio", () => ({
  prepareScoreAudio: jest.fn(async () => undefined),
  prepareDrumAudio: jest.fn(async () => undefined),
  scheduleMeasureNotes: jest.fn(() => jest.fn()),
}));

describe("Rhythm Lab audio ownership", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test("chord replay schedules every note together and retains held lengths", async () => {
    const session = createRhythmAudioSession();
    await session.play([
      { id: "c", timeMs: 0, midi: 60, durationMs: 600 },
      { id: "e", timeMs: 0, midi: 64, durationMs: 300 },
      { id: "g", timeMs: 0, midi: 67, durationMs: 800 },
    ]);
    const notes = jest.mocked(scheduleMeasureNotes).mock.calls[0][0];
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.startOffsetMs)).toEqual([0, 0, 0]);
    expect(notes.map((n) => n.durationMs)).toEqual([600, 300, 800]);
    session.stop();
  });

  test("stop invalidates a preparation that has not completed", async () => {
    let complete!: () => void;
    jest.mocked(prepareDrumAudio).mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    const session = createRhythmAudioSession();
    const started = jest.fn();
    const pending = session.play([{ id: "h", timeMs: 0 }], started);
    session.stop();
    complete();
    await pending;
    expect(scheduleMeasureNotes).not.toHaveBeenCalled();
    expect(started).not.toHaveBeenCalled();
  });

  test("starting a new pass prevents an older preparation from starting later", async () => {
    let complete!: () => void;
    jest.mocked(prepareScoreAudio).mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    const session = createRhythmAudioSession();
    const first = session.play([{ id: "old", timeMs: 0, midi: 60 }]);
    await session.play([{ id: "current", timeMs: 0, midi: 64 }]);
    complete();
    await first;
    expect(scheduleMeasureNotes).toHaveBeenCalledTimes(1);
    expect(jest.mocked(scheduleMeasureNotes).mock.calls[0][0][0].midiNote).toBe(64);
    session.stop();
  });

  test("end callback and scheduled output are cancelled on stop", async () => {
    const done = jest.fn();
    const session = createRhythmAudioSession();
    await session.play([{ id: "h", timeMs: 100, durationMs: 20 }], undefined, done);
    const cleanup = jest.mocked(scheduleMeasureNotes).mock.results[0].value;
    session.stop();
    jest.runAllTimers();
    expect(cleanup).toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });
});

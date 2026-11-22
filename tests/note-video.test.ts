import { formatVideoPosition, nextVideoTick, parseVideoPosition, parseYouTubeVideo, readNoteVideo } from "../lib/note-video";
import { serializeNoteQueueEntries } from "../lib/note-queue-helpers";
import type { PracticeEntry } from "../lib/storage";

describe("Note queue video", () => {
  it("accepts only YouTube links with a valid video ID", () => {
    const id = "dQw4w9WgXcQ";
    expect(parseYouTubeVideo(`https://youtu.be/${id}?t=42`)).toBe(id);
    expect(parseYouTubeVideo(`https://www.youtube.com/watch?v=${id}`)).toBe(id);
    expect(parseYouTubeVideo(`https://m.youtube.com/shorts/${id}`)).toBe(id);
    for (const url of [
      `https://youtube.com.example/watch?v=${id}`, `https://youtube.com@other.test/watch?v=${id}`,
      `http://youtube.com/watch?v=${id}`, "https://youtu.be/short", "javascript:alert(1)",
    ]) expect(parseYouTubeVideo(url)).toBeNull();
  });

  it("round-trips time inputs with seconds or minutes and milliseconds", () => {
    for (const seconds of [0, 9, 42, 60, 62.025, 3660.25]) {
      expect(parseVideoPosition(formatVideoPosition(seconds))).toBe(seconds);
    }
    expect(parseVideoPosition("42.125")).toBe(42.125);
    expect(parseVideoPosition("1:60")).toBeNull();
    expect(parseVideoPosition("0:42.1234")).toBeNull();
    expect(parseVideoPosition("-1")).toBeNull();
  });

  it("copies a video as part of only its queue snapshot and keeps local files off shared imports", () => {
    const config = {
      source: { kind: "file" as const, assetId: "12345678-abcd-abcd-abcd-123456789abc.mp4", name: "take.mp4" },
      startSeconds: 42, firstBeatSeconds: 44, countInMeasures: 1 as const, offsetMs: 25,
    };
    expect(readNoteVideo(config)).toEqual(config);
    expect(readNoteVideo(config, false)).toBeUndefined();
    expect(readNoteVideo({ ...config, offsetMs: 501 })).toBeUndefined();
    expect(readNoteVideo({ ...config, source: { ...config.source, assetId: "../test.mp4" } })).toBeUndefined();
    const entry: PracticeEntry = {
      id: "entry", label: "Beat", createdAt: 0, bpm: 96, beatsPerMeasure: 1, barLoopMode: "once",
      noteVideo: config, beatTypes: ["normal"], beatSubdivisions: {}, barRepeats: {}, subdivisionPattern: [],
    };
    const [snapshot] = serializeNoteQueueEntries([entry]);
    expect(snapshot.noteVideo).toEqual(config);
    expect(snapshot.noteVideo).not.toBe(config);
    expect(snapshot.noteVideo?.source).not.toBe(config.source);
  });

  it("uses the video time, saved bar subdivisions and next pass without replaying elapsed ticks", () => {
    const ticks = [{ time: 0 }, { time: 312.5 }, { time: 625 }, { time: 1100 }];
    expect(nextVideoTick(ticks, 1500, 44010, 42000, true)).toEqual({ index: 0, atMs: 44010 });
    expect(nextVideoTick(ticks, 1500, 44010, 44400, true)).toEqual({ index: 2, atMs: 44635 });
    expect(nextVideoTick(ticks, 1500, 44010, 45510, true)).toEqual({ index: 0, atMs: 45510 });
    expect(nextVideoTick(ticks, 1500, 44010, 45510, false)).toBeNull();
  });
});

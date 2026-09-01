import {
  appendBarRandomItems,
  appendBarRandomPlaybackChunk,
  buildBarRandomDisplayItems,
  createBarRandomSession,
  replayBarRandomSession,
} from "../lib/bar-random-session";

describe("bar random session", () => {
  it("allows duplicates for independent slots", () => {
    const session = createBarRandomSession(3);
    appendBarRandomItems(session, 4, {
      strategy: "independent",
      bundleSize: 2,
      bundleRepeats: 2,
    }, () => 0.4);
    expect(session.order).toEqual([1, 1, 1, 1]);
  });

  it("prevents only consecutive duplicates in no-consecutive mode", () => {
    const values = [0, 0, 0.6, 0.6, 0.1];
    let cursor = 0;
    const session = createBarRandomSession(2);
    appendBarRandomItems(session, 3, {
      strategy: "no-consecutive",
      bundleSize: 2,
      bundleRepeats: 2,
    }, () => values[cursor++] ?? 0.1);
    expect(session.order).toEqual([0, 1, 0]);
  });

  it("uses every source once before refilling a shuffle bag", () => {
    const session = createBarRandomSession(4);
    appendBarRandomItems(session, 8, {
      strategy: "shuffle-bag",
      bundleSize: 2,
      bundleRepeats: 2,
    }, () => 0);
    expect(new Set(session.order.slice(0, 4))).toEqual(new Set([0, 1, 2, 3]));
    expect(new Set(session.order.slice(4, 8))).toEqual(new Set([0, 1, 2, 3]));
  });

  it("keeps the unfinished shuffle bag across queue refills", () => {
    const session = createBarRandomSession(4);
    const config = { strategy: "shuffle-bag" as const, bundleSize: 2, bundleRepeats: 2 };
    appendBarRandomItems(session, 3, config, () => 0);
    appendBarRandomItems(session, 1, config, () => 0);
    expect(new Set(session.order)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("replays a recorded order without mutating the input", () => {
    const order = [2, 0, 2, 1];
    const session = replayBarRandomSession(3, order);
    session.order[0] = 1;
    expect(order).toEqual([2, 0, 2, 1]);
    expect(session.cursor).toBe(0);
  });

  it("plays every source exactly once when random repeat is off", () => {
    const session = createBarRandomSession(4);
    const chunk = appendBarRandomPlaybackChunk(
      session,
      2,
      false,
      { strategy: "independent", bundleSize: 2, bundleRepeats: 2 },
      () => 0,
    );
    expect(chunk).toHaveLength(4);
    expect(new Set(chunk)).toEqual(new Set([0, 1, 2, 3]));
    expect(appendBarRandomPlaybackChunk(session, 4, false)).toEqual([]);
  });

  it("uses the selected duplicate policy while random repeat is on", () => {
    const session = createBarRandomSession(3);
    const chunk = appendBarRandomPlaybackChunk(
      session,
      4,
      true,
      { strategy: "independent", bundleSize: 2, bundleRepeats: 2 },
      () => 0.4,
    );
    expect(chunk).toEqual([1, 1, 1, 1]);
  });

  it("overlays the generated order as numbered vertical rows without changing source indexes", () => {
    const session = createBarRandomSession(3);
    session.order = [2, 0, 2, 1];
    expect(buildBarRandomDisplayItems(3, session)).toEqual([
      { key: "random-0-2", displayBeat: 0, sourceBeat: 2, isRandom: true },
      { key: "random-1-0", displayBeat: 1, sourceBeat: 0, isRandom: true },
      { key: "random-2-2", displayBeat: 2, sourceBeat: 2, isRandom: true },
      { key: "random-3-1", displayBeat: 3, sourceBeat: 1, isRandom: true },
    ]);
  });

  it("returns to the unchanged source row list after the random overlay ends", () => {
    const session = createBarRandomSession(3);
    session.order = [2, 0, 1];
    session.active = false;
    expect(buildBarRandomDisplayItems(3, session)).toEqual([
      { key: "source-0", displayBeat: 0, sourceBeat: 0, isRandom: false },
      { key: "source-1", displayBeat: 1, sourceBeat: 1, isRandom: false },
      { key: "source-2", displayBeat: 2, sourceBeat: 2, isRandom: false },
    ]);
  });
});
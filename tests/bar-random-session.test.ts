import {
  appendBarRandomItems,
  appendBarRandomPlaybackChunk,
  buildBarRandomDisplayItems,
  buildBarRandomSourceIndexes,
  createBarRandomSession,
  getBarRandomCandidateCount,
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

  it("selects top-level blocks and ungrouped bars as equal random units", () => {
    const sourceIndexes = buildBarRandomSourceIndexes(6, [
      { startBeat: 1, endBeat: 3 },
      { startBeat: 2, endBeat: 2 },
    ]);
    expect(sourceIndexes).toEqual([0, 1, 4, 5]);
    const session = createBarRandomSession(6, sourceIndexes);
    expect(appendBarRandomPlaybackChunk(
      session,
      3,
      true,
      { strategy: "independent", bundleSize: 2, bundleRepeats: 2 },
      () => 0.3,
    )).toEqual([1, 1, 1]);
  });

  it("excludes bars and clips blocks after the first end marker", () => {
    const candidateCount = getBarRandomCandidateCount(7, {
      4: { isEnd: true },
    });
    const blocks = [{ startBeat: 3, endBeat: 6 }];
    const eligibleBlocks = blocks.filter(block => block.startBeat < candidateCount);
    expect(candidateCount).toBe(5);
    expect(eligibleBlocks).toEqual([{ startBeat: 3, endBeat: 6 }]);
    expect(buildBarRandomSourceIndexes(7, eligibleBlocks, candidateCount)).toEqual([0, 1, 2, 3]);
  });

  it("uses the session block snapshot when the live block list later changes", () => {
    const session = createBarRandomSession(
      5,
      [1, 4],
      [{ startBeat: 1, endBeat: 3 }],
    );
    session.order = [1];
    const items = buildBarRandomDisplayItems(
      5,
      session,
      [{ startBeat: 1, endBeat: 1 }],
    );
    expect(items.map(item => item.sourceBeat)).toEqual([1, 2, 3]);
  });

  it("keeps the complete block snapshot while limiting selectable units at an end marker", () => {
    const sourceCount = 8;
    const blocks = [
      { startBeat: 2, endBeat: 5, type: "count" as const, value: 2 },
      { startBeat: 3, endBeat: 4, type: "count" as const, value: 2 },
      { startBeat: 6, endBeat: 7, type: "count" as const, value: 3 },
    ];
    const candidateCount = getBarRandomCandidateCount(sourceCount, { 4: { isEnd: true } });
    const selectableBlocks = blocks.filter(block => block.startBeat < candidateCount);
    const session = createBarRandomSession(
      sourceCount,
      buildBarRandomSourceIndexes(sourceCount, selectableBlocks, candidateCount),
      blocks,
    );

    expect(session.sourceIndexes).toEqual([0, 1, 2]);
    expect(session.loopBlocks).toEqual(blocks);
  });

  it("expands a selected block for display while retaining its random unit index", () => {
    const session = createBarRandomSession(5, [0, 1, 4]);
    session.order = [1, 4];
    expect(buildBarRandomDisplayItems(5, session, [{ startBeat: 1, endBeat: 3 }])).toEqual([
      { key: "random-0-1", displayBeat: 0, sourceBeat: 1, isRandom: true, randomSequenceIndex: 0 },
      { key: "random-0-2", displayBeat: 1, sourceBeat: 2, isRandom: true, randomSequenceIndex: 0 },
      { key: "random-0-3", displayBeat: 2, sourceBeat: 3, isRandom: true, randomSequenceIndex: 0 },
      { key: "random-1-4", displayBeat: 3, sourceBeat: 4, isRandom: true, randomSequenceIndex: 1 },
    ]);
  });

  it("overlays the generated order as numbered vertical rows without changing source indexes", () => {
    const session = createBarRandomSession(3);
    session.order = [2, 0, 2, 1];
    expect(buildBarRandomDisplayItems(3, session)).toEqual([
      { key: "random-0-2", displayBeat: 0, sourceBeat: 2, isRandom: true, randomSequenceIndex: 0 },
      { key: "random-1-0", displayBeat: 1, sourceBeat: 0, isRandom: true, randomSequenceIndex: 1 },
      { key: "random-2-2", displayBeat: 2, sourceBeat: 2, isRandom: true, randomSequenceIndex: 2 },
      { key: "random-3-1", displayBeat: 3, sourceBeat: 1, isRandom: true, randomSequenceIndex: 3 },
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
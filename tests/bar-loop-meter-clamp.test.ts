import { clampLoopBlocksToMeter } from "@/lib/bar-config-helpers";
import type { LoopBlock } from "@/components/BeatIndicator";

test("clamps loop block endpoints while preserving playback metadata", () => {
  const blocks: LoopBlock[] = [
    { startBeat: 0, endBeat: 7, type: "count", value: 3, bpm: 100, jumpToBlock: 1 },
    { startBeat: 6, endBeat: 7, type: "duration", value: 10 },
  ];
  expect(clampLoopBlocksToMeter(blocks, 4)).toEqual({
    changed: true,
    clamped: [
      { ...blocks[0], endBeat: 3 },
      { ...blocks[1], startBeat: 3, endBeat: 3 },
    ],
  });
  expect(blocks[0].endBeat).toBe(7);
});
test("unchanged meter and empty blocks do not trigger loop updates", () => {
  const blocks: LoopBlock[] = [{ startBeat: 0, endBeat: 3, type: "count", value: 2 }];
  expect(clampLoopBlocksToMeter(blocks, 4)).toEqual({ clamped: blocks, changed: false });
  expect(clampLoopBlocksToMeter([], 4)).toEqual({ clamped: [], changed: false });
});

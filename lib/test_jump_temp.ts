import { MetronomeEngine } from './metronome-engine';

const engine = new MetronomeEngine();
engine.setBpm(120);
engine.setBeatsPerMeasure(6);
engine.setBeatTypes(["accent","normal","normal","normal","normal","normal"] as any);

engine.setLoopBlocks([
  { startBeat: 0, endBeat: 1, type: "count", value: 1, jumpToBlock: 1, jumpCount: 3 },
  { startBeat: 2, endBeat: 3, type: "count", value: 1 },
]);

engine.buildScheduleOnly();
const schedule = (engine as any).schedule;

const beatCounts: Record<number, number> = {};
for (const tick of schedule) {
  if (tick.isMainBeat) {
    beatCounts[tick.beat] = (beatCounts[tick.beat] || 0) + 1;
  }
}

console.log("Beat counts (main beats):", beatCounts);
console.log("Total main beats:", schedule.filter((t: any) => t.isMainBeat).length);

const jumpTicks = schedule.filter((t: any) => t.isMainBeat && t.jumpTotal > 0);
console.log("\nJump ticks:");
for (const t of jumpTicks) {
  console.log(`  beat=${t.beat}, jumpIter=${t.jumpIteration}/${t.jumpTotal}, src=${t.jumpSourceBlockIndex}`);
}

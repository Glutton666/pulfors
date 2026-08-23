import { test } from "node:test";
import assert from "node:assert/strict";
import type { BarConfig } from "../app/index.helpers";
import { resolvePlaybackContext } from "../lib/playback-context";

const barConfig = (bpms: Record<number, number> = {}): Pick<BarConfig, "barRepeats"> => ({
  barRepeats: Object.fromEntries(
    Object.entries(bpms).map(([bar, bpm]) => [
      Number(bar),
      { type: "count" as const, value: 1, bpm },
    ]),
  ),
});

test("bar playback uses the bar's default BPM when its active bar has no override", () => {
  const context = resolvePlaybackContext({
    mode: "bar",
    language: "en",
    globalBpm: 120,
    barBpm: 92,
    barConfig: barConfig(),
    activeBarIndex: 2,
  });

  assert.equal(context.bpm, 92);
  assert.equal(context.bpmSource, "bar_default");
  assert.equal(context.modeLabel, "Bar");
  assert.equal(context.activityMode, "bar");
});

test("bar playback prioritizes the active bar's BPM override over the default", () => {
  const context = resolvePlaybackContext({
    mode: "bar",
    language: "en",
    globalBpm: 120,
    barBpm: 92,
    barConfig: barConfig({ 0: 84, 3: 156 }),
    activeBarIndex: 3,
  });

  assert.equal(context.bpm, 156);
  assert.equal(context.bpmSource, "bar_override");
  assert.equal(context.activeBarIndex, 3);
});

test("a fresh fade-out start resolves bar zero instead of a prior stopped bar cursor", () => {
  const config = barConfig({ 0: 84, 3: 156 });
  const stoppedAtBarThree = resolvePlaybackContext({
    mode: "bar",
    language: "en",
    globalBpm: 120,
    barBpm: 92,
    barConfig: config,
    activeBarIndex: 3,
  });
  const fadeOutStart = resolvePlaybackContext({
    mode: "bar",
    language: "en",
    globalBpm: 120,
    barBpm: 92,
    barConfig: config,
    activeBarIndex: 0,
  });

  assert.equal(stoppedAtBarThree.bpm, 156);
  assert.equal(fadeOutStart.bpm, 84);
  assert.equal(fadeOutStart.activeBarIndex, 0);
});

test("beat mode keeps the legacy dial activity record but uses its localized label", () => {
  const context = resolvePlaybackContext({
    mode: "dial",
    language: "ko",
    globalBpm: 128,
    barBpm: 90,
    barConfig: barConfig(),
  });

  assert.equal(context.activityMode, "dial");
  assert.equal(context.modeLabel, "비트");
  assert.equal(context.bpm, 128);
  assert.equal(context.bpmSource, "global");
});

test("known and future modes never collapse to a Bar or Dial label", () => {
  const score = resolvePlaybackContext({
    mode: "score",
    language: "en",
    globalBpm: 108,
    barBpm: 120,
    barConfig: barConfig(),
  });
  const unknown = resolvePlaybackContext({
    mode: "future-mode",
    language: "en",
    globalBpm: 108,
    barBpm: 120,
    barConfig: barConfig(),
  });

  assert.equal(score.modeLabel, "Score");
  assert.equal(score.activityMode, "score");
  assert.equal(unknown.mode, "unknown");
  assert.equal(unknown.modeLabel, "Unknown Mode");
  assert.notEqual(unknown.modeLabel, "Bar");
  assert.notEqual(unknown.modeLabel, "Dial");
});
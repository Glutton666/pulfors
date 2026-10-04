import { beginCircularDraft, moveCircularDraft, candidateRadii, CIRCULAR_STEP, circularPatternBeatType } from "../lib/circular-subdivision";
import { pureGetSubPattern, pureAddBeatTicks, type ScheduleInputs, type EmitState } from "../lib/metronome-engine-pure";
import { hydrateDialConfigFromSettings, createInitialDialConfig } from "../lib/bar-config-helpers";
import type { BeatType } from "../lib/metronome-engine";

const geometry = { x: 200, y: 250, radius: 120, size: 300 };
function point(angle: number, type: BeatType) {
  const radius = candidateRadii(geometry.radius)[["strong", "accent", "normal", "mute"].indexOf(type)];
  return [geometry.x + radius * Math.cos(angle), geometry.y + radius * Math.sin(angle)] as const;
}
function move(draft: ReturnType<typeof beginCircularDraft>, angle: number, type: BeatType) {
  return moveCircularDraft(draft, ...point(angle, type));
}

describe("circular subdivision model", () => {
  for (const start of [-Math.PI / 2, 0, Math.PI / 2, Math.PI, Math.PI * 0.83]) {
    for (const direction of [-1, 1]) {
      test(`ANANANANS from ${start} moving ${direction}`, () => {
        let draft = beginCircularDraft(2, geometry, start, "strong");
        const pattern: BeatType[] = ["accent", "normal", "accent", "normal", "accent", "normal", "accent", "normal", "strong"];
        draft = move(draft, start, pattern[0]);
        for (let i = 1; i < pattern.length; i++) {
          const angle = start + direction * (CIRCULAR_STEP * i + 0.002);
          // Travel around first, then change strength; candidates are not notes.
          draft = move(draft, angle, pattern[i - 1]);
          draft = move(draft, angle, pattern[i]);
        }
        expect(draft.notes).toEqual(pattern);
        expect(draft.beatIndex).toBe(2);
        expect(draft.atLimit).toBe(true);
      });
    }
  }
  test("radial movement and tremor never append notes", () => {
    let draft = beginCircularDraft(0, geometry, -1.2, "strong");
    for (const type of ["accent", "normal", "mute", "strong"] as BeatType[]) {
      draft = move(draft, -1.2, type);
      expect(draft.notes).toEqual([type]);
    }
    for (let i = 0; i < 50; i++) draft = move(draft, -1.2 + (i % 2 ? 0.04 : -0.04), "accent");
    expect(draft.notes).toEqual(["accent"]);
  });
  test("crossing a boundary repeatedly or reversing does not duplicate notes", () => {
    let draft = beginCircularDraft(1, geometry, 0, "accent");
    for (let i = 0; i < 40; i++) draft = move(draft, CIRCULAR_STEP + (i % 2 ? 0.003 : -0.003), "normal");
    expect(draft.notes).toHaveLength(2);
    draft = move(draft, -0.5, "mute");
    draft = move(draft, CIRCULAR_STEP + 0.003, "normal");
    expect(draft.notes).toHaveLength(2);
  });
  test("hub crossings are ignored and radial midpoint has hysteresis", () => {
    let draft = beginCircularDraft(1, geometry, 0, "accent");
    expect(moveCircularDraft(draft, geometry.x, geometry.y)).toBe(draft);
    draft = moveCircularDraft(draft, geometry.x + geometry.radius * 0.665, geometry.y);
    expect(draft.notes).toEqual(["accent"]);
  });
  test("maximum is shared with the existing editor and last strength still updates", () => {
    let draft = beginCircularDraft(3, geometry, 0, "normal");
    for (let i = 1; i <= 18; i++) draft = move(draft, i * CIRCULAR_STEP + 0.01, "normal");
    draft = move(draft, 18 * CIRCULAR_STEP + 0.01, "mute");
    expect(draft.notes).toHaveLength(9);
    expect(draft.notes[8]).toBe("mute");
  });
  test("engine override preserves the exact authored pattern including leading M", () => {
    for (const pattern of [
      ["accent", "normal", "accent", "normal", "accent", "normal", "accent", "normal", "strong"],
      ["mute", "accent", "normal", "mute"],
      ["normal", "strong"],
    ] as BeatType[][]) {
      const beatTypes: BeatType[] = ["strong", "normal", circularPatternBeatType(pattern), "mute"];
      expect(pureGetSubPattern(beatTypes, new Map([[2, pattern]]), 2)).toEqual(pattern);
      expect(beatTypes[0]).toBe("strong");
      expect(beatTypes[3]).toBe("mute");
    }
  });
  test("hydration restores authored beat strength rather than meter defaults", () => {
    const types: BeatType[] = ["accent", "mute", "normal", "strong"];
    const config = hydrateDialConfigFromSettings(createInitialDialConfig(), {
      beatsPerMeasure: 4, beatTypes: types, beatSubdivisions: { "0": ["accent", "normal"] },
    });
    expect(config.beatTypes).toEqual(types);
    expect(config.beatTypes).not.toBe(types);
  });
  test("schedule keeps M as an equal time slot and only subdivides the target beat", () => {
    const pattern: BeatType[] = ["accent", "normal", "mute", "normal", "accent", "normal", "accent", "normal", "strong"];
    const inputs: ScheduleInputs = { bpm: 120, halfTime: false, beatsPerMeasure: 4,
      beatTypes: ["strong", "normal", "accent", "normal"], beatSubdivisions: new Map([[2, pattern]]),
      barRepeats: new Map(), barBpmOverrides: new Map(), sortedBlocks: [], origToSorted: new Map(),
      sortedToOrig: new Map(), startBeatToBlocks: new Map(), loopBlocks: [] };
    const state: EmitState = { ticks: [], time: 0, jump: { iteration: 1, total: 1, sourceBlockIndex: -1 } };
    for (let beat = 0; beat < 4; beat++) pureAddBeatTicks(inputs, state, beat, 1, 1, 1, -1, 1);
    expect(state.ticks.filter((tick) => tick.beat === 2).map((tick) => tick.type)).toEqual(pattern);
    expect(state.ticks.filter((tick) => tick.beat === 0)).toHaveLength(1);
    expect(state.time).toBeCloseTo(2000);
    const slots = state.ticks.filter((tick) => tick.beat === 2);
    expect(slots[2].type).toBe("mute");
    for (let i = 1; i < slots.length; i++) expect(slots[i].time - slots[i - 1].time).toBeCloseTo(500 / 9);
  });
});
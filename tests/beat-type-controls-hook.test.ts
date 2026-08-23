/**
 * @jest-environment jsdom
 *
 * Smoke-test the real extracted hook. This prevents a future dependency-array
 * edit or native import from crashing Jest before focused behavior tests run.
 */
import { renderHook, act } from "@testing-library/react";
import { useBeatTypeControls } from "../hooks/useBeatTypeControls";
import type { BeatType } from "../lib/metronome-engine";

jest.mock("@/app/index.helpers", () => ({
  defaultBeatTypes: (count: number) =>
    Array.from({ length: count }, (_, index) => (index === 0 ? "strong" : "normal")),
}));

describe("useBeatTypeControls hook smoke test", () => {
  it("loads and changes a beat without a dependency-related render crash", () => {
    let beatTypes: BeatType[] = ["strong", "normal", "normal", "normal"];
    let beatSubdivisions: Record<string, BeatType[]> = { "1": ["normal", "normal"] };
    const engine = {
      getBeatTypes: jest.fn(() => beatTypes),
      setBeatTypes: jest.fn((next: BeatType[]) => { beatTypes = next; }),
      setAllBeatSubdivisions: jest.fn((next: Record<string, BeatType[]>) => {
        beatSubdivisions = next;
      }),
      setBeatsPerMeasure: jest.fn(),
    };
    const setBeatTypes = jest.fn((updater: React.SetStateAction<BeatType[]>) => {
      beatTypes = typeof updater === "function" ? updater(beatTypes) : updater;
    });
    const setBeatSubdivisions = jest.fn((
      updater: React.SetStateAction<Record<string, BeatType[]>>,
    ) => {
      beatSubdivisions = typeof updater === "function"
        ? updater(beatSubdivisions)
        : updater;
    });

    const { result } = renderHook(() => useBeatTypeControls({
      engineRef: { current: engine as any },
      barModeRef: { current: false },
      barConfigRef: { current: { beatsPerMeasure: 4, beatTypes: [...beatTypes], beatSubdivisions: {} } },
      dialConfigRef: { current: { beatsPerMeasure: 4, beatTypes: [...beatTypes], beatSubdivisions: {} } },
      beatsPerMeasure: 4,
      beatTypes,
      beatSubdivisions,
      subdivisionPattern: ["normal"],
      setBeatsPerMeasure: jest.fn(),
      setBeatTypes,
      setBeatSubdivisions,
      persistSettings: jest.fn() as any,
    }));

    act(() => result.current.handleBeatTypeChange(1, "accent"));

    expect(beatTypes[1]).toBe("accent");
    expect(beatSubdivisions["1"][0]).toBe("accent");
    expect(engine.setBeatTypes).toHaveBeenCalled();
  });
});
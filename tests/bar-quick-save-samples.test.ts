/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { useBarMode, type UseBarModeParams } from "@/hooks/useBarMode";
import { createPracticeEntry, savePracticeBook } from "@/lib/storage";

jest.mock("@/lib/storage", () => ({
  loadPracticeBook: jest.fn(async () => []),
  savePracticeBook: jest.fn(async () => undefined),
  createPracticeEntry: jest.fn((_label, config) => ({ id: "saved", ...config })),
}));

it.each([
  ["noteSamples", "file:///new.wav"],
  ["noteSampleNames", "New sample"],
  ["noteSampleSources", "file"],
  ["noteSampleChannels", "left"],
  ["noteSampleVolumes", 0.4],
  ["noteSampleSpeeds", 1.5],
] as const)("Bar quick save uses updated %s without another beat edit", async (field, value) => {
  const params = {
    engineRef: { current: null },
    beatsPerMeasure: 4,
    beatTypes: ["normal", "normal", "normal", "normal"],
    beatSubdivisions: {},
    subdivisionPattern: ["normal"],
    noteSamples: {},
    noteSampleNames: {},
    noteSampleSources: {},
    noteSampleChannels: {},
    noteSampleVolumes: {},
    noteSampleSpeeds: {},
    username: "test",
  } as UseBarModeParams;
  const { result, rerender } = renderHook(
    (p: UseBarModeParams) => useBarMode(p),
    { initialProps: params },
  );
  rerender({ ...params, [field]: { "0": value } });
  await act(async () => { expect(await result.current.handleBarQuickSave()).toBe(true); });
  expect(createPracticeEntry).toHaveBeenLastCalledWith(
    expect.any(String), expect.objectContaining({ [field]: { "0": value } }), "test",
  );
  expect(savePracticeBook).toHaveBeenCalled();
});

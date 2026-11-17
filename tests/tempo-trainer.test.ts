/** @jest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { useTempoTrainer } from "@/hooks/useTempoTrainer";
import { DEFAULT_TEMPO_TRAINER, normalizeTempoTrainer, steppedTrainerBpm, type TempoTrainerBindings } from "@/lib/tempo-trainer";
import { createTrainerController } from "@/lib/tempo-trainer-output";

test("activity is gated on accepted playback and released by its own owner", () => {
  const setActivity = jest.fn();
  const trainer: TempoTrainerBindings = { config: { ...DEFAULT_TEMPO_TRAINER, enabled: true }, onConfigChange: jest.fn(), setActivity };
  const initial = { trainer, running: true, isPlaying: false, reset: false, endsAt: 5000 };
  const { rerender, unmount } = renderHook(useTempoTrainer, { initialProps: initial });
  const owner = setActivity.mock.calls[0][0];
  expect(setActivity).toHaveBeenLastCalledWith(owner, { running: false, reset: false, endsAt: 5000 });
  rerender({ ...initial, isPlaying: true });
  expect(setActivity).toHaveBeenLastCalledWith(owner, { running: true, reset: false, endsAt: 5000 });
  rerender({ ...initial, isPlaying: true, running: false });
  expect(setActivity).toHaveBeenLastCalledWith(owner, { running: false, reset: false, endsAt: 5000 });
  unmount();
  expect(setActivity).toHaveBeenLastCalledWith(owner, null);
});

test("an inactive duplicate drawer cannot stop another drawer's training", () => {
  const controller = createTrainerController();
  const activity = jest.fn();
  const clock = () => null;
  controller.attach({ activity, clock });
  const active = {};
  const other = {};
  controller.setActivity(active, { running: true, reset: false });
  activity.mockClear();
  controller.setActivity(other, { running: false, reset: true });
  controller.setActivity(other, null);
  expect(activity).not.toHaveBeenCalled();
  controller.setActivity(active, null);
  expect(activity).toHaveBeenCalledWith({ running: false, reset: false });
});

test("late release of a replaced output cannot detach its successor", () => {
  const controller = createTrainerController();
  const first = jest.fn();
  const second = jest.fn();
  const detach = controller.attach({ activity: first, clock: () => null });
  controller.attach({ activity: second, clock: () => null });
  detach();
  const owner = {};
  controller.setActivity(owner, { running: true, reset: false });
  expect(second).toHaveBeenLastCalledWith({ running: true, reset: false });
});

test("invalid data and legacy beats receive explicit safe measure defaults", () => {
  expect(normalizeTempoTrainer({ basis: "beats", intervalBeats: 16 }).intervalMeasures).toBe(4);
  expect(normalizeTempoTrainer({ basis: "beats" }).basis).toBe("measures");
  expect(normalizeTempoTrainer({ intervalSeconds: 0, intervalMeasures: NaN, bpmDelta: 0 }))
    .toEqual({ ...DEFAULT_TEMPO_TRAINER, intervalSeconds: 1, bpmDelta: 0 });
  expect(steppedTrainerBpm(299, 10)).toBe(300);
  expect(steppedTrainerBpm(21, -10)).toBe(20);
});

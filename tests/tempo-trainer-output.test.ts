import { createTrainerController, createTrainerOutput } from "@/lib/tempo-trainer-output";
import { DEFAULT_TEMPO_TRAINER } from "@/lib/tempo-trainer";
import { createTrainerDriver } from "@/lib/tempo-trainer-driver";
import type { TrainerDriver } from "@/lib/tempo-trainer-driver";
jest.mock("@/lib/tempo-trainer-driver", () => ({ createTrainerDriver: jest.fn() }));

test("late prepared output cannot take activity ownership from accepted playback", async () => {
  const make = (): TrainerDriver => ({
    now: () => 0, running: () => true, start: jest.fn(), update: jest.fn(),
    position: () => null, release: jest.fn(),
  });
  const firstDriver = make();
  const lateDriver = make();
  jest.mocked(createTrainerDriver).mockResolvedValueOnce(firstDriver).mockResolvedValueOnce(lateDriver);
  const controller = createTrainerController();
  const template = { normal: [], accent: [], baseBpm: 120, periodSeconds: 2 };
  const config = { ...DEFAULT_TEMPO_TRAINER, enabled: true };
  const active = await createTrainerOutput(template, config, controller);
  await active.playAndConfirm!();
  const stale = await createTrainerOutput(template, config, controller);
  stale.release();
  controller.setActivity({}, { running: true, reset: false });
  expect(firstDriver.update).toHaveBeenLastCalledWith(expect.objectContaining({ active: true }));
  expect(lateDriver.start).not.toHaveBeenCalled();
  expect(lateDriver.update).not.toHaveBeenCalled();
  expect(lateDriver.release).toHaveBeenCalledTimes(1);
  active.release();
  active.release();
  expect(firstDriver.release).toHaveBeenCalledTimes(1);
});

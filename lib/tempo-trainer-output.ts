import type { AudioOutputResource } from "./audio-output-owner";
import { normalizeTempoTrainer, type TempoTrainerConfig, type TrainerActivity } from "./tempo-trainer";
import type { TrainerCommand, TrainerPosition, TrainerTemplates } from "./tempo-trainer-kernel";
import { createTrainerDriver } from "./tempo-trainer-driver";

export interface TrainerOutputControl {
  activity(activity: TrainerActivity): void;
  clock(): (TrainerPosition & { elapsed: number }) | null;
}
export function createTrainerController() {
  let owner: object | null = null;
  let activity: TrainerActivity = { running: false, reset: true };
  let output: TrainerOutputControl | null = null;
  return {
    setActivity: (token: object, next: TrainerActivity | null) => {
      if (next?.running) owner = token;
      else if (owner !== token) return;
      activity = next ?? { running: false, reset: false };
      output?.activity(activity);
      if (!next) owner = null;
    },
    attach: (next: TrainerOutputControl) => {
      output = next;
      next.activity(activity);
      return () => { if (output === next) output = null; };
    },
  };
}
export type TrainerController = ReturnType<typeof createTrainerController>;

export async function createTrainerOutput(
  templates: TrainerTemplates, config: TempoTrainerConfig, controller: TrainerController,
): Promise<AudioOutputResource> {
  let command: TrainerCommand = {
    revision: 0, reset: 0, active: false, endsAt: 0, rule: normalizeTempoTrainer(config),
  };
  const driver = await createTrainerDriver(templates, command);
  let released = false;
  let started = false;
  let previousReset = false;
  const control: TrainerOutputControl = {
    activity: activity => {
      command = {
        ...command, revision: command.revision + 1,
        reset: command.reset + (activity.reset && !previousReset ? 1 : 0),
        active: activity.running && config.enabled,
        endsAt: activity.endsAt === undefined ? 0
          : driver.now() + Math.max(0, activity.endsAt - Date.now()) / 1000,
      };
      previousReset = activity.reset;
      driver.update(command);
    },
    clock: () => {
      const position = driver.position();
      return position ? { ...position, elapsed: Math.max(0, driver.now() - position.start) } : null;
    },
  };
  // Preparation may finish after a newer start. Do not take control until the
  // owning playback attempt has published and accepted this output.
  let detach = () => {};
  const release = () => {
    if (released) return;
    released = true;
    detach();
    driver.release();
  };
  return {
    tempoTrainer: control,
    stop: release, release,
    isRunning: () => started && !released && driver.running(),
    getPositionSeconds: () => control.clock()?.elapsed ?? 0,
    getDurationSeconds: () => control.clock()?.duration ?? templates.periodSeconds,
    playAndConfirm: async () => {
      if (released) return false;
      if (!started) {
        detach = controller.attach(control);
        driver.start();
        started = true;
      }
      return driver.running();
    },
  };
}

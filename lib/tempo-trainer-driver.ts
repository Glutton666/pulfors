import { Platform } from "react-native";
import { getWebAudioContext } from "./audio-renderer";
import {
  createTrainerKernel, renderTrainerFrames,
  type TrainerCommand, type TrainerPosition, type TrainerTemplates,
} from "./tempo-trainer-kernel";
import { createWebTrainerDriver } from "./tempo-trainer-driver.web";

export interface TrainerDriver {
  now(): number;
  running(): boolean;
  start(): void;
  update(command: TrainerCommand): void;
  position(): TrainerPosition | null;
  release(): void;
}

export async function createTrainerDriver(
  templates: TrainerTemplates, initial: TrainerCommand,
): Promise<TrainerDriver> {
  if (Platform.OS === "web") {
    const context = getWebAudioContext();
    if (!context) throw new Error("Web Audio is unavailable.");
    await context.resume();
    return createWebTrainerDriver(context, templates, initial);
  }
  // Lazy native imports keep this path safe on web and explicitly fail in an
  // old native build; never fall back to JS-timed Expo player swaps.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Native JSI must not initialize while importing the web app.
  const { AudioContext } = require("react-native-audio-api") as typeof import("react-native-audio-api");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Only load native runtime synchronization in an installed app.
  const { createSynchronizable } = require("react-native-worklets") as typeof import("react-native-worklets");
  const context = new AudioContext({ sampleRate: 44100 });
  try {
    if (context.sampleRate !== 44100) throw new Error("Trainer output requires a 44.1 kHz audio context.");
    await context.resume();
    const command = createSynchronizable(initial);
    const observed = createSynchronizable<TrainerPosition | null>(null);
    const state = createTrainerKernel(templates.baseBpm);
    const source = context.createWorkletSourceNode((channels, frames, time, offset) => {
      "worklet";
      const previous = state.position.measure;
      const l = channels[0].subarray(offset, offset + frames);
      const r = channels[1].subarray(offset, offset + frames);
      renderTrainerFrames(state, command.getDirty(), templates, l, r, frames, 44100, Math.round(time * 44100) + offset);
      if (previous !== state.position.measure) observed.setBlocking({ ...state.position });
    }, "AudioRuntime");
    source.connect(context.destination);
    let disposed = false;
    return {
      now: () => context.currentTime,
      running: () => !disposed && context.state === "running",
      start: () => source.start(context.currentTime + 0.08),
      update: value => { if (!disposed) command.setBlocking(value); },
      position: () => observed.getDirty(),
      release: () => {
        if (disposed) return;
        disposed = true;
        source.stop();
        source.disconnect();
        void context.close().catch(() => {});
      },
    };
  } catch (error) {
    await context.close().catch(() => {});
    throw new Error(`Native tempo training requires an updated app build: ${error instanceof Error ? error.message : String(error)}`);
  }
}

import {
  createTrainerKernel, renderTrainerFrames,
  type TrainerKernel, type TrainerCommand, type TrainerPosition, type TrainerTemplates,
} from "./tempo-trainer-kernel";
import type { TrainerDriver } from "./tempo-trainer-driver";
import { getWebAudioContext } from "./audio-renderer";

export async function createTrainerDriver(templates: TrainerTemplates, initial: TrainerCommand): Promise<TrainerDriver> {
  const context = getWebAudioContext();
  if (!context) throw new Error("Web Audio is unavailable.");
  await context.resume();
  return createWebTrainerDriver(context, templates, initial);
}

type Reservation = { source: AudioBufferSourceNode; frame: number; state: TrainerKernel };
const RATE = 44100;
const BLOCK = 512;
function clone(state: TrainerKernel): TrainerKernel {
  return { ...state, position: { ...state.position }, voices: state.voices.map(v => ({ ...v })) };
}

/** Native AudioWorklet is not installed into the browser. Reserve short PCM
 * blocks on the existing AudioContext, with cancellation of every old source. */
export function createWebTrainerDriver(
  context: AudioContext, templates: TrainerTemplates, initial: TrainerCommand,
): TrainerDriver {
  let command = initial;
  let state = createTrainerKernel(templates.baseBpm);
  let reservations: Reservation[] = [];
  let history: TrainerPosition[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  let started = false;
  let cursor = 0;
  const reserve = () => {
    if (disposed) return;
    const now = context.currentTime;
    reservations = reservations.filter(r => r.frame + BLOCK > now * RATE);
    // A stalled JS thread cannot burst a backlog of expired PCM blocks.
    if (cursor < (now + 0.003) * RATE) cursor = Math.ceil((now + 0.003) * RATE);
    while (cursor / RATE < now + 0.16) {
      const before = clone(state);
      const left = new Float32Array(BLOCK);
      const right = new Float32Array(BLOCK);
      const previous = state.position.measure;
      renderTrainerFrames(state, command, templates, left, right, BLOCK, RATE, cursor);
      if (previous !== state.position.measure) history.push({ ...state.position });
      const buffer = context.createBuffer(2, BLOCK, RATE);
      buffer.copyToChannel(left, 0);
      buffer.copyToChannel(right, 1);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => source.disconnect();
      source.start(cursor / RATE);
      reservations.push({ source, frame: cursor, state: before });
      cursor += BLOCK;
    }
    history = history.slice(-32);
  };
  const cancel = () => {
    for (const r of reservations) {
      try { r.source.stop(); } catch {}
      r.source.disconnect();
    }
    reservations = [];
  };
  return {
    now: () => context.currentTime,
    running: () => !disposed && context.state === "running",
    start: () => {
      if (started) return;
      started = true;
      cursor = Math.ceil((context.currentTime + 0.08) * RATE);
      reserve();
      timer = setInterval(reserve, 20);
    },
    update: value => {
      if (disposed) return;
      if (!started) { command = value; return; }
      const at = Math.ceil((context.currentTime + 0.003) * RATE);
      const reservation = reservations.find(r => r.frame <= at && r.frame + BLOCK > at);
      const future = reservations.find(r => r.frame > at);
      if (!reservation && future) {
        state = clone(future.state);
        cursor = future.frame;
        cancel();
        command = value;
        history = history.filter(p => p.start <= at / RATE);
        reserve();
        return;
      }
      if (reservation) {
        state = clone(reservation.state);
        const advance = at - reservation.frame;
        renderTrainerFrames(state, command, templates, new Float32Array(advance), new Float32Array(advance), advance, RATE, reservation.frame);
      }
      cancel();
      command = value;
      cursor = at;
      history = history.filter(p => p.start <= at / RATE);
      reserve();
    },
    position: () => {
      const now = context.currentTime;
      for (let i = history.length - 1; i >= 0; i--) if (history[i].start <= now) return history[i];
      return null;
    },
    release: () => {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      cancel();
      history = [];
    },
  };
}

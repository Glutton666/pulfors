import { clampPolygonOffset } from "./polygon-offset";

/**
 * Polygon-only musical clock. Score timeline types intentionally do not cross
 * this boundary.
 */

/** LCM(1..16), so all supported meters and side counts land on exact ticks. */
export const POLYGON_TICKS_PER_MEASURE = 720720;

export type PolygonBeatType = "strong" | "accent" | "normal" | "mute";

export interface PolygonScheduleLayer {
  readonly id: string;
  readonly sides: number;
  readonly soundSet: string;
  readonly role: "strong" | "high" | "low";
  readonly volume: number;
  readonly offsets?: readonly number[];
  readonly beatTypes?: readonly PolygonBeatType[];
}

export interface PolygonScheduleEvent {
  /** Stable across tempo changes and schedule rebuilds. */
  readonly id: string;
  readonly layerId: string;
  readonly vertex: number;
  readonly type: PolygonBeatType;
  readonly soundSet: string;
  readonly volume: number;
  /** Original slot position, used to assign this event to an engine beat. */
  readonly slotTick: number;
  /** Integer musical position after the vertex offset. */
  readonly tick: number;
  readonly beat: number;
}

export interface PolygonSchedule {
  readonly beatsPerMeasure: number;
  readonly ticksPerBeat: number;
  readonly events: readonly PolygonScheduleEvent[];
}

export interface BuildPolygonScheduleOptions {
  readonly layers: readonly PolygonScheduleLayer[];
  readonly beatsPerMeasure: number;
}

function fallbackType(layer: PolygonScheduleLayer): PolygonBeatType {
  if (layer.role === "strong") return "strong";
  if (layer.role === "high") return "accent";
  return "normal";
}

/** Builds one immutable measure containing exactly N events for each N-gon. */
export function buildPolygonSchedule(
  options: BuildPolygonScheduleOptions,
): PolygonSchedule {
  const beatsPerMeasure = Math.max(1, Math.min(16, Math.trunc(options.beatsPerMeasure)));
  const ticksPerBeat = POLYGON_TICKS_PER_MEASURE / beatsPerMeasure;
  const events: PolygonScheduleEvent[] = [];

  for (const layer of options.layers) {
    const sides = Math.max(1, Math.min(16, Math.trunc(layer.sides)));
    const ticksPerSlot = POLYGON_TICKS_PER_MEASURE / sides;
    for (let vertex = 0; vertex < sides; vertex++) {
      const slotTick = vertex * ticksPerSlot;
      const offset = clampPolygonOffset(layer.offsets?.[vertex] ?? 0);
      const tick = slotTick + Math.round(offset * ticksPerSlot);
      // Reserve an advance from the beat containing its new position.
      // Positive delays can still be reserved from the original beat.
      const schedulingTick = offset < 0
        ? (tick + POLYGON_TICKS_PER_MEASURE) % POLYGON_TICKS_PER_MEASURE
        : slotTick;
      events.push(Object.freeze({
        id: `${layer.id}:${vertex}`,
        layerId: layer.id,
        vertex,
        type: layer.beatTypes?.[vertex] ?? fallbackType(layer),
        soundSet: layer.soundSet,
        volume: Math.max(0, Math.min(1, layer.volume ?? 1)),
        slotTick,
        tick,
        beat: Math.floor(schedulingTick / ticksPerBeat),
      }));
    }
  }

  return Object.freeze({
    beatsPerMeasure,
    ticksPerBeat,
    events: Object.freeze(events),
  });
}

export interface SchedulePolygonBeatRequest {
  readonly sessionId: number;
  readonly schedule: PolygonSchedule;
  readonly absoluteBeat: number;
  readonly bpm: number;
  readonly onEvent?: (event: PolygonScheduleEvent) => void;
}

export interface PolygonScheduleRunner {
  scheduleBeat(request: SchedulePolygonBeatRequest): void;
  cancelLayer(sessionId: number, layerId: string): void;
  cancelSession(sessionId: number): void;
  dispose(): void;
  snapshot(): { pendingCount: number; deliveredCount: number };
}

type PendingTimer = {
  timer: ReturnType<typeof setTimeout>;
  sessionId: number;
  layerId: string;
};

/**
 * Owns Polygon wall-clock timers. Musical positions remain integer ticks until
 * each event is handed to setTimeout at the output edge.
 */
export function createPolygonScheduleRunner(
  defaultOnEvent: (event: PolygonScheduleEvent) => void,
): PolygonScheduleRunner {
  const pending = new Map<string, PendingTimer>();
  const delivered = new Map<string, { sessionId: number; layerId: string; measure: number }>();
  const latestBeatBySession = new Map<number, number>();
  let disposed = false;

  const cancelWhere = (matches: (entry: {
    sessionId: number;
    layerId: string;
  }) => boolean, clearDelivered: boolean) => {
    for (const [key, entry] of pending) {
      if (!matches(entry)) continue;
      clearTimeout(entry.timer);
      pending.delete(key);
    }
    if (clearDelivered) {
      for (const [key, entry] of delivered) {
        if (matches(entry)) delivered.delete(key);
      }
    }
  };

  return {
    scheduleBeat({ sessionId, schedule, absoluteBeat, bpm, onEvent }) {
      if (disposed) return;
      const normalizedAbsoluteBeat = Math.max(0, Math.trunc(absoluteBeat));
      const latestBeat = latestBeatBySession.get(sessionId);
      if (latestBeat !== undefined && normalizedAbsoluteBeat < latestBeat) return;
      latestBeatBySession.set(sessionId, normalizedAbsoluteBeat);
      const beat = ((normalizedAbsoluteBeat % schedule.beatsPerMeasure)
        + schedule.beatsPerMeasure) % schedule.beatsPerMeasure;
      const measure = Math.floor(normalizedAbsoluteBeat / schedule.beatsPerMeasure);
      const beatStartTick = beat * schedule.ticksPerBeat;
      if (!Number.isFinite(bpm) || bpm <= 0) {
        throw new RangeError("Polygon effective BPM must be positive");
      }
      const measureDurationMs = schedule.beatsPerMeasure * 60000 / bpm;

      // Delivered occurrence IDs are only useful for the current measure.
      for (const [key, entry] of delivered) {
        if (entry.sessionId === sessionId && entry.measure < measure) delivered.delete(key);
      }

      const scheduleEvent = (event: PolygonScheduleEvent, occurrenceMeasure: number, deltaTicks: number) => {
        const occurrenceId = `${sessionId}\0${occurrenceMeasure}\0${event.id}`;
        if (pending.has(occurrenceId) || delivered.has(occurrenceId)) return;
        const delayMs = deltaTicks * measureDurationMs / POLYGON_TICKS_PER_MEASURE;
        const deliver = () => {
          // clearTimeout alone does not reject a callback already queued by a
          // host. Ownership must still match after cancellation/restart.
          if (deltaTicks > 0 && pending.get(occurrenceId)?.timer !== timer) return;
          pending.delete(occurrenceId);
          if (disposed || delivered.has(occurrenceId)) return;
          delivered.set(occurrenceId, {
            sessionId,
            layerId: event.layerId,
            measure: occurrenceMeasure,
          });
          (onEvent ?? defaultOnEvent)(event);
        };
        let timer: ReturnType<typeof setTimeout>;
        if (delayMs <= 0) deliver();
        else {
          timer = setTimeout(deliver, delayMs);
          pending.set(occurrenceId, { timer, sessionId, layerId: event.layerId });
        }
      };

      for (const event of schedule.events) {
        const fromNextMeasure = event.tick < 0;
        // On a fresh start, there is no preceding measure for vertex zero.
        // Play its first occurrence at the start, then honor the advance on repeats.
        if (normalizedAbsoluteBeat === 0 && fromNextMeasure) scheduleEvent(event, 0, 0);
        if (event.beat !== beat) continue;
        const tick = fromNextMeasure ? POLYGON_TICKS_PER_MEASURE + event.tick : event.tick;
        scheduleEvent(event, measure + (fromNextMeasure ? 1 : 0), Math.max(0, tick - beatStartTick));
      }
    },
    cancelLayer(sessionId, layerId) {
      // An edit can move a played vertex into a later beat (or from the
      // previous measure back to the first beat). Keep the occurrence consumed.
      cancelWhere((entry) => entry.sessionId === sessionId && entry.layerId === layerId, false);
    },
    cancelSession(sessionId) {
      cancelWhere((entry) => entry.sessionId === sessionId, true);
      latestBeatBySession.delete(sessionId);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelWhere(() => true, true);
      latestBeatBySession.clear();
    },
    snapshot: () => ({
      pendingCount: pending.size,
      deliveredCount: delivered.size,
    }),
  };
}
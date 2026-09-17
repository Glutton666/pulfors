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
      const rawOffset = layer.offsets?.[vertex] ?? 0;
      const offset = Number.isFinite(rawOffset)
        ? Math.max(0, Math.min(0.5, rawOffset))
        : 0;
      events.push(Object.freeze({
        id: `${layer.id}:${vertex}`,
        layerId: layer.id,
        vertex,
        type: layer.beatTypes?.[vertex] ?? fallbackType(layer),
        soundSet: layer.soundSet,
        volume: Math.max(0, Math.min(1, layer.volume ?? 1)),
        slotTick,
        tick: slotTick + Math.round(offset * ticksPerSlot),
        beat: Math.floor(slotTick / ticksPerBeat),
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
  }) => boolean) => {
    for (const [key, entry] of pending) {
      if (!matches(entry)) continue;
      clearTimeout(entry.timer);
      pending.delete(key);
    }
    for (const [key, entry] of delivered) {
      if (matches(entry)) delivered.delete(key);
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
      const measureDurationMs = schedule.beatsPerMeasure * 60000 / Math.max(20, bpm);

      // Delivered occurrence IDs are only useful for the current measure.
      for (const [key, entry] of delivered) {
        if (entry.sessionId === sessionId && entry.measure < measure) delivered.delete(key);
      }

      for (const event of schedule.events) {
        if (event.beat !== beat) continue;
        const occurrenceId = `${sessionId}\0${measure}\0${event.id}`;
        if (pending.has(occurrenceId) || delivered.has(occurrenceId)) continue;
        const deltaTicks = Math.max(0, event.tick - beatStartTick);
        const delayMs = deltaTicks * measureDurationMs / POLYGON_TICKS_PER_MEASURE;
        const deliver = () => {
          pending.delete(occurrenceId);
          if (disposed || delivered.has(occurrenceId)) return;
          delivered.set(occurrenceId, {
            sessionId,
            layerId: event.layerId,
            measure,
          });
          (onEvent ?? defaultOnEvent)(event);
        };
        if (delayMs <= 0) {
          deliver();
          continue;
        }
        const timer = setTimeout(deliver, delayMs);
        pending.set(occurrenceId, { timer, sessionId, layerId: event.layerId });
      }
    },
    cancelLayer(sessionId, layerId) {
      cancelWhere((entry) => entry.sessionId === sessionId && entry.layerId === layerId);
    },
    cancelSession(sessionId) {
      cancelWhere((entry) => entry.sessionId === sessionId);
      latestBeatBySession.delete(sessionId);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelWhere(() => true);
      latestBeatBySession.clear();
    },
    snapshot: () => ({
      pendingCount: pending.size,
      deliveredCount: delivered.size,
    }),
  };
}
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { INITIAL_VIDEO_READING, nextVideoTick, type NoteVideoAttachment, type VideoDriver, type VideoReading } from "@/lib/note-video";
import type { ScheduledTick } from "@/lib/metronome-engine-pure";
import { soundSets, toEngineBpm, type MetronomeEngine } from "@/lib/metronome-engine";
import { ensureWebClickBuffers, getWebAudioContext } from "@/lib/audio-renderer";
import type { PracticeEntry } from "@/lib/storage";

interface Request {
  video: NoteVideoAttachment;
  ticks: ScheduledTick[];
  durationMs: number;
  beats: number;
  beatMs: number;
  repeat: boolean;
  fire(tick: ScheduledTick): void;
  cue(beat: number): void;
  silence(): void;
  done(): void;
}

interface Active extends Request {
  key: number;
  driver: VideoDriver | null;
  phase: "setup" | "count-in" | "media" | "paused";
  reading: VideoReading;
  cursor: number | null;
  count?: { next: number; total: number; at: number };
  seekTo: number | null;
  deadline: number;
  observedAt: number;
  advanceAt: number | null;
  invalidPosition?: boolean;
}

export interface NoteVideoPlayback {
  key: number;
  video: NoteVideoAttachment;
  reading: VideoReading;
  paused: boolean;
  countBeat: number | null;
}

export function resumeNoteVideoAudio() {
  if (Platform.OS !== "web") return;
  const context = getWebAudioContext();
  if (context?.state === "suspended") void context.resume().catch(() => {});
}

export async function startNoteVideoOutput(options: {
  begin: (request: Request) => void;
  engine: MetronomeEngine;
  entry: PracticeEntry;
  video: NoteVideoAttachment;
  repeat: boolean;
  denominator: 2 | 4 | 8;
  soundSet: string;
  isCurrent(): boolean;
  onReady(): void;
  onFailure(): void;
  dispatch(play: () => void): void;
  observe(tick: ScheduledTick): void;
  silence(): void;
  done(): void;
}) {
  const { begin, engine, entry, video, repeat, denominator, isCurrent, onReady, onFailure, dispatch, observe, silence, done } = options;
  if (Platform.OS === "web") {
    resumeNoteVideoAudio();
    try {
      if (!await ensureWebClickBuffers(soundSets[options.soundSet as keyof typeof soundSets] || soundSets.classic)) {
        throw new Error("Click sounds could not load.");
      }
    } catch {
      if (isCurrent()) onFailure();
      return;
    }
  }
  if (!isCurrent()) return;
  onReady();
  engine.setPreRenderedAudio(false);
  engine.setBaseClickMuted(false);
  engine.setRepeatUntilSkipped(repeat);
  begin({
    video, ...engine.getScheduleInfo(), repeat, beats: Math.max(1, entry.beatsPerMeasure),
    beatMs: 60000 / toEngineBpm(entry.bpm, denominator),
    fire: (tick) => { dispatch(() => engine.emitVideoClick(tick)); if (tick.layerIndex === 0) observe(tick); },
    cue: (beat) => dispatch(() => engine.emitVideoCountIn(beat)),
    silence, done: () => { if (isCurrent()) done(); },
  });
}

export function useNoteVideoPlayback() {
  const active = useRef<Active | null>(null);
  const generation = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const [session, setSession] = useState<NoteVideoPlayback | null>(null);
  const clickPlayers = useRef(new Set<{ pause(): void }>());
  const emitting = useRef(false);
  const capturePlayer = useCallback((player: { pause(): void }) => { if (emitting.current) clickPlayers.current.add(player); }, []);
  const dispatch = useCallback((play: () => void) => {
    emitting.current = true;
    try { play(); }
    finally { emitting.current = false; }
  }, []);
  const pausePlayers = useCallback(() => {
    for (const player of clickPlayers.current) { try { player.pause(); } catch {} }
    clickPlayers.current.clear();
  }, []);

  const stop = useCallback(() => {
    const previous = active.current;
    active.current = null;
    if (ticker.current !== null) clearInterval(ticker.current);
    ticker.current = null;
    if (previous) {
      previous.driver?.pause();
      previous.silence();
      setSession(null);
    }
  }, []);

  const begin = useCallback((request: Request) => {
    stop();
    const key = ++generation.current;
    const now = performance.now();
    const item: Active = {
      ...request, key, driver: null, phase: "setup", reading: INITIAL_VIDEO_READING,
      count: request.video.countInMeasures > 0
        ? { next: 0, total: request.video.countInMeasures * request.beats, at: 0 } : undefined,
      cursor: null, seekTo: request.video.startSeconds, deadline: now + 20000, observedAt: now, advanceAt: null,
    };
    active.current = item;
    setSession({ key, video: request.video, reading: item.reading, paused: false, countBeat: null });

    ticker.current = setInterval(() => {
      if (active.current !== item) return;
      const now = performance.now();
      if (item.phase === "setup" && now > item.deadline) {
        item.phase = "paused";
        item.invalidPosition = true;
        item.driver?.pause();
        setSession((state) => state?.key === key
          ? { ...state, paused: true, reading: { ...state.reading, phase: "error" } } : state);
        return;
      }
      if (item.phase === "count-in" && item.count && now >= item.count.at) {
        if (item.count.next < item.count.total) {
          const beat = item.count.next % item.beats;
          item.cue(beat);
          item.count.next++;
          item.count.at = now - item.count.at > item.beatMs ? now + item.beatMs : item.count.at + item.beatMs;
          setSession((state) => state?.key === key ? { ...state, countBeat: beat + 1 } : state);
        } else {
          item.count = undefined;
          item.phase = "media";
          setSession((state) => state?.key === key ? { ...state, countBeat: null } : state);
          item.driver?.play();
        }
        return;
      }
      if (item.phase !== "media" || item.reading.phase !== "playing") return;
      // Extrapolate only a small distance from a recent player timestamp. A stalled
      // decoder, a suspended browser, or an ad/seek discontinuity must not free-run.
      const position = item.reading.seconds * 1000 + Math.min(45, Math.max(0, now - item.observedAt)) * item.reading.rate;
      const anchor = Math.max(0, item.video.firstBeatSeconds * 1000 + item.video.offsetMs);
      if (item.advanceAt !== null && position >= item.advanceAt) { stop(); item.done(); return; }
      if (!item.repeat && position >= anchor + item.durationMs) { stop(); item.done(); return; }
      const floor = Math.max(position - 35, item.cursor ?? -Infinity);
      const next = nextVideoTick(item.ticks, item.durationMs, anchor, floor, item.repeat);
      if (!next || next.atMs > position) return;
      // Deliver simultaneous layered ticks together, but never replay a backlog.
      for (let index = next.index; item.ticks[index]?.time === item.ticks[next.index].time; index++) {
        item.fire(item.ticks[index]);
      }
      item.cursor = next.atMs + 0.01;
      const end = item.ticks[next.index];
      if (end.stopAfterThis && !item.repeat) item.advanceAt = next.atMs + (end.endBarOffsetMs ?? item.beatMs);
    }, 12);
  }, [stop]);

  const onDriver = useCallback((key: number, driver: VideoDriver | null) => {
    if (active.current?.key === key) active.current.driver = driver;
  }, []);

  const onReading = useCallback((key: number, reading: VideoReading) => {
    const item = active.current;
    if (!item || item.key !== key || item.invalidPosition) return;
    const before = item.reading;
    if (Math.abs(reading.seconds - before.seconds) > 0.30 || (reading.phase === "seeking" && before.phase !== "seeking")) {
      item.cursor = null;
      item.advanceAt = null;
      item.silence();
    }
    if (reading.seconds !== before.seconds || reading.phase !== before.phase) item.observedAt = performance.now();
    item.reading = reading;
    // The clock samples quickly; UI needs updates only on status changes or a
    // new tenth of a second so it doesn't rerender the player every tick.
    setSession((state) => {
      if (!state || state.key !== key) return state;
      if (state.reading.phase === reading.phase && state.reading.duration === reading.duration &&
          Math.floor(state.reading.seconds * 10) === Math.floor(reading.seconds * 10)) return state;
      return { ...state, reading };
    });
    if (before.phase === "playing" && reading.phase !== "playing") item.silence();
    if (reading.phase === "error" || reading.phase === "blocked") {
      item.phase = "paused";
      setSession((state) => state?.key === key && !state.paused ? { ...state, paused: true, countBeat: null } : state);
      return;
    }
    if (item.phase === "paused" && reading.phase === "playing" && before.phase === "blocked") {
      item.phase = "media";
      setSession((state) => state?.key === key ? { ...state, paused: false } : state);
    }
    if (item.phase === "count-in" && reading.phase === "playing") item.driver?.pause();
    if (item.phase === "setup" && item.driver && ["ready", "paused", "playing"].includes(reading.phase)) {
      if (item.seekTo !== null) {
        const seek = item.seekTo;
        item.seekTo = null;
        if (reading.duration > 0 && (seek >= reading.duration || item.video.firstBeatSeconds >= reading.duration)) {
          item.phase = "paused";
          item.invalidPosition = true;
          item.driver.pause();
          setSession((state) => state?.key === key ? { ...state, paused: true, reading: { ...reading, phase: "error" } } : state);
          return;
        }
        if (Math.abs(reading.seconds - seek) > 0.025) { item.driver.seek(seek); return; }
      }
      if (item.count) {
        item.phase = "count-in";
        item.driver.pause();
        item.count.at = performance.now();
      } else {
        item.phase = "media";
        item.driver.play();
      }
    } else if (item.phase === "media" && reading.phase === "ended") {
      if (!item.repeat) { stop(); item.done(); }
      else {
        item.phase = "setup";
        item.cursor = null;
        item.advanceAt = null;
        item.deadline = performance.now() + 20000;
        item.seekTo = item.video.startSeconds;
        item.driver?.seek(item.video.startSeconds);
      }
    }
  }, [stop]);

  const toggle = useCallback(() => {
    const item = active.current;
    if (!item) return false;
    if (item.invalidPosition || item.reading.phase === "error") return true;
    if (item.phase === "paused" || (item.phase === "media" && item.reading.phase === "paused")) {
      // Called synchronously from a user gesture for browsers that disallow
      // automatic unmuted playback after a count-in.
      if (item.count) {
        item.phase = "count-in";
        item.count.at = performance.now();
      } else {
        item.phase = "media";
        item.driver?.play();
      }
      setSession((state) => state ? { ...state, paused: false } : state);
    } else {
      item.phase = "paused";
      item.driver?.pause();
      item.silence();
      setSession((state) => state ? { ...state, paused: true } : state);
    }
    return true;
  }, []);

  const seek = useCallback((seconds: number) => {
    const item = active.current;
    if (!item || item.phase === "setup" || item.phase === "count-in" || item.count || !item.driver || !item.reading.duration) return;
    item.cursor = null;
    item.advanceAt = null;
    item.silence();
    item.reading = { ...item.reading, phase: "seeking" };
    item.driver.seek(Math.max(0, Math.min(item.reading.duration - 0.1, seconds)));
  }, []);

  const requestNext = useCallback(() => {
    const item = active.current;
    if (!item) return false;
    if (item.phase !== "media" || item.reading.phase !== "playing") return false;
    const position = item.reading.seconds * 1000;
    const start = Math.max(0, item.video.firstBeatSeconds * 1000 + item.video.offsetMs);
    item.advanceAt = position < start ? position : start + (Math.floor((position - start) / item.durationMs) + 1) * item.durationMs;
    return true;
  }, []);

  useEffect(() => {
    const pause = () => {
      const item = active.current;
      if (item && item.phase !== "paused") {
        item.phase = "paused";
        item.driver?.pause();
        item.silence();
        setSession((state) => state?.key === item.key ? { ...state, paused: true } : state);
      }
    };
    const subscription = AppState.addEventListener("change", (state) => { if (state !== "active") pause(); });
    const visibility = () => { if (document.hidden) pause(); };
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", visibility);
    return () => {
      subscription.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", visibility);
      stop();
    };
  }, [stop, toggle]);
  return { session, begin, stop, toggle, seek, onDriver, onReading, requestNext, capturePlayer, dispatch, pausePlayers };
}

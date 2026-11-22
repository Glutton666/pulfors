export type NoteVideoSource =
  | { kind: "youtube"; videoId: string }
  | { kind: "file"; assetId: string; name: string };

export interface NoteVideoAttachment {
  source: NoteVideoSource;
  startSeconds: number;
  firstBeatSeconds: number;
  countInMeasures: 0 | 1 | 2;
  offsetMs: number;
}

export const MAX_NOTE_VIDEO_SECONDS = 24 * 60 * 60;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const ASSET_ID = /^[a-f0-9-]{36}\.(mp4|webm|mov|m4v)$/i;
const bounded = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

export function parseYouTubeVideo(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const [, route, key] = url.pathname.split("/");
    const host = url.hostname;
    let id: string | null | undefined;
    if (host === "youtu.be") id = route;
    else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      id = route === "watch" ? url.searchParams.get("v") : ["shorts", "live", "embed"].includes(route) ? key : null;
    }
    return id && VIDEO_ID.test(id) ? id : null;
  } catch { return null; }
}

export function isNoteVideoAssetId(value: unknown): value is string {
  return typeof value === "string" && ASSET_ID.test(value);
}

export function readNoteVideo(raw: unknown, allowFile = true): NoteVideoAttachment | undefined {
  if (!raw || typeof raw !== "object") return;
  const data = raw as Partial<NoteVideoAttachment>;
  const src = data.source;
  if (!src || typeof src !== "object") return;
  let source: NoteVideoSource;
  if (src.kind === "youtube" && typeof src.videoId === "string" && VIDEO_ID.test(src.videoId)) {
    source = { kind: "youtube", videoId: src.videoId };
  } else if (allowFile && src.kind === "file" && isNoteVideoAssetId(src.assetId) && typeof src.name === "string") {
    source = { kind: "file", assetId: src.assetId, name: src.name.slice(0, 200) };
  } else return;
  if (!bounded(data.startSeconds, 0, MAX_NOTE_VIDEO_SECONDS) ||
      !bounded(data.firstBeatSeconds, 0, MAX_NOTE_VIDEO_SECONDS) ||
      !bounded(data.offsetMs, -500, 500) ||
      !(data.countInMeasures === 0 || data.countInMeasures === 1 || data.countInMeasures === 2)) return;
  return { source, startSeconds: data.startSeconds, firstBeatSeconds: data.firstBeatSeconds,
    countInMeasures: data.countInMeasures, offsetMs: data.offsetMs };
}

export function parseVideoPosition(input: string): number | null {
  const value = input.trim().replace(",", ".");
  if (!/^(?:\d{1,4}:)?\d+(?:\.\d{1,3})?$/.test(value)) return null;
  const parts = value.split(":");
  const seconds = Number(parts.at(-1));
  if (parts.length === 2 && seconds >= 60) return null;
  const result = parts.length === 2 ? Number(parts[0]) * 60 + seconds : seconds;
  return bounded(result, 0, MAX_NOTE_VIDEO_SECONDS) ? result : null;
}

export function formatVideoPosition(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const whole = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  const fraction = String(ms % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${Math.floor(ms / 60000)}:${whole}${fraction ? `.${fraction}` : ""}`;
}

export type VideoPhase = "loading" | "ready" | "playing" | "paused" | "seeking" | "buffering" | "ended" | "blocked" | "error";
export interface VideoReading { phase: VideoPhase; seconds: number; duration: number; rate: number }
export const INITIAL_VIDEO_READING: VideoReading = { phase: "loading", seconds: 0, duration: 0, rate: 1 };
export interface VideoDriver { play(): void; pause(): void; seek(seconds: number): void }

export function readVideoReading(value: unknown): VideoReading | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<VideoReading>;
  if (typeof state.phase !== "string" ||
      !["loading", "ready", "playing", "paused", "seeking", "buffering", "ended", "blocked", "error"].includes(state.phase) ||
      !bounded(state.seconds, 0, MAX_NOTE_VIDEO_SECONDS) ||
      !bounded(state.duration, 0, MAX_NOTE_VIDEO_SECONDS) || !bounded(state.rate, 0.1, 4)) return null;
  return { phase: state.phase, seconds: state.seconds, duration: state.duration, rate: state.rate };
}

/** The video owns time. Use actual schedule times, including Bar subdivisions and repeats. */
export function nextVideoTick(
  ticks: readonly { time: number }[],
  periodMs: number,
  anchorMs: number,
  positionMs: number,
  repeat: boolean,
): { index: number; atMs: number } | null {
  if (!ticks.length || periodMs <= 0) return null;
  const elapsed = Math.max(0, positionMs - anchorMs);
  let period = repeat ? Math.floor(elapsed / periodMs) : 0;
  const delta = positionMs - anchorMs - period * periodMs;
  let left = 0;
  let right = ticks.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (ticks[middle].time < delta - 0.001) left = middle + 1;
    else right = middle;
  }
  if (left === ticks.length) {
    if (!repeat) return null;
    period++;
    left = 0;
  }
  return { index: left, atMs: anchorMs + period * periodMs + ticks[left].time };
}

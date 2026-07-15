import { type VoiceCommand } from "@/lib/voice-commands";

const SCHEME = "pulfors";
const BPM_MIN = 20;
const BPM_MAX = 300;
const BEATS_MIN = 1;
const BEATS_MAX = 16;

function clampBpm(v: number): number {
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(v)));
}

function clampBeats(v: number): number {
  return Math.max(BEATS_MIN, Math.min(BEATS_MAX, Math.round(v)));
}

/**
 * Parse a deep-link URL (pulfors://…) into a VoiceCommand.
 * Returns null if the URL is unrecognised or malformed.
 *
 * Supported URLs:
 *   pulfors://play
 *   pulfors://stop
 *   pulfors://toggle
 *   pulfors://bpm?value=120
 *   pulfors://bpm?delta=+10
 *   pulfors://bpm?delta=-10
 *   pulfors://beats?value=4
 *   pulfors://reset
 */
export function parseDeepLink(url: string): VoiceCommand | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== `${SCHEME}:`) return null;

  const host = parsed.hostname;

  switch (host) {
    case "play":
      return { type: "play" };

    case "stop":
      return { type: "stop" };

    case "toggle":
      return { type: "toggle" };

    case "reset":
      return { type: "reset" };

    case "bpm": {
      const valueParam = parsed.searchParams.get("value");
      const deltaParam = parsed.searchParams.get("delta");

      if (valueParam !== null) {
        const n = parseInt(valueParam, 10);
        if (isNaN(n)) return null;
        return { type: "setBpm", bpm: clampBpm(n) };
      }
      if (deltaParam !== null) {
        const d = parseInt(deltaParam, 10);
        if (isNaN(d)) return null;
        return { type: "bpmDelta", delta: d };
      }
      return null;
    }

    case "beats": {
      const valueParam = parsed.searchParams.get("value");
      if (valueParam !== null) {
        const n = parseInt(valueParam, 10);
        if (isNaN(n)) return null;
        return { type: "setBeats", beats: clampBeats(n) };
      }
      return null;
    }

    default:
      return null;
  }
}

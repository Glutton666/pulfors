import { fetch } from "expo/fetch";
import { getApiUrl } from "@/lib/query-client";

export interface TimeSyncResult {
  offsetMs: number;
  rttMs: number;
  samples: number;
  measuredAt: number;
}

export class TimeSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeSyncError";
  }
}

const DEFAULT_SAMPLES = 8;
const TIMEOUT_MS = 4000;

async function fetchOnce(url: string): Promise<{ rtt: number; offset: number } | null> {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal as AbortSignal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const t1 = Date.now();
    const data = (await res.json()) as { now?: number };
    if (typeof data.now !== "number") return null;
    const rtt = t1 - t0;
    const serverNowAtMid = data.now;
    const localMid = (t0 + t1) / 2;
    const offset = serverNowAtMid - localMid;
    return { rtt, offset };
  } catch {
    return null;
  }
}

export async function measureOffset(samples: number = DEFAULT_SAMPLES): Promise<TimeSyncResult> {
  const url = new URL("/api/time", getApiUrl()).toString();
  const collected: { rtt: number; offset: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const r = await fetchOnce(url);
    if (r) collected.push(r);
  }
  if (collected.length === 0) {
    throw new TimeSyncError("network");
  }
  collected.sort((a, b) => a.rtt - b.rtt);
  const keep = collected.slice(0, Math.max(1, Math.ceil(collected.length / 2)));
  const avgOffset = keep.reduce((s, r) => s + r.offset, 0) / keep.length;
  const minRtt = keep[0].rtt;
  return {
    offsetMs: avgOffset,
    rttMs: minRtt,
    samples: collected.length,
    measuredAt: Date.now(),
  };
}

export function localToServer(localMs: number, offsetMs: number): number {
  return localMs + offsetMs;
}

export function serverToLocal(serverMs: number, offsetMs: number): number {
  return serverMs - offsetMs;
}

export function localToPerformanceTime(localMs: number): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now() + (localMs - Date.now());
  }
  return localMs;
}

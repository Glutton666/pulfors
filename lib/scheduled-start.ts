export interface ScheduledStartPayload {
  startEpochMs: number;
  bpm: number;
  beatsPerMeasure: number;
}

const PAYLOAD_RE = /^S(\d{10,16})B(\d{2,3})M(\d{1,2})$/;

export function encodePayload(p: ScheduledStartPayload): string {
  if (!Number.isFinite(p.startEpochMs) || p.startEpochMs <= 0) {
    throw new Error("invalid startEpochMs");
  }
  if (!Number.isFinite(p.bpm) || p.bpm < 20 || p.bpm > 300) {
    throw new Error("invalid bpm");
  }
  if (!Number.isFinite(p.beatsPerMeasure) || p.beatsPerMeasure < 1 || p.beatsPerMeasure > 32) {
    throw new Error("invalid beatsPerMeasure");
  }
  return `S${Math.floor(p.startEpochMs)}B${Math.floor(p.bpm)}M${Math.floor(p.beatsPerMeasure)}`;
}

export function decodePayload(text: string): ScheduledStartPayload | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim().toUpperCase();
  const m = trimmed.match(PAYLOAD_RE);
  if (!m) return null;
  const startEpochMs = Number(m[1]);
  const bpm = Number(m[2]);
  const beatsPerMeasure = Number(m[3]);
  if (!Number.isFinite(startEpochMs) || startEpochMs <= 0) return null;
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return null;
  if (!Number.isFinite(beatsPerMeasure) || beatsPerMeasure < 1 || beatsPerMeasure > 32) return null;
  return { startEpochMs, bpm, beatsPerMeasure };
}

export function computeStartEpochMs(serverNowMs: number, leadInSec: number): number {
  const lead = Math.max(2, Math.min(120, Math.floor(leadInSec)));
  return Math.floor(serverNowMs) + lead * 1000;
}

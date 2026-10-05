import type { SoundSet } from "./storage";

export type SoundSetOverlays = Partial<Record<SoundSet, SoundSet>>;
/** Direct links only; self-links and non-click/unknown sources are rejected. */
export function sanitizeSoundSetOverlays(value: unknown, available: readonly string[]): SoundSetOverlays {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const valid = new Set(available);
  return Object.fromEntries(Object.entries(value).filter(([base, extra]) =>
    valid.has(base) && typeof extra === "string" && valid.has(extra) && base !== extra,
  )) as SoundSetOverlays;
}
export function overlaySoundSet(links: SoundSetOverlays | undefined, base: string): SoundSet | undefined {
  const extra = Object.prototype.hasOwnProperty.call(links ?? {}, base) ? links?.[base as SoundSet] : undefined;
  return extra && extra !== base ? extra : undefined;
}
/** A+B, never A+(B+C). No independent scheduling or rhythm duplication. */
export function mixOverlayPCM(base: Float32Array, extra: Float32Array): Float32Array {
  const out = new Float32Array(Math.max(base.length, extra.length));
  for (let i = 0; i < out.length; i++) out[i] = 0.7 * ((base[i] ?? 0) + (extra[i] ?? 0));
  return out;
}

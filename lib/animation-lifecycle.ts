export interface PendulumAnim {
  swingDuration: number;
  maxAngle: number;
}

export function computePendulumAnim(bpm: number): PendulumAnim {
  const safeBpm = Math.max(1, bpm);
  const swingDuration = 60000 / safeBpm;
  const maxAngle = Math.max(15, Math.min(35, 40 - safeBpm / 15));
  return { swingDuration, maxAngle };
}

export interface GlowParams {
  attackMs: number;
  releaseMs: number;
}

const GLOW_ATTACK_MS = 60;
const GLOW_RELEASE_MS = 500;
const GLOW_HIGH_BPM_THRESHOLD = 180;
const GLOW_HIGH_BPM_RELEASE_MS = 220;

export function computeGlowParams(bpm: number): GlowParams {
  if (bpm >= GLOW_HIGH_BPM_THRESHOLD) {
    const beatInterval = 60000 / Math.max(1, bpm);
    const release = Math.min(GLOW_HIGH_BPM_RELEASE_MS, Math.max(120, beatInterval * 0.85));
    return { attackMs: GLOW_ATTACK_MS, releaseMs: release };
  }
  return { attackMs: GLOW_ATTACK_MS, releaseMs: GLOW_RELEASE_MS };
}

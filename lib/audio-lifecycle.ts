export type AudioLifecyclePhase =
  | "idle"
  | "preparing"
  | "playing"
  | "interrupted"
  | "recovering"
  | "recoveryFailed";

export type AudioLifecycleReason = "interruption" | "session" | "watchdog" | null;

export interface AudioLifecycleSnapshot {
  phase: AudioLifecyclePhase;
  reason: AudioLifecycleReason;
}

let snapshot: AudioLifecycleSnapshot = { phase: "idle", reason: null };
const listeners = new Set<() => void>();

function update(next: AudioLifecycleSnapshot): void {
  if (snapshot.phase === next.phase && snapshot.reason === next.reason) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getAudioLifecycleSnapshot(): AudioLifecycleSnapshot {
  return snapshot;
}

export function subscribeAudioLifecycle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markAudioPreparing(): void {
  if (snapshot.phase === "recovering") return;
  update({ phase: "preparing", reason: null });
}

export function markAudioPlaying(): void {
  update({ phase: "playing", reason: null });
}

export function markAudioStopped(): void {
  update({ phase: "idle", reason: null });
}

export function markAudioInterrupted(reason: Exclude<AudioLifecycleReason, null> = "interruption"): void {
  update({ phase: "interrupted", reason });
}

export function markAudioRecovering(reason: Exclude<AudioLifecycleReason, null>): void {
  update({ phase: "recovering", reason });
}

export function markAudioRecoveryFailed(reason: Exclude<AudioLifecycleReason, null> = "watchdog"): void {
  update({ phase: "recoveryFailed", reason });
}

export function markAudioRecoverySucceeded(): void {
  update({ phase: "playing", reason: null });
}

/** Test-only reset for the module-level store. */
export function _resetAudioLifecycleForTests(): void {
  update({ phase: "idle", reason: null });
}
/** Absolute deadlines avoid setInterval's cumulative drift under rendering
 * load. Late callbacks skip missed pulses rather than producing a burst. */
export function startRhythmPulseClock(interval: number, onPulse: () => void, now = () => performance.now()) {
  if (!Number.isFinite(interval) || interval <= 0) throw new Error("Invalid pulse interval");
  const origin = now();
  let active = true;
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    if (!active) return;
    const next = Math.floor(Math.max(0, now() - origin) / interval) + 1;
    timer = setTimeout(() => {
      if (!active) return;
      onPulse();
      arm();
    }, Math.max(1, origin + next * interval - now()));
  };
  arm();
  return () => { active = false; clearTimeout(timer); };
}

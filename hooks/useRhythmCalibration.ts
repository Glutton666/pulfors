import { useEffect, useRef, useState } from "react";
import { createRhythmAudioSession } from "@/lib/rhythm-lab/audio";
import { calibrationResult } from "@/lib/rhythm-lab/calibration";

const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
type State = { phase: "idle" | "preparing" | "playing" | "done" | "error"; count: number; message: string };

export function useRhythmCalibration(onApply: (offset: number) => void) {
  const apply = useRef(onApply); apply.current = onApply;
  const [state, setState] = useState<State>({ phase: "idle", count: 0, message: "" });
  const audio = useRef<ReturnType<typeof createRhythmAudioSession> | null>(null);
  const epoch = useRef(0);
  const pass = useRef<{ interval: number; taps: number[]; reference: number[]; first?: number } | null>(null);
  const cancel = () => {
    epoch.current++; pass.current = null; audio.current?.stop();
    setState({ phase: "idle", count: 0, message: "" });
  };
  useEffect(() => () => { epoch.current++; pass.current = null; audio.current?.stop(); }, []);
  const start = (interval: number) => {
    cancel();
    const owner = epoch.current;
    const current = { interval, taps: [] as number[], reference: [] as number[], first: undefined as number | undefined };
    pass.current = current;
    setState({ phase: "preparing", count: 0, message: "" });
    audio.current ??= createRhythmAudioSession();
    // Four audible preparation beats; each measured reference is stamped at
    // output dispatch AFTER sample preparation, never at button press.
    void audio.current.play(Array.from({ length: 20 }, (_, i) => ({
      id: `cal-${i}`, timeMs: i * interval, durationMs: interval * 0.45, drum: "hihat_closed" as const,
    })), undefined, () => {
      if (epoch.current !== owner) return;
      pass.current = null;
      try {
        const offset = calibrationResult(current.taps, current.reference, interval);
        apply.current(offset);
        setState({ phase: "done", count: 16, message: `${offset > 0 ? "+" : ""}${offset} ms` });
      } catch {
        setState({ phase: "error", count: current.taps.length, message: "retry" });
      }
    }, (i) => {
      if (epoch.current !== owner) return;
      const time = now();
      if (i === 0) current.first = time;
      if (i >= 4) current.reference[i - 4] = time;
      setState({ phase: "playing", count: current.taps.length, message: i < 4 ? `count-in:${4 - i}` : `beat:${i - 3}` });
    }).catch(() => {
      if (epoch.current !== owner) return;
      pass.current = null;
      setState({ phase: "error", count: current.taps.length, message: "reference-failed" });
    });
  };
  const tap = () => {
    const current = pass.current;
    if (!current || current.first === undefined || current.taps.length >= 17) return;
    const time = now();
    if (time < current.first + current.interval * 3.6) return;
    current.taps.push(time);
    setState((prev) => ({ ...prev, count: current.taps.length }));
  };
  return { ...state, start, tap, cancel };
}

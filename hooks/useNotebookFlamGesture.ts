import { useCallback, useEffect, useRef, useState } from "react";
import type { StaffPoint } from "@/lib/staff-notebook";
import { flamOffset, type NotebookFlam } from "@/lib/notebook-percussion";

type Draft = { id: string; flam: NotebookFlam };
type Press = { start: StaffPoint; units: number; bias: number; activated: boolean; timer?: ReturnType<typeof setTimeout> };

export function useNotebookFlamGesture() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const press = useRef<Press | null>(null);
  const cancelPress = useCallback(() => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  useEffect(() => cancelPress, [cancelPress]);
  const close = useCallback(() => { cancelPress(); setDraft(null); }, [cancelPress]);
  const begin = (start: StaffPoint, units: number, candidate: Draft, grabGrace: boolean, onHold: () => void, immediately = false) => {
    cancelPress();
    const state: Press = { start, units, bias: grabGrace ? candidate.flam.offset : 0, activated: immediately };
    press.current = state;
    if (!immediately) state.timer = setTimeout(() => {
      if (press.current !== state) return;
      state.activated = true;
      setDraft(candidate);
      onHold();
    }, 470);
  };
  const moveOrEnd = (point: StaffPoint, end: boolean) => {
    const state = press.current;
    if (!state) return false;
    const dx = point.x - state.start.x;
    const moved = Math.hypot(dx, point.y - state.start.y);
    if (state.activated && Math.abs(dx) >= 6) {
      setDraft((old) => old && ({
        ...old, flam: { ...old.flam, offset: flamOffset(state.bias + dx * state.units, old.flam.offset) },
      }));
    }
    if (end || !state.activated && moved >= 7) cancelPress();
    return state.activated;
  };
  const setOffset = (value: number) => setDraft((old) => old && ({ ...old, flam: { ...old.flam, offset: flamOffset(value, old.flam.offset) } }));
  return { draft, begin, close, moveOrEnd, setOffset, open: setDraft };
}

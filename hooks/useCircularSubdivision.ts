import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, PanResponder, Platform, type View } from "react-native";
import type { BeatType } from "@/lib/metronome-engine";
import { beginCircularDraft, moveCircularDraft, type CircularDraft, type CircularGeometry } from "@/lib/circular-subdivision";

interface Options {
  enabled: boolean;
  dialRef: React.RefObject<View | null>;
  size: number;
  radius: number;
  width: number;
  height: number;
  beatTypes: BeatType[];
  total: number;
  beatDirection: "cw" | "ccw";
  onCommit: (beat: number, pattern: BeatType[]) => void;
  onTap: (beat: number) => void;
  onClaim: () => void;
}
const HOLD_MS = 400;
interface Pending {
  beat: number; x: number; y: number; pointer: number;
  geometry: CircularGeometry | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export function useCircularSubdivision(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [draft, setDraft] = useState<CircularDraft | null>(null);
  const draftRef = useRef<CircularDraft | null>(null);
  const pending = useRef<Pending | null>(null);
  const suppressClick = useRef(false);
  // Keep the stream claimed even if its draft is discarded (rotation/disable).
  // Otherwise the remainder could become an accidental meter swipe.
  const ownedRef = useRef(false);
  const ownerPointer = useRef<number | null>(null);
  const cancel = useCallback(() => {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = null;
    draftRef.current = null;
    setDraft(null);
  }, []);
  const begin = useCallback((beat: number, x: number, y: number, pointer = 0) => {
    if (!latest.current.enabled || pending.current) return;
    // A new native grant is a new contact, even if an earlier responder was
    // terminated without delivering its release callback.
    ownedRef.current = false;
    ownerPointer.current = null;
    suppressClick.current = false;
    const p: Pending = { beat, x, y, pointer, geometry: null, timer: null };
    pending.current = p;
    const applyGeometry = (left: number, top: number, width: number) => {
      if (pending.current !== p) return;
      const o = latest.current;
      p.geometry = { x: left + width / 2, y: top + width / 2,
        size: width, radius: o.radius * width / o.size };
    };
    const view = latest.current.dialRef.current;
    if (Platform.OS === "web") {
      const rect = (view as unknown as HTMLElement)?.getBoundingClientRect();
      if (rect) applyGeometry(rect.left, rect.top, rect.width);
    } else {
      view?.measureInWindow((left, top, width) => applyGeometry(left, top, width));
    }
    p.timer = setTimeout(() => {
      p.timer = null;
      if (pending.current !== p || !latest.current.enabled || !p.geometry) return;
      const o = latest.current;
      const angle = (o.beatDirection === "ccw" ? -1 : 1) * beat / o.total * 2 * Math.PI - Math.PI / 2;
      const next = beginCircularDraft(beat, p.geometry, angle, o.beatTypes[beat] ?? "normal");
      draftRef.current = next;
      ownedRef.current = true;
      ownerPointer.current = p.pointer;
      suppressClick.current = true;
      o.onClaim();
      setDraft(next);
    }, HOLD_MS);
  }, []);
  const move = useCallback((x: number, y: number) => {
    if (!latest.current.enabled) { cancel(); return; }
    const current = draftRef.current;
    if (current) {
      const next = moveCircularDraft(current, x, y);
      draftRef.current = next;
      setDraft(next);
    } else if (pending.current && Math.hypot(x - pending.current.x, y - pending.current.y) > 12) {
      cancel(); // Ordinary drag remains the parent's meter swipe.
    }
  }, [cancel]);
  const finish = useCallback((x: number, y: number, nativeTap = false) => {
    ownedRef.current = false;
    ownerPointer.current = null;
    const p = pending.current;
    if (!p) return;
    if (draftRef.current) {
      move(x, y);
      const completed = draftRef.current;
      cancel();
      if (completed && latest.current.enabled) latest.current.onCommit(completed.beatIndex, [...completed.notes]);
    } else {
      cancel();
      if (nativeTap && latest.current.enabled) latest.current.onTap(p.beat);
    }
  }, [cancel, move]);

  useEffect(() => {
    cancel();
    return cancel;
  }, [options.enabled, options.width, options.height, options.total, options.beatDirection, cancel]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") cancel();
    });
    return () => subscription.remove();
  }, [cancel]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const down = (event: PointerEvent) => {
      if (ownedRef.current) {
        if (!pending.current && event.isPrimary && event.button === 0) {
          // Focus can be lost outside the document without a pointerup.
          ownedRef.current = false;
          ownerPointer.current = null;
        } else { cancel(); return; }
      }
      if (pending.current && pending.current.pointer !== event.pointerId) { cancel(); return; }
      suppressClick.current = false;
      if (!latest.current.enabled || event.button !== 0 || !event.isPrimary) return;
      const target = event.target instanceof Element ? event.target.closest("[data-circular-beat]") : null;
      const dial = latest.current.dialRef.current as unknown as HTMLElement;
      if (!target || !dial?.contains(target)) return;
      begin(Number(target.getAttribute("data-circular-beat")), event.clientX, event.clientY, event.pointerId);
    };
    const moving = (event: PointerEvent) => {
      if (!pending.current || event.pointerId !== pending.current.pointer) return;
      if (draftRef.current) { event.preventDefault(); event.stopPropagation(); }
      move(event.clientX, event.clientY);
    };
    const up = (event: PointerEvent) => {
      if (ownerPointer.current === event.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        ownedRef.current = false;
        ownerPointer.current = null;
      }
      if (!pending.current || event.pointerId !== pending.current.pointer) return;
      if (draftRef.current) { event.preventDefault(); event.stopPropagation(); }
      finish(event.clientX, event.clientY);
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const lost = (event: PointerEvent) => {
      if (pending.current?.pointer === event.pointerId || ownerPointer.current === event.pointerId) {
        cancel();
        if (event.type === "pointercancel") {
          ownedRef.current = false;
          ownerPointer.current = null;
        }
      }
    };
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", moving, { capture: true, passive: false });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", lost, true);
    document.addEventListener("lostpointercapture", lost, true);
    document.addEventListener("click", click, true);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", moving, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", lost, true);
      document.removeEventListener("lostpointercapture", lost, true);
      document.removeEventListener("click", click, true);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
      cancel();
    };
  }, [begin, move, finish, cancel]);

  const nativeHandlers = useMemo(() => Array.from({ length: options.total }, (_, beat) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.enabled,
      onStartShouldSetPanResponderCapture: () => latest.current.enabled,
      onMoveShouldSetPanResponder: () => !!draftRef.current,
      onPanResponderGrant: (event) => begin(beat, event.nativeEvent.pageX, event.nativeEvent.pageY),
      onPanResponderStart: (event) => {
        if (event.nativeEvent.touches.length > 1) cancel();
      },
      onPanResponderMove: (event, gesture) => {
        if (gesture.numberActiveTouches !== 1) { cancel(); return; }
        move(event.nativeEvent.pageX, event.nativeEvent.pageY);
      },
      onPanResponderRelease: (event) => finish(event.nativeEvent.pageX, event.nativeEvent.pageY, true),
      onPanResponderTerminationRequest: () => !draftRef.current,
      onPanResponderTerminate: cancel,
    }).panHandlers), [options.total, begin, move, finish, cancel]);
  return { draft, draftRef, ownedRef, nativeHandlers, cancel };
}
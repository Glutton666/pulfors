import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Platform,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeTouchEvent,
  type ViewProps,
} from "react-native";

import {
  EasterEggRotationTracker,
  type EasterEggTrigger,
  type RotationPoint,
} from "@/lib/easter-egg-gesture";

interface UseEasterEggGestureOptions {
  enabled: boolean;
  resetKey: string;
  onTrigger: (isHighRange: boolean) => void;
}

interface NativeGestureHandlers {
  onTouchStart: NonNullable<ViewProps["onTouchStart"]>;
  onTouchMove: NonNullable<ViewProps["onTouchMove"]>;
  onTouchEnd: NonNullable<ViewProps["onTouchEnd"]>;
  onTouchCancel: NonNullable<ViewProps["onTouchCancel"]>;
}

function nativePoint(
  event: NativeSyntheticEvent<NativeTouchEvent>,
  useChangedTouches = false,
): RotationPoint | null {
  const touches = useChangedTouches
    ? event.nativeEvent.changedTouches
    : event.nativeEvent.touches;
  const touch = touches?.[0] ?? event.nativeEvent.changedTouches?.[0];
  if (!touch) return null;
  return { x: touch.pageX, y: touch.pageY };
}

export function useEasterEggGesture({
  enabled,
  resetKey,
  onTrigger,
}: UseEasterEggGestureOptions): { nativeGestureHandlers: Partial<NativeGestureHandlers> } {
  const { width, height } = useWindowDimensions();
  const trackerRef = useRef(new EasterEggRotationTracker());
  const onTriggerRef = useRef(onTrigger);
  const lockedRef = useRef(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);

  const center = useMemo<RotationPoint>(() => ({
    x: width / 2,
    y: height / 2,
  }), [width, height]);

  const emitTrigger = useCallback((trigger: EasterEggTrigger | null) => {
    if (!trigger || lockedRef.current) return;
    lockedRef.current = true;
    onTriggerRef.current(trigger.isHighRange);
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      lockedRef.current = false;
      unlockTimerRef.current = null;
    }, 3000);
  }, []);

  const startTracking = useCallback((point: RotationPoint) => {
    if (!enabled) return;
    trackerRef.current.start(center, point);
  }, [center, enabled]);

  const moveTracking = useCallback((point: RotationPoint) => {
    if (!enabled) return;
    trackerRef.current.move(point);
  }, [enabled]);

  const endTracking = useCallback(() => {
    if (!enabled) {
      trackerRef.current.reset();
      return;
    }
    emitTrigger(trackerRef.current.end());
  }, [emitTrigger, enabled]);

  useEffect(() => {
    trackerRef.current.reset();
  }, [enabled, resetKey]);

  useEffect(() => () => {
    trackerRef.current.reset();
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return undefined;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      startTracking({ x: event.clientX, y: event.clientY });
    };
    const handleMouseMove = (event: MouseEvent) => {
      moveTracking({ x: event.clientX, y: event.clientY });
    };
    const handleMouseUp = () => {
      endTracking();
    };
    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) startTracking({ x: touch.clientX, y: touch.clientY });
    };
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) moveTracking({ x: touch.clientX, y: touch.clientY });
    };
    const handleTouchEnd = () => {
      endTracking();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      trackerRef.current.reset();
    };
  }, [enabled, endTracking, moveTracking, startTracking]);

  const nativeGestureHandlers = useMemo<Partial<NativeGestureHandlers>>(() => {
    if (Platform.OS === "web" || !enabled) return {};
    return {
      onTouchStart: (event) => {
        const point = nativePoint(event);
        if (point) startTracking(point);
      },
      onTouchMove: (event) => {
        const point = nativePoint(event);
        if (point) moveTracking(point);
      },
      onTouchEnd: (event) => {
        nativePoint(event, true);
        endTracking();
      },
      onTouchCancel: (event) => {
        nativePoint(event, true);
        endTracking();
      },
    };
  }, [enabled, endTracking, moveTracking, startTracking]);

  return { nativeGestureHandlers };
}
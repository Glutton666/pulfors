import React, { useEffect, useRef } from "react";
import { Platform, View, type GestureResponderEvent } from "react-native";

/** Observes touches without claiming the scroll responder. A drag, a second
 * finger, cancellation or unmount cancels the pending hold. */
export function RhythmHoldToStop({ enabled, onStop, children, minHeight = 0 }: {
  enabled: boolean; onStop: () => void; children: React.ReactNode; minHeight?: number;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef({ enabled, onStop }); latest.current = { enabled, onStop };
  const touchAt = useRef(0);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; origin.current = null; };
  useEffect(() => { if (!enabled) cancel(); }, [enabled]);
  useEffect(() => cancel, []);
  const begin = (x: number, y: number) => {
    cancel();
    if (!latest.current.enabled) return;
    origin.current = { x, y };
    timer.current = setTimeout(() => { cancel(); if (latest.current.enabled) latest.current.onStop(); }, 550);
  };
  const move = (x: number, y: number) => {
    if (origin.current && Math.hypot(x - origin.current.x, y - origin.current.y) > 8) cancel();
  };
  const touch = (event: GestureResponderEvent, start: boolean) => {
    touchAt.current = Date.now();
    if (event.nativeEvent.touches.length !== 1) { cancel(); return; }
    const point = event.nativeEvent.touches[0];
    if (start) begin(point.pageX, point.pageY); else move(point.pageX, point.pageY);
  };
  const web = Platform.OS === "web" ? {
    onMouseDown: (event: any) => { if (event.button === 0 && Date.now() - touchAt.current > 800) begin(event.pageX, event.pageY); },
    onMouseMove: (event: any) => move(event.pageX, event.pageY),
    onMouseUp: cancel, onMouseLeave: cancel,
    onContextMenu: (event: any) => { if (latest.current.enabled) event.preventDefault(); },
  } : {};
  return <View testID="rhythm-stop-area" {...web} onTouchStart={(e) => touch(e, true)} onTouchMove={(e) => touch(e, false)}
    onTouchEnd={cancel} onTouchCancel={cancel} style={{ minHeight }}>{children}</View>;
}

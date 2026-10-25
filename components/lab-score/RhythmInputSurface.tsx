import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, View, type StyleProp, type ViewStyle } from "react-native";

/** Direct responders retain down/up timing inside a scrolling workspace. */
export function RhythmInputSurface({ onDown, onUp, children, style, testID, label, disabled = false }: {
  onDown: () => void; onUp: () => void; children: React.ReactNode;
  style?: StyleProp<ViewStyle>; testID?: string; label: string; disabled?: boolean;
}) {
  const latest = useRef({ onDown, onUp, disabled });
  latest.current = { onDown, onUp, disabled };
  const [pressed, setPressed] = useState(false);
  const held = useRef(false);
  const down = () => { if (!held.current && !latest.current.disabled) { held.current = true; setPressed(true); latest.current.onDown(); } };
  const up = () => { if (held.current) { held.current = false; setPressed(false); latest.current.onUp(); } };
  const actions = useRef({ down, up });
  actions.current = { down, up };
  useEffect(() => { if (disabled) actions.current.up(); }, [disabled]);
  useEffect(() => () => { if (held.current) { held.current = false; latest.current.onUp(); } }, []);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const release = () => actions.current.up();
    const hide = () => { if (document.hidden) release(); };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", hide); };
  }, []);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => actions.current.down(),
    onPanResponderRelease: () => actions.current.up(),
    onPanResponderTerminate: () => actions.current.up(),
    onPanResponderTerminationRequest: () => false,
  }), []);
  const keyboardHandlers = Platform.OS === "web" ? {
    onKeyDown: (event: { nativeEvent: { key: string }; preventDefault: () => void }) => {
      if (event.nativeEvent.key === " " || event.nativeEvent.key === "Enter") { event.preventDefault(); down(); }
    },
    onKeyUp: (event: { nativeEvent: { key: string } }) => {
      if (event.nativeEvent.key === " " || event.nativeEvent.key === "Enter") up();
    },
    onBlur: up,
  } : {};
  return <View {...responder.panHandlers} focusable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} aria-pressed={pressed}
    {...keyboardHandlers}
    onAccessibilityTap={() => { down(); up(); }}
    testID={testID} style={[style, { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]}>{children}</View>;
}

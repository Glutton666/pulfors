import React, { useMemo, useRef } from "react";
import { PanResponder, Platform, View, type StyleProp, type ViewStyle } from "react-native";

/** Direct responders retain down/up timing inside a scrolling workspace. */
export function RhythmInputSurface({ onDown, onUp, children, style, testID, label }: {
  onDown: () => void; onUp: () => void; children: React.ReactNode;
  style?: StyleProp<ViewStyle>; testID?: string; label: string;
}) {
  const latest = useRef({ onDown, onUp });
  latest.current = { onDown, onUp };
  const held = useRef(false);
  const down = () => { if (!held.current) { held.current = true; latest.current.onDown(); } };
  const up = () => { if (held.current) { held.current = false; latest.current.onUp(); } };
  const actions = useRef({ down, up });
  actions.current = { down, up };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => actions.current.down(),
    onPanResponderRelease: () => actions.current.up(),
    onPanResponderTerminate: () => actions.current.up(),
    onPanResponderTerminationRequest: () => false,
  }), []);
  const keyboardHandlers = Platform.OS === "web" ? {
    onKeyDown: (event: { nativeEvent: { key: string } }) => {
      if (event.nativeEvent.key === " " || event.nativeEvent.key === "Enter") down();
    },
    onKeyUp: (event: { nativeEvent: { key: string } }) => {
      if (event.nativeEvent.key === " " || event.nativeEvent.key === "Enter") up();
    },
    onBlur: up,
  } : {};
  return <View {...responder.panHandlers} focusable accessibilityRole="button" accessibilityLabel={label}
    {...keyboardHandlers}
    onAccessibilityTap={() => { down(); up(); }}
    testID={testID} style={style}>{children}</View>;
}

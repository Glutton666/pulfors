import React, { useEffect, useRef, useState } from "react";
import { Platform, Text, View, type GestureResponderEvent } from "react-native";

const white = [60, 62, 64, 65, 67, 69, 71, 72];
const black = [{ after: 0, midi: 61 }, { after: 1, midi: 63 }, { after: 3, midi: 66 }, { after: 4, midi: 68 }, { after: 5, midi: 70 }];
const computerKeys = "awsedftgyhujk";

/** One touch owner maps every finger separately; independent PanResponders
 * cannot own simultaneous fingers on different keys. */
export function RhythmKeyboard({ onDown, onUp, disabled = false }: { onDown: (midi: number) => void; onUp: (midi: number) => void; disabled?: boolean }) {
  const [width, setWidth] = useState(300);
  const [active, setActive] = useState<number[]>([]);
  const held = useRef(new Map<string, number>());
  const latest = useRef({ onDown, onUp, disabled });
  latest.current = { onDown, onUp, disabled };
  const suppressMouseUntil = useRef(0);
  const publish = () => setActive([...new Set(held.current.values())]);
  const down = (id: string, midi: number) => {
    if (latest.current.disabled || held.current.has(id)) return;
    const alreadySounds = [...held.current.values()].includes(midi);
    held.current.set(id, midi);
    if (!alreadySounds) latest.current.onDown(midi);
    publish();
  };
  const up = (id: string) => {
    const midi = held.current.get(id);
    held.current.delete(id);
    if (midi !== undefined && ![...held.current.values()].includes(midi)) latest.current.onUp(midi);
    publish();
  };
  const releaseAll = () => {
    const notes = [...new Set(held.current.values())];
    held.current.clear(); setActive([]);
    notes.forEach((midi) => latest.current.onUp(midi));
  };
  const releaseAllRef = useRef(releaseAll);
  releaseAllRef.current = releaseAll;
  useEffect(() => {
    if (disabled) releaseAllRef.current();
  }, [disabled]);
  useEffect(() => () => {
    const notes = [...new Set(held.current.values())];
    held.current.clear();
    notes.forEach((midi) => latest.current.onUp(midi));
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const release = () => releaseAllRef.current();
    const hide = () => { if (document.hidden) release(); };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", hide); };
  }, []);
  const midiAt = (x: number, y: number) => {
    const keyWidth = width / 8;
    const upper = y < 76 ? black.find((key) => Math.abs(x - (key.after + 1) * keyWidth) < keyWidth * 0.29) : undefined;
    return upper?.midi ?? white[Math.max(0, Math.min(7, Math.floor(x / keyWidth)))];
  };
  const touchStart = (event: GestureResponderEvent) => {
    suppressMouseUntil.current = Date.now() + 800;
    for (const touch of event.nativeEvent.changedTouches) down(String(touch.identifier), midiAt(touch.locationX, touch.locationY));
  };
  const touchEnd = (event: GestureResponderEvent) => {
    suppressMouseUntil.current = Date.now() + 800;
    for (const touch of event.nativeEvent.changedTouches) up(String(touch.identifier));
  };
  const web = Platform.OS === "web" ? {
    onMouseDown: (event: { nativeEvent: { offsetX: number; offsetY: number } }) => {
      if (Date.now() >= suppressMouseUntil.current) down("mouse", midiAt(event.nativeEvent.offsetX, event.nativeEvent.offsetY));
    },
    onMouseUp: () => up("mouse"),
    onMouseLeave: () => up("mouse"),
    onKeyDown: (event: { nativeEvent: { key: string }; preventDefault: () => void }) => {
      const key = event.nativeEvent.key.toLowerCase(), index = computerKeys.indexOf(key);
      if (index >= 0 && key.length === 1) { event.preventDefault(); down(`keyboard-${key}`, 60 + index); }
    },
    onKeyUp: (event: { nativeEvent: { key: string } }) => up(`keyboard-${event.nativeEvent.key.toLowerCase()}`),
    onBlur: releaseAll,
  } : {};
  return <View {...web} focusable accessibilityLabel="Piano keyboard: A W S E D F T G Y H U J K"
    accessibilityState={{ disabled }} testID="rhythm-keyboard" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={releaseAll}
    style={{ height: 120, width: "100%", flexDirection: "row", opacity: disabled ? 0.45 : 1 }}>
    {white.map((midi) => <View pointerEvents="none" key={midi} style={{
      flex: 1, backgroundColor: active.includes(midi) ? "#e8c968" : "#fff", borderColor: "#333", borderWidth: 1,
      borderBottomLeftRadius: 5, borderBottomRightRadius: 5, justifyContent: "flex-end", alignItems: "center", paddingBottom: 8,
    }}><Text style={{ color: "#111", fontSize: 10 }}>{midi}</Text></View>)}
    {black.map(({ after, midi }) => <View pointerEvents="none" key={midi} style={{
      position: "absolute", left: (after + 1 - 0.29) * width / 8, width: width / 8 * 0.58,
      height: 76, backgroundColor: active.includes(midi) ? "#9a7527" : "#171717", borderRadius: 3,
    }} />)}
  </View>;
}

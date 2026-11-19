import React, { useCallback, useEffect, useRef, useState } from "react";
import { PanResponder, Platform, View } from "react-native";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatPolygonOffsetMs } from "@/lib/polygon-offset";
import { createPolygonOffsetGesture } from "@/lib/polygon-offset-gesture";

interface Props {
  x: number;
  y: number;
  radius: number;
  vertexIdx: number;
  offset: number;
  slotMs: number;
  onTap: () => void;
  onHold: () => void;
  onPreview: (preview: { ms: number; offset: number } | null) => void;
  onCommit: (offset: number) => void;
}

export function PolygonVertexTarget(props: Props) {
  const { t } = useLanguage();
  const latest = useRef(props);
  useEffect(() => { latest.current = props; }, [props]);
  const session = useRef<{
    gesture: ReturnType<typeof createPolygonOffsetGesture>;
    timer: ReturnType<typeof setTimeout>;
    didHold: boolean;
    draft: { ms: number; offset: number } | null;
  } | null>(null);

  const end = useCallback((commit: boolean) => {
    const active = session.current;
    if (!active) return;
    session.current = null;
    clearTimeout(active.timer);
    if (active.draft) {
      latest.current.onPreview(null);
      if (commit) latest.current.onCommit(active.draft.offset);
    } else if (commit && !active.didHold && !active.gesture.moved) {
      latest.current.onTap();
    }
  }, []);
  useEffect(() => () => end(false), [end]);

  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      end(false);
      const { offset, slotMs } = latest.current;
      const timer = setTimeout(() => {
        const active = session.current;
        if (!active || active.timer !== timer || active.gesture.moved) return;
        active.didHold = true;
        latest.current.onHold();
      }, 400);
      session.current = { gesture: createPolygonOffsetGesture(offset, slotMs), timer, didHold: false, draft: null };
    },
    onPanResponderStart: (event) => {
      if (event.nativeEvent.touches.length > 1) end(false);
    },
    onPanResponderMove: (_, { dx, dy }) => {
      const active = session.current;
      if (!active || active.didHold) return;
      const preview = active.gesture.update(dx, dy, Date.now());
      if (active.gesture.moved) clearTimeout(active.timer);
      if (preview && (!active.draft || active.draft.offset !== preview.offset)) {
        active.draft = preview;
        latest.current.onPreview(preview);
      }
    },
    onPanResponderRelease: () => end(true),
    onPanResponderTerminate: () => end(false),
    onPanResponderTerminationRequest: () => false,
  }));

  const { x, y, radius, vertexIdx, offset, slotMs, onTap, onHold } = props;
  const webKeyboard = Platform.OS === "web" ? ({
    tabIndex: 0,
    dataSet: { capturesKeys: "true" },
    onKeyDown: (event: { key: string; shiftKey: boolean; repeat: boolean; preventDefault: () => void }) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!event.repeat) (event.shiftKey ? onHold : onTap)();
    },
  } as unknown as React.ComponentProps<typeof View>) : {};

  return (
    <View
      testID={`polygon-vertex-${vertexIdx}`}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${t("polygon", "offsetTitle").replace("{{n}}", String(vertexIdx + 1))}: ${formatPolygonOffsetMs(offset * slotMs)}`}
      accessibilityHint={t("polygon", "vertexTimingHint")}
      accessibilityActions={[
        { name: "activate", label: t("polygon", "muteVertex") },
        { name: "editTiming", label: t("polygon", "editTiming") },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "activate") onTap();
        if (nativeEvent.actionName === "editTiming") onHold();
      }}
      {...webKeyboard}
      {...responder.panHandlers}
      style={{
        position: "absolute", left: x - radius, top: y - radius, width: radius * 2, height: radius * 2,
        borderRadius: radius,
        ...(Platform.OS === "web" ? { touchAction: "none" as const, userSelect: "none" as const } : {}),
      }}
    />
  );
}

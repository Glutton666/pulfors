import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, Platform, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { LoopBlock } from "./beat-indicator.types";
import type { ProgressInfo } from "@/lib/metronome-engine";

export interface BlockPillProps {
  origIndex: number;
  block: LoopBlock;
  isEditing: boolean;
  isActive: boolean;
  isPlaying: boolean;
  isDragSource: boolean;
  isDropTarget: boolean;
  hasJump: boolean;
  layerCount: number;
  beatsPerMeasure: number;
  progressInfo?: ProgressInfo | null;
  accentColor: string;
  textColor: string;
  textTertiaryColor: string;
  bgSecondary: string;
  whiteColor: string;
  onPress: () => void;
  onDragStart: (origIndex: number) => void;
  onDragMove: (origIndex: number, pageX: number, pageY: number) => void;
  onDragEnd: (origIndex: number, pageX: number, pageY: number) => void;
  onMeasure: (origIndex: number, layout: { x: number; y: number; w: number; h: number }) => void;
  size?: "small" | "normal";
}

export const BlockPill = React.memo(function BlockPill({
  origIndex, block, isEditing, isActive, isPlaying, isDragSource, isDropTarget, hasJump,
  layerCount, beatsPerMeasure, progressInfo, accentColor, textColor, textTertiaryColor,
  bgSecondary, whiteColor, onPress, onDragStart, onDragMove, onDragEnd, onMeasure, size = "small",
}: BlockPillProps) {
  const pillRef = useRef<View>(null);
  const isDraggingRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const origIndexRef = useRef(origIndex);
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { origIndexRef.current = origIndex; }, [origIndex]);
  useEffect(() => { onDragStartRef.current = onDragStart; }, [onDragStart]);
  useEffect(() => { onDragMoveRef.current = onDragMove; }, [onDragMove]);
  useEffect(() => { onDragEndRef.current = onDragEnd; }, [onDragEnd]);

  useEffect(() => {
    if (!pillRef.current) return;
    const measure = () => (pillRef.current as any)?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
      if (w > 0) onMeasure(origIndex, { x, y, w, h });
    });
    setTimeout(measure, 50);
  }, [origIndex, block.startBeat, block.endBeat]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        if (isPlayingRef.current) return false;
        return Math.abs(gs.dy) > 10;
      },
      onPanResponderGrant: () => { isDraggingRef.current = false; },
      onPanResponderMove: (e, gs) => {
        const idx = origIndexRef.current;
        if (isDraggingRef.current) {
          onDragMoveRef.current(idx, e.nativeEvent.pageX, e.nativeEvent.pageY);
          return;
        }
        if (Math.abs(gs.dy) > 10) {
          isDraggingRef.current = true;
          onDragStartRef.current(idx);
          onDragMoveRef.current(idx, e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
      },
      onPanResponderRelease: (e) => {
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          onDragEndRef.current(origIndexRef.current, e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
      },
      onPanResponderTerminate: (e) => {
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          onDragEndRef.current(origIndexRef.current, e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
      },
    })
  ).current;

  const webGestureRef = useRef({ isDown: false, startX: 0, startY: 0, isDragging: false });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = pillRef.current as unknown as HTMLElement;
    if (!node?.addEventListener) return;

    const handleDown = (e: PointerEvent) => {
      webGestureRef.current = { isDown: true, startX: e.clientX, startY: e.clientY, isDragging: false };
    };
    const handleMove = (e: PointerEvent) => {
      const g = webGestureRef.current;
      if (!g.isDown || isPlayingRef.current) return;
      const idx = origIndexRef.current;
      if (g.isDragging) {
        onDragMoveRef.current(idx, e.clientX, e.clientY);
        return;
      }
      const dy = e.clientY - g.startY;
      if (Math.abs(dy) > 10) {
        g.isDragging = true;
        onDragStartRef.current(idx);
        onDragMoveRef.current(idx, e.clientX, e.clientY);
      }
    };
    const handleUp = (e: PointerEvent) => {
      const g = webGestureRef.current;
      if (g.isDragging) {
        onDragEndRef.current(origIndexRef.current, e.clientX, e.clientY);
      }
      webGestureRef.current = { isDown: false, startX: 0, startY: 0, isDragging: false };
    };

    node.addEventListener("pointerdown", handleDown, true);
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      node.removeEventListener("pointerdown", handleDown, true);
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, []);

  const nativePan = Platform.OS !== "web" ? panResponder.panHandlers : {};
  const isSmall = size === "small";
  const px = isSmall ? 6 : 8;
  const py = isSmall ? 2 : 4;
  const br = isSmall ? 4 : 6;
  const mw = isSmall ? 36 : 48;
  const fs1 = isSmall ? 10 : 12;
  const fs2 = isSmall ? 8 : 9;
  const badgeSize = isSmall ? { top: -3, right: -3, r: 5, mw: 10, h: 10, px: 1, fs: 6 } : { top: -4, right: -4, r: 6, mw: 12, h: 12, px: 2, fs: 7 };

  return (
    <View ref={pillRef} {...nativePan}>
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: px, paddingVertical: py, borderRadius: br,
          backgroundColor: isDropTarget ? accentColor + "50" : isActive ? accentColor + "30" : isEditing ? accentColor + "20" : bgSecondary,
          borderWidth: isDropTarget ? 2 : isActive ? (isSmall ? 1 : 1.5) : isEditing ? 1 : 0,
          borderColor: isDropTarget ? accentColor : isActive ? accentColor : isEditing ? accentColor + "60" : "transparent",
          minWidth: mw, alignItems: "center",
          opacity: isDragSource ? 0.3 : 1,
        }}
      >
        <Text style={{ color: isActive ? accentColor : textColor, fontSize: fs1, fontFamily: "SpaceGrotesk_700Bold" }}>
          {block.startBeat + 1}-{Math.min(block.endBeat + 1, beatsPerMeasure)}
        </Text>
        <Text style={{ color: isActive ? accentColor : textTertiaryColor, fontSize: fs2, fontFamily: "SpaceGrotesk_500Medium" }}>
          ×{block.value}
          {block.soundSet ? ` ♪` : ""}
          {isActive && progressInfo && progressInfo.blockRepeatTotal > 1 && ` ${progressInfo.blockRepeatCurrent + 1}/${progressInfo.blockRepeatTotal}`}
        </Text>
        {layerCount > 0 && (
          <View style={{ position: "absolute", top: badgeSize.top, right: badgeSize.right, backgroundColor: accentColor, borderRadius: badgeSize.r, minWidth: badgeSize.mw, height: badgeSize.h, alignItems: "center", justifyContent: "center", paddingHorizontal: badgeSize.px }}>
            <Ionicons name="layers-outline" size={badgeSize.fs + 1} color={whiteColor} />
          </View>
        )}
      </Pressable>
    </View>
  );
});

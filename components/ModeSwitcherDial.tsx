import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";

export type ModeSlot = "beat" | "bar" | "score" | "note" | "stage" | "menu";

type Wall = "top" | "right" | "bottom" | "left";
type WallPos = { wall: Wall; t: number };

const MODES: ModeSlot[] = ["beat", "bar", "score", "note", "stage", "menu"];
const WALL_KEY = "metronome_dial_wall_v2";

const Z_OVERLAY = 100000;
const Z_FAN     = 100001;
const Z_BUTTON  = 100002;

// Fan geometry — semicircle perpendicular to the wall.
// ICON_R must stay ≤ FAN_R/2 so icons sit inside the semicircle bg.
const FAN_R  = 180;  // full diameter of the fan semicircle
const ICON_R = 78;   // icon arc radius (≤ FAN_R/2 = 90)
const ICON_S = 34;   // icon slot circle size
const BTN_MARGIN = 14;

// ── Arc angles (120° spread centered on inward perpendicular) ────────────────
// Standard math angles: right=0°, down=90°, left=180°, up=270°
function fanAngles(wall: Wall): { start: number; end: number } {
  switch (wall) {
    case "top":    return { start:  30, end: 150 }; // centered on 90°  (↓)
    case "right":  return { start: 120, end: 240 }; // centered on 180° (←)
    case "bottom": return { start: 210, end: 330 }; // centered on 270° (↑)
    case "left":   return { start: 300, end: 420 }; // centered on 0°   (→)
  }
}

// ── Fan background geometry (relative to button-center anchor = 0,0) ─────────
function fanBgOffset(wall: Wall): { x: number; y: number } {
  const r = FAN_R / 2;
  switch (wall) {
    case "top":    return { x: -r, y:  0 };
    case "right":  return { x: -r, y: -r };
    case "bottom": return { x: -r, y: -r };
    case "left":   return { x:  0, y: -r };
  }
}
function fanBgSize(wall: Wall): { w: number; h: number } {
  if (wall === "top" || wall === "bottom") return { w: FAN_R, h: FAN_R / 2 };
  return { w: FAN_R / 2, h: FAN_R };
}
function fanBgCorners(wall: Wall): object {
  const r = FAN_R / 2;
  switch (wall) {
    case "top":    return { borderBottomLeftRadius: r, borderBottomRightRadius: r };
    case "right":  return { borderTopLeftRadius:    r, borderBottomLeftRadius:  r };
    case "bottom": return { borderTopLeftRadius:    r, borderTopRightRadius:    r };
    case "left":   return { borderTopRightRadius:   r, borderBottomRightRadius: r };
  }
}

// ── Nearest mode by angle from button center ─────────────────────────────────
function nearestModeIdx(
  touchX: number, touchY: number,
  cx: number,     cy: number,
  wall: Wall,
): number {
  const { start, end } = fanAngles(wall);
  const dx = touchX - cx;
  const dy = touchY - cy;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;

  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < MODES.length; i++) {
    const modeAngle = (start + ((end - start) / (MODES.length - 1)) * i) % 360;
    let diff = Math.abs(angle - modeAngle);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  }
  return bestIdx;
}

// ── Wall snapping ─────────────────────────────────────────────────────────────
function snapToWall(touchX: number, touchY: number, winW: number, winH: number, topInset: number): WallPos {
  const dTop    = touchY - topInset;
  const dBottom = winH - touchY;
  const dLeft   = touchX;
  const dRight  = winW - touchX;
  const minD    = Math.min(dTop, dBottom, dLeft, dRight);
  const clamp   = (v: number) => Math.min(1, Math.max(0, v));
  if (minD === dTop)    return { wall: "top",    t: clamp(touchX / winW) };
  if (minD === dBottom) return { wall: "bottom", t: clamp(touchX / winW) };
  if (minD === dLeft)   return { wall: "left",   t: clamp((touchY - topInset) / (winH - topInset)) };
  return                       { wall: "right",  t: clamp((touchY - topInset) / (winH - topInset)) };
}

// ── Button center from WallPos ────────────────────────────────────────────────
function computeCenter(wp: WallPos, winW: number, winH: number, topInset: number, btnHalf: number) {
  const m = BTN_MARGIN + btnHalf;
  switch (wp.wall) {
    case "top":    return { x: Math.max(m, Math.min(winW - m, wp.t * winW)), y: topInset + m };
    case "bottom": return { x: Math.max(m, Math.min(winW - m, wp.t * winW)), y: winH - m };
    case "left":   return { x: m, y: Math.max(topInset + m, Math.min(winH - m, topInset + wp.t * (winH - topInset))) };
    case "right":  return { x: winW - m, y: Math.max(topInset + m, Math.min(winH - m, topInset + wp.t * (winH - topInset))) };
  }
}

// ── Mode icons ────────────────────────────────────────────────────────────────
function ModeIcon({ mode, size, color }: { mode: ModeSlot; size: number; color: string }) {
  switch (mode) {
    case "beat":  return <Ionicons name="musical-note"  size={size} color={color} />;
    case "bar":   return <Ionicons name="reorder-three" size={size} color={color} />;
    case "score": return <Ionicons name="musical-notes" size={size} color={color} />;
    case "note":  return <Ionicons name="list"          size={size} color={color} />;
    case "stage": return <Ionicons name="mic-outline"   size={size} color={color} />;
    case "menu":  return <Ionicons name="menu"          size={size} color={color} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

interface ModeSwitcherDialProps {
  currentMode: ModeSlot;
  onSelectMode: (mode: ModeSlot) => void;
  topInset: number;
  isLandscape: boolean;
  isPlaying?: boolean;
}

export function ModeSwitcherDial({
  currentMode,
  onSelectMode,
  topInset,
  isLandscape,
  isPlaying,
}: ModeSwitcherDialProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const { width: winW, height: winH } = useWindowDimensions();

  const BTN_SIZE = S.ms(36, 0.4);
  const BTN_HALF = BTN_SIZE / 2;

  // ── Wall position ────────────────────────────────────────────────────────
  const defaultWP: WallPos = { wall: "right", t: 0.1 };
  const [wallPos, setWallPos] = useState<WallPos>(defaultWP);
  const wallPosRef = useRef<WallPos>(defaultWP);

  useEffect(() => {
    AsyncStorage.getItem(WALL_KEY).then((raw) => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw) as WallPos;
        if ((p.wall === "top" || p.wall === "right" || p.wall === "bottom" || p.wall === "left") &&
            typeof p.t === "number") {
          setWallPos(p);
          wallPosRef.current = p;
        }
      } catch {}
    });
  }, []);

  // ── Open/close ───────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // ── Swipe highlight ───────────────────────────────────────────────────────
  const [swipeIdx, setSwipeIdx] = useState<number | null>(null);
  const swipeIdxRef = useRef<number | null>(null);
  const activeIdxRef = useRef(Math.max(0, MODES.indexOf(currentMode)));
  useEffect(() => {
    const idx = MODES.indexOf(currentMode);
    if (idx >= 0) activeIdxRef.current = idx;
  }, [currentMode]);

  // ── Drag-to-reposition state ─────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  // ── Animations ───────────────────────────────────────────────────────────
  const fanScale   = useSharedValue(0.05);
  const fanOpacity = useSharedValue(0);
  const overlayOp  = useSharedValue(0);

  const doOpen = useCallback(() => {
    setIsOpen(true);
    isOpenRef.current = true;
    setSwipeIdx(null);
    swipeIdxRef.current = null;
    fanScale.value   = withTiming(1,   { duration: 230, easing: Easing.out(Easing.cubic) });
    fanOpacity.value = withTiming(1,   { duration: 190 });
    overlayOp.value  = withTiming(0.5, { duration: 190 });
  }, [fanScale, fanOpacity, overlayOp]);

  const doClose = useCallback(() => {
    fanScale.value   = withTiming(0.05, { duration: 180, easing: Easing.in(Easing.cubic) });
    fanOpacity.value = withTiming(0,    { duration: 160 });
    overlayOp.value  = withTiming(0,    { duration: 160 });
    setTimeout(() => {
      setIsOpen(false);
      isOpenRef.current = false;
      setSwipeIdx(null);
      swipeIdxRef.current = null;
    }, 190);
  }, [fanScale, fanOpacity, overlayOp]);

  const onSelectModeRef = useRef(onSelectMode);
  useEffect(() => { onSelectModeRef.current = onSelectMode; }, [onSelectMode]);

  // ── Live refs for PanResponder stale-closure safety ──────────────────────
  const winWRef      = useRef(winW);
  const winHRef      = useRef(winH);
  const topInsetRef  = useRef(topInset);
  const centerRef    = useRef({ x: 0, y: 0 });  // updated each render
  const wallRef      = useRef<Wall>("right");     // updated each render

  useEffect(() => { winWRef.current = winW; },         [winW]);
  useEffect(() => { winHRef.current = winH; },         [winH]);
  useEffect(() => { topInsetRef.current = topInset; }, [topInset]);

  // ── Button PanResponder (tap = toggle, drag = reposition) ────────────────
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buttonPR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDraggingRef.current = false;
        longPressRef.current = setTimeout(() => {
          isDraggingRef.current = true;
          setIsDragging(true);
        }, 420);
      },
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 || Math.abs(gs.dy) > 8,
      onPanResponderMove: (_, gs) => {
        if (!isDraggingRef.current && (Math.abs(gs.dx) > 8 || Math.abs(gs.dy) > 8)) {
          isDraggingRef.current = true;
          setIsDragging(true);
          if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
        }
      },
      onPanResponderRelease: (e) => {
        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          setIsDragging(false);
          const newWP = snapToWall(
            e.nativeEvent.pageX, e.nativeEvent.pageY,
            winWRef.current, winHRef.current, topInsetRef.current,
          );
          setWallPos(newWP);
          wallPosRef.current = newWP;
          AsyncStorage.setItem(WALL_KEY, JSON.stringify(newWP));
        } else {
          if (isOpenRef.current) doClose(); else doOpen();
        }
      },
      onPanResponderTerminate: () => {
        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
        isDraggingRef.current = false;
        setIsDragging(false);
      },
    })
  ).current;

  // ── Fan swipe PanResponder ────────────────────────────────────────────────
  // Covers the entire fan background area. Swipe to highlight a mode;
  // release to select. A stationary tap selects the nearest icon too.
  const fanSwipePR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const idx = nearestModeIdx(
          e.nativeEvent.pageX, e.nativeEvent.pageY,
          centerRef.current.x, centerRef.current.y,
          wallRef.current,
        );
        swipeIdxRef.current = idx;
        setSwipeIdx(idx);
      },
      onPanResponderMove: (e) => {
        const idx = nearestModeIdx(
          e.nativeEvent.pageX, e.nativeEvent.pageY,
          centerRef.current.x, centerRef.current.y,
          wallRef.current,
        );
        if (idx !== swipeIdxRef.current) {
          swipeIdxRef.current = idx;
          setSwipeIdx(idx);
        }
      },
      onPanResponderRelease: () => {
        const idx = swipeIdxRef.current;
        if (idx !== null) {
          const mode = MODES[idx];
          doClose();
          setTimeout(() => onSelectModeRef.current(mode), 175);
        } else {
          doClose();
        }
      },
      onPanResponderTerminate: () => {
        setSwipeIdx(null);
        swipeIdxRef.current = null;
      },
    })
  ).current;

  // ── Animated styles ───────────────────────────────────────────────────────
  const overlayAnimStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));
  const fanAnimStyle     = useAnimatedStyle(() => ({
    opacity:   fanOpacity.value,
    transform: [{ scale: fanScale.value }],
  }));

  // ── Geometry (computed each render; sync to refs for PanResponder) ────────
  const center = computeCenter(wallPos, winW, winH, topInset, BTN_HALF);
  // Keep refs in sync synchronously (safe in render for refs)
  centerRef.current = center;
  wallRef.current   = wallPos.wall;

  const wall       = wallPos.wall;
  const { start: aStart, end: aEnd } = fanAngles(wall);
  const bgOff      = fanBgOffset(wall);
  const bgSz       = fanBgSize(wall);
  const bgCorners  = fanBgCorners(wall);

  const iconSlots = MODES.map((mode, i) => {
    const deg = aStart + ((aEnd - aStart) / (MODES.length - 1)) * i;
    const rad = (deg % 360) * (Math.PI / 180);
    return { mode, i, dx: Math.cos(rad) * ICON_R, dy: Math.sin(rad) * ICON_R };
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Dark overlay — tap to close */}
      {isOpen && (
        <Animated.View
          style={[
            {
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              zIndex: Z_OVERLAY,
              backgroundColor: "#000",
              pointerEvents: "box-none" as const,
            },
            overlayAnimStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={doClose} testID="mode-dial-overlay" />
        </Animated.View>
      )}

      {/*
        Fan anchor — 0×0 View at button center.
        scale transform grows the fan outward from the button.
      */}
      {isOpen && (
        <Animated.View
          style={[
            {
              position: "absolute",
              zIndex: Z_FAN,
              left: center.x,
              top:  center.y,
              width: 0, height: 0,
              overflow: "visible" as const,
              pointerEvents: "box-none" as const,
            },
            fanAnimStyle,
          ]}
        >
          {/* Solid semicircle background */}
          <View
            style={{
              position: "absolute",
              left: bgOff.x, top: bgOff.y,
              width: bgSz.w, height: bgSz.h,
              backgroundColor: C.surface,
              ...bgCorners,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.45,
              shadowRadius: 16,
              elevation: 14,
              pointerEvents: "none" as const,
            }}
          />

          {/* Swipe capture layer — same bounds as the semicircle background.
              One PanResponder handles all swipe / tap selection. */}
          <View
            {...fanSwipePR.panHandlers}
            style={{
              position: "absolute",
              left: bgOff.x, top: bgOff.y,
              width: bgSz.w, height: bgSz.h,
            }}
          />

          {/* Mode icons along the arc — visual only (touch handled by swipe layer) */}
          {iconSlots.map(({ mode, i, dx, dy }) => {
            const isHighlighted = swipeIdx !== null ? i === swipeIdx : mode === currentMode;
            return (
              <View
                key={mode}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: dx - ICON_S / 2,
                  top:  dy - ICON_S / 2,
                  width: ICON_S, height: ICON_S,
                  borderRadius: ICON_S / 2,
                  backgroundColor: isHighlighted ? C.accent : C.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  // Enlarge the highlighted icon slightly
                  transform: isHighlighted ? [{ scale: 1.18 }] : [{ scale: 1 }],
                }}
              >
                <ModeIcon
                  mode={mode}
                  size={S.ms(14, 0.3)}
                  color={isHighlighted ? "#fff" : C.textSecondary}
                />
                <Text
                  style={{
                    fontSize: 7,
                    color: isHighlighted ? "#fff" : C.textTertiary,
                    fontFamily: "SpaceGrotesk_500Medium",
                    letterSpacing: 0.3,
                    lineHeight: 9,
                  }}
                  numberOfLines={1}
                >
                  {t("switcher", mode as "beat" | "bar" | "score" | "note" | "stage" | "menu")}
                </Text>
              </View>
            );
          })}
        </Animated.View>
      )}

      {/* Floating button */}
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("switcher", "openDial")}
        accessibilityState={{ expanded: isOpen }}
        style={{
          position: "absolute",
          zIndex: Z_BUTTON,
          left: center.x - BTN_HALF,
          top:  center.y - BTN_HALF,
          width: BTN_SIZE, height: BTN_SIZE,
          opacity: isDragging ? 0.5 : 1,
        }}
        {...buttonPR.panHandlers}
      >
        <View
          style={{
            width: BTN_SIZE, height: BTN_SIZE,
            borderRadius: BTN_HALF,
            backgroundColor: isOpen ? C.accent : C.surface,
            borderWidth: 1,
            borderColor: isOpen ? C.accent : C.border,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: isOpen ? C.accent : "#000",
            shadowOffset: { width: 0, height: isOpen ? 0 : 2 },
            shadowOpacity: isOpen ? 0.55 : 0.22,
            shadowRadius: isOpen ? 14 : 4,
            elevation: isOpen ? 10 : 4,
          }}
          testID="mode-switcher-button"
        >
          <ModeIcon
            mode={currentMode}
            size={S.ms(16, 0.4)}
            color={isOpen ? "#fff" : C.textSecondary}
          />
        </View>
      </Animated.View>
    </>
  );
}

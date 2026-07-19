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

// Which screen wall the button is attached to, and how far along (0=start, 1=end)
type Wall = "top" | "right" | "bottom" | "left";
type WallPos = { wall: Wall; t: number };

const MODES: ModeSlot[] = ["beat", "bar", "score", "note", "stage", "menu"];
const WALL_KEY = "metronome_dial_wall_v2";

// zIndex — above stage mode overlay (99998)
const Z_OVERLAY = 100000;
const Z_FAN     = 100001;
const Z_BUTTON  = 100002;

// Fan geometry
// Background = semicircle perpendicular to wall.
// Semicircle shape:  FAN_R wide × FAN_R/2 deep (for top/bottom walls)
//                 or FAN_R/2 wide × FAN_R deep  (for left/right walls)
// Icons spread 120° centered on the inward perpendicular, at radius ICON_R.
// ICON_R must be ≤ FAN_R/2 so icons stay inside the semicircle.
const FAN_R  = 180;  // diameter of the fan semicircle
const ICON_R = 78;   // icon arc radius  (≤ FAN_R/2 = 90)
const ICON_S = 32;   // icon slot circle size
const BTN_MARGIN = 14; // button gap from screen edge

// ── Fan arc angles ───────────────────────────────────────────────────────────
// Standard math: right=0°, down=90°, left=180°, up=270°
// 120° spread centered on inward perpendicular for each wall.
function fanAngles(wall: Wall): { start: number; end: number } {
  switch (wall) {
    case "top":    return { start:  30, end: 150 }; // centered on 90°  (down)
    case "right":  return { start: 120, end: 240 }; // centered on 180° (left)
    case "bottom": return { start: 210, end: 330 }; // centered on 270° (up)
    case "left":   return { start: 300, end: 420 }; // centered on 360° (right) — wraps fine
  }
}

// ── Fan background position (relative to button center = anchor) ─────────────
// Background rectangle top-left corner, relative to anchor (which is at button center).
function fanBgOffset(wall: Wall): { x: number; y: number } {
  const r = FAN_R / 2;
  switch (wall) {
    case "top":    return { x: -r, y:  0 }; // extends downward
    case "right":  return { x: -r, y: -r }; // extends leftward
    case "bottom": return { x: -r, y: -r }; // extends upward
    case "left":   return { x:  0, y: -r }; // extends rightward
  }
}

// ── Fan background size ───────────────────────────────────────────────────────
function fanBgSize(wall: Wall): { w: number; h: number } {
  if (wall === "top" || wall === "bottom") return { w: FAN_R, h: FAN_R / 2 };
  return { w: FAN_R / 2, h: FAN_R };
}

// ── Fan background corner radii (creates semicircle) ─────────────────────────
// Two adjacent corners on the "open" side get radius = FAN_R/2.
function fanBgCorners(wall: Wall): object {
  const r = FAN_R / 2;
  switch (wall) {
    case "top":    return { borderBottomLeftRadius: r, borderBottomRightRadius: r };
    case "right":  return { borderTopLeftRadius:    r, borderBottomLeftRadius:  r };
    case "bottom": return { borderTopLeftRadius:    r, borderTopRightRadius:    r };
    case "left":   return { borderTopRightRadius:   r, borderBottomRightRadius: r };
  }
}

// ── Snap touch to nearest wall ────────────────────────────────────────────────
function snapToWall(
  touchX: number,
  touchY: number,
  winW: number,
  winH: number,
  topInset: number,
): WallPos {
  const dTop    = touchY - topInset;
  const dBottom = winH - touchY;
  const dLeft   = touchX;
  const dRight  = winW - touchX;
  const minD = Math.min(dTop, dBottom, dLeft, dRight);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  if (minD === dTop)    return { wall: "top",    t: clamp(touchX / winW) };
  if (minD === dBottom) return { wall: "bottom", t: clamp(touchX / winW) };
  if (minD === dLeft)   return { wall: "left",   t: clamp((touchY - topInset) / (winH - topInset)) };
  return                       { wall: "right",  t: clamp((touchY - topInset) / (winH - topInset)) };
}

// ── Button center from WallPos ────────────────────────────────────────────────
function btnCenter(
  wp: WallPos,
  winW: number,
  winH: number,
  topInset: number,
  btnHalf: number,
): { x: number; y: number } {
  const m = BTN_MARGIN + btnHalf;
  switch (wp.wall) {
    case "top":
      return { x: Math.max(m, Math.min(winW - m, wp.t * winW)), y: topInset + m };
    case "bottom":
      return { x: Math.max(m, Math.min(winW - m, wp.t * winW)), y: winH - m };
    case "left":
      return { x: m, y: Math.max(topInset + m, Math.min(winH - m, topInset + wp.t * (winH - topInset))) };
    case "right":
      return { x: winW - m, y: Math.max(topInset + m, Math.min(winH - m, topInset + wp.t * (winH - topInset))) };
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
  isPlaying = false,
}: ModeSwitcherDialProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const { width: winW, height: winH } = useWindowDimensions();

  const BTN_SIZE = S.ms(36, 0.4);
  const BTN_HALF = BTN_SIZE / 2;

  // ── Wall position state ───────────────────────────────────────────────────
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

  // ── Drag state ───────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  // ── Animation ────────────────────────────────────────────────────────────
  const fanScale   = useSharedValue(0.05);
  const fanOpacity = useSharedValue(0);
  const overlayOp  = useSharedValue(0);

  const doOpen = useCallback(() => {
    setIsOpen(true);
    isOpenRef.current = true;
    fanScale.value   = withTiming(1,   { duration: 230, easing: Easing.out(Easing.cubic) });
    fanOpacity.value = withTiming(1,   { duration: 190 });
    overlayOp.value  = withTiming(0.5, { duration: 190 });
  }, [fanScale, fanOpacity, overlayOp]);

  const doClose = useCallback(() => {
    fanScale.value   = withTiming(0.05, { duration: 180, easing: Easing.in(Easing.cubic) });
    fanOpacity.value = withTiming(0,    { duration: 160 });
    overlayOp.value  = withTiming(0,    { duration: 160 });
    setTimeout(() => { setIsOpen(false); isOpenRef.current = false; }, 190);
  }, [fanScale, fanOpacity, overlayOp]);


  // Keep onSelectMode stable across renders
  const onSelectModeRef = useRef(onSelectMode);
  useEffect(() => { onSelectModeRef.current = onSelectMode; }, [onSelectMode]);

  // ── Live window/inset refs for PanResponder handlers ─────────────────────
  const winWRef     = useRef(winW);
  const winHRef     = useRef(winH);
  const topInsetRef = useRef(topInset);
  useEffect(() => { winWRef.current = winW; },         [winW]);
  useEffect(() => { winHRef.current = winH; },         [winH]);
  useEffect(() => { topInsetRef.current = topInset; }, [topInset]);

  // ── PanResponder ─────────────────────────────────────────────────────────
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
          if (longPressRef.current) {
            clearTimeout(longPressRef.current);
            longPressRef.current = null;
          }
        }
      },
      onPanResponderRelease: (e) => {
        if (longPressRef.current) {
          clearTimeout(longPressRef.current);
          longPressRef.current = null;
        }
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          setIsDragging(false);
          const newWP = snapToWall(
            e.nativeEvent.pageX,
            e.nativeEvent.pageY,
            winWRef.current,
            winHRef.current,
            topInsetRef.current,
          );
          setWallPos(newWP);
          wallPosRef.current = newWP;
          AsyncStorage.setItem(WALL_KEY, JSON.stringify(newWP));
        } else {
          // Tap: toggle fan
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

  // ── Animated styles ───────────────────────────────────────────────────────
  const overlayAnimStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));
  const fanAnimStyle = useAnimatedStyle(() => ({
    opacity: fanOpacity.value,
    transform: [{ scale: fanScale.value }],
  }));

  // ── Layout geometry ───────────────────────────────────────────────────────
  const center    = btnCenter(wallPos, winW, winH, topInset, BTN_HALF);
  const wall      = wallPos.wall;
  const { start: aStart, end: aEnd } = fanAngles(wall);
  const bgOff     = fanBgOffset(wall);
  const bgSz      = fanBgSize(wall);
  const bgCorners = fanBgCorners(wall);

  // Icon positions relative to anchor (button center)
  const iconSlots = MODES.map((mode, i) => {
    const deg = aStart + ((aEnd - aStart) / (MODES.length - 1)) * i;
    const rad = (deg % 360) * (Math.PI / 180);
    return { mode, dx: Math.cos(rad) * ICON_R, dy: Math.sin(rad) * ICON_R };
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Dark overlay — tapping it closes the fan */}
      {isOpen && (
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
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
        Fan anchor — a 0×0 View positioned exactly at button center.
        Scale transform applies from this anchor, so the fan grows out
        from the button position.
      */}
      {isOpen && (
        <Animated.View
          style={[
            {
              position: "absolute",
              zIndex: Z_FAN,
              left: center.x,
              top:  center.y,
              width: 0,
              height: 0,
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
              left:   bgOff.x,
              top:    bgOff.y,
              width:  bgSz.w,
              height: bgSz.h,
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

          {/* Mode icons along the arc */}
          {iconSlots.map(({ mode, dx, dy }) => {
            const isActive = mode === currentMode;
            return (
              <Pressable
                key={mode}
                onPress={() => {
                  doClose();
                  setTimeout(() => onSelectModeRef.current(mode), 175);
                }}
                testID={`mode-slot-${mode}`}
                style={({ pressed }) => ({
                  position: "absolute",
                  left: dx - ICON_S / 2,
                  top:  dy - ICON_S / 2,
                  width:  ICON_S,
                  height: ICON_S,
                  borderRadius: ICON_S / 2,
                  backgroundColor: isActive
                    ? C.accent
                    : pressed
                    ? C.accent + "28"
                    : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <ModeIcon
                  mode={mode}
                  size={S.ms(14, 0.3)}
                  color={isActive ? "#fff" : C.textSecondary}
                />
                <Text
                  style={{
                    fontSize: 7,
                    color: isActive ? "#fff" : C.textTertiary,
                    fontFamily: "SpaceGrotesk_500Medium",
                    letterSpacing: 0.3,
                    lineHeight: 9,
                  }}
                  numberOfLines={1}
                >
                  {t("switcher", mode as "beat" | "bar" | "score" | "note" | "stage" | "menu")}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>
      )}

      {/* Floating button — hugs the wall */}
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("switcher", "openDial")}
        accessibilityState={{ expanded: isOpen }}
        style={{
          position: "absolute",
          zIndex: Z_BUTTON,
          left:  center.x - BTN_HALF,
          top:   center.y - BTN_HALF,
          width:  BTN_SIZE,
          height: BTN_SIZE,
          opacity: isDragging ? 0.5 : 1,
        }}
        {...buttonPR.panHandlers}
      >
        <View
          style={{
            width:  BTN_SIZE,
            height: BTN_SIZE,
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

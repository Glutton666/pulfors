import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
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

const Z_FAN    = 100001;
const Z_HANDLE = 100002;

// ── Geometry ──────────────────────────────────────────────────────────────────
const HANDLE_R    = 38;   // collapsed D-tab half-circle radius (larger = more room for mini arc)
const FAN_R       = 180;  // expanded fan diameter; radius = FAN_R/2 = 90
const ICON_R      = 76;   // expanded icon arc radius (≤ FAN_R/2)
const ICON_S      = 32;   // expanded icon slot size
const MINI_R      = 24;   // mini arc radius inside collapsed tab
const MINI_DOT    = 7;    // mini arc dot size
const ANGLE_STEP  = 22;   // degrees between adjacent mode slots
const PX_PER_STEP = 36;   // pixels of swipe per one mode step

// Inward direction for each wall (degrees, math coords: right=0°, down=90°)
const CENTER_ANGLE: Record<Wall, number> = {
  top: 90, right: 180, bottom: 270, left: 0,
};

// Full arc extent for each wall: 120° spread centred on CENTER_ANGLE
function arcAngles(wall: Wall) {
  const c = CENTER_ANGLE[wall];
  return { start: c - 60, end: c + 60 };
}

// Swipe axis and sign (flipped from natural so "up = prev, down = next" on right wall)
const SWIPE_CFG: Record<Wall, { axis: "x" | "y"; sign: 1 | -1 }> = {
  top:    { axis: "x", sign:  1 },
  right:  { axis: "y", sign: -1 },
  bottom: { axis: "x", sign: -1 },
  left:   { axis: "y", sign: -1 },
};

// ── Anchor: exactly on the wall edge ─────────────────────────────────────────
function anchorPos(wp: WallPos, winW: number, winH: number, topInset: number) {
  switch (wp.wall) {
    case "top":    return { x: Math.max(0, Math.min(winW, wp.t * winW)), y: topInset };
    case "bottom": return { x: Math.max(0, Math.min(winW, wp.t * winW)), y: winH };
    case "left":   return { x: 0,    y: Math.max(topInset, Math.min(winH, topInset + wp.t * (winH - topInset))) };
    case "right":  return { x: winW, y: Math.max(topInset, Math.min(winH, topInset + wp.t * (winH - topInset))) };
  }
}

// ── Collapsed D-tab: rect + corner radii relative to anchor ──────────────────
function handleLayout(wall: Wall) {
  const r = HANDLE_R;
  switch (wall) {
    case "top":    return { left: -r, top:  0, w: r*2, h: r, corners: { borderBottomLeftRadius: r, borderBottomRightRadius: r } };
    case "right":  return { left: -r, top: -r, w: r,   h: r*2, corners: { borderTopLeftRadius: r, borderBottomLeftRadius: r } };
    case "bottom": return { left: -r, top: -r, w: r*2, h: r, corners: { borderTopLeftRadius: r, borderTopRightRadius: r } };
    case "left":   return { left:  0, top: -r, w: r,   h: r*2, corners: { borderTopRightRadius: r, borderBottomRightRadius: r } };
  }
}

// ── Expanded fan background: semicircle relative to anchor ────────────────────
function fanBgLayout(wall: Wall) {
  const r = FAN_R / 2;
  switch (wall) {
    case "top":    return { left: -r, top:  0, w: FAN_R, h: r };
    case "right":  return { left: -r, top: -r, w: r,     h: FAN_R };
    case "bottom": return { left: -r, top: -r, w: FAN_R, h: r };
    case "left":   return { left:  0, top: -r, w: r,     h: FAN_R };
  }
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

// ── Snap to nearest wall ──────────────────────────────────────────────────────
function snapToWall(tx: number, ty: number, winW: number, winH: number, topInset: number): WallPos {
  const dT = ty - topInset, dB = winH - ty, dL = tx, dR = winW - tx;
  const m  = Math.min(dT, dB, dL, dR);
  const cl = (v: number) => Math.min(1, Math.max(0, v));
  if (m === dT) return { wall: "top",    t: cl(tx / winW) };
  if (m === dB) return { wall: "bottom", t: cl(tx / winW) };
  if (m === dL) return { wall: "left",   t: cl((ty - topInset) / (winH - topInset)) };
  return               { wall: "right",  t: cl((ty - topInset) / (winH - topInset)) };
}

// ── Mode icon ─────────────────────────────────────────────────────────────────
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

  // ── Wall position ────────────────────────────────────────────────────────
  const defaultWP: WallPos = { wall: "right", t: 0.02 };
  const [wallPos, setWallPos] = useState<WallPos>(defaultWP);

  useEffect(() => {
    AsyncStorage.getItem(WALL_KEY).then((raw) => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw) as WallPos;
        if (["top","right","bottom","left"].includes(p.wall) && typeof p.t === "number") {
          setWallPos(p);
        }
      } catch {}
    });
  }, []);

  // ── Animation shared values ───────────────────────────────────────────────
  const fanScale   = useSharedValue(0.05);
  const fanOpacity = useSharedValue(0);

  // ── Open / close ─────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // ── Rotary scroll position ───────────────────────────────────────────────
  const initIdx = Math.max(0, MODES.indexOf(currentMode));
  const [scrollPos, setScrollPos] = useState<number>(initIdx);
  const scrollPosRef = useRef<number>(initIdx);

  const doOpen = useCallback(() => {
    const idx = Math.max(0, MODES.indexOf(currentMode));
    scrollPosRef.current = idx;
    setScrollPos(idx);
    setIsOpen(true);
    isOpenRef.current = true;
    fanScale.value   = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    fanOpacity.value = withTiming(1, { duration: 180 });
  }, [currentMode, fanScale, fanOpacity]);

  const doClose = useCallback(() => {
    fanScale.value   = withTiming(0.05, { duration: 180, easing: Easing.in(Easing.cubic) });
    fanOpacity.value = withTiming(0,    { duration: 150 });
    setTimeout(() => { setIsOpen(false); isOpenRef.current = false; }, 185);
  }, [fanScale, fanOpacity]);

  const onSelectModeRef = useRef(onSelectMode);
  useEffect(() => { onSelectModeRef.current = onSelectMode; }, [onSelectMode]);

  // ── Drag state ───────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  // ── Live refs for PanResponder stale-closure safety ──────────────────────
  const winWRef  = useRef(winW);
  const winHRef  = useRef(winH);
  const topInRef = useRef(topInset);
  const wallRef  = useRef<Wall>(wallPos.wall);
  useEffect(() => { winWRef.current  = winW; },         [winW]);
  useEffect(() => { winHRef.current  = winH; },         [winH]);
  useEffect(() => { topInRef.current = topInset; },     [topInset]);
  useEffect(() => { wallRef.current  = wallPos.wall; }, [wallPos.wall]);

  // ── Handle PanResponder (tap = toggle; drag = reposition) ─────────────────
  const longRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDraggingRef.current = false;
        longRef.current = setTimeout(() => {
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
          if (longRef.current) { clearTimeout(longRef.current); longRef.current = null; }
        }
      },
      onPanResponderRelease: (e) => {
        if (longRef.current) { clearTimeout(longRef.current); longRef.current = null; }
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          setIsDragging(false);
          const newWP = snapToWall(
            e.nativeEvent.pageX, e.nativeEvent.pageY,
            winWRef.current, winHRef.current, topInRef.current,
          );
          setWallPos(newWP);
          AsyncStorage.setItem(WALL_KEY, JSON.stringify(newWP));
        } else {
          // Toggle open / close
          if (isOpenRef.current) doClose(); else doOpen();
        }
      },
      onPanResponderTerminate: () => {
        if (longRef.current) { clearTimeout(longRef.current); longRef.current = null; }
        isDraggingRef.current = false;
        setIsDragging(false);
      },
    })
  ).current;

  // ── Fan swipe PanResponder (rotary dial) ──────────────────────────────────
  const swipeStart = useRef({ coord: 0, startScroll: 0 });

  const fanSwipePR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { axis } = SWIPE_CFG[wallRef.current];
        swipeStart.current = {
          coord:       axis === "x" ? e.nativeEvent.pageX : e.nativeEvent.pageY,
          startScroll: scrollPosRef.current,
        };
      },
      onPanResponderMove: (e) => {
        const { axis, sign } = SWIPE_CFG[wallRef.current];
        const coord = axis === "x" ? e.nativeEvent.pageX : e.nativeEvent.pageY;
        const delta = (coord - swipeStart.current.coord) / PX_PER_STEP * sign;
        const next  = Math.max(0, Math.min(MODES.length - 1, swipeStart.current.startScroll + delta));
        scrollPosRef.current = next;
        setScrollPos(next);
      },
      onPanResponderRelease: () => {
        const snapped = Math.max(0, Math.min(MODES.length - 1, Math.round(scrollPosRef.current)));
        scrollPosRef.current = snapped;
        setScrollPos(snapped);
        doClose();
        setTimeout(() => onSelectModeRef.current(MODES[snapped]), 175);
      },
      onPanResponderTerminate: () => { doClose(); },
    })
  ).current;

  // ── Animated styles ───────────────────────────────────────────────────────
  const fanStyle = useAnimatedStyle(() => ({
    opacity:   fanOpacity.value,
    transform: [{ scale: fanScale.value }],
  }));

  // ── Geometry (sync refs synchronously in render) ──────────────────────────
  const anchor = anchorPos(wallPos, winW, winH, topInset);
  wallRef.current = wallPos.wall;

  const wall     = wallPos.wall;
  const centAng  = CENTER_ANGLE[wall];
  const bgLayout = fanBgLayout(wall);
  const bgCorner = fanBgCorners(wall);
  const hLayout  = handleLayout(wall);
  const { start: arcStart, end: arcEnd } = arcAngles(wall);

  // Expanded rotary slots: position = centAng + (i - scrollPos) × ANGLE_STEP
  const iconSlots = MODES.map((mode, i) => {
    const offset = i - scrollPos;
    const deg    = centAng + offset * ANGLE_STEP;
    const rad    = (deg * Math.PI) / 180;
    const dist   = Math.abs(offset);
    return {
      mode, i,
      dx:      Math.cos(rad) * ICON_R,
      dy:      Math.sin(rad) * ICON_R,
      isCtr:   Math.round(scrollPos) === i,
      opacity: Math.max(0, 1 - dist * 0.28),
      scale:   Math.max(0.55, 1 - dist * 0.12),
    };
  });

  // Collapsed mini-arc: static positions, all 6 modes evenly spaced
  const currentIdx = MODES.indexOf(currentMode);
  const miniSlots = MODES.map((mode, i) => {
    const deg = arcStart + ((arcEnd - arcStart) / (MODES.length - 1)) * i;
    const rad = (deg * Math.PI) / 180;
    return {
      mode, i,
      dx: Math.cos(rad) * MINI_R,
      dy: Math.sin(rad) * MINI_R,
      isCurrent: i === currentIdx,
    };
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Expanded fan — anchor at wall edge, grows inward */}
      {isOpen && (
        <Animated.View
          style={[
            {
              position: "absolute",
              zIndex: Z_FAN,
              left: anchor.x, top: anchor.y,
              width: 0, height: 0,
              overflow: "visible" as const,
              pointerEvents: "box-none" as const,
            },
            fanStyle,
          ]}
        >
          {/* Solid semicircle background */}
          <View
            style={{
              position: "absolute",
              left: bgLayout.left, top: bgLayout.top,
              width: bgLayout.w,   height: bgLayout.h,
              backgroundColor: C.surface,
              ...bgCorner,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.45, shadowRadius: 16,
              elevation: 14,
              pointerEvents: "none" as const,
            }}
          />

          {/* Swipe-capture layer */}
          <View
            {...fanSwipePR.panHandlers}
            style={{
              position: "absolute",
              left: bgLayout.left, top: bgLayout.top,
              width: bgLayout.w,   height: bgLayout.h,
            }}
          />

          {/* Rotary dial icons — visual only */}
          {iconSlots.map(({ mode, dx, dy, isCtr, opacity: op, scale: sc }) => (
            <View
              key={mode}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: dx - ICON_S / 2, top: dy - ICON_S / 2,
                width: ICON_S, height: ICON_S,
                borderRadius: ICON_S / 2,
                backgroundColor: isCtr ? C.accent : "transparent",
                alignItems: "center", justifyContent: "center",
                opacity: op,
                transform: [{ scale: sc }],
              }}
            >
              <ModeIcon
                mode={mode}
                size={S.ms(13, 0.3)}
                color={isCtr ? "#fff" : C.textSecondary}
              />
              {isCtr && (
                <Text
                  style={{
                    fontSize: 7, lineHeight: 9,
                    color: "#fff",
                    fontFamily: "SpaceGrotesk_500Medium",
                    letterSpacing: 0.3,
                  }}
                  numberOfLines={1}
                >
                  {t("switcher", mode as "beat"|"bar"|"score"|"note"|"stage"|"menu")}
                </Text>
              )}
            </View>
          ))}
        </Animated.View>
      )}

      {/* Handle — only shown when fan is closed */}
      {!isOpen && <View
        {...handlePR.panHandlers}
        style={{
          position: "absolute",
          zIndex: Z_HANDLE,
          left: anchor.x, top: anchor.y,
          width: 0, height: 0,
          overflow: "visible" as const,
          opacity: isDragging ? 0.5 : 1,
        }}
      >
        {/* D-tab background */}
        <View
          style={{
            position: "absolute",
            left: hLayout.left, top: hLayout.top,
            width: hLayout.w,   height: hLayout.h,
            backgroundColor: C.surface,
            ...hLayout.corners,
            borderWidth: 1,
            borderColor: isOpen ? C.accent + "66" : C.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.22, shadowRadius: 4,
            elevation: 4,
          }}
          testID="mode-switcher-button"
        />

        {/* Mini arc dots when collapsed */}
        {!isOpen && miniSlots.map(({ mode, dx, dy, isCurrent }) => (
          <View
            key={mode}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: dx - (isCurrent ? MINI_DOT + 1 : MINI_DOT - 1) / 2,
              top:  dy - (isCurrent ? MINI_DOT + 1 : MINI_DOT - 1) / 2,
              width:  isCurrent ? MINI_DOT + 1 : MINI_DOT - 1,
              height: isCurrent ? MINI_DOT + 1 : MINI_DOT - 1,
              borderRadius: 99,
              backgroundColor: isCurrent ? C.accent : C.textTertiary + "88",
            }}
          />
        ))}

      </View>}
    </>
  );
}

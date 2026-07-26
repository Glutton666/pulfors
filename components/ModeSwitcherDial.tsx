import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Pressable,
  useWindowDimensions,
  PanResponder,
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
import { useScale } from "@/lib/scale";

// ModeSlot is still exported so app/index.tsx can use it as a type.
export type ModeSlot = "beat" | "bar" | "score" | "note" | "stage" | "menu";

type Wall = "top" | "right" | "bottom" | "left";
type WallPos = { wall: Wall; t: number };

const WALL_KEY = "metronome_dial_wall_v2";

const Z_OVERLAY = 100000;
const Z_HANDLE  = 100002;

// ── Geometry ──────────────────────────────────────────────────────────────────
const HANDLE_R   = 38;   // collapsed D-tab half-circle radius
const RIM_COLOR  = "#6B5A1E";
const RIM_INSET  = 6;
const ICON_S     = 22;   // icon size inside the D-tab handle

// Front-camera safe zone: top/bottom wall t must stay outside [0.28, 0.72].
function safeT(wall: Wall, t: number): number {
  if (wall === "top" || wall === "bottom") {
    if (t > 0.28 && t < 0.72) return t < 0.5 ? 0.25 : 0.75;
  }
  return t;
}

// Hide the border on the side that hugs the screen edge (flat face of the D)
function wallEdgeBorder(wall: Wall): object {
  return wall === "right"  ? { borderRightWidth:  0 }
       : wall === "left"   ? { borderLeftWidth:   0 }
       : wall === "top"    ? { borderTopWidth:    0 }
       :                     { borderBottomWidth: 0 };
}

// Inner ring inset: zero on the wall-facing side so the inner line reaches the edge
function innerRingInset(wall: Wall): object {
  return {
    top:    wall === "top"    ? 0 : RIM_INSET,
    bottom: wall === "bottom" ? 0 : RIM_INSET,
    left:   wall === "left"   ? 0 : RIM_INSET,
    right:  wall === "right"  ? 0 : RIM_INSET,
  };
}

// ── Anchor: exactly on the wall edge (camera-safe) ───────────────────────────
function anchorPos(wp: WallPos, winW: number, winH: number, topInset: number) {
  const t = safeT(wp.wall, wp.t);
  switch (wp.wall) {
    case "top":    return { x: Math.max(0, Math.min(winW, t * winW)), y: topInset };
    case "bottom": return { x: Math.max(0, Math.min(winW, t * winW)), y: winH };
    case "left":   return { x: 0,    y: Math.max(topInset, Math.min(winH, topInset + t * (winH - topInset))) };
    case "right":  return { x: winW, y: Math.max(topInset, Math.min(winH, topInset + t * (winH - topInset))) };
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

// ── Snap to nearest wall (camera-safe) ───────────────────────────────────────
function snapToWall(tx: number, ty: number, winW: number, winH: number, topInset: number): WallPos {
  const dT = ty - topInset, dB = winH - ty, dL = tx, dR = winW - tx;
  const m  = Math.min(dT, dB, dL, dR);
  const cl = (v: number) => Math.min(1, Math.max(0, v));
  if (m === dT) { const wall: Wall = "top";    return { wall, t: safeT(wall, cl(tx / winW)) }; }
  if (m === dB) { const wall: Wall = "bottom"; return { wall, t: safeT(wall, cl(tx / winW)) }; }
  if (m === dL) return { wall: "left",  t: cl((ty - topInset) / (winH - topInset)) };
  return               { wall: "right", t: cl((ty - topInset) / (winH - topInset)) };
}

// ─────────────────────────────────────────────────────────────────────────────

interface ModeSwitcherDialProps {
  /** Whether the menu is currently open (controlled by parent). */
  isMenuOpen: boolean;
  /** Called when the D-tab is tapped — parent should toggle the menu state. */
  onMenuToggle: () => void;
  topInset: number;
  isLandscape: boolean;
}

export function ModeSwitcherDial({
  isMenuOpen,
  onMenuToggle,
  topInset,
  isLandscape,
}: ModeSwitcherDialProps) {
  const { colors: C } = useTheme();
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
  const overlayOp = useSharedValue(0);

  // ── Open / close ─────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  const doOpen = useCallback(() => {
    setIsOpen(true);
    isOpenRef.current = true;
    overlayOp.value = withTiming(0.5, { duration: 200 });
  }, [overlayOp]);

  const doClose = useCallback(() => {
    overlayOp.value = withTiming(0, { duration: 160 });
    setTimeout(() => { setIsOpen(false); isOpenRef.current = false; }, 170);
  }, [overlayOp]);

  // Keep latest doOpen/doClose accessible from stale PanResponder closures
  const doOpenRef  = useRef<() => void>(() => {});
  const doCloseRef = useRef<() => void>(() => {});
  useEffect(() => { doOpenRef.current  = doOpen;  }, [doOpen]);
  useEffect(() => { doCloseRef.current = doClose; }, [doClose]);

  // ── Sync open/close with parent-controlled isMenuOpen ────────────────────
  useEffect(() => {
    if (isMenuOpen && !isOpenRef.current) {
      doOpenRef.current();
    } else if (!isMenuOpen && isOpenRef.current) {
      doCloseRef.current();
    }
  }, [isMenuOpen]);

  // ── Keep latest onMenuToggle accessible from stale closures ──────────────
  const onMenuToggleRef = useRef(onMenuToggle);
  useEffect(() => { onMenuToggleRef.current = onMenuToggle; }, [onMenuToggle]);

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

  // ── Handle PanResponder (tap = toggle menu; drag = reposition) ────────────
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
          // Tap: delegate open/close to parent
          onMenuToggleRef.current();
        }
      },
      onPanResponderTerminate: () => {
        if (longRef.current) { clearTimeout(longRef.current); longRef.current = null; }
        isDraggingRef.current = false;
        setIsDragging(false);
      },
    })
  ).current;

  // ── Animated styles ───────────────────────────────────────────────────────
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));

  // ── Geometry ──────────────────────────────────────────────────────────────
  const anchor  = anchorPos(wallPos, winW, winH, topInset);
  wallRef.current = wallPos.wall;

  const wall    = wallPos.wall;
  const hLayout = handleLayout(wall);

  const innerHCorners = Object.fromEntries(
    Object.entries(hLayout.corners).map(([k, v]) => [k, Math.max(0, (v as number) - RIM_INSET)]),
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Dim overlay — tap to close the menu */}
      {isOpen && (
        <Animated.View
          style={[
            {
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              zIndex: Z_OVERLAY, backgroundColor: "#000",
              pointerEvents: "box-none" as const,
            },
            overlayStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={() => onMenuToggleRef.current()} />
        </Animated.View>
      )}

      {/* Handle — always rendered; hidden when menu is open */}
      <View
        {...handlePR.panHandlers}
        style={{
          position: "absolute",
          zIndex: Z_HANDLE,
          left: anchor.x, top: anchor.y,
          width: 0, height: 0,
          overflow: "visible" as const,
          opacity: isOpen ? 0 : (isDragging ? 0.5 : 1),
        }}
      >
        {/* D-tab background + double rim */}
        <View
          style={{
            position: "absolute",
            left: hLayout.left, top: hLayout.top,
            width: hLayout.w,   height: hLayout.h,
            backgroundColor: C.surface + "B8",
            ...hLayout.corners,
            borderWidth: 3,
            borderColor: RIM_COLOR,
            ...wallEdgeBorder(wall),
            shadowColor: RIM_COLOR,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.55, shadowRadius: 6,
            elevation: 6,
            overflow: "hidden" as const,
            alignItems: "center" as const,
            justifyContent: "center" as const,
          }}
          testID="mode-switcher-button"
        >
          {/* Inner ring */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              ...innerRingInset(wall),
              ...innerHCorners,
              borderWidth: 1.5,
              borderColor: RIM_COLOR + "70",
              ...wallEdgeBorder(wall),
            }}
          />
          {/* Menu icon */}
          <Ionicons
            name="menu"
            size={S.ms(ICON_S, 0.3)}
            color={C.text}
            pointerEvents="none"
          />
        </View>
      </View>
    </>
  );
}


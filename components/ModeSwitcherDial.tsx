import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
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

export type ModeSlot = "beat" | "bar" | "score" | "note" | "practice" | "stage" | "menu";

type Wall = "top" | "right" | "bottom" | "left";
type WallPos = { wall: Wall; t: number };

const MODES: ModeSlot[] = ["beat", "bar", "score", "note", "practice", "stage", "menu"];
const WALL_KEY = "metronome_dial_wall_v2";

const Z_OVERLAY = 100000;
const Z_FAN     = 100001;
const Z_HANDLE  = 100002;

// ── Geometry ──────────────────────────────────────────────────────────────────
const HANDLE_R    = 38;   // collapsed D-tab half-circle radius (larger = more room for mini arc)
const HOLE_R      = HANDLE_R + 16; // donut inner-hole radius (between handle edge and icons)
const FAN_R       = 220;  // expanded fan diameter; radius = FAN_R/2 = 110
const ICON_R      = 82;   // expanded icon arc radius; outer edge = 82+20=102 ≤ 110 ✓
const ICON_S      = 40;   // expanded icon slot size
const MINI_R        = 19;   // = HANDLE_R/2 → icon sits at D-tab visual centre
const MINI_DOT      = 5;    // mini arc neighbour dot size
const MINI_ICON_S   = 22;   // icon size for current-mode slot in mini arc
const MINI_A_STEP   = 55;   // wider step so dots clear the centre icon at MINI_R=19
const ANGLE_STEP    = 34;   // degrees between adjacent mode slots; arc dist=45px > ICON_S=40 ✓
const PX_PER_STEP = 36;   // pixels of swipe per one mode step
const N_MODES     = MODES.length; // 7 — used for circular wrapping
const RIM_COLOR   = "#6B5A1E";   // dark olive-gold rim colour
const RIM_INSET   = 6;           // inner ring inset from rim edge

// Circular wrap: keeps scrollPos in [0, N_MODES)
function wrapScroll(v: number): number { return ((v % N_MODES) + N_MODES) % N_MODES; }
function snapWrap(v: number): number { return ((Math.round(wrapScroll(v)) % N_MODES) + N_MODES) % N_MODES; }

// Front-camera safe zone: top/bottom wall t must stay outside [0.28, 0.72].
// Covers iPhone Dynamic Island / notch and Galaxy punch-hole.
function safeT(wall: Wall, t: number): number {
  if (wall === "top" || wall === "bottom") {
    if (t > 0.28 && t < 0.72) return t < 0.5 ? 0.25 : 0.75;
  }
  return t;
}

// Hide the border on the side that hugs the screen edge (flat face of the D/fan)
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

// Inward direction for each wall (degrees: right=0°, down=90°, left=180°, up=270°)
const CENTER_ANGLE: Record<Wall, number> = {
  top: 90, right: 180, bottom: 270, left: 0,
};

// Diagonal target angle for each wall-end corner: [t=0 corner, t=1 corner]
const CORNER_DIAG: Record<Wall, [number, number]> = {
  top:    [45,  135],  // top-left → top-right
  right:  [135, 225],  // top-right → bottom-right
  bottom: [315, 225],  // bottom-left → bottom-right
  left:   [45,  315],  // top-left → bottom-left
};

// How far from each wall-end (0–1) the corner blend starts
const CORNER_THRESH = 0.20;

// Shortest-path angle lerp
function interpolateAngle(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

// Returns centAng + halfSpan blended toward the nearest corner diagonal.
// halfSpan shrinks 60°→45° so the arc stays inside the available quadrant.
function effectiveArcParams(wall: Wall, t: number): { centAng: number; halfSpan: number } {
  const base = CENTER_ANGLE[wall];
  const [diagStart, diagEnd] = CORNER_DIAG[wall];
  const cStart   = Math.max(0, Math.min(1, (CORNER_THRESH - t) / CORNER_THRESH));
  const cEnd     = Math.max(0, Math.min(1, (t - (1 - CORNER_THRESH)) / CORNER_THRESH));
  const c        = Math.max(cStart, cEnd);
  const diagGoal = cStart >= cEnd ? diagStart : diagEnd;
  return {
    centAng:  interpolateAngle(base, diagGoal, c),
    halfSpan: 60 - c * 15,   // 60° at wall centre → 45° at exact corner
  };
}

// Swipe axis and sign (flipped from natural so "up = prev, down = next" on right wall)
const SWIPE_CFG: Record<Wall, { axis: "x" | "y"; sign: 1 | -1 }> = {
  top:    { axis: "x", sign:  1 },
  right:  { axis: "y", sign: -1 },
  bottom: { axis: "x", sign: -1 },
  left:   { axis: "y", sign: -1 },
};

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

// ── Safe D-tab position per mode ─────────────────────────────────────────────
// Returns true if the current wallPos overlaps a known button cluster for that mode.
// "top-right" corner (wall=right, t≤0.25) is the most congested spot (menu, save, back buttons).
type ConflictZone = { wall: Wall; tMin: number; tMax: number };
const MODE_CONFLICT_ZONES: Record<ModeSlot, ConflictZone[]> = {
  beat:     [{ wall: "right", tMin: 0, tMax: 0.18 }],                        // top-right menu button
  bar:      [{ wall: "right", tMin: 0, tMax: 0.25 }],                        // top-right controls
  score:    [{ wall: "right", tMin: 0, tMax: 0.30 }, { wall: "right", tMin: 0.75, tMax: 1 }], // save + FAB
  note:     [{ wall: "right", tMin: 0, tMax: 0.30 }],                        // save/reset header
  practice: [{ wall: "right", tMin: 0, tMax: 0.20 }],                        // top-right header
  stage:    [{ wall: "right", tMin: 0, tMax: 0.20 }, { wall: "top", tMin: 0.7, tMax: 1 }],
  menu:     [],                                                               // full-screen overlay, no conflict
};
const SAFE_FALLBACK: WallPos = { wall: "top", t: 0.15 };

function hasConflict(wp: WallPos, mode: ModeSlot): boolean {
  return MODE_CONFLICT_ZONES[mode].some(
    z => z.wall === wp.wall && wp.t >= z.tMin && wp.t <= z.tMax,
  );
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

// ── Mode icon ─────────────────────────────────────────────────────────────────
function ModeIcon({ mode, size, color }: { mode: ModeSlot; size: number; color: string }) {
  switch (mode) {
    case "beat":     return <Ionicons name="musical-note"  size={size} color={color} />;
    case "bar":      return <Ionicons name="reorder-three" size={size} color={color} />;
    case "score":    return <Ionicons name="musical-notes" size={size} color={color} />;
    case "note":     return <Ionicons name="list"          size={size} color={color} />;
    case "practice": return <Ionicons name="book-outline"  size={size} color={color} />;
    case "stage":    return <Ionicons name="mic-outline"   size={size} color={color} />;
    case "menu":     return <Ionicons name="menu"          size={size} color={color} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export interface ModeSwitcherDialHandle {
  open(): void;
  close(): void;
}

interface ModeSwitcherDialProps {
  currentMode: ModeSlot;
  onSelectMode: (mode: ModeSlot) => void;
  topInset: number;
  isLandscape: boolean;
  isPlaying?: boolean;
  /** When true, hides the D-tab handle entirely and anchors the fan to top-center. */
  hideHandle?: boolean;
}

export const ModeSwitcherDial = forwardRef(
function ModeSwitcherDial({
  currentMode,
  onSelectMode,
  topInset,
  isLandscape,
  isPlaying,
  hideHandle = false,
}: ModeSwitcherDialProps, ref: React.ForwardedRef<ModeSwitcherDialHandle>) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const { width: winW, height: winH } = useWindowDimensions();

  // ── Wall position ────────────────────────────────────────────────────────
  // When hideHandle=true, always anchor to top-center (fan opens downward from text label).
  const TOP_CENTER: WallPos = { wall: "top", t: 0.5 };
  const defaultWP: WallPos = hideHandle ? TOP_CENTER : { wall: "right", t: 0.02 };
  const [wallPos, setWallPos] = useState<WallPos>(defaultWP);

  useEffect(() => {
    if (hideHandle) return;  // fixed position, no persistence needed
    AsyncStorage.getItem(WALL_KEY).then((raw) => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw) as WallPos;
        if (["top","right","bottom","left"].includes(p.wall) && typeof p.t === "number") {
          setWallPos(p);
        }
      } catch {}
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-relocation: move D-tab away from mode buttons on mode entry ─────
  // Per-mode override set: once the user manually drags in a mode, auto-move is suppressed for that mode.
  const userOverrodeRef = useRef<Set<ModeSlot>>(new Set());

  useEffect(() => {
    if (hideHandle) return;  // no D-tab to relocate
    if (userOverrodeRef.current.has(currentMode)) return;
    setWallPos(prev => {
      if (!hasConflict(prev, currentMode)) return prev;
      AsyncStorage.setItem(WALL_KEY, JSON.stringify(SAFE_FALLBACK));
      return SAFE_FALLBACK;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, hideHandle]);

  // ── Animation shared values ───────────────────────────────────────────────
  const fanScale   = useSharedValue(0.05);
  const fanOpacity = useSharedValue(0);
  const overlayOp  = useSharedValue(0);

  // ── Open / close ─────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // ── Rotary scroll position ───────────────────────────────────────────────
  const initIdx = Math.max(0, MODES.indexOf(currentMode));
  const [scrollPos, setScrollPos] = useState<number>(initIdx);
  const scrollPosRef = useRef<number>(initIdx);

  // Refs for PanResponder tap-detection (updated each render)
  const anchorRef    = useRef({ x: 0, y: 0 });
  const iconSlotsRef = useRef<{ i: number; dx: number; dy: number }[]>([]);

  const doOpen = useCallback(() => {
    // currentModeRef는 렌더 중 동기 갱신되므로 항상 최신값
    const idx = Math.max(0, MODES.indexOf(currentModeRef.current));
    scrollPosRef.current = idx;
    setScrollPos(idx);
    setIsOpen(true);
    isOpenRef.current = true;
    fanScale.value   = withTiming(1,   { duration: 220, easing: Easing.out(Easing.cubic) });
    fanOpacity.value = withTiming(1,   { duration: 180 });
    overlayOp.value  = withTiming(0.5, { duration: 200 });
  // currentMode 제거 — ref로 읽으므로 deps 불필요, React Compiler 재생성 방지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanScale, fanOpacity, overlayOp]);

  const doClose = useCallback(() => {
    fanScale.value   = withTiming(0.05, { duration: 180, easing: Easing.in(Easing.cubic) });
    fanOpacity.value = withTiming(0,    { duration: 150 });
    overlayOp.value  = withTiming(0,    { duration: 160 });
    setTimeout(() => { setIsOpen(false); isOpenRef.current = false; }, 185);
  }, [fanScale, fanOpacity, overlayOp]);

  // Expose open/close to parent via ref.
  // Always call through doOpenRef/doCloseRef so React Compiler memoization
  // can't accidentally capture a stale closure.
  useImperativeHandle(ref, () => ({
    open:  () => doOpenRef.current(),
    close: () => doCloseRef.current(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // Sync refs so stale PanResponder closures always call the latest version
  useEffect(() => { doOpenRef.current  = doOpen;  }, [doOpen]);
  useEffect(() => { doCloseRef.current = doClose; }, [doClose]);

  const onSelectModeRef = useRef(onSelectMode);
  useEffect(() => { onSelectModeRef.current = onSelectMode; }, [onSelectMode]);

  // Keep latest doOpen/doClose accessible from stale PanResponder closures
  const doOpenRef  = useRef<() => void>(() => {});
  const doCloseRef = useRef<() => void>(() => {});

  // ── Drag state ───────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  // ── Live refs for PanResponder stale-closure safety ──────────────────────
  const winWRef       = useRef(winW);
  const winHRef       = useRef(winH);
  const topInRef      = useRef(topInset);
  const wallRef       = useRef<Wall>(wallPos.wall);
  const currentModeRef = useRef<ModeSlot>(currentMode);
  // 렌더 중 동기적으로 갱신 — effect로 갱신하면 모드 변경 직후 탭 시 구버전이 읽힘
  currentModeRef.current = currentMode;
  useEffect(() => { winWRef.current  = winW; },        [winW]);
  useEffect(() => { winHRef.current  = winH; },        [winH]);
  useEffect(() => { topInRef.current = topInset; },    [topInset]);
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
          // User manually placed the dial — suppress auto-move for this mode
          userOverrodeRef.current.add(currentModeRef.current);
        } else {
          // Toggle open / close (use refs to avoid stale closure)
          if (isOpenRef.current) doCloseRef.current(); else doOpenRef.current();
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
  // Claims ALL starts so the overlay below can never steal the touch on web.
  // Tap vs swipe is distinguished by movement distance on release.
  const swipeStart = useRef({ coord: 0, startScroll: 0, moved: false,
                               pageX: 0, pageY: 0 });

  const fanSwipePR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,   // always claim — blocks overlay
      onPanResponderGrant: (e) => {
        const { axis } = SWIPE_CFG[wallRef.current];
        swipeStart.current = {
          coord:       axis === "x" ? e.nativeEvent.pageX : e.nativeEvent.pageY,
          startScroll: scrollPosRef.current,
          moved:       false,
          pageX:       e.nativeEvent.pageX,
          pageY:       e.nativeEvent.pageY,
        };
      },
      onPanResponderMove: (e, gs) => {
        if (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5) {
          swipeStart.current.moved = true;
          const { axis, sign } = SWIPE_CFG[wallRef.current];
          const coord = axis === "x" ? e.nativeEvent.pageX : e.nativeEvent.pageY;
          const delta = (coord - swipeStart.current.coord) / PX_PER_STEP * sign;
          const next  = wrapScroll(swipeStart.current.startScroll + delta);
          scrollPosRef.current = next;
          setScrollPos(next);
        }
      },
      onPanResponderRelease: (e) => {
        if (!swipeStart.current.moved) {
          // TAP — find icon closest to tap position in anchor-space
          const anch   = anchorRef.current;
          const ax     = e.nativeEvent.pageX - anch.x;
          const ay     = e.nativeEvent.pageY - anch.y;
          const slots  = iconSlotsRef.current;
          let best = -1, bestDist = Infinity;
          slots.forEach(({ i, dx, dy }) => {
            const d = Math.hypot(dx - ax, dy - ay);
            if (d < bestDist) { bestDist = d; best = i; }
          });
          if (best >= 0 && bestDist <= ICON_S) {
            scrollPosRef.current = best;
            setScrollPos(best);
          }
          // else: tap on empty bg — do nothing (keep current selection)
        } else {
          // SWIPE — snap to nearest; fan stays open for overlay-tap to confirm
          const snapped = snapWrap(scrollPosRef.current);
          scrollPosRef.current = snapped;
          setScrollPos(snapped);
        }
      },
      // Don't surrender gesture to parent ScrollViews
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        // Snap gracefully — do NOT close (terminate ≠ user intent to dismiss)
        const snapped = snapWrap(scrollPosRef.current);
        scrollPosRef.current = snapped;
        setScrollPos(snapped);
      },
    })
  ).current;

  // ── Animated styles ───────────────────────────────────────────────────────
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));
  const fanStyle     = useAnimatedStyle(() => ({
    opacity:   fanOpacity.value,
    transform: [{ scale: fanScale.value }],
  }));

  // Confirm the highlighted mode and close the fan
  const confirmSelection = useCallback(() => {
    const snapped = snapWrap(scrollPosRef.current);
    doClose();
    setTimeout(() => onSelectModeRef.current(MODES[snapped]), 200);
  }, [doClose]);

  // ── Geometry (sync refs synchronously in render) ──────────────────────────
  // When hideHandle=true, all geometry is pinned to top-center regardless of stored wallPos.
  const TOP_CENTER_WP: WallPos = { wall: "top", t: 0.5 };
  const activeWP               = hideHandle ? TOP_CENTER_WP : wallPos;
  // hideHandle: bypass anchorPos — its safeT camera-safe zone shoves t=0.5 to 0.75.
  const anchor = hideHandle
    ? { x: winW / 2, y: topInset }
    : anchorPos(activeWP, winW, winH, topInset);
  wallRef.current    = activeWP.wall;
  anchorRef.current  = anchor;

  const wall                   = activeWP.wall;
  const { centAng, halfSpan }  = effectiveArcParams(wall, activeWP.t);
  const bgLayout               = fanBgLayout(wall);
  const bgCorner               = fanBgCorners(wall);
  const hLayout                = handleLayout(wall);

  // Inner ring corner radii (rim inset by RIM_INSET)
  const innerHCorners  = Object.fromEntries(
    Object.entries(hLayout.corners).map(([k, v]) => [k, Math.max(0, (v as number) - RIM_INSET)]),
  );
  const innerBgCorners = Object.fromEntries(
    Object.entries(bgCorner).map(([k, v]) => [k, Math.max(0, (v as number) - RIM_INSET)]),
  );

  // Expanded rotary slots: position = centAng + (i - scrollPos) × ANGLE_STEP
  const iconSlots = MODES.map((mode, i) => {
    // Circular shortest-path offset so wrapping works smoothly
    const rawOff         = i - scrollPos;
    const offset         = rawOff - Math.round(rawOff / N_MODES) * N_MODES;
    const deg            = centAng + offset * ANGLE_STEP;
    const rad            = (deg * Math.PI) / 180;
    const dist           = Math.abs(offset);
    const outOfArc       = Math.abs(offset * ANGLE_STEP) > halfSpan;
    return {
      mode, i,
      dx:      Math.cos(rad) * ICON_R,
      dy:      Math.sin(rad) * ICON_R,
      isCtr:   Math.round(scrollPos) === i,
      opacity: outOfArc ? Math.max(0, 0.35 - dist * 0.1) : Math.max(0, 1 - dist * 0.28),
      scale:   Math.max(0.55, 1 - dist * 0.12),
    };
  });
  // Keep ref in sync for PanResponder tap-detection (runs synchronously in render)
  iconSlotsRef.current = iconSlots.map(({ i, dx, dy }) => ({ i, dx, dy }));

  // Collapsed mini-arc: current mode (icon) centred, ±1 neighbour dots
  const currentIdx = MODES.indexOf(currentMode);
  const miniSlots = [-1, 0, 1].map((offset) => {
    const idx  = currentIdx + offset;
    const mode = MODES[idx] as ModeSlot | undefined;
    const deg  = centAng + offset * MINI_A_STEP;
    const rad  = (deg * Math.PI) / 180;
    return {
      mode, offset,
      dx:        Math.cos(rad) * MINI_R,
      dy:        Math.sin(rad) * MINI_R,
      isCurrent: offset === 0,
      opacity:   mode === undefined ? 0 : offset === 0 ? 1 : 0.5,
    };
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Dim overlay — tap to CONFIRM the highlighted mode */}
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
          <Pressable style={{ flex: 1 }} onPress={confirmSelection} />
        </Animated.View>
      )}

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
          {/* Fan background — double rim */}
          <View
            style={{
              position: "absolute",
              left: bgLayout.left, top: bgLayout.top,
              width: bgLayout.w,   height: bgLayout.h,
              backgroundColor: C.surface,
              ...bgCorner,
              borderWidth: 3,
              borderColor: RIM_COLOR,
              ...wallEdgeBorder(wall),
              shadowColor: RIM_COLOR,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.5, shadowRadius: 12,
              elevation: 14,
              overflow: "hidden" as const,
              pointerEvents: "none" as const,
            }}
          >
            {/* Inner ring */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                ...innerRingInset(wall),
                ...innerBgCorners,
                borderWidth: 1.5,
                borderColor: RIM_COLOR + "70",
                ...wallEdgeBorder(wall),
              }}
            />
          </View>

          {/* Donut hole — background circle that punches the centre out of the fan */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: -HOLE_R, top: -HOLE_R,
              width: HOLE_R * 2, height: HOLE_R * 2,
              borderRadius: HOLE_R,
              backgroundColor: C.background,
              borderWidth: 2.5,
              borderColor: RIM_COLOR,
            }}
          />

          {/* Swipe-capture wrapper — claims all touches; tap/swipe detected on release */}
          <View
            {...fanSwipePR.panHandlers}
            style={{
              position: "absolute",
              left: bgLayout.left, top: bgLayout.top,
              width: bgLayout.w,   height: bgLayout.h,
              overflow: "visible" as const,
            }}
          >
            {/* Rotary dial icons — visual only; gesture handled by parent wrapper */}
            {iconSlots.map(({ mode, i, dx, dy, isCtr, opacity: op, scale: sc }) => (
                <View
                  key={mode}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: dx - bgLayout.left - ICON_S / 2,
                    top:  dy - bgLayout.top  - ICON_S / 2,
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
                    size={S.ms(20, 0.3)}
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
                      {t("switcher", mode as "beat"|"bar"|"score"|"note"|"practice"|"stage"|"menu")}
                    </Text>
                  )}
                </View>
            ))}
          </View>
        </Animated.View>
      )}

      {/* Handle — hidden when hideHandle=true (fan is triggered externally via ref.open()) */}
      {!hideHandle && (
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
            backgroundColor: C.surface,
            ...hLayout.corners,
            borderWidth: 3,
            borderColor: RIM_COLOR,
            ...wallEdgeBorder(wall),
            shadowColor: RIM_COLOR,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.55, shadowRadius: 6,
            elevation: 6,
            overflow: "hidden" as const,
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
        </View>

        {/* Mini arc: current mode = icon, neighbours = dots */}
        {miniSlots.map(({ mode, offset, dx, dy, isCurrent, opacity: op }) =>
          isCurrent && mode !== undefined ? (
            // Current mode: icon circle at arc centre
            <View
              key={offset}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: dx - MINI_ICON_S / 2,
                top:  dy - MINI_ICON_S / 2,
                width: MINI_ICON_S, height: MINI_ICON_S,
                borderRadius: MINI_ICON_S / 2,
                backgroundColor: C.accent,
                alignItems: "center", justifyContent: "center",
                opacity: op,
              }}
            >
              <ModeIcon mode={mode} size={MINI_ICON_S - 4} color="#fff" />
            </View>
          ) : (
            // Neighbour: plain dot
            <View
              key={offset}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: dx - MINI_DOT / 2,
                top:  dy - MINI_DOT / 2,
                width: MINI_DOT, height: MINI_DOT,
                borderRadius: 99,
                opacity: op,
                backgroundColor: C.textTertiary + "88",
              }}
            />
          )
        )}

      </View>
      )}
    </>
  );
});
ModeSwitcherDial.displayName = "ModeSwitcherDial";

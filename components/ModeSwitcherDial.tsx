import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  useWindowDimensions,
  PanResponder,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useScale } from "@/lib/scale";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationFn } from "@/lib/i18n";

// Type-safe label lookup for ModeSlot keys
function slotLabel(t: TranslationFn, slot: ModeSlot): string {
  switch (slot) {
    case "beat":     return t("switcher", "beat");
    case "bar":      return t("switcher", "bar");
    case "score":    return t("switcher", "score");
    case "note":     return t("switcher", "note");
    case "practice": return t("switcher", "practice");
    case "stage":    return t("switcher", "stage");
    case "menu":     return t("switcher", "menu");
  }
}

// ModeSlot is still exported so callers can use it as a type.
export type ModeSlot = "beat" | "bar" | "score" | "note" | "practice" | "stage" | "menu";

type Wall = "top" | "right" | "bottom" | "left";
type WallPos = { wall: Wall; t: number };

const WALL_KEY  = "metronome_dial_wall_v2";
const Z_OVERLAY = 100000;
const Z_HANDLE  = 100002;

// ── Geometry ──────────────────────────────────────────────────────────────────
const HANDLE_R  = 38;   // D-tab half-circle radius
const RIM_COLOR = "#6B5A1E";
const RIM_INSET = 6;
const FAN_R     = 112;  // fan button center distance from anchor
const BTN_R     = 26;   // fan button radius
const FAN_SPAN  = 148 * (Math.PI / 180); // total fan arc (radians)

// Front-camera safe zone
function safeT(wall: Wall, t: number): number {
  if (wall === "top" || wall === "bottom") {
    if (t > 0.28 && t < 0.72) return t < 0.5 ? 0.25 : 0.75;
  }
  return t;
}

// Hide border on the wall-hugging side
function wallEdgeBorder(wall: Wall): object {
  return wall === "right"  ? { borderRightWidth:  0 }
       : wall === "left"   ? { borderLeftWidth:   0 }
       : wall === "top"    ? { borderTopWidth:    0 }
       :                     { borderBottomWidth: 0 };
}

// Inner ring inset
function innerRingInset(wall: Wall): object {
  return {
    top:    wall === "top"    ? 0 : RIM_INSET,
    bottom: wall === "bottom" ? 0 : RIM_INSET,
    left:   wall === "left"   ? 0 : RIM_INSET,
    right:  wall === "right"  ? 0 : RIM_INSET,
  };
}

// Anchor: exactly on the wall edge
function anchorPos(wp: WallPos, winW: number, winH: number, topInset: number) {
  const t = safeT(wp.wall, wp.t);
  switch (wp.wall) {
    case "top":    return { x: Math.max(0, Math.min(winW, t * winW)), y: topInset };
    case "bottom": return { x: Math.max(0, Math.min(winW, t * winW)), y: winH };
    case "left":   return { x: 0,    y: Math.max(topInset, Math.min(winH, topInset + t * (winH - topInset))) };
    case "right":  return { x: winW, y: Math.max(topInset, Math.min(winH, topInset + t * (winH - topInset))) };
  }
}

// Collapsed D-tab shape
function handleLayout(wall: Wall) {
  const r = HANDLE_R;
  switch (wall) {
    case "top":    return { left: -r, top:  0, w: r*2, h: r, corners: { borderBottomLeftRadius: r, borderBottomRightRadius: r } };
    case "right":  return { left: -r, top: -r, w: r,   h: r*2, corners: { borderTopLeftRadius: r, borderBottomLeftRadius: r } };
    case "bottom": return { left: -r, top: -r, w: r*2, h: r, corners: { borderTopLeftRadius: r, borderTopRightRadius: r } };
    case "left":   return { left:  0, top: -r, w: r,   h: r*2, corners: { borderTopRightRadius: r, borderBottomRightRadius: r } };
  }
}

// Snap to nearest wall
function snapToWall(tx: number, ty: number, winW: number, winH: number, topInset: number): WallPos {
  const dT = ty - topInset, dB = winH - ty, dL = tx, dR = winW - tx;
  const m  = Math.min(dT, dB, dL, dR);
  const cl = (v: number) => Math.min(1, Math.max(0, v));
  if (m === dT) { const wall: Wall = "top";    return { wall, t: safeT(wall, cl(tx / winW)) }; }
  if (m === dB) { const wall: Wall = "bottom"; return { wall, t: safeT(wall, cl(tx / winW)) }; }
  if (m === dL) return { wall: "left",  t: cl((ty - topInset) / (winH - topInset)) };
  return               { wall: "right", t: cl((ty - topInset) / (winH - topInset)) };
}

// Fan center direction (pointing away from wall, into screen)
function fanCenterAngle(wall: Wall): number {
  switch (wall) {
    case "right":  return Math.PI;          // ←
    case "left":   return 0;               // →
    case "top":    return Math.PI / 2;     // ↓
    case "bottom": return -Math.PI / 2;    // ↑
  }
}

// Positions of each fan button relative to the anchor (0,0)
function fanPositions(wall: Wall, count: number): { x: number; y: number }[] {
  const center = fanCenterAngle(wall);
  return Array.from({ length: count }, (_, i) => {
    const angle = count > 1
      ? center - FAN_SPAN / 2 + (FAN_SPAN / (count - 1)) * i
      : center;
    return {
      x: Math.cos(angle) * FAN_R,
      y: Math.sin(angle) * FAN_R,
    };
  });
}

// ── Mode metadata ─────────────────────────────────────────────────────────────
type ModeInfo = { slot: ModeSlot; icon: string };
const MODE_LIST: ModeInfo[] = [
  { slot: "beat",     icon: "musical-note"          },
  { slot: "bar",      icon: "albums-outline"        },
  { slot: "score",    icon: "document-text-outline" },
  { slot: "note",     icon: "list-outline"          },
  { slot: "practice", icon: "book-outline"          },
  { slot: "stage",    icon: "desktop-outline"       },
  { slot: "menu",     icon: "menu"                  },
];

// ── Fan button ────────────────────────────────────────────────────────────────
function FanButton({
  x, y, icon, label, isActive, onPress, delay,
}: {
  x: number; y: number; icon: string; label: string;
  isActive: boolean; onPress: () => void; delay: number;
}) {
  const { colors: C } = useTheme();
  const S = useScale();
  const sc  = useSharedValue(0);
  const op  = useSharedValue(0);

  useEffect(() => {
    sc.value = withDelay(delay, withSpring(1, { damping: 13, stiffness: 210 }));
    op.value = withDelay(delay, withTiming(1, { duration: 120 }));
    return () => {
      sc.value = 0;
      op.value = 0;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sc.value }],
    opacity: op.value,
  }));

  const BTN_D = BTN_R * 2;
  const accentBg = isActive ? C.accent : C.surface + "EE";

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: x - BTN_R,
          top: y - BTN_R,
          width: BTN_D,
          height: BTN_D,
          borderRadius: BTN_R,
          backgroundColor: accentBg,
          borderWidth: 2,
          borderColor: isActive ? C.accent : RIM_COLOR + "99",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.35,
          shadowRadius: 5,
          elevation: 6,
          zIndex: Z_HANDLE + 2,
        },
        animStyle,
      ]}
    >
      <Pressable
        style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center", paddingTop: 2 }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={S.ms(15, 0.3)}
          color={isActive ? "#fff" : C.text}
        />
        <Text
          numberOfLines={1}
          style={{
            fontSize: S.ms(8, 0.2),
            color: isActive ? "#fff" : C.textSecondary,
            fontFamily: "SpaceGrotesk_500Medium",
            lineHeight: S.ms(10, 0.2),
            marginTop: 1,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ModeSwitcherDialProps {
  /** Whether MenuScreen is currently open (controlled by parent). */
  isMenuOpen: boolean;
  /** Called when the fan's "menu" item is tapped (parent toggles MenuScreen). */
  onMenuToggle: () => void;
  topInset: number;
  isLandscape: boolean;
  /** Currently active mode — shown as text in the collapsed D-tab. */
  currentMode: ModeSlot;
  /** Called when user picks a mode from the expanded fan. */
  onModeChange: (mode: ModeSlot) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export function ModeSwitcherDial({
  isMenuOpen,
  onMenuToggle,
  topInset,
  isLandscape,
  currentMode,
  onModeChange,
}: ModeSwitcherDialProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const { t } = useLanguage();
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

  // ── Fan open / close (internal) ───────────────────────────────────────────
  const [isFanOpen, setIsFanOpen] = useState(false);
  const isFanOpenRef = useRef(false);
  const overlayOp = useSharedValue(0);

  const openFan = useCallback(() => {
    setIsFanOpen(true);
    isFanOpenRef.current = true;
    overlayOp.value = withTiming(0.45, { duration: 180 });
  }, [overlayOp]);

  const closeFan = useCallback(() => {
    overlayOp.value = withTiming(0, { duration: 140 });
    setTimeout(() => { setIsFanOpen(false); isFanOpenRef.current = false; }, 150);
  }, [overlayOp]);

  const openFanRef  = useRef(openFan);
  const closeFanRef = useRef(closeFan);
  useEffect(() => { openFanRef.current  = openFan;  }, [openFan]);
  useEffect(() => { closeFanRef.current = closeFan; }, [closeFan]);

  // Close fan when MenuScreen opens (avoid overlap)
  useEffect(() => {
    if (isMenuOpen && isFanOpenRef.current) closeFanRef.current();
  }, [isMenuOpen]);

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

  // ── PanResponder — tap = toggle fan; drag = reposition ───────────────────
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
          // Tap: toggle fan
          if (isFanOpenRef.current) closeFanRef.current();
          else openFanRef.current();
        }
      },
      onPanResponderTerminate: () => {
        if (longRef.current) { clearTimeout(longRef.current); longRef.current = null; }
        isDraggingRef.current = false;
        setIsDragging(false);
      },
    })
  ).current;

  // ── Mode label + icon for collapsed D-tab ─────────────────────────────────
  const modeInfo  = MODE_LIST.find((m) => m.slot === currentMode) ?? MODE_LIST[0];
  const modeLabel = slotLabel(t, currentMode);

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

  // Fan positions
  const positions = fanPositions(wall, MODE_LIST.length);
  const isVertical = wall === "left" || wall === "right";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Dim overlay — tap to close fan or menu */}
      {(isFanOpen || isMenuOpen) && (
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
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              if (isFanOpenRef.current) closeFanRef.current();
              else onMenuToggle();
            }}
          />
        </Animated.View>
      )}

      {/* Anchor point — always rendered; fan buttons and handle live here */}
      <View
        style={{
          position: "absolute",
          zIndex: Z_HANDLE,
          left: anchor.x, top: anchor.y,
          width: 0, height: 0,
          overflow: "visible" as const,
        }}
      >
        {/* ── Expanded fan buttons ───────────────────────────────────────── */}
        {isFanOpen && MODE_LIST.map((mode, idx) => (
          <FanButton
            key={mode.slot}
            x={positions[idx].x}
            y={positions[idx].y}
            icon={mode.icon}
            label={slotLabel(t, mode.slot)}
            isActive={currentMode === mode.slot}
            delay={idx * 28}
            onPress={() => {
              closeFanRef.current();
              if (mode.slot === "menu") {
                // Small delay so close animation starts before menu opens
                setTimeout(() => onMenuToggle(), 60);
              } else {
                onModeChange(mode.slot);
              }
            }}
          />
        ))}

        {/* ── Collapsed D-tab handle ─────────────────────────────────────── */}
        <View
          {...handlePR.panHandlers}
          style={{
            position: "absolute",
            left: 0, top: 0,
            width: 0, height: 0,
            overflow: "visible" as const,
            opacity: isMenuOpen ? 0 : (isDragging ? 0.5 : 1),
          }}
        >
          <View
            style={{
              position: "absolute",
              left: hLayout.left, top: hLayout.top,
              width: hLayout.w,   height: hLayout.h,
              backgroundColor: isFanOpen ? (C.accent + "22") : (C.surface + "B8"),
              ...hLayout.corners,
              borderWidth: 3,
              borderColor: isFanOpen ? C.accent : RIM_COLOR,
              ...wallEdgeBorder(wall),
              shadowColor: isFanOpen ? C.accent : RIM_COLOR,
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
                borderColor: (isFanOpen ? C.accent : RIM_COLOR) + "70",
                ...wallEdgeBorder(wall),
              }}
            />

            {/* Mode icon + label (collapsed) or close indicator (fan open) */}
            {isFanOpen ? (
              // Fan is open — show × indicator
              <Ionicons
                name="close"
                size={S.ms(20, 0.3)}
                color={C.accent}
                pointerEvents="none"
              />
            ) : (
              // Normal: current mode icon + short label
              <View
                pointerEvents="none"
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: isVertical ? "column" : "row",
                  gap: 1,
                  paddingHorizontal: 2,
                  paddingVertical: 2,
                }}
              >
                <Ionicons
                  name={modeInfo.icon as keyof typeof Ionicons.glyphMap}
                  size={S.ms(17, 0.3)}
                  color={C.text}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: S.ms(8, 0.2),
                    color: C.textSecondary,
                    fontFamily: "SpaceGrotesk_500Medium",
                    lineHeight: S.ms(10, 0.2),
                    textAlign: "center",
                    flexShrink: 1,
                  }}
                >
                  {modeLabel}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </>
  );
}

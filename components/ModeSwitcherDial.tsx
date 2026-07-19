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

const MODES: ModeSlot[] = ["beat", "bar", "score", "note", "stage", "menu"];
const POSITION_KEY = "metronome_dial_position_v1";

// zIndex values: above stage mode overlay (99998) so ALL dial layers are reachable
const Z_OVERLAY = 100000;
const Z_DIAL    = 100001;
const Z_BUTTON  = 100002;

interface ModeSwitcherDialProps {
  currentMode: ModeSlot;
  onSelectMode: (mode: ModeSlot) => void;
  topInset: number;
  isLandscape: boolean;
  isPlaying?: boolean;
}

function ModeIcon({ mode, size, color }: { mode: ModeSlot; size: number; color: string }) {
  switch (mode) {
    case "beat":  return <Ionicons name="musical-note"   size={size} color={color} />;
    case "bar":   return <Ionicons name="reorder-three"  size={size} color={color} />;
    case "score": return <Ionicons name="musical-notes"  size={size} color={color} />;
    case "note":  return <Ionicons name="list"            size={size} color={color} />;
    case "stage": return <Ionicons name="mic-outline"    size={size} color={color} />;
    case "menu":  return <Ionicons name="menu"            size={size} color={color} />;
  }
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

  const BTN_SIZE = S.ms(40, 0.5);
  const DIAL_HEIGHT = S.ms(72, 0.4);

  const defaultBtnTop = topInset + 12;

  // ── open/close state ──
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // ── landscape drag state ──
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(null);
  const btnPosRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { btnPosRef.current = btnPos; }, [btnPos]);

  // ── highlight index for swipe ──
  const [highlightIndex, setHighlightIndex] = useState(
    Math.max(0, MODES.indexOf(currentMode))
  );
  const highlightIndexRef = useRef(highlightIndex);
  useEffect(() => { highlightIndexRef.current = highlightIndex; }, [highlightIndex]);

  // keep refs in sync so PanResponder handlers always see current values
  const winWRef = useRef(winW);
  const winHRef = useRef(winH);
  const topInsetRef = useRef(topInset);
  const isLandscapeRef = useRef(isLandscape);
  const BTNRef = useRef(BTN_SIZE);
  useEffect(() => { winWRef.current = winW; }, [winW]);
  useEffect(() => { winHRef.current = winH; }, [winH]);
  useEffect(() => { topInsetRef.current = topInset; }, [topInset]);
  useEffect(() => { isLandscapeRef.current = isLandscape; }, [isLandscape]);
  useEffect(() => { BTNRef.current = BTN_SIZE; }, [BTN_SIZE]);

  // load persisted button position
  useEffect(() => {
    AsyncStorage.getItem(POSITION_KEY).then((raw) => {
      if (!raw) return;
      try {
        const pos = JSON.parse(raw);
        if (typeof pos.x === "number" && typeof pos.y === "number") {
          setBtnPos(pos);
        }
      } catch {}
    });
  }, []);

  // ── animation values ──
  const overlayOpacity = useSharedValue(0);
  const dialTranslateY = useSharedValue(-60);
  const dialOpacity = useSharedValue(0);

  const doOpen = useCallback(() => {
    setIsOpen(true);
    isOpenRef.current = true;
    overlayOpacity.value = withTiming(1, { duration: 200 });
    dialTranslateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
    dialOpacity.value = withTiming(1, { duration: 200 });
  }, [overlayOpacity, dialTranslateY, dialOpacity]);

  const doClose = useCallback(() => {
    overlayOpacity.value = withTiming(0, { duration: 180 });
    dialTranslateY.value = withTiming(-50, { duration: 200 });
    dialOpacity.value = withTiming(0, { duration: 180 });
    setTimeout(() => { setIsOpen(false); isOpenRef.current = false; }, 200);
  }, [overlayOpacity, dialTranslateY, dialOpacity]);

  // sync highlight when mode changes externally
  useEffect(() => {
    const idx = MODES.indexOf(currentMode);
    if (idx >= 0) { setHighlightIndex(idx); highlightIndexRef.current = idx; }
  }, [currentMode]);

  // 재생 시작 시 다이얼 닫기
  useEffect(() => {
    if (isPlaying && isOpenRef.current) {
      doClose();
    }
  }, [isPlaying, doClose]);

  // ── dial swipe PanResponder ──
  // NOTE: slotWidth is intentionally NOT captured here; handlers read winWRef.current
  // at gesture time so rotation changes are always reflected correctly.
  const swipeStartIdxRef = useRef(MODES.indexOf(currentMode));

  const dialPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5,
      onPanResponderGrant: () => {
        swipeStartIdxRef.current = highlightIndexRef.current;
      },
      onPanResponderMove: (_, gs) => {
        const sw = winWRef.current / MODES.length;
        const delta = -Math.round(gs.dx / sw);
        const idx = Math.max(0, Math.min(MODES.length - 1, swipeStartIdxRef.current + delta));
        setHighlightIndex(idx);
        highlightIndexRef.current = idx;
      },
      onPanResponderRelease: (_, gs) => {
        const sw = winWRef.current / MODES.length;
        const delta = -Math.round(gs.dx / sw);
        const idx = Math.max(0, Math.min(MODES.length - 1, swipeStartIdxRef.current + delta));
        setHighlightIndex(idx);
        highlightIndexRef.current = idx;
        overlayOpacity.value = withTiming(0, { duration: 160 });
        dialOpacity.value = withTiming(0, { duration: 160 });
        dialTranslateY.value = withTiming(-50, { duration: 180 });
        setTimeout(() => {
          setIsOpen(false);
          isOpenRef.current = false;
          onSelectModeRef.current(MODES[idx]);
        }, 160);
      },
    })
  ).current;

  // ── button PanResponder (tap + landscape drag) ──
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragBtnStartRef = useRef({ btnX: 0, btnY: 0 });
  const onSelectModeRef = useRef(onSelectMode);
  useEffect(() => { onSelectModeRef.current = onSelectMode; }, [onSelectMode]);

  const buttonPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gs) => {
        isDraggingRef.current = false;
        const cur = btnPosRef.current;
        const btnX = cur ? cur.x : (winWRef.current - BTNRef.current - 20);
        const btnY = cur ? cur.y : (topInsetRef.current + 12);
        dragBtnStartRef.current = { btnX, btnY };

        if (isLandscapeRef.current) {
          longPressTimerRef.current = setTimeout(() => {
            isDraggingRef.current = true;
            setIsDragging(true);
          }, 450);
        }
      },
      onMoveShouldSetPanResponder: (_, gs) =>
        isDraggingRef.current && (Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2),
      onPanResponderMove: (_, gs) => {
        if (!isDraggingRef.current) return;
        const rawX = dragBtnStartRef.current.btnX + gs.dx;
        const rawY = dragBtnStartRef.current.btnY + gs.dy;
        setBtnPos({ x: rawX, y: rawY });
        btnPosRef.current = { x: rawX, y: rawY };
      },
      onPanResponderRelease: (_, gs) => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          setIsDragging(false);
          const rawX = dragBtnStartRef.current.btnX + gs.dx;
          const rawY = dragBtnStartRef.current.btnY + gs.dy;
          const snapped = snapToNearestEdge(rawX, rawY, BTNRef.current, winWRef.current, winHRef.current, topInsetRef.current);
          setBtnPos(snapped);
          btnPosRef.current = snapped;
          AsyncStorage.setItem(POSITION_KEY, JSON.stringify(snapped));
        } else {
          // tap
          if (isOpenRef.current) {
            overlayOpacity.value = withTiming(0, { duration: 180 });
            dialTranslateY.value = withTiming(-50, { duration: 200 });
            dialOpacity.value = withTiming(0, { duration: 180 });
            setTimeout(() => { setIsOpen(false); isOpenRef.current = false; }, 200);
          } else {
            setIsOpen(true);
            isOpenRef.current = true;
            overlayOpacity.value = withTiming(1, { duration: 200 });
            dialTranslateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
            dialOpacity.value = withTiming(1, { duration: 200 });
          }
        }
      },
      onPanResponderTerminate: () => {
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
        isDraggingRef.current = false;
        setIsDragging(false);
      },
    })
  ).current;

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const dialAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dialTranslateY.value }],
    opacity: dialOpacity.value,
  }));

  // button position
  const btnLeft = isLandscape && btnPos ? btnPos.x : undefined;
  const btnRight = isLandscape && btnPos ? undefined : S.ms(20, 0.3);
  const btnTop = isLandscape && btnPos ? btnPos.y : defaultBtnTop;
  const dialTop = btnTop + BTN_SIZE + 8;

  return (
    <>
      {/* Dark overlay — tap to close */}
      {isOpen && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_OVERLAY, backgroundColor: "rgba(0,0,0,0.62)" },
            overlayStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={doClose} testID="mode-dial-overlay" />
        </Animated.View>
      )}

      {/* Mode slots bar */}
      {isOpen && (
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              top: dialTop,
              height: DIAL_HEIGHT,
              backgroundColor: C.surface,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: C.border,
              zIndex: Z_DIAL,
              flexDirection: "row",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 8,
            },
            dialAnimStyle,
          ]}
          {...dialPanResponder.panHandlers}
        >
          {MODES.map((mode, idx) => {
            const isHighlighted = idx === highlightIndex;
            const isCurrent = mode === currentMode;
            return (
              <Pressable
                key={mode}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: "center" as const,
                  justifyContent: "center" as const,
                  gap: 3,
                  backgroundColor: isHighlighted ? C.accent + "1A" : pressed ? C.surfaceLight : "transparent",
                  paddingVertical: 6,
                })}
                onPress={() => {
                  setHighlightIndex(idx);
                  highlightIndexRef.current = idx;
                  doClose();
                  setTimeout(() => onSelectMode(mode), 160);
                }}
                testID={`mode-slot-${mode}`}
              >
                <ModeIcon
                  mode={mode}
                  size={S.ms(20, 0.4)}
                  color={isHighlighted || isCurrent ? C.accent : C.textSecondary}
                />
                <Text
                  style={{
                    fontSize: S.ms(10, 0.3),
                    color: isHighlighted || isCurrent ? C.accent : C.textTertiary,
                    fontFamily: "SpaceGrotesk_500Medium",
                    letterSpacing: 0.2,
                  }}
                  numberOfLines={1}
                >
                  {t("switcher", mode)}
                </Text>
                {isCurrent && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 5,
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: C.accent,
                    }}
                  />
                )}
              </Pressable>
            );
          })}
        </Animated.View>
      )}

      {/* Floating button — hidden while playing */}
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("switcher", "openDial")}
        accessibilityState={{ expanded: isOpen }}
        style={{
          position: "absolute",
          zIndex: Z_BUTTON,
          left: btnLeft,
          right: btnRight,
          top: btnTop,
          width: BTN_SIZE,
          height: BTN_SIZE,
          opacity: isDragging ? 0.7 : 1,
          display: isPlaying ? "none" : "flex",
        }}
        {...buttonPanResponder.panHandlers}
      >
        <View
          style={{
            width: BTN_SIZE,
            height: BTN_SIZE,
            borderRadius: BTN_SIZE / 2,
            backgroundColor: isOpen ? C.accent : C.surface,
            borderWidth: 1,
            borderColor: isOpen ? C.accent : C.border,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 4,
          }}
          testID="mode-switcher-button"
        >
          <ModeIcon
            mode={currentMode}
            size={S.ms(20, 0.5)}
            color={isOpen ? "#fff" : C.textSecondary}
          />
        </View>
      </Animated.View>
    </>
  );
}

/** Snap to the nearest of the 4 edges */
function snapToNearestEdge(
  rawX: number,
  rawY: number,
  btnSize: number,
  winW: number,
  winH: number,
  topInset: number
): { x: number; y: number } {
  const cx = rawX + btnSize / 2;
  const cy = rawY + btnSize / 2;

  const distLeft   = cx;
  const distRight  = winW - cx;
  const distTop    = cy;
  const distBottom = winH - cy;

  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  const clampX = (x: number) => Math.max(16, Math.min(winW - btnSize - 16, x));
  const clampY = (y: number) => Math.max(topInset + 4, Math.min(winH - btnSize - 20, y));

  if (minDist === distLeft)   return { x: 16,                  y: clampY(rawY) };
  if (minDist === distRight)  return { x: winW - btnSize - 16, y: clampY(rawY) };
  if (minDist === distTop)    return { x: clampX(rawX),        y: topInset + 4 };
  return                              { x: clampX(rawX),        y: winH - btnSize - 20 };
}

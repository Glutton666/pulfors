/**
 * TopDrawer — 상단에서 슬라이드 다운되는 드로어.
 * 모드 라벨 탭 또는 상단 스와이프 다운으로 열리고,
 * 바깥 탭 또는 위로 스와이프로 닫힌다.
 *
 * D-tab 반원(wall="top" 방향 — 상단 중앙 배치):
 * 평평한 면이 위, 곡면이 아래로 향하며 콘텐츠 영역 상단 중앙에 위치.
 */
import React, { useRef, useEffect } from "react";
import {
  View,
  Pressable,
  PanResponder,
  StyleSheet,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useScale } from "@/lib/scale";

// ── D-tab geometry — ModeSwitcherDial과 동일한 상수 ──────────────────────────
const HANDLE_R  = 38;
const RIM_COLOR = "#6B5A1E";
const RIM_INSET = 6;
const ICON_S    = 22;

// wall="top": 하단만 둥글게, 상단 테두리 없음
const OUTER_CORNERS    = { borderBottomLeftRadius: HANDLE_R, borderBottomRightRadius: HANDLE_R };
const INNER_CORNERS    = { borderBottomLeftRadius: HANDLE_R - RIM_INSET, borderBottomRightRadius: HANDLE_R - RIM_INSET };
const WALL_EDGE_BORDER = { borderTopWidth: 0 as const };
const INNER_INSET      = { top: 0, bottom: RIM_INSET, left: RIM_INSET, right: RIM_INSET };

const CONTENT_H = 88; // safe-area 아래 패널 콘텐츠 높이

export interface TopDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** 내부 D-tab 탭 — 드로어를 닫고 메뉴를 열어야 함 */
  onMenuOpen: () => void;
  topInset: number;
}

export function TopDrawer({ visible, onClose, onMenuOpen, topInset }: TopDrawerProps) {
  const { colors: C } = useTheme();
  const S = useScale();

  const panelH = topInset + CONTENT_H;

  // ── 애니메이션 ────────────────────────────────────────────────────────────
  const translateY = useSharedValue(-panelH);
  const overlayOp  = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0,       { duration: 280, easing: Easing.out(Easing.cubic) });
      overlayOp.value  = withTiming(0.42,    { duration: 280 });
    } else {
      translateY.value = withTiming(-panelH, { duration: 220, easing: Easing.in(Easing.cubic) });
      overlayOp.value  = withTiming(0,       { duration: 220 });
    }
  }, [visible, panelH]);

  const drawerStyle  = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));

  // ── 스와이프업 → 닫기 ─────────────────────────────────────────────────────
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const swipePR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  (_, gs) => gs.dy < -8,
      onPanResponderRelease:        (_, gs) => { if (gs.dy < -30) onCloseRef.current(); },
    })
  ).current;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* 반투명 오버레이 — 탭하면 닫힘 */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { zIndex: 99990, backgroundColor: "#000", pointerEvents: visible ? "auto" : "none" },
          overlayStyle,
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="드로어 닫기" />
      </Animated.View>

      {/* 슬라이딩 패널 */}
      <Animated.View
        {...swipePR.panHandlers}
        style={[
          {
            position: "absolute",
            top: 0, left: 0, right: 0,
            height: panelH,
            zIndex: 99995,
            backgroundColor: C.surface + "EE",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 12,
            pointerEvents: visible ? "auto" : "none",
          } as const,
          drawerStyle,
        ]}
      >
        {/*
          D-tab 반원 (wall="top" 방향):
          - 평평한 면이 위(패널 상단 safe-area 바로 아래)
          - 곡면이 아래를 향함
          - 상단 중앙 정렬: top = topInset, alignSelf = center
        */}
        <Pressable
          onPress={onMenuOpen}
          testID="top-drawer-menu-button"
          style={({ pressed }) => ({
            position: "absolute" as const,
            top: topInset + Math.round((CONTENT_H - HANDLE_R) / 2),
            alignSelf: "center" as const,
            width:  HANDLE_R * 2,  // 76
            height: HANDLE_R,      // 38
            backgroundColor: C.surface + (pressed ? "D0" : "B8"),
            ...OUTER_CORNERS,
            ...WALL_EDGE_BORDER,
            borderWidth: 3,
            borderColor: RIM_COLOR,
            shadowColor: RIM_COLOR,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: pressed ? 0.25 : 0.55,
            shadowRadius: 6,
            elevation: pressed ? 2 : 6,
            alignItems: "center" as const,
            justifyContent: "center" as const,
            overflow: "hidden" as const,
          })}
        >
          {/* 내부 링 — ModeSwitcherDial과 동일 */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute" as const,
              ...INNER_INSET,
              ...INNER_CORNERS,
              ...WALL_EDGE_BORDER,
              borderWidth: 1.5,
              borderColor: RIM_COLOR + "70",
            }}
          />
          {/* 메뉴 아이콘 */}
          <Ionicons
            name="menu"
            size={S.ms(ICON_S, 0.3)}
            color={C.text}
            pointerEvents="none"
          />
        </Pressable>
      </Animated.View>
    </>
  );
}

/**
 * TopDrawer — 상단에서 슬라이드 다운되는 드로어.
 * 모드 라벨 탭 또는 상단 스와이프 다운으로 열리고,
 * 바깥 탭 또는 위로 스와이프로 닫힌다.
 * 내부에 기존 D-tab 메뉴 버튼을 고정 레이아웃으로 표시한다.
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

const CONTENT_H  = 88;  // safe-area 아래 패널 콘텐츠 높이
const RIM_COLOR  = "#6B5A1E";
const ICON_SIZE  = 22;

export interface TopDrawerProps {
  /** 드로어 열림 여부 */
  visible: boolean;
  /** 닫기 요청 (바깥 탭 / 위로 스와이프) */
  onClose: () => void;
  /** 내부 메뉴 버튼 탭 — 드로어를 닫고 메뉴를 열어야 함 */
  onMenuOpen: () => void;
  topInset: number;
}

export function TopDrawer({
  visible,
  onClose,
  onMenuOpen,
  topInset,
}: TopDrawerProps) {
  const { colors: C } = useTheme();
  const S = useScale();

  const panelH = topInset + CONTENT_H;

  // ── 애니메이션 ────────────────────────────────────────────────────────────
  const translateY = useSharedValue(-panelH);
  const overlayOp  = useSharedValue(0);

  // visible 변경 → 애니메이션 구동
  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0,       { duration: 280, easing: Easing.out(Easing.cubic) });
      overlayOp.value  = withTiming(0.42,    { duration: 280 });
    } else {
      translateY.value = withTiming(-panelH, { duration: 220, easing: Easing.in(Easing.cubic) });
      overlayOp.value  = withTiming(0,       { duration: 220 });
    }
  }, [visible, panelH]);

  const drawerStyle  = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOp.value,
  }));

  // ── 스와이프업 → 닫기 ─────────────────────────────────────────────────────
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const swipePR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:  () => false,
      onMoveShouldSetPanResponder:   (_, gs) => gs.dy < -8,
      onPanResponderRelease:         (_, gs) => {
        if (gs.dy < -30) onCloseRef.current();
      },
    })
  ).current;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* 반투명 오버레이 — 탭하면 닫힘 */}
      <Animated.View
        pointerEvents={visible ? "auto" : "none"}
        style={[
          StyleSheet.absoluteFillObject,
          { zIndex: 99990, backgroundColor: "#000" },
          overlayStyle,
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="드로어 닫기" />
      </Animated.View>

      {/* 패널 */}
      <Animated.View
        {...swipePR.panHandlers}
        style={[
          {
            position: "absolute",
            top:   0,
            left:  0,
            right: 0,
            height: panelH,
            zIndex: 99995,
            backgroundColor: C.surface + "EE",
            borderBottomLeftRadius:  22,
            borderBottomRightRadius: 22,
            alignItems: "center" as const,
            justifyContent: "flex-end" as const,
            paddingBottom: 16,
            shadowColor:   "#000",
            shadowOffset:  { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius:  10,
            elevation: 12,
          },
          drawerStyle,
        ]}
      >
        {/* D-tab 스타일 메뉴 버튼 (드래그 없는 고정 레이아웃) */}
        <Pressable
          onPress={onMenuOpen}
          testID="top-drawer-menu-button"
          style={({ pressed }) => ({
            width:  72,
            height: 52,
            backgroundColor: pressed ? C.surface : C.surface,
            borderRadius:    14,
            borderWidth:     2.5,
            borderColor:     RIM_COLOR,
            alignItems:      "center" as const,
            justifyContent:  "center" as const,
            shadowColor:     RIM_COLOR,
            shadowOffset:    { width: 0, height: 0 },
            shadowOpacity:   pressed ? 0.25 : 0.5,
            shadowRadius:    7,
            elevation:       pressed ? 2 : 6,
            opacity:         pressed ? 0.8 : 1,
          })}
        >
          <Ionicons
            name="menu"
            size={S.ms(ICON_SIZE, 0.3)}
            color={C.text}
            pointerEvents="none"
          />
        </Pressable>

        {/* 하단 스와이프 힌트 바 */}
        <View
          pointerEvents="none"
          style={{
            position:     "absolute",
            bottom:       7,
            width:        34,
            height:       3,
            borderRadius: 2,
            backgroundColor: C.textSecondary + "55",
          }}
        />
      </Animated.View>
    </>
  );
}

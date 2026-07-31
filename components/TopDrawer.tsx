/**
 * TopDrawer — 상단에서 슬라이드 다운되는 드로어.
 *
 * 내용:
 *  - 모드 전환 버튼 5개 (beat / bar / score / note / stage)
 *  - 메뉴 버튼 (≡)
 *
 * 패널 형태: 하단이 둥글게 처리된 D-tab 스타일.
 */
import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
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
import { useLanguage } from "@/contexts/LanguageContext";
import type { ModeSlot } from "@/components/ModeDialLabel";

// ── 스타일 상수 ────────────────────────────────────────────────────────────────
const RIM_COLOR  = "#6B5A1E";
const CONTENT_H  = 110; // safe-area 아래 패널 콘텐츠 높이
const BTN_SIZE   = 52;  // 모드 버튼 크기
const MENU_SIZE  = 44;  // 메뉴 버튼 크기
const PANEL_RADIUS = 56; // 패널 하단 둥근 정도

// ── 모드 정의 ─────────────────────────────────────────────────────────────────
type ModeDef = {
  mode: Exclude<ModeSlot, "menu">;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  labelKo: string;
  labelEn: string;
};

const MODES: ModeDef[] = [
  { mode: "beat",  icon: "musical-note-outline", labelKo: "비트",   labelEn: "Beat"     },
  { mode: "bar",   icon: "grid-outline",          labelKo: "바",     labelEn: "Bar"      },
  { mode: "score", icon: "document-text-outline", labelKo: "악보",   labelEn: "Score"    },
  { mode: "note",  icon: "book-outline",          labelKo: "연습장", labelEn: "Practice" },
  { mode: "stage", icon: "mic-outline",           labelKo: "무대",   labelEn: "Stage"    },
];

export interface TopDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** D-tab 메뉴(≡) 탭 → 드로어 닫기 + 메뉴 열기 */
  onMenuOpen: () => void;
  /** 모드 버튼 탭 → 드로어 닫기 + 해당 모드 전환 */
  onModeChange: (mode: Exclude<ModeSlot, "menu">) => void;
  /** 현재 활성 모드 (활성 버튼 강조에 사용) */
  currentMode: ModeSlot;
  topInset: number;
}

export function TopDrawer({
  visible,
  onClose,
  onMenuOpen,
  onModeChange,
  currentMode,
  topInset,
}: TopDrawerProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const { language } = useLanguage();

  const panelH = topInset + CONTENT_H;

  // ── 애니메이션 ────────────────────────────────────────────────────────────
  const translateY = useSharedValue(-panelH);
  const overlayOp  = useSharedValue(0);
  const panelOp    = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      panelOp.value    = withTiming(1,       { duration: 280 });
      translateY.value = withTiming(0,       { duration: 280, easing: Easing.out(Easing.cubic) });
      overlayOp.value  = withTiming(0.45,    { duration: 280 });
    } else {
      translateY.value = withTiming(-panelH, { duration: 220, easing: Easing.in(Easing.cubic) });
      overlayOp.value  = withTiming(0,       { duration: 220 });
      panelOp.value    = withTiming(0,       { duration: 220 });
    }
  }, [visible, panelH]);

  const drawerStyle  = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: panelOp.value,
  }));
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

  const iconSize = S.ms(22, 0.3);
  const labelSize = S.ms(9, 0.2);

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
            backgroundColor: C.surface + "F2",
            borderBottomLeftRadius:  PANEL_RADIUS,
            borderBottomRightRadius: PANEL_RADIUS,
            pointerEvents: visible ? "auto" : "none",
          } as const,
          drawerStyle,
        ]}
      >
        {/*
          콘텐츠 영역 — safe-area 아래 수직 중앙 정렬
          모드 버튼 행 + 메뉴 버튼
        */}
        <View
          style={{
            position: "absolute" as const,
            top: topInset,
            left: 0,
            right: 0,
            height: CONTENT_H,
            flexDirection: "row" as const,
            alignItems: "center" as const,
            justifyContent: "center" as const,
            paddingHorizontal: 16,
            gap: 8,
          }}
        >
          {/* ── 모드 버튼 5개 ── */}
          {MODES.map(({ mode, icon, labelKo, labelEn }) => {
            const active = currentMode === mode;
            const label  = language === "ko" ? labelKo : labelEn;
            return (
              <Pressable
                key={mode}
                onPress={() => onModeChange(mode)}
                testID={`top-drawer-mode-${mode}`}
                style={({ pressed }) => ({
                  width:  BTN_SIZE,
                  height: BTN_SIZE,
                  borderRadius: BTN_SIZE / 2,
                  backgroundColor: active
                    ? RIM_COLOR + "40"
                    : pressed
                    ? C.surface + "FF"
                    : C.surface + "00",
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? RIM_COLOR : C.textSecondary + "30",
                  alignItems: "center" as const,
                  justifyContent: "center" as const,
                  gap: 2,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons
                  name={icon}
                  size={iconSize}
                  color={active ? RIM_COLOR : C.textSecondary}
                  pointerEvents="none"
                />
                <Text
                  pointerEvents="none"
                  style={{
                    fontSize: labelSize,
                    fontFamily: "SpaceGrotesk_500Medium",
                    color: active ? RIM_COLOR : C.textSecondary,
                    letterSpacing: 0.5,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}

          {/* ── 구분선 ── */}
          <View
            pointerEvents="none"
            style={{
              width: 1,
              height: 32,
              backgroundColor: RIM_COLOR + "50",
              marginHorizontal: 2,
            }}
          />

          {/* ── 메뉴 버튼 ── */}
          <Pressable
            onPress={onMenuOpen}
            testID="top-drawer-menu-button"
            style={({ pressed }) => ({
              width:  MENU_SIZE,
              height: MENU_SIZE,
              borderRadius: MENU_SIZE / 2,
              backgroundColor: pressed ? C.surface + "FF" : C.surface + "00",
              borderWidth: 2,
              borderColor: RIM_COLOR + "80",
              alignItems: "center" as const,
              justifyContent: "center" as const,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons
              name="menu"
              size={S.ms(20, 0.3)}
              color={C.textSecondary}
              pointerEvents="none"
            />
          </Pressable>
        </View>
      </Animated.View>
    </>
  );
}

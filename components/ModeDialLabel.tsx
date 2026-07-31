/**
 * ModeDialLabel
 *
 * 상단 중앙에 고정된 현재 모드 텍스트 레이블.
 * 탭하면 모드 버튼이 아래로 부채꼴 펼쳐지고,
 * 버튼을 선택하면 해당 모드로 전환된다.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useScale } from "@/lib/scale";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationFn } from "@/lib/i18n";

export type ModeSlot = "beat" | "bar" | "score" | "note" | "practice" | "stage" | "menu";

// Type-safe mode label lookup
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

// ── Fan geometry ─────────────────────────────────────────────────────────────
const FAN_R    = 88;   // px from label center to button center
const BTN_R    = 27;   // button radius
const SPAN_DEG = 160;  // total arc in degrees (fan opens downward)
const CENTER_DEG = 90; // 90° = straight down

// Mode metadata
const MODE_LIST: { slot: ModeSlot; icon: string }[] = [
  { slot: "beat",     icon: "musical-note"          },
  { slot: "bar",      icon: "albums-outline"        },
  { slot: "score",    icon: "document-text-outline" },
  { slot: "note",     icon: "list-outline"          },
  { slot: "practice", icon: "book-outline"          },
  { slot: "stage",    icon: "desktop-outline"       },
  { slot: "menu",     icon: "menu"                  },
];

function fanPositions(count: number): { x: number; y: number }[] {
  const centerRad = CENTER_DEG * (Math.PI / 180);
  const spanRad   = SPAN_DEG   * (Math.PI / 180);
  return Array.from({ length: count }, (_, i) => {
    const angle = count > 1
      ? centerRad - spanRad / 2 + (spanRad / (count - 1)) * i
      : centerRad;
    return { x: Math.cos(angle) * FAN_R, y: Math.sin(angle) * FAN_R };
  });
}

const POSITIONS = fanPositions(MODE_LIST.length);

// ── Individual fan button ─────────────────────────────────────────────────────
function FanButton({
  x, y, icon, label, isActive, onPress, delay,
}: {
  x: number; y: number; icon: string; label: string;
  isActive: boolean; onPress: () => void; delay: number;
}) {
  const { colors: C } = useTheme();
  const S = useScale();
  const sc = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    sc.value = withDelay(delay, withSpring(1, { damping: 13, stiffness: 220 }));
    op.value = withDelay(delay, withTiming(1, { duration: 120 }));
    return () => { sc.value = 0; op.value = 0; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sc.value }],
    opacity: op.value,
  }));

  const RIM = "#6B5A1E";
  const BTN_D = BTN_R * 2;

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
          backgroundColor: isActive ? C.accent : C.surface + "F0",
          borderWidth: 2,
          borderColor: isActive ? C.accent : RIM + "99",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.35,
          shadowRadius: 5,
          elevation: 6,
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
interface ModeDialLabelProps {
  currentMode: ModeSlot;
  onModeChange: (mode: ModeSlot) => void;
  topInset: number;
  /** Called when user selects "menu" from the fan. */
  onMenuToggle: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export function ModeDialLabel({
  currentMode,
  onModeChange,
  topInset,
  onMenuToggle,
}: ModeDialLabelProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const { t } = useLanguage();

  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  const overlayOp = useSharedValue(0);

  const open = useCallback(() => {
    setIsOpen(true);
    isOpenRef.current = true;
    overlayOp.value = withTiming(0.4, { duration: 180 });
  }, [overlayOp]);

  const close = useCallback(() => {
    overlayOp.value = withTiming(0, { duration: 140 });
    setTimeout(() => { setIsOpen(false); isOpenRef.current = false; }, 150);
  }, [overlayOp]);

  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));

  const label = slotLabel(t, currentMode);

  return (
    <>
      {/* Dim backdrop — tap to close fan */}
      {isOpen && (
        <Animated.View
          style={[
            {
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 99998, backgroundColor: "#000",
              pointerEvents: "box-none" as const,
            },
            overlayStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={() => closeRef.current()} />
        </Animated.View>
      )}

      {/* Anchor: top-center, overflow visible so fan buttons can extend downward */}
      <View
        style={{
          position: "absolute",
          top: topInset + 4,
          alignSelf: "center",
          zIndex: 99999,
          alignItems: "center",
          // overflow visible so fan renders outside this container
        }}
        pointerEvents="box-none"
      >
        {/* Fan buttons — rendered relative to the label center */}
        {isOpen && MODE_LIST.map((mode, idx) => (
          <FanButton
            key={mode.slot}
            x={POSITIONS[idx].x}
            y={POSITIONS[idx].y + 16} // offset down a bit from label center
            icon={mode.icon}
            label={slotLabel(t, mode.slot)}
            isActive={currentMode === mode.slot}
            delay={idx * 28}
            onPress={() => {
              closeRef.current();
              if (mode.slot === "menu") {
                setTimeout(() => onMenuToggle(), 60);
              } else {
                onModeChange(mode.slot);
              }
            }}
          />
        ))}

        {/* The text label itself */}
        <Pressable
          onPress={() => {
            if (isOpenRef.current) closeRef.current();
            else open();
          }}
          style={{
            paddingHorizontal: 18,
            paddingVertical: 6,
            borderRadius: 20,
          }}
          accessibilityRole="button"
          accessibilityLabel={t("switcher", "openDial")}
          testID="mode-cycle-label"
        >
          <Text
            style={{
              fontFamily: "SpaceGrotesk_600SemiBold",
              fontSize: S.ms(12, 0.3),
              color: isOpen ? C.accent : C.textSecondary,
              letterSpacing: 1.8,
              textTransform: "uppercase" as const,
            }}
          >
            {label}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

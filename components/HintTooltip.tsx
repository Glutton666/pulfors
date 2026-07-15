// HintTooltip.tsx — 첫 진입 시 1회 표시되는 인앱 힌트 컴포넌트
// useFirstTimeHint 훅과 함께 사용

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";

const HINT_PREFIX = "hint_shown_v1_";
const FADE_MS = 280;
const AUTO_HIDE_MS = 6000;

// ── useFirstTimeHint 훅 ────────────────────────────────────────────
// 한 번 보여준 힌트는 다시 표시하지 않음
export function useFirstTimeHint(hintKey: string): {
  shouldShow: boolean;
  dismiss: () => void;
} {
  const [shouldShow, setShouldShow] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    const key = HINT_PREFIX + hintKey;
    AsyncStorage.getItem(key).then((val) => {
      if (!val) setShouldShow(true);
    });
  }, [hintKey]);

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setShouldShow(false);
    AsyncStorage.setItem(HINT_PREFIX + hintKey, "1");
  };

  return { shouldShow, dismiss };
}

// ── HintTooltip 컴포넌트 ───────────────────────────────────────────

export interface HintTooltipProps {
  hintKey: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  position?: "top" | "bottom";
  style?: object;
}

export function HintTooltip({
  hintKey,
  message,
  icon = "information-circle-outline",
  position = "bottom",
  style,
}: HintTooltipProps) {
  const { colors: C } = useTheme();
  const { shouldShow, dismiss } = useFirstTimeHint(hintKey);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (shouldShow) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start();
      timerRef.current = setTimeout(dismiss, AUTO_HIDE_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          backgroundColor: C.surface,
          borderColor: C.accent + "66",
          ...(position === "top" ? { bottom: "100%" as any, marginBottom: 6 } : { top: "100%" as any, marginTop: 6 }),
        },
        style,
      ]}
      pointerEvents="box-none"
    >
      <Ionicons name={icon} size={16} color={C.accent} style={styles.icon} />
      <Text style={[styles.message, { color: C.text }]}>{message}</Text>
      <Pressable onPress={dismiss} hitSlop={8} style={styles.closeBtn}>
        <Ionicons name="close" size={14} color={C.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

// ── 인라인 힌트 배너 (모달/화면 상단 고정용) ─────────────────────

export interface HintBannerProps {
  hintKey: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function HintBanner({ hintKey, message, icon = "bulb-outline" }: HintBannerProps) {
  const { colors: C } = useTheme();
  const { shouldShow, dismiss } = useFirstTimeHint(hintKey);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (shouldShow) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start();
      const t = setTimeout(dismiss, AUTO_HIDE_MS);
      return () => clearTimeout(t);
    }
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          opacity,
          backgroundColor: C.accent + "18",
          borderColor: C.accent + "44",
        },
      ]}
    >
      <Ionicons name={icon} size={15} color={C.accent} style={styles.icon} />
      <Text style={[styles.bannerText, { color: C.text }]} numberOfLines={2}>
        {message}
      </Text>
      <Pressable onPress={dismiss} hitSlop={10}>
        <Ionicons name="close-circle" size={18} color={C.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

// ── 스타일 ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 999,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 4,
    marginBottom: 6,
  },
  icon: {
    marginRight: 6,
  },
  message: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  closeBtn: {
    marginLeft: 6,
    padding: 2,
  },
});

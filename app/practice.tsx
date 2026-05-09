import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { setPendingImport } from "@/lib/pending-import";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { logger } from "@/lib/logger";

export default function PracticeDeepLink() {
  const { d } = useLocalSearchParams<{ d: string }>();
  const router = useRouter();
  const processed = useRef(false);
  const { colors: C } = useTheme();
  const styles = make_styles(C);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    if (!d) {
      router.replace("/");
      return;
    }

    try {
      const raw = decodeURIComponent(d);
      const decoded = JSON.parse(atob(raw));
      if (decoded && decoded.bpm && decoded.beatTypes) {
        // noteSamples 는 송신 디바이스의 로컬 파일 URI 이므로 수신 측에서는
        // 유효하지 않고, 외부 URL이 포함될 경우 외부 네트워크 요청을 유발한다.
        // pending import 저장 전에 제거한다.
        decoded.noteSamples = {};
        setPendingImport(decoded);
      }
    } catch (e) {
      logger.warn("Deep link parse error:", e);
    }

    router.replace("/");
  }, [d]);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ActivityIndicator size="large" color={C.textSecondary} />
      <Text style={[styles.text, { color: C.textSecondary }]}>설정 가져오는 중...</Text>
    </View>
  );
}

const make_styles = (C: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  text: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 16,
  },
});

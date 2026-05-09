import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { setPendingImport } from "@/lib/pending-import";
import { sanitizeDeepLinkEntry } from "@/lib/deep-link-import";
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
      const safe = sanitizeDeepLinkEntry(decoded);
      if (safe) {
        setPendingImport(safe);
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

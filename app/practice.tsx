import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { setPendingImport } from "@/lib/pending-import";
import Colors from "@/constants/colors";

export default function PracticeDeepLink() {
  const { d } = useLocalSearchParams<{ d: string }>();
  const router = useRouter();
  const processed = useRef(false);

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
        setPendingImport(decoded);
      }
    } catch (e) {
      console.warn("Deep link parse error:", e);
    }

    router.replace("/");
  }, [d]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.textSecondary} />
      <Text style={styles.text}>설정 가져오는 중...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  text: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 16,
    color: Colors.textSecondary,
  },
});

// ============================================================
// ScoreEditorShareModal — 공유 단축 보텀 시트
// ============================================================

import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";

export interface ScoreEditorShareModalProps {
  visible: boolean;
  onClose: () => void;
  onShareJson: () => Promise<void>;
  onSharePng: () => Promise<void>;
}

export function ScoreEditorShareModal({
  visible,
  onClose,
  onShareJson,
  onSharePng,
}: ScoreEditorShareModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();

  if (!visible) return null;

  return (
    <Pressable
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.45)",
      }}
      onPress={onClose}
    >
      <Pressable
        style={[
          {
            position: "absolute",
            bottom: 32,
            left: 16,
            right: 16,
            backgroundColor: C.surface,
            borderRadius: Radius.lg,
            padding: Spacing.md,
            borderWidth: 1,
            borderColor: C.border,
            gap: 8,
          },
        ]}
        onPress={() => {}}
      >
        <Text
          style={{
            fontSize: S.ms(14, 0.3),
            fontWeight: "600",
            color: C.text,
            marginBottom: 4,
          }}
        >
          {t("scoreMode", "shareScoreTitle")}
        </Text>

        <Pressable
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: Spacing.sm,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: C.border,
              backgroundColor: pressed ? C.surfaceLight : "transparent",
            },
          ]}
          onPress={async () => {
            onClose();
            await onShareJson();
          }}
          testID="score-share-json"
        >
          <Ionicons name="document-text-outline" size={S.ms(20, 0.4)} color={C.text} />
          <Text style={{ fontSize: S.ms(14, 0.3), color: C.text }}>
            {t("scoreMode", "exportJson")}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: Spacing.sm,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: C.border,
              backgroundColor: pressed ? C.surfaceLight : "transparent",
            },
          ]}
          onPress={async () => {
            onClose();
            await onSharePng();
          }}
          testID="score-share-png"
        >
          <Ionicons name="image-outline" size={S.ms(20, 0.4)} color={C.text} />
          <Text style={{ fontSize: S.ms(14, 0.3), color: C.text }}>
            {t("scoreMode", "exportPng")}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            {
              marginTop: 4,
              padding: Spacing.sm,
              borderRadius: Radius.md,
              alignItems: "center",
              backgroundColor: pressed ? C.surfaceLight : "transparent",
            },
          ]}
          onPress={onClose}
        >
          <Text style={{ fontSize: S.ms(13, 0.3), color: C.textSecondary }}>
            {t("scoreMode", "cancel")}
          </Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

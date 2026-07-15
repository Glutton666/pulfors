import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useScale } from "@/lib/scale";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Goal } from "@/lib/activity-log";
import { Spacing } from "@/constants/tokens";

interface GoalCompletePopupProps {
  popups: Goal[];
  topOffset: number;
  onDismiss: (id: string) => void;
}

function colorForGoal(goal: Goal, accent: string): string {
  switch (goal.type) {
    case "beat_mode_time":
      return "#58A6FF";
    case "bar_mode_time":
      return "#F0883E";
    case "room_time":
      return "#A371F7";
    default:
      return accent;
  }
}

export function GoalCompletePopup({ popups, topOffset, onDismiss }: GoalCompletePopupProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const { t } = useLanguage();
  const styles = makeStyles(C, S);

  if (popups.length === 0) return null;

  return (
    <View
      style={[styles.container, { top: topOffset }]}
      pointerEvents="box-none"
    >
      {popups.map((goal) => {
        const goalColor = colorForGoal(goal, C.accent);
        return (
          <Pressable
            key={`popup-${goal.id}`}
            style={[styles.popup, { borderColor: goalColor, backgroundColor: C.surface }]}
            onPress={() => onDismiss(goal.id)}
            accessibilityRole="button"
            accessibilityLabel={`${goal.label} ${t("main", "goalComplete")}`}
            accessibilityHint={t("main", "tapToDismiss")}
          >
            <Ionicons name="checkmark-circle" size={S.ms(22, 0.4)} color={goalColor} />
            <View style={styles.info}>
              <Text style={[styles.title, { color: goalColor }]}>
                {goal.label} {t("main", "goalComplete")}
              </Text>
              <Text style={[styles.sub, { color: C.textTertiary }]}>
                {t("main", "tapToDismiss")}
              </Text>
            </View>
            <Ionicons name="close" size={S.ms(16, 0.4)} color={C.textTertiary} />
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(C: any, S: any) {
  return StyleSheet.create({
    container: {
      position: "absolute",
      left: S.ms(16, 0.3),
      right: S.ms(16, 0.3),
      zIndex: 100,
      gap: S.ms(8, 0.3),
    },
    popup: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.ms(10, 0.3),
      borderWidth: 1,
      borderRadius: S.ms(14, 0.3),
      padding: S.ms(14, 0.3),
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 10,
    },
    info: {
      flex: 1,
      gap: Spacing.xxs,
    },
    title: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: S.ms(14, 0.3),
      letterSpacing: 0.2,
    },
    sub: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: S.ms(11, 0.3),
    },
  });
}

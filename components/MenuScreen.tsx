import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Spacing } from "@/constants/tokens";

interface MenuScreenProps {
  topInset: number;
  onClose: () => void;
  onOpenDial: () => void;
  onSettings: () => void;
  onSignalGen: () => void;
  onWorkUp: () => void;
  onPracticeBook: () => void;
  onMoreMenu: () => void;
}

export function MenuScreen({
  topInset,
  onClose,
  onOpenDial,
  onSettings,
  onSignalGen,
  onWorkUp,
  onPracticeBook,
  onMoreMenu,
}: MenuScreenProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();

  const ITEM_H = S.ms(64, 0.4);
  const ICON_SIZE = S.ms(22, 0.4);

  const items: {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    testID?: string;
  }[] = [
    {
      icon: <Ionicons name="settings-outline" size={ICON_SIZE} color={C.textSecondary} />,
      label: t("main", "menuSettings"),
      onPress: onSettings,
    },
    {
      icon: <MaterialCommunityIcons name="waveform" size={ICON_SIZE} color={C.accent} />,
      label: t("main", "menuSignalGenerator"),
      onPress: onSignalGen,
    },
    {
      icon: <MaterialCommunityIcons name="chart-line" size={ICON_SIZE} color={C.accent} />,
      label: t("main", "menuWorkUp"),
      onPress: onWorkUp,
    },
    {
      icon: <MaterialCommunityIcons name="notebook-outline" size={ICON_SIZE} color={C.accent} />,
      label: t("main", "menuPracticeNote"),
      onPress: onPracticeBook,
    },
    {
      icon: <Ionicons name="ellipsis-horizontal" size={ICON_SIZE} color={C.accent} />,
      label: t("main", "menuMore"),
      onPress: onMoreMenu,
      testID: "menu-more",
    },
  ];

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { zIndex: 500, backgroundColor: C.background },
      ]}
    >
      <Pressable
        onPress={onOpenDial}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: S.ms(8, 0.3),
          paddingTop: topInset + S.ms(12, 0.3),
          paddingHorizontal: S.ms(20, 0.3),
          paddingBottom: S.ms(12, 0.3),
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
        accessibilityRole="button"
      >
        <Ionicons name="menu" size={S.ms(22, 0.4)} color={C.accent} />
        <Text
          style={{
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: S.ms(20, 0.4),
            color: C.accent,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {t("switcher", "menu")}
        </Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingVertical: S.ms(8, 0.3) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((item, idx) => (
          <React.Fragment key={idx}>
            <Pressable
              style={({ pressed }) => ({
                flexDirection: "row" as const,
                alignItems: "center" as const,
                gap: S.ms(16, 0.4),
                height: ITEM_H,
                paddingHorizontal: S.ms(20, 0.3),
                backgroundColor: pressed ? C.surfaceLight : "transparent",
              })}
              onPress={item.onPress}
              accessibilityRole="menuitem"
              testID={item.testID}
            >
              <View style={{ width: S.ms(28, 0.4), alignItems: "center" as const }}>
                {item.icon}
              </View>
              <Text
                style={{
                  flex: 1,
                  fontFamily: "SpaceGrotesk_500Medium",
                  fontSize: S.ms(16, 0.4),
                  color: C.text,
                }}
              >
                {item.label}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={S.ms(16, 0.3)}
                color={C.textTertiary}
              />
            </Pressable>
            {idx < items.length - 1 && (
              <View
                style={{
                  height: 1,
                  backgroundColor: C.border,
                  marginHorizontal: S.ms(20, 0.3),
                  opacity: 0.5,
                }}
              />
            )}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

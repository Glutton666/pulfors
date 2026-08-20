import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";

interface MenuScreenProps {
  topInset: number;
  onClose: () => void;
  onOpenDial: () => void;
  onSettings: () => void;
  onSignalGen: () => void;
  onWorkUp: () => void;
  onStemSep: () => void;
  onScore: () => void;
  onPolygon: () => void;
}

export function MenuScreen({
  topInset,
  onClose,
  onOpenDial,
  onSettings,
  onSignalGen,
  onWorkUp,
  onStemSep,
  onScore,
  onPolygon,
}: MenuScreenProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const [showLab, setShowLab] = React.useState(false);

  const ITEM_H = S.ms(64, 0.4);
  const ICON_SIZE = S.ms(22, 0.4);

  const mainItems: {
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
      icon: <Ionicons name="flask-outline" size={ICON_SIZE} color={C.accent} />,
      label: t("main", "menuLab"),
      onPress: () => setShowLab(true),
      testID: "menu-lab",
    },
  ];

  const labItems: {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    testID?: string;
  }[] = [
    {
      icon: <MaterialCommunityIcons name="layers-triple-outline" size={ICON_SIZE} color={C.accent} />,
      label: t("stemSep", "title"),
      onPress: onStemSep,
      testID: "menu-stemSep",
    },
    {
      icon: <Ionicons name="document-text-outline" size={ICON_SIZE} color={C.accent} />,
      label: t("polygon", "scoreMenuLabel"),
      onPress: onScore,
      testID: "menu-score",
    },
    {
      icon: <Ionicons name="shapes-outline" size={ICON_SIZE} color={C.accent} />,
      label: t("polygon", "polygonMenuLabel"),
      onPress: onPolygon,
      testID: "menu-polygon",
    },
  ];
  const items = showLab ? labItems : mainItems;

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { zIndex: 500, backgroundColor: C.background },
      ]}
    >
      <Pressable
        onPress={showLab ? () => setShowLab(false) : onOpenDial}
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
        <Ionicons
          name={showLab ? "chevron-back" : "menu"}
          size={S.ms(22, 0.4)}
          color={C.accent}
        />
        <Text
          style={{
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: S.ms(20, 0.4),
            color: C.accent,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {showLab ? t("main", "menuLab") : t("switcher", "menu")}
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

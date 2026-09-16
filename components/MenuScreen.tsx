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
  onProfile: () => void;
  onSignalGen: () => void;
  onWorkUp: () => void;
  onStage: () => void;
  onScore: () => void;
  onPolygon: () => void;
  onAssistant: () => void;
  onDrumKit: () => void;
  labUnlocked?: boolean;
}

export function MenuScreen({
  topInset,
  onClose,
  onOpenDial,
  onSettings,
  onProfile,
  onSignalGen,
  onWorkUp,
  onStage,
  onScore,
  onPolygon,
  onAssistant,
  onDrumKit,
  labUnlocked = false,
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
      icon: <Ionicons name="person-circle-outline" size={ICON_SIZE} color={C.accent} />,
      label: t("main", "menuProfile"),
      onPress: onProfile,
      testID: "menu-profile",
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
    ...(labUnlocked ? [{
      icon: <Ionicons name="flask-outline" size={ICON_SIZE} color={C.accent} />,
      label: t("main", "menuLab"),
      onPress: () => setShowLab(true),
      testID: "menu-lab",
    }] : []),
  ];

  const labItems: {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    testID?: string;
  }[] = [
    {
      icon: <Ionicons name="mic-outline" size={ICON_SIZE} color={C.accent} />,
      label: t("main", "menuAssistant"),
      onPress: onAssistant,
      testID: "menu-assistant",
    },
    {
      icon: <Ionicons name="people-outline" size={ICON_SIZE} color={C.accent} />,
      label: t("stageMode", "title"),
      onPress: onStage,
      testID: "menu-stage",
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
    {
      icon: <MaterialCommunityIcons name="music-note-outline" size={ICON_SIZE} color={C.accent} />,
      label: t("main", "menuDrumKit"),
      onPress: onDrumKit,
      testID: "menu-drum-kit",
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
        accessibilityLabel={showLab ? t("main", "menuBack") : t("switcher", "openDial")}
        accessibilityHint={showLab ? t("main", "menuBackHint") : t("switcher", "openDialHint")}
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
              accessibilityLabel={item.label}
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

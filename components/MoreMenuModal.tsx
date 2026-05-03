import React from "react";
import { Modal, Pressable, View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";

export interface MoreMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onScheduledStart: () => void;
}

export function MoreMenuModal({ visible, onClose, onScheduledStart }: MoreMenuModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const styles = makeStyles(C);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: C.surface, borderColor: C.border, paddingTop: (insets.top || webTopInset) + 16, paddingBottom: 24 + (insets.bottom || (Platform.OS === "web" ? 34 : 0)) },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: C.text }]}>{t("main", "menuMore")}</Text>

          <Pressable
            style={({ pressed }) => [styles.item, { borderColor: C.border }, pressed && { opacity: 0.7 }]}
            onPress={onScheduledStart}
            accessibilityRole="button"
            accessibilityLabel={t("scheduledStart", "title")}
            testID="more-menu-scheduled-start"
          >
            <MaterialCommunityIcons name="clock-time-four-outline" size={S.ms(22, 0.4)} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: C.text }]}>{t("scheduledStart", "title")}</Text>
              <Text style={[styles.itemHint, { color: C.textSecondary }]}>{t("scheduledStart", "menuHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={S.ms(18, 0.3)} color={C.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.closeBtn, { backgroundColor: C.background, borderColor: C.border }, pressed && { opacity: 0.8 }]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={[styles.closeText, { color: C.text }]}>{t("scheduledStart", "close")}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end" as const,
    },
    sheet: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      paddingHorizontal: Spacing.lg,
      gap: Spacing.md,
    },
    handle: {
      alignSelf: "center" as const,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: Spacing.sm,
    },
    title: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
      marginBottom: Spacing.xs,
    },
    item: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      borderWidth: 1,
      borderRadius: Radius.md,
    },
    itemTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    itemHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      marginTop: 2,
    },
    closeBtn: {
      marginTop: Spacing.sm,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      alignItems: "center" as const,
    },
    closeText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
  });

import React from "react";
import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedModal } from "@/components/AnimatedModal";
import { SettingsProfileTab, type SettingsProfileTabProps } from "@/components/settings/SettingsProfileTab";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ProfileModalProps = Omit<SettingsProfileTabProps, "visible"> & {
  visible: boolean;
  onClose: () => void;
};

export function ProfileModal({ visible, onClose, ...profileProps }: ProfileModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const insets = useSafeAreaInsets();

  return (
    <AnimatedModal visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <View testID="profile-screen" style={{ flex: 1, backgroundColor: C.background, paddingTop: insets.top || (Platform.OS === "web" ? 67 : 0), paddingBottom: insets.bottom || (Platform.OS === "web" ? 34 : 0) }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("a11y", "closeModal")} testID="profile-back">
              <Ionicons name="arrow-back" size={22} color={C.textSecondary} />
            </Pressable>
            <Ionicons name="person-circle-outline" size={S.ms(22, 0.4)} color={C.accent} />
            <Text style={{ flex: 1, marginLeft: 8, color: C.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 }}>
              {t("settings", "profileTab")}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("a11y", "closeModal")} testID="profile-close">
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 18, paddingBottom: 28 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <SettingsProfileTab visible={visible} {...profileProps} />
          </ScrollView>
      </View>
    </AnimatedModal>
  );
}
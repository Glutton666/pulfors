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
    <AnimatedModal visible={visible} transparent onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.58)", paddingTop: (insets.top || (Platform.OS === "web" ? 67 : 0)) + 16 }}
        onPress={onClose}
      >
        <Pressable
          style={{
            alignSelf: "center",
            width: "92%",
            maxWidth: 560,
            maxHeight: "92%",
            backgroundColor: C.surface,
            borderColor: C.border,
            borderWidth: 1,
            borderRadius: 16,
            overflow: "hidden",
          }}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Ionicons name="person-circle-outline" size={S.ms(22, 0.4)} color={C.accent} />
            <Text style={{ flex: 1, marginLeft: 8, color: C.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 }}>
              {t("settings", "profileTab")}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("a11y", "closeModal")} testID="profile-close">
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 18, paddingBottom: 28 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <SettingsProfileTab visible={visible} {...profileProps} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </AnimatedModal>
  );
}
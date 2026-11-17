import React, { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedModal } from "@/components/AnimatedModal";
import { type SettingsProfileTabProps } from "@/components/settings/SettingsProfileTab";
import { ProfileManager } from "@/components/ProfileManager";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { confirmDestructive } from "@/lib/confirm";

export type ProfileModalProps = Omit<SettingsProfileTabProps, "visible"> & {
  visible: boolean;
  onClose: () => void;
};

export function ProfileModal({ visible, onClose, roomTrackingActive, trackingRoomName, onStartRoomTracking, onStopRoomTracking }: ProfileModalProps) {
  const { colors: C } = useTheme();
  const { t, language } = useLanguage();
  const [exitState, setExitState] = useState({ dirty: false, busy: false });
  const onExitStateChange = useCallback((dirty: boolean, busy: boolean) => setExitState({ dirty, busy }), []);
  const requestClose = () => {
    if (exitState.busy) return;
    if (!exitState.dirty) { onClose(); return; }
    confirmDestructive(language === "ko" ? "저장하지 않은 프로필 편집을 버릴까요?" : "Discard unsaved profile edits?", {
      confirmText: language === "ko" ? "버리고 닫기" : "Discard and close",
      cancelText: language === "ko" ? "계속 편집" : "Keep editing",
      onConfirm: onClose,
    });
  };
  const S = useScale();
  const insets = useSafeAreaInsets();

  return (
    <AnimatedModal visible={visible} onRequestClose={requestClose} statusBarTranslucent>
      <View testID="profile-screen" style={{ flex: 1, backgroundColor: C.background, paddingTop: insets.top || (Platform.OS === "web" ? 67 : 0), paddingBottom: insets.bottom || (Platform.OS === "web" ? 34 : 0) }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Pressable onPress={requestClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("a11y", "closeModal")} testID="profile-back">
              <Ionicons name="arrow-back" size={22} color={C.textSecondary} />
            </Pressable>
            <Ionicons name="person-circle-outline" size={S.ms(22, 0.4)} color={C.accent} />
            <Text style={{ flex: 1, marginLeft: 8, color: C.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 }}>
              {t("settings", "profileTab")}
            </Text>
            <Pressable onPress={requestClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("a11y", "closeModal")} testID="profile-close">
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 18, paddingBottom: 28 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {visible && <ProfileManager onExitStateChange={onExitStateChange}
              roomTrackingActive={roomTrackingActive} trackingRoomName={trackingRoomName}
              onStartRoomTracking={onStartRoomTracking} onStopRoomTracking={onStopRoomTracking} />}
          </ScrollView>
      </View>
    </AnimatedModal>
  );
}
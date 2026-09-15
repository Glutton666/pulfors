import React, { useState } from "react";
import { View, Text, Pressable, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useScale } from "@/lib/scale";
import { FontSize, Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { AssistantShortcutsGuide } from "@/components/AssistantShortcutsGuide";

export function AssistantSettingsPanel() {
  const { colors: C } = useTheme();
  const S = useScale();
  const { language, t } = useLanguage();
  const {
    isSupported: voiceSupported,
    isEnabled: voiceEnabled,
    isListening: voiceListening,
    setEnabled: setVoiceEnabled,
  } = useVoiceAssistant();
  const [showAssistantGuide, setShowAssistantGuide] = useState(false);

  return (
    <>
      <View style={{ gap: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Ionicons name="mic-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={{ color: C.text, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16 }}>
            {t("settings", "voiceAssistant")}
          </Text>
        </View>
        <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, fontFamily: "Inter_400Regular", marginBottom: Spacing.sm }}>
          {t("settings", "voiceAssistantHint")}
        </Text>
        {voiceSupported ? (
          <Pressable
            onPress={() => setVoiceEnabled(!voiceEnabled)}
            accessibilityRole="switch"
            accessibilityState={{ checked: voiceEnabled }}
            testID="voice-assistant-toggle"
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.overlay10 }}
          >
            <Text style={{ color: C.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>
              {t("settings", "voiceAssistantEnabled")}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
              {voiceEnabled && voiceListening && (
                <Text style={{ color: C.accent, fontSize: FontSize.caption, fontFamily: "Inter_400Regular" }}>
                  {t("settings", "voiceAssistantListening")}
                </Text>
              )}
              <Switch
                value={voiceEnabled}
                onValueChange={setVoiceEnabled}
                trackColor={{ true: C.accent }}
                thumbColor={C.surface}
              />
            </View>
          </Pressable>
        ) : (
          <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, fontFamily: "Inter_400Regular", paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: C.overlay10 }}>
            {t("settings", "voiceAssistantIosHint")}
          </Text>
        )}
      </View>

      <View style={{ height: 1, backgroundColor: C.border, marginVertical: 16 }} />

      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Ionicons name="link-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={{ color: C.text, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16 }}>
            {language === "ko" ? "어시스턴트 연동" : "Assistant Integration"}
          </Text>
        </View>
        <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, fontFamily: "Inter_400Regular", marginBottom: Spacing.sm }}>
          {language === "ko"
            ? "Siri 또는 Google 어시스턴트로 메트로놈을 제어할 수 있습니다."
            : "Control the metronome with Siri or Google Assistant."}
        </Text>
        <Pressable
          onPress={() => setShowAssistantGuide(true)}
          accessibilityRole="button"
          accessibilityLabel={language === "ko" ? "단축어 설정 방법 보기" : "How to set up shortcuts"}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.overlay10 }}
          testID="assistant-shortcuts-guide"
        >
          <Text style={{ color: C.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>
            {language === "ko" ? "단축어 설정 방법 보기" : "How to set up shortcuts"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />
        </Pressable>
      </View>

      <AssistantShortcutsGuide
        visible={showAssistantGuide}
        onClose={() => setShowAssistantGuide(false)}
      />
    </>
  );
}
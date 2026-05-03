import React from "react";
import { Pressable, View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { FontSize } from "@/constants/tokens";

export function VoiceAssistantButton() {
  const { enabled, isSupported, isListening, startListening, stopListening, lastTranscript } = useVoiceAssistant();
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  if (!enabled || !isSupported) return null;

  const onPress = () => (isListening ? stopListening() : startListening());

  return (
    <View pointerEvents="box-none" style={s.wrap}>
      {!!lastTranscript && (
        <View style={[s.bubble, { backgroundColor: C.surfaceLight, borderColor: C.border }]}>
          <Text style={[s.bubbleText, { color: C.text }]} numberOfLines={2}>
            {lastTranscript}
          </Text>
        </View>
      )}
      <Pressable
        onPress={onPress}
        style={[
          s.btn,
          {
            backgroundColor: isListening ? C.accent : C.surface,
            borderColor: C.border,
          },
        ]}
        accessibilityLabel={t("voice", "ptt")}
        testID="voice-assistant-button"
      >
        <Ionicons
          name={isListening ? "mic" : "mic-outline"}
          size={22}
          color={isListening ? C.background : C.text}
        />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 16,
    bottom: Platform.OS === "web" ? 50 : 24,
    alignItems: "flex-end",
    gap: 6,
    zIndex: 50,
  },
  bubble: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 260,
  },
  bubbleText: {
    fontSize: FontSize.small,
    fontFamily: "Inter_500Medium",
  },
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    ...(Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.2)" } as any,
      default: { elevation: 4 },
    }) as object),
  },
});

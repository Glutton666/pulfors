import React from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { noteTtsNative } from "@/lib/note-tts-runtime";
import type { SoundSet } from "@/lib/storage";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";

export type VoiceCountLanguage = "off" | "ko" | "en";
export type VoiceCountOutput = "mixed" | "voice-only";
export type VoiceCountSpeaker = "male" | "female";
export type OverlayOption = { value: SoundSet; label: string };

export function VoiceCountControl({
  value,
  onChange,
  language,
  output = "mixed",
  onOutputChange,
  speaker = "female",
  onSpeakerChange,
  nativeKoreanAvailable = Platform.OS !== "web" && noteTtsNative !== null,
}: {
  value: VoiceCountLanguage;
  onChange: (value: VoiceCountLanguage) => void;
  language: string;
  output?: VoiceCountOutput;
  onOutputChange?: (value: VoiceCountOutput) => void;
  speaker?: VoiceCountSpeaker;
  onSpeakerChange?: (value: VoiceCountSpeaker) => void;
  nativeKoreanAvailable?: boolean;
}) {
  const { colors: C } = useTheme();
  const ko = language === "ko";
  const koreanVoiceEnabled = nativeKoreanAvailable && value === "ko";
  const voiceEnabled = value !== "off" && (value !== "ko" || koreanVoiceEnabled);
  const koreanUnavailableDetail = Platform.OS === "web"
    ? ko ? "iOS·Android 네이티브 앱에서 사용" : "Use a native iOS/Android app"
    : ko ? "네이티브 앱 설치본 필요" : "Requires a native app build";
  const choices: { value: VoiceCountLanguage; label: string; detail: string; disabled?: boolean }[] = [
    { value: "off", label: ko ? "끔" : "Off", detail: ko ? "음성 카운트 끔" : "No spoken count" },
    { value: "ko", label: "한국어", detail: nativeKoreanAvailable ? "공 · 일 · 둘 · 삼…" : koreanUnavailableDetail, disabled: !nativeKoreanAvailable },
    { value: "en", label: "English", detail: "One · two · three…" },
  ];
  const toggleStyle = (active: boolean, disabled = false) => ({
    flex: 1,
    minWidth: 78,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: active ? C.accent : C.border,
    backgroundColor: active ? C.accentDim : C.surfaceLight,
    opacity: disabled ? 0.46 : 1,
  });

  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: "row", gap: 7 }}>
        {choices.map((choice) => {
          const active = value === choice.value;
          return (
            <Pressable
              key={choice.value}
              testID={`voice-count-language-${choice.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: choice.disabled }}
              aria-pressed={active}
              disabled={choice.disabled}
              onPress={() => onChange(choice.value)}
              style={toggleStyle(active, choice.disabled)}
            >
              <Text style={{ color: active ? C.accent : C.text, fontSize: 12, fontFamily: "SpaceGrotesk_600SemiBold", textAlign: "center" }}>
                {choice.label}
              </Text>
              <Text numberOfLines={1} style={{ color: C.textTertiary, fontSize: 9, textAlign: "center", marginTop: 3 }}>
                {choice.detail}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ color: C.textSecondary, fontSize: 10, fontFamily: "SpaceGrotesk_600SemiBold" }}>
            {ko ? "출력" : "Output"}
          </Text>
          <View style={{ flexDirection: "row", gap: 5 }}>
            {([
              { value: "mixed" as const, label: ko ? "클릭 + 음성" : "Click + voice" },
              { value: "voice-only" as const, label: ko ? "음성만" : "Voice only" },
            ]).map((choice) => {
              const active = output === choice.value;
              return (
                <Pressable
                  key={choice.value}
                  testID={`voice-count-output-${choice.value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !voiceEnabled }}
                  aria-pressed={active}
                  disabled={!voiceEnabled}
                  onPress={() => onOutputChange?.(choice.value)}
                  style={[toggleStyle(active, !voiceEnabled), { minWidth: 0, paddingHorizontal: 4 }]}
                >
                  <Text numberOfLines={1} style={{ color: active ? C.accent : C.text, fontSize: 10, fontFamily: "SpaceGrotesk_600SemiBold", textAlign: "center" }}>
                    {choice.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ flex: 0.72, gap: 5 }}>
          <Text style={{ color: C.textSecondary, fontSize: 10, fontFamily: "SpaceGrotesk_600SemiBold" }}>
            {ko ? "음성" : "Voice"}
          </Text>
          <View style={{ flexDirection: "row", gap: 5 }}>
            {([
              { value: "male" as const, label: ko ? "남성" : "Male" },
              { value: "female" as const, label: ko ? "여성" : "Female" },
            ]).map((choice) => {
              const active = speaker === choice.value;
              return (
                <Pressable
                  key={choice.value}
                  testID={`voice-count-speaker-${choice.value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !voiceEnabled }}
                  aria-pressed={active}
                  disabled={!voiceEnabled}
                  onPress={() => onSpeakerChange?.(choice.value)}
                  style={[toggleStyle(active, !voiceEnabled), { minWidth: 0, paddingHorizontal: 4 }]}
                >
                  <Text style={{ color: active ? C.accent : C.text, fontSize: 10, fontFamily: "SpaceGrotesk_600SemiBold", textAlign: "center" }}>
                    {choice.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={{ borderRadius: 10, padding: 11, backgroundColor: C.overlay08, gap: 5 }}>
        <Text style={{ color: C.text, fontSize: 12, lineHeight: 18, fontFamily: "SpaceGrotesk_500Medium" }}>
          {ko ? "한국어: 공 · 일 · 둘 · 삼 · 넷 · 오 · 육 · 칠 · 팔 · 구" : "Korean: 공 · 일 · 둘 · 삼 · 넷 · 오 · 육 · 칠 · 팔 · 구"}
        </Text>
        <Text style={{ color: C.textSecondary, fontSize: 11, lineHeight: 16 }}>
          {ko
            ? "첫 분할은 기본 박 번호, 그 뒤는 분할 번호입니다: 일·둘·삼·넷 / 둘·둘·삼·넷. 10은 공, 12는 둘, 14는 넷, 16은 육. 강·중·약은 각 칸의 설정을 따르며 무음 칸은 건너뛰어도 번호가 밀리지 않습니다."
            : "First subdivision: beat number; later subdivisions: subdivision number (one-two-three-four / two-two-three-four). Korean uses the ones digit: 10 공, 12 둘, 14 넷, 16 육. Emphasis follows each slot; muted slots never renumber later counts."}
        </Text>
        <Text style={{ color: C.textTertiary, fontSize: 10, lineHeight: 15 }}>
          {ko
            ? `${koreanVoiceEnabled ? "기기에 설치된 오프라인 한국어 음성으로 미리 음원을 만들고, 메트로놈이 박자에 맞춰 재생합니다." : "영어 카운트는 앱에 들어 있는 음원을 사용합니다. 한국어 기기 음성은 iOS·Android 앱에서 사용할 수 있습니다."} 짧은 분할에서는 말소리가 겹칠 수 있습니다(240 BPM·9분할 = 27.8ms). 숫자는 생략하지 않고 템포나 말끝을 바꾸지 않습니다.`
            : `${koreanVoiceEnabled ? "Korean speech uses the device's installed offline voice and is prepared before the metronome starts." : "English uses bundled clips. Live Korean device speech is available in the iOS/Android app."} Speech can overlap in short slots (240 BPM × 9 = 27.8ms). Counts are never omitted and metronome timing and speech endings are preserved.`}
        </Text>
      </View>
    </View>
  );
}

export function SoundSetOverlayPicker({
  visible,
  base,
  selected,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  base: SoundSet | null;
  selected?: SoundSet;
  options: OverlayOption[];
  onSelect: (value: SoundSet | undefined) => void;
  onClose: () => void;
}) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const ko = language === "ko";
  const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.56)" },
    sheet: {
      width: "100%",
      maxWidth: 560,
      maxHeight: "78%",
      height: "78%",
      minHeight: 0,
      alignSelf: "center",
      backgroundColor: C.surface,
      borderColor: C.border,
      borderWidth: 1,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 20,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    title: { color: C.text, fontSize: 16, fontFamily: "SpaceGrotesk_600SemiBold" },
    subtitle: { color: C.textSecondary, fontSize: 11, lineHeight: 16, marginBottom: 12 },
    option: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: C.surfaceLight,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 7,
    },
    optionText: { flex: 1, color: C.text, fontSize: 13, fontFamily: "SpaceGrotesk_500Medium" },
  });

  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sound overlay picker"
          testID="sound-overlay-close-backdrop"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.title}>{ko ? "겹침 클릭 한 개 선택" : "Add one extra click"}</Text>
            <Pressable
              testID="sound-overlay-close"
              accessibilityRole="button"
              accessibilityLabel={ko ? "닫기" : "Close picker"}
              hitSlop={10}
              onPress={onClose}
              style={{ padding: 6 }}
            >
              <Ionicons name="close" size={21} color={C.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            {ko
              ? `${options.find(item => item.value === base)?.label ?? "기본음"}의 선택은 유지하고 같은 칸에 다른 클릭 한 개를 겹칩니다.`
              : base ? `Keep ${options.find((item) => item.value === base)?.label ?? "this sound"} as the base, then layer one click.` : "Choose one additional click sound."}
          </Text>
          <ScrollView style={{ flex: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Pressable
              testID="sound-overlay-none"
              accessibilityRole="button"
              accessibilityState={{ selected: !selected }}
              aria-pressed={!selected}
              onPress={() => onSelect(undefined)}
              style={[styles.option, !selected && { borderColor: C.accent, backgroundColor: C.accentDim }]}
            >
              <Ionicons name={!selected ? "checkmark-circle" : "ellipse-outline"} size={18} color={!selected ? C.accent : C.textTertiary} />
              <Text style={styles.optionText}>{ko ? "겹침 없음" : "No extra click"}</Text>
            </Pressable>
            {options.filter((option) => option.value !== base).map((option) => {
              const active = selected === option.value;
              return (
                <Pressable
                  key={option.value}
                  testID={`sound-overlay-option-${option.value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  aria-pressed={active}
                  onPress={() => onSelect(option.value)}
                  style={[styles.option, active && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                >
                  <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={18} color={active ? C.accent : C.textTertiary} />
                  <Text style={styles.optionText}>{option.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

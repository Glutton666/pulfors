import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SoundSet } from "@/lib/storage";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";

export type VoiceCountLanguage = "off" | "ko" | "en";
export type OverlayOption = { value: SoundSet; label: string };

export function VoiceCountControl({
  value,
  onChange,
  language,
}: {
  value: VoiceCountLanguage;
  onChange: (value: VoiceCountLanguage) => void;
  language: string;
}) {
  const { colors: C } = useTheme();
  const choices: { value: VoiceCountLanguage; label: string; detail: string }[] = [
    { value: "off", label: language === "ko" ? "끔" : "Off", detail: language === "ko" ? "음성 카운트 끔" : "No spoken count" },
    { value: "ko", label: "한국어", detail: "공 · 일 · 둘 · 삼…" },
    { value: "en", label: "English", detail: "One · two · three…" },
  ];

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 7 }}>
        {choices.map((choice) => {
          const active = value === choice.value;
          return (
            <Pressable
              key={choice.value}
              testID={`voice-count-language-${choice.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              aria-pressed={active}
              onPress={() => onChange(choice.value)}
              style={{
                flex: 1,
                minWidth: 78,
                paddingVertical: 9,
                paddingHorizontal: 8,
                borderRadius: 9,
                borderWidth: 1,
                borderColor: active ? C.accent : C.border,
                backgroundColor: active ? C.accentDim : C.surfaceLight,
              }}
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
      <View style={{ borderRadius: 10, padding: 11, backgroundColor: C.overlay08, gap: 5 }}>
        <Text style={{ color: C.text, fontSize: 12, lineHeight: 18, fontFamily: "SpaceGrotesk_500Medium" }}>
          {language === "ko" ? "한국어: 공 · 일 · 둘 · 삼 · 넷 · 오 · 육 · 칠 · 팔 · 구" : "Korean: 공 · 일 · 둘 · 삼 · 넷 · 오 · 육 · 칠 · 팔 · 구"}
        </Text>
        <Text style={{ color: C.textSecondary, fontSize: 11, lineHeight: 16 }}>
          {language === "ko"
            ? "첫 분할은 기본 박 번호, 그 뒤는 분할 번호입니다: 일·둘·삼·넷 / 둘·둘·삼·넷. 10은 공, 12는 둘, 14는 넷, 16은 육. 강·중·약은 각 칸의 설정을 따르며 무음 칸은 건너뛰어도 번호가 밀리지 않습니다."
            : "First subdivision: beat number; later subdivisions: subdivision number (one-two-three-four / two-two-three-four). Korean uses the ones digit: 10 공, 12 둘, 14 넷, 16 육. Emphasis follows each slot; muted slots never renumber later counts."}
        </Text>
        <Text style={{ color: C.textTertiary, fontSize: 10, lineHeight: 15 }}>
          {language === "ko"
            ? "짧은 분할에서는 발음이 겹쳐 명료도가 떨어집니다(예: 240 BPM·9분할 = 27.8ms, 음성 약 221~569ms). 숫자를 생략하거나 템포를 바꾸거나 말끝을 자르지 않습니다."
            : "Short subdivisions overlap and may be unintelligible (240 BPM × 9 = 27.8ms; clips ~221–569ms). Counts are never omitted, tempo stays fixed and syllable endings are not cut."}
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

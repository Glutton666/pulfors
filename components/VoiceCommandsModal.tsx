import React from "react";
import { Modal, View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Radius, FontSize, Spacing } from "@/constants/tokens";

interface Props {
  visible: boolean;
  onClose: () => void;
  nickname: string;
  strictNickname: boolean;
}

export function VoiceCommandsModal({ visible, onClose, nickname, strictNickname }: Props) {
  const { colors: C } = useTheme();
  const { t, language } = useLanguage();
  const trimmed = nickname.trim();
  const prefix = strictNickname && trimmed ? `${trimmed} ` : "";

  const items: { cat: string; rows: [string, string][] }[] = language === "ko"
    ? [
        { cat: "재생 제어", rows: [["재생 / 시작", "메트로놈 시작"], ["정지 / 멈춰", "메트로놈 정지"], ["토글", "재생 ↔ 정지"]] },
        { cat: "BPM", rows: [["120 BPM / 120으로", "BPM = 120"], ["빠르게", "+5"], ["많이 빠르게", "+10"], ["느리게", "-5"], ["많이 느리게", "-10"], ["두 배 빠르게", "× 2"], ["절반 속도", "÷ 2"]] },
        { cat: "박자", rows: [["3박자 / 4박자 / 6박자", "마디 박자 변경"]] },
        { cat: "기타", rows: [["리셋 / 초기화", "기본값 (120 BPM, 4박자)"], ["도움말 / 명령어", "이 목록 표시"]] },
      ]
    : [
        { cat: "Playback", rows: [["play / start", "Start metronome"], ["stop / pause", "Stop metronome"], ["toggle", "Play ↔ Stop"]] },
        { cat: "BPM", rows: [["120 bpm / set 120", "BPM = 120"], ["faster / speed up", "+5"], ["much faster", "+10"], ["slower / slow down", "-5"], ["much slower", "-10"], ["double", "× 2"], ["half", "÷ 2"]] },
        { cat: "Time", rows: [["3 beats / 4 beats / 6 beats", "Beats per measure"]] },
        { cat: "Misc", rows: [["reset", "120 BPM, 4 beats"], ["help / commands", "Show this list"]] },
      ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[s.overlay, { backgroundColor: "rgba(0,0,0,0.6)" }]} onPress={onClose}>
        <Pressable
          style={[s.sheet, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={s.header}>
            <Text style={[s.title, { color: C.text }]}>{t("voice", "commandsTitle")}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={C.text} />
            </Pressable>
          </View>
          {!!prefix && (
            <View style={[s.hintBox, { backgroundColor: C.surfaceLight, borderColor: C.border }]}>
              <Text style={[s.hintText, { color: C.textSecondary }]}>
                {t("voice", "prefixHint")}:{" "}
                <Text style={{ color: C.accent, fontFamily: "SpaceGrotesk_600SemiBold" }}>"{prefix}…"</Text>
              </Text>
            </View>
          )}
          <ScrollView style={{ maxHeight: 420, marginTop: Spacing.xs }}>
            {items.map(({ cat, rows }) => (
              <View key={cat} style={{ marginTop: 12 }}>
                <Text style={[s.cat, { color: C.textSecondary }]}>{cat}</Text>
                {rows.map(([cmd, desc]) => (
                  <View key={cmd} style={[s.row, { borderColor: C.overlay10 }]}>
                    <Text style={[s.cmd, { color: C.text }]}>{prefix}{cmd}</Text>
                    <Text style={[s.desc, { color: C.textSecondary }]}>{desc}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 460, borderRadius: 16, borderWidth: 1, padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 18, fontFamily: "SpaceGrotesk_700Bold" },
  hintBox: { marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1 },
  hintText: { fontSize: FontSize.small, fontFamily: "Inter_500Medium" },
  cat: { fontSize: FontSize.caption, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: Spacing.xs },
  row: { paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  cmd: { fontSize: 14, fontFamily: "SpaceGrotesk_600SemiBold" },
  desc: { fontSize: FontSize.small, fontFamily: "Inter_400Regular", marginTop: Spacing.xxs },
});

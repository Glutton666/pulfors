import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { RhythmWorkspace } from "./RhythmWorkspace";
import { StaffNotebookWorkspace } from "./StaffNotebookWorkspace";
import { Alert } from "@/lib/alert";
import type { RhythmDocument } from "@/lib/rhythm-lab/types";

export type LabScoreTab = "rhythm" | "notebook";
type Props = { onClose: () => void; initialTab?: LabScoreTab; initialDocument?: RhythmDocument };

export function LabScoreWorkspace({ onClose, initialTab = "rhythm", initialDocument }: Props) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const ko = language === "ko";
  const [tab, setTab] = useState<LabScoreTab>(initialTab);
  const [help, setHelp] = useState(false);
  const labels = ko
    ? { title: "리듬 랩", rhythm: "리듬 기록", notebook: "오선 노트", close: "닫기", explain: "두 가지 기록 방식", help: "리듬 기록은 연주를 보존하고 기보를 직접 다듬습니다. 오선 노트는 흰 종이와 검은 펜만 제공합니다. 드로잉은 해석하거나 재생하지 않습니다.", understood: "확인" }
    : { title: "RHYTHM LAB", rhythm: "Capture", notebook: "Staff notebook", close: "Close", explain: "Two ways to keep a rhythm", help: "Capture preserves your performance while you refine its notation. Staff notebook is simply white paper and black ink; drawings are never interpreted or played back.", understood: "Got it" };
  return (
    <View style={[s.root, { backgroundColor: C.background }]}>
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <Pressable onPress={() => Alert.alert(labels.close,
          ko ? "저장하지 않은 내용은 사라집니다. 나가기 전에 각 탭의 저장 버튼으로 보관해 주세요." : "Unsaved work will be lost. Use Save in each tab before leaving.",
          [{ text: ko ? "계속 작업" : "Keep editing", style: "cancel" }, { text: labels.close, style: "destructive", onPress: onClose }])}
          accessibilityRole="button" accessibilityLabel={labels.close} style={s.iconButton}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.eyebrow, { color: C.accent }]}>{labels.title}</Text>
          <Text style={[s.heading, { color: C.text }]}>{tab === "rhythm" ? labels.rhythm : labels.notebook}</Text>
        </View>
        <Pressable onPress={() => setHelp(true)} style={s.iconButton} accessibilityRole="button" accessibilityLabel={labels.explain}>
          <Ionicons name="information-circle-outline" size={22} color={C.textSecondary} />
        </Pressable>
      </View>
      <View style={[s.switcher, { backgroundColor: C.surface }]}>
        {(["rhythm", "notebook"] as const).map((item) => (
          <Pressable key={item} testID={`lab-score-tab-${item}`} onPress={() => setTab(item)}
            style={[s.tab, tab === item && { backgroundColor: C.accent }]}>
            <Text style={{ color: tab === item ? C.background : C.textSecondary, fontFamily: "SpaceGrotesk_700Bold", fontSize: 13 }}>
              {item === "rhythm" ? labels.rhythm : labels.notebook}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flex: 1, display: tab === "rhythm" ? "flex" : "none" }}><RhythmWorkspace active={tab === "rhythm"} initialDocument={initialDocument} /></View>
      <View style={{ flex: 1, display: tab === "notebook" ? "flex" : "none" }}><StaffNotebookWorkspace active={tab === "notebook"} /></View>
      <Modal transparent visible={help} animationType="fade" onRequestClose={() => setHelp(false)}>
        <View style={s.modalBackdrop}>
          <ScrollView style={[s.helpCard, { backgroundColor: C.surface, borderColor: C.border, maxHeight: "82%" }]} contentContainerStyle={{ flexGrow: 1 }}>
            <Text style={[s.heading, { color: C.text }]}>{labels.explain}</Text>
            <Text style={{ color: C.textSecondary, lineHeight: 22, marginTop: 12 }}>{labels.help}</Text>
            <Pressable onPress={() => setHelp(false)} style={[s.action, { backgroundColor: C.accent }]}>
              <Text style={{ color: C.background, fontFamily: "SpaceGrotesk_700Bold" }}>{labels.understood}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, minHeight: "100%" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  eyebrow: { fontFamily: "SpaceGrotesk_700Bold", letterSpacing: 2, fontSize: 10 },
  heading: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 19 },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  switcher: { flexDirection: "row", padding: 4, borderRadius: 14, marginHorizontal: 16, marginTop: 12, marginBottom: 8 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 11 },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.55)" },
  helpCard: { borderRadius: 18, borderWidth: 1, padding: 22 },
  action: { alignItems: "center", padding: 13, borderRadius: 11, marginTop: 20 },
});

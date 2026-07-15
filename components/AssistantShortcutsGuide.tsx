import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Radius, FontSize, Spacing } from "@/constants/tokens";

const SCHEME = "pulfors";

interface Command {
  url: string;
  label: string;
  desc: string;
}

const COMMANDS_KO: Command[] = [
  { url: `${SCHEME}://play`,         label: "재생",         desc: "메트로놈 시작" },
  { url: `${SCHEME}://stop`,         label: "정지",         desc: "메트로놈 정지" },
  { url: `${SCHEME}://toggle`,       label: "토글",         desc: "재생 / 정지 전환" },
  { url: `${SCHEME}://bpm?value=120`, label: "BPM 설정",   desc: "BPM을 120으로 설정 (값 변경 가능)" },
  { url: `${SCHEME}://bpm?delta=+10`, label: "BPM 증가",   desc: "BPM +10 (값 변경 가능)" },
  { url: `${SCHEME}://bpm?delta=-10`, label: "BPM 감소",   desc: "BPM -10 (값 변경 가능)" },
  { url: `${SCHEME}://beats?value=4`, label: "박자 설정",  desc: "박자를 4로 설정 (값 변경 가능)" },
  { url: `${SCHEME}://reset`,        label: "초기화",       desc: "BPM 120, 박자 4 초기화" },
];

const COMMANDS_EN: Command[] = [
  { url: `${SCHEME}://play`,         label: "Play",        desc: "Start metronome" },
  { url: `${SCHEME}://stop`,         label: "Stop",        desc: "Stop metronome" },
  { url: `${SCHEME}://toggle`,       label: "Toggle",      desc: "Play / stop toggle" },
  { url: `${SCHEME}://bpm?value=120`, label: "Set BPM",   desc: "Set BPM to 120 (change value)" },
  { url: `${SCHEME}://bpm?delta=+10`, label: "BPM up",    desc: "BPM +10 (change value)" },
  { url: `${SCHEME}://bpm?delta=-10`, label: "BPM down",  desc: "BPM -10 (change value)" },
  { url: `${SCHEME}://beats?value=4`, label: "Set beats", desc: "Set beats to 4 (change value)" },
  { url: `${SCHEME}://reset`,        label: "Reset",       desc: "Reset to 120 BPM, 4 beats" },
];

const IOS_STEPS_KO = [
  "iPhone에서 단축어 앱을 엽니다.",
  "오른쪽 상단 + 버튼을 눌러 새 단축어를 만듭니다.",
  "\"URL 열기\" 동작을 추가하고 아래 URL을 붙여넣습니다.",
  "단축어 이름(예: '메트로놈 재생')을 설정합니다.",
  "Siri에 추가 버튼을 눌러 음성 명령어를 등록합니다.",
  "이제 \"Siri야, 메트로놈 재생\"이라고 말하면 됩니다.",
];

const IOS_STEPS_EN = [
  "Open the Shortcuts app on your iPhone.",
  "Tap + to create a new shortcut.",
  "Add an \"Open URLs\" action and paste a URL below.",
  "Name the shortcut (e.g. \"Metronome Play\").",
  "Tap \"Add to Siri\" and record your phrase.",
  "Say \"Hey Siri, Metronome Play\" to trigger it.",
];

const ANDROID_STEPS_KO = [
  "Google 어시스턴트 앱 또는 어시스턴트 설정을 엽니다.",
  "루틴(Routines) 메뉴로 이동합니다.",
  "새 루틴을 만들고 음성 트리거(예: '메트로놈 재생')를 설정합니다.",
  "동작 추가에서 '앱 열기' 또는 'URL 열기'를 선택합니다.",
  "아래 URL을 입력하고 저장합니다.",
  "이제 'OK Google, 메트로놈 재생'이라고 말하면 됩니다.",
];

const ANDROID_STEPS_EN = [
  "Open Google Assistant or the Assistant settings.",
  "Go to Routines.",
  "Create a new routine with a voice trigger (e.g. \"Metronome Play\").",
  "Add an action: \"Open app\" or \"Open URL\".",
  "Paste a URL from below and save.",
  "Say \"OK Google, Metronome Play\" to trigger it.",
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AssistantShortcutsGuide({ visible, onClose }: Props) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const [tab, setTab] = useState<"ios" | "android">("ios");

  const isKo = language === "ko";
  const commands = isKo ? COMMANDS_KO : COMMANDS_EN;
  const iosSteps = isKo ? IOS_STEPS_KO : IOS_STEPS_EN;
  const androidSteps = isKo ? ANDROID_STEPS_KO : ANDROID_STEPS_EN;
  const steps = tab === "ios" ? iosSteps : androidSteps;

  const title = isKo ? "어시스턴트 단축어 설정" : "Assistant Shortcuts Setup";
  const iosLabel = "iOS / Siri";
  const androidLabel = "Android / Google";
  const urlSectionTitle = isKo ? "사용 가능한 URL 명령" : "Available URL Commands";
  const copyHint = isKo ? "URL 복사" : "Copy URL";
  const copiedMsg = isKo ? "복사됨" : "Copied";

  async function copyUrl(url: string) {
    try {
      await Clipboard.setStringAsync(url);
      Alert.alert(copiedMsg, url);
    } catch {}
  }

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={onClose}>
      <Pressable style={[s.overlay, { backgroundColor: "rgba(0,0,0,0.6)" }]} onPress={onClose}>
        <Pressable
          style={[s.sheet, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={s.header}>
            <Ionicons name="link-outline" size={20} color={C.accent} />
            <Text style={[s.title, { color: C.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={C.text} />
            </Pressable>
          </View>

          <View style={[s.tabs, { borderColor: C.border }]}>
            {(["ios", "android"] as const).map((t) => (
              <Pressable
                key={t}
                style={[
                  s.tabBtn,
                  tab === t && { backgroundColor: C.accent },
                  { borderColor: C.border },
                ]}
                onPress={() => setTab(t)}
              >
                <Ionicons
                  name={t === "ios" ? "logo-apple" : "logo-android"}
                  size={14}
                  color={tab === t ? C.background : C.textSecondary}
                />
                <Text style={[s.tabLabel, { color: tab === t ? C.background : C.textSecondary }]}>
                  {t === "ios" ? iosLabel : androidLabel}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
            <View style={s.steps}>
              {steps.map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <View style={[s.stepNum, { backgroundColor: C.accent }]}>
                    <Text style={[s.stepNumText, { color: C.background }]}>{i + 1}</Text>
                  </View>
                  <Text style={[s.stepText, { color: C.text }]}>{step}</Text>
                </View>
              ))}
            </View>

            <View style={[s.divider, { backgroundColor: C.border }]} />

            <Text style={[s.sectionTitle, { color: C.textSecondary }]}>{urlSectionTitle}</Text>

            {commands.map((cmd) => (
              <Pressable
                key={cmd.url}
                style={[s.cmdRow, { borderColor: C.overlay10, backgroundColor: C.surfaceLight }]}
                onPress={() => copyUrl(cmd.url)}
                accessibilityLabel={`${copyHint}: ${cmd.url}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.cmdLabel, { color: C.text }]}>{cmd.label}</Text>
                  <Text style={[s.cmdUrl, { color: C.accent }]} numberOfLines={1}>{cmd.url}</Text>
                  <Text style={[s.cmdDesc, { color: C.textSecondary }]}>{cmd.desc}</Text>
                </View>
                <Ionicons name="copy-outline" size={16} color={C.textSecondary} style={{ marginLeft: Spacing.sm }} />
              </Pressable>
            ))}

            <View style={{ height: Spacing.lg }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </AnimatedModal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: {
    width: "100%",
    maxWidth: 480,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 16,
  },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 14 },
  title: { flex: 1, fontSize: 17, fontFamily: "SpaceGrotesk_700Bold" },
  tabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: "hidden",
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRightWidth: 1,
  },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  steps: { gap: 10, marginBottom: 16 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumText: { fontSize: FontSize.caption, fontFamily: "Inter_700Bold" },
  stepText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  divider: { height: 1, marginVertical: 14 },
  sectionTitle: {
    fontSize: FontSize.caption,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  cmdRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  cmdLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: Spacing.xxs },
  cmdUrl: { fontSize: FontSize.small, fontFamily: "Inter_400Regular", marginBottom: Spacing.xxs },
  cmdDesc: { fontSize: FontSize.caption, fontFamily: "Inter_400Regular" },
});

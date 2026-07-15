import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Radius, FontSize, Spacing } from "@/constants/tokens";
import { KeyBindingsMap, buildLabel } from "@/lib/keyboard-bindings";
import type { KeyAction } from "@/lib/keyboard-bindings";
import type { KbSectionKey } from "@/lib/i18n";

interface ShortcutRow {
  action: KeyAction;
  labelKey: KbSectionKey;
}

const SECTIONS: { titleKey: KbSectionKey; rows: ShortcutRow[] }[] = [
  {
    titleKey: "sectionGeneral",
    rows: [
      { action: "playPause",        labelKey: "actionPlayPause" },
      { action: "tapTempo",         labelKey: "actionTapTempo" },
      { action: "bpmUp",            labelKey: "actionBpmUp" },
      { action: "bpmDown",          labelKey: "actionBpmDown" },
      { action: "bpmRight",         labelKey: "actionBpmRight" },
      { action: "bpmLeft",          labelKey: "actionBpmLeft" },
      { action: "toggleMenu",       labelKey: "actionToggleMenu" },
      { action: "toggleStopwatch",  labelKey: "actionToggleStopwatch" },
      { action: "toggleTimer",      labelKey: "actionToggleTimer" },
      { action: "openPracticeBook", labelKey: "actionOpenBook" },
      { action: "showShortcuts",    labelKey: "actionShowShortcuts" },
      { action: "escape",           labelKey: "actionEscape" },
    ],
  },
  {
    titleKey: "sectionBeat",
    rows: [
      { action: "addBeatNormal",  labelKey: "actionAddNormal" },
      { action: "addBeatAccent",  labelKey: "actionAddAccent" },
      { action: "addBeatStrong",  labelKey: "actionAddStrong" },
      { action: "addBeatMute",    labelKey: "actionAddMute" },
      { action: "removeBeat",     labelKey: "actionRemoveBeat" },
      { action: "cycleBeatTypes", labelKey: "actionCycleBeat" },
    ],
  },
  {
    titleKey: "sectionSub",
    rows: [
      { action: "addSubNormal", labelKey: "actionAddSubNormal" },
      { action: "addSubAccent", labelKey: "actionAddSubAccent" },
      { action: "addSubStrong", labelKey: "actionAddSubStrong" },
      { action: "addSubMute",   labelKey: "actionAddSubMute" },
      { action: "removeSub",    labelKey: "actionRemoveSub" },
    ],
  },
  {
    titleKey: "sectionBar",
    rows: [
      { action: "loopToggle",        labelKey: "actionLoopToggle" },
      { action: "blockPlayModeNext", labelKey: "actionBlockPlayNext" },
    ],
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  bindings: KeyBindingsMap;
}

export function KeyboardShortcutsModal({ visible, onClose, bindings }: Props) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();

  if (Platform.OS !== "web") return null;

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={onClose}>
      <Pressable style={[s.overlay, { backgroundColor: "rgba(0,0,0,0.65)" }]} onPress={onClose}>
        <Pressable
          style={[s.sheet, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={s.header}>
            <Ionicons name="keypad-outline" size={20} color={C.accent} />
            <Text style={[s.title, { color: C.text }]}>{t("keyboard", "title")}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={C.text} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
            {SECTIONS.map((section) => (
              <View key={section.titleKey} style={s.section}>
                <Text style={[s.sectionTitle, { color: C.textSecondary }]}>
                  {t("keyboard", section.titleKey)}
                </Text>
                {section.rows.map((row) => {
                  const binding = bindings[row.action];
                  return (
                    <View key={row.action} style={[s.row, { borderBottomColor: C.border }]}>
                      <Text style={[s.actionLabel, { color: C.text }]}>
                        {t("keyboard", row.labelKey)}
                      </Text>
                      <View style={[s.keyBadge, { backgroundColor: C.surfaceLight, borderColor: C.border }]}>
                        <Text style={[s.keyText, { color: C.accent }]}>
                          {buildLabel(binding)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
            <View style={{ height: Spacing.lg }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </AnimatedModal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 460,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 16,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: FontSize.caption,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  keyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    minWidth: 48,
    alignItems: "center",
  },
  keyText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});

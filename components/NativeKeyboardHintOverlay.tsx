import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Radius, FontSize, Spacing } from "@/constants/tokens";
import { buildLabel, KeyBindingsMap } from "@/lib/keyboard-bindings";
import type { KeyAction } from "@/lib/keyboard-bindings";
import type { KbSectionKey } from "@/lib/i18n";

interface HintRow {
  action: KeyAction;
  labelKey: KbSectionKey;
}

const HINT_ROWS: HintRow[] = [
  { action: "playPause",   labelKey: "actionPlayPause" },
  { action: "tapTempo",    labelKey: "actionTapTempo" },
  { action: "bpmUp",       labelKey: "actionBpmUp" },
  { action: "bpmDown",     labelKey: "actionBpmDown" },
  { action: "bpmRight",    labelKey: "actionBpmRight" },
  { action: "bpmLeft",     labelKey: "actionBpmLeft" },
  { action: "toggleMenu",  labelKey: "actionToggleMenu" },
  { action: "openPracticeBook", labelKey: "actionOpenBook" },
  { action: "escape",      labelKey: "actionEscape" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  bindings: KeyBindingsMap;
}

export function NativeKeyboardHintOverlay({ visible, onClose, bindings }: Props) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();

  if (!visible) return null;

  return (
    <Pressable
      style={[s.backdrop]}
      onPress={onClose}
      pointerEvents="box-only"
    >
      <Pressable
        style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={s.header}>
          <Ionicons name="keypad-outline" size={18} color={C.accent} />
          <Text style={[s.title, { color: C.text }]}>
            {t("keyboard", "title")}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={18} color={C.text} />
          </Pressable>
        </View>

        {HINT_ROWS.map((row) => {
          const binding = bindings[row.action];
          return (
            <View
              key={row.action}
              style={[s.row, { borderBottomColor: C.border }]}
            >
              <Text style={[s.actionLabel, { color: C.text }]}>
                {t("keyboard", row.labelKey)}
              </Text>
              <View
                style={[
                  s.keyBadge,
                  { backgroundColor: C.surfaceLight, borderColor: C.border },
                ]}
              >
                <Text style={[s.keyText, { color: C.accent }]}>
                  {buildLabel(binding)}
                </Text>
              </View>
            </View>
          );
        })}
      </Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 9000,
  },
  card: {
    width: 300,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  keyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
    minWidth: 44,
    alignItems: "center",
  },
  keyText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});

import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { PracticeEntry, StageSettings } from "@/lib/storage";

interface Props {
  settings: StageSettings;
  practiceBook: PracticeEntry[];
  onChange: (patch: Partial<StageSettings>) => void;
}

export function SettingsStageSection({ settings, practiceBook, onChange }: Props) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const [keyPickerTarget, setKeyPickerTarget] = useState<string | null>(null);

  const segment = <T extends string | number>(
    values: readonly T[],
    selected: T,
    label: (value: T) => string,
    onSelect: (value: T) => void,
  ) => (
    <View style={styles.segments}>
      {values.map((value) => (
        <Pressable
          key={String(value)}
          onPress={() => onSelect(value)}
          style={[
            styles.segment,
            { borderColor: selected === value ? C.accent : C.border, backgroundColor: selected === value ? C.accentDim : C.surface },
          ]}
        >
          <Text style={{ color: selected === value ? C.accent : C.textSecondary, fontWeight: "700" }}>{label(value)}</Text>
        </Pressable>
      ))}
    </View>
  );

  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <View style={[styles.row, { borderColor: C.border, backgroundColor: C.surface }]}>
      <View style={styles.labelColumn}>
        <Text style={[styles.label, { color: C.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: C.textTertiary }]}>{hint}</Text> : null}
      </View>
      {control}
    </View>
  );

  return (
    <View testID="stage-settings-section">
      <Text style={[styles.title, { color: C.text }]}>{t("stageMode", "stageOnlySettings")}</Text>
      {row(
        t("stageMode", "theme"),
        segment(["dark", "light"] as const, settings.theme, (v) => t("stageMode", v === "dark" ? "themeDark" : "themeLight"), (theme) => onChange({ theme })),
      )}
      {row(t("stageMode", "keepAwake"), <Switch value={settings.keepAwake} onValueChange={(keepAwake) => onChange({ keepAwake })} />)}
      {row(t("stageMode", "autoAdvance"), <Switch value={settings.autoAdvance} onValueChange={(autoAdvance) => onChange({ autoAdvance })} />, t("stageMode", "autoAdvanceHint"))}
      {row(
        t("stageMode", "countdown"),
        segment([0, 1, 2, 4] as const, settings.countdown, (v) => v === 0 ? t("stageMode", "countdown0") : String(v), (countdown) => onChange({ countdown })),
      )}
      {row(
        t("stageMode", "scoreHighlight"),
        segment(
          ["top", "center", "bottom"] as const,
          settings.scoreHighlight,
          (v) => t("stageMode", v === "top" ? "scoreHighlightTop" : v === "center" ? "scoreHighlightCenter" : "scoreHighlightBottom"),
          (scoreHighlight) => onChange({ scoreHighlight }),
        ),
      )}

      <Text style={[styles.title, { color: C.text }]}>{t("stageMode", "keyShortcuts")}</Text>
      <Text style={[styles.hint, { color: C.textTertiary }]}>{t("stageMode", "keyShortcutsHint")}</Text>
      {["1","2","3","4","5","6","7","8","9","0"].map((key) => {
        const mappedId = settings.keyMappings[key];
        const mapped = practiceBook.find((entry) => entry.id === mappedId);
        return (
          <View key={key} style={[styles.keyRow, { borderColor: C.border }]}>
            <Text style={[styles.key, { color: C.text }]}>{key}</Text>
            <Pressable style={styles.keyTarget} onPress={() => setKeyPickerTarget(key)}>
              <Text numberOfLines={1} style={{ color: mapped ? C.text : C.textTertiary }}>{mapped?.label ?? t("stageMode", "keyNone")}</Text>
            </Pressable>
            {mapped ? (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  const keyMappings = { ...settings.keyMappings };
                  delete keyMappings[key];
                  onChange({ keyMappings });
                }}
              >
                <Ionicons name="close-circle" size={20} color={C.textTertiary} />
              </Pressable>
            ) : null}
          </View>
        );
      })}

      <Modal visible={keyPickerTarget !== null} transparent animationType="slide" onRequestClose={() => setKeyPickerTarget(null)}>
        <Pressable style={styles.overlay} onPress={() => setKeyPickerTarget(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: C.surface, borderColor: C.border }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: C.text }]}>{t("stageMode", "keyPickerTitle")} [{keyPickerTarget}]</Text>
              <Pressable onPress={() => setKeyPickerTarget(null)}><Ionicons name="close" size={24} color={C.textSecondary} /></Pressable>
            </View>
            <ScrollView>
              {practiceBook.map((entry) => (
                <Pressable
                  key={entry.id}
                  style={[styles.pickerItem, { borderColor: C.border }]}
                  onPress={() => {
                    if (keyPickerTarget) onChange({ keyMappings: { ...settings.keyMappings, [keyPickerTarget]: entry.id } });
                    setKeyPickerTarget(null);
                  }}
                >
                  <Text style={{ color: C.text }}>{entry.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "800", marginBottom: 10, marginTop: 6 },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  labelColumn: { flex: 1 },
  label: { fontSize: 14, fontWeight: "700" },
  hint: { fontSize: 12, marginTop: 3, marginBottom: 8 },
  segments: { flexDirection: "row", gap: 6 },
  segment: { minWidth: 44, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  keyRow: { minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10 },
  key: { width: 24, fontSize: 16, fontWeight: "800", textAlign: "center" },
  keyTarget: { flex: 1, paddingVertical: 10 },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { maxHeight: "72%", borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  pickerTitle: { fontSize: 17, fontWeight: "800" },
  pickerItem: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
});
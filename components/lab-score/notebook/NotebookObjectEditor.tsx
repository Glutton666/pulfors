import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StaffStamp, StaffTuplet } from "@/lib/staff-notebook";
import { standardTupletRatio } from "@/lib/notebook-music-layout";

type Props = {
  ko: boolean;
  stamps: StaffStamp[];
  group?: StaffTuplet;
  onChange: (id: string, patch: Partial<StaffStamp>) => void;
  onRatio: (actual: number, normal: number) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

const durations = ["whole", "half", "quarter", "eighth", "sixteenth", "thirty_second"] as const;
const durationLabels = {
  en: ["Whole", "Half", "Quarter", "Eighth", "Sixteenth", "Thirty-second"],
  ko: ["온음표", "2분음표", "4분음표", "8분음표", "16분음표", "32분음표"],
};
const normalForCount = (count: number) => standardTupletRatio(count).normal;

export function NotebookObjectEditor({ ko, stamps, group, onChange, onRatio, onDelete, onClose }: Props) {
  const members = useMemo(() => group ? group.stampIds.map((id) => stamps.find((stamp) => stamp.id === id)).filter((stamp): stamp is StaffStamp => !!stamp) : stamps, [group, stamps]);
  const [currentId, setCurrentId] = useState(members[0]?.id ?? "");
  const selected = members.find((stamp) => stamp.id === currentId) ?? members[0];
  const ratioActual = group?.ratio?.actual ?? members.length;
  const ratioNormal = group?.ratio?.normal ?? normalForCount(members.length);
  const [actualDraft, setActualDraft] = useState(String(ratioActual));
  const [normalDraft, setNormalDraft] = useState(String(ratioNormal));
  const actualValid = /^\d+$/.test(actualDraft) && Number(actualDraft) >= 1 && Number(actualDraft) <= 128;
  const normalValid = /^\d+$/.test(normalDraft) && Number(normalDraft) >= 1 && Number(normalDraft) <= 128;

  useEffect(() => {
    if (!members.some((stamp) => stamp.id === currentId)) setCurrentId(members[0]?.id ?? "");
  }, [members, currentId]);
  useEffect(() => {
    setActualDraft(String(ratioActual));
    setNormalDraft(String(ratioNormal));
  }, [ratioActual, ratioNormal, group?.id]);

  const applyRatio = () => {
    if (actualValid && normalValid) onRatio(Number(actualDraft), Number(normalDraft));
  };
  const setDuration = (duration: typeof durations[number]) => {
    if (!selected) return;
    const rest = selected.glyph.startsWith("rest-");
    onChange(selected.id, { glyph: `${rest ? "rest-" : ""}${duration}` });
  };

  return (
    <View testID="notebook-object-editor" style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>{ko ? "선택 항목" : "SELECTION"}</Text>
          <Text style={styles.title}>{group ? (ko ? "잇단음표 편집" : "Edit tuplet") : (ko ? "음표 편집" : "Edit note")}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={ko ? "편집기 닫기" : "Close editor"} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={17} color="#6f604b" />
        </Pressable>
      </View>

      {group ? (
        <View style={styles.ratioCard}>
          <Text style={styles.label}>{ko ? "잇단음표 비율" : "Tuplet ratio"}</Text>
          <View style={styles.ratioRow}>
            <TextInput testID="notebook-ratio-actual" accessibilityLabel={ko ? "실제 음표 수" : "Actual note count"} value={actualDraft} onChangeText={setActualDraft} keyboardType="number-pad" returnKeyType="done" style={[styles.ratioInput, !actualValid && styles.invalid]} />
            <Text style={styles.ratioColon}>:</Text>
            <TextInput testID="notebook-ratio-normal" accessibilityLabel={ko ? "기준 음표 수" : "Normal note count"} value={normalDraft} onChangeText={setNormalDraft} keyboardType="number-pad" returnKeyType="done" style={[styles.ratioInput, !normalValid && styles.invalid]} />
            <Pressable testID="notebook-ratio-apply" accessibilityRole="button" accessibilityLabel={ko ? "비율 적용" : "Apply ratio"} disabled={!actualValid || !normalValid} onPress={applyRatio} style={[styles.applyButton, (!actualValid || !normalValid) && styles.disabled]}>
              <Text style={styles.applyText}>{ko ? "적용" : "Apply"}</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>{ko ? `자동 비율은 ${members.length}:${normalForCount(members.length)}입니다.` : `Default ratio: ${members.length}:${normalForCount(members.length)}.`}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>{ko ? "그룹 구성원" : "Group members"}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberList}>
        {members.map((stamp, index) => (
          <Pressable key={stamp.id} testID={`notebook-edit-member-${stamp.id}`} accessibilityRole="button" accessibilityLabel={`${ko ? "구성원" : "Member"} ${index + 1}`} accessibilityState={{ selected: selected?.id === stamp.id }} onPress={() => setCurrentId(stamp.id)} style={[styles.memberChip, selected?.id === stamp.id && styles.memberSelected]}>
            <Text style={[styles.memberNumber, selected?.id === stamp.id && styles.memberNumberSelected]}>{index + 1}</Text>
            <Text numberOfLines={1} style={[styles.memberName, selected?.id === stamp.id && styles.memberNameSelected]}>{stamp.glyph.replace("rest-", "").replace("_", " ")}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {selected ? (
        <>
          <Text style={styles.label}>{ko ? "음가" : "Duration"}</Text>
          <View style={styles.durationGrid}>
            {durations.map((duration, index) => {
              const selectedDuration = selected.glyph.replace(/^rest-/, "") === duration;
              return (
                <Pressable key={duration} testID={`notebook-edit-duration-${duration}`} accessibilityRole="button" accessibilityLabel={durationLabels[ko ? "ko" : "en"][index]} accessibilityState={{ selected: selectedDuration }} onPress={() => setDuration(duration)} style={[styles.durationButton, selectedDuration && styles.durationSelected]}>
                  <Text style={[styles.durationText, selectedDuration && styles.durationTextSelected]}>{durationLabels[ko ? "ko" : "en"][index]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: selected.dotted ?? false }} onPress={() => onChange(selected.id, { dotted: !(selected.dotted ?? false) })} style={styles.dotRow}>
            <View style={[styles.checkbox, selected.dotted && styles.checkboxChecked]}>{selected.dotted ? <Ionicons name="checkmark" size={12} color="#fffaf2" /> : null}</View>
            <Text style={styles.dotLabel}>{ko ? "점음표" : "Dotted"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onDelete(selected.id)} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={15} color="#9a5547" />
            <Text style={styles.deleteText}>{ko ? "구성원 삭제" : "Delete member"}</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.empty}>{ko ? "편집할 구성원이 없습니다." : "No editable members."}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e5ddcf", borderRadius: 13, padding: 12, gap: 9 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { flex: 1 },
  eyebrow: { color: "#947d5d", fontSize: 9, letterSpacing: 1.15, fontWeight: "800" },
  title: { color: "#302b25", fontSize: 14, fontWeight: "700", marginTop: 2 },
  close: { width: 32, height: 32, borderRadius: 9, backgroundColor: "#f3efe7", alignItems: "center", justifyContent: "center" },
  ratioCard: { padding: 9, borderRadius: 9, backgroundColor: "#f5f1e9", gap: 6 },
  label: { color: "#5a5042", fontSize: 10, fontWeight: "700" },
  ratioRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  ratioInput: { width: 50, height: 34, borderWidth: 1, borderColor: "#ddd3c4", borderRadius: 7, backgroundColor: "#fffdf8", color: "#4d4333", textAlign: "center", padding: 0, fontSize: 12, fontWeight: "700" },
  invalid: { borderColor: "#b86450" },
  ratioColon: { color: "#7a6b55", fontWeight: "700" },
  applyButton: { minHeight: 34, paddingHorizontal: 12, justifyContent: "center", borderRadius: 7, backgroundColor: "#765d3e", marginLeft: "auto" },
  applyText: { color: "#fffaf2", fontSize: 10, fontWeight: "700" },
  disabled: { opacity: 0.42 },
  hint: { color: "#897e6d", fontSize: 9, lineHeight: 13 },
  memberList: { gap: 6, paddingVertical: 2 },
  memberChip: { maxWidth: 106, minHeight: 34, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, borderColor: "#e4ddd2", backgroundColor: "#faf7f0", flexDirection: "row", alignItems: "center", gap: 6 },
  memberSelected: { borderColor: "#9b8058", backgroundColor: "#eee5d7" },
  memberNumber: { color: "#8d806d", fontSize: 10, fontWeight: "800" },
  memberNumberSelected: { color: "#614b2e" },
  memberName: { color: "#706557", fontSize: 9, textTransform: "capitalize" },
  memberNameSelected: { color: "#4d3e2a", fontWeight: "700" },
  durationGrid: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  durationButton: { minWidth: 72, minHeight: 32, paddingHorizontal: 7, justifyContent: "center", alignItems: "center", borderRadius: 7, borderWidth: 1, borderColor: "#e4ddd2", backgroundColor: "#faf8f3" },
  durationSelected: { borderColor: "#987d56", backgroundColor: "#eee5d7" },
  durationText: { color: "#766b5c", fontSize: 9, fontWeight: "600" },
  durationTextSelected: { color: "#55432c", fontWeight: "800" },
  dotRow: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: { width: 17, height: 17, borderRadius: 5, borderWidth: 1, borderColor: "#cfc4b3", alignItems: "center", justifyContent: "center", backgroundColor: "#fffdf8" },
  checkboxChecked: { backgroundColor: "#806747", borderColor: "#806747" },
  dotLabel: { color: "#51483c", fontSize: 10, fontWeight: "600" },
  deleteButton: { minHeight: 35, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, backgroundColor: "#faf0ec" },
  deleteText: { color: "#965344", fontSize: 10, fontWeight: "700" },
  empty: { color: "#8b8173", fontSize: 10, paddingVertical: 8 },
});

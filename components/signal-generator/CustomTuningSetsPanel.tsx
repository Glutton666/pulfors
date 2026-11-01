import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useScale } from "@/lib/scale";
import { FontSize, Radius, Spacing } from "@/constants/tokens";
import { TUNING_DATA } from "@/lib/tuning-data";
import { NOTE_NAMES, frequencyToNote, noteToFreq } from "@/lib/signal-analysis";
import { VerticalPitchPicker } from "./TunerPanel";
import type { CustomTuningSet, CustomTuningGroup, CustomTuningTarget } from "@/lib/custom-tuning-sets";
import {
  loadCustomTuningSets,
  saveCustomTuningSets, updateCustomTuningTarget, makeTuningId,
  validateTuningFrequency,
} from "@/lib/custom-tuning-sets";

type Props = {
  visible: boolean;
  lang: "ko" | "en";
  onSelectFreq: (frequency: number) => void;
  onRequestCapture: (label: string, onCaptured: (frequency: number) => Promise<void>) => void;
};
const copy = {
  en: { title: "My tuning sets", addSet: "New set", setName: "Set name", group: "Instrument / group", addGroup: "Add group", target: "Part", addTarget: "Add part", rename: "Rename", delete: "Delete", save: "Save changes", saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes", loadError: "Could not load tuning sets.", saveError: "Could not save. Try again.", invalidFrequency: "Enter a frequency from 20 to 20000 Hz or a note such as C3.", confirm: "Delete this non-empty item?", confirmYes: "Delete anyway", cancel: "Cancel", copy: "Copy built-in instrument", choose: "Choose an instrument to copy", hz: "Hz", note: "Note", detect: "Detect", noFreq: "No target frequency", namePlaceholder: "Name", hzPlaceholder: "20–20000", copied: "Copied. Edit this set as needed.", empty: "Create a set for the instruments you tune most.", },
  ko: { title: "내 튜닝 세트", addSet: "새 세트", setName: "세트 이름", group: "악기 / 그룹", addGroup: "그룹 추가", target: "파트", addTarget: "파트 추가", rename: "이름 변경", delete: "삭제", save: "변경 저장", saved: "저장됨", saving: "저장 중…", unsaved: "저장되지 않은 변경", loadError: "튜닝 세트를 불러오지 못했습니다.", saveError: "저장하지 못했습니다. 다시 시도해 주세요.", invalidFrequency: "20~20000Hz 또는 C3 같은 음을 입력하세요.", confirm: "내용이 있는 항목을 삭제할까요?", confirmYes: "삭제 확인", cancel: "취소", copy: "기본 악기 복사", choose: "복사할 악기를 선택하세요", hz: "Hz", note: "음", detect: "감지", noFreq: "주파수 미설정", namePlaceholder: "이름", hzPlaceholder: "20–20000", copied: "복사했습니다. 세트를 편집할 수 있습니다.", empty: "자주 튜닝하는 악기로 세트를 만들어 보세요.", },
};

export function CustomTuningSetsPanel({ visible, lang, onSelectFreq, onRequestCapture }: Props) {
  const { colors: C } = useTheme();
  const S = useScale();
  const { width } = useWindowDimensions();
  const t = copy[lang];
  const styles = useMemo(() => makeStyles(C, S.ms(40)), [C, S]);
  const [sets, setSets] = useState<CustomTuningSet[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [editor, setEditor] = useState<{ id: string; mode: "hz" | "note" }>({ id: "", mode: "hz" });
  const [frequencyText, setFrequencyText] = useState("");
  const [selectedNote, setSelectedNote] = useState("A");
  const [selectedOctave, setSelectedOctave] = useState(4);
  const setsRef = useRef<CustomTuningSet[]>([]);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const persistedTargetIds = useRef<Set<string>>(new Set());

  const setDirtyFlag = (next: boolean) => { dirtyRef.current = next; setDirty(next); };
  const setDraft = (next: CustomTuningSet[]) => {
    setsRef.current = next;
    setSets(next);
    setDirtyFlag(true);
    setNotice("");
    setError("");
  };

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const loaded = await loadCustomTuningSets();
      setsRef.current = loaded;
      setSets(loaded);
      persistedTargetIds.current = new Set(loaded.flatMap(s => s.groups.flatMap(g => g.targets.map(target => target.id))));
      setDirtyFlag(false);
    }
    catch { setError(t.loadError); }
    finally { setLoading(false); }
  }, [t.loadError]);
  useEffect(() => { if (visible && !dirtyRef.current) void reload(); }, [visible, reload]);

  const change = (next: CustomTuningSet[]) => setDraft(next);
  const save = async () => {
    if (busyRef.current || loading) return;
    busyRef.current = true;
    setBusy(true); setError(""); setNotice("");
    const snapshot = setsRef.current;
    try {
      await saveCustomTuningSets(snapshot);
      persistedTargetIds.current = new Set(snapshot.flatMap(s => s.groups.flatMap(g => g.targets.map(target => target.id))));
      if (setsRef.current === snapshot) { setDirtyFlag(false); setNotice(t.saved); }
    }
    catch { setError(t.saveError); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const newSet = () => change([...sets, { id: makeTuningId(), name: "", groups: [] }]);
  const updateSet = (id: string, patch: Partial<CustomTuningSet>) => change(sets.map(s => s.id === id ? { ...s, ...patch } : s));
  const addGroup = (set: CustomTuningSet) => updateSet(set.id, { groups: [...set.groups, { id: makeTuningId(), name: "", targets: [] }] });
  const updateGroup = (set: CustomTuningSet, group: CustomTuningGroup, patch: Partial<CustomTuningGroup>) =>
    updateSet(set.id, { groups: set.groups.map(g => g.id === group.id ? { ...g, ...patch } : g) });
  const addTarget = (set: CustomTuningSet, group: CustomTuningGroup) =>
    updateGroup(set, group, { targets: [...group.targets, { id: makeTuningId(), name: "", frequency: null }] });
  const updateTarget = (set: CustomTuningSet, group: CustomTuningGroup, target: CustomTuningTarget, patch: Partial<CustomTuningTarget>) =>
    updateGroup(set, group, { targets: group.targets.map(x => x.id === target.id ? { ...x, ...patch } : x) });
  const confirmDelete = (key: string, count: number, remove: () => void) => {
    if (count && confirmId !== key) { setConfirmId(key); return; }
    remove(); setConfirmId(null);
  };

  const beginCapture = async (set: CustomTuningSet, group: CustomTuningGroup, target: CustomTuningTarget) => {
    if (busyRef.current) return;
    setError("");
    try {
      if (!persistedTargetIds.current.has(target.id)) {
        busyRef.current = true;
        setBusy(true);
        const snapshot = setsRef.current.map(s => ({
          ...s,
          groups: s.groups.map(g => ({
            ...g,
            targets: g.targets.map(item => item.id === target.id ? { ...item, frequency: null } : item),
          })),
        }));
        setsRef.current = snapshot;
        setSets(snapshot);
        setDirtyFlag(true);
        await saveCustomTuningSets(snapshot);
        persistedTargetIds.current = new Set(snapshot.flatMap(s => s.groups.flatMap(g => g.targets.map(item => item.id))));
        if (setsRef.current === snapshot) setDirtyFlag(false);
      }
      const label = [set.name, group.name, target.name].filter(Boolean).join(" · ");
      onRequestCapture(label, async frequency => {
        try {
          await updateCustomTuningTarget(set.id, group.id, target.id, frequency);
          const refreshed = await loadCustomTuningSets();
          persistedTargetIds.current = new Set(refreshed.flatMap(s => s.groups.flatMap(g => g.targets.map(item => item.id))));
          if (!dirtyRef.current) {
            setsRef.current = refreshed;
            setSets(refreshed);
            setDirtyFlag(false);
          } else {
            const refreshedTargets = new Map(refreshed.flatMap(s => s.groups.flatMap(g => g.targets.map(item => [item.id, item] as const))));
            const merged = setsRef.current.map(s => ({ ...s, groups: s.groups.map(g => ({ ...g, targets: g.targets.map(item => {
              const updated = refreshedTargets.get(item.id);
              return updated ? { ...item, frequency: updated.frequency } : item;
            }) })) }));
            setsRef.current = merged;
            setSets(merged);
          }
        } catch (cause) {
          setError(t.saveError);
          throw cause;
        }
      });
    } catch { setError(t.saveError); }
    finally {
      if (busyRef.current) { busyRef.current = false; setBusy(false); }
    }
  };
  const copyInstrument = (inst: (typeof TUNING_DATA)[number]["instruments"][number]) => {
    const group: CustomTuningGroup = { id: makeTuningId(), name: inst.name[lang], targets: inst.strings.map(s => ({ id: makeTuningId(), name: s.label[lang], frequency: s.freq })) };
    change([...sets, { id: makeTuningId(), name: inst.name[lang], groups: [group] }]);
    setCopyOpen(false); setNotice(t.copied);
  };
  const resolveTargetFrequency = (target: CustomTuningTarget) => {
    if (target.id !== editor.id) return;
    const value = editor.mode === "hz" ? validateTuningFrequency(frequencyText)
      : validateTuningFrequency(String(noteToFreq(selectedNote, selectedOctave)));
    if (value !== null) {
      change(setsRef.current.map(s => ({ ...s, groups: s.groups.map(g => ({ ...g, targets: g.targets.map(x => x.id === target.id ? { ...x, frequency: value } : x) })) })));
      setError(""); setEditor({ id: "", mode: "hz" });
    } else setError(lang === "ko" ? "20~20000Hz 범위의 주파수를 입력하거나 음을 선택하세요." : "Enter a frequency or choose a pitch between 20 and 20000 Hz.");
  };

  if (!visible) return null;
  const compact = width < 390;
  return (
    <View testID="custom-tuning-sets-panel" style={styles.panel}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}><Text style={styles.kicker}>PULFORS / TUNING</Text><Text style={styles.title}>{t.title}</Text></View>
        <Pressable testID="custom-tuning-add-set" accessibilityRole="button" accessibilityLabel={t.addSet} accessibilityState={{ disabled: loading }} disabled={loading} onPress={newSet} style={[styles.action, loading && styles.disabled]}><Text style={styles.actionText}>+ {t.addSet}</Text></Pressable>
      </View>
      <View style={styles.toolbar}>
        <Pressable testID="custom-tuning-copy-open" accessibilityRole="button" accessibilityState={{ disabled: loading }} disabled={loading} onPress={() => setCopyOpen(!copyOpen)} style={[styles.softButton, loading && styles.disabled]}><Text style={styles.softText}>{t.copy}</Text></Pressable>
        <Pressable testID="custom-tuning-save" accessibilityRole="button" accessibilityState={{ disabled: !dirty || busy || loading }} disabled={!dirty || busy || loading} onPress={() => void save()} style={[styles.saveButton, (!dirty || busy || loading) && styles.disabled]}><Text style={styles.saveText}>{busy ? t.saving : t.save}</Text></Pressable>
      </View>
      {(dirty || notice || error) ? <Text accessibilityLiveRegion="polite" style={[styles.message, error ? styles.error : styles.success]}>{error || (dirty ? t.unsaved : notice)}</Text> : null}
      {copyOpen && <View style={styles.copyBox}><Text style={styles.label}>{t.choose}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.copyList}>{TUNING_DATA.flatMap(cat => cat.instruments).map(inst => <Pressable key={inst.id} testID={`custom-tuning-copy-${inst.id}`} accessibilityRole="button" onPress={() => copyInstrument(inst)} style={styles.copyItem}><Text style={styles.itemTitle}>{inst.name[lang]}</Text><Text style={styles.muted}>{inst.strings.length} {t.target.toLowerCase()}</Text></Pressable>)}</ScrollView></View>}
      {loading ? <View style={styles.skeleton}><View style={styles.skeletonLine}/><View style={styles.skeletonLine}/></View> : error && !sets.length ? <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.empty}><Text style={styles.error}>{error}</Text><Text style={styles.softText}>{lang === "ko" ? "다시 시도" : "Retry"}</Text></Pressable> : sets.length === 0 ? <Text style={styles.empty}>{t.empty}</Text> : null}
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.scroll}>
        {sets.map(set => <View key={set.id} testID={`custom-tuning-set-${set.id}`} style={styles.setCard}>
          <View style={styles.row}>
            <TextInput testID={`custom-tuning-set-name-${set.id}`} accessibilityLabel={t.setName} value={set.name} onChangeText={name => updateSet(set.id, { name })} placeholder={t.setName} placeholderTextColor={C.textTertiary} style={[styles.input, styles.setName]} />
            <Pressable testID={`custom-tuning-delete-set-${set.id}`} accessibilityRole="button" accessibilityLabel={`${t.delete} ${set.name}`} onPress={() => confirmDelete(`s${set.id}`, set.groups.length, () => change(sets.filter(x => x.id !== set.id)))} style={styles.iconAction}><Text style={styles.deleteText}>{confirmId === `s${set.id}` ? t.confirmYes : t.delete}</Text></Pressable>
          </View>
          {confirmId === `s${set.id}` ? <Pressable onPress={() => setConfirmId(null)} style={styles.cancel}><Text style={styles.muted}>{t.cancel}</Text></Pressable> : null}
          {set.groups.map(group => <View key={group.id} testID={`custom-tuning-group-${group.id}`} style={styles.group}>
            <View style={styles.row}>
              <TextInput testID={`custom-tuning-group-name-${group.id}`} accessibilityLabel={t.group} value={group.name} onChangeText={name => updateGroup(set, group, { name })} placeholder={t.group} placeholderTextColor={C.textTertiary} style={[styles.input, styles.groupName]} />
              <Pressable testID={`custom-tuning-delete-group-${group.id}`} accessibilityRole="button" accessibilityLabel={`${t.delete} ${group.name}`} onPress={() => confirmDelete(`g${group.id}`, group.targets.length, () => updateSet(set.id, { groups: set.groups.filter(g => g.id !== group.id) }))} style={styles.iconAction}><Text style={styles.deleteText}>{confirmId === `g${group.id}` ? t.confirmYes : t.delete}</Text></Pressable>
            </View>
            {confirmId === `s${set.id}` || confirmId === `g${group.id}` ? <Pressable onPress={() => setConfirmId(null)} style={styles.cancel}><Text style={styles.muted}>{t.cancel}</Text></Pressable> : null}
            {group.targets.map(target => <View key={target.id} style={[styles.target, compact && styles.targetCompact]}>
              <TextInput testID={`custom-tuning-target-name-${target.id}`} accessibilityLabel={t.target} value={target.name} onChangeText={name => updateTarget(set, group, target, { name })} placeholder={t.target} placeholderTextColor={C.textTertiary} style={[styles.input, styles.targetName]} />
              {target.frequency !== null && target.id !== editor.id ? <Pressable testID={`custom-tuning-select-${target.id}`} accessibilityRole="button" accessibilityLabel={`${target.name}, ${target.frequency} Hz`} onPress={() => onSelectFreq(target.frequency!)} style={styles.frequency}><Text style={styles.freqText}>{target.frequency.toFixed(target.frequency < 100 ? 2 : 1)} Hz</Text></Pressable> : target.id !== editor.id ? <Text style={[styles.muted, styles.frequency]}>{t.noFreq}</Text> : null}
              {target.id === editor.id && <View style={styles.editor}>
                <View style={styles.modeRow}>
                  <Pressable onPress={() => {
                    if (editor.mode === "note") setFrequencyText(String(noteToFreq(selectedNote, selectedOctave)));
                    setEditor({ id: target.id, mode: "hz" });
                  }} style={[styles.mode, editor.mode === "hz" && styles.modeActive]}><Text style={styles.modeText}>{t.hz}</Text></Pressable>
                  <Pressable onPress={() => {
                    const inputFrequency = validateTuningFrequency(frequencyText);
                    if (inputFrequency !== null) {
                      const pitch = frequencyToNote(inputFrequency);
                      setSelectedNote(pitch.name);
                      setSelectedOctave(Math.max(0, Math.min(8, pitch.octave)));
                    }
                    setEditor({ id: target.id, mode: "note" });
                  }} style={[styles.mode, editor.mode === "note" && styles.modeActive]}><Text style={styles.modeText}>{t.note}</Text></Pressable>
                </View>
                {editor.mode === "hz" ? (
                  <TextInput testID={`custom-tuning-frequency-input-${target.id}`} accessibilityLabel={t.hz} value={frequencyText} onChangeText={setFrequencyText} placeholder={t.hzPlaceholder} keyboardType="decimal-pad" placeholderTextColor={C.textTertiary} style={[styles.input, styles.freqInput]} />
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <VerticalPitchPicker testID="custom-tuning-note-picker" items={NOTE_NAMES} selected={selectedNote} onSelect={setSelectedNote} label={lang === "ko" ? "음" : "Note"} />
                    <VerticalPitchPicker testID="custom-tuning-octave-picker" items={[0, 1, 2, 3, 4, 5, 6, 7, 8]} selected={selectedOctave} onSelect={setSelectedOctave} label={lang === "ko" ? "옥타브" : "Octave"} />
                    <Text testID="custom-tuning-note-frequency" style={styles.muted}>{noteToFreq(selectedNote, selectedOctave)} Hz</Text>
                  </View>
                )}
                <Pressable testID={`custom-tuning-frequency-apply-${target.id}`} onPress={() => resolveTargetFrequency(target)} style={styles.smallButton}><Text style={styles.actionText}>OK</Text></Pressable>
              </View>}
              {target.id !== editor.id && <Pressable testID={`custom-tuning-edit-${target.id}`} accessibilityRole="button" accessibilityLabel={lang === "ko" ? "음 설정" : "Edit tone"} onPress={() => {
                setError(""); setEditor({ id: target.id, mode: "hz" });
                setFrequencyText(target.frequency === null ? "" : String(target.frequency));
                const pitch = frequencyToNote(target.frequency ?? 440);
                setSelectedNote(pitch.name);
                setSelectedOctave(Math.max(0, Math.min(8, pitch.octave)));
              }} style={styles.smallButton}><Text style={styles.actionText}>{lang === "ko" ? "음 설정" : "Edit tone"}</Text></Pressable>}
              <Pressable testID={`custom-tuning-detect-${target.id}`} accessibilityRole="button" accessibilityLabel={t.detect} onPress={() => void beginCapture(set, group, target)} style={styles.detectButton}><Text style={styles.detectText}>{t.detect}</Text></Pressable>
              <Pressable testID={`custom-tuning-delete-target-${target.id}`} accessibilityRole="button" accessibilityLabel={`${t.delete} ${target.name}`} onPress={() => updateGroup(set, group, { targets: group.targets.filter(x => x.id !== target.id) })} style={styles.iconAction}><Text style={styles.deleteText}>×</Text></Pressable>
            </View>)}
            <Pressable testID={`custom-tuning-add-target-${group.id}`} accessibilityRole="button" onPress={() => addTarget(set, group)} style={styles.addRow}><Text style={styles.actionText}>+ {t.addTarget}</Text></Pressable>
          </View>)}
          <Pressable testID={`custom-tuning-add-group-${set.id}`} accessibilityRole="button" onPress={() => addGroup(set)} style={styles.addRow}><Text style={styles.actionText}>+ {t.addGroup}</Text></Pressable>
        </View>)}
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any, controlHeight: number) => StyleSheet.create({
  panel: { width: "100%", gap: Spacing.sm, paddingBottom: Spacing.sm },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  kicker: { color: C.textTertiary, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.micro, letterSpacing: 1 },
  title: { color: C.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: FontSize.subtitle },
  toolbar: { flexDirection: "row", gap: Spacing.xs, alignItems: "center" },
  action: { minHeight: controlHeight, justifyContent: "center", paddingHorizontal: Spacing.sm, borderRadius: Radius.md, backgroundColor: C.accentDim },
  actionText: { color: C.accent, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.caption },
  softButton: { minHeight: 40, flex: 1, justifyContent: "center", paddingHorizontal: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: C.border },
  softText: { color: C.textSecondary, fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.caption },
  saveButton: { minHeight: controlHeight, justifyContent: "center", paddingHorizontal: Spacing.md, borderRadius: Radius.md, backgroundColor: C.accent },
  saveText: { color: C.background, fontFamily: "SpaceGrotesk_700Bold", fontSize: FontSize.caption },
  disabled: { opacity: 0.45 },
  message: { fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.caption },
  error: { color: C.error ?? C.accent },
  success: { color: C.success },
  copyBox: { gap: Spacing.xs, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: C.backgroundSecondary },
  copyList: { gap: Spacing.xs },
  copyItem: { minWidth: 130, padding: Spacing.sm, borderRadius: Radius.sm, backgroundColor: C.surface },
  itemTitle: { color: C.text, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.caption },
  muted: { color: C.textTertiary, fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.caption },
  label: { color: C.textSecondary, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.caption },
  empty: { padding: Spacing.md, color: C.textTertiary, fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.caption, textAlign: "center" },
  skeleton: { gap: Spacing.xs, padding: Spacing.sm },
  skeletonLine: { height: 16, borderRadius: Radius.sm, backgroundColor: C.overlay08 },
  scroll: { maxHeight: 520 },
  setCard: { marginBottom: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  input: { minHeight: controlHeight, paddingHorizontal: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: C.border, backgroundColor: C.background, color: C.text, fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.caption },
  setName: { flex: 1, fontSize: FontSize.body },
  groupName: { flex: 1, backgroundColor: C.backgroundSecondary },
  group: { marginTop: Spacing.sm, marginLeft: Spacing.xs, paddingLeft: Spacing.sm, borderLeftWidth: 2, borderLeftColor: C.accentDim },
  iconAction: { minWidth: 40, minHeight: 40, justifyContent: "center", alignItems: "center", paddingHorizontal: 5 },
  deleteText: { color: C.textTertiary, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.caption },
  cancel: { alignSelf: "flex-end", padding: 4 },
  target: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: Spacing.xs, flexWrap: "wrap" },
  targetCompact: { alignItems: "stretch" },
  targetName: { flex: 1, minWidth: 96 },
  frequency: { minWidth: 75, paddingHorizontal: 4 },
  freqText: { color: C.text, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.caption, fontVariant: ["tabular-nums"] },
  smallButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 8, borderRadius: Radius.sm, backgroundColor: C.accentDim },
  detectButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 8, borderRadius: Radius.sm, backgroundColor: C.backgroundSecondary },
  detectText: { color: C.textSecondary, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.caption },
  editor: { width: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5 },
  modeRow: { flexDirection: "row", borderRadius: Radius.sm, overflow: "hidden", backgroundColor: C.backgroundSecondary },
  mode: { paddingHorizontal: 8, minHeight: 38, justifyContent: "center" },
  modeActive: { backgroundColor: C.accentDim },
  modeText: { color: C.textSecondary, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.caption },
  freqInput: { flex: 1, minWidth: 90 },
  addRow: { minHeight: 40, justifyContent: "center", paddingHorizontal: Spacing.xs },
});

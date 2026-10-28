import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StaffNotebook, NotebookSettings, StaffStamp } from "@/lib/staff-notebook";
import type { PracticeEntry } from "@/lib/storage";

type Copy = Record<string, string>;
type Props = {
  ko: boolean; t: Copy; note: StaffNotebook; settings: NotebookSettings; patterns: PracticeEntry[];
  patternLoading: boolean; patternError: string; notebooks: StaffNotebook[]; error: string;
  playback: any; metroRunning: boolean; selectedRows: number;
  onSettings: (patch: Partial<NotebookSettings>) => void; onPattern: (entry: PracticeEntry) => void;
  onPlay: () => void; onSimpleMetro: () => void; onRefresh: () => void; onNew: () => void; onSave: () => void;
  onLoad: (note: StaffNotebook) => void; onDelete: (note: StaffNotebook) => void; onTitle: (title: string) => void;
  onOpenCapture?: () => void;
};

export function NotebookLeftPanel(props: Props) {
  const { ko, t, note, settings, patterns, patternLoading, patternError, notebooks, error, playback, metroRunning } = props;
  const [showPatterns, setShowPatterns] = useState(false);
  const eligible = useMemo(() => patterns.filter((entry) => !entry.mode || entry.mode === "beat" || entry.mode === "bar"), [patterns]);
  const unsupported = useMemo(() => patterns.filter((entry) => entry.mode && entry.mode !== "beat" && entry.mode !== "bar"), [patterns]);
  const supportedMode = (entry: PracticeEntry) => !entry.mode || entry.mode === "beat" || entry.mode === "bar";
  const switcher = (label: string, value: boolean, onChange: (next: boolean) => void, testID?: string) => (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} testID={testID} onPress={() => onChange(!value)} style={[styles.switchRow, { borderBottomColor: "rgba(100,90,70,0.14)" }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={[styles.switch, value && styles.switchOn]}><View style={[styles.switchDot, value && styles.switchDotOn]} /></View>
    </Pressable>
  );
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>{ko ? "연습 소스" : "PRACTICE SOURCE"}</Text>
      <Text style={styles.sectionTitle}>{t.source}</Text>
      <View style={styles.sourceCard}>
        <View style={styles.sourceIcon}><Ionicons name={settings.source ? "musical-notes" : "pulse"} size={17} color="#795c3e" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sourceName}>{settings.source?.label ?? t.click}</Text>
          <Text style={styles.meta}>{settings.source ? `${settings.source.bpm} BPM · ${settings.source.beatsPerMeasure}/4` : `${settings.bpm} BPM · 1/4`}</Text>
        </View>
        {settings.source ? <Pressable onPress={() => props.onSettings({ source: undefined })} style={styles.clearSource}><Ionicons name="close" size={17} color="#786f62" /></Pressable> : null}
      </View>
      <Pressable onPress={() => setShowPatterns((v) => !v)} style={styles.outlineButton}>
        <Ionicons name="folder-open-outline" size={17} color="#5f5346" />
        <Text style={styles.buttonText}>{t.patterns}</Text>
        <Ionicons name={showPatterns ? "chevron-up" : "chevron-down"} size={15} color="#867a69" />
      </Pressable>
      {showPatterns ? (
        <View style={styles.patternList}>
          {patternLoading ? <View style={styles.skeleton}><View style={styles.skeletonBar} /><View style={styles.skeletonBarShort} /></View>
            : patternError ? <Text style={styles.error}>{patternError}</Text>
              : eligible.length === 0 && unsupported.length === 0 ? <Text style={styles.muted}>{t.noPatterns}</Text>
                : eligible.map((entry) => (
                  <Pressable key={entry.id} onPress={() => { props.onPattern(entry); setShowPatterns(false); }} style={styles.patternRow}>
                    <View style={styles.patternMeter}><Text style={styles.patternMeterText}>{entry.beatsPerMeasure}/4</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.rowLabel}>{entry.label}</Text>
                      <Text style={styles.meta}>{entry.mode === "bar" ? (ko ? "마디 패턴" : "Bar pattern") : (ko ? "비트 패턴" : "Beat pattern")} · {entry.bpm} BPM</Text>
                    </View>
                    <Ionicons name="arrow-down-circle-outline" size={18} color="#8b6740" />
                  </Pressable>
                ))}
          {unsupported.map((entry) => <View key={entry.id} style={[styles.patternRow, styles.unsupported]}><Ionicons name="information-circle-outline" size={17} color="#9a5a48" /><View style={{ flex: 1 }}><Text style={styles.rowLabel}>{entry.label}</Text><Text style={styles.error}>{t.unsupported}</Text></View></View>)}
        </View>
      ) : null}
      <View style={styles.bpmCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardHeading}>{t.bpm}</Text>
          <Text style={styles.meta}>{settings.source ? (ko ? "패턴 원래 템포" : "Pattern tempo") : (ko ? "동일한 4분음표 클릭" : "Even quarter-note clicks")}</Text>
        </View>
        <Pressable disabled={!!settings.source} onPress={() => props.onSettings({ bpm: Math.max(30, settings.bpm - 1) })} style={[styles.bpmButton, settings.source && styles.disabled]}><Text style={styles.bpmButtonText}>−</Text></Pressable>
        <TextInput testID="notebook-bpm" accessibilityLabel={t.bpm} editable={!settings.source} keyboardType="number-pad" value={String(settings.bpm)} onChangeText={(value) => props.onSettings({ bpm: Math.min(300, Math.max(20, Number(value) || 20)) })} style={styles.bpmInput} />
        <Pressable disabled={!!settings.source} onPress={() => props.onSettings({ bpm: Math.min(300, settings.bpm + 1) })} style={[styles.bpmButton, settings.source && styles.disabled]}><Text style={styles.bpmButtonText}>+</Text></Pressable>
      </View>
      <View style={styles.playControls}>
        <Pressable testID="notebook-play" onPress={props.onPlay} style={[styles.playButton, playback.running && styles.stopButton]}>
          <Ionicons name={playback.running ? "stop" : "play"} size={16} color="#fffaf2" />
          <Text style={styles.playText}>{playback.running ? t.stop : t.start}</Text>
        </Pressable>
        <Pressable onPress={props.onSimpleMetro} style={[styles.metroButton, metroRunning && styles.metroOn]}>
          <Ionicons name={metroRunning ? "stop-circle-outline" : "pulse-outline"} size={17} color="#66543d" />
          <Text style={styles.metroText}>{metroRunning ? t.stop : t.click}</Text>
        </Pressable>
      </View>
      {playback.preparing ? <Text style={styles.meta}>{ko ? "재생 준비 중…" : "Preparing playback…"}</Text> : null}
      {playback.error ? <Text style={styles.error}>{playback.error}</Text> : null}
      <View style={styles.rule} />
      <Text style={styles.eyebrow}>{ko ? "시간축" : "TIME & MOVEMENT"}</Text>
      <Text style={styles.sectionTitle}>{t.settings}</Text>
      {switcher(t.follow, settings.follow, (follow) => props.onSettings({ follow }), "notebook-follow")}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{ko ? "한 줄의 길이" : "Length of each staff row"}</Text>
        <View style={styles.segment}>
          <Pressable testID="notebook-line-unit-measure" onPress={() => props.onSettings({ lineUnit: "measure" })} style={[styles.segmentButton, settings.lineUnit === "measure" && styles.segmentSelected]}><Text style={[styles.segmentText, settings.lineUnit === "measure" && styles.segmentTextSelected]}>{t.measure}</Text></Pressable>
          <Pressable testID="notebook-line-unit-phrase" onPress={() => props.onSettings({ lineUnit: "phrase" })} style={[styles.segmentButton, settings.lineUnit === "phrase" && styles.segmentSelected]}><Text style={[styles.segmentText, settings.lineUnit === "phrase" && styles.segmentTextSelected]}>{t.phrase}</Text></Pressable>
        </View>
        <Text style={styles.meta}>{ko ? "패턴의 실제 박자와 템포로 계산합니다." : "Uses the source meter and tempo."}</Text>
      </View>
      <View style={styles.fieldGroup}>
        <View style={styles.fieldLabelRow}><Text style={styles.fieldLabel}>{t.zoom}</Text><Text style={styles.value}>{settings.playbackZoom.toFixed(2)}×</Text></View>
        <View style={styles.sliderButtons}>
          <Pressable testID="notebook-playback-zoom" onPress={() => props.onSettings({ playbackZoom: Math.max(0.25, +(settings.playbackZoom - 0.25).toFixed(2)) })} style={styles.smallIcon}><Ionicons name="remove" size={17} color="#625849" /></Pressable>
          <View style={styles.zoomTrack}><View style={[styles.zoomFill, { width: `${Math.max(6, Math.min(100, (settings.playbackZoom / 4) * 100))}%` }]} /></View>
          <Pressable onPress={() => props.onSettings({ playbackZoom: Math.min(4, +(settings.playbackZoom + 0.25).toFixed(2)) })} style={styles.smallIcon}><Ionicons name="add" size={17} color="#625849" /></Pressable>
        </View>
      </View>
      {switcher(t.random, settings.random, (random) => props.onSettings({ random }), "notebook-random")}
      <Text style={styles.meta}>{ko ? "무작위 순서는 재생 시작 전에 확정됩니다. 원본은 유지됩니다." : "Order is fixed before playback. Your original page order stays unchanged."}</Text>
      <View style={styles.rule} />
      <View style={styles.sectionHeader}>
        <View><Text style={styles.eyebrow}>{ko ? "보관함" : "LIBRARY"}</Text><Text style={styles.sectionTitle}>{t.notes}</Text></View>
        <Pressable onPress={props.onRefresh} style={styles.refresh}><Ionicons name="refresh" size={17} color="#795c3e" /></Pressable>
      </View>
      <View style={styles.libraryActions}>
        <Pressable onPress={props.onNew} style={styles.outlineButtonCompact}><Ionicons name="add" size={17} color="#5f5346" /><Text style={styles.buttonText}>{t.fresh}</Text></Pressable>
        <Pressable testID="notebook-save" onPress={props.onSave} style={styles.saveButton}><Ionicons name="save-outline" size={15} color="#fffaf2" /><Text style={styles.saveText}>{t.save}</Text></Pressable>
      </View>
      <TextInput value={note.title} onChangeText={props.onTitle} placeholder={t.title} placeholderTextColor="#a69b8c" style={styles.titleInput} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!notebooks.length ? <Text style={styles.muted}>{t.nothing}</Text> : notebooks.map((saved) => (
        <View key={saved.id} style={styles.savedRow}>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.rowLabel}>{saved.title}</Text><Text style={styles.meta}>{saved.pages.length} {ko ? "페이지" : "pages"}</Text></View>
          <Pressable onPress={() => props.onLoad(saved)} accessibilityLabel={ko ? "노트 열기" : "Open notebook"} style={styles.rowIcon}><Ionicons name="folder-open-outline" size={18} color="#795c3e" /></Pressable>
          <Pressable onPress={() => props.onDelete(saved)} accessibilityLabel={ko ? "노트 삭제" : "Delete notebook"} style={styles.rowIcon}><Ionicons name="trash-outline" size={17} color="#897e6f" /></Pressable>
        </View>
      ))}
      {props.onOpenCapture && <Pressable onPress={props.onOpenCapture} style={styles.outlineButton}>
        <Ionicons name="musical-notes-outline" size={17} color="#5f5346" />
        <Text style={styles.buttonText}>{ko ? "리듬 기록으로" : "Open rhythm capture"}</Text>
      </Pressable>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 17, paddingBottom: 30 },
  eyebrow: { color: "#947d5d", fontSize: 9, letterSpacing: 1.45, fontWeight: "800" },
  sectionTitle: { color: "#302b25", fontSize: 17, fontWeight: "700", marginTop: 4, marginBottom: 10 },
  sourceCard: { padding: 12, borderRadius: 12, backgroundColor: "#f4f0e8", flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 },
  sourceIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#e8decf" },
  sourceName: { color: "#332d25", fontSize: 12, fontWeight: "700" },
  meta: { color: "#887e70", fontSize: 10, marginTop: 3 },
  clearSource: { padding: 4 },
  outlineButton: { minHeight: 40, borderWidth: 1, borderColor: "#ded6c9", borderRadius: 10, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fffdf8" },
  buttonText: { flex: 1, color: "#4d453a", fontSize: 12, fontWeight: "600" },
  patternList: { marginTop: 5, marginBottom: 8, borderRadius: 11, borderWidth: 1, borderColor: "#e6dfd4", overflow: "hidden" },
  patternRow: { flexDirection: "row", gap: 9, alignItems: "center", padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e7e0d6", backgroundColor: "#fffdf9" },
  patternMeter: { width: 37, height: 37, backgroundColor: "#f1ede5", borderRadius: 9, justifyContent: "center", alignItems: "center" },
  patternMeterText: { color: "#655743", fontWeight: "700", fontSize: 10 },
  unsupported: { backgroundColor: "#faf5f1" },
  error: { color: "#a5523e", fontSize: 10, lineHeight: 15 },
  muted: { color: "#8b8173", fontSize: 11, paddingVertical: 10 },
  skeleton: { padding: 14, gap: 8 },
  skeletonBar: { height: 10, width: "78%", borderRadius: 5, backgroundColor: "#ece6dc" },
  skeletonBarShort: { height: 8, width: "48%", borderRadius: 4, backgroundColor: "#f0ebe3" },
  bpmCard: { marginTop: 11, padding: 11, borderRadius: 12, backgroundColor: "#f4f0e8", flexDirection: "row", alignItems: "center", gap: 5 },
  cardHeading: { color: "#353028", fontSize: 12, fontWeight: "700" },
  bpmButton: { width: 29, height: 30, backgroundColor: "#e8e0d4", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  bpmButtonText: { color: "#544938", fontSize: 17 },
  bpmInput: { width: 42, padding: 0, textAlign: "center", color: "#302b25", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.35 },
  playControls: { flexDirection: "row", gap: 8, marginTop: 9 },
  playButton: { flex: 1, minHeight: 42, backgroundColor: "#765d3e", borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  stopButton: { backgroundColor: "#4d4942" },
  playText: { color: "#fffaf2", fontSize: 12, fontWeight: "700" },
  metroButton: { flex: 1, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: "#ded6c9", backgroundColor: "#fffdf8", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 7 },
  metroOn: { backgroundColor: "#ece2d3" },
  metroText: { color: "#5f5346", fontSize: 10, fontWeight: "600", flexShrink: 1 },
  rule: { height: 1, backgroundColor: "#e9e3d9", marginVertical: 17 },
  switchRow: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { color: "#3c362e", fontSize: 12, fontWeight: "600" },
  switch: { width: 34, height: 20, borderRadius: 11, backgroundColor: "#d6d0c7", padding: 2, justifyContent: "center" },
  switchOn: { backgroundColor: "#8d7655" },
  switchDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fffdf8" },
  switchDotOn: { alignSelf: "flex-end" },
  fieldGroup: { paddingVertical: 12 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { color: "#4a4339", fontSize: 11, fontWeight: "700" },
  value: { color: "#79684e", fontSize: 11, fontWeight: "700" },
  segment: { flexDirection: "row", gap: 5, marginTop: 8 },
  segmentButton: { flex: 1, minHeight: 35, borderWidth: 1, borderColor: "#e1d9cd", borderRadius: 8, justifyContent: "center", alignItems: "center", paddingHorizontal: 5 },
  segmentSelected: { borderColor: "#8f7756", backgroundColor: "#f2ece2" },
  segmentText: { color: "#817768", fontSize: 10, textAlign: "center" },
  segmentTextSelected: { color: "#5d4b34", fontWeight: "700" },
  sliderButtons: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 8 },
  smallIcon: { width: 28, height: 27, borderRadius: 7, backgroundColor: "#f0ece5", alignItems: "center", justifyContent: "center" },
  zoomTrack: { height: 4, backgroundColor: "#e8e2d8", borderRadius: 5, flex: 1 },
  zoomFill: { height: 4, backgroundColor: "#967b56", borderRadius: 5 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  refresh: { padding: 7 },
  libraryActions: { flexDirection: "row", gap: 7 },
  outlineButtonCompact: { flex: 1, minHeight: 37, borderWidth: 1, borderColor: "#ded6c9", borderRadius: 9, alignItems: "center", flexDirection: "row", gap: 5, paddingHorizontal: 9 },
  saveButton: { minWidth: 82, minHeight: 37, paddingHorizontal: 10, borderRadius: 9, backgroundColor: "#765d3e", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  saveText: { color: "#fffaf2", fontSize: 11, fontWeight: "700" },
  titleInput: { minHeight: 37, borderWidth: 1, borderColor: "#e1d9cd", borderRadius: 8, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, color: "#302b25", fontSize: 12 },
  savedRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e6dfd5", gap: 9 },
  rowIcon: { padding: 6 },
});

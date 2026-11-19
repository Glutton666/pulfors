import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NotebookSettings, StaffNotebook } from "@/lib/staff-notebook";
import type { PracticeEntry } from "@/lib/storage";

type Props = {
  ko: boolean;
  t: Record<string, string>;
  note: StaffNotebook;
  settings: NotebookSettings;
  patterns: PracticeEntry[];
  patternLoading: boolean;
  patternError: string;
  notebooks: StaffNotebook[];
  error: string;
  onSettings: (patch: Partial<NotebookSettings>) => void;
  onReshuffle?: () => void;
  onPattern: (entry: PracticeEntry) => void;
  onRefresh: () => void;
  onNew: () => void;
  onSave: () => void;
  onLoad: (note: StaffNotebook) => void;
  onDelete: (note: StaffNotebook) => void;
  onTitle: (title: string) => void;
  onOpenCapture?: () => void;
  pageIndex: number;
  onPage: (index: number) => void;
  onAddPage: () => void;
  onRows: (count: number) => void;
  onZoom: (scale: number) => void;
  scale: number;
  portraitLayout?: boolean;
};

export function NotebookSettingsPanel(props: Props) {
  const { ko, t, note, settings, patterns, notebooks } = props;
  const [showPatterns, setShowPatterns] = useState(false);
  const currentRows = settings.rowsPerPage ?? note.pages[props.pageIndex]?.staffCount ?? 7;
  const meter = settings.notationMeter ?? { beats: 4, unit: 4 as const };
  const [rowsDraft, setRowsDraft] = useState(String(currentRows));
  const [zoomDraft, setZoomDraft] = useState(String(Math.round(props.scale * 100)));
  const [beatsDraft, setBeatsDraft] = useState(String(meter.beats));

  useEffect(() => setRowsDraft(String(currentRows)), [currentRows, note.id]);
  useEffect(() => setZoomDraft(String(Math.round(props.scale * 100))), [props.scale]);
  useEffect(() => setBeatsDraft(String(meter.beats)), [meter.beats]);

  const eligible = patterns.filter((entry) => !entry.mode || entry.mode === "beat" || entry.mode === "bar");
  const unsupported = patterns.filter((entry) => entry.mode && entry.mode !== "beat" && entry.mode !== "bar");
  const toggle = (label: string, value: boolean, onChange: (next: boolean) => void, testID?: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      aria-checked={value}
      onPress={() => onChange(!value)}
      style={styles.switchRow}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={[styles.switch, value && styles.switchOn]}><View style={[styles.switchDot, value && styles.switchDotOn]} /></View>
    </Pressable>
  );

  const commitRows = (text = rowsDraft) => {
    const parsed = Number(text);
    const value = Number.isFinite(parsed) ? Math.max(1, Math.min(200, Math.round(parsed))) : settings.rowsPerPage ?? 7;
    setRowsDraft(String(value));
    if (value !== settings.rowsPerPage) props.onRows(value);
  };
  const commitZoom = (text = zoomDraft) => {
    const parsed = Number(text);
    const value = Number.isFinite(parsed) ? Math.max(props.portraitLayout ? 50 : 35, Math.min(250, Math.round(parsed))) : Math.round(props.scale * 100);
    setZoomDraft(String(value));
    props.onZoom(value / 100);
  };
  const commitMeterBeats = (text = beatsDraft) => {
    const parsed = Number(text);
    const beats = Number.isFinite(parsed) ? Math.max(1, Math.min(12, Math.round(parsed))) : meter.beats;
    setBeatsDraft(String(beats));
    if (beats !== meter.beats) props.onSettings({ notationMeter: { beats, unit: meter.unit } });
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>{ko ? "연습 소스" : "PRACTICE SOURCE"}</Text>
      <Text style={styles.sectionTitle}>{t.source}</Text>
      <View style={styles.sourceCard}>
        <View style={styles.sourceIcon}><Ionicons name={settings.source ? "musical-notes" : "pulse"} size={17} color="#795c3e" /></View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.sourceName}>{settings.source?.label ?? t.click}</Text>
          <Text style={styles.meta}>{settings.source ? `${settings.source.bpm} BPM · ${settings.source.beatsPerMeasure}/4` : `${settings.bpm} BPM · ${settings.beatsPerMeasure ?? 1}/4`}</Text>
        </View>
        {settings.source ? (
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "소스 해제" : "Clear source"} onPress={() => props.onSettings({ source: undefined })} style={styles.clearSource}>
            <Ionicons name="close-circle-outline" size={21} color="#887b68" />
          </Pressable>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPatterns }} onPress={() => setShowPatterns((value) => !value)} style={styles.outlineButton}>
        <Ionicons name="folder-open-outline" size={17} color="#5f5346" />
        <Text style={styles.buttonText}>{t.patterns}</Text>
        <Ionicons name={showPatterns ? "chevron-up" : "chevron-down"} size={15} color="#867a69" />
      </Pressable>
      {showPatterns ? (
        <View style={styles.patternList}>
          {props.patternLoading ? (
            <View style={styles.skeleton}><View style={styles.skeletonBar} /><View style={styles.skeletonBarShort} /></View>
          ) : props.patternError ? (
            <View style={styles.patternError}><Text style={styles.error}>{props.patternError}</Text><Pressable accessibilityRole="button" onPress={props.onRefresh} style={styles.retryButton}><Ionicons name="refresh" size={14} color="#795c3e" /><Text style={styles.retryText}>{ko ? "다시 불러오기" : "Retry"}</Text></Pressable></View>
          ) : eligible.length === 0 && unsupported.length === 0 ? (
            <Text style={styles.muted}>{t.noPatterns}</Text>
          ) : (
            eligible.map((entry) => (
              <Pressable key={entry.id} accessibilityRole="button" onPress={() => { props.onPattern(entry); setShowPatterns(false); }} style={styles.patternRow}>
                <View style={styles.patternMeter}><Text style={styles.patternMeterText}>{entry.beatsPerMeasure}/4</Text></View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.rowLabel}>{entry.label}</Text>
                  <Text style={styles.meta}>{entry.mode === "bar" ? (ko ? "마디 패턴" : "Bar pattern") : (ko ? "비트 패턴" : "Beat pattern")} · {entry.bpm} BPM</Text>
                </View>
                <Ionicons name="arrow-down-circle-outline" size={18} color="#8b6740" />
              </Pressable>
            ))
          )}
          {unsupported.map((entry) => (
            <View key={entry.id} style={[styles.patternRow, styles.unsupported]}>
              <Ionicons name="information-circle-outline" size={17} color="#9a5a48" />
              <View style={{ flex: 1 }}><Text style={styles.rowLabel}>{entry.label}</Text><Text style={styles.error}>{t.unsupported}</Text></View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.rule} />
      <Text style={styles.eyebrow}>{ko ? "페이지 · 종이" : "PAGE & PAPER"}</Text>
      <Text style={styles.sectionTitle}>{ko ? "페이지 구성" : "Page layout"}</Text>
      <View style={styles.meterSection}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>{ko ? "기본 기보 박자" : "Default notation meter"}</Text>
          <Text style={styles.value}>{ko ? "악보 배치" : "Musical layout"}</Text>
        </View>
        <View style={styles.meterFraction}>
          <TextInput
            testID="notebook-notation-beats"
            accessibilityLabel={ko ? "기보 박자 분자 (1–12)" : "Notation meter numerator (1–12)"}
            value={beatsDraft}
            onChangeText={setBeatsDraft}
            onBlur={() => commitMeterBeats()}
            onSubmitEditing={(event) => commitMeterBeats(event.nativeEvent.text)}
            keyboardType="number-pad"
            returnKeyType="done"
            style={styles.beatsInput}
          />
          <View style={styles.meterDivider} />
          <View style={styles.meterUnits}>
            {([2, 4, 8, 16] as const).map((unit) => (
              <Pressable
                key={unit}
                testID={`notebook-notation-unit-${unit}`}
                accessibilityRole="button"
                accessibilityLabel={`${ko ? "기보 박자 분모" : "Notation meter denominator"} ${unit}`}
                accessibilityState={{ selected: meter.unit === unit }}
                onPress={() => {
                  const parsed = Number(beatsDraft);
                  const beats = Number.isFinite(parsed) ? Math.max(1, Math.min(12, Math.round(parsed))) : meter.beats;
                  setBeatsDraft(String(beats));
                  props.onSettings({ notationMeter: { beats, unit } });
                }}
                style={[styles.unitChoice, meter.unit === unit && styles.meterChoiceSelected]}
              >
                <Text style={[styles.meterChoiceText, meter.unit === unit && styles.meterChoiceTextSelected]}>{unit}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={styles.meta}>{ko ? "첫 박자표를 넣기 전까지 적용됩니다. 클릭 소리의 박자는 바뀌지 않습니다." : "Applies until the first placed time signature. It does not change the click meter."}</Text>
      </View>
      {toggle(ko ? "자동 간격" : "Automatic spacing", settings.autoSpacing ?? false, (autoSpacing) => props.onSettings({ autoSpacing }), "notebook-auto-spacing")}
      {toggle(ko ? "자동 크기 조정" : "Automatic scaling", settings.autoScale ?? false, (autoScale) => props.onSettings({ autoScale }), "notebook-auto-scale")}
      {toggle(ko ? "마디선 표시" : "Show barlines", settings.showBarlines ?? false, (showBarlines) => props.onSettings({ showBarlines }), "notebook-show-barlines")}
      <Text style={styles.meta}>{ko ? "마디선을 숨겨도 마디 계산은 계속됩니다." : "Hiding barlines leaves measure calculations intact."}</Text>
      <View style={styles.pageControls}>
        <Pressable accessibilityRole="button" accessibilityLabel={ko ? "이전 페이지" : "Previous page"} onPress={() => props.onPage(Math.max(0, props.pageIndex - 1))} disabled={props.pageIndex <= 0} style={[styles.pageArrow, props.pageIndex <= 0 && styles.disabled]}><Ionicons name="chevron-back" size={18} color="#665b4d" /></Pressable>
        <Text style={styles.pageCounter}>{t.page} {props.pageIndex + 1} / {Math.max(1, note.pages.length)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={ko ? "다음 페이지" : "Next page"} onPress={() => props.onPage(Math.min(note.pages.length - 1, props.pageIndex + 1))} disabled={props.pageIndex >= note.pages.length - 1} style={[styles.pageArrow, props.pageIndex >= note.pages.length - 1 && styles.disabled]}><Ionicons name="chevron-forward" size={18} color="#665b4d" /></Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={props.onAddPage} style={styles.pageAdd}><Ionicons name="duplicate-outline" size={16} color="#66553d" /><Text style={styles.buttonText}>{t.addPage}</Text></Pressable>
      <View style={styles.fieldGroup}>
        <View style={styles.fieldLabelRow}><Text style={styles.fieldLabel}>{ko ? "페이지당 오선 줄" : "Staff rows per page"}</Text><Text style={styles.value}>1–200</Text></View>
        <TextInput
          testID="notebook-rows"
          accessibilityLabel={ko ? "페이지당 오선 줄 수" : "Staff rows per page"}
          value={rowsDraft}
          onChangeText={setRowsDraft}
          onBlur={() => commitRows()}
          onSubmitEditing={(event) => commitRows(event.nativeEvent.text)}
          keyboardType="number-pad"
          returnKeyType="done"
          style={styles.numberInput}
        />
        <Text style={styles.meta}>{ko ? "줄 수를 바꾸면 페이지 전체에서 줄 단위로 다시 나눕니다. 예: 6줄에서 4줄로 바꾸면 5–6번째 줄과 그 위의 잉크가 다음 페이지로 이동합니다." : "Changing this repartitions complete rows across pages. For example, 6 → 4 moves rows 5–6 and their ink to the next page."}</Text>
      </View>
      <View style={styles.fieldGroup}>
        <View style={styles.fieldLabelRow}><Text style={styles.fieldLabel}>{ko ? "최소 음표 크기" : "Minimum note scale"}</Text><Text style={styles.value}>{Math.round((settings.minScale ?? 0.65) * 100)}%</Text></View>
        <View style={styles.segment}>
          {[0.2, 0.4, 0.65, 0.8, 1].map((value) => (
            <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${ko ? "최소 크기" : "Minimum scale"} ${Math.round(value * 100)}%`} accessibilityState={{ selected: (settings.minScale ?? 0.65) === value }} onPress={() => props.onSettings({ minScale: value })} style={[styles.segmentButton, (settings.minScale ?? 0.65) === value && styles.segmentSelected]}>
              <Text style={[styles.segmentText, (settings.minScale ?? 0.65) === value && styles.segmentTextSelected]}>{Math.round(value * 100)}%</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.fieldGroup}>
        <View style={styles.fieldLabelRow}><Text style={styles.fieldLabel}>{ko ? "종이 확대" : "Paper zoom"}</Text><Text style={styles.value}>{Math.round(props.scale * 100)}%</Text></View>
        <View style={styles.zoomControls}>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "축소" : "Zoom out"} onPress={() => props.onZoom(Math.max(0.35, +(props.scale - 0.1).toFixed(2)))} style={styles.zoomButton}><Ionicons name="remove" size={17} color="#625849" /></Pressable>
          <TextInput testID="notebook-paper-zoom" value={zoomDraft} onChangeText={setZoomDraft} onBlur={() => commitZoom()} onSubmitEditing={(e) => commitZoom(e.nativeEvent.text)} keyboardType="number-pad" returnKeyType="done" style={styles.zoomInput} accessibilityLabel={ko ? "확대 비율" : "Zoom percentage"} />
          <Text style={styles.value}>%</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "확대" : "Zoom in"} onPress={() => props.onZoom(Math.min(2.5, +(props.scale + 0.1).toFixed(2)))} style={styles.zoomButton}><Ionicons name="add" size={17} color="#625849" /></Pressable>
        </View>
        <Text style={styles.meta}>{props.portraitLayout
          ? (ko ? "100%에서 한 마디, 50%에서 한 줄에 최대 두 마디까지 보입니다." : "See one measure per row at 100% and up to two at 50%.")
          : (ko ? "축소하면 한 줄에 더 많은 마디가 보입니다. 악보의 음가와 마디 경계는 그대로입니다." : "Zoom out to see more measures per row. Written durations and boundaries stay the same.")}</Text>
      </View>

      <View style={styles.rule} />
      <Text style={styles.eyebrow}>{ko ? "재생 따라가기" : "PLAYBACK TRACKING"}</Text>
      <Text style={styles.sectionTitle}>{ko ? "진행 방식" : "Follow the page"}</Text>
      {toggle(t.follow, settings.follow, (follow) => props.onSettings({ follow }), "notebook-follow")}
      {toggle(ko ? "반복 · 이동 기호 따라가기" : "Follow repeat & navigation marks", settings.followSymbols ?? false, (followSymbols) => props.onSettings({ followSymbols }), "notebook-follow-symbols")}
       <Text style={styles.meta}>{ko ? "놓은 부호만 해석합니다. 도돌이표는 2회, D.C./D.S. 뒤에는 반복하지 않습니다. 코다는 앞의 이동 지점과 뒤의 도착 지점, 두 곳에 놓아 주세요." : "Reads placed marks only. Repeats play twice, without repeats after D.C./D.S. Place two Coda marks: the earlier trigger and later destination."}</Text>
      <View style={styles.fieldGroup}>
        <View style={styles.fieldLabelRow}><Text style={styles.fieldLabel}>{t.zoom}</Text><Text style={styles.value}>{settings.playbackZoom.toFixed(2)}×</Text></View>
        <View style={styles.zoomControls}>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "재생 확대 축소" : "Decrease playback zoom"} onPress={() => props.onSettings({ playbackZoom: Math.max(0.25, +(settings.playbackZoom - 0.25).toFixed(2)) })} style={styles.zoomButton}><Ionicons name="remove" size={17} color="#625849" /></Pressable>
          <View style={styles.zoomTrack}><View style={[styles.zoomFill, { width: `${Math.max(6, Math.min(100, (settings.playbackZoom / 4) * 100))}%` }]} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? "재생 확대" : "Increase playback zoom"} onPress={() => props.onSettings({ playbackZoom: Math.min(4, +(settings.playbackZoom + 0.25).toFixed(2)) })} style={styles.zoomButton}><Ionicons name="add" size={17} color="#625849" /></Pressable>
        </View>
      </View>
      {toggle(t.random, settings.random, (random) => props.onSettings({ random }), "notebook-random")}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{ko ? "무작위 단위" : "Shuffle unit"}</Text>
        <View style={styles.segment}>
          <Pressable testID="notebook-random-unit-measure" accessibilityRole="button" accessibilityState={{ selected: (settings.randomUnit ?? "row") === "measure" }} onPress={() => props.onSettings({ randomUnit: "measure" })} style={[styles.segmentButton, (settings.randomUnit ?? "row") === "measure" && styles.segmentSelected]}><Text style={[styles.segmentText, (settings.randomUnit ?? "row") === "measure" && styles.segmentTextSelected]}>{ko ? "마디" : "Measure"}</Text></Pressable>
          <Pressable testID="notebook-random-unit-row" accessibilityRole="button" accessibilityState={{ selected: (settings.randomUnit ?? "row") === "row" }} onPress={() => props.onSettings({ randomUnit: "row" })} style={[styles.segmentButton, (settings.randomUnit ?? "row") === "row" && styles.segmentSelected]}><Text style={[styles.segmentText, (settings.randomUnit ?? "row") === "row" && styles.segmentTextSelected]}>{ko ? "줄" : "Row"}</Text></Pressable>
        </View>
      </View>
      {toggle(ko ? "기호도 무작위화" : "Randomize signs", settings.randomSigns ?? false, (randomSigns) => props.onSettings({ randomSigns }), "notebook-random-signs")}
      {!settings.randomSigns ? toggle(ko ? "줄 안에서 섞기" : "Shuffle within each row", settings.randomInside ?? false, (randomInside) => props.onSettings({ randomInside }), "notebook-random-inside") : null}
      <Text style={styles.meta}>{ko ? "기호 무작위화가 켜지면 부호 자체를 섞습니다. 끄면 부호와 그 안의 음표를 한 덩어리로 묶어 이동합니다." : "With sign randomization on, signs are shuffled themselves. Off keeps each sign and its contained notes together as one block."}</Text>
      {props.onReshuffle ? <Pressable testID="notebook-reshuffle" accessibilityRole="button" onPress={props.onReshuffle} style={styles.outlineButton}><Ionicons name="shuffle-outline" size={16} color="#5f5346" /><Text style={styles.buttonText}>{ko ? "다시 섞기" : "Reshuffle"}</Text></Pressable> : null}
      {toggle(ko ? "오선 줄 · 칸에 맞추기" : "Snap notes to staff lines & spaces", settings.snap, (snap) => props.onSettings({ snap }), "notebook-snap")}

      <View style={styles.rule} />
      <View style={styles.sectionHeader}>
        <View><Text style={styles.eyebrow}>{ko ? "보관함" : "LIBRARY"}</Text><Text style={styles.sectionTitle}>{t.notes}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={ko ? "보관함 새로고침" : "Refresh library"} onPress={props.onRefresh} style={styles.refresh}><Ionicons name="refresh" size={17} color="#795c3e" /></Pressable>
      </View>
      <View style={styles.libraryActions}>
        <Pressable accessibilityRole="button" onPress={props.onNew} style={styles.outlineButtonCompact}><Ionicons name="add" size={17} color="#5f5346" /><Text style={styles.buttonText}>{t.fresh}</Text></Pressable>
        <Pressable testID="notebook-save" accessibilityRole="button" onPress={props.onSave} style={styles.saveButton}><Ionicons name="save-outline" size={15} color="#fffaf2" /><Text style={styles.saveText}>{t.save}</Text></Pressable>
      </View>
      <TextInput value={note.title} onChangeText={props.onTitle} placeholder={t.title} placeholderTextColor="#a69b8c" accessibilityLabel={t.title} style={styles.titleInput} />
      {props.error ? <Text style={styles.error}>{props.error}</Text> : null}
      {!notebooks.length ? (
        <View style={styles.emptyLibrary}><Ionicons name="book-outline" size={19} color="#aa9b84" /><Text style={styles.muted}>{t.nothing}</Text></View>
      ) : notebooks.map((saved) => (
        <View key={saved.id} style={styles.savedRow}>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.rowLabel}>{saved.title}</Text><Text style={styles.meta}>{saved.pages.length} {ko ? "페이지" : "pages"}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? `${saved.title} 열기` : `Open ${saved.title}`} onPress={() => props.onLoad(saved)} style={styles.rowIcon}><Ionicons name="folder-open-outline" size={18} color="#795c3e" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={ko ? `${saved.title} 삭제` : `Delete ${saved.title}`} onPress={() => props.onDelete(saved)} style={styles.rowIcon}><Ionicons name="trash-outline" size={17} color="#897e6f" /></Pressable>
        </View>
      ))}
      {props.onOpenCapture ? (
        <Pressable accessibilityRole="button" onPress={props.onOpenCapture} style={styles.outlineButton}>
          <Ionicons name="musical-notes-outline" size={17} color="#5f5346" /><Text style={styles.buttonText}>{ko ? "리듬 기록으로" : "Open rhythm capture"}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 28 },
  eyebrow: { color: "#947d5d", fontSize: 9, letterSpacing: 1.35, fontWeight: "800", marginBottom: 5 },
  sectionTitle: { color: "#302b25", fontSize: 16, fontWeight: "700", marginTop: 2, marginBottom: 9 },
  sourceCard: { padding: 11, borderRadius: 12, backgroundColor: "#f4f0e8", flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  sourceIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#e8decf" },
  sourceName: { color: "#332d25", fontSize: 12, fontWeight: "700" },
  meta: { color: "#887e70", fontSize: 10, lineHeight: 14, marginTop: 3 },
  clearSource: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  outlineButton: { minHeight: 41, borderWidth: 1, borderColor: "#ded6c9", borderRadius: 10, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fffdf8" },
  buttonText: { flex: 1, color: "#4d453a", fontSize: 11, fontWeight: "600" },
  patternList: { marginTop: 5, marginBottom: 7, borderRadius: 11, borderWidth: 1, borderColor: "#e6dfd4", overflow: "hidden" },
  patternRow: { flexDirection: "row", gap: 9, alignItems: "center", padding: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e7e0d6", backgroundColor: "#fffdf9" },
  patternMeter: { width: 37, height: 37, backgroundColor: "#f1ede5", borderRadius: 9, justifyContent: "center", alignItems: "center" },
  patternMeterText: { color: "#655743", fontWeight: "700", fontSize: 10 },
  unsupported: { backgroundColor: "#faf5f1" },
  patternError: { padding: 10, gap: 8 },
  retryButton: { minHeight: 32, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, borderRadius: 8, backgroundColor: "#f2ece2" },
  retryText: { color: "#6c573a", fontSize: 10, fontWeight: "700" },
  error: { color: "#a5523e", fontSize: 10, lineHeight: 15 },
  muted: { color: "#8b8173", fontSize: 11, paddingVertical: 9 },
  skeleton: { padding: 14, gap: 8 },
  skeletonBar: { height: 10, width: "78%", borderRadius: 5, backgroundColor: "#ece6dc" },
  skeletonBarShort: { height: 8, width: "48%", borderRadius: 4, backgroundColor: "#f0ebe3" },
  rule: { height: 1, backgroundColor: "#e9e3d9", marginVertical: 15 },
  pageControls: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 7 },
  pageArrow: { width: 34, height: 34, borderRadius: 8, backgroundColor: "#f1ede6", alignItems: "center", justifyContent: "center" },
  pageCounter: { flex: 1, textAlign: "center", color: "#5e5549", fontSize: 11, fontWeight: "700" },
  disabled: { opacity: 0.38 },
  pageAdd: { minHeight: 37, borderRadius: 8, backgroundColor: "#f4f0e8", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 9 },
  fieldGroup: { paddingVertical: 11 },
  meterSection: { paddingVertical: 9, paddingHorizontal: 10, marginBottom: 8, borderRadius: 10, backgroundColor: "#f5f1e9" },
  meterFraction: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  beatsInput: { width: 54, height: 31, borderRadius: 7, borderWidth: 1, borderColor: "#dfd5c6", backgroundColor: "#fffdf8", textAlign: "center", padding: 0, color: "#51412e", fontSize: 12, fontWeight: "800" },
  meterDivider: { width: 1, alignSelf: "stretch", backgroundColor: "#dcd2c2" },
  meterUnits: { flexDirection: "row", flexWrap: "wrap", width: 80, justifyContent: "center", gap: 4 },
  meterChoice: { width: 25, height: 25, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#fffdf8" },
  unitChoice: { width: 32, height: 27, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#fffdf8" },
  meterChoiceSelected: { backgroundColor: "#e7ddce", borderWidth: 1, borderColor: "#9a805d" },
  meterChoiceText: { color: "#796d5c", fontSize: 10, fontWeight: "600" },
  meterChoiceTextSelected: { color: "#51412e", fontWeight: "800" },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { color: "#4a4339", fontSize: 11, fontWeight: "700" },
  value: { color: "#79684e", fontSize: 10, fontWeight: "700" },
  numberInput: { width: 94, height: 37, marginTop: 7, borderWidth: 1, borderColor: "#e1d9cd", borderRadius: 8, paddingHorizontal: 10, color: "#4d4333", fontSize: 13, fontWeight: "700", backgroundColor: "#fffdf8" },
  zoomControls: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  zoomButton: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#f0ece5", alignItems: "center", justifyContent: "center" },
  zoomInput: { width: 51, height: 31, borderWidth: 1, borderColor: "#e3dbcf", borderRadius: 7, textAlign: "center", color: "#66563f", fontSize: 11, fontWeight: "700", padding: 0 },
  switchRow: { minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(100,90,70,0.14)" },
  rowLabel: { color: "#3c362e", fontSize: 11, fontWeight: "600" },
  switch: { width: 36, height: 21, borderRadius: 11, backgroundColor: "#d6d0c7", padding: 2, justifyContent: "center" },
  switchOn: { backgroundColor: "#8d7655" },
  switchDot: { width: 17, height: 17, borderRadius: 9, backgroundColor: "#fffdf8" },
  switchDotOn: { alignSelf: "flex-end" },
  segment: { flexDirection: "row", gap: 5, marginTop: 8 },
  segmentButton: { flex: 1, minHeight: 36, borderWidth: 1, borderColor: "#e1d9cd", borderRadius: 8, justifyContent: "center", alignItems: "center", paddingHorizontal: 5 },
  segmentSelected: { borderColor: "#8f7756", backgroundColor: "#f2ece2" },
  segmentText: { color: "#817768", fontSize: 10, textAlign: "center" },
  segmentTextSelected: { color: "#5d4b34", fontWeight: "700" },
  zoomTrack: { height: 4, backgroundColor: "#e8e2d8", borderRadius: 5, flex: 1 },
  zoomFill: { height: 4, backgroundColor: "#967b56", borderRadius: 5 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  refresh: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#f4f0e8" },
  libraryActions: { flexDirection: "row", gap: 7 },
  outlineButtonCompact: { flex: 1, minHeight: 39, borderWidth: 1, borderColor: "#ded6c9", borderRadius: 9, alignItems: "center", flexDirection: "row", gap: 5, paddingHorizontal: 9 },
  saveButton: { minWidth: 87, minHeight: 39, paddingHorizontal: 10, borderRadius: 9, backgroundColor: "#765d3e", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  saveText: { color: "#fffaf2", fontSize: 10, fontWeight: "700" },
  titleInput: { minHeight: 39, borderWidth: 1, borderColor: "#e1d9cd", borderRadius: 8, marginTop: 8, paddingHorizontal: 10, paddingVertical: 7, color: "#302b25", fontSize: 12, backgroundColor: "#fffdf8" },
  savedRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e6dfd5", gap: 8 },
  rowIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  emptyLibrary: { flexDirection: "row", alignItems: "center", gap: 7 },
});

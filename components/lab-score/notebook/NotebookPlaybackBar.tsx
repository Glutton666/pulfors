import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NotebookSettings } from "@/lib/staff-notebook";

type Props = {
  ko: boolean;
  settings: NotebookSettings;
  running: boolean;
  preparing: boolean;
  onSettings: (patch: Partial<NotebookSettings>) => void;
  onToggle: () => void;
  layoutKey?: number;
  pickerTop?: number;
  pickerBottom?: number;
};

const meters = Array.from({ length: 12 }, (_, index) => index + 1);

export function NotebookPlaybackBar({ ko, settings, running, preparing, onSettings, onToggle, layoutKey, pickerTop, pickerBottom }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(false);
  const [meterOpen, setMeterOpen] = useState(false);
  const [barBox, setBarBox] = useState({ y: 0, height: 54, width: 0 });
  const shellRef = useRef<View>(null);
  const [bpmDraft, setBpmDraft] = useState(String(settings.source?.bpm ?? settings.bpm));
  const compact = barBox.width > 0 && barBox.width < 410;
  const locked = Boolean(settings.source);
  const displayedBpm = settings.source?.bpm ?? settings.bpm;
  useEffect(() => setBpmDraft(String(displayedBpm)), [displayedBpm]);
  useEffect(() => {
    setMeterOpen(false);
    const frame = requestAnimationFrame(() => shellRef.current?.measureInWindow((x, y, width, height) => setBarBox({ y, height, width })));
    return () => cancelAnimationFrame(frame);
  }, [layoutKey]);
  const displayedMeter = settings.source?.beatsPerMeasure ?? settings.beatsPerMeasure ?? 1;
  const topLimit = pickerTop ?? 8;
  const bottomLimit = pickerBottom ?? windowHeight - 8;
  const roomAbove = Math.max(0, barBox.y - topLimit - 8);
  const roomBelow = Math.max(0, bottomLimit - (barBox.y + barBox.height) - 8);
  const openAbove = roomBelow < Math.min(244, meters.length * 31 + 8) && roomAbove > roomBelow;
  const menuMaxHeight = Math.max(40, Math.min(244, openAbove ? roomAbove : roomBelow));

  const commitBpm = (text = bpmDraft) => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      setBpmDraft(String(displayedBpm));
      return;
    }
    const next = Math.max(20, Math.min(300, Math.round(parsed)));
    setBpmDraft(String(next));
    onSettings({ bpm: next });
  };

  return (
    <View ref={shellRef} collapsable={false} style={styles.shell} onLayout={() => shellRef.current?.measureInWindow((x, y, width, height) => setBarBox({ y, height, width }))}>
      <View style={[styles.row, compact && styles.compactRow]}>
        <Pressable
          testID="notebook-playback-collapse"
          accessibilityRole="button"
          accessibilityLabel={collapsed ? (ko ? "재생바 펼치기" : "Expand playback controls") : (ko ? "재생바 접기" : "Collapse playback controls")}
          accessibilityState={{ expanded: !collapsed }}
          onPress={() => { setCollapsed((value) => !value); setMeterOpen(false); }}
          style={[styles.collapse, compact && styles.compactCollapse]}
          hitSlop={4}
        >
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color="#75654d" />
        </Pressable>
        {collapsed ? (
          <Text style={styles.collapsedText}>{running ? (ko ? "재생 중" : "Playing") : (ko ? "재생" : "Playback")}</Text>
        ) : (
          <>
            <View style={styles.control}>
              <Text style={styles.miniLabel}>{ko ? "박자" : "METER"}</Text>
              <Pressable
                testID="notebook-meter"
                accessibilityRole="button"
                accessibilityLabel={ko ? "박자 선택" : "Choose meter"}
                accessibilityState={{ expanded: meterOpen, disabled: locked }}
                disabled={locked}
                onPress={() => setMeterOpen((value) => !value)}
                style={[styles.meterButton, compact && styles.compactMeterButton, locked && styles.locked]}
              >
                <Text style={styles.meterValue}>{displayedMeter}/4</Text>
                <Ionicons name={meterOpen ? "chevron-up" : "chevron-down"} size={13} color="#7b6d57" />
              </Pressable>
            </View>
            <View style={styles.divider} />
            <View style={styles.control}>
              <Text style={styles.miniLabel}>{ko ? "빠르기" : "BPM"}</Text>
              <View style={[styles.bpmBox, compact && styles.compactBpmBox, locked && styles.locked]}>
                <TextInput
                  testID="notebook-bpm"
                  accessibilityLabel={ko ? "분당 박자" : "Beats per minute"}
                  value={locked ? String(displayedBpm) : bpmDraft}
                  editable={!locked}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onChangeText={setBpmDraft}
              onBlur={() => commitBpm()}
              onSubmitEditing={(event) => commitBpm(event.nativeEvent.text)}
                  style={styles.bpmInput}
                />
                {!compact && <Text style={styles.bpmSuffix}>bpm</Text>}
              </View>
            </View>
            {locked && !compact ? <View style={styles.lockIcon}><Ionicons name="lock-closed-outline" size={13} color="#9a8a72" /></View> : null}
          </>
        )}
        <View style={styles.rowSpacer} />
        {preparing ? <View style={styles.preparing}><View style={styles.pulse} />{!compact && <Text style={styles.preparingText}>{ko ? "준비 중" : "Preparing"}</Text>}</View> : null}
        <Pressable
          testID="notebook-playback-random"
          accessibilityRole="switch"
          accessibilityLabel={ko ? "무작위 재생" : "Random play"}
          accessibilityState={{ checked: Boolean(settings.random) }}
          aria-checked={Boolean(settings.random)}
          onPress={() => onSettings({ random: !settings.random })}
          style={[styles.randomButton, compact && styles.compactRandomButton, settings.random && styles.randomButtonActive]}
        >
          <Ionicons name="shuffle-outline" size={17} color={settings.random ? "#fffaf1" : "#75654d"} />
          {!collapsed && !compact ? <Text style={[styles.randomText, settings.random && styles.randomTextActive]}>{ko ? "무작위" : "Random"}</Text> : null}
        </Pressable>
        <Pressable
          testID="notebook-play"
          accessibilityRole="button"
          accessibilityLabel={running || preparing ? (ko ? "정지" : "Stop") : (ko ? "재생" : "Play")}
          accessibilityState={{ selected: running, busy: preparing }}
          onPress={onToggle}
          style={[styles.playButton, compact && styles.compactPlayButton, (running || preparing) && styles.stopButton]}
        >
          <Ionicons name={running || preparing ? "stop" : "play"} size={15} color="#fffaf1" />
          {!collapsed && !compact ? <Text style={styles.playText}>{running || preparing ? (ko ? "정지" : "Stop") : (ko ? "재생" : "Play")}</Text> : null}
        </Pressable>
      </View>
      {!collapsed && meterOpen && !locked ? (
        <ScrollView
          style={[styles.meterMenu, { maxHeight: menuMaxHeight, [openAbove ? "bottom" : "top"]: openAbove ? barBox.height + 4 : barBox.height - 3 }]}
          keyboardShouldPersistTaps="handled"
        >
          {meters.map((meter) => (
            <Pressable
              key={meter}
              testID={`notebook-meter-${meter}`}
              accessibilityRole="button"
              accessibilityState={{ selected: displayedMeter === meter }}
              onPress={() => {
                onSettings({ beatsPerMeasure: meter });
                setMeterOpen(false);
              }}
              style={[styles.meterOption, displayedMeter === meter && styles.meterOptionActive]}
            >
              <Text style={[styles.meterOptionText, displayedMeter === meter && styles.meterOptionTextActive]}>{meter}/4</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { position: "relative", zIndex: 10, alignSelf: "center", width: "100%", maxWidth: 410, overflow: "visible" },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 5, gap: 8 },
  collapse: { width: 31, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#f6f1e8" },
  compactCollapse: { width: 28 },
  randomButton: { minWidth: 72, minHeight: 36, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, borderColor: "#e7ddce", backgroundColor: "#f7f2e9", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  compactRandomButton: { width: 44, minWidth: 44, height: 36, minHeight: 36, paddingHorizontal: 0 },
  randomButtonActive: { backgroundColor: "#826747", borderColor: "#826747" },
  randomText: { color: "#75654d", fontSize: 10, fontWeight: "700" },
  randomTextActive: { color: "#fffaf1" },
  rowSpacer: { flex: 1, minWidth: 0 },
  collapsedText: { color: "#6c604e", fontSize: 11, fontWeight: "700" },
  control: { alignItems: "center", justifyContent: "center", gap: 2 },
  miniLabel: { color: "#a0927d", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  meterButton: { minWidth: 58, minHeight: 29, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 8, backgroundColor: "#f5f0e7" },
  meterValue: { color: "#574a38", fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  divider: { height: 28, width: 1, backgroundColor: "#ece5da" },
  bpmBox: { height: 29, minWidth: 73, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 8, backgroundColor: "#f5f0e7" },
  bpmInput: { width: 38, minWidth: 34, padding: 0, textAlign: "right", color: "#554835", fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  bpmSuffix: { color: "#968974", fontSize: 9, fontWeight: "600" },
  locked: { opacity: 0.68 },
  lockIcon: { marginLeft: -5, marginTop: 11 },
  playButton: { minWidth: 73, minHeight: 38, paddingHorizontal: 11, borderRadius: 11, backgroundColor: "#806546", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  stopButton: { backgroundColor: "#635b50" },
  playText: { color: "#fffaf1", fontSize: 11, fontWeight: "700" },
  preparing: { flexDirection: "row", alignItems: "center", gap: 5, marginRight: 1 },
  pulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#b18a53" },
  preparingText: { color: "#968873", fontSize: 9 },
  meterMenu: { position: "absolute", left: 39, zIndex: 30, width: 76, minHeight: 42, padding: 4, borderRadius: 11, borderWidth: 1, borderColor: "#e4dbce", backgroundColor: "#fffdf8", shadowColor: "#403321", shadowOpacity: 0.15, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  compactRow: { minHeight: 46, paddingHorizontal: 2, gap: 3 },
  compactMeterButton: { minWidth: 49, paddingHorizontal: 4 },
  compactBpmBox: { width: 57, minWidth: 57, paddingHorizontal: 3 },
  compactPlayButton: { minWidth: 44, paddingHorizontal: 7 },
  meterOption: { minHeight: 31, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  meterOptionActive: { backgroundColor: "#eee5d7" },
  meterOptionText: { color: "#776b58", fontSize: 11, fontWeight: "600" },
  meterOptionTextActive: { color: "#5b4830" },
});

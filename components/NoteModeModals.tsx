import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Image,
  StyleSheet,
  useWindowDimensions,
  PanResponder,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import type { PracticeEntry } from "@/lib/storage";
import type { NoteImageCrop } from "@/lib/storage";
import { getNoteSourceMode } from "@/lib/note-mode-sources";
import {
  clampNoteImageCropToFrame,
  getNoteImagePanBounds,
  normalizeNoteImageCrop,
} from "@/lib/note-image-crop";

type Filter = "all" | "beat" | "bar" | "score";

export function PracticeSourcePickerModal({
  visible, entries, selected, onCancel, onConfirm,
}: {
  visible: boolean;
  entries: PracticeEntry[];
  selected: PracticeEntry[];
  onCancel: () => void;
  onConfirm: (entries: PracticeEntry[]) => void;
}) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState<PracticeEntry[]>(selected);
  React.useEffect(() => { if (visible) setDraft(selected); }, [visible, selected]);
  const visibleEntries = useMemo(() => entries.filter((e) => {
    const text = `${e.label} ${e.bpm}`.toLowerCase();
    const kind = getNoteSourceMode(e);
    return (!query.trim() || text.includes(query.trim().toLowerCase())) && (filter === "all" || kind === filter);
  }), [entries, filter, query]);
  const toggle = (entry: PracticeEntry) => setDraft((old) => old.some((e) => e.id === entry.id)
    ? old.filter((e) => e.id !== entry.id)
    : [...old, entry]);
  const close = () => { setQuery(""); onCancel(); };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.title, { color: C.text }]}>{t("noteMode", "loadSources")}</Text>
              <Text style={[styles.subtitle, { color: C.textTertiary }]}>{draft.length} {t("noteMode", "selected")}</Text>
            </View>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t("main", "cancel")}>
              <Ionicons name="close" size={24} color={C.textSecondary} />
            </Pressable>
          </View>
          <View style={[styles.search, { borderColor: C.border, backgroundColor: C.background }]}>
            <Ionicons name="search" size={17} color={C.textTertiary} />
            <TextInput value={query} onChangeText={setQuery} placeholder={t("noteMode", "searchSources")} placeholderTextColor={C.textTertiary} style={[styles.input, { color: C.text }]} />
          </View>
          <View style={styles.filters}>
            {(["all", "beat", "bar", "score"] as Filter[]).map((key) => (
              <Pressable key={key} onPress={() => setFilter(key)} accessibilityRole="button" accessibilityState={{ selected: filter === key }} style={[styles.filter, { borderColor: filter === key ? C.accent : C.border, backgroundColor: filter === key ? C.accent + "22" : "transparent" }]}>
                <Text style={{ color: filter === key ? C.accent : C.textSecondary, fontWeight: "600" }}>{t("noteMode", `filter${key[0].toUpperCase()}${key.slice(1)}` as never)}</Text>
              </Pressable>
            ))}
          </View>
          <FlatList
            style={styles.sourceList}
            data={visibleEntries}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={[styles.empty, { color: C.textTertiary }]}>{t("noteMode", "noSources")}</Text>}
            renderItem={({ item }) => {
              const checked = draft.some((e) => e.id === item.id);
              return <Pressable onPress={() => toggle(item)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`${item.label}, ${item.bpm} BPM`} style={[styles.row, { borderColor: checked ? C.accent : C.border, backgroundColor: checked ? C.accent + "12" : C.background }]}>
                <View style={[styles.check, { borderColor: checked ? C.accent : C.textTertiary, backgroundColor: checked ? C.accent : "transparent" }]}>{checked && <Ionicons name="checkmark" size={14} color={C.background} />}</View>
                <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: C.text }]} numberOfLines={1}>{item.label}</Text><Text style={{ color: C.textTertiary }}>{item.bpm} BPM · {item.beatsPerMeasure} {t("noteMode", "beatUnit")}</Text></View>
                {checked && <Text style={{ color: C.accent, fontWeight: "700" }}>{draft.findIndex((e) => e.id === item.id) + 1}</Text>}
              </Pressable>;
            }}
          />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("main", "cancel")} onPress={close} style={[styles.action, { borderColor: C.border }]}><Text style={{ color: C.textSecondary }}>{t("main", "cancel")}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t("noteMode", "loadSelected")} onPress={() => { onConfirm(draft); setQuery(""); }} style={[styles.action, { backgroundColor: C.accent }]}><Text style={{ color: C.background, fontWeight: "700" }}>{t("noteMode", "loadSelected")}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ImageFramingModal({ visible, uri, crop, onCancel, onConfirm, onRemove }: {
  visible: boolean; uri: string; crop?: NoteImageCrop;
  onCancel: () => void; onConfirm: (crop: NoteImageCrop) => void; onRemove?: () => void;
}) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const { width, height } = useWindowDimensions();
  const [scale, setScale] = useState(crop?.scale ?? 1);
  const [x, setX] = useState(crop?.x ?? 0);
  const [y, setY] = useState(crop?.y ?? 0);
  const [imageSize, setImageSize] = useState<{ uri: string | null; width: number; height: number }>({
    uri: null,
    width: 0,
    height: 0,
  });
  const preview = Math.min(width - 48, 360);
  const previewHeight = width > height
    ? Math.min(preview * 0.62, height * 0.5)
    : Math.min(preview * 1.3, height * 0.58);
  const start = React.useRef({ x: 0, y: 0 });
  const clampPosition = React.useCallback((nextX: number, nextY: number, nextScale = scale) => {
    if (imageSize.uri !== uri || imageSize.width <= 0 || imageSize.height <= 0) {
      const preserved = normalizeNoteImageCrop({
        scale: nextScale,
        x: nextX,
        y: nextY,
      }) ?? { scale: 1, x: 0, y: 0 };
      setX(preserved.x);
      setY(preserved.y);
      return;
    }
    const next = clampNoteImageCropToFrame(
      { scale: nextScale, x: nextX, y: nextY },
      imageSize.width,
      imageSize.height,
      preview,
      previewHeight,
    );
    setX(next.x);
    setY(next.y);
  }, [imageSize.height, imageSize.uri, imageSize.width, preview, previewHeight, scale, uri]);
  const pan = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = { x, y }; },
    onPanResponderMove: (_, gesture) => {
      clampPosition(
        start.current.x + gesture.dx / preview,
        start.current.y + gesture.dy / previewHeight,
      );
    },
  }), [clampPosition, preview, previewHeight, x, y]);
  React.useEffect(() => { if (visible) { setScale(crop?.scale ?? 1); setX(crop?.x ?? 0); setY(crop?.y ?? 0); } }, [visible, crop]);
  React.useEffect(() => {
    if (!visible) return;
    let active = true;
    setImageSize({ uri: null, width: 0, height: 0 });
    if (typeof Image.getSize !== "function") {
      return () => { active = false; };
    }
    Image.getSize(
      uri,
      (width, height) => {
        if (active) setImageSize({ uri, width, height });
      },
      () => {
        if (active) setImageSize({ uri, width: 0, height: 0 });
      },
    );
    return () => { active = false; };
  }, [uri, visible]);
  React.useEffect(() => {
    if (visible) clampPosition(x, y, scale);
  // Re-clamp after zoom, orientation, or image-size changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, preview, previewHeight, imageSize.width, imageSize.height, visible]);
  const changeScale = (delta: number) => {
    const nextScale = Math.max(1, Math.min(3, Number((scale + delta).toFixed(2))));
    setScale(nextScale);
    clampPosition(x, y, nextScale);
  };
  const nudge = (dx: number, dy: number) => {
    const step = 0.04;
    clampPosition(x + dx * step, y + dy * step);
  };
  const bounds = imageSize.uri === uri
    ? getNoteImagePanBounds(imageSize.width, imageSize.height, preview, previewHeight, scale)
    : { x: 0, y: 0 };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.backdrop}><ScrollView style={[styles.frameSheet, { backgroundColor: C.surface, borderColor: C.border }]} contentContainerStyle={styles.frameSheetContent}>
      <View accessibilityViewIsModal style={styles.frameContent}>
      <View style={styles.sheetHeader}><View style={{ flex: 1 }}><Text style={[styles.title, { color: C.text }]}>{t("noteMode", "framePhoto")}</Text><Text style={[styles.subtitle, { color: C.textTertiary }]}>{t("noteMode", "frameHint")}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={t("main", "cancel")} onPress={onCancel}><Ionicons name="close" size={24} color={C.textSecondary} /></Pressable></View>
       <View {...pan.panHandlers} style={[styles.frame, { width: preview, height: previewHeight, borderColor: C.accent }]}><View pointerEvents="none" style={{ width: "100%", height: "100%" }}><Image source={{ uri }} resizeMode="cover" style={{ width: "100%", height: "100%", transform: [{ scale }, { translateX: x * preview }, { translateY: y * previewHeight }] }} /></View></View>
      <View style={styles.zoomRow}><Text style={{ color: C.textSecondary }}>{t("noteMode", "zoom")}</Text><Pressable accessibilityRole="button" accessibilityLabel={t("noteMode", "zoomOut")} onPress={() => changeScale(-0.1)}><Ionicons name="remove-circle-outline" size={28} color={C.accent} /></Pressable><Text style={{ color: C.accent, fontWeight: "700" }}>{Math.round(scale * 100)}%</Text><Pressable accessibilityRole="button" accessibilityLabel={t("noteMode", "zoomIn")} onPress={() => changeScale(0.1)}><Ionicons name="add-circle-outline" size={28} color={C.accent} /></Pressable></View>
      <View style={styles.nudgeRow}>
        <Pressable disabled={bounds.x === 0} accessibilityRole="button" accessibilityLabel={t("noteMode", "moveLeft")} onPress={() => nudge(-1, 0)} style={styles.nudgeButton}><Ionicons name="arrow-back" size={20} color={bounds.x === 0 ? C.textTertiary : C.accent} /></Pressable>
        <Pressable disabled={bounds.y === 0} accessibilityRole="button" accessibilityLabel={t("noteMode", "moveUp")} onPress={() => nudge(0, -1)} style={styles.nudgeButton}><Ionicons name="arrow-up" size={20} color={bounds.y === 0 ? C.textTertiary : C.accent} /></Pressable>
        <Pressable disabled={bounds.y === 0} accessibilityRole="button" accessibilityLabel={t("noteMode", "moveDown")} onPress={() => nudge(0, 1)} style={styles.nudgeButton}><Ionicons name="arrow-down" size={20} color={bounds.y === 0 ? C.textTertiary : C.accent} /></Pressable>
        <Pressable disabled={bounds.x === 0} accessibilityRole="button" accessibilityLabel={t("noteMode", "moveRight")} onPress={() => nudge(1, 0)} style={styles.nudgeButton}><Ionicons name="arrow-forward" size={20} color={bounds.x === 0 ? C.textTertiary : C.accent} /></Pressable>
      </View>
      <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel={t("main", "cancel")} onPress={onCancel} style={[styles.action, { borderColor: C.border }]}><Text style={{ color: C.textSecondary }}>{t("main", "cancel")}</Text></Pressable>{onRemove && <Pressable accessibilityRole="button" accessibilityLabel={t("noteMode", "removePhoto")} onPress={onRemove} style={[styles.action, { borderColor: C.danger }]}><Text style={{ color: C.danger }}>{t("noteMode", "removePhoto")}</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel={t("noteMode", "applyFrame")} onPress={() => onConfirm({ scale, x, y })} style={[styles.action, { backgroundColor: C.accent }]}><Text style={{ color: C.background, fontWeight: "700" }}>{t("noteMode", "applyFrame")}</Text></Pressable></View>
      </View>
    </ScrollView></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(3,6,10,.78)", justifyContent: "flex-end", padding: 12 },
  sheet: { height: "88%", maxHeight: "88%", borderRadius: 22, borderWidth: 1, padding: 18 },
  frameSheet: { maxHeight: "94%", borderRadius: 22, borderWidth: 1 },
  frameSheetContent: { padding: 18, alignItems: "center" },
  frameContent: { width: "100%", alignItems: "center" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  title: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 },
  subtitle: { marginTop: 3, fontSize: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, height: 42 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginVertical: 12 },
  filter: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
  row: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 7 },
  rowTitle: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, justifyContent: "center", alignItems: "center" },
  sourceList: { flex: 1, minHeight: 0 },
  empty: { textAlign: "center", padding: 28 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14, justifyContent: "flex-end" },
  action: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11 },
  frame: { overflow: "hidden", borderWidth: 2, borderRadius: 14, backgroundColor: "#080B10" },
  zoomRow: { flexDirection: "row", alignItems: "center", gap: 13, marginTop: 14 },
  nudgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  nudgeButton: { width: 38, height: 34, alignItems: "center", justifyContent: "center" },
});
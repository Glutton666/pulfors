import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import type { PracticeEntry } from "@/lib/storage";
import {
  loadPracticeBook,
  savePracticeBook,
  createPracticeEntry,
} from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";

interface PracticeBookModalProps {
  visible: boolean;
  onClose: () => void;
  onLoad: (entry: PracticeEntry) => void;
  currentConfig: Omit<PracticeEntry, "id" | "label" | "createdAt"> | null;
}

const BEAT_COLORS: Record<BeatType, string> = {
  accent: "#D4A846",
  normal: "#8B949E",
  mute: "#30363D",
  strong: "#F0883E",
};

function formatDate(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${h}:${min}`;
}

function BeatPreview({ beatTypes, size = 10 }: { beatTypes: BeatType[]; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {beatTypes.map((t, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: BEAT_COLORS[t] || Colors.textSecondary,
          }}
        />
      ))}
    </View>
  );
}

export function PracticeBookModal({
  visible,
  onClose,
  onLoad,
  currentConfig,
}: PracticeBookModalProps) {
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const [entries, setEntries] = useState<PracticeEntry[]>([]);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const saveInputRef = useRef<TextInput>(null);
  const editInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      loadPracticeBook().then(setEntries);
      setShowSaveInput(false);
      setEditingId(null);
    }
  }, [visible]);

  const handleSave = useCallback(async () => {
    if (!currentConfig || !saveLabel.trim()) return;
    const entry = createPracticeEntry(saveLabel.trim(), currentConfig);
    const updated = [entry, ...entries];
    setEntries(updated);
    await savePracticeBook(updated);
    setSaveLabel("");
    setShowSaveInput(false);
  }, [currentConfig, saveLabel, entries]);

  const handleDelete = useCallback(
    (id: string) => {
      const doDelete = async () => {
        const updated = entries.filter((e) => e.id !== id);
        setEntries(updated);
        await savePracticeBook(updated);
      };
      if (Platform.OS === "web") {
        doDelete();
      } else {
        Alert.alert("삭제", "이 연습 설정을 삭제하시겠습니까?", [
          { text: "취소", style: "cancel" },
          { text: "삭제", style: "destructive", onPress: doDelete },
        ]);
      }
    },
    [entries]
  );

  const handleRename = useCallback(
    async (id: string) => {
      if (!editLabel.trim()) {
        setEditingId(null);
        return;
      }
      const updated = entries.map((e) =>
        e.id === id ? { ...e, label: editLabel.trim() } : e
      );
      setEntries(updated);
      await savePracticeBook(updated);
      setEditingId(null);
    },
    [entries, editLabel]
  );

  const handleLoad = useCallback(
    (entry: PracticeEntry) => {
      onLoad(entry);
      onClose();
    },
    [onLoad, onClose]
  );

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const renderItem = ({ item }: { item: PracticeEntry }) => {
    const isEditing = editingId === item.id;
    const barCount = item.beatsPerMeasure;
    const secondsPerBeat = 60 / item.bpm;
    const onePlaySeconds = barCount * secondsPerBeat;

    const formatTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      if (m > 0) return `${m}분 ${s}초`;
      return `${s}초`;
    };

    const clockMode = item.barClockMode || "stopwatch";
    const timerDur = item.barTimerDuration;
    let playModeText: string;
    if (clockMode === "timer" && timerDur != null && timerDur > 0) {
      const tm = Math.floor(timerDur / 60);
      const ts = timerDur % 60;
      playModeText = tm > 0 ? `${tm}:${String(ts).padStart(2, "0")}` : `${ts}초`;
    } else if (item.barLoopMode === "loop") {
      playModeText = "연속재생";
    } else {
      playModeText = "1회재생";
    }

    return (
      <View style={styles.entryCard}>
        <Pressable
          style={styles.entryMain}
          onPress={() => handleLoad(item)}
        >
          <View style={styles.entryHeader}>
            {isEditing ? (
              <TextInput
                ref={editInputRef}
                style={[styles.editInput, { borderColor: C.accent }]}
                value={editLabel}
                onChangeText={setEditLabel}
                onSubmitEditing={() => handleRename(item.id)}
                onBlur={() => handleRename(item.id)}
                autoFocus
                selectTextOnFocus
              />
            ) : (
              <Text style={styles.entryLabel} numberOfLines={1}>
                {item.label}
              </Text>
            )}
            <Text style={styles.entryDate}>{formatDate(item.createdAt)}</Text>
          </View>

          <View style={styles.entryDetails}>
            <View style={styles.detailChip}>
              <Text style={[styles.detailValue, { color: C.accent }]}>
                {item.bpm}
              </Text>
              <Text style={styles.detailUnit}>BPM</Text>
            </View>
            <View style={styles.detailChip}>
              <Text style={[styles.detailValue, { color: C.accent }]}>
                {barCount}
              </Text>
              <Text style={styles.detailUnit}>Bar</Text>
            </View>
            <View style={styles.detailChip}>
              <Ionicons
                name={clockMode === "timer" ? "timer-outline" : "infinite"}
                size={12}
                color={Colors.textSecondary}
              />
              <Text style={styles.detailUnit}>{playModeText}</Text>
            </View>
            <View style={styles.detailChip}>
              <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.detailUnit}>{formatTime(onePlaySeconds)}</Text>
            </View>
          </View>

          <BeatPreview beatTypes={item.beatTypes} />
        </Pressable>

        <View style={styles.entryActions}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              setEditingId(item.id);
              setEditLabel(item.label);
            }}
            hitSlop={6}
          >
            <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => handleDelete(item.id)}
            hitSlop={6}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: (insets.top || webTopInset) + 8,
            paddingBottom: (insets.bottom || webBottomInset) + 8,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons
              name="notebook-outline"
              size={22}
              color={C.accent}
            />
            <Text style={styles.title}>Practice Note</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {currentConfig && (
          <View style={styles.saveSection}>
            {showSaveInput ? (
              <View style={styles.saveInputRow}>
                <TextInput
                  ref={saveInputRef}
                  style={[styles.saveInput, { borderColor: C.accent }]}
                  value={saveLabel}
                  onChangeText={setSaveLabel}
                  placeholder="이름을 입력하세요"
                  placeholderTextColor={Colors.textTertiary}
                  onSubmitEditing={handleSave}
                  autoFocus
                />
                <Pressable
                  style={[
                    styles.saveConfirmBtn,
                    { backgroundColor: C.accent },
                    !saveLabel.trim() && { opacity: 0.4 },
                  ]}
                  onPress={handleSave}
                  disabled={!saveLabel.trim()}
                >
                  <Text style={styles.saveConfirmText}>저장</Text>
                </Pressable>
                <Pressable
                  style={styles.saveCancelBtn}
                  onPress={() => {
                    setShowSaveInput(false);
                    setSaveLabel("");
                  }}
                >
                  <Text style={styles.saveCancelText}>취소</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.saveButton, { borderColor: C.accent }]}
                onPress={() => setShowSaveInput(true)}
              >
                <Ionicons name="add-circle-outline" size={18} color={C.accent} />
                <Text style={[styles.saveButtonText, { color: C.accent }]}>
                  현재 바 설정 저장
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="notebook-outline"
              size={48}
              color={Colors.textTertiary}
            />
            <Text style={styles.emptyText}>저장된 연습 설정이 없습니다</Text>
            <Text style={styles.emptySubtext}>
              바 모드에서 설정을 구성한 후 저장하세요
            </Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            scrollEnabled={!!entries.length}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  saveSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  saveButtonText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  saveInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  saveInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  saveConfirmBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  saveConfirmText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
  saveCancelBtn: {
    height: 40,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  saveCancelText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  entryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    flexDirection: "row",
    overflow: "hidden",
  },
  entryMain: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  entryLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  entryDate: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
  },
  editInput: {
    flex: 1,
    height: 30,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.surfaceLight,
    marginRight: 8,
  },
  entryDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  detailValue: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
  },
  detailUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  entryActions: {
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  emptySubtext: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: "center",
  },
});

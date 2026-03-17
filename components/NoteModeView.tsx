import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PracticeEntry } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";
import { moderateScale } from "@/lib/scale";

interface NoteModeViewProps {
  queue: PracticeEntry[];
  barEntries: PracticeEntry[];
  playMode: "once" | "loop" | "random";
  currentIndex: number;
  isPlaying: boolean;
  onAddToQueue: (entry: PracticeEntry) => void;
  onRemoveFromQueue: (index: number) => void;
  onInsertNext: (entry: PracticeEntry) => void;
  onPlayModeChange: (mode: "once" | "loop" | "random") => void;
  onTogglePlay: () => void;
  onSave: () => void;
  onReset: () => void;
  onExitNoteMode: () => void;
}

const BEAT_COLORS: Record<BeatType, string> = {
  accent: "#D4A846",
  normal: "#8B949E",
  mute: "#30363D",
  strong: "#F0883E",
};

function BeatDots({ beatTypes, size = 6 }: { beatTypes: BeatType[]; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {beatTypes.slice(0, 12).map((bt, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: BEAT_COLORS[bt] || Colors.textSecondary,
          }}
        />
      ))}
      {beatTypes.length > 12 && (
        <Text style={{ fontSize: 8, color: Colors.textTertiary }}>+{beatTypes.length - 12}</Text>
      )}
    </View>
  );
}

function QueueItem({
  entry,
  index,
  isCurrent,
  accentColor,
  onRemove,
}: {
  entry: PracticeEntry;
  index: number;
  isCurrent: boolean;
  accentColor: string;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  return (
    <View style={[styles.queueItem, isCurrent && { borderColor: accentColor, borderWidth: 1.5, backgroundColor: "rgba(212,168,70,0.08)" }]}>
      <View style={styles.queueIndex}>
        {isCurrent ? (
          <Ionicons name="play" size={12} color={accentColor} />
        ) : (
          <Text style={[styles.queueIndexText, isCurrent && { color: accentColor }]}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.queueItemInfo}>
        <Text style={[styles.queueItemLabel, isCurrent && { color: accentColor }]} numberOfLines={1}>
          {entry.label}
        </Text>
        <View style={styles.queueItemMeta}>
          <Text style={styles.queueItemBpm}>{entry.bpm} BPM</Text>
          <BeatDots beatTypes={entry.beatTypes} />
        </View>
      </View>
      <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
        <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
      </Pressable>
    </View>
  );
}

function SourceItem({
  entry,
  accentColor,
  onAdd,
  onInsertNext,
  isPlaying,
}: {
  entry: PracticeEntry;
  accentColor: string;
  onAdd: () => void;
  onInsertNext: () => void;
  isPlaying: boolean;
}) {
  const { t } = useLanguage();
  return (
    <View style={styles.sourceItem}>
      <Pressable
        style={({ pressed }) => [styles.sourceItemContent, pressed && { opacity: 0.6 }]}
        onPress={onAdd}
      >
        <View style={styles.sourceItemInfo}>
          <Text style={styles.sourceItemLabel} numberOfLines={1}>{entry.label}</Text>
          <View style={styles.sourceItemMeta}>
            <Text style={styles.sourceItemBpm}>{entry.bpm} BPM</Text>
            <Text style={styles.sourceItemBeats}>{entry.beatsPerMeasure} bars</Text>
          </View>
        </View>
        <Ionicons name="add-circle-outline" size={22} color={accentColor} />
      </Pressable>
      {isPlaying && (
        <Pressable
          onPress={onInsertNext}
          hitSlop={6}
          style={[styles.insertNextBtn, { borderColor: accentColor }]}
        >
          <Ionicons name="arrow-forward" size={12} color={accentColor} />
          <Text style={[styles.insertNextText, { color: accentColor }]}>{t("noteMode", "insertNext")}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function NoteModeView({
  queue,
  barEntries,
  playMode,
  currentIndex,
  isPlaying,
  onAddToQueue,
  onRemoveFromQueue,
  onInsertNext,
  onPlayModeChange,
  onTogglePlay,
  onSave,
  onReset,
  onExitNoteMode,
}: NoteModeViewProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();

  const playModes: Array<"once" | "loop" | "random"> = ["once", "loop", "random"];
  const playModeLabels = {
    once: t("noteMode", "playModeOnce"),
    loop: t("noteMode", "playModeLoop"),
    random: t("noteMode", "playModeRandom"),
  };
  const playModeIcons: Record<string, string> = {
    once: "play-forward",
    loop: "repeat",
    random: "shuffle",
  };

  const handleReset = useCallback(() => {
    if (Platform.OS === "web") {
      onReset();
    } else {
      Alert.alert(t("noteMode", "reset"), t("noteMode", "resetConfirm"), [
        { text: t("main", "cancel"), style: "cancel" },
        { text: t("noteMode", "reset"), style: "destructive", onPress: onReset },
      ]);
    }
  }, [onReset, t]);

  const currentEntry = queue[currentIndex];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onExitNoteMode} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
        </Pressable>
        <Text style={[styles.title, { color: C.accent }]}>{t("noteMode", "title")}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={onSave} hitSlop={6} style={[styles.headerBtn, { borderColor: C.accent }]}>
            <Ionicons name="save-outline" size={16} color={C.accent} />
          </Pressable>
          <Pressable onPress={handleReset} hitSlop={6} style={[styles.headerBtn, { borderColor: Colors.danger }]}>
            <Ionicons name="refresh" size={16} color={Colors.danger} />
          </Pressable>
        </View>
      </View>

      {isPlaying && currentEntry && (
        <View style={[styles.nowPlaying, { borderColor: C.accent }]}>
          <MaterialCommunityIcons name="music-note" size={16} color={C.accent} />
          <Text style={[styles.nowPlayingLabel, { color: C.accent }]} numberOfLines={1}>
            {currentEntry.label}
          </Text>
          <Text style={styles.nowPlayingBpm}>{currentEntry.bpm} BPM</Text>
        </View>
      )}

      <View style={styles.playControls}>
        <View style={styles.playModeRow}>
          {playModes.map((mode) => (
            <Pressable
              key={mode}
              style={[
                styles.playModeBtn,
                playMode === mode && { backgroundColor: C.accent + "22", borderColor: C.accent },
              ]}
              onPress={() => onPlayModeChange(mode)}
            >
              <Ionicons
                name={playModeIcons[mode] as any}
                size={14}
                color={playMode === mode ? C.accent : Colors.textTertiary}
              />
              <Text
                style={[
                  styles.playModeText,
                  playMode === mode && { color: C.accent },
                ]}
              >
                {playModeLabels[mode]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[
            styles.playButton,
            { backgroundColor: isPlaying ? Colors.danger : C.accent },
            queue.length === 0 && { opacity: 0.4 },
          ]}
          onPress={onTogglePlay}
          disabled={queue.length === 0}
        >
          <Ionicons name={isPlaying ? "stop" : "play"} size={28} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("noteMode", "queue")}</Text>
        <Text style={styles.sectionCount}>{queue.length} {t("noteMode", "items")}</Text>
      </View>

      <View style={styles.queueContainer}>
        {queue.length === 0 ? (
          <View style={styles.emptyQueue}>
            <Ionicons name="musical-notes-outline" size={32} color={Colors.textTertiary} />
            <Text style={styles.emptyQueueText}>{t("noteMode", "emptyQueue")}</Text>
          </View>
        ) : (
          <FlatList
            data={queue}
            keyExtractor={(_, i) => `queue-${i}`}
            renderItem={({ item, index }) => (
              <QueueItem
                entry={item}
                index={index}
                isCurrent={isPlaying && index === currentIndex}
                accentColor={C.accent}
                onRemove={() => onRemoveFromQueue(index)}
              />
            )}
            showsVerticalScrollIndicator={false}
            scrollEnabled={queue.length > 0}
          />
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("noteMode", "source")}</Text>
      </View>

      <View style={styles.sourceContainer}>
        {barEntries.length === 0 ? (
          <View style={styles.emptySource}>
            <Text style={styles.emptySourceText}>{t("noteMode", "noBarEntries")}</Text>
          </View>
        ) : (
          <FlatList
            data={barEntries}
            keyExtractor={(item) => `source-${item.id}`}
            renderItem={({ item }) => (
              <SourceItem
                entry={item}
                accentColor={C.accent}
                onAdd={() => onAddToQueue(item)}
                onInsertNext={() => onInsertNext(item)}
                isPlaying={isPlaying}
              />
            )}
            showsVerticalScrollIndicator={false}
            scrollEnabled={barEntries.length > 0}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: moderateScale(18, 0.3),
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  nowPlaying: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    marginBottom: 10,
  },
  nowPlayingLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    flex: 1,
  },
  nowPlayingBpm: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  playControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  playModeRow: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
  },
  playModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  playModeText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: Colors.textTertiary,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionCount: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
  },
  queueContainer: {
    flex: 1,
    minHeight: 80,
    marginBottom: 10,
  },
  emptyQueue: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  emptyQueueText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: "center",
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  queueIndex: {
    width: 22,
    alignItems: "center",
  },
  queueIndexText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.textTertiary,
  },
  queueItemInfo: {
    flex: 1,
    gap: 3,
  },
  queueItemLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  queueItemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  queueItemBpm: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  removeBtn: {
    padding: 2,
  },
  sourceContainer: {
    flex: 1,
    minHeight: 80,
  },
  emptySource: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  emptySourceText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textTertiary,
  },
  sourceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 5,
  },
  sourceItemContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sourceItemInfo: {
    flex: 1,
    gap: 2,
  },
  sourceItemLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  sourceItemMeta: {
    flexDirection: "row",
    gap: 8,
  },
  sourceItemBpm: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  sourceItemBeats: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
  },
  insertNextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  insertNextText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
  },
});

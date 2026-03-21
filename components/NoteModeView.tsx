import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  Platform,
  Image,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
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
  onReorderQueue: (fromIndex: number, toIndex: number) => void;
  onInsertNext: (entry: PracticeEntry) => void;
  onPlayModeChange: (mode: "once" | "loop" | "random") => void;
  onTogglePlay: () => void;
  onSave: () => void;
  onReset: () => void;
  onExitNoteMode: () => void;
  onQueueItemImageChange?: (index: number, imageUri: string | undefined) => void;
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
  isFirst,
  isLast,
  accentColor,
  onRemove,
  onMoveUp,
  onMoveDown,
  onImageChange,
}: {
  entry: PracticeEntry;
  index: number;
  isCurrent: boolean;
  isFirst: boolean;
  isLast: boolean;
  accentColor: string;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onImageChange?: (imageUri: string | undefined) => void;
}) {
  const { t } = useLanguage();

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      onImageChange?.(result.assets[0].uri);
    }
  }, [onImageChange]);

  return (
    <View style={[styles.queueItem, isCurrent && { borderColor: accentColor, borderWidth: 1.5, backgroundColor: "rgba(212,168,70,0.08)" }]}>
      <View style={styles.reorderBtns}>
        <Pressable onPress={onMoveUp} hitSlop={4} disabled={isFirst} style={{ opacity: isFirst ? 0.25 : 1 }}>
          <Ionicons name="chevron-up" size={14} color={Colors.textTertiary} />
        </Pressable>
        <Pressable onPress={onMoveDown} hitSlop={4} disabled={isLast} style={{ opacity: isLast ? 0.25 : 1 }}>
          <Ionicons name="chevron-down" size={14} color={Colors.textTertiary} />
        </Pressable>
      </View>
      <View style={styles.queueIndex}>
        {isCurrent ? (
          <Ionicons name="play" size={12} color={accentColor} />
        ) : (
          <Text style={[styles.queueIndexText, isCurrent && { color: accentColor }]}>{index + 1}</Text>
        )}
      </View>
      <Pressable onPress={handlePickImage} style={styles.queueThumb}>
        {entry.imageUri ? (
          <Image source={{ uri: entry.imageUri }} style={styles.queueThumbImg} />
        ) : (
          <Ionicons name="image-outline" size={16} color={Colors.textTertiary} />
        )}
      </Pressable>
      <View style={styles.queueItemInfo}>
        <Text style={[styles.queueItemLabel, isCurrent && { color: accentColor }]} numberOfLines={1}>
          {entry.label}
        </Text>
        <View style={styles.queueItemMeta}>
          <Text style={styles.queueItemBpm}>{entry.bpm} BPM</Text>
          <BeatDots beatTypes={entry.beatTypes} />
        </View>
      </View>
      {entry.imageUri && (
        <Pressable onPress={() => onImageChange?.(undefined)} hitSlop={6} style={{ padding: 2 }}>
          <Ionicons name="image" size={14} color={accentColor} />
        </Pressable>
      )}
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
            <Text style={styles.sourceItemBeats}>{entry.beatsPerMeasure} {t("practiceBook", "beatsUnit")}</Text>
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

function SourceGridItem({
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
    <Pressable
      style={({ pressed }) => [srcGridStyles.card, pressed && { opacity: 0.6 }]}
      onPress={onAdd}
    >
      <Text style={srcGridStyles.cardLabel} numberOfLines={1}>{entry.label}</Text>
      <View style={srcGridStyles.cardStats}>
        <Text style={[srcGridStyles.cardBpm, { color: accentColor }]}>{entry.bpm}</Text>
        <Text style={srcGridStyles.cardUnit}>BPM</Text>
      </View>
      <Text style={srcGridStyles.cardBeats}>{entry.beatsPerMeasure} {t("practiceBook", "beatsUnit")}</Text>
      {isPlaying && (
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); onInsertNext(); }}
          hitSlop={4}
          style={[srcGridStyles.insertBtn, { borderColor: accentColor }]}
        >
          <Ionicons name="arrow-forward" size={10} color={accentColor} />
          <Text style={[srcGridStyles.insertText, { color: accentColor }]}>{t("noteMode", "insertNext")}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const NOTE_SOURCE_VIEW_KEY = "@note_source_view_mode";

export function NoteModeView({
  queue,
  barEntries,
  playMode,
  currentIndex,
  isPlaying,
  onAddToQueue,
  onRemoveFromQueue,
  onReorderQueue,
  onInsertNext,
  onPlayModeChange,
  onTogglePlay,
  onSave,
  onReset,
  onExitNoteMode,
  onQueueItemImageChange,
}: NoteModeViewProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const [sourceViewMode, setSourceViewMode] = useState<"list" | "grid">("list");
  const [sourceCollapsed, setSourceCollapsed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTE_SOURCE_VIEW_KEY).then(v => {
      if (v === "grid" || v === "list") setSourceViewMode(v);
    });
  }, []);

  const toggleSourceView = useCallback(() => {
    setSourceViewMode(prev => {
      const next = prev === "list" ? "grid" : "list";
      AsyncStorage.setItem(NOTE_SOURCE_VIEW_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (isPlaying) setSourceCollapsed(true);
    else setSourceCollapsed(false);
  }, [isPlaying]);

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
  const prevEntry = currentIndex > 0 ? queue[currentIndex - 1] : (playMode === "loop" && queue.length > 0 ? queue[queue.length - 1] : null);
  const nextEntry = currentIndex < queue.length - 1 ? queue[currentIndex + 1] : (playMode === "loop" && queue.length > 0 ? queue[0] : null);

  const renderPlayingStrip = () => (
    <View style={[styles.playingStrip, isLandscape && { flexDirection: "column" as const }]}>
      <View style={[styles.stripItem, styles.stripItemDim]}>
        {prevEntry ? (
          <>
            {prevEntry.imageUri ? (
              <Image source={{ uri: prevEntry.imageUri }} style={styles.stripThumb} />
            ) : (
              <View style={[styles.stripThumb, styles.stripThumbEmpty]}>
                <Ionicons name="musical-note" size={10} color={Colors.textTertiary} />
              </View>
            )}
            <Text style={styles.stripLabel} numberOfLines={1}>{prevEntry.label}</Text>
          </>
        ) : <View style={{ flex: 1 }} />}
      </View>
      <View style={[styles.stripItem, styles.stripItemActive, { borderColor: C.accent }]}>
        {currentEntry?.imageUri ? (
          <Image source={{ uri: currentEntry.imageUri }} style={styles.stripThumb} />
        ) : (
          <View style={[styles.stripThumb, styles.stripThumbEmpty, { borderColor: C.accent }]}>
            <Ionicons name="play" size={10} color={C.accent} />
          </View>
        )}
        <Text style={[styles.stripLabel, { color: C.accent, fontFamily: "SpaceGrotesk_600SemiBold" }]} numberOfLines={1}>{currentEntry?.label}</Text>
      </View>
      <View style={[styles.stripItem, styles.stripItemDim]}>
        {nextEntry ? (
          <>
            {nextEntry.imageUri ? (
              <Image source={{ uri: nextEntry.imageUri }} style={styles.stripThumb} />
            ) : (
              <View style={[styles.stripThumb, styles.stripThumbEmpty]}>
                <Ionicons name="musical-note" size={10} color={Colors.textTertiary} />
              </View>
            )}
            <Text style={styles.stripLabel} numberOfLines={1}>{nextEntry.label}</Text>
          </>
        ) : <View style={{ flex: 1 }} />}
      </View>
    </View>
  );

  if (isPlaying && queue.length > 0) {
    if (isLandscape) {
      return (
        <View style={[styles.container, { flexDirection: "row" as const }]}>
          <View style={styles.landscapePlayingLeft}>
            <View style={styles.playingImageArea}>
              {currentEntry?.imageUri ? (
                <Image source={{ uri: currentEntry.imageUri }} style={styles.playingImage} resizeMode="contain" />
              ) : (
                <View style={styles.playingImagePlaceholder}>
                  <Ionicons name="musical-notes" size={36} color={Colors.textTertiary} />
                  <Text style={[styles.playingImagePlaceholderText, { fontSize: 14 }]}>{currentEntry?.label}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.landscapePlayingRight}>
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 8, marginBottom: 6 }}>
              <View style={[styles.progressBadge, { backgroundColor: C.accent + "22" }]}>
                <Text style={[styles.progressText, { color: C.accent }]}>{currentIndex + 1}/{queue.length}</Text>
              </View>
              <Pressable
                style={[styles.playButton, { backgroundColor: Colors.danger, width: 36, height: 36, borderRadius: 18 }]}
                onPress={onTogglePlay}
              >
                <Ionicons name="stop" size={20} color="#fff" />
              </Pressable>
            </View>
            {renderPlayingStrip()}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onExitNoteMode} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
          </Pressable>
          <Text style={[styles.title, { color: C.accent }]}>{t("noteMode", "title")}</Text>
          <View style={[styles.progressBadge, { backgroundColor: C.accent + "22" }]}>
            <Text style={[styles.progressText, { color: C.accent }]}>{currentIndex + 1}/{queue.length}</Text>
          </View>
        </View>

        <View style={styles.playingImageArea}>
          {currentEntry?.imageUri ? (
            <Image source={{ uri: currentEntry.imageUri }} style={styles.playingImage} resizeMode="contain" />
          ) : (
            <View style={styles.playingImagePlaceholder}>
              <Ionicons name="musical-notes" size={48} color={Colors.textTertiary} />
              <Text style={styles.playingImagePlaceholderText}>{currentEntry?.label}</Text>
            </View>
          )}
        </View>

        <View style={styles.playingStripContainer}>
          {renderPlayingStrip()}
          <Pressable
            style={[styles.playButton, { backgroundColor: Colors.danger }]}
            onPress={onTogglePlay}
          >
            <Ionicons name="stop" size={28} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  const renderQueueSection = () => (
    <>
      <View style={[styles.sectionHeader, isLandscape && { marginBottom: 4 }]}>
        <Text style={styles.sectionTitle}>{t("noteMode", "queue")}</Text>
        <Text style={styles.sectionCount}>{queue.length} {t("noteMode", "items")}</Text>
      </View>
      <View style={[styles.queueContainer, !isLandscape && sourceCollapsed && { flex: 2 }]}>
        {queue.length === 0 ? (
          <View style={styles.emptyQueue}>
            <Ionicons name="musical-notes-outline" size={isLandscape ? 24 : 32} color={Colors.textTertiary} />
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
                isFirst={index === 0}
                isLast={index === queue.length - 1}
                accentColor={C.accent}
                onRemove={() => onRemoveFromQueue(index)}
                onMoveUp={() => onReorderQueue(index, index - 1)}
                onMoveDown={() => onReorderQueue(index, index + 1)}
                onImageChange={(uri) => onQueueItemImageChange?.(index, uri)}
              />
            )}
            showsVerticalScrollIndicator={false}
            scrollEnabled={queue.length > 0}
          />
        )}
      </View>
    </>
  );

  const renderSourceSection = () => (
    <>
      <Pressable
        style={[styles.sectionHeader, isLandscape && { marginBottom: 4 }]}
        onPress={() => setSourceCollapsed(prev => !prev)}
      >
        <View style={styles.sectionHeaderLeft}>
          <Ionicons
            name={sourceCollapsed ? "chevron-forward" : "chevron-down"}
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={styles.sectionTitle}>{t("noteMode", "source")}</Text>
          {sourceCollapsed && barEntries.length > 0 && (
            <Text style={styles.sectionCount}>{barEntries.length}</Text>
          )}
        </View>
        {!sourceCollapsed && (
          <Pressable
            onPress={toggleSourceView}
            hitSlop={6}
            style={styles.sourceViewToggle}
          >
            <Ionicons
              name={sourceViewMode === "grid" ? "grid" : "list"}
              size={14}
              color={C.accent}
            />
          </Pressable>
        )}
      </Pressable>
      {!sourceCollapsed && (
        <View style={[styles.sourceContainer, isLandscape && { flex: 1 }]}>
          {barEntries.length === 0 ? (
            <View style={styles.emptySource}>
              <Text style={styles.emptySourceText}>{t("noteMode", "noBarEntries")}</Text>
            </View>
          ) : (
            <FlatList
              key="src-list-ls"
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
      )}
    </>
  );

  const renderPlayControls = () => (
    <View style={[styles.playControls, isLandscape && { marginBottom: 6 }]}>
      <View style={styles.playModeRow}>
        {playModes.map((mode) => (
          <Pressable
            key={mode}
            style={[
              styles.playModeBtn,
              playMode === mode && { backgroundColor: C.accent + "22", borderColor: C.accent },
              isLandscape && { paddingHorizontal: 6, paddingVertical: 4 },
            ]}
            onPress={() => onPlayModeChange(mode)}
          >
            <Ionicons
              name={playModeIcons[mode] as any}
              size={isLandscape ? 12 : 14}
              color={playMode === mode ? C.accent : Colors.textTertiary}
            />
            <Text
              style={[
                styles.playModeText,
                playMode === mode && { color: C.accent },
                isLandscape && { fontSize: 9 },
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
          isLandscape && { width: 36, height: 36, borderRadius: 18 },
        ]}
        onPress={onTogglePlay}
        disabled={queue.length === 0}
      >
        <Ionicons name={isPlaying ? "stop" : "play"} size={isLandscape ? 20 : 28} color="#fff" />
      </Pressable>
    </View>
  );

  if (isLandscape) {
    return (
      <View style={[styles.container, { flexDirection: "row" as const, gap: 12 }]}>
        <View style={{ flex: 2 }}>
          <View style={[styles.header, { marginBottom: 4 }]}>
            <Pressable onPress={onExitNoteMode} hitSlop={8}>
              <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
            </Pressable>
            <Text style={[styles.title, { color: C.accent, fontSize: 14 }]}>{t("noteMode", "title")}</Text>
            <View style={[styles.headerActions, { gap: 6 }]}>
              <Pressable onPress={onSave} hitSlop={6} style={[styles.headerBtn, { borderColor: C.accent, width: 28, height: 28 }]}>
                <Ionicons name="save-outline" size={13} color={C.accent} />
              </Pressable>
              <Pressable onPress={handleReset} hitSlop={6} style={[styles.headerBtn, { borderColor: Colors.danger, width: 28, height: 28 }]}>
                <Ionicons name="refresh" size={13} color={Colors.danger} />
              </Pressable>
            </View>
          </View>
          {renderQueueSection()}
        </View>
        <View style={styles.landscapeRightPanel}>
          {renderPlayControls()}
          {renderSourceSection()}
        </View>
      </View>
    );
  }

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

      {renderPlayControls()}

      {renderQueueSection()}

      {renderSourceSection()}
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
    marginBottom: 8,
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
  progressBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  progressText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
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
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  sourceViewToggle: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  queueContainer: {
    flex: 1,
    minHeight: 60,
    marginBottom: 6,
  },
  emptyQueue: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
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
  reorderBtns: {
    alignItems: "center",
    gap: 0,
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
  queueThumb: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  queueThumbImg: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  playingImageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  playingImage: {
    width: "100%",
    height: "100%",
  },
  playingImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  playingImagePlaceholderText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: Colors.textTertiary,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  playingStripContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  playingStrip: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
  },
  stripItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stripItemActive: {
    borderWidth: 1.5,
    backgroundColor: "rgba(212,168,70,0.08)",
  },
  stripItemDim: {
    opacity: 0.5,
  },
  stripThumb: {
    width: 24,
    height: 24,
    borderRadius: 4,
    overflow: "hidden",
  },
  stripThumbEmpty: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stripLabel: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  landscapePlayingLeft: {
    flex: 2,
    marginRight: 10,
  },
  landscapePlayingRight: {
    flex: 1,
    justifyContent: "center",
  },
  landscapeRightPanel: {
    flex: 1,
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

const srcGridStyles = StyleSheet.create({
  row: {
    gap: 8,
    marginBottom: 8,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    gap: 4,
  },
  cardLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.text,
  },
  cardStats: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  cardBpm: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
  },
  cardUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  cardBeats: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textTertiary,
  },
  insertBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 2,
  },
  insertText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
  },
});

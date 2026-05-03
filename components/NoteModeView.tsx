import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PracticeEntry } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";
import { useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";

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
  onSave: () => Promise<boolean>;
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
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
  return (
    <View style={{ flexDirection: "row", gap: S.ms(2, 0.3) }}>
      {beatTypes.slice(0, 12).map((bt, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: BEAT_COLORS[bt] || C.textSecondary,
          }}
        />
      ))}
      {beatTypes.length > 12 && (
        <Text style={{ fontSize: S.ms(8, 0.3), color: C.textTertiary }}>+{beatTypes.length - 12}</Text>
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
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
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
    <View style={[styles.queueItem, { borderColor: C.border, backgroundColor: C.surfaceLight }, isCurrent && { borderColor: accentColor, borderWidth: 1.5, backgroundColor: "rgba(212,168,70,0.08)" }]}>
      <View style={styles.reorderBtns}>
        <Pressable onPress={onMoveUp} hitSlop={8} disabled={isFirst} style={{ opacity: isFirst ? 0.25 : 1 }}>
          <Ionicons name="chevron-up" size={S.ms(14, 0.4)} color={C.textTertiary} />
        </Pressable>
        <Pressable onPress={onMoveDown} hitSlop={8} disabled={isLast} style={{ opacity: isLast ? 0.25 : 1 }}>
          <Ionicons name="chevron-down" size={S.ms(14, 0.4)} color={C.textTertiary} />
        </Pressable>
      </View>
      <View style={styles.queueIndex}>
        {isCurrent ? (
          <Ionicons name="play" size={S.ms(12, 0.4)} color={accentColor} />
        ) : (
          <Text style={[styles.queueIndexText, isCurrent && { color: accentColor }]}>{index + 1}</Text>
        )}
      </View>
      <Pressable onPress={handlePickImage} style={styles.queueThumb}>
        {entry.imageUri ? (
          <Image source={{ uri: entry.imageUri }} style={styles.queueThumbImg} />
        ) : (
          <Ionicons name="image-outline" size={S.ms(16, 0.4)} color={C.textTertiary} />
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
        <Pressable onPress={() => onImageChange?.(undefined)} hitSlop={8} style={{ padding: Spacing.xxs }}>
          <Ionicons name="image" size={S.ms(14, 0.4)} color={accentColor} />
        </Pressable>
      )}
      <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
        <Ionicons name="close-circle" size={S.ms(18, 0.4)} color={C.textTertiary} />
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
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
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
        <Ionicons name="add-circle-outline" size={S.ms(22, 0.4)} color={accentColor} />
      </Pressable>
      {isPlaying && (
        <Pressable
          onPress={onInsertNext}
          hitSlop={8}
          style={[styles.insertNextBtn, { borderColor: accentColor }]}
        >
          <Ionicons name="arrow-forward" size={S.ms(12, 0.4)} color={accentColor} />
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
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
  const { t } = useLanguage();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const [saved, setSaved] = useState(false);

  const handleSaveWithFeedback = useCallback(async () => {
    const ok = await onSave();
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }, [onSave]);
  const [sourceCollapsed, setSourceCollapsed] = useState(false);

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
                <Ionicons name="musical-note" size={S.ms(10, 0.4)} color={C.textTertiary} />
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
            <Ionicons name="play" size={S.ms(10, 0.4)} color={C.accent} />
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
                <Ionicons name="musical-note" size={S.ms(10, 0.4)} color={C.textTertiary} />
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
                  <Ionicons name="musical-notes" size={S.ms(36, 0.4)} color={C.textTertiary} />
                  <Text style={[styles.playingImagePlaceholderText, { fontSize: S.ms(14, 0.3) }]}>{currentEntry?.label}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.landscapePlayingRight}>
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: S.ms(8, 0.3), marginBottom: S.ms(6, 0.3) }}>
              <View style={[styles.progressBadge, { backgroundColor: C.accent + "22" }]}>
                <Text style={[styles.progressText, { color: C.accent }]}>{currentIndex + 1}/{queue.length}</Text>
              </View>
              <Pressable
                style={[styles.playButton, { backgroundColor: C.danger, width: S.ms(36, 0.4), height: S.ms(36, 0.4), borderRadius: S.ms(18, 0.4) }]}
                onPress={onTogglePlay}
              >
                <Ionicons name="stop" size={S.ms(20, 0.4)} color="#fff" />
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
          <View style={{ width: 22 }} />
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
              <Ionicons name="musical-notes" size={S.ms(48, 0.4)} color={C.textTertiary} />
              <Text style={styles.playingImagePlaceholderText}>{currentEntry?.label}</Text>
            </View>
          )}
        </View>

        <View style={styles.playingStripContainer}>
          {renderPlayingStrip()}
          <Pressable
            style={[styles.playButton, { backgroundColor: C.danger }]}
            onPress={onTogglePlay}
          >
            <Ionicons name="stop" size={S.ms(28, 0.4)} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  const renderQueueSection = () => (
    <>
      <View style={[styles.sectionHeader, isLandscape && { marginBottom: S.ms(2, 0.3) }]}>
        <Text style={[styles.sectionTitle, { color: C.text }, isLandscape && { fontSize: S.ms(11, 0.3) }]}>{t("noteMode", "queue")}</Text>
        <Text style={[styles.sectionCount, { color: C.textTertiary }, isLandscape && { fontSize: S.ms(10, 0.3) }]}>{queue.length} {t("noteMode", "items")}</Text>
      </View>
      <View style={[styles.queueContainer, !isLandscape && sourceCollapsed && { flex: 2 }, isLandscape && { marginBottom: 0 }]}>
        {queue.length === 0 ? (
          <View style={styles.emptyQueue}>
            <Ionicons name="musical-notes-outline" size={isLandscape ? 24 : 32} color={C.textTertiary} />
            <Text style={[styles.emptyQueueText, { color: C.textTertiary }]}>{t("noteMode", "emptyQueue")}</Text>
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
        style={[styles.sectionHeader, isLandscape && { marginBottom: Spacing.xxs }]}
        onPress={() => setSourceCollapsed(prev => !prev)}
      >
        <View style={styles.sectionHeaderLeft}>
          <Ionicons
            name={sourceCollapsed ? "chevron-forward" : "chevron-down"}
            size={S.ms(14, 0.4)}
            color={C.textSecondary}
          />
          <Text style={[styles.sectionTitle, { color: C.text }]}>{t("noteMode", "source")}</Text>
          {sourceCollapsed && barEntries.length > 0 && (
            <Text style={[styles.sectionCount, { color: C.textTertiary }]}>{barEntries.length}</Text>
          )}
        </View>
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
    <View style={[styles.playControls, isLandscape && { marginBottom: S.ms(4, 0.3) }]}>
      <View style={styles.playModeRow}>
        {playModes.map((mode) => (
          <Pressable
            key={mode}
            style={[
              styles.playModeBtn,
              playMode === mode && { backgroundColor: C.accent + "22", borderColor: C.accent },
              isLandscape && { paddingHorizontal: S.ms(6, 0.3), paddingVertical: S.ms(4, 0.3) },
            ]}
            onPress={() => onPlayModeChange(mode)}
          >
            <Ionicons
              name={playModeIcons[mode] as any}
              size={isLandscape ? 12 : 14}
              color={playMode === mode ? C.accent : C.textTertiary}
            />
            <Text
              style={[
                styles.playModeText,
                playMode === mode && { color: C.accent },
                isLandscape && { fontSize: S.ms(9, 0.3) },
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
          { backgroundColor: isPlaying ? C.danger : C.accent },
          queue.length === 0 && { opacity: 0.4 },
          isLandscape && { width: S.ms(60, 0.4), height: S.ms(30, 0.4), borderRadius: S.ms(8, 0.3) },
        ]}
        onPress={onTogglePlay}
        disabled={queue.length === 0}
      >
        <Ionicons name={isPlaying ? "stop" : "play"} size={isLandscape ? 24 : 28} color="#fff" />
      </Pressable>
    </View>
  );

  if (isLandscape) {
    return (
      <View style={[styles.container, { flexDirection: "row" as const, gap: S.ms(8, 0.3) }]}>
        <Pressable onPress={onExitNoteMode} hitSlop={8} style={{ position: "absolute" as const, top: S.ms(6, 0.3), right: S.ms(8, 0.3), zIndex: 10 }}>
          <Ionicons name="close" size={S.ms(22, 0.3)} color={C.textSecondary} />
        </Pressable>
        <View style={{ flex: 2 }}>
          <View style={[styles.header, { marginBottom: S.ms(2, 0.3), gap: S.ms(8, 0.3) }]}>
            <Text style={[styles.title, { color: C.accent, fontSize: S.ms(14, 0.3) }]}>{t("noteMode", "title")}</Text>
            <View style={[styles.headerActions, { gap: S.ms(6, 0.3) }]}>
              <Pressable onPress={handleSaveWithFeedback} hitSlop={8} style={[styles.headerBtn, { borderColor: saved ? "#4CAF50" : C.accent, backgroundColor: saved ? "#4CAF5020" : C.surface, width: S.ms(28, 0.4), height: S.ms(28, 0.4) }]}>
                <Ionicons name={saved ? "checkmark" : "save-outline"} size={S.ms(13, 0.3)} color={saved ? "#4CAF50" : C.accent} />
              </Pressable>
              <Pressable onPress={handleReset} hitSlop={8} style={[styles.headerBtn, { borderColor: C.danger, width: S.ms(28, 0.4), height: S.ms(28, 0.4) }]}>
                <Ionicons name="refresh" size={S.ms(13, 0.3)} color={C.danger} />
              </Pressable>
            </View>
          </View>
          {renderQueueSection()}
        </View>
        <View style={[styles.landscapeRightPanel, { justifyContent: "space-between" as const }]}>
          {renderSourceSection()}
          {renderPlayControls()}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onExitNoteMode} hitSlop={12} style={styles.closeButtonCenter}>
        <Ionicons name="close" size={S.ms(28, 0.4)} color={C.textSecondary} />
      </Pressable>

      <View style={styles.header}>
        <View style={{ width: 22 }} />
        <Text style={[styles.title, { color: C.accent }]}>{t("noteMode", "title")}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={handleSaveWithFeedback} hitSlop={8} style={[styles.headerBtn, { borderColor: saved ? "#4CAF50" : C.accent, backgroundColor: saved ? "#4CAF5020" : C.surface }]}>
            <Ionicons name={saved ? "checkmark" : "save-outline"} size={S.ms(16, 0.4)} color={saved ? "#4CAF50" : C.accent} />
          </Pressable>
          <Pressable onPress={handleReset} hitSlop={8} style={[styles.headerBtn, { borderColor: C.danger }]}>
            <Ionicons name="refresh" size={S.ms(16, 0.4)} color={C.danger} />
          </Pressable>
        </View>
      </View>

      {renderPlayControls()}

      {renderQueueSection()}

      {renderSourceSection()}
    </View>
  );
}

const make_styles = (C: typeof Colors, S: ScaleValues) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(12, 0.3),
    marginBottom: S.ms(4, 0.3),
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: S.ms(18, 0.3),
    color: C.text,
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: S.ms(8, 0.3),
  },
  closeButtonCenter: {
    alignSelf: "center",
    marginTop: S.ms(2, 0.3),
    marginBottom: S.ms(2, 0.3),
    padding: S.ms(6, 0.3),
  },
  headerBtn: {
    width: S.ms(32, 0.4),
    height: S.ms(32, 0.4),
    borderRadius: S.ms(8, 0.3),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
  },
  nowPlaying: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(8, 0.3),
    borderWidth: 1,
    borderRadius: S.ms(10, 0.3),
    paddingHorizontal: S.ms(12, 0.3),
    paddingVertical: S.ms(8, 0.3),
    backgroundColor: C.surface,
    marginBottom: S.ms(10, 0.3),
  },
  nowPlayingLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(14, 0.3),
    color: C.text,
    flex: 1,
  },
  nowPlayingBpm: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(12, 0.3),
    color: C.textSecondary,
  },
  progressBadge: {
    borderRadius: S.ms(6, 0.3),
    paddingHorizontal: S.ms(6, 0.3),
    paddingVertical: S.ms(2, 0.3),
  },
  progressText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(11, 0.3),
    color: C.text,
  },
  playControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(12, 0.3),
    marginBottom: S.ms(12, 0.3),
  },
  playModeRow: {
    flex: 1,
    flexDirection: "row",
    gap: S.ms(6, 0.3),
  },
  playModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(4, 0.3),
    paddingHorizontal: S.ms(10, 0.3),
    paddingVertical: S.ms(6, 0.3),
    borderRadius: S.ms(8, 0.3),
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  playModeText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(11, 0.3),
    color: C.textTertiary,
  },
  playButton: {
    width: S.ms(48, 0.4),
    height: S.ms(48, 0.4),
    borderRadius: S.ms(24, 0.4),
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: S.ms(6, 0.3),
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(4, 0.3),
  },
  sectionTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(13, 0.3),
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionCount: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(12, 0.3),
    color: C.textTertiary,
  },
  queueContainer: {
    flex: 1,
    minHeight: S.ms(60, 0.3),
    marginBottom: S.ms(6, 0.3),
  },
  emptyQueue: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: S.ms(6, 0.3),
    paddingVertical: S.ms(10, 0.3),
  },
  emptyQueueText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(13, 0.3),
    color: C.textTertiary,
    textAlign: "center",
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(10, 0.3),
    paddingHorizontal: S.ms(12, 0.3),
    paddingVertical: S.ms(10, 0.3),
    backgroundColor: C.surface,
    borderRadius: S.ms(10, 0.3),
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: S.ms(6, 0.3),
  },
  reorderBtns: {
    alignItems: "center",
    gap: 0,
  },
  queueIndex: {
    width: S.ms(22, 0.3),
    alignItems: "center",
  },
  queueIndexText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(13, 0.3),
    color: C.textTertiary,
  },
  queueItemInfo: {
    flex: 1,
    gap: 3,
  },
  queueItemLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(13, 0.3),
    color: C.text,
  },
  queueItemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  queueItemBpm: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(11, 0.3),
    color: C.textSecondary,
  },
  queueThumb: {
    width: S.ms(32, 0.4),
    height: S.ms(32, 0.4),
    borderRadius: S.ms(6, 0.3),
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  queueThumbImg: {
    width: S.ms(32, 0.4),
    height: S.ms(32, 0.4),
    borderRadius: S.ms(6, 0.3),
  },
  playingImageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: Spacing.sm,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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
    fontSize: S.ms(18, 0.3),
    color: C.textTertiary,
    textAlign: "center",
    paddingHorizontal: S.ms(20, 0.3),
  },
  playingStripContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(12, 0.3),
    marginTop: S.ms(8, 0.3),
    marginBottom: S.ms(4, 0.3),
  },
  playingStrip: {
    flex: 1,
    flexDirection: "row",
    gap: S.ms(6, 0.3),
  },
  stripItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(6, 0.3),
    paddingHorizontal: S.ms(8, 0.3),
    paddingVertical: S.ms(6, 0.3),
    borderRadius: S.ms(8, 0.3),
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  stripItemActive: {
    borderWidth: 1.5,
    backgroundColor: "rgba(212,168,70,0.08)",
  },
  stripItemDim: {
    opacity: 0.5,
  },
  stripThumb: {
    width: S.ms(24, 0.4),
    height: S.ms(24, 0.4),
    borderRadius: S.ms(4, 0.3),
    overflow: "hidden",
  },
  stripThumbEmpty: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stripLabel: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(11, 0.3),
    color: C.textSecondary,
  },
  landscapePlayingLeft: {
    flex: 2,
    marginRight: S.ms(10, 0.3),
  },
  landscapePlayingRight: {
    flex: 1,
    justifyContent: "center",
  },
  landscapeRightPanel: {
    flex: 1,
  },
  removeBtn: {
    padding: Spacing.xxs,
  },
  sourceContainer: {
    flex: 1,
    minHeight: S.ms(80, 0.3),
  },
  emptySource: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: S.ms(16, 0.3),
  },
  emptySourceText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(13, 0.3),
    color: C.textTertiary,
  },
  sourceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(6, 0.3),
    marginBottom: S.ms(5, 0.3),
  },
  sourceItemContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(10, 0.3),
    paddingHorizontal: S.ms(12, 0.3),
    paddingVertical: S.ms(9, 0.3),
    backgroundColor: C.surface,
    borderRadius: S.ms(8, 0.3),
    borderWidth: 1,
    borderColor: C.border,
  },
  sourceItemInfo: {
    flex: 1,
    gap: Spacing.xxs,
  },
  sourceItemLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(13, 0.3),
    color: C.text,
  },
  sourceItemMeta: {
    flexDirection: "row",
    gap: S.ms(8, 0.3),
  },
  sourceItemBpm: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(11, 0.3),
    color: C.textSecondary,
  },
  sourceItemBeats: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(11, 0.3),
    color: C.textTertiary,
  },
  insertNextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(3, 0.3),
    borderWidth: 1,
    borderRadius: S.ms(6, 0.3),
    paddingHorizontal: S.ms(8, 0.3),
    paddingVertical: S.ms(5, 0.3),
  },
  insertNextText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(10, 0.3),
    color: C.text,
  },
});

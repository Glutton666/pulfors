import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { confirmDestructive } from "@/lib/confirm";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Spacing, Radius } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PracticeEntry } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";
import { useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";
import { HintBanner } from "@/components/HintTooltip";
import { loadScore } from "@/lib/score-storage";
import type { ScoreDocument } from "@/lib/score-types";
import { ScoreRenderer } from "@/components/ScoreRenderer";
import { ImageFramingModal, PracticeSourcePickerModal } from "@/components/NoteModeModals";
import { reconcileNoteSources } from "@/lib/note-mode-sources";
import { clampNoteImageCropToFrame, fitNoteImageFrame, normalizeNoteImageCrop } from "@/lib/note-image-crop";
import type { NoteImageCrop } from "@/lib/storage";
import { BarPlayButton } from "@/components/BarPlayButton";

interface NoteModeViewProps {
  queue: PracticeEntry[];
  barEntries: PracticeEntry[];
  playMode: "once" | "loop" | "random";
  currentIndex: number;
  isPlaying: boolean;
  currentBeat: number;
  activeSubNote: number;
  /** 현재 재생 중인 엔트리의 완료된 마디 수 (0-based) */
  playingBarIdx?: number;
  onAddToQueue: (entry: PracticeEntry) => void;
  onRemoveFromQueue: (index: number) => void;
  onReorderQueue: (fromIndex: number, toIndex: number) => void;
  onInsertNext: (entry: PracticeEntry) => void;
  onPlayModeChange: (mode: "once" | "loop" | "random") => void;
  onTogglePlay: () => void;
  onManualNext?: () => void;
  onManualNextImmediate?: () => void;
  onSave: () => Promise<boolean>;
  onReset: () => void;
  onExitNoteMode: () => void;
  onQueueItemImageChange?: (index: number, imageUri: string | undefined, crop?: NoteImageCrop) => void;
  onLoadPracticeSources?: () => Promise<PracticeEntry[]>;
  onSourceSelectionChange?: (entries: PracticeEntry[]) => void;
  onOpenSettings?: () => void;
}

export const NOTE_SOURCE_HEADER_LAYOUT = {
  gap: 6,
  bottomGap: 6,
} as const;

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

function MiniScorePreview({
  scoreId,
  currentMeasureIdx,
  previewUnit = "measure",
  phraseSize = 4,
  width = 52,
  height = 40,
}: {
  scoreId: string;
  currentMeasureIdx?: number;
  previewUnit?: "measure" | "phrase";
  phraseSize?: number;
  width?: number;
  height?: number;
}) {
  const { colors: C } = useTheme();
  const [scoreDoc, setScoreDoc] = useState<ScoreDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadScore(scoreId).then((doc) => {
      if (!cancelled) {
        setScoreDoc(doc);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [scoreId]);

  if (loading) {
    return (
      <View style={{ width, height, justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: 8, height: 8, borderRadius: Radius.xs, backgroundColor: C.textTertiary }} />
      </View>
    );
  }

  if (!scoreDoc) {
    return (
      <View style={{ width, height, justifyContent: "center", alignItems: "center" }}>
        <Ionicons name="document-outline" size={14} color={C.textTertiary} />
      </View>
    );
  }

  // 악구 단위: 현재 마디가 속한 악구의 첫 마디를 강조
  const effectiveMeasureIdx =
    currentMeasureIdx === undefined
      ? undefined
      : previewUnit === "phrase"
        ? Math.floor(currentMeasureIdx / Math.max(1, phraseSize)) * Math.max(1, phraseSize)
        : currentMeasureIdx;

  const renderWidth = width * 3;
  const scale = width / renderWidth;
  const shiftX = -(renderWidth * (1 - scale)) / 2;
  const shiftY = -(height * 3 * (1 - scale)) / 2;
  return (
    <View style={{ width, height, overflow: "hidden", borderRadius: 2 }}>
      <View
        style={{
          width: renderWidth,
          transform: [
            { translateX: shiftX },
            { translateY: shiftY },
            { scale },
          ],
        }}
      >
        <ScoreRenderer
          doc={scoreDoc}
          containerWidth={renderWidth}
          playheadMeasureIdx={effectiveMeasureIdx}
          showPlayhead={false}
          showPartNames={false}
        />
      </View>
    </View>
  );
}

function FramedPracticeImage({
  uri,
  crop,
  style,
}: {
  uri: string;
  crop?: NoteImageCrop;
  style: StyleProp<ViewStyle>;
}) {
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState({ width: 0, height: 0 });
  const { colors: C } = useTheme();

  useEffect(() => {
    let active = true;
    if (typeof Image.getSize !== "function") {
      return () => { active = false; };
    }
    Image.getSize(
      uri,
      (width, height) => {
        if (active) setImage({ width, height });
      },
      () => {
        if (active) setImage({ width: 0, height: 0 });
      },
    );
    return () => { active = false; };
  }, [uri]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrame((previous) =>
      previous.width === width && previous.height === height
        ? previous
        : { width, height },
    );
  }, []);

  const normalizedCrop = normalizeNoteImageCrop(crop);
  const fittedFrame = normalizedCrop?.aspectRatio
    ? fitNoteImageFrame(frame.width, frame.height, normalizedCrop.aspectRatio)
    : frame;
  const safeCrop = clampNoteImageCropToFrame(
    normalizedCrop ?? { scale: 1, x: 0, y: 0 },
    image.width,
    image.height,
    fittedFrame.width,
    fittedFrame.height,
  );

  return (
    <View
      pointerEvents="none"
      onLayout={handleLayout}
      style={[style, { overflow: "hidden", backgroundColor: C.background }]}
    >
      <View
        style={{
          width: fittedFrame.width || "100%",
          height: fittedFrame.height || "100%",
          alignSelf: "center",
          marginTop: fittedFrame.height ? (frame.height - fittedFrame.height) / 2 : 0,
          overflow: "hidden",
        }}
      >
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={[
            StyleSheet.absoluteFillObject,
            {
              transform: [
                { scale: safeCrop.scale },
                { translateX: safeCrop.x * fittedFrame.width },
                { translateY: safeCrop.y * fittedFrame.height },
              ],
            },
          ]}
        />
      </View>
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
  onImageFrame,
  imageCrop,
  currentMeasureIdx,
  previewUnit,
  phraseSize,
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
  onImageFrame?: (imageUri: string | undefined, crop?: NoteImageCrop) => void;
  imageCrop?: NoteImageCrop;
  currentMeasureIdx?: number;
  previewUnit?: "measure" | "phrase";
  phraseSize?: number;
}) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
  const { t } = useLanguage();
  const [frameVisible, setFrameVisible] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(entry.imageUri ?? null);

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
       setPendingUri(result.assets[0].uri);
       setFrameVisible(true);
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
      <Pressable onPress={entry.scoreId ? undefined : () => { if (entry.imageUri) { setPendingUri(entry.imageUri); setFrameVisible(true); } else void handlePickImage(); }} style={styles.queueThumb}>
        {entry.scoreId ? (
          <MiniScorePreview
            scoreId={entry.scoreId}
            currentMeasureIdx={isCurrent ? currentMeasureIdx : undefined}
            previewUnit={previewUnit}
            phraseSize={phraseSize}
            width={48}
            height={38}
          />
        ) : entry.imageUri ? (
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
        <Pressable onPress={() => { setPendingUri(entry.imageUri ?? null); setFrameVisible(true); }} hitSlop={8} style={{ padding: Spacing.xxs }}>
          <Ionicons name="image" size={S.ms(14, 0.4)} color={accentColor} />
        </Pressable>
      )}
      <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
        <Ionicons name="close-circle" size={S.ms(18, 0.4)} color={C.textTertiary} />
      </Pressable>
      {pendingUri && <ImageFramingModal visible={frameVisible} uri={pendingUri} crop={entry.imageCrop} onCancel={() => setFrameVisible(false)} onRemove={() => { setFrameVisible(false); setPendingUri(null); onImageFrame?.(undefined); if (!onImageFrame) onImageChange?.(undefined); }} onConfirm={(crop) => { setFrameVisible(false); if (onImageFrame) onImageFrame(pendingUri, crop); else onImageChange?.(pendingUri); }} />}
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
  currentBeat,
  activeSubNote,
  playingBarIdx,
  onAddToQueue,
  onRemoveFromQueue,
  onReorderQueue,
  onInsertNext,
  onPlayModeChange,
  onTogglePlay,
  onManualNext,
  onManualNextImmediate,
  onSave,
  onReset,
  onExitNoteMode,
  onQueueItemImageChange,
  onLoadPracticeSources,
  onSourceSelectionChange,
  onOpenSettings,
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
  const [previewUnit, setPreviewUnit] = useState<"measure" | "phrase">("measure");
  const [phraseSize, setPhraseSize] = useState(4);
  const [sourcePickerVisible, setSourcePickerVisible] = useState(false);
  const [practiceSources, setPracticeSources] = useState<PracticeEntry[]>(barEntries);
  const [selectedSources, setSelectedSources] = useState<PracticeEntry[]>(barEntries);
  const hasScoreItems = queue.some((e) => !!e.scoreId);
  useEffect(() => setPracticeSources(barEntries), [barEntries]);
  const openSourcePicker = useCallback(async () => {
    const loaded = onLoadPracticeSources ? await onLoadPracticeSources() : barEntries;
    setPracticeSources(loaded);
    setSelectedSources(reconcileNoteSources(barEntries, loaded));
    setSourcePickerVisible(true);
  }, [barEntries, onLoadPracticeSources]);

  useEffect(() => {
    if (isPlaying) setSourceCollapsed(true);
    else setSourceCollapsed(false);
  }, [isPlaying]);

  const playModeLabels = {
    once: t("noteMode", "playModeOnce"),
    loop: t("noteMode", "playModeLoop"),
    random: t("noteMode", "playModeRandom"),
  };
  const handleReset = useCallback(() => {
    confirmDestructive(t("noteMode", "resetConfirm"), {
      title: t("noteMode", "reset"),
      confirmText: t("noteMode", "reset"),
      cancelText: t("main", "cancel"),
      onConfirm: onReset,
    });
  }, [onReset, t]);

  const handleRandomPlayRequest = useCallback(() => {
    onPlayModeChange("random");
    onTogglePlay();
  }, [onPlayModeChange, onTogglePlay]);

  const currentEntry = queue[currentIndex];
  const prevEntry = currentIndex > 0 ? queue[currentIndex - 1] : (playMode === "loop" && queue.length > 0 ? queue[queue.length - 1] : null);
  const nextEntry = currentIndex < queue.length - 1 ? queue[currentIndex + 1] : (playMode === "loop" && queue.length > 0 ? queue[0] : null);
  const totalBeats = Math.max(1, currentEntry?.beatsPerMeasure ?? 1);
  const visibleBeat = currentBeat >= 0 && currentBeat < totalBeats ? currentBeat : -1;
  const activePattern = visibleBeat >= 0
    ? currentEntry?.beatSubdivisions?.[String(visibleBeat)]?.length
      ? currentEntry.beatSubdivisions[String(visibleBeat)]
      : [currentEntry?.beatTypes?.[visibleBeat] ?? "normal"]
    : [];

  const renderBeatProgress = (compact = false, onPhoto = false) => (
    <View
      testID="note-beat-progress"
      style={[
        styles.beatProgress,
        compact && styles.beatProgressCompact,
        onPhoto && styles.beatProgressOnPhoto,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${t("noteMode", "beatUnit")} ${visibleBeat >= 0 ? visibleBeat + 1 : "-"} / ${totalBeats}`}
    >
      <View style={[styles.beatNumberRow, compact && styles.beatNumberRowCompact]}>
        <Text testID="note-current-beat" style={[styles.beatNumber, compact && styles.beatNumberCompact, onPhoto && { color: "#fff" }]}>
          {visibleBeat >= 0 ? visibleBeat + 1 : "—"}
        </Text>
        <Text style={[styles.beatTotal, onPhoto && { color: "rgba(255,255,255,0.76)" }]}>/ {totalBeats}</Text>
      </View>
      <View testID="note-subdivision-progress" style={styles.beatSubdivisionRow}>
        {activePattern.map((type, index) => (
          <View
            key={`${visibleBeat}-${index}`}
            testID={`note-subdivision-${index}`}
            style={[
              styles.beatSubdivisionDot,
              { backgroundColor: BEAT_COLORS[type] || C.textSecondary },
              index === activeSubNote && styles.beatSubdivisionDotActive,
              onPhoto && index !== activeSubNote && { opacity: 0.72 },
            ]}
          />
        ))}
      </View>
    </View>
  );

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
      const hasImgL = !!currentEntry?.imageUri;
      return (
        <View style={[styles.container, { flexDirection: "row" as const }]}>
          {/* 가로모드: 사진이 있으면 전체 배경으로 */}
          {hasImgL && (
            <FramedPracticeImage
              uri={currentEntry!.imageUri!}
              crop={currentEntry?.imageCrop}
              style={StyleSheet.absoluteFillObject}
            />
          )}
          <View style={styles.landscapePlayingLeft}>
            {!hasImgL && (
              <View style={[styles.playingImageArea, { flex: 0, height: S.ms(140, 0.35) }]}>
                <View style={styles.playingImagePlaceholder}>
                  <Ionicons name="musical-notes" size={S.ms(36, 0.4)} color={C.textTertiary} />
                  <Text style={[styles.playingImagePlaceholderText, { fontSize: S.ms(14, 0.3) }]}>{currentEntry?.label}</Text>
                </View>
              </View>
            )}
          </View>
          <View style={[
            styles.landscapePlayingRight,
            hasImgL && { backgroundColor: "rgba(0,0,0,0.55)" },
          ]}>
            {renderBeatProgress(true, hasImgL)}
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: S.ms(8, 0.3), marginBottom: S.ms(6, 0.3) }}>
              <View style={[styles.progressBadge, { backgroundColor: hasImgL ? "rgba(0,0,0,0.45)" : C.accent + "22" }]}>
                <Text style={[styles.progressText, { color: hasImgL ? "#fff" : C.accent }]}>{currentIndex + 1}/{queue.length}</Text>
              </View>
              <Pressable
                style={[styles.playButton, { backgroundColor: C.danger, width: S.ms(36, 0.4), height: S.ms(36, 0.4), borderRadius: S.ms(18, 0.4) }]}
                onPress={onTogglePlay}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={t("barModeView", "stopLabel")}
                testID="note-play-button"
              >
                <Ionicons name="stop" size={S.ms(20, 0.4)} color="#fff" />
              </Pressable>
              {queue.length > 1 && (
                <Pressable
                  style={[styles.nextButton, { width: S.ms(44, 0.4), height: S.ms(36, 0.4), borderRadius: S.ms(8, 0.3) }]}
                  onPress={onManualNext}
                  onLongPress={onManualNextImmediate}
                  delayLongPress={500}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={t("noteMode", "nextBeat")}
                >
                  <Ionicons name="play-skip-forward" size={S.ms(14, 0.3)} color={C.accent} />
                  <Text style={[styles.nextButtonText, { color: C.accent, fontSize: S.ms(9, 0.3) }]}>
                    {t("noteMode", "nextBeat")}
                  </Text>
                </Pressable>
              )}
            </View>
            {renderPlayingStrip()}
          </View>
        </View>
      );
    }

    const hasImg = !!currentEntry?.imageUri;

    return (
      <View style={styles.container}>
        {/* 사진 전체 화면 배경 */}
        {hasImg && (
          <FramedPracticeImage
            uri={currentEntry!.imageUri!}
            crop={currentEntry?.imageCrop}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* 가장자리만 부드럽게 어둡혀 사진을 가리지 않고 정보를 읽을 수 있게 한다. */}
        {hasImg && (
          <LinearGradient
            colors={["rgba(4,7,11,0.58)", "rgba(4,7,11,0)"]}
            style={styles.imgScrimTop}
            pointerEvents="none"
          />
        )}

        <View style={styles.header}>
          <View style={[styles.progressBadge, { backgroundColor: hasImg ? "rgba(0,0,0,0.45)" : C.accent + "22" }]}>
            <Text style={[styles.progressText, { color: hasImg ? "#fff" : C.accent }]}>
              {currentIndex + 1}/{queue.length}
            </Text>
          </View>
        </View>

        {hasImg && renderBeatProgress(true, true)}

        {/* 이미지 없을 때만 플레이스홀더 표시 */}
        {!hasImg && (
          <View style={styles.noPhotoStage}>
            <View style={styles.noPhotoCard}>
              <View style={[styles.noPhotoIcon, { backgroundColor: C.accent + "18" }]}>
                <Ionicons name="musical-notes" size={S.ms(24, 0.4)} color={C.accent} />
              </View>
              <Text style={styles.playingImagePlaceholderText} numberOfLines={2}>{currentEntry?.label}</Text>
              <Text style={styles.nowPlayingBpm}>{currentEntry?.bpm} BPM</Text>
              {renderBeatProgress()}
            </View>
          </View>
        )}

        <View style={{ flex: 1 }} />

        {hasImg && (
          <LinearGradient
            colors={["rgba(4,7,11,0)", "rgba(4,7,11,0.64)"]}
            style={styles.imgScrimBottom}
            pointerEvents="none"
          />
        )}

        <View style={styles.playingStripContainer}>
          {renderPlayingStrip()}
          <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: S.ms(8, 0.3) }}>
            <Pressable
              style={[styles.playButton, { backgroundColor: C.danger }]}
              onPress={onTogglePlay}
              accessibilityRole="button"
              accessibilityLabel={t("barModeView", "stopLabel")}
              testID="note-play-button"
            >
              <Ionicons name="stop" size={S.ms(28, 0.4)} color="#fff" />
            </Pressable>
            {queue.length > 1 && (
              <Pressable
                style={styles.nextButton}
                onPress={onManualNext}
                onLongPress={onManualNextImmediate}
                delayLongPress={500}
                accessibilityRole="button"
                accessibilityLabel={t("noteMode", "nextBeat")}
              >
                <Ionicons name="play-skip-forward" size={S.ms(18, 0.4)} color={C.accent} />
                <Text style={[styles.nextButtonText, { color: C.accent }]}>
                  {t("noteMode", "nextBeat")}
                </Text>
              </Pressable>
            )}
          </View>
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
      {hasScoreItems && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, paddingHorizontal: Spacing.xxs }}>
          <Text style={{ fontSize: S.ms(11, 0.3), color: C.textTertiary }}>{t("noteMode", "previewUnit")}:</Text>
          <Pressable
            onPress={() => setPreviewUnit("measure")}
            style={[{
              paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xxs, borderRadius: 10,
              backgroundColor: previewUnit === "measure" ? C.accent + "30" : "transparent",
              borderWidth: 1, borderColor: previewUnit === "measure" ? C.accent : C.border,
            }]}
          >
            <Text style={{ fontSize: S.ms(11, 0.3), color: previewUnit === "measure" ? C.accent : C.textTertiary }}>
              {t("noteMode", "previewMeasure")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPreviewUnit("phrase")}
            style={[{
              paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xxs, borderRadius: 10,
              backgroundColor: previewUnit === "phrase" ? C.accent + "30" : "transparent",
              borderWidth: 1, borderColor: previewUnit === "phrase" ? C.accent : C.border,
            }]}
          >
            <Text style={{ fontSize: S.ms(11, 0.3), color: previewUnit === "phrase" ? C.accent : C.textTertiary }}>
              {t("noteMode", "previewPhrase")}
            </Text>
          </Pressable>
          {previewUnit === "phrase" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs, marginLeft: Spacing.xs }}>
              <Pressable
                onPress={() => setPhraseSize((p) => Math.max(1, p - 1))}
                hitSlop={8}
                style={{ opacity: phraseSize <= 1 ? 0.4 : 1 }}
              >
                <Ionicons name="remove-circle-outline" size={S.ms(16, 0.4)} color={C.textSecondary} />
              </Pressable>
              <Text style={{ fontSize: S.ms(12, 0.3), color: C.text, minWidth: 14, textAlign: "center" as const }}>
                {phraseSize}
              </Text>
              <Pressable
                onPress={() => setPhraseSize((p) => Math.min(16, p + 1))}
                hitSlop={8}
                style={{ opacity: phraseSize >= 16 ? 0.4 : 1 }}
              >
                <Ionicons name="add-circle-outline" size={S.ms(16, 0.4)} color={C.textSecondary} />
              </Pressable>
              <Text style={{ fontSize: S.ms(11, 0.3), color: C.textTertiary }}>{t("noteMode", "phraseMeasures")}</Text>
            </View>
          )}
        </View>
      )}
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
                onImageFrame={(uri, crop) => onQueueItemImageChange?.(index, uri, crop)}
                imageCrop={item.imageCrop}
                currentMeasureIdx={isPlaying && index === currentIndex ? playingBarIdx : undefined}
                previewUnit={previewUnit}
                phraseSize={phraseSize}
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
      <View testID="note-source-section-header" style={styles.sourceSectionTop}>
        <Pressable
          testID="toggle-note-source-section"
          style={styles.sectionHeader}
          onPress={() => setSourceCollapsed(prev => !prev)}
        >
          <View style={styles.sectionHeaderLeft}>
            <Ionicons
              name={sourceCollapsed ? "chevron-forward" : "chevron-down"}
              size={S.ms(14, 0.4)}
              color={C.textSecondary}
            />
            <Text style={[styles.sectionTitle, { color: C.text }]}>{t("noteMode", "source")}</Text>
            {barEntries.length > 0 && (
              <Text style={[styles.sectionCount, { color: C.textTertiary }]}>{barEntries.length}</Text>
            )}
          </View>
        </Pressable>
        <Pressable
          testID="load-note-practice-sources"
          onPress={openSourcePicker}
          style={[styles.loadSourcesButton, { borderColor: C.accent }]}
          accessibilityRole="button"
        >
          <Ionicons name="library-outline" size={S.ms(15, 0.4)} color={C.accent} />
          <Text style={styles.loadSourcesButtonText}>{t("noteMode", "loadSources")}</Text>
        </Pressable>
      </View>
      {!sourceCollapsed && (
        <View style={[styles.sourceContainer, isLandscape && { flex: 1 }]} testID="note-queue-source">
          {barEntries.length === 0 ? (
            <Pressable onPress={openSourcePicker} style={[styles.sourceInvite, { borderColor: C.border, backgroundColor: C.surfaceLight }]}>
              <View style={[styles.sourceInviteIcon, { backgroundColor: C.accent + "18" }]}>
                <Ionicons name="library-outline" size={S.ms(20, 0.4)} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: "700" }}>{t("noteMode", "loadSources")}</Text>
                <Text style={{ color: C.textTertiary, fontSize: S.ms(11, 0.3), marginTop: 3 }}>{t("noteMode", "sourceInviteHint")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.accent} />
            </Pressable>
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
            />
          )}
        </View>
      )}
      <PracticeSourcePickerModal
        visible={sourcePickerVisible}
        entries={practiceSources}
        selected={selectedSources}
        onCancel={() => setSourcePickerVisible(false)}
        onConfirm={(entries) => {
          setSelectedSources(entries);
          setSourcePickerVisible(false);
          onSourceSelectionChange?.(entries);
        }}
      />
    </>
  );

  const renderPlayControls = () => (
    <View style={[styles.playControls, isLandscape && { marginBottom: S.ms(4, 0.3) }]}>
      <View style={styles.playModeRow}>
        {onOpenSettings && (
          <Pressable
            onPress={onOpenSettings}
            testID="open-note-settings"
            accessibilityRole="button"
            accessibilityLabel={t("settings", "title")}
            style={styles.playActionBtn}
          >
            <Ionicons name="settings-outline" size={isLandscape ? 13 : 16} color={C.textSecondary} />
            <Text style={styles.playActionText}>{t("settings", "title")}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleSaveWithFeedback}
          testID="save-note-mode"
          accessibilityRole="button"
          accessibilityLabel={t("noteMode", "save")}
          style={[styles.playActionBtn, { borderColor: saved ? "#4CAF50" : C.accent, backgroundColor: saved ? "#4CAF5020" : C.surface }]}
        >
          <Ionicons name={saved ? "checkmark" : "save-outline"} size={isLandscape ? 13 : 16} color={saved ? "#4CAF50" : C.accent} />
          <Text style={[styles.playActionText, { color: saved ? "#4CAF50" : C.accent }]}>
            {saved ? t("noteMode", "saved") : t("noteMode", "save")}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleReset}
          testID="reset-note-mode"
          accessibilityRole="button"
          accessibilityLabel={t("noteMode", "reset")}
          style={[styles.playActionBtn, { borderColor: C.danger }]}
        >
          <Ionicons name="refresh" size={isLandscape ? 13 : 16} color={C.danger} />
          <Text style={[styles.playActionText, { color: C.danger }]}>{t("noteMode", "reset")}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: S.ms(6, 0.3) }}>
        <BarPlayButton
          isPlaying={isPlaying}
          isPreparing={false}
          barLoopMode={playMode === "loop" ? "loop" : "once"}
          onTogglePlay={onTogglePlay}
          onBarLoopModeChange={onPlayModeChange}
          blockPlayMode={playMode === "random" ? "random" : undefined}
          onRandomPlayRequest={handleRandomPlayRequest}
          baseStyle={[
            styles.playButton,
            { backgroundColor: isPlaying ? C.danger : C.accent },
          ]}
          sizeOverride={isLandscape ? { width: S.ms(60, 0.4), height: S.ms(30, 0.4), borderRadius: S.ms(8, 0.3) } : undefined}
          accentColor={C.accent}
          dangerColor="#fff"
          backgroundColor={C.background}
          idleIconColor="#fff"
          playingIconColor="#fff"
          iconSize={isLandscape ? 24 : 28}
          badgeIconSize={isLandscape ? 10 : 12}
          labels={{
            once: playModeLabels.once,
            loop: playModeLabels.loop,
            random: playModeLabels.random,
            play: t("a11y", "playButton"),
            stop: t("barModeView", "stopLabel"),
            switchToOnce: playModeLabels.once,
            switchToLoop: playModeLabels.loop,
          }}
          disabled={queue.length === 0}
          testID="note-play-button"
          t={t}
        />
        {isPlaying && queue.length > 1 && (
          <Pressable
            style={[
              styles.nextButton,
              isLandscape && { width: S.ms(52, 0.4), height: S.ms(30, 0.4), borderRadius: S.ms(8, 0.3) },
            ]}
            onPress={onManualNext}
            onLongPress={onManualNextImmediate}
            delayLongPress={500}
            hitSlop={isLandscape ? { top: 8, bottom: 8, left: 4, right: 4 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t("noteMode", "nextBeatHint")}
          >
            <Ionicons name="play-skip-forward" size={isLandscape ? 16 : 18} color={C.accent} />
            <Text style={[styles.nextButtonText, { color: C.accent }, isLandscape && { fontSize: S.ms(9, 0.3) }]}>
              {t("noteMode", "nextBeat")}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  if (isLandscape) {
    return (
      <View style={[styles.container, { flexDirection: "row" as const, gap: S.ms(8, 0.3) }, S.isTablet && { maxWidth: 900, alignSelf: "center" as const, width: "100%" as const }]}>
        <View style={{ flex: 2 }}>
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
    <View style={[styles.container, S.isTablet && { maxWidth: 720, alignSelf: "center" as const, width: "100%" as const }]}>
      {renderPlayControls()}

      <HintBanner
        hintKey="note_mode_intro"
        message={t("noteMode", "hintAddToQueue")}
        icon="list-outline"
      />

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
  closeButtonCenter: {
    alignSelf: "center",
    marginTop: S.ms(2, 0.3),
    marginBottom: S.ms(2, 0.3),
    padding: S.ms(6, 0.3),
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
  beatProgress: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: S.ms(8, 0.3),
    paddingHorizontal: S.ms(18, 0.3),
    paddingVertical: S.ms(12, 0.3),
    borderRadius: S.ms(16, 0.3),
    backgroundColor: C.surfaceLight,
    borderWidth: 1,
    borderColor: C.accent + "55",
  },
  beatProgressCompact: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: S.ms(10, 0.3),
    paddingHorizontal: S.ms(10, 0.3),
    paddingVertical: S.ms(5, 0.3),
    borderRadius: S.ms(10, 0.3),
    marginBottom: S.ms(6, 0.3),
  },
  beatProgressOnPhoto: {
    backgroundColor: "rgba(0,0,0,0.58)",
    borderColor: "rgba(255,255,255,0.25)",
  },
  beatNumberRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  beatNumberRowCompact: {
    minWidth: S.ms(48, 0.3),
  },
  beatNumber: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: S.ms(54, 0.4),
    lineHeight: S.ms(58, 0.4),
    color: C.accent,
  },
  beatNumberCompact: {
    fontSize: S.ms(24, 0.4),
    lineHeight: S.ms(28, 0.4),
  },
  beatTotal: {
    marginLeft: S.ms(5, 0.3),
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(14, 0.3),
    color: C.textTertiary,
  },
  beatSubdivisionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: S.ms(5, 0.3),
    minHeight: S.ms(12, 0.3),
  },
  beatSubdivisionDot: {
    width: S.ms(8, 0.3),
    height: S.ms(8, 0.3),
    borderRadius: S.ms(4, 0.3),
    opacity: 0.4,
  },
  beatSubdivisionDotActive: {
    width: S.ms(12, 0.3),
    height: S.ms(12, 0.3),
    borderRadius: S.ms(6, 0.3),
    opacity: 1,
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
  playActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: S.ms(4, 0.3),
    paddingHorizontal: S.ms(6, 0.3),
    paddingVertical: S.ms(6, 0.3),
    borderRadius: S.ms(8, 0.3),
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  playActionText: {
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
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: S.ms(4, 0.3),
    paddingHorizontal: S.ms(12, 0.4),
    height: S.ms(48, 0.4),
    borderRadius: S.ms(10, 0.3),
    borderWidth: 1,
    borderColor: C.accent + "55",
    backgroundColor: C.accent + "15",
  },
  nextButtonText: {
    fontSize: S.ms(12, 0.3),
    fontWeight: "600" as const,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 1,
    minWidth: 0,
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
  imgScrimTop: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 72,
    zIndex: 1,
  },
  imgScrimBottom: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 132,
    zIndex: 1,
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
  noPhotoStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: S.ms(12, 0.3),
  },
  noPhotoCard: {
    width: "100%",
    maxWidth: S.ms(360, 0.25),
    alignItems: "center",
    justifyContent: "center",
    gap: S.ms(8, 0.3),
    paddingHorizontal: S.ms(18, 0.3),
    paddingVertical: S.ms(20, 0.3),
    borderRadius: S.ms(18, 0.3),
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  noPhotoIcon: {
    width: S.ms(44, 0.4),
    height: S.ms(44, 0.4),
    borderRadius: S.ms(14, 0.3),
    alignItems: "center",
    justifyContent: "center",
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
  sourceSectionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    columnGap: S.ms(NOTE_SOURCE_HEADER_LAYOUT.gap, 0.3),
    rowGap: S.ms(NOTE_SOURCE_HEADER_LAYOUT.gap, 0.3),
    marginBottom: S.ms(NOTE_SOURCE_HEADER_LAYOUT.bottomGap, 0.3),
  },
  loadSourcesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
    maxWidth: "100%",
    gap: S.ms(5, 0.3),
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: S.ms(9, 0.3),
    paddingVertical: S.ms(6, 0.3),
  },
  loadSourcesButtonText: {
    color: C.accent,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "center",
  },
  sourceInvite: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(10, 0.3),
    borderWidth: 1,
    borderRadius: 15,
    padding: S.ms(12, 0.3),
  },
  sourceInviteIcon: {
    width: S.ms(38, 0.4),
    height: S.ms(38, 0.4),
    borderRadius: S.ms(12, 0.3),
    alignItems: "center",
    justifyContent: "center",
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

// ============================================================
// ScoreEditorToolbar — 상단 툴바 + 성부 탭
// ============================================================

import React, { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { makeStyles } from "@/components/ScoreEditorScreen.styles";
import type { ScorePart } from "@/lib/score-types";

export interface ScoreEditorToolbarProps {
  topInset: number;
  canUndo: boolean;
  canRedo: boolean;
  savedToast: boolean;
  muteAudio: boolean;
  isPlaying: boolean;
  isPreparing: boolean;
  progressAnimRef: React.MutableRefObject<Animated.Value>;
  parts: ScorePart[];
  selectedPartIdx: number;
  onBack: () => void;
  onOpenDial?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPlayPause: () => void;
  onStop: () => void;
  onToggleMute: () => void;
  onOpenMeta: () => void;
  onOpenShare: () => void;
  onOpenMoreMenu: () => void;
  onSave: () => void;
  onSelectPart: (idx: number) => void;
  onLayout: (height: number) => void;
}

export function ScoreEditorToolbar({
  topInset,
  canUndo,
  canRedo,
  savedToast,
  muteAudio,
  isPlaying,
  isPreparing,
  progressAnimRef,
  parts,
  selectedPartIdx,
  onBack,
  onOpenDial,
  onUndo,
  onRedo,
  onPlayPause,
  onStop,
  onToggleMute,
  onOpenMeta,
  onOpenShare,
  onOpenMoreMenu,
  onSave,
  onSelectPart,
  onLayout,
}: ScoreEditorToolbarProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const styles = useMemo(() => makeStyles(C, S), [C, S]);

  return (
    <>
      {/* ── 상단 툴바 ─────────────────────────────────────────── */}
      <View
        style={[
          styles.topBar,
          { paddingTop: topInset + 4, borderBottomColor: C.border, backgroundColor: C.surface },
        ]}
        onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
      >
        {/* 뒤로가기 */}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={onBack}
          hitSlop={12}
          testID="score-editor-back"
        >
          <Ionicons name="chevron-back" size={S.ms(22, 0.4)} color={C.text} />
        </Pressable>

        {/* 악보 모드 레이블 — 탭하면 팬 다이얼 열기 */}
        <Pressable
          onPress={onOpenDial}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: "row" as const,
            alignItems: "center" as const,
            justifyContent: "center" as const,
            gap: 6,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityRole="button"
        >
          <Ionicons name="musical-notes" size={S.ms(18, 0.4)} color={C.accent} />
          <Text
            style={[
              styles.topTitle,
              {
                color: C.accent,
                fontFamily: "SpaceGrotesk_700Bold",
                fontSize: S.ms(17, 0.4),
                letterSpacing: 1.2,
              },
            ]}
            numberOfLines={1}
          >
            {t("scoreMode", "title") || t("switcher", "score")}
          </Text>
        </Pressable>

        {savedToast && (
          <Text style={[styles.savedToast, { color: C.accent }]}>
            {t("scoreMode", "saved")}
          </Text>
        )}

        {/* 실행취소 */}
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            !canUndo && { opacity: 0.3 },
            pressed && canUndo && { opacity: 0.6 },
          ]}
          onPress={onUndo}
          disabled={!canUndo}
          hitSlop={8}
          testID="score-editor-undo"
        >
          <Ionicons name="arrow-undo" size={S.ms(20, 0.4)} color={C.text} />
        </Pressable>

        {/* 다시실행 */}
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            !canRedo && { opacity: 0.3 },
            pressed && canRedo && { opacity: 0.6 },
          ]}
          onPress={onRedo}
          disabled={!canRedo}
          hitSlop={8}
          testID="score-editor-redo"
        >
          <Ionicons name="arrow-redo" size={S.ms(20, 0.4)} color={C.text} />
        </Pressable>

        {/* 재생/정지 버튼 */}
        <View style={styles.playBtnWrapper}>
          <Pressable
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && !isPreparing && { opacity: 0.6 },
              isPreparing && { opacity: 0.5 },
            ]}
            onPress={onPlayPause}
            disabled={isPreparing}
            hitSlop={8}
            testID="score-editor-play"
          >
            {isPreparing ? (
              <ActivityIndicator size="small" color={C.text} />
            ) : (
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={S.ms(20, 0.4)}
                color={isPlaying ? C.accent : C.text}
              />
            )}
          </Pressable>
          {isPreparing && (
            <View style={styles.prepareBarTrack}>
              <Animated.View
                style={[
                  styles.prepareBarFill,
                  {
                    backgroundColor: C.accent,
                    width: progressAnimRef.current.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 32],
                    }),
                  },
                ]}
              />
            </View>
          )}
        </View>

        {/* 정지 버튼 (재생 중에만) */}
        {isPlaying && (
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            onPress={onStop}
            hitSlop={8}
            testID="score-editor-stop"
          >
            <Ionicons name="stop" size={S.ms(18, 0.4)} color={C.text} />
          </Pressable>
        )}

        {/* 소리 끄기/켜기 버튼 */}
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            muteAudio && { backgroundColor: C.accent + "22" },
            pressed && { opacity: 0.6 },
          ]}
          onPress={onToggleMute}
          hitSlop={8}
          testID="score-editor-mute"
        >
          <Ionicons
            name={muteAudio ? "volume-mute" : "volume-high"}
            size={S.ms(20, 0.4)}
            color={muteAudio ? C.accent : C.text}
          />
        </Pressable>

        {/* 악보 정보 편집 */}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={onOpenMeta}
          hitSlop={8}
          testID="score-editor-meta"
        >
          <Ionicons name="information-circle-outline" size={S.ms(20, 0.4)} color={C.text} />
        </Pressable>

        {/* 공유 버튼 */}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={onOpenShare}
          hitSlop={8}
          testID="score-editor-share"
        >
          <Ionicons name="share-social-outline" size={S.ms(20, 0.4)} color={C.text} />
        </Pressable>

        {/* ⋯ 더 보기 메뉴 */}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={onOpenMoreMenu}
          hitSlop={8}
          testID="score-editor-more-menu"
        >
          <Ionicons name="ellipsis-horizontal" size={S.ms(20, 0.4)} color={C.text} />
        </Pressable>

        {/* 저장 */}
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: C.accent },
            pressed && { opacity: 0.8 },
          ]}
          onPress={onSave}
          testID="score-editor-save"
        >
          <Text style={styles.saveBtnText}>{t("scoreMode", "save")}</Text>
        </Pressable>
      </View>

      {/* ── 성부 탭 (2+ 성부 시) ───────────────────────────────── */}
      {parts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[
            styles.partTabsScroll,
            { backgroundColor: C.surface, borderBottomColor: C.border },
          ]}
          contentContainerStyle={styles.partTabsContent}
        >
          {parts.map((part, pIdx) => (
            <Pressable
              key={part.id}
              style={[
                styles.partTab,
                {
                  borderBottomColor: selectedPartIdx === pIdx ? C.accent : "transparent",
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => onSelectPart(pIdx)}
              testID={`score-editor-part-tab-${pIdx}`}
            >
              <Text
                style={[
                  styles.partTabText,
                  { color: selectedPartIdx === pIdx ? C.accent : C.textSecondary },
                ]}
              >
                {part.name ?? part.instrumentId}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </>
  );
}

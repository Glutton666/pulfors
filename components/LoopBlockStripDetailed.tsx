import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlockPill } from "./BlockPill";
import type { LoopBlock, BlockPlayMode } from "./beat-indicator.types";
import type { ProgressInfo } from "@/lib/metronome-engine";
import { Radius, Spacing } from "@/constants/tokens";
import {
  sortBlocksByStart,
  detectJumpDirection,
  formatJumpLabel,
  formatJumpRange,
  nextBlockPlayMode,
  blockPlayModeIcon,
  blockPlayModeLabel,
  isBlockPlayModeHighlighted,
} from "./loop-block-strip-utils";

export type { BlockPlayMode };

export interface LoopBlockStripDetailedProps {
  loopBlocks: LoopBlock[];
  editingBlockIndex: number | null;
  isPlaying: boolean;
  progressInfo: ProgressInfo | null | undefined;
  pillDrag: { origIndex: number } | null;
  pillDropTarget: number | null;
  beatsPerMeasure: number;
  blockPlayMode: BlockPlayMode;
  accentColor: string;
  textColor: string;
  textTertiaryColor: string;
  bgSecondary: string;
  whiteColor: string;
  ms: (n: number, factor?: number) => number;
  onPillPress: (origIndex: number, isEditing: boolean) => void;
  onPillDragStart: (origIndex: number) => void;
  onPillDragMove: (origIndex: number, pageX: number, pageY: number) => void;
  onPillDragEnd: (origIndex: number, pageX: number, pageY: number) => void;
  onPillMeasure: (origIndex: number, layout: { x: number; y: number; w: number; h: number }) => void;
  onBlockPlayModeChange: (mode: BlockPlayMode) => void;
}

export function LoopBlockStripDetailed({
  loopBlocks,
  editingBlockIndex,
  isPlaying,
  progressInfo,
  pillDrag,
  pillDropTarget,
  beatsPerMeasure,
  blockPlayMode,
  accentColor,
  textColor,
  textTertiaryColor,
  bgSecondary,
  whiteColor,
  ms,
  onPillPress,
  onPillDragStart,
  onPillDragMove,
  onPillDragEnd,
  onPillMeasure,
  onBlockPlayModeChange,
}: LoopBlockStripDetailedProps) {
  const sorted = sortBlocksByStart(loopBlocks);

  const showModeToggle = !isPlaying && loopBlocks.length >= 2;
  const nextMode = nextBlockPlayMode(blockPlayMode);
  const modeIcon = blockPlayModeIcon(blockPlayMode);
  const modeLabel = blockPlayModeLabel(blockPlayMode);
  const modeHighlight = isBlockPlayModeHighlighted(blockPlayMode);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ maxHeight: 72 }}
      contentContainerStyle={{ paddingHorizontal: Spacing.sm, paddingVertical: 6, gap: 6, alignItems: "center" }}
    >
      {sorted.map(({ block, origIndex }, si) => {
        const isEditing = editingBlockIndex === origIndex;
        const isActive = isPlaying && progressInfo && progressInfo.blockIndex === origIndex;
        const hasJump = block.jumpToBlock !== undefined && block.jumpToBlock !== null;
        const jumpTarget = hasJump ? loopBlocks[block.jumpToBlock!] : null;
        const jumpDir = detectJumpDirection(sorted, si, block.jumpToBlock);
        const goesBack = jumpDir === "back";
        const { label: jumpLabel, isActive: isActiveJump } = formatJumpLabel(
          progressInfo,
          isPlaying,
          origIndex,
          block.jumpCount,
        );
        const jumpRangeText = jumpTarget
          ? `${formatJumpRange(jumpTarget, beatsPerMeasure)} ${jumpLabel}`
          : "";
        return (
          <View key={`flow-${origIndex}`} style={{ flexDirection: "row", alignItems: "center" }}>
            <BlockPill
              origIndex={origIndex}
              block={block}
              isEditing={isEditing}
              isActive={!!isActive}
              isPlaying={isPlaying}
              isDragSource={!!pillDrag && pillDrag.origIndex === origIndex}
              isDropTarget={pillDropTarget === origIndex}
              hasJump={hasJump}
              layerCount={loopBlocks.filter(b => b.layerOf === origIndex).length}
              beatsPerMeasure={beatsPerMeasure}
              progressInfo={progressInfo}
              accentColor={accentColor}
              textColor={textColor}
              textTertiaryColor={textTertiaryColor}
              bgSecondary={bgSecondary}
              whiteColor={whiteColor}
              onPress={() => onPillPress(origIndex, isEditing)}
              onDragStart={onPillDragStart}
              onDragMove={onPillDragMove}
              onDragEnd={onPillDragEnd}
              onMeasure={onPillMeasure}
              size="normal"
            />
            {hasJump && jumpTarget && (
              goesBack ? (
                <View style={{ alignItems: "center", marginLeft: Spacing.xs, marginRight: Spacing.xxs }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name="return-up-back" size={ms(14, 0.4)} color="#f0ad4e" />
                    <View style={{
                      paddingHorizontal: Spacing.xs, paddingVertical: 1, borderRadius: Radius.xs,
                      backgroundColor: isActiveJump ? "#f0ad4e30" : "#f0ad4e15",
                      marginLeft: Spacing.xxs,
                    }}>
                      <Text style={{ color: "#f0ad4e", fontSize: 8, fontFamily: "SpaceGrotesk_700Bold" }}>
                        → {jumpRangeText}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", marginLeft: Spacing.xxs }}>
                  <View style={{ width: 10, height: 1.5, backgroundColor: "#f0ad4e" }} />
                  <Ionicons name="caret-forward" size={ms(10, 0.4)} color="#f0ad4e" style={{ marginLeft: -2 }} />
                  <View style={{
                    paddingHorizontal: Spacing.xs, paddingVertical: 1, borderRadius: Radius.xs,
                    backgroundColor: isActiveJump ? "#f0ad4e30" : "#f0ad4e15",
                    marginLeft: Spacing.xxs,
                  }}>
                    <Text style={{ color: "#f0ad4e", fontSize: 8, fontFamily: "SpaceGrotesk_700Bold" }}>
                      {jumpRangeText}
                    </Text>
                  </View>
                </View>
              )
            )}
            {si < sorted.length - 1 && !hasJump && (
              <Ionicons name="chevron-forward" size={ms(10, 0.4)} color={textTertiaryColor} style={{ marginLeft: Spacing.xxs, opacity: 0.4 }} />
            )}
          </View>
        );
      })}
      {showModeToggle && (
        <Pressable
          onPress={() => onBlockPlayModeChange(nextMode)}
          style={{
            paddingHorizontal: 6,
            paddingVertical: Spacing.xs,
            borderRadius: Radius.sm,
            backgroundColor: modeHighlight ? "#f0ad4e20" : bgSecondary,
            borderWidth: modeHighlight ? 1 : 0,
            borderColor: "#f0ad4e60",
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
          }}
          hitSlop={8}
        >
          <Ionicons
            name={modeIcon}
            size={ms(12, 0.4)}
            color={modeHighlight ? "#f0ad4e" : textTertiaryColor}
          />
          <Text style={{
            color: modeHighlight ? "#f0ad4e" : textTertiaryColor,
            fontSize: 9,
            fontFamily: "SpaceGrotesk_600SemiBold",
          }}>
            {modeLabel}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

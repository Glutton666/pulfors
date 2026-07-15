import React from "react";
import { View, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlockPill } from "./BlockPill";
import type { LoopBlock } from "./beat-indicator.types";
import type { ProgressInfo } from "@/lib/metronome-engine";
import { sortBlocksByStart, detectJumpDirection } from "./loop-block-strip-utils";
import { Spacing } from "@/constants/tokens";

export interface LoopBlockStripCompactProps {
  loopBlocks: LoopBlock[];
  editingBlockIndex: number | null;
  isPlaying: boolean;
  progressInfo: ProgressInfo | null | undefined;
  pillDrag: { origIndex: number } | null;
  pillDropTarget: number | null;
  beatsPerMeasure: number;
  accentColor: string;
  textColor: string;
  textTertiaryColor: string;
  bgSecondary: string;
  whiteColor: string;
  ms: (n: number, factor?: number) => number;
  paddingHorizontal: number;
  marginBottom?: number;
  onPillPress: (origIndex: number, isEditing: boolean) => void;
  onPillDragStart: (origIndex: number) => void;
  onPillDragMove: (origIndex: number, pageX: number, pageY: number) => void;
  onPillDragEnd: (origIndex: number, pageX: number, pageY: number) => void;
  onPillMeasure: (origIndex: number, layout: { x: number; y: number; w: number; h: number }) => void;
}

export function LoopBlockStripCompact({
  loopBlocks,
  editingBlockIndex,
  isPlaying,
  progressInfo,
  pillDrag,
  pillDropTarget,
  beatsPerMeasure,
  accentColor,
  textColor,
  textTertiaryColor,
  bgSecondary,
  whiteColor,
  ms,
  paddingHorizontal,
  marginBottom,
  onPillPress,
  onPillDragStart,
  onPillDragMove,
  onPillDragEnd,
  onPillMeasure,
}: LoopBlockStripCompactProps) {
  if (loopBlocks.length === 0) return null;

  const sorted = sortBlocksByStart(loopBlocks);

  return (
    <View style={{ flexGrow: 0, marginBottom }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 42 }}
        contentContainerStyle={{ paddingHorizontal, paddingVertical: 3, gap: Spacing.xs, alignItems: "center" }}
      >
        {sorted.map(({ block, origIndex }, si) => {
          const isEditing = editingBlockIndex === origIndex;
          const isActive = isPlaying && progressInfo && progressInfo.blockIndex === origIndex;
          const hasJump = block.jumpToBlock !== undefined && block.jumpToBlock !== null;
          const jumpTarget = hasJump ? loopBlocks[block.jumpToBlock!] : null;
          const jumpDir = detectJumpDirection(sorted, si, block.jumpToBlock);
          const goesBack = jumpDir === "back";
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
                size="small"
              />
              {hasJump && jumpTarget && (
                goesBack ? (
                  <View style={{ alignItems: "center", marginLeft: 3 }}>
                    <Ionicons name="return-up-back" size={ms(10, 0.4)} color="#f0ad4e" />
                  </View>
                ) : (
                  <Ionicons name="caret-forward" size={ms(8, 0.4)} color="#f0ad4e" style={{ marginLeft: 1 }} />
                )
              )}
              {si < sorted.length - 1 && !hasJump && (
                <Ionicons name="chevron-forward" size={ms(8, 0.4)} color={textTertiaryColor} style={{ marginLeft: 1, opacity: 0.4 }} />
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

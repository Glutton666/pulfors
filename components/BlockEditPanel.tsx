import React from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { LoopBlock } from "./beat-indicator.types";
import type { SoundSet } from "@/lib/storage";
import { Radius, FontSize, Spacing } from "@/constants/tokens";

export interface BlockEditPanelColors {
  accent: string;
  accentDanger: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  backgroundSecondary: string;
  overlay08: string;
}

export interface BlockEditPanelProps {
  editingBlockIndex: number;
  editBlock: LoopBlock;
  loopBlocks: LoopBlock[];
  otherBlocks: { b: LoopBlock; i: number }[];
  editHasJump: boolean;
  editJumpCount: number;
  beatsPerMeasure: number;
  globalBpm?: number;
  colors: BlockEditPanelColors;
  ms: (n: number, factor?: number) => number;
  updateBlock: (index: number, changes: Partial<LoopBlock>) => void;
  removeLoopBlock: (index: number) => void;
  setEditingBlockIndex: (index: number | null) => void;
  onLoopBlocksChange: (blocks: LoopBlock[]) => void;
}

const SOUND_SETS: ReadonlyArray<SoundSet> = ["classic", "woodblock", "digital", "rimshot", "triangle", "hihat"] as const;

export function BlockEditPanel({
  editingBlockIndex,
  editBlock,
  loopBlocks,
  otherBlocks,
  editHasJump,
  editJumpCount,
  beatsPerMeasure,
  globalBpm,
  colors: C,
  ms,
  updateBlock,
  removeLoopBlock,
  setEditingBlockIndex,
  onLoopBlocksChange,
}: BlockEditPanelProps) {
  const hasLayers = loopBlocks.some(b => b.layerOf === editingBlockIndex);

  return (
    <View style={{
      backgroundColor: C.backgroundSecondary,
      borderRadius: Radius.md,
      marginHorizontal: Spacing.sm,
      marginBottom: Spacing.xs,
      padding: Spacing.sm,
      borderWidth: 1,
      borderColor: C.accent + "30",
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ color: C.accent, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_700Bold" }}>
          Block {editBlock.startBeat + 1}-{Math.min(editBlock.endBeat + 1, beatsPerMeasure)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {hasLayers && (
            <Pressable
              onPress={() => {
                const updated = loopBlocks.map(b =>
                  b.layerOf === editingBlockIndex
                    ? { ...b, layerOf: undefined, ownBeatTypes: undefined, ownSubdivisions: undefined }
                    : b
                );
                onLoopBlocksChange(updated);
              }}
              hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
              <Ionicons name="layers-outline" size={ms(12, 0.4)} color={C.accent} />
              <Text style={{ color: C.accent, fontSize: 9, fontFamily: "SpaceGrotesk_600SemiBold" }}>Unlayer</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => { setEditingBlockIndex(null); removeLoopBlock(editingBlockIndex); }}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
          >
            <Ionicons name="trash-outline" size={ms(12, 0.4)} color={C.accentDanger} />
          </Pressable>
          <Pressable onPress={() => setEditingBlockIndex(null)} hitSlop={8}>
            <Ionicons name="close" size={ms(14, 0.4)} color={C.textTertiary} />
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 6 }}>
        <Text style={{ color: C.textSecondary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_500Medium", width: 48 }}>Repeat</Text>
        <Pressable
          onPress={() => { if (editBlock.value > 1) updateBlock(editingBlockIndex, { value: editBlock.value - 1 }); }}
          style={{ width: ms(26, 0.5), height: ms(26, 0.5), borderRadius: ms(13, 0.5), backgroundColor: C.accent + "20", alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="remove" size={ms(14, 0.4)} color={C.accent} />
        </Pressable>
        <Text style={{ color: C.text, fontSize: 13, fontFamily: "SpaceGrotesk_700Bold", minWidth: 28, textAlign: "center" }}>
          ×{editBlock.value}
        </Text>
        <Pressable
          onPress={() => { if (editBlock.value < 16) updateBlock(editingBlockIndex, { value: editBlock.value + 1 }); }}
          style={{ width: ms(26, 0.5), height: ms(26, 0.5), borderRadius: ms(13, 0.5), backgroundColor: C.accent + "20", alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="add" size={ms(14, 0.4)} color={C.accent} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 6 }}>
        <Text style={{ color: C.textSecondary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_500Medium", width: 48 }}>BPM</Text>
        <Pressable
          onPress={() => {
            if (editBlock.bpm) {
              updateBlock(editingBlockIndex, { bpm: Math.max(20, editBlock.bpm - 5) });
            }
          }}
          style={{ width: ms(26, 0.5), height: ms(26, 0.5), borderRadius: ms(13, 0.5), backgroundColor: editBlock.bpm ? C.accent + "20" : C.overlay08, alignItems: "center", justifyContent: "center", opacity: editBlock.bpm ? 1 : 0.4 }}
        >
          <Ionicons name="remove" size={ms(14, 0.4)} color={editBlock.bpm ? C.accent : C.textTertiary} />
        </Pressable>
        {editBlock.bpm ? (
          <TextInput
            style={{
              color: C.accent, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_700Bold",
              minWidth: 44, textAlign: "center", paddingHorizontal: 6, paddingVertical: Spacing.xxs,
              borderRadius: Radius.xs, backgroundColor: C.accent + "20", borderWidth: 1, borderColor: C.accent + "50",
            }}
            keyboardType="number-pad"
            defaultValue={String(editBlock.bpm)}
            key={`bpm-p-${editingBlockIndex}-${editBlock.bpm}`}
            onEndEditing={(e) => {
              const v = parseInt(e.nativeEvent.text, 10);
              if (!isNaN(v) && v >= 20 && v <= 300) updateBlock(editingBlockIndex, { bpm: v });
              else if (e.nativeEvent.text === "" || e.nativeEvent.text === "0") updateBlock(editingBlockIndex, { bpm: undefined });
            }}
            selectTextOnFocus
          />
        ) : (
          <Pressable
            onPress={() => updateBlock(editingBlockIndex, { bpm: globalBpm || 120 })}
            style={{
              paddingHorizontal: 6, paddingVertical: Spacing.xxs, borderRadius: Radius.xs, minWidth: 44, alignItems: "center",
              backgroundColor: "transparent", borderWidth: 1, borderColor: C.accent + "30",
            }}
          >
            <Text style={{ color: C.textTertiary, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_700Bold" }}>—</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            if (editBlock.bpm) {
              updateBlock(editingBlockIndex, { bpm: Math.min(300, editBlock.bpm + 5) });
            }
          }}
          style={{ width: ms(26, 0.5), height: ms(26, 0.5), borderRadius: ms(13, 0.5), backgroundColor: editBlock.bpm ? C.accent + "20" : C.overlay08, alignItems: "center", justifyContent: "center", opacity: editBlock.bpm ? 1 : 0.4 }}
        >
          <Ionicons name="add" size={ms(14, 0.4)} color={editBlock.bpm ? C.accent : C.textTertiary} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        <Text style={{ color: C.textSecondary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_500Medium", width: 48 }}>Sound</Text>
        <Pressable
          onPress={() => updateBlock(editingBlockIndex, { soundSet: undefined })}
          style={{
            paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.xs,
            backgroundColor: !editBlock.soundSet ? C.accent + "30" : "transparent",
            borderWidth: 1, borderColor: C.accent + "30",
          }}
        >
          <Text style={{ color: !editBlock.soundSet ? C.accent : C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium" }}>—</Text>
        </Pressable>
        {SOUND_SETS.map((s) => (
          <Pressable
            key={s}
            onPress={() => updateBlock(editingBlockIndex, { soundSet: s })}
            style={{
              paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.xs,
              backgroundColor: editBlock.soundSet === s ? C.accent + "30" : "transparent",
              borderWidth: 1, borderColor: editBlock.soundSet === s ? C.accent + "50" : C.accent + "30",
            }}
          >
            <Text style={{ color: editBlock.soundSet === s ? C.accent : C.textSecondary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium" }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: editHasJump ? 6 : 0 }}>
        <Text style={{ color: C.textSecondary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_500Medium", width: 48 }}>Jump</Text>
        <Pressable
          onPress={() => { if (editHasJump) updateBlock(editingBlockIndex, { jumpToBlock: undefined, jumpCount: undefined }); }}
          style={{
            paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.xs,
            backgroundColor: !editHasJump ? C.accent + "30" : "transparent",
            borderWidth: 1, borderColor: C.accent + "30",
          }}
        >
          <Text style={{ color: !editHasJump ? C.accent : C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium" }}>None</Text>
        </Pressable>
        {otherBlocks.map(({ b: ob, i: oi }) => (
          <Pressable
            key={oi}
            onPress={() => updateBlock(editingBlockIndex, { jumpToBlock: oi, jumpCount: editJumpCount || 1 })}
            style={{
              paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.xs,
              backgroundColor: editBlock.jumpToBlock === oi ? "#f0ad4e30" : "transparent",
              borderWidth: 1, borderColor: editBlock.jumpToBlock === oi ? "#f0ad4e50" : C.accent + "30",
            }}
          >
            <Text style={{ color: editBlock.jumpToBlock === oi ? "#f0ad4e" : C.textSecondary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium" }}>
              {ob.startBeat + 1}-{Math.min(ob.endBeat + 1, beatsPerMeasure)}
            </Text>
          </Pressable>
        ))}
      </View>

      {editHasJump && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
          <Text style={{ color: C.textSecondary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_500Medium", width: 48 }}>Jump ×</Text>
          <Pressable
            onPress={() => { if (editJumpCount > 1) updateBlock(editingBlockIndex, { jumpCount: editJumpCount - 1 }); }}
            style={{ width: ms(26, 0.5), height: ms(26, 0.5), borderRadius: ms(13, 0.5), backgroundColor: "#f0ad4e20", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="remove" size={ms(14, 0.4)} color="#f0ad4e" />
          </Pressable>
          <Text style={{ color: C.text, fontSize: 13, fontFamily: "SpaceGrotesk_700Bold", minWidth: 28, textAlign: "center" }}>
            ×{editJumpCount}
          </Text>
          <Pressable
            onPress={() => { if (editJumpCount < 16) updateBlock(editingBlockIndex, { jumpCount: editJumpCount + 1 }); }}
            style={{ width: ms(26, 0.5), height: ms(26, 0.5), borderRadius: ms(13, 0.5), backgroundColor: "#f0ad4e20", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="add" size={ms(14, 0.4)} color="#f0ad4e" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

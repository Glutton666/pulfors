/**
 * BarBlockEditModal — loop-block repeat / BPM / sound-set editor.
 * Self-contained: initialises local state from props when visible changes.
 */
import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedModal } from "@/components/AnimatedModal";
import { FontSize, Spacing, Radius } from "@/constants/tokens";
import { useScale } from "@/lib/scale";
import type { LoopBlock } from "@/components/beat-indicator.types";
import type { CustomSoundSetConfig } from "@/lib/storage";
import type { TranslationFn } from "@/lib/i18n";
import { SOUND_SET_OPTIONS, type BarModeColors } from "./BarModeTypes";

interface BarBlockEditModalProps {
  visible: boolean;
  blockIndex: number | null;
  loopBlocks: LoopBlock[];
  customSoundSets: Record<string, CustomSoundSetConfig>;
  onSave: (idx: number, updated: LoopBlock) => void;
  onDelete: (idx: number) => void;
  onClose: () => void;
  colors: BarModeColors;
  ms: (size: number, factor?: number) => number;
  t: TranslationFn;
}

export function BarBlockEditModal({
  visible, blockIndex, loopBlocks, customSoundSets,
  onSave, onDelete, onClose,
  colors: C, ms, t,
}: BarBlockEditModalProps) {
  const { isTablet } = useScale();
  const [repType, setRepType] = useState<"count" | "duration">("count");
  const [repCount, setRepCount] = useState(2);
  const [repMin, setRepMin] = useState(0);
  const [repSec, setRepSec] = useState(30);
  const [bpmDraft, setBpmDraft] = useState<string | null>(null);
  const bpmDraftRef = useRef<string | null>(null);
  const [bpmInvalid, setBpmInvalid] = useState(false);
  const session = useRef<number | null>(null);
  const setBpm = (value: string | null) => {
    bpmDraftRef.current = value; setBpmDraft(value); setBpmInvalid(false);
  };
  const [repSoundSet, setRepSoundSet] = useState<string | null>(null);

  // Open a fresh draft on every visit, including reopening the same block.
  // Wait for a newly created block to arrive without overwriting active edits.
  useEffect(() => {
    if (!visible) { session.current = null; return; }
    if (blockIndex === null) return;
    const lb = loopBlocks[blockIndex];
    if (!lb || session.current === blockIndex) return;
    session.current = blockIndex;
    setRepType(lb.type);
    setRepCount(lb.type === "count" ? lb.value : 2);
    setRepMin(lb.type === "duration" ? Math.floor(lb.value / 60) : 0);
    setRepSec(lb.type === "duration" ? lb.value % 60 : 30);
    setBpm(lb.bpm === undefined ? null : String(lb.bpm));
    setRepSoundSet((lb.soundSet ?? null) as string | null);
  }, [visible, blockIndex, loopBlocks]);

  const handleSave = () => {
    if (blockIndex === null) return;
    const lb = loopBlocks[blockIndex];
    if (!lb) return;
    const text = bpmDraftRef.current?.trim() ?? "";
    const bpm = text === "" ? null : Number(text);
    if (bpm !== null && (!/^\d+$/.test(text) || bpm < 20 || bpm > 300)) {
      setBpmInvalid(true); return;
    }
    const val = repType === "count" ? repCount : repMin * 60 + repSec;
    const next: LoopBlock = { ...lb, type: repType, value: Math.max(1, val) };
    if (bpm !== null) next.bpm = bpm; else delete next.bpm;
    if (repSoundSet) (next as LoopBlock).soundSet = repSoundSet as LoopBlock["soundSet"];
    else delete (next as LoopBlock).soundSet;
    onSave(blockIndex, next);
  };

  const handleDelete = () => {
    if (blockIndex === null) return;
    onDelete(blockIndex);
  };

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={handleSave}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleSave} />
        <View style={[styles.card, { backgroundColor: C.backgroundSecondary, maxWidth: isTablet ? 520 : 320 }]} dataSet={{ capturesKeys: "true" }}>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: C.overlay08 }]}>
            <Ionicons name="code-slash" size={ms(16, 0.4)} color={C.accent} />
            <Text style={{ color: C.accent, fontSize: FontSize.small, fontFamily: "SpaceGrotesk_700Bold" }}>
              {t("barModeView", "blockEditTitle").replace("{{n}}", String((blockIndex ?? 0) + 1))}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={handleDelete} hitSlop={8} style={{ marginRight: 6 }}>
              <Ionicons name="trash-outline" size={ms(15, 0.4)} color="#e05c5c" />
            </Pressable>
            <Pressable testID="bar-block-cancel" onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={ms(14, 0.4)} color={C.textSecondary} />
            </Pressable>
            <Pressable testID="bar-block-save" onPress={handleSave} hitSlop={8} style={{ marginLeft: 10 }}>
              <Ionicons name="checkmark" size={ms(16, 0.4)} color={C.accent} />
            </Pressable>
          </View>

          {/* Repeat type + value */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            {(["count", "duration"] as const).map(repT => (
              <Pressable
                key={repT}
                testID={`bar-block-type-${repT}`}
                onPress={() => setRepType(repT)}
                style={[styles.typeToggle, { backgroundColor: repType === repT ? C.accent + "30" : C.overlay08 }]}
              >
                <Text style={{ color: repType === repT ? C.accent : C.textSecondary, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                  {repT === "count" ? t("barModeView", "repCount") : t("barModeView", "repDuration")}
                </Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            {repType === "count" ? (
              <>
                <Pressable onPress={() => setRepCount(v => Math.max(1, v - 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="remove" size={ms(15, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Text style={{ color: C.text, fontSize: 18, fontFamily: "SpaceGrotesk_700Bold", minWidth: 36, textAlign: "center" }}>×{repCount}</Text>
                <Pressable testID="bar-block-count-increase" onPress={() => setRepCount(v => Math.min(99, v + 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="add" size={ms(15, 0.4)} color={C.textSecondary} />
                </Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={() => setRepMin(v => Math.max(0, v - 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="remove" size={ms(13, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Text style={{ color: C.text, fontSize: 15, fontFamily: "SpaceGrotesk_700Bold", minWidth: 26, textAlign: "center" }}>{repMin}{t("barModeView", "minuteSuffix")}</Text>
                <Pressable onPress={() => setRepMin(v => Math.min(59, v + 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="add" size={ms(13, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Pressable onPress={() => setRepSec(v => Math.max(0, v - 5))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="remove" size={ms(13, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Text style={{ color: C.text, fontSize: 15, fontFamily: "SpaceGrotesk_700Bold", minWidth: 26, textAlign: "center" }}>{repSec}{t("barModeView", "secondSuffix")}</Text>
                <Pressable onPress={() => setRepSec(v => Math.min(59, v + 5))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="add" size={ms(13, 0.4)} color={C.textSecondary} />
                </Pressable>
              </>
            )}
          </View>

          {/* BPM override */}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, marginBottom: 6 }}>{t("barModeView", "repBpmOverride")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" }}>
              {bpmDraft !== null ? (
                <>
                  <Pressable onPress={() => setBpm(String(Math.max(20, Math.min(300, Number(bpmDraftRef.current) || 120) - 5)))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="remove" size={ms(13, 0.4)} color={C.accent} />
                  </Pressable>
                  <TextInput
                    testID="bar-block-bpm-input"
                    style={[styles.bpmInput, { color: C.accent, borderBottomColor: C.accent }]}
                    value={bpmDraft}
                    keyboardType="number-pad"
                    onChangeText={setBpm}
                    onSubmitEditing={e => { setBpm(e.nativeEvent.text); handleSave(); }}
                    selectTextOnFocus
                  />
                  <Pressable onPress={() => setBpm(String(Math.min(300, Math.max(20, Number(bpmDraftRef.current) || 120) + 5)))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="add" size={ms(13, 0.4)} color={C.accent} />
                  </Pressable>
                  <Pressable testID="bar-block-bpm-reset" onPress={() => setBpm(null)} style={[styles.typeToggle, { backgroundColor: C.overlay08 }]} hitSlop={4}>
                    <Text style={{ color: C.textSecondary, fontSize: FontSize.caption }}>{t("barModeView", "repBpmReset")}</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable testID="bar-block-bpm-enable" onPress={() => setBpm("120")} style={[styles.typeToggle, { backgroundColor: C.overlay08 }]}>
                  <Text style={{ color: C.textSecondary, fontSize: FontSize.caption }}>{t("barModeView", "repBpmSet")}</Text>
                </Pressable>
              )}
            </View>
            {bpmInvalid && <Text accessibilityRole="alert" style={{ color: "#e05c5c", fontSize: FontSize.caption, textAlign: "center", marginTop: 6 }}>BPM 20–300</Text>}
          </View>

          {/* Sound set */}
          <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, marginBottom: 6 }}>{t("barModeView", "soundSetLabel")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            <Pressable
              onPress={() => setRepSoundSet(null)}
              style={[styles.typeToggle, { backgroundColor: repSoundSet === null ? C.accent + "30" : C.overlay08 }]}
            >
              <Text style={{ color: repSoundSet === null ? C.accent : C.textSecondary, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                {t("barModeView", "soundSetDefault")}
              </Text>
            </Pressable>
            {SOUND_SET_OPTIONS.map(opt => (
              <Pressable
                key={opt.key}
                testID={`bar-block-sound-${opt.key}`}
                onPress={() => setRepSoundSet(opt.key)}
                style={[styles.typeToggle, { backgroundColor: repSoundSet === opt.key ? C.accent + "30" : C.overlay08 }]}
              >
                <Text style={{ color: repSoundSet === opt.key ? C.accent : C.textSecondary, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                  {t("barModeView", opt.labelKey)}
                </Text>
              </Pressable>
            ))}
            {Object.entries(customSoundSets).map(([k, cfg]) => (
              <Pressable
                key={k}
                onPress={() => setRepSoundSet(k)}
                style={[styles.typeToggle, { backgroundColor: repSoundSet === k ? C.accent + "30" : C.overlay08 }]}
              >
                <Text style={{ color: repSoundSet === k ? C.accent : C.textSecondary, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                  {cfg.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </AnimatedModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  typeToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  bpmInput: {
    fontSize: 16,
    fontFamily: "SpaceGrotesk_700Bold",
    minWidth: 44,
    textAlign: "center",
    borderBottomWidth: 1.5,
    paddingVertical: 2,
  },
});

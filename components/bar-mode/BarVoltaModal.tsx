/**
 * BarVoltaModal — N-volta / End-repeat annotation editor modal.
 */
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedModal } from "@/components/AnimatedModal";
import { FontSize, Spacing, Radius } from "@/constants/tokens";
import { IS_TABLET } from "@/lib/scale";
import type { TranslationFn } from "@/lib/i18n";
import type { BarModeColors } from "./BarModeTypes";

interface BarVoltaModalProps {
  beat: number | null;
  voltaVal: number;
  onChangeVal: (v: number) => void;
  onSave: () => void;
  colors: BarModeColors;
  ms: (size: number, factor?: number) => number;
  t: TranslationFn;
}

export function BarVoltaModal({ beat, voltaVal, onChangeVal, onSave, colors: C, ms, t }: BarVoltaModalProps) {
  return (
    <AnimatedModal visible={beat !== null} transparent onRequestClose={onSave}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onSave} />
        <View style={[styles.card, { backgroundColor: C.backgroundSecondary, maxWidth: IS_TABLET ? 520 : 320 }]} dataSet={{ capturesKeys: "true" }}>
          <View style={[styles.header, { borderBottomColor: C.overlay08 }]}>
            <Ionicons name="hourglass-outline" size={ms(16, 0.4)} color="#7b68ee" />
            <Text style={{ color: "#7b68ee", fontSize: FontSize.small, fontFamily: "SpaceGrotesk_700Bold" }}>
              {t("barModeView", "voltaModalTitle").replace("{{n}}", String((beat ?? 0) + 1))}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onSave} hitSlop={8}>
              <Ionicons name="checkmark" size={ms(16, 0.4)} color={C.accent} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 16 }}>
            <Pressable
              onPress={() => onChangeVal(Math.max(1, voltaVal - 1))}
              style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}
            >
              <Ionicons name="remove" size={ms(16, 0.4)} color={C.textSecondary} />
            </Pressable>
            <Text style={{ color: "#7b68ee", fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" }}>
              {t("barModeView", "voltaBadge").replace("{{n}}", String(voltaVal))}
            </Text>
            <Pressable
              onPress={() => onChangeVal(Math.min(99, voltaVal + 1))}
              style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}
            >
              <Ionicons name="add" size={ms(16, 0.4)} color={C.textSecondary} />
            </Pressable>
          </View>

          <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, textAlign: "center", paddingBottom: 8 }}>
            {t("barModeView", "voltaHint").replace("{{n}}", String(voltaVal))}
          </Text>
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
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});

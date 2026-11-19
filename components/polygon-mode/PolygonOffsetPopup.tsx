import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Modal, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { clampPolygonOffsetMs } from "@/lib/polygon-offset";

interface PolygonOffsetPopupProps {
  visible: boolean;
  vertexIdx: number;
  currentOffset: number;
  slotMs: number;
  onConfirm: (offset: number) => void;
  onClose: () => void;
}

const signed = (ms: number) => `${ms > 0 ? "+" : ""}${ms}`;

export function PolygonOffsetPopup({
  visible, vertexIdx, currentOffset, slotMs, onConfirm, onClose,
}: PolygonOffsetPopupProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const [draft, setDraft] = useState<string | null>(null);
  const currentMs = clampPolygonOffsetMs(currentOffset * slotMs, slotMs);
  const text = draft ?? signed(currentMs);
  const numeric = /^[+-]?\d+$/.test(text.trim()) ? Number(text) : NaN;
  const canConfirm = Number.isFinite(numeric);
  const limit = Math.floor(slotMs / 2);
  const step = (delta: number) =>
    setDraft(signed(clampPolygonOffsetMs((canConfirm ? numeric : currentMs) + delta, slotMs)));
  const confirm = () => {
    if (!canConfirm) return;
    onConfirm(draft === null ? currentOffset : clampPolygonOffsetMs(numeric, slotMs) / slotMs);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessible={false} />
        <View testID="polygon-offset-popup" accessibilityViewIsModal style={{
          backgroundColor: C.surface,
          borderRadius: 16,
          padding: S.ms(20, 0.4),
          width: "82%",
          maxWidth: 340,
          gap: S.ms(14, 0.4),
        }}>
          <Text style={{ fontFamily: "SpaceGrotesk_700Bold", fontSize: S.ms(16, 0.4), color: C.text, textAlign: "center" }}>
            {t("polygon", "offsetTitle").replace("{{n}}", String(vertexIdx + 1))}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {[-1, 0, 1].map((delta) => delta === 0 ? (
              <View key={delta} style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <TextInput
                  testID="polygon-offset-ms"
                  accessibilityLabel={t("polygon", "offsetInput")}
                  autoCorrect={false}
                  maxLength={9}
                  selectTextOnFocus
                  value={text}
                  onChangeText={setDraft}
                  onSubmitEditing={confirm}
                  style={{
                    fontFamily: "SpaceGrotesk_700Bold", fontSize: S.ms(23, 0.4), color: C.accent,
                    minWidth: 0, flex: 1, textAlign: "right", padding: 4,
                    borderBottomWidth: 1, borderBottomColor: C.border,
                  }}
                />
                <Text style={{ color: C.textSecondary }}>ms</Text>
              </View>
            ) : (
              <Pressable
                key={delta}
                onPress={() => step(delta)}
                accessibilityRole="button"
                accessibilityLabel={t("polygon", delta < 0 ? "offsetEarlier" : "offsetLater")}
                style={({ pressed }) => ({
                  width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
                  backgroundColor: pressed ? C.accent + "33" : C.background,
                  borderWidth: 1, borderColor: C.border,
                })}
              >
                <Text style={{ fontSize: 20, color: C.text }}>{delta < 0 ? "−" : "+"}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ fontSize: S.ms(11, 0.3), color: C.textSecondary, textAlign: "center" }}>
            {t("polygon", "offsetHint")}{"\n"}{signed(-limit)} … {signed(limit)} ms
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => setDraft("0")} style={({ pressed }) => ({
              flex: 1, minHeight: 44, borderRadius: 8, justifyContent: "center", alignItems: "center",
              backgroundColor: pressed ? C.border : C.background, borderWidth: 1, borderColor: C.border,
            })}>
              <Text style={{ color: C.textSecondary }}>{t("polygon", "offsetReset")}</Text>
            </Pressable>
            <Pressable testID="polygon-offset-confirm" accessibilityRole="button" disabled={!canConfirm}
              onPress={confirm} style={({ pressed }) => ({
                flex: 1, minHeight: 44, borderRadius: 8, justifyContent: "center", alignItems: "center",
                backgroundColor: pressed ? C.accent + "CC" : C.accent, opacity: canConfirm ? 1 : 0.5,
              })}>
              <Text style={{ color: "#fff" }}>{t("polygon", "offsetConfirm")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

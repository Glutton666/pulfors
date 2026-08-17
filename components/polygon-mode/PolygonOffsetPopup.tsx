/**
 * PolygonOffsetPopup — 꼭짓점 타이밍 오프셋 편집 팝업
 *
 * 슬라이더 대신 프리셋 버튼 + 스텝 컨트롤로 구성 (외부 의존성 없음)
 * 0% = 정박, 25% = 약한 스윙, 50% = 강한 스윙
 */

import React, { useState } from "react";
import {
  View, Text, Pressable, Modal, StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";

interface PolygonOffsetPopupProps {
  visible: boolean;
  vertexIdx: number;
  currentOffset: number; // 0.0 ~ 0.5
  onConfirm: (offset: number) => void;
  onClose: () => void;
}

const PRESETS = [
  { pct: 0,  label: "0%" },
  { pct: 10, label: "10%" },
  { pct: 17, label: "17%" },
  { pct: 25, label: "25%" },
  { pct: 33, label: "33%" },
  { pct: 50, label: "50%" },
];

export function PolygonOffsetPopup({
  visible,
  vertexIdx,
  currentOffset,
  onConfirm,
  onClose,
}: PolygonOffsetPopupProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const [value, setValue] = useState(currentOffset);

  const pct = Math.round(value * 100);

  const step = (delta: number) => {
    setValue(v => Math.max(0, Math.min(0.5, Math.round((v + delta / 100) * 100) / 100)));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={[StyleSheet.absoluteFillObject, {
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          alignItems: "center",
        }]}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: C.surface,
            borderRadius: 16,
            padding: S.ms(20, 0.4),
            width: "82%",
            maxWidth: 340,
            gap: S.ms(14, 0.4),
          }}
        >
          <Text style={{
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: S.ms(16, 0.4),
            color: C.text,
            textAlign: "center",
          }}>
            {t("polygon", "offsetTitle").replace("{{n}}", String(vertexIdx + 1))}
          </Text>

          {/* 현재 값 + 스텝 컨트롤 */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <Pressable
              onPress={() => step(-1)}
              style={({ pressed }) => ({
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: pressed ? C.accent + "33" : C.background,
                borderWidth: 1, borderColor: C.border,
                alignItems: "center", justifyContent: "center",
              })}
            >
              <Text style={{ fontSize: 20, color: C.text, fontFamily: "SpaceGrotesk_700Bold" }}>−</Text>
            </Pressable>
            <Text style={{
              fontFamily: "SpaceGrotesk_700Bold",
              fontSize: S.ms(34, 0.4),
              color: C.accent,
              minWidth: 80,
              textAlign: "center",
            }}>
              {pct}%
            </Text>
            <Pressable
              onPress={() => step(1)}
              style={({ pressed }) => ({
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: pressed ? C.accent + "33" : C.background,
                borderWidth: 1, borderColor: C.border,
                alignItems: "center", justifyContent: "center",
              })}
            >
              <Text style={{ fontSize: 20, color: C.text, fontFamily: "SpaceGrotesk_700Bold" }}>+</Text>
            </Pressable>
          </View>

          <Text style={{
            fontFamily: "SpaceGrotesk_400Regular",
            fontSize: S.ms(11, 0.3),
            color: C.textSecondary,
            textAlign: "center",
          }}>
            {t("polygon", "offsetHint")}
          </Text>

          {/* 프리셋 */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {PRESETS.map((preset) => {
              const active = Math.abs(pct - preset.pct) < 1;
              return (
                <Pressable
                  key={preset.pct}
                  onPress={() => setValue(preset.pct / 100)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: active ? C.accent : pressed ? C.accent + "22" : C.background,
                    borderWidth: 1,
                    borderColor: active ? C.accent : C.border,
                  })}
                >
                  <Text style={{
                    fontFamily: "SpaceGrotesk_500Medium",
                    fontSize: S.ms(12, 0.3),
                    color: active ? "#fff" : C.textSecondary,
                  }}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 버튼 */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Pressable
              onPress={() => { setValue(0); }}
              style={({ pressed }) => ({
                flex: 1, paddingVertical: 10, borderRadius: 8,
                backgroundColor: pressed ? C.border : C.background,
                borderWidth: 1, borderColor: C.border,
                alignItems: "center",
              })}
            >
              <Text style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: S.ms(13, 0.3), color: C.textSecondary }}>
                {t("polygon", "offsetReset")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { onConfirm(value); onClose(); }}
              style={({ pressed }) => ({
                flex: 1, paddingVertical: 10, borderRadius: 8,
                backgroundColor: pressed ? C.accent + "CC" : C.accent,
                alignItems: "center",
              })}
            >
              <Text style={{ fontFamily: "SpaceGrotesk_600SemiBold", fontSize: S.ms(13, 0.3), color: "#fff" }}>
                {t("polygon", "offsetConfirm")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

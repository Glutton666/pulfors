// ============================================================
// ScoreNewModal — 새 악보 만들기 (제목만 입력 → 바로 편집 진입)
// ============================================================

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AnimatedModal } from "@/components/AnimatedModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import { createScoreDocument } from "@/lib/score-storage";
import type { ScoreDocument } from "@/lib/score-types";

const SETTINGS_KEY = "metronome_settings";

export interface ScoreNewModalProps {
  visible: boolean;
  defaultBpm: number;
  onClose: () => void;
  onCreate: (doc: ScoreDocument) => void;
}

export function ScoreNewModal({ visible, defaultBpm, onClose, onCreate }: ScoreNewModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");

  useEffect(() => {
    if (!visible) return;
    setTitle("");
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data?.username) setCreator(data.username);
      })
      .catch(() => {});
  }, [visible]);

  const styles = makeStyles(C, S);

  function handleCreate() {
    const doc = createScoreDocument({
      title: title.trim() || t("scoreMode", "untitled"),
      parts: [{ instrumentId: "piano" }],
      timeSignature: { numerator: 4, denominator: 4 },
      bpm: defaultBpm,
      keySharps: 0,
    });
    if (creator.trim()) {
      doc.metadata.composer = creator.trim();
    }
    onCreate(doc);
  }

  function handleClose() {
    setTitle("");
    onClose();
  }

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose} testID="score-new-modal-overlay">
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
              paddingTop: (insets.top || webTopInset) + 16,
              paddingBottom: 24 + (insets.bottom || (Platform.OS === "web" ? 34 : 0)),
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: C.text }]}>{t("scoreMode", "newTitle")}</Text>

          <Text style={[styles.label, { color: C.textSecondary }]}>{t("scoreMode", "scoreTitleLabel")}</Text>
          <TextInput
            style={[styles.textInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
            value={title}
            onChangeText={setTitle}
            placeholder={t("scoreMode", "scoreTitlePlaceholder")}
            placeholderTextColor={C.textSecondary}
            maxLength={60}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            testID="score-new-title-input"
          />

          <Text style={[styles.hint, { color: C.textSecondary }]}>
            {t("scoreMode", "newScoreHint")}
          </Text>

          <View style={styles.btnRow}>
            <Pressable
              style={[styles.cancelBtn, { backgroundColor: C.background, borderColor: C.border }]}
              onPress={handleClose}
              testID="score-new-cancel"
            >
              <Text style={[styles.cancelText, { color: C.text }]}>{t("scoreMode", "cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.createBtn, { backgroundColor: C.accent }]}
              onPress={handleCreate}
              testID="score-new-create"
            >
              <Text style={styles.createText}>{t("scoreMode", "create")}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </AnimatedModal>
  );
}

const makeStyles = (C: any, S: any) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet: {
      borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
      borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
      paddingHorizontal: Spacing.lg, gap: Spacing.sm,
    },
    handle: {
      alignSelf: "center", width: 36, height: 4, borderRadius: 2,
      backgroundColor: C.border, marginBottom: Spacing.xs,
    },
    title: {
      fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.subtitle,
      marginBottom: Spacing.xs,
    },
    label: {
      fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.small,
      marginTop: Spacing.sm, marginBottom: 4,
    },
    hint: {
      fontFamily: "SpaceGrotesk_400Regular", fontSize: FontSize.small,
      marginTop: 2, marginBottom: Spacing.sm, opacity: 0.7,
    },
    textInput: {
      borderWidth: 1, borderRadius: Radius.md,
      paddingHorizontal: Spacing.md, paddingVertical: 10,
      fontFamily: "SpaceGrotesk_400Regular", fontSize: FontSize.body,
    },
    btnRow: { flexDirection: "row", gap: Spacing.md, marginTop: Spacing.md },
    cancelBtn: {
      flex: 1, borderWidth: 1, borderRadius: Radius.md,
      paddingVertical: 12, alignItems: "center",
    },
    cancelText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.body },
    createBtn: { flex: 2, borderRadius: Radius.md, paddingVertical: 12, alignItems: "center" },
    createText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.body, color: "#fff" },
  });

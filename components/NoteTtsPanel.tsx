import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { FontSize, Radius, Spacing } from "@/constants/tokens";
import { getNoteTtsCopy, translateNoteTtsError } from "@/components/note-tts-copy";

export interface NoteTtsVoice {
  id: string;
  name: string;
  gender: "male" | "female" | "unknown";
  language: string;
}

export interface NoteTtsPanelProps {
  text: string;
  onTextChange: (value: string) => void;
  voices: NoteTtsVoice[];
  voiceId: string;
  onVoiceChange: (id: string) => void;
  status: "unavailable" | "loading" | "ready" | "generating";
  error: string | null;
  onGenerate: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onBack: () => void;
}

const MAX_TEXT_LENGTH = 300;

export function NoteTtsPanel({
  text,
  onTextChange,
  voices,
  voiceId,
  onVoiceChange,
  status,
  error,
  onGenerate,
  onCancel,
  onRetry,
  onBack,
}: NoteTtsPanelProps) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const c = getNoteTtsCopy(language);
  const selectedVoice = voices.find((voice) => voice.id === voiceId);
  const trimmedText = text.trim();
  const canGenerate = status === "ready" && trimmedText.length > 0 && text.length <= MAX_TEXT_LENGTH && !!selectedVoice;
  const errorMessage = translateNoteTtsError(error, language);

  const styles = StyleSheet.create({
    root: { gap: Spacing.lg },
    header: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.md },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: Radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.surfaceLight,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    headerCopy: { flex: 1, gap: Spacing.xxs },
    title: { color: C.text, fontSize: FontSize.title, fontWeight: "700" },
    description: { color: C.textSecondary, fontSize: FontSize.small, lineHeight: 18 },
    section: { gap: Spacing.sm },
    sectionHeading: { color: C.text, fontSize: FontSize.body, fontWeight: "600" },
    labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    helper: { color: C.textSecondary, fontSize: FontSize.caption, lineHeight: 17 },
    filterRow: { flexDirection: "row", gap: Spacing.sm },
    filterChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surfaceLight,
    },
    filterChipActive: { backgroundColor: C.accentDim, borderColor: C.accent },
    filterText: { color: C.textSecondary, fontSize: FontSize.small, fontWeight: "600" },
    filterTextActive: { color: C.accent },
    voiceList: { gap: Spacing.sm },
    voiceRow: {
      minHeight: 52,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
    },
    voiceRowSelected: { borderColor: C.accent, backgroundColor: C.accentDim },
    voiceCopy: { flex: 1, gap: Spacing.xxs },
    voiceName: { color: C.text, fontSize: FontSize.body, fontWeight: "600" },
    voiceMeta: { color: C.textSecondary, fontSize: FontSize.caption },
    textInput: {
      minHeight: 104,
      color: C.text,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      fontSize: FontSize.body,
      lineHeight: 21,
      textAlignVertical: "top",
    },
    notice: {
      padding: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surfaceLight,
      gap: Spacing.xs,
    },
    noticeTitle: { color: C.text, fontSize: FontSize.body, fontWeight: "700" },
    noticeBody: { color: C.textSecondary, fontSize: FontSize.small, lineHeight: 19 },
    errorBox: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.sm,
      backgroundColor: C.surfaceLight,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    errorText: { flex: 1, color: C.text, fontSize: FontSize.small, lineHeight: 18 },
    primaryButton: {
      minHeight: 48,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.md,
      backgroundColor: C.accent,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: Spacing.sm,
    },
    disabledButton: { opacity: 0.42 },
    primaryText: { color: C.white, fontSize: FontSize.body, fontWeight: "700" },
    secondaryButton: {
      minHeight: 44,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.md,
      backgroundColor: C.surfaceLight,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryText: { color: C.text, fontSize: FontSize.body, fontWeight: "600" },
    actionRow: { flexDirection: "row", gap: Spacing.sm },
    actionFlex: { flex: 1 },
    webNotice: {
      flexDirection: "row",
      gap: Spacing.md,
      alignItems: "flex-start",
      padding: Spacing.md,
      borderRadius: Radius.md,
      backgroundColor: C.surfaceLight,
      borderWidth: 1,
      borderColor: C.border,
    },
  });

  if (Platform.OS === "web") {
    return (
      <View style={styles.root} testID="note-tts-web-notice">
        <View style={styles.header}>
          <Pressable
            testID="note-tts-back"
            accessibilityRole="button"
            accessibilityLabel={c.back}
            onPress={onBack}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={19} color={C.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{c.title}</Text>
          </View>
        </View>
        <View style={styles.webNotice} accessibilityRole="summary">
          <Ionicons name="information-circle-outline" size={22} color={C.accent} />
          <Text style={styles.noticeBody}>{c.webUnsupported}</Text>
        </View>
      </View>
    );
  }

  if (status === "unavailable") {
    return (
      <View style={styles.root} testID="note-tts-unavailable">
        <View style={styles.header}>
          <Pressable
            testID="note-tts-back"
            accessibilityRole="button"
            accessibilityLabel={c.back}
            onPress={onBack}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={19} color={C.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{c.title}</Text>
            <Text style={styles.description}>{c.description}</Text>
          </View>
        </View>
        <View style={styles.notice} accessibilityRole="summary">
          <Text style={styles.noticeTitle}>{c.unavailableTitle}</Text>
          <Text style={styles.noticeBody}>{c.unavailableBody}</Text>
        </View>
      </View>
    );
  }


  return (
    <View style={styles.root} testID="note-tts-panel">
      <View style={styles.header}>
        <Pressable
          testID="note-tts-back"
          accessibilityRole="button"
          accessibilityLabel={c.back}
          onPress={onBack}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={19} color={C.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{c.title}</Text>
          <Text style={styles.description}>{c.description}</Text>
        </View>
      </View>

      {status === "loading" ? (
        <View style={styles.notice} accessibilityRole="summary">
          <Text style={styles.noticeBody}>{c.loading}</Text>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>{c.voiceSection}</Text>
            {voices.length === 0 ? (
              <Text style={styles.helper}>{c.noVoices}</Text>
            ) : (
              <View style={styles.voiceList}>
                {voices.map((voice) => {
                  const selected = voice.id === voiceId;
                  const meta = voice.language;
                  return (
                    <Pressable
                      key={voice.id}
                      testID={`note-tts-voice-${voice.id}`}
                      accessibilityRole="radio"
                      accessibilityLabel={`${voice.name}, ${meta || voice.language}`}
                      accessibilityState={{ selected }}
                      onPress={() => onVoiceChange(voice.id)}
                      style={[styles.voiceRow, selected && styles.voiceRowSelected]}
                    >
                      <View style={styles.voiceCopy}>
                        <Text style={styles.voiceName}>{voice.name}</Text>
                        <Text style={styles.voiceMeta}>{meta || voice.language}</Text>
                      </View>
                      <Ionicons
                        name={selected ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={selected ? C.accent : C.textSecondary}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
            {!selectedVoice ? <Text style={styles.helper}>{c.selectVoice}</Text> : null}
          </View>

          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.sectionHeading}>{c.textLabel}</Text>
              <Text style={styles.helper}>{c.charsRemaining.replace("{count}", String(text.length))}</Text>
            </View>
            <TextInput
              testID="note-tts-text"
              accessibilityLabel={c.textLabel}
              value={text}
              onChangeText={(value) => onTextChange(value.slice(0, MAX_TEXT_LENGTH))}
              placeholder={c.textPlaceholder}
              placeholderTextColor={C.textSecondary}
              multiline
              maxLength={MAX_TEXT_LENGTH}
              style={styles.textInput}
              textAlignVertical="top"
              returnKeyType="default"
              blurOnSubmit={false}
            />
            {!trimmedText ? <Text style={styles.helper}>{c.emptyText}</Text> : null}
          </View>

          {errorMessage ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={18} color={C.accent} />
              <Text style={styles.errorText}>{errorMessage}</Text>
              {status !== "generating" ? (
                <Pressable
                  testID="note-tts-retry"
                  accessibilityRole="button"
                  accessibilityLabel={c.retry}
                  onPress={onRetry}
                  hitSlop={8}
                >
                  <Text style={[styles.secondaryText, { color: C.accent }]}>{c.retry}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {status === "generating" ? (
            <View style={styles.actionRow}>
              <View style={[styles.primaryButton, styles.actionFlex]} accessibilityRole="summary">
                <Text style={styles.primaryText}>{c.generating}</Text>
              </View>
              <Pressable
                testID="note-tts-cancel"
                accessibilityRole="button"
                accessibilityLabel={c.cancel}
                onPress={onCancel}
                style={[styles.secondaryButton, styles.actionFlex]}
              >
                <Text style={styles.secondaryText}>{c.cancel}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID="note-tts-generate"
              accessibilityRole="button"
              accessibilityLabel={c.generate}
              accessibilityState={{ disabled: !canGenerate }}
              disabled={!canGenerate}
              onPress={onGenerate}
              style={[styles.primaryButton, !canGenerate && styles.disabledButton]}
            >
              <Ionicons name="volume-high-outline" size={19} color={C.white} />
              <Text style={styles.primaryText}>{c.generate}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

export default NoteTtsPanel;

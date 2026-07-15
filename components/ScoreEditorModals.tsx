// ScoreEditorModals.tsx
// ScoreEditorScreen에서 분리된 6개 모달 컴포넌트

import React, { useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Modal,
  Pressable,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { makeStyles } from "./ScoreEditorScreen.styles";
import { ALL_INSTR_SYMBOLS } from "./ScorePalette";
import type { ScoreDocument, ScorePart, ScoreMetadata } from "@/lib/score-types";
import { KEY_SIGNATURES, getKeySignatureLabel } from "@/lib/score-types";
import { ScoreRenderer } from "./ScoreRenderer";

// ── 공통 훅 ──────────────────────────────────────────────────────
function useEditorStyles() {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => makeStyles(C, S), [C, S]);
  return { C, styles };
}

// ═══════════════════════════════════════════════════════════════════
// 1. ⋯ 더보기 메뉴 모달
// ═══════════════════════════════════════════════════════════════════

export interface ScoreMoreMenuModalProps {
  visible: boolean;
  onClose: () => void;
  hasReferenceImage: boolean;
  hasMultipleParts: boolean;
  onExportJpg: () => void;
  onExportJson: () => void;
  onShareScore: () => void;
  onImportJson: () => void;
  onImportReferenceImage: () => void;
  onClearReferenceImage: () => void;
  onAddToPractice: () => void;
  onExtractPart: () => void;
  onOpenSymbolSettings: () => void;
}

export function ScoreMoreMenuModal({
  visible,
  onClose,
  hasReferenceImage,
  hasMultipleParts,
  onExportJpg,
  onExportJson,
  onShareScore,
  onImportJson,
  onImportReferenceImage,
  onClearReferenceImage,
  onAddToPractice,
  onExtractPart,
  onOpenSymbolSettings,
}: ScoreMoreMenuModalProps) {
  const { C, styles } = useEditorStyles();
  const { t } = useLanguage();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.symbolModalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.symbolModalCard, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.symbolModalTitle, { color: C.text }]}>
            {t("scoreMode", "moreMenu")}
          </Text>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={onExportJpg}
            testID="score-menu-export-jpg"
          >
            <Ionicons name="image-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>{t("scoreMode", "exportJpg")}</Text>
          </Pressable>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={onExportJson}
            testID="score-menu-export"
          >
            <Ionicons name="download-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>{t("scoreMode", "exportJson")}</Text>
          </Pressable>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={onShareScore}
            testID="score-menu-share"
          >
            <Ionicons name="share-social-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>{t("scoreMode", "shareScore")}</Text>
          </Pressable>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={onImportJson}
            testID="score-menu-import"
          >
            <Ionicons name="folder-open-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>{t("scoreMode", "importJson")}</Text>
          </Pressable>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={onImportReferenceImage}
            testID="score-menu-import-ref"
          >
            <Ionicons name="albums-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>{t("scoreMode", "importReferenceImage")}</Text>
          </Pressable>
          {hasReferenceImage ? (
            <Pressable
              style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
              onPress={onClearReferenceImage}
              testID="score-menu-clear-ref"
            >
              <Ionicons name="eye-off-outline" size={18} color={C.textSecondary} />
              <Text style={[styles.ctxMenuLabel, { color: C.textSecondary }]}>{t("scoreMode", "clearReferenceImage")}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={onAddToPractice}
            testID="score-menu-add-to-practice"
          >
            <Ionicons name="book-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>{t("scoreMode", "addToPractice")}</Text>
          </Pressable>
          {hasMultipleParts && (
            <Pressable
              style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
              onPress={onExtractPart}
              testID="score-menu-extract-part"
            >
              <Ionicons name="git-branch-outline" size={18} color={C.accent} />
              <Text style={[styles.ctxMenuLabel, { color: C.text }]}>{t("scoreMode", "extractPart")}</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={onOpenSymbolSettings}
            testID="score-menu-symbol-settings"
          >
            <Ionicons name="settings-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>{t("scoreMode", "symbolSettingsTitle")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 2. 성부 분리 모달
// ═══════════════════════════════════════════════════════════════════

export interface ScoreExtractPartModalProps {
  visible: boolean;
  onClose: () => void;
  parts: ScorePart[];
  selectedIndices: number[];
  onTogglePart: (pIdx: number) => void;
  onConfirm: () => void;
}

export function ScoreExtractPartModal({
  visible,
  onClose,
  parts,
  selectedIndices,
  onTogglePart,
  onConfirm,
}: ScoreExtractPartModalProps) {
  const { C, styles } = useEditorStyles();
  const { t } = useLanguage();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.symbolModalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.symbolModalCard, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.symbolModalTitle, { color: C.text }]}>
            {t("scoreMode", "extractPartTitle")}
          </Text>
          {parts.map((part, pIdx) => (
            <Pressable
              key={part.id}
              style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
              onPress={() => onTogglePart(pIdx)}
              testID={`score-extract-part-${pIdx}`}
            >
              <Ionicons
                name={selectedIndices.includes(pIdx) ? "checkbox" : "square-outline"}
                size={18}
                color={C.accent}
              />
              <Text style={[styles.ctxMenuLabel, { color: C.text }]}>
                {part.name ?? part.instrumentId}
              </Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Pressable
              style={[styles.ctxMenuItem, { flex: 1, borderBottomWidth: 0 }]}
              onPress={onClose}
            >
              <Text style={[styles.ctxMenuLabel, { color: C.textSecondary, textAlign: "center" }]}>
                {t("scoreMode", "cancel")}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.symbolModalClose,
                { flex: 1, backgroundColor: selectedIndices.length > 0 ? C.accent : C.border },
              ]}
              onPress={onConfirm}
              testID="score-extract-confirm"
            >
              <Text style={styles.symbolModalCloseText}>{t("scoreMode", "extractPart")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 3. 악기 기호 설정 모달
// ═══════════════════════════════════════════════════════════════════

export interface ScoreSymbolSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  currentPart: ScorePart | null;
  showPlayhead: boolean;
  showZoomView: boolean;
  notePreviewEnabled: boolean;
  onUpdatePlaybackSettings: (patch: { showPlayhead?: boolean; showZoomView?: boolean; notePreview?: boolean }) => void;
  onSymbolToggle: (symId: string, enabled: boolean) => void;
}

export function ScoreSymbolSettingsModal({
  visible,
  onClose,
  currentPart,
  showPlayhead,
  showZoomView,
  notePreviewEnabled,
  onUpdatePlaybackSettings,
  onSymbolToggle,
}: ScoreSymbolSettingsModalProps) {
  const { C, styles } = useEditorStyles();
  const { t } = useLanguage();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.symbolModalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.symbolModalCard, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.symbolModalTitle, { color: C.text }]}>
            {t("scoreMode", "symbolSettingsTitle")}
          </Text>
          <Text style={[styles.symbolModalSub, { color: C.textSecondary }]}>
            {currentPart?.name ?? currentPart?.instrumentId ?? ""}
          </Text>
          <View style={[styles.playbackSection, { borderBottomColor: C.border }]}>
            <Text style={[styles.playbackSectionTitle, { color: C.textSecondary }]}>
              {t("scoreMode", "playbackSettings")}
            </Text>
            <View style={[styles.symbolRow, { borderBottomColor: C.border }]}>
              <Text style={[styles.symbolRowLabel, { color: C.text }]}>
                {t("scoreMode", "showPlayhead")}
              </Text>
              <Switch
                value={showPlayhead}
                onValueChange={(v) => onUpdatePlaybackSettings({ showPlayhead: v })}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor={showPlayhead ? "#fff" : "#ccc"}
                testID="score-toggle-show-playhead"
              />
            </View>
            <View style={[styles.symbolRow, { borderBottomColor: C.border }]}>
              <Text style={[styles.symbolRowLabel, { color: C.text }]}>
                {t("scoreMode", "showZoomView")}
              </Text>
              <Switch
                value={showZoomView}
                onValueChange={(v) => onUpdatePlaybackSettings({ showZoomView: v })}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor={showZoomView ? "#fff" : "#ccc"}
                testID="score-toggle-show-zoom-view"
              />
            </View>
            <View style={[styles.symbolRow, { borderBottomColor: C.border }]}>
              <Text style={[styles.symbolRowLabel, { color: C.text }]}>
                {t("scoreMode", "notePreview")}
              </Text>
              <Switch
                value={notePreviewEnabled}
                onValueChange={(v) => onUpdatePlaybackSettings({ notePreview: v })}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor={notePreviewEnabled ? "#fff" : "#ccc"}
                testID="score-toggle-note-preview"
              />
            </View>
          </View>
          <ScrollView style={styles.symbolModalList} showsVerticalScrollIndicator={false}>
            {ALL_INSTR_SYMBOLS.map((sym) => {
              const enabled = (currentPart?.enabledSymbols ?? {})[sym.id] !== false;
              return (
                <View key={sym.id} style={[styles.symbolRow, { borderBottomColor: C.border }]}>
                  <Text style={[styles.symbolRowSym, { color: C.accent }]}>{sym.symbol}</Text>
                  <Text style={[styles.symbolRowLabel, { color: C.text }]}>
                    {t("scoreMode", sym.labelKey as any) || sym.id}
                  </Text>
                  <Switch
                    value={enabled}
                    onValueChange={(v) => onSymbolToggle(sym.id, v)}
                    trackColor={{ false: C.border, true: C.accent }}
                    thumbColor={enabled ? "#fff" : "#ccc"}
                    testID={`score-symbol-toggle-${sym.id}`}
                  />
                </View>
              );
            })}
          </ScrollView>
          <Pressable
            style={[styles.symbolModalClose, { backgroundColor: C.accent }]}
            onPress={onClose}
            testID="score-symbol-settings-done"
          >
            <Text style={styles.symbolModalCloseText}>{t("scoreMode", "done")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 4. 마디 컨텍스트 메뉴
// ═══════════════════════════════════════════════════════════════════

export interface ScoreMeasureContextMenuProps {
  measureIdx: number | null;
  visible: boolean;
  hasLink: boolean;
  /** 복사/이동 대상이 되는 선택된 마디 개수 (0 또는 1이면 현재 마디만 대상) */
  selectionCount: number;
  /** 붙여넣을 클립보드 내용이 있는지 여부 */
  hasClipboard: boolean;
  onClose: () => void;
  onCopy: (mIdx: number) => void;
  onCut: (mIdx: number) => void;
  onPaste: (mIdx: number) => void;
  onAddRehearsal: (mIdx: number) => void;
  onClearSigns: (mIdx: number) => void;
  onEditLink: (mIdx: number) => void;
  onClearLink: (mIdx: number) => void;
  onDelete: (mIdx: number) => void;
}

export function ScoreMeasureContextMenu({
  measureIdx,
  visible,
  hasLink,
  selectionCount,
  hasClipboard,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onAddRehearsal,
  onClearSigns,
  onEditLink,
  onClearLink,
  onDelete,
}: ScoreMeasureContextMenuProps) {
  const { C, styles } = useEditorStyles();
  const { t } = useLanguage();
  const idx = measureIdx ?? 0;
  const count = Math.max(selectionCount, 1);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.symbolModalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.symbolModalCard, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.symbolModalTitle, { color: C.text }]}>
            {t("scoreMode", "measureOptions")} #{idx + 1}
            {count > 1 ? ` (${count}${t("scoreMode", "groupBarSelectedCount")})` : ""}
          </Text>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={() => onCopy(idx)}
            testID="score-ctx-copy-measure"
          >
            <Ionicons name="copy-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>
              {t("scoreMode", "measureCopyAction")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={() => onCut(idx)}
            testID="score-ctx-move-measure"
          >
            <Ionicons name="cut-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>
              {t("scoreMode", "measureMoveAction")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border, opacity: hasClipboard ? 1 : 0.4 }]}
            onPress={() => hasClipboard && onPaste(idx)}
            disabled={!hasClipboard}
            testID="score-ctx-paste-measure"
          >
            <Ionicons name="clipboard-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>
              {t("scoreMode", "measurePasteAction")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={() => onAddRehearsal(idx)}
          >
            <Ionicons name="bookmark-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>
              {t("scoreMode", "measureAddRehearsal")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={() => onClearSigns(idx)}
          >
            <Ionicons name="trash-outline" size={18} color="#FF453A" />
            <Text style={[styles.ctxMenuLabel, { color: "#FF453A" }]}>
              {t("scoreMode", "measureClearSigns")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={() => onEditLink(idx)}
            testID="score-ctx-edit-link"
          >
            <Ionicons name="link-outline" size={18} color={C.accent} />
            <Text style={[styles.ctxMenuLabel, { color: C.text }]}>
              {t("scoreMode", "editLinkEntry")}
            </Text>
          </Pressable>
          {hasLink && (
            <Pressable
              style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
              onPress={() => onClearLink(idx)}
              testID="score-ctx-clear-link"
            >
              <Ionicons name="unlink-outline" size={18} color={C.accent} />
              <Text style={[styles.ctxMenuLabel, { color: C.text }]}>
                {t("scoreMode", "clearLink")}
              </Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.ctxMenuItem, { borderBottomColor: C.border }]}
            onPress={() => onDelete(idx)}
            testID="score-ctx-delete-measure"
          >
            <Ionicons name="trash-outline" size={18} color="#FF453A" />
            <Text style={[styles.ctxMenuLabel, { color: "#FF453A" }]}>
              {t("scoreMode", "deleteMeasure")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.symbolModalClose, { backgroundColor: C.border }]}
            onPress={onClose}
          >
            <Text style={[styles.symbolModalCloseText, { color: C.text }]}>
              {t("scoreMode", "done")}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 4-0. 마디별 조표(키시그니처) 선택 모달
// ═══════════════════════════════════════════════════════════════════

export interface ScoreKeySigPickerModalProps {
  visible: boolean;
  value: number;
  onClose: () => void;
  onSelect: (sharps: number) => void;
}

export function ScoreKeySigPickerModal({
  visible,
  value,
  onClose,
  onSelect,
}: ScoreKeySigPickerModalProps) {
  const { C, styles } = useEditorStyles();
  const { t } = useLanguage();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.symbolModalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.symbolModalCard, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.symbolModalTitle, { color: C.text }]}>
            {t("scoreMode", "measureKeySigChange")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 12 }}>
            {KEY_SIGNATURES.map(({ sharps }) => {
              const selected = sharps === value;
              return (
                <Pressable
                  key={sharps}
                  style={[
                    styles.drawerApplyBtn,
                    {
                      backgroundColor: selected ? C.accent : C.surface,
                      borderWidth: 1,
                      borderColor: selected ? C.accent : C.border,
                      minWidth: 64,
                    },
                  ]}
                  onPress={() => onSelect(sharps)}
                  testID={`score-keysig-option-${sharps}`}
                >
                  <Text style={[styles.drawerApplyBtnText, { color: selected ? undefined : C.text }]}>
                    {getKeySignatureLabel(sharps)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={[styles.symbolModalClose, { backgroundColor: C.border }]}
            onPress={onClose}
            testID="score-keysig-picker-done"
          >
            <Text style={[styles.symbolModalCloseText, { color: C.text }]}>
              {t("scoreMode", "done")}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 4-1. PNG 내보내기 옵션 모달 (줄당 마디 수 선택)
// ═══════════════════════════════════════════════════════════════════

const PNG_EXPORT_MPL_OPTIONS = [undefined, 1, 2, 3, 4, 5, 6, 8] as const;
const PNG_EXPORT_LPP_OPTIONS = [undefined, 1, 2, 3, 4, 5] as const;

export interface ScorePngExportOptionsModalProps {
  visible: boolean;
  value: number | undefined;
  linesPerPage: number | undefined;
  previewPages: ScoreDocument[];
  previewWidth: number;
  onClose: () => void;
  onChange: (mpl: number | undefined) => void;
  onChangeLinesPerPage: (lpp: number | undefined) => void;
  onConfirm: () => void;
}

export function ScorePngExportOptionsModal({
  visible,
  value,
  linesPerPage,
  previewPages,
  previewWidth,
  onClose,
  onChange,
  onChangeLinesPerPage,
  onConfirm,
}: ScorePngExportOptionsModalProps) {
  const { C, styles } = useEditorStyles();
  const { t } = useLanguage();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.symbolModalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.symbolModalCard, { backgroundColor: C.surface, borderColor: C.border, maxHeight: "85%" }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.symbolModalTitle, { color: C.text }]}>
            {t("scoreMode", "pngExportOptionsTitle")}
          </Text>
          <Text style={[styles.drawerFieldLabel, { color: C.textSecondary, marginBottom: 8 }]}>
            {t("scoreMode", "pngExportPerLineLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {PNG_EXPORT_MPL_OPTIONS.map((opt) => {
              const selected = opt === value;
              return (
                <Pressable
                  key={String(opt)}
                  style={[
                    styles.drawerApplyBtn,
                    {
                      backgroundColor: selected ? C.accent : C.surface,
                      borderWidth: 1,
                      borderColor: selected ? C.accent : C.border,
                      minWidth: 44,
                    },
                  ]}
                  onPress={() => onChange(opt)}
                  testID={`score-png-export-mpl-${opt ?? "auto"}`}
                >
                  <Text
                    style={[
                      styles.drawerApplyBtnText,
                      { color: selected ? "#fff" : C.text },
                    ]}
                  >
                    {opt ? String(opt) : t("scoreMode", "drawerMeasuresPerLineAuto")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.drawerFieldLabel, { color: C.textSecondary, marginBottom: 8 }]}>
            {t("scoreMode", "pngExportLinesPerPageLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {PNG_EXPORT_LPP_OPTIONS.map((opt) => {
              const selected = opt === linesPerPage;
              return (
                <Pressable
                  key={String(opt)}
                  style={[
                    styles.drawerApplyBtn,
                    {
                      backgroundColor: selected ? C.accent : C.surface,
                      borderWidth: 1,
                      borderColor: selected ? C.accent : C.border,
                      minWidth: 44,
                    },
                  ]}
                  onPress={() => onChangeLinesPerPage(opt)}
                  testID={`score-png-export-lpp-${opt ?? "none"}`}
                >
                  <Text
                    style={[
                      styles.drawerApplyBtnText,
                      { color: selected ? "#fff" : C.text },
                    ]}
                  >
                    {opt ? String(opt) : t("scoreMode", "pngExportLinesPerPageNone")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.drawerFieldLabel, { color: C.textSecondary, marginBottom: 4 }]}>
            {t("scoreMode", "pngExportPreviewTitle")}
          </Text>
          <Text style={{ fontSize: 11, color: C.textSecondary, marginBottom: 8 }}>
            {t("scoreMode", "pngExportPreviewHint")}
          </Text>
          <ScrollView
            style={{ maxHeight: 320, borderWidth: 1, borderColor: C.border, borderRadius: 8, marginBottom: 12 }}
            contentContainerStyle={{ padding: 8 }}
            testID="score-png-export-preview-scroll"
          >
            {previewPages.map((pageDoc, idx) => (
              <View
                key={idx}
                style={{
                  marginBottom: idx < previewPages.length - 1 ? 16 : 0,
                  borderWidth: 1,
                  borderColor: C.border,
                  borderRadius: 6,
                  overflow: "hidden",
                  backgroundColor: "#ffffff",
                }}
                testID={`score-png-export-preview-page-${idx}`}
              >
                {previewPages.length > 1 && (
                  <View style={{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: C.surfaceLight }}>
                    <Text style={{ fontSize: 11, color: C.text, textAlign: "center" }}>
                      {t("scoreMode", "pngExportPreviewPageLabel")} {idx + 1} / {previewPages.length}
                    </Text>
                  </View>
                )}

                <ScoreRenderer doc={pageDoc} containerWidth={previewWidth} showPartNames />
              </View>
            ))}
          </ScrollView>

          <Pressable
            style={[styles.symbolModalClose, { backgroundColor: C.accent }]}
            onPress={onConfirm}
            testID="score-png-export-confirm"
          >
            <Text style={[styles.symbolModalCloseText, { color: "#fff" }]}>
              {t("scoreMode", "pngExportConfirm")}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 5. 악보 메타데이터 편집 모달
// ═══════════════════════════════════════════════════════════════════

type MetaDraft = {
  title: string;
  subtitle: string;
  composer: string;
  arranger: string;
  lyricist: string;
  copyright: string;
  difficulty: ScoreMetadata["difficulty"];
  memo: string;
} | null;

export interface ScoreMetaModalProps {
  visible: boolean;
  metaDraft: MetaDraft;
  onClose: () => void;
  onChangeDraft: (updater: (d: MetaDraft) => MetaDraft) => void;
  onSave: () => void;
}

export function ScoreMetaModal({
  visible,
  metaDraft,
  onClose,
  onChangeDraft,
  onSave,
}: ScoreMetaModalProps) {
  const { C, styles } = useEditorStyles();
  const { t } = useLanguage();

  return (
    <Modal
      visible={visible && !!metaDraft}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.symbolModalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.symbolModalCard, { backgroundColor: C.surface, borderColor: C.border, maxHeight: "80%" }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.symbolModalTitle, { color: C.text }]}>
            {t("scoreMode", "editMetadata")}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.metaFieldLabel, { color: C.textSecondary }]}>{t("scoreMode", "title")}</Text>
            <TextInput
              style={[styles.metaInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
              value={metaDraft?.title ?? ""}
              onChangeText={(v) => onChangeDraft((d) => d ? { ...d, title: v } : d)}
              placeholder={t("scoreMode", "untitled")}
              placeholderTextColor={C.textSecondary}
              testID="score-meta-title"
            />
            <Text style={[styles.metaFieldLabel, { color: C.textSecondary }]}>{t("scoreMode", "metaSubtitle")}</Text>
            <TextInput
              style={[styles.metaInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
              value={metaDraft?.subtitle ?? ""}
              onChangeText={(v) => onChangeDraft((d) => d ? { ...d, subtitle: v } : d)}
              placeholderTextColor={C.textSecondary}
            />
            <Text style={[styles.metaFieldLabel, { color: C.textSecondary }]}>{t("scoreMode", "metaComposer")}</Text>
            <TextInput
              style={[styles.metaInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
              value={metaDraft?.composer ?? ""}
              onChangeText={(v) => onChangeDraft((d) => d ? { ...d, composer: v } : d)}
              placeholderTextColor={C.textSecondary}
              testID="score-meta-composer"
            />
            <Text style={[styles.metaFieldLabel, { color: C.textSecondary }]}>{t("scoreMode", "metaArranger")}</Text>
            <TextInput
              style={[styles.metaInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
              value={metaDraft?.arranger ?? ""}
              onChangeText={(v) => onChangeDraft((d) => d ? { ...d, arranger: v } : d)}
              placeholderTextColor={C.textSecondary}
            />
            <Text style={[styles.metaFieldLabel, { color: C.textSecondary }]}>{t("scoreMode", "metaLyricist")}</Text>
            <TextInput
              style={[styles.metaInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
              value={metaDraft?.lyricist ?? ""}
              onChangeText={(v) => onChangeDraft((d) => d ? { ...d, lyricist: v } : d)}
              placeholderTextColor={C.textSecondary}
            />
            <Text style={[styles.metaFieldLabel, { color: C.textSecondary }]}>{t("scoreMode", "metaCopyright")}</Text>
            <TextInput
              style={[styles.metaInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
              value={metaDraft?.copyright ?? ""}
              onChangeText={(v) => onChangeDraft((d) => d ? { ...d, copyright: v } : d)}
              placeholderTextColor={C.textSecondary}
            />
            <Text style={[styles.metaFieldLabel, { color: C.textSecondary }]}>{t("scoreMode", "metaDifficulty")}</Text>
            <View style={styles.diffRow}>
              {(["beginner", "intermediate", "advanced", "expert"] as const).map((d) => (
                <Pressable
                  key={d}
                  style={[
                    styles.diffBtn,
                    {
                      borderColor: metaDraft?.difficulty === d ? C.accent : C.border,
                      backgroundColor: metaDraft?.difficulty === d ? C.accent + "22" : "transparent",
                    },
                  ]}
                  onPress={() => onChangeDraft((prev) => prev ? { ...prev, difficulty: d } : prev)}
                >
                  <Text style={[styles.diffBtnText, { color: metaDraft?.difficulty === d ? C.accent : C.textSecondary }]}>
                    {t("scoreMode", `diff${d.charAt(0).toUpperCase()}${d.slice(1)}` as any)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.metaFieldLabel, { color: C.textSecondary }]}>{t("scoreMode", "metaMemo")}</Text>
            <TextInput
              style={[styles.metaInput, styles.metaInputMulti, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
              value={metaDraft?.memo ?? ""}
              onChangeText={(v) => onChangeDraft((d) => d ? { ...d, memo: v } : d)}
              multiline
              numberOfLines={3}
              placeholderTextColor={C.textSecondary}
            />
          </ScrollView>
          <Pressable
            style={[styles.symbolModalClose, { backgroundColor: C.accent }]}
            onPress={onSave}
            testID="score-meta-save"
          >
            <Text style={styles.symbolModalCloseText}>{t("scoreMode", "done")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 6. 마디 인라인 편집 모달
// ═══════════════════════════════════════════════════════════════════

type MeasureEditTarget = {
  measureIdx: number;
  field: "bpm" | "timeSig" | "linkedEntry";
  value: string;
  label: string;
  hint: string;
} | null;

export interface ScoreMeasureEditModalProps {
  visible: boolean;
  editTarget: MeasureEditTarget;
  onClose: () => void;
  onChangeTarget: (updater: (t: MeasureEditTarget) => MeasureEditTarget) => void;
  onSave: () => void;
}

export function ScoreMeasureEditModal({
  visible,
  editTarget,
  onClose,
  onChangeTarget,
  onSave,
}: ScoreMeasureEditModalProps) {
  const { C, styles } = useEditorStyles();
  const { t } = useLanguage();

  return (
    <Modal
      visible={visible && !!editTarget}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.symbolModalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.symbolModalCard, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.symbolModalTitle, { color: C.text }]}>
            {editTarget?.label ?? ""}
          </Text>
          <Text style={[styles.metaFieldLabel, { color: C.textSecondary }]}>
            {editTarget?.hint ?? ""}
          </Text>
          <TextInput
            style={[styles.metaInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
            value={editTarget?.value ?? ""}
            onChangeText={(v) => onChangeTarget((tgt) => tgt ? { ...tgt, value: v } : tgt)}
            keyboardType={editTarget?.field === "bpm" ? "number-pad" : "default"}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onSave}
            testID="score-measure-edit-input"
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Pressable
              style={[styles.symbolModalClose, { flex: 1, backgroundColor: C.border }]}
              onPress={onClose}
            >
              <Text style={[styles.symbolModalCloseText, { color: C.text }]}>{t("scoreMode", "cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.symbolModalClose, { flex: 1, backgroundColor: C.accent }]}
              onPress={onSave}
              testID="score-measure-edit-save"
            >
              <Text style={styles.symbolModalCloseText}>{t("scoreMode", "done")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ============================================================
// ScoreListScreen — 악보 목록 화면
// ============================================================

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import {
  loadScoreList,
  saveScore,
  deleteScore,
  duplicateScore,
} from "@/lib/score-storage";
import type { ScoreListItem, ScoreDocument } from "@/lib/score-types";
import { ScoreNewModal } from "@/components/ScoreNewModal";
import { importScoreFromJson } from "@/lib/score-io";

export interface ScoreListScreenProps {
  defaultBpm: number;
  onClose: () => void;
  onOpenEditor: (doc: ScoreDocument) => void;
}

export function ScoreListScreen({ defaultBpm, onClose, onOpenEditor }: ScoreListScreenProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topInset = insets.top || webTopInset;
  const bottomInset = insets.bottom || (Platform.OS === "web" ? 34 : 0);

  const [list, setList] = useState<ScoreListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  const styles = makeStyles(C, S);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const items = await loadScoreList();
      setList(items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate(doc: ScoreDocument) {
    await saveScore(doc);
    setShowNewModal(false);
    await refresh();
    onOpenEditor(doc);
  }

  async function handleDelete(id: string, title: string) {
    const doDelete = async () => {
      await deleteScore(id);
      await refresh();
    };
    if (Platform.OS === "web") {
      if (window.confirm(t("scoreMode", "deleteConfirm"))) await doDelete();
      return;
    }
    Alert.alert(
      t("scoreMode", "delete"),
      t("scoreMode", "deleteConfirm"),
      [
        { text: t("scoreMode", "cancel"), style: "cancel" },
        { text: t("scoreMode", "delete"), style: "destructive", onPress: doDelete },
      ],
    );
  }

  async function handleDuplicate(id: string) {
    const copy = await duplicateScore(id);
    if (copy) {
      await refresh();
    }
  }

  async function handleImport() {
    const result = await importScoreFromJson();
    if (result.success && result.doc) {
      await refresh();
      onOpenEditor(result.doc);
    } else if (result.errorCode && result.errorCode !== "cancelled") {
      Alert.alert(t("scoreMode", "importJson"), t("scoreMode", "importFail"));
    }
  }

  function formatTimeSig(ts: { numerator: number; denominator: number }) {
    return `${ts.numerator}/${ts.denominator}`;
  }

  function formatDate(ms: number) {
    const d = new Date(ms);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }

  function renderItem({ item }: { item: ScoreListItem }) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: C.surface, borderColor: C.border },
          pressed && { opacity: 0.8 },
        ]}
        onPress={() => {
          // 편집기 열기를 위해 전체 문서 로드 필요
          loadScoreListAndOpen(item.id);
        }}
        testID={`score-list-item-${item.id}`}
      >
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons
            name="music-note-whole"
            size={S.ms(20, 0.4)}
            color={C.accent}
          />
          <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.metaText, { color: C.textSecondary }]}>
            {item.measureCount} {t("scoreMode", "measures")}
          </Text>
          <Text style={[styles.metaDot, { color: C.border }]}>·</Text>
          <Text style={[styles.metaText, { color: C.textSecondary }]}>
            {item.bpm} {t("scoreMode", "bpmLabel")}
          </Text>
          <Text style={[styles.metaDot, { color: C.border }]}>·</Text>
          <Text style={[styles.metaText, { color: C.textSecondary }]}>
            {formatTimeSig(item.timeSignature)}
          </Text>
          <Text style={[styles.metaDot, { color: C.border }]}>·</Text>
          <Text style={[styles.metaText, { color: C.textSecondary }]}>
            {item.partCount} {t("scoreMode", "parts")}
          </Text>
        </View>
        <View style={styles.cardFooter}>
          <Text style={[styles.dateText, { color: C.textSecondary }]}>
            {formatDate(item.updatedAt)}
          </Text>
          <View style={styles.cardActions}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, { borderColor: C.border }, pressed && { opacity: 0.6 }]}
              onPress={() => handleDuplicate(item.id)}
              hitSlop={8}
              testID={`score-list-duplicate-${item.id}`}
            >
              <Ionicons name="copy-outline" size={S.ms(14, 0.4)} color={C.textSecondary} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, { borderColor: C.border }, pressed && { opacity: 0.6 }]}
              onPress={() => handleDelete(item.id, item.title)}
              hitSlop={8}
              testID={`score-list-delete-${item.id}`}
            >
              <Ionicons name="trash-outline" size={S.ms(14, 0.4)} color="#E55" />
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  }

  async function loadScoreListAndOpen(id: string) {
    const { loadScore } = await import("@/lib/score-storage");
    const doc = await loadScore(id);
    if (doc) {
      onOpenEditor(doc);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* 헤더 */}
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: C.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          onPress={onClose}
          hitSlop={12}
          testID="score-list-back"
        >
          <Ionicons name="chevron-back" size={S.ms(24, 0.4)} color={C.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: C.text }]}>{t("scoreMode", "title")}</Text>
        <Pressable
          style={({ pressed }) => [styles.importBtn, { borderColor: C.border }, pressed && { opacity: 0.7 }]}
          onPress={handleImport}
          testID="score-list-import"
          hitSlop={8}
        >
          <Ionicons name="folder-open-outline" size={S.ms(18, 0.4)} color={C.text} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.newBtn, { backgroundColor: C.accent }, pressed && { opacity: 0.8 }]}
          onPress={() => setShowNewModal(true)}
          testID="score-list-new"
        >
          <Ionicons name="add" size={S.ms(18, 0.4)} color="#fff" />
          <Text style={styles.newBtnText}>{t("scoreMode", "newScore")}</Text>
        </Pressable>
      </View>

      {/* 목록 */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="music-note-outline"
            size={64}
            color={C.border}
          />
          <Text style={[styles.emptyTitle, { color: C.text }]}>{t("scoreMode", "emptyList")}</Text>
          <Text style={[styles.emptyHint, { color: C.textSecondary }]}>{t("scoreMode", "emptyListHint")}</Text>
          <Pressable
            style={[styles.emptyCreateBtn, { backgroundColor: C.accent }]}
            onPress={() => setShowNewModal(true)}
            testID="score-list-empty-new"
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.emptyCreateText}>{t("scoreMode", "newScore")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: bottomInset + Spacing.lg }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          testID="score-list"
        />
      )}

      {/* 새 악보 모달 */}
      <ScoreNewModal
        visible={showNewModal}
        defaultBpm={defaultBpm}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreate}
      />
    </View>
  );
}

const makeStyles = (C: any, S: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.lg,
      paddingBottom: 12,
      borderBottomWidth: 1,
      gap: Spacing.md,
    },
    backBtn: {
      padding: 4,
    },
    headerTitle: {
      flex: 1,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
    },
    importBtn: {
      borderWidth: 1,
      borderRadius: Radius.md,
      padding: 8,
    },
    newBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      borderRadius: Radius.md,
    },
    newBtnText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.small,
      color: "#fff",
    },
    card: {
      borderWidth: 1,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      gap: 6,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    cardTitle: {
      flex: 1,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    cardMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexWrap: "wrap",
    },
    metaText: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    metaDot: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 2,
    },
    dateText: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 11,
    },
    cardActions: {
      flexDirection: "row",
      gap: 6,
    },
    actionBtn: {
      borderWidth: 1,
      borderRadius: Radius.sm,
      padding: 5,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: Spacing.xl,
    },
    emptyTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
      textAlign: "center",
    },
    emptyHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.body,
      textAlign: "center",
    },
    emptyCreateBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: Spacing.lg,
      paddingVertical: 12,
      borderRadius: Radius.md,
      marginTop: 8,
    },
    emptyCreateText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
      color: "#fff",
    },
  });

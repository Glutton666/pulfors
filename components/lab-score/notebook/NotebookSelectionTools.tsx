import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NotebookSelectionUnit } from "@/lib/notebook-editing";

type Tool = "pen" | "erase" | "move" | "select";
type ClipboardItem = { id: string; label: string; count: number };

type Props = {
  ko: boolean;
  tool: Tool;
  onTool: (tool: Tool) => void;
  selectionCount: number;
  selectionUnit?: NotebookSelectionUnit;
  onSelectionUnit?: (unit: NotebookSelectionUnit) => void;
  onEditSelection?: () => void;
  onClearSelection: () => void;
  onSaveClipboard: () => void;
  onDeleteSelection: () => void;
  onResizeSelection: (factor: number) => void;
  clipboard: ClipboardItem[];
  onPaste: (id: string) => void;
};

type Tab = "select" | "clipboard";

export function NotebookSelectionTools(props: Props) {
  const [tab, setTab] = useState<Tab>("select");
  const [resizeOpen, setResizeOpen] = useState(false);
  const selectedUnit = props.selectionUnit ?? "object";
  const hasSelection = props.selectionCount > 0;

  useEffect(() => {
    if (!hasSelection) setResizeOpen(false);
  }, [hasSelection]);

  const unitLabels: Record<NotebookSelectionUnit, string> = {
    object: props.ko ? "개별·영역" : "Objects",
    measure: props.ko ? "마디" : "Measure",
    row: props.ko ? "줄" : "Row",
  };

  const handleResize = (factor: number) => {
    props.onResizeSelection(factor);
    setResizeOpen(false);
  };

  return (
    <View style={styles.dock}>
      <View style={styles.tabs} accessibilityRole="tablist">
        <Pressable
          testID="notebook-selection-tab"
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "select" }}
          onPress={() => { setTab("select"); setResizeOpen(false); }}
          style={[styles.tab, tab === "select" && styles.activeTab]}
        >
          <Ionicons name="scan-outline" size={15} color={tab === "select" ? "#725735" : "#9a8a70"} />
          <Text style={[styles.tabText, tab === "select" && styles.activeTabText]}>{props.ko ? "선택" : "Selection"}</Text>
        </Pressable>
        <Pressable
          testID="notebook-clipboard-tab"
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "clipboard" }}
          onPress={() => { setTab("clipboard"); setResizeOpen(false); }}
          style={[styles.tab, tab === "clipboard" && styles.activeTab]}
        >
          <Ionicons name="albums-outline" size={15} color={tab === "clipboard" ? "#725735" : "#9a8a70"} />
          <Text style={[styles.tabText, tab === "clipboard" && styles.activeTabText]}>
            {props.ko ? "클립보드" : "Clipboard"} <Text style={styles.tabCount}>· {props.clipboard.length}</Text>
          </Text>
        </Pressable>
        <Pressable
          testID="notebook-tool-select"
          accessibilityRole="button"
          accessibilityLabel={props.ko
            ? `범위 선택${hasSelection ? `, ${props.selectionCount}개 선택됨` : ""}`
            : `Select area${hasSelection ? `, ${props.selectionCount} selected` : ""}`}
          accessibilityState={{ selected: props.tool === "select" }}
          onPress={() => props.onTool("select")}
          style={[styles.countButton, props.tool === "select" && styles.countButtonActive]}
        >
          <Ionicons name="scan-outline" size={15} color="#725735" />
          <Text style={styles.countValue}>{props.selectionCount}</Text>
        </Pressable>
      </View>

      {tab === "select" ? (
        <View style={styles.selectionBody}>
          <View style={styles.unitRow}>
            {(["object", "measure", "row"] as const).map((unit) => (
              <Pressable
                key={unit}
                testID={`notebook-select-${unit}`}
                accessibilityRole="button"
                accessibilityLabel={unitLabels[unit]}
                accessibilityState={{ selected: selectedUnit === unit }}
                onPress={() => props.onSelectionUnit?.(unit)}
                style={[styles.unitButton, selectedUnit === unit && styles.unitButtonActive]}
              >
                <Text style={[styles.unitText, selectedUnit === unit && styles.unitTextActive]}>{unitLabels[unit]}</Text>
              </Pressable>
            ))}
          </View>

          {hasSelection && (
            <View style={styles.actionRow}>
              <Pressable
                testID="notebook-edit-selection"
                accessibilityRole="button"
                accessibilityLabel={props.ko ? "선택 항목 내부 편집" : "Edit selection"}
                onPress={props.onEditSelection}
                style={[styles.actionButton, styles.editButton]}
              >
                <Text style={styles.actionText}>{props.ko ? "편집" : "Edit"}</Text>
              </Pressable>
              <Pressable
                testID="notebook-clipboard-save"
                accessibilityRole="button"
                accessibilityLabel={props.ko ? "선택 묶음 저장" : "Save selection to clipboard"}
                onPress={props.onSaveClipboard}
                style={[styles.actionButton, styles.saveButton]}
              >
                <Text style={styles.saveText}>{props.ko ? "보관" : "Save"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.ko ? "선택 항목 삭제" : "Delete selection"}
                onPress={props.onDeleteSelection}
                style={[styles.actionButton, styles.deleteButton]}
              >
                <Text style={styles.deleteText}>{props.ko ? "삭제" : "Delete"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.ko ? "선택 해제" : "Clear selection"}
                onPress={() => { props.onClearSelection(); setResizeOpen(false); }}
                style={[styles.actionButton, styles.clearButton]}
              >
                <Text style={styles.actionText}>{props.ko ? "해제" : "Clear"}</Text>
              </Pressable>
              <View style={styles.resizeAnchor}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={props.ko ? "선택 크기 조절" : "Resize selection"}
                  accessibilityState={{ expanded: resizeOpen }}
                  onPress={() => setResizeOpen((open) => !open)}
                  style={[styles.resizeButton, resizeOpen && styles.resizeButtonActive]}
                >
                  <Ionicons name="resize-outline" size={16} color="#725b3c" />
                </Pressable>
                {resizeOpen && (
                  <View style={styles.resizeMenu}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={props.ko ? "선택 크기 줄이기" : "Shrink selection"}
                      onPress={() => handleResize(0.9)}
                      style={styles.resizeOption}
                    >
                      <Ionicons name="remove" size={16} color="#675d50" />
                      <Text style={styles.resizeLabel}>{props.ko ? "줄이기" : "Shrink"}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={props.ko ? "선택 크기 키우기" : "Grow selection"}
                      onPress={() => handleResize(1.1)}
                      style={styles.resizeOption}
                    >
                      <Ionicons name="add" size={16} color="#675d50" />
                      <Text style={styles.resizeLabel}>{props.ko ? "키우기" : "Grow"}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.clipboardList}
          contentContainerStyle={styles.clipboardContent}
          showsVerticalScrollIndicator={props.clipboard.length > 3}
          keyboardShouldPersistTaps="handled"
        >
          {props.clipboard.length > 0 ? props.clipboard.map((item) => (
            <Pressable
              key={item.id}
              testID={`notebook-paste-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${props.ko ? "붙여넣기" : "Paste"} ${item.label}`}
              onPress={() => props.onPaste(item.id)}
              style={styles.bundleButton}
            >
              <Ionicons name="albums-outline" size={17} color="#725b3c" />
              <View style={styles.bundleCopy}>
                <Text numberOfLines={1} style={styles.bundleName}>{item.label}</Text>
                <Text style={styles.bundleMeta}>{item.count} {props.ko ? "개체" : "objects"}</Text>
              </View>
              <Ionicons name="add-circle-outline" size={18} color="#927a57" />
            </Pressable>
          )) : (
            <View style={styles.emptyState}>
              <Ionicons name="albums-outline" size={18} color="#a69578" />
              <Text style={styles.emptyText}>
                {props.ko ? "선택한 묶음을 보관하면 여기에 나타납니다." : "Saved bundles will appear here."}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "relative",
    alignSelf: "center",
    zIndex: 25,
    elevation: 12,
    overflow: "visible",
    width: "100%",
    maxWidth: 636,
    maxHeight: 166,
    paddingBottom: 4,
    backgroundColor: "transparent",
  },
  tabs: {
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 7,
    paddingTop: 5,
    paddingBottom: 5,
  },
  tab: {
    minHeight: 40,
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e8e0d4",
    backgroundColor: "#fbf8f1",
  },
  activeTab: { borderColor: "#cbb894", backgroundColor: "#f1e9dc" },
  tabText: { color: "#766b59", fontSize: 11, fontWeight: "700", flexShrink: 1, textAlign: "center" },
  activeTabText: { color: "#59462e" },
  tabCount: { color: "#9a8a70", fontWeight: "600" },
  countButton: {
    minWidth: 52,
    minHeight: 40,
    flex: 0.65,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e4d8c5",
    backgroundColor: "#fffdf9",
  },
  countButtonActive: { borderColor: "#bca483", backgroundColor: "#f2ece2" },
  countValue: { color: "#604b30", fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  selectionBody: { paddingHorizontal: 7, gap: 5 },
  unitRow: { minHeight: 44, flexDirection: "row", gap: 5 },
  unitButton: {
    minWidth: 0,
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e8e0d4",
    backgroundColor: "#fffdf9",
  },
  unitButtonActive: { borderColor: "#bca483", backgroundColor: "#f0e7d9" },
  unitText: { color: "#786c58", fontSize: 11, fontWeight: "600", textAlign: "center" },
  unitTextActive: { color: "#59462e", fontWeight: "700" },
  actionRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 },
  actionButton: {
    minWidth: 0,
    flex: 1,
    height: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e8e0d4",
    backgroundColor: "#fffdf9",
  },
  editButton: { backgroundColor: "#f3ede3", borderColor: "#ded0ba" },
  saveButton: { flex: 1.05, backgroundColor: "#806744", borderColor: "#806744" },
  deleteButton: { backgroundColor: "#f7eee8", borderColor: "#ead8cd" },
  clearButton: { backgroundColor: "#f5f1e9" },
  actionText: { color: "#6c604e", fontSize: 11, fontWeight: "700", textAlign: "center" },
  saveText: { color: "#fffaf1", fontSize: 11, fontWeight: "700", textAlign: "center" },
  deleteText: { color: "#925d4c", fontSize: 11, fontWeight: "700", textAlign: "center" },
  resizeAnchor: { width: 44, height: 44, position: "relative" },
  resizeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e4d8c5",
    backgroundColor: "#f7f3ec",
  },
  resizeButtonActive: { backgroundColor: "#eee5d7", borderColor: "#bca483" },
  resizeMenu: {
    position: "absolute",
    right: 0,
    bottom: 40,
    zIndex: 40,
    width: 106,
    padding: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ded3c2",
    backgroundColor: "#fffdf8",
    shadowColor: "#403321",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 18,
  },
  resizeOption: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 7, borderRadius: 7 },
  resizeLabel: { color: "#6c604e", fontSize: 11, fontWeight: "600" },
  clipboardList: { height: 104, marginHorizontal: 8, borderRadius: 9 },
  clipboardContent: { gap: 5, paddingBottom: 3 },
  bundleButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#e8e0d4",
    backgroundColor: "#fffdf9",
  },
  bundleCopy: { flex: 1, minWidth: 0 },
  bundleName: { color: "#594a35", fontSize: 12, fontWeight: "700" },
  bundleMeta: { color: "#9a8a70", fontSize: 11, marginTop: 1 },
  emptyState: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#dfd3c1",
    backgroundColor: "#faf7f0",
  },
  emptyText: { maxWidth: 250, color: "#887a63", fontSize: 11, textAlign: "center" },
});

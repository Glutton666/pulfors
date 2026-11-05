import React, { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

type InkTool = "pen" | "erase" | "move";
type Props = {
  ko: boolean;
  tool: InkTool | "select";
  scale: number;
  canUndo: boolean;
  canRedo: boolean;
  pickerTop: number;
  pickerBottom: number;
  layoutKey?: number;
  onTool: (tool: InkTool) => void;
  onToolPopup: (popup: "pen" | "erase" | null) => void;
  onZoom: (scale: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPreferredWidth?: (contentWidth: number) => void;
};

const toolDetails: Record<InkTool, { icon: keyof typeof Ionicons.glyphMap; en: string; ko: string }> = {
  pen: { icon: "pencil-outline", en: "Pen", ko: "펜" },
  erase: { icon: "backspace-outline", en: "Eraser", ko: "지우개" },
  move: { icon: "hand-left-outline", en: "Pan", ko: "화면 이동" },
};
const toolChoices: InkTool[] = ["pen", "erase", "move"];

export function NotebookInkToolbar(props: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const buttonRef = useRef<View>(null);
  const longPressed = useRef(false);
  const preferredWidthCallback = useRef(props.onPreferredWidth);
  preferredWidthCallback.current = props.onPreferredWidth;
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const currentTool: InkTool = props.tool === "select" ? "pen" : props.tool;
  const compact = windowWidth < 600;

  useEffect(() => {
    setOpen(false);
    setMenuPosition(null);
  }, [props.tool, props.layoutKey, windowWidth, windowHeight]);

  useEffect(() => {
    preferredWidthCallback.current?.(compact ? 246 : 298);
  }, [compact]);

  const openPicker = () => {
    longPressed.current = true;
    setOpen(true);
    requestAnimationFrame(() => {
      rootRef.current?.measureInWindow((rootX, rootY, _rootWidth, rootHeight) => {
        buttonRef.current?.measureInWindow((buttonX, buttonY, buttonWidth, buttonHeight) => {
          const menuWidth = Math.min(252, Math.max(200, windowWidth - 24));
          const roomAbove = rootY - props.pickerTop - 8;
          const roomBelow = props.pickerBottom - (rootY + rootHeight) - 8;
          const menuHeight = 58;
          const above = roomAbove >= menuHeight || roomAbove >= roomBelow;
          const left = Math.max(8 - rootX, Math.min(windowWidth - 8 - rootX - menuWidth, buttonX - rootX + buttonWidth / 2 - menuWidth / 2));
          setMenuPosition({
            left, width: menuWidth,
            ...(above
              ? { bottom: Math.max(0, rootY + rootHeight - buttonY + 6) }
              : { top: Math.max(0, buttonY - rootY + buttonHeight + 6) }),
          });
        });
      });
    });
  };

  const selectTool = (tool: InkTool) => {
    props.onTool(tool);
    setOpen(false);
  };

  const action = (
    id: string,
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    onPress: () => void,
    disabled = false,
  ) => (
    <Pressable
      key={id}
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled && styles.disabled]}
    >
      <Ionicons name={icon} size={17} color={disabled ? "#b6aa98" : "#675d50"} />
    </Pressable>
  );

  return (
    <View ref={rootRef} collapsable={false} style={styles.root}>
      <View style={styles.row}>
        <Pressable
          ref={buttonRef}
          collapsable={false}
          testID="notebook-ink-tool"
          accessibilityRole="button"
          accessibilityLabel={`${props.ko ? "현재 도구" : "Current tool"}: ${toolDetails[currentTool][props.ko ? "ko" : "en"]}. ${props.ko ? "도구 선택기 열기" : "Open tool picker"}`}
          accessibilityState={{ expanded: open, selected: true }}
          accessibilityActions={[{ name: "expand", label: props.ko ? "도구 선택기 열기" : "Open tool picker" }]}
          onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "expand") openPicker(); }}
          onPressIn={() => { longPressed.current = false; }}
          onPress={() => { if (longPressed.current) { longPressed.current = false; return; } if (open) setOpen(false); else openPicker(); }}
          onLongPress={openPicker}
          delayLongPress={380}
          style={[styles.currentTool, compact ? styles.currentToolCompact : styles.currentToolWide]}
        >
          <Ionicons name={toolDetails[currentTool].icon} size={17} color="#674f31" />
          {!compact && <Text style={styles.currentToolLabel}>{toolDetails[currentTool][props.ko ? "ko" : "en"]}</Text>}
          <Ionicons name="chevron-down" size={11} color="#806a4b" />
        </Pressable>
        <View style={styles.separator} />
        {action("notebook-ink-undo", props.ko ? "실행 취소" : "Undo", "arrow-undo", props.onUndo, !props.canUndo)}
        {action("notebook-ink-redo", props.ko ? "다시 실행" : "Redo", "arrow-redo", props.onRedo, !props.canRedo)}
        <View style={styles.separator} />
        {action("notebook-ink-zoom-out", props.ko ? "축소" : "Zoom out", "remove", () => props.onZoom(Math.max(0.35, props.scale - 0.1)))}
        <Text testID="notebook-ink-zoom" accessibilityRole="text" accessibilityLabel={`${props.ko ? "확대 비율" : "Zoom"} ${Math.round(props.scale * 100)}%`} style={styles.zoomValue}>
          {Math.round(props.scale * 100)}%
        </Text>
        {action("notebook-ink-zoom-in", props.ko ? "확대" : "Zoom in", "add", () => props.onZoom(Math.min(2.5, props.scale + 0.1)))}
      </View>
      {open && menuPosition && (
        <View
          testID="notebook-ink-tool-menu"
          accessibilityRole="menu"
          style={[styles.menu, menuPosition]}
        >
          {toolChoices.map((tool) => (
            <View key={tool} style={styles.choiceWrap}>
              <Pressable
                testID={`notebook-tool-${tool}`}
                accessibilityRole="menuitem"
                accessibilityLabel={toolDetails[tool][props.ko ? "ko" : "en"]}
                accessibilityState={{ selected: currentTool === tool }}
                onPress={() => selectTool(tool)}
                style={[styles.choice, currentTool === tool && styles.choiceSelected]}
              >
                <Ionicons name={toolDetails[tool].icon} size={16} color={currentTool === tool ? "#674f31" : "#756952"} />
                <Text style={[styles.choiceLabel, currentTool === tool && styles.choiceLabelSelected]}>{toolDetails[tool][props.ko ? "ko" : "en"]}</Text>
              </Pressable>
              {tool !== "move" && (
                <Pressable
                  testID={`notebook-ink-options-${tool === "pen" ? "pen" : "erase"}`}
                  accessibilityRole="button"
                  accessibilityLabel={props.ko ? `${toolDetails[tool].ko} 설정` : `${toolDetails[tool].en} settings`}
                  onPress={() => {
                    props.onToolPopup(tool);
                    setOpen(false);
                  }}
                  style={styles.gear}
                >
                  <Ionicons name="settings-outline" size={15} color="#806a4b" />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", minHeight: 66, position: "relative", overflow: "visible", zIndex: 26 },
  row: { minHeight: 66, width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 4, gap: 2 },
  currentTool: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: "#d9cbb5", backgroundColor: "#f2eadc", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  currentToolCompact: { width: 44, minWidth: 44 },
  currentToolWide: { width: 94, paddingHorizontal: 8 },
  currentToolLabel: { color: "#674f31", fontSize: 10, fontWeight: "700" },
  action: { width: 34, minWidth: 34, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#fffdf9", borderWidth: 1, borderColor: "#ebe3d8" },
  disabled: { opacity: 0.5 },
  separator: { width: 1, height: 23, backgroundColor: "#e7ded1", marginHorizontal: 2 },
  zoomValue: { width: 34, textAlign: "center", color: "#776a57", fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] },
  menu: { position: "absolute", zIndex: 90, elevation: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4, minHeight: 58, padding: 5, borderWidth: 1, borderColor: "#ded3c2", borderRadius: 12, backgroundColor: "#fffdf8", shadowColor: "#403321", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  choiceWrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1 },
  choice: { minWidth: 48, minHeight: 44, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 8 },
  choiceSelected: { backgroundColor: "#f0e5d3" },
  choiceLabel: { color: "#756952", fontSize: 10, fontWeight: "600" },
  choiceLabelSelected: { color: "#674f31" },
  gear: { width: 30, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 8 },
});

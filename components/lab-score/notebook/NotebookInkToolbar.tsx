import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

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
const menuChoices: InkTool[] = [...toolChoices].reverse();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function NotebookInkToolbar(props: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const buttonRef = useRef<View>(null);
  const measureFrame = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef(props);
  const selectToolCallback = useRef<(tool: InkTool) => void>(() => {});
  const openSettingsCallback = useRef<(tool: InkTool) => void>(() => {});
  callbacks.current = props;
  const currentToolRef = useRef<InkTool>(props.tool === "select" ? "pen" : props.tool);
  const longPressed = useRef(false);
  const rightSwipeHandled = useRef(false);
  const verticalMoved = useRef(false);
  const gestureStart = useRef({ x: 0, y: 0, anchorX: 0, anchorY: 0, selectedIndex: 0 });
  const selectedIndex = useRef(0);
  const rowRefs = useRef<Record<InkTool, View | null>>({ pen: null, erase: null, move: null });
  const rowBoxes = useRef<Partial<Record<InkTool, { y: number; height: number }>>>({});
  const [open, setOpen] = useState(false);
  const [previewTool, setPreviewTool] = useState<InkTool | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const [compact, setCompact] = useState(windowWidth < 600);
  const currentTool: InkTool = props.tool === "select" ? "pen" : props.tool;
  currentToolRef.current = currentTool;

  useEffect(() => {
    setCompact(windowWidth < 600);
    setOpen(false);
    setPreviewTool(null);
    setMenuPosition(null);
    longPressed.current = false;
    rightSwipeHandled.current = false;
    verticalMoved.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    rowBoxes.current = {};
    if (measureFrame.current !== null) cancelAnimationFrame(measureFrame.current);
    measureFrame.current = null;
    return () => {
      if (measureFrame.current !== null) cancelAnimationFrame(measureFrame.current);
      measureFrame.current = null;
    };
  }, [props.tool, props.layoutKey, windowWidth, windowHeight]);

  useEffect(() => {
    callbacks.current.onPreferredWidth?.(compact ? 246 : 298);
  }, [compact]);

  const measurePicker = () => {
    rowBoxes.current = {};
    setOpen(true);
    if (measureFrame.current !== null) cancelAnimationFrame(measureFrame.current);
    measureFrame.current = requestAnimationFrame(() => {
      measureFrame.current = null;
      rootRef.current?.measureInWindow((rootX, rootY, _rootWidth, rootHeight) => {
        buttonRef.current?.measureInWindow((buttonX, buttonY, buttonWidth, buttonHeight) => {
          const menuWidth = Math.min(252, Math.max(200, windowWidth - 24));
          const menuHeight = 148;
          const roomAbove = rootY - props.pickerTop - 8;
          const roomBelow = props.pickerBottom - (rootY + rootHeight) - 8;
          const above = roomAbove >= menuHeight || roomAbove >= roomBelow;
          const left = Math.max(8 - rootX, Math.min(windowWidth - 8 - rootX - menuWidth, buttonX - rootX + buttonWidth / 2 - menuWidth / 2));
          setMenuPosition({
            left,
            width: menuWidth,
            ...(above
              ? { bottom: Math.max(0, rootY + rootHeight - buttonY + 6) }
              : { top: Math.max(0, buttonY - rootY + buttonHeight + 6) }),
          });
        });
      });
    });
  };

  const selectTool = (tool: InkTool) => {
    callbacks.current.onTool(tool);
    selectedIndex.current = toolChoices.indexOf(tool);
    setPreviewTool(null);
    setOpen(false);
  };

  const openSettings = (tool: InkTool) => {
    if (tool === "move") return;
    callbacks.current.onTool(tool);
    selectedIndex.current = toolChoices.indexOf(tool);
    callbacks.current.onToolPopup(tool);
    setPreviewTool(null);
    setOpen(false);
    rightSwipeHandled.current = true;
  };
  selectToolCallback.current = selectTool;
  openSettingsCallback.current = openSettings;

  const responder = useMemo(() => PanResponder.create({
    // The stable View wrapper owns the drag. Pressable remains a click/keyboard fallback.
    onMoveShouldSetPanResponderCapture: () => longPressed.current,
    onMoveShouldSetPanResponder: () => longPressed.current,
    onPanResponderGrant: (_event, gesture) => {
      const index = toolChoices.indexOf(currentToolRef.current);
      gestureStart.current = {
        x: gesture.x0,
        y: gesture.y0,
        anchorX: gesture.x0,
        anchorY: gesture.y0,
        selectedIndex: index < 0 ? 0 : index,
      };
      selectedIndex.current = gestureStart.current.selectedIndex;
      verticalMoved.current = false;
      rightSwipeHandled.current = false;
      setOpen(true);
      setPreviewTool(toolChoices[gestureStart.current.selectedIndex]);
    },
    onPanResponderMove: (_event, gesture) => {
      if (rightSwipeHandled.current) return;
      const dy = gesture.moveY - gestureStart.current.y;
      const anchorDx = gesture.moveX - gestureStart.current.anchorX;
      const anchorDy = gesture.moveY - gestureStart.current.anchorY;
      if (anchorDx >= 36 && Math.abs(anchorDx) > Math.abs(anchorDy) * 1.1 && !rightSwipeHandled.current) {
        const tool = toolChoices[selectedIndex.current];
        if (tool !== "move") openSettingsCallback.current(tool);
        else rightSwipeHandled.current = true;
        return;
      }
      if (Math.abs(anchorDy) > 14 && Math.abs(anchorDy) > Math.abs(anchorDx) * 0.65) {
        verticalMoved.current = true;
        const hit = menuChoices.find((tool) => {
          const box = rowBoxes.current[tool];
          return box && gesture.moveY >= box.y && gesture.moveY <= box.y + box.height;
        });
        const nextTool = hit ?? toolChoices[clamp(
          gestureStart.current.selectedIndex + Math.round(-dy / 42),
          0,
          toolChoices.length - 1,
        )];
        const nextIndex = toolChoices.indexOf(nextTool);
        if (nextIndex !== selectedIndex.current) {
          selectedIndex.current = nextIndex;
          setPreviewTool(nextTool);
        }
        // Once the pointer is on a chooser row, begin right-swipe recognition
        // there instead of requiring a single large move event.
        gestureStart.current.anchorX = gesture.moveX;
        gestureStart.current.anchorY = gesture.moveY;
      }
    },
    onPanResponderRelease: () => {
      const tool = toolChoices[selectedIndex.current];
      if (!rightSwipeHandled.current && verticalMoved.current) selectToolCallback.current(tool);
      longPressed.current = false;
      verticalMoved.current = false;
    },
    onPanResponderTerminate: () => {
      longPressed.current = false;
      rightSwipeHandled.current = false;
      verticalMoved.current = false;
      setPreviewTool(null);
      setOpen(false);
    },
    onPanResponderTerminationRequest: () => false,
  }), []);

  useEffect(() => () => {
    longPressed.current = false;
    rightSwipeHandled.current = false;
    verticalMoved.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    if (measureFrame.current !== null) cancelAnimationFrame(measureFrame.current);
    measureFrame.current = null;
  }, []);

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

  const beginLongPress = () => {
    longPressed.current = false;
    rightSwipeHandled.current = false;
    verticalMoved.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressed.current = true;
      selectedIndex.current = toolChoices.indexOf(currentToolRef.current);
      setPreviewTool(currentToolRef.current);
      measurePicker();
    }, 380);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const measureChoice = (tool: InkTool) => {
    rowRefs.current[tool]?.measureInWindow((_x, y, _width, height) => {
      rowBoxes.current[tool] = { y, height };
    });
  };

  return (
    <View testID="notebook-ink-toolbar-root" ref={rootRef} collapsable={false} style={styles.root}>
      <View style={styles.row}>
        <View testID="notebook-ink-tool-gesture-owner" ref={buttonRef} collapsable={false} style={[styles.toolGestureOwner, compact ? styles.currentToolCompact : styles.currentToolWide]} {...responder.panHandlers}>
          <Pressable
            testID="notebook-ink-tool"
            accessibilityRole="button"
            accessibilityLabel={`${props.ko ? "현재 도구" : "Current tool"}: ${toolDetails[currentTool][props.ko ? "ko" : "en"]}. ${props.ko ? "길게 누르고 위아래로 끌어 도구를 고르세요. 오른쪽으로 밀어 설정을 여세요." : "Long press and drag vertically to select a tool. Swipe right for settings."}`}
            accessibilityState={{ expanded: open, selected: true }}
            accessibilityActions={[{ name: "expand", label: props.ko ? "도구 선택기 열기" : "Open tool picker" }]}
            onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "expand") measurePicker(); }}
            onPressIn={beginLongPress}
            onPressOut={cancelLongPress}
            onPress={() => {
              if (rightSwipeHandled.current) { rightSwipeHandled.current = false; return; }
              if (longPressed.current) { longPressed.current = false; return; }
              if (open) setOpen(false);
              else measurePicker();
            }}
            style={styles.currentTool}
          >
            <Ionicons name={toolDetails[previewTool ?? currentTool].icon} size={17} color="#674f31" />
            {!compact && <Text style={styles.currentToolLabel}>{toolDetails[previewTool ?? currentTool][props.ko ? "ko" : "en"]}</Text>}
            <Ionicons name="chevron-down" size={11} color="#806a4b" />
          </Pressable>
        </View>
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
        <View testID="notebook-ink-tool-menu" accessibilityRole="menu" style={[styles.menu, menuPosition]}>
          {menuChoices.map((tool) => (
            <View
              key={tool}
              testID={`notebook-ink-tool-row-${tool}`}
              ref={(node) => { rowRefs.current[tool] = node; }}
              collapsable={false}
              onLayout={() => measureChoice(tool)}
              style={[styles.choiceWrap, (previewTool ?? currentTool) === tool && styles.choiceSelected]}
            >
              <Pressable
                testID={`notebook-tool-${tool}`}
                accessibilityRole="menuitem"
                accessibilityLabel={toolDetails[tool][props.ko ? "ko" : "en"]}
                accessibilityState={{ selected: (previewTool ?? currentTool) === tool }}
                onPress={() => selectTool(tool)}
                style={styles.choice}
              >
                <Ionicons name={toolDetails[tool].icon} size={16} color={(previewTool ?? currentTool) === tool ? "#674f31" : "#756952"} />
                <Text style={[styles.choiceLabel, (previewTool ?? currentTool) === tool && styles.choiceLabelSelected]}>{toolDetails[tool][props.ko ? "ko" : "en"]}</Text>
              </Pressable>
              {tool !== "move" ? (
                <Pressable
                  testID={`notebook-ink-options-${tool}`}
                  accessibilityRole="button"
                  accessibilityLabel={props.ko ? `${toolDetails[tool].ko} 설정` : `${toolDetails[tool].en} settings`}
                  onPress={() => openSettings(tool)}
                  style={styles.gear}
                >
                  <Ionicons name="settings-outline" size={15} color="#806a4b" />
                </Pressable>
              ) : (
                <View testID="notebook-ink-options-move-unavailable" accessibilityElementsHidden style={styles.gear}>
                  <Ionicons name="remove-circle-outline" size={15} color="#b6aa98" />
                </View>
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
  toolGestureOwner: { height: 44 },
  currentTool: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: "#d9cbb5", backgroundColor: "#f2eadc", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  currentToolCompact: { width: 44, minWidth: 44 },
  currentToolWide: { width: 94, paddingHorizontal: 8 },
  currentToolLabel: { color: "#674f31", fontSize: 10, fontWeight: "700" },
  action: { width: 34, minWidth: 34, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#fffdf9", borderWidth: 1, borderColor: "#ebe3d8" },
  disabled: { opacity: 0.5 },
  separator: { width: 1, height: 23, backgroundColor: "#e7ded1", marginHorizontal: 2 },
  zoomValue: { width: 34, textAlign: "center", color: "#776a57", fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] },
  menu: { position: "absolute", zIndex: 90, elevation: 24, flexDirection: "column", alignItems: "stretch", justifyContent: "space-between", gap: 2, minHeight: 148, padding: 5, borderWidth: 1, borderColor: "#ded3c2", borderRadius: 12, backgroundColor: "#fffdf8", shadowColor: "#403321", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  choiceWrap: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 8 },
  choice: { minHeight: 42, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 9, paddingHorizontal: 11, borderRadius: 8 },
  choiceSelected: { backgroundColor: "#f0e5d3" },
  choiceLabel: { color: "#756952", fontSize: 11, fontWeight: "600" },
  choiceLabelSelected: { color: "#674f31" },
  gear: { width: 38, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 8 },
});

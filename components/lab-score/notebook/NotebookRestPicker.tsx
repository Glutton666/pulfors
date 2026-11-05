import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { NotebookGlyphPreview } from "./NotebookGlyph";

type Duration = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "thirty_second";
type RestChoice = { glyph: string; role: "normal"; dotted: boolean };
type Box = { x: number; y: number; width: number; height: number };
type PickerProps = {
  ko: boolean;
  topBoundary: number;
  bottomBoundary?: number;
  modeKey: string;
  layoutKey?: number;
  otherPickerActive: boolean;
  dockRef: { current: View | null };
  onChoose: (choice: RestChoice) => void;
  onActiveChange: (active: boolean) => void;
};

const durations: Duration[] = ["whole", "half", "quarter", "eighth", "sixteenth", "thirty_second"];
const durationLabels = {
  en: ["Whole", "Half", "Quarter", "Eighth", "16th", "32nd"],
  ko: ["온음표", "2분음표", "4분음표", "8분음표", "16분음표", "32분음표"],
};

export function useNotebookRestPicker(props: PickerProps) {
  const { width, height } = useWindowDimensions();
  const bottomBoundary = props.bottomBoundary ?? height - 8;
  const [active, setActive] = useState(false);
  const [vertical, setVertical] = useState(false);
  const [showAccessibleChooser, setShowAccessibleChooser] = useState(false);
  const [duration, setDuration] = useState<Duration>("quarter");
  const [dotted, setDotted] = useState(false);
  const [originBox, setOriginBox] = useState<Box | null>(null);
  const [dockBox, setDockBox] = useState<Box | null>(null);
  const [, setRowsVersion] = useState(0);
  const originRef = useRef<View>(null);
  const rowRefs = useRef<Record<Duration, View | null>>({
    whole: null, half: null, quarter: null, eighth: null, sixteenth: null, thirty_second: null,
  });
  const rowBoxes = useRef<Partial<Record<Duration, Box>>>({});
  const gesture = useRef({ active: false, vertical: false, duration: "quarter" as Duration, dotted: false });
  const snapshot = useRef({ duration: "quarter" as Duration, dotted: false });
  const responderUsed = useRef(false);
  const callbacks = useRef(props);
  callbacks.current = props;

  const publishActive = (next: boolean) => {
    setActive(next);
    callbacks.current.onActiveChange(next);
  };

  const cancelGesture = () => {
    gesture.current.active = false;
    gesture.current.vertical = false;
    gesture.current.duration = snapshot.current.duration;
    gesture.current.dotted = snapshot.current.dotted;
    setDuration(snapshot.current.duration);
    setDotted(snapshot.current.dotted);
    publishActive(false);
    setVertical(false);
    setShowAccessibleChooser(false);
    rowBoxes.current = {};
    responderUsed.current = false;
  };

  useEffect(() => {
    cancelGesture();
    setDuration("quarter");
    setDotted(false);
    snapshot.current = { duration: "quarter", dotted: false };
  }, [props.modeKey, width, height]);
  useEffect(() => { cancelGesture(); }, [props.layoutKey]);

  useEffect(() => {
    if (props.otherPickerActive) setShowAccessibleChooser(false);
  }, [props.otherPickerActive]);

  useEffect(() => () => {
    gesture.current.active = false;
    responderUsed.current = false;
  }, []);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      const state = gesture.current;
      snapshot.current = { duration: state.duration, dotted: state.dotted };
      Object.assign(state, { active: true, vertical: false });
      responderUsed.current = true;
      rowBoxes.current = {};
      originRef.current?.measureInWindow((x, y, w, h) => setOriginBox({ x, y, width: w, height: h }));
      callbacks.current.dockRef.current?.measureInWindow((x, y, w, h) => setDockBox({ x, y, width: w, height: h }));
      publishActive(true);
      setVertical(false);
      setShowAccessibleChooser(false);
      setDuration(state.duration);
      setDotted(state.dotted);
    },
    onPanResponderMove: (_event, movement) => {
      const state = gesture.current;
      if (!state.vertical && movement.dy < -12 && Math.abs(movement.dy) > Math.abs(movement.dx) * 0.65) {
        state.vertical = true;
        setVertical(true);
        return;
      }
      if (!state.vertical) return;
      const hit = durations.map((item) => ({ item, box: rowBoxes.current[item] }))
        .find(({ box }) => box && movement.moveY >= box.y && movement.moveY <= box.y + box.height);
      if (hit?.box) {
        state.duration = hit.item;
        state.dotted = movement.moveX < hit.box.x + hit.box.width / 2;
        setDuration(hit.item);
        setDotted(state.dotted);
      }
    },
    onPanResponderRelease: () => {
      const state = gesture.current;
      if (!state.active) return;
      state.active = false;
      snapshot.current = { duration: state.duration, dotted: state.dotted };
      callbacks.current.onChoose({ glyph: `rest-${state.duration}`, role: "normal", dotted: state.dotted });
      publishActive(false);
      setVertical(false);
      rowBoxes.current = {};
      setTimeout(() => { responderUsed.current = false; }, 250);
    },
    onPanResponderTerminate: cancelGesture,
    onPanResponderTerminationRequest: () => false,
  }), []);

  const measureRows = () => {
    let measured = 0;
    durations.forEach((item) => rowRefs.current[item]?.measureInWindow((x, y, w, h) => {
      rowBoxes.current[item] = { x, y, width: w, height: h };
      measured += 1;
      if (measured === durations.length) setRowsVersion((version) => version + 1);
    }));
  };

  const chooseDuration = (nextDuration: Duration) => {
    gesture.current.active = false;
    gesture.current.duration = nextDuration;
    snapshot.current = { duration: nextDuration, dotted: gesture.current.dotted };
    responderUsed.current = false;
    setDuration(nextDuration);
    publishActive(false);
    setVertical(false);
    setShowAccessibleChooser(false);
    callbacks.current.onChoose({ glyph: `rest-${nextDuration}`, role: "normal", dotted: gesture.current.dotted });
  };

  const setVariant = (nextDotted: boolean) => {
    gesture.current.dotted = nextDotted;
    snapshot.current = { ...snapshot.current, dotted: nextDotted };
    setDotted(nextDotted);
  };

  const spaceAbove = originBox ? Math.max(0, originBox.y - props.topBoundary - 8) : 0;
  const spaceBelow = originBox ? Math.max(0, bottomBoundary - (originBox.y + originBox.height) - 8) : 0;
  const columnAbove = spaceAbove >= spaceBelow || spaceAbove >= 190;
  const availableColumnSpace = Math.max(spaceAbove, spaceBelow);
  const rowHeight = originBox
    ? Math.max(8, Math.min(34, (availableColumnSpace - 16) / durations.length))
    : 30;
  const columnHeight = rowHeight * durations.length + 8;
  const columnLeft = originBox && dockBox
    ? Math.max(42, Math.min(Math.max(42, dockBox.width - 138), originBox.x + originBox.width / 2 - dockBox.x - 48))
    : 42;
  const columnTop = originBox && dockBox
    ? columnAbove
      ? Math.max(props.topBoundary - dockBox.y, originBox.y - dockBox.y - columnHeight - 8)
      : Math.min(bottomBoundary - dockBox.y - columnHeight, originBox.y - dockBox.y + originBox.height + 8)
    : 0;
  const accessibleAbove = spaceAbove >= 66 || spaceAbove >= spaceBelow;

  const origin = (
    <View
      testID="notebook-rest-tile"
      ref={originRef}
      collapsable={false}
      pointerEvents={props.otherPickerActive ? "none" : "auto"}
      {...responder.panHandlers}
      style={[styles.origin, props.otherPickerActive && { opacity: 0 }]}
    >
      {!props.otherPickerActive && <Pressable
        testID="notebook-rest-origin"
        accessibilityRole="button"
        accessibilityLabel={props.ko ? "쉼표 선택. 위로 음가를, 좌우로 점 유무를 고르세요." : "Rest picker. Swipe up for duration, left for dotted and right for plain."}
        accessibilityState={{ expanded: showAccessibleChooser }}
        accessibilityActions={[{ name: "expand", label: props.ko ? "쉼표 선택기 펼치기" : "Expand rest chooser" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "expand") setShowAccessibleChooser(true);
        }}
        onPress={() => {
          if (responderUsed.current) {
            responderUsed.current = false;
            return;
          }
          setShowAccessibleChooser(true);
        }}
        style={styles.originInner}
      >
        <View style={styles.categoryIconFrame}><NotebookGlyphPreview glyph={`rest-${duration}`} size={22} role="normal" dotted={dotted} /></View>
        <Text style={styles.categoryLabel}>{props.ko ? "쉼표" : "Rest"}</Text>
      </Pressable>}
    </View>
  );

  const overlay = (
    <>
      {active && originBox && dockBox && <View pointerEvents="box-none" style={styles.gestureLayer}>
        {vertical && <View pointerEvents="box-none" onLayout={measureRows} style={[styles.durationColumn, { left: columnLeft, top: columnTop }]}>
          {[...durations].reverse().map((item) => <Pressable
            key={item}
            ref={(node) => { rowRefs.current[item] = node; }}
            collapsable={false}
            testID={`notebook-rest-duration-${item}`}
            accessibilityRole="button"
            accessibilityLabel={`${durationLabels[props.ko ? "ko" : "en"][durations.indexOf(item)]} ${props.ko ? "쉼표" : "rest"}`}
            onPress={() => chooseDuration(item)}
            style={[styles.durationChoice, { height: rowHeight }, duration === item && styles.verticalDurationActive]}
          >
            <NotebookGlyphPreview glyph={`rest-${item}`} size={20} role="normal" dotted={duration === item && dotted} />
          </Pressable>)}
        </View>}
        {vertical && rowBoxes.current[duration] && dockBox && <>
          <Pressable
            testID="notebook-rest-dotted"
            accessibilityRole="button"
            accessibilityLabel={props.ko ? "점쉼표" : "Dotted rest"}
            onPress={() => setVariant(true)}
            style={[styles.branchChoice, {
              left: columnLeft - 42,
              top: rowBoxes.current[duration]!.y - dockBox.y + rowBoxes.current[duration]!.height / 2 - 18,
            }, dotted && styles.roleChoiceActive]}
          >
            <NotebookGlyphPreview glyph={`rest-${duration}`} size={18} role="normal" dotted />
          </Pressable>
          <Pressable
            testID="notebook-rest-plain"
            accessibilityRole="button"
            accessibilityLabel={props.ko ? "일반 쉼표" : "Plain rest"}
            onPress={() => setVariant(false)}
            style={[styles.branchChoice, {
              left: columnLeft + 96 + 6,
              top: rowBoxes.current[duration]!.y - dockBox.y + rowBoxes.current[duration]!.height / 2 - 18,
            }, !dotted && styles.roleChoiceActive]}
          >
            <NotebookGlyphPreview glyph={`rest-${duration}`} size={18} role="normal" />
          </Pressable>
        </>}
      </View>}
      {showAccessibleChooser && !active && !props.otherPickerActive && <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[styles.accessibleChooser, accessibleAbove
          ? { bottom: "100%", top: undefined }
          : { top: "100%", bottom: undefined },
        { maxHeight: Math.max(44, Math.min(58, accessibleAbove ? spaceAbove : spaceBelow)) }]}
        contentContainerStyle={styles.accessibleChooserContent}>
        {durations.map((item) => <Pressable
          key={item}
          testID={`notebook-rest-duration-${item}`}
          accessibilityRole="button"
          accessibilityLabel={`${durationLabels[props.ko ? "ko" : "en"][durations.indexOf(item)]} ${props.ko ? "쉼표" : "rest"}`}
          onPress={() => chooseDuration(item)}
          style={styles.accessibleChoice}
        >
          <NotebookGlyphPreview glyph={`rest-${item}`} size={18} role="normal" dotted={dotted} />
        </Pressable>)}
        <Pressable testID="notebook-rest-dotted" accessibilityRole="button" accessibilityLabel={props.ko ? "점쉼표" : "Dotted rest"} onPress={() => setVariant(true)} style={styles.accessibleChoice}>
          <NotebookGlyphPreview glyph={`rest-${duration}`} size={18} role="normal" dotted />
        </Pressable>
        <Pressable testID="notebook-rest-plain" accessibilityRole="button" accessibilityLabel={props.ko ? "일반 쉼표" : "Plain rest"} onPress={() => setVariant(false)} style={styles.accessibleChoice}>
          <NotebookGlyphPreview glyph={`rest-${duration}`} size={18} role="normal" />
        </Pressable>
      </ScrollView>}
    </>
  );

  return { origin, overlay, active };
}

const styles = StyleSheet.create({
  origin: { flex: 1, minWidth: 0, height: 64, minHeight: 64, paddingHorizontal: 2, borderRadius: 11, borderWidth: 1, borderColor: "#e7dfd2", backgroundColor: "#fffdf9", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 },
  originInner: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 3 },
  categoryIconFrame: { height: 36, width: 56, alignItems: "center", justifyContent: "center", overflow: "visible" },
  categoryLabel: { color: "#62543e", fontSize: 10, fontWeight: "700", letterSpacing: 0.1, textAlign: "center" },
  gestureLayer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 80, elevation: 22, overflow: "visible" },
  durationColumn: { position: "absolute", width: 96, padding: 4, borderRadius: 12, borderWidth: 1, borderColor: "#ded3c2", backgroundColor: "#fffdf8", shadowColor: "#403321", shadowOpacity: 0.17, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 20 },
  durationChoice: { width: 86, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  verticalDurationActive: { backgroundColor: "#f0e7d9" },
  branchChoice: { position: "absolute", width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: "#e6dccd", backgroundColor: "#fffdf8" },
  roleChoiceActive: { backgroundColor: "#f0e5d3", borderColor: "#b69a70" },
  accessibleChooser: { position: "absolute", left: 5, right: 5, bottom: "100%", zIndex: 80, maxHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: "#dfd3c1", backgroundColor: "#fffdf8", elevation: 18 },
  accessibleChooserContent: { minHeight: 56, alignItems: "center", gap: 5, paddingHorizontal: 6 },
  accessibleChoice: { width: 48, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: "#e8e0d4", backgroundColor: "#fffdf9" },
});

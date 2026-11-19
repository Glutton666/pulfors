import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { noteDurations } from "@/lib/notebook-note-picker";
import { NotebookGlyphPreview } from "./NotebookGlyph";
import { useNotebookNotationPicker } from "./NotebookNotePicker";

type PickerProps = Omit<Parameters<typeof useNotebookNotationPicker>[0], "kind" | "onChoose"> & {
  ko: boolean;
  chooserAbove: boolean;
  chooserSpace: number;
  otherPickerActive: boolean;
  onChoose: (choice: { glyph: string; role: "normal"; dotted: boolean }) => void;
};

const durationLabels = {
  en: ["Whole", "Half", "Quarter", "Eighth", "16th", "32nd"],
  ko: ["온", "2분", "4분", "8분", "16분", "32분"],
};

export function useNotebookRestPicker(props: PickerProps) {
  const [showChooser, setShowChooser] = useState(false);
  const choose = (glyph: string, dotted: boolean) => props.onChoose({ glyph: `rest-${glyph}`, role: "normal", dotted });
  const picker = useNotebookNotationPicker({
    ...props, kind: "rest",
    onChoose: ({ glyph, dotted }) => choose(glyph, dotted),
    onBegin: () => { setShowChooser(false); props.onBegin(); },
  });
  const { glyph, dotted } = picker.choice;
  const hideOrigin = picker.active || props.otherPickerActive;
  useEffect(() => { setShowChooser(false); }, [props.resetKey, props.otherPickerActive]);

  const origin = (
    <View
      testID="notebook-rest-tile"
      ref={picker.originRef}
      collapsable={false}
      pointerEvents={props.otherPickerActive ? "none" : "auto"}
      aria-hidden={hideOrigin || undefined}
      accessibilityElementsHidden={hideOrigin}
      importantForAccessibility={hideOrigin ? "no-hide-descendants" : "auto"}
      {...picker.panHandlers}
      style={[styles.origin, hideOrigin && styles.hidden, Platform.OS === "web" && { touchAction: "none", userSelect: "none" }]}
    >
      <Pressable
        testID="notebook-rest-origin"
        disabled={props.otherPickerActive}
        tabIndex={hideOrigin ? -1 : undefined}
        accessibilityRole="button"
        accessibilityLabel={props.ko ? "쉼표 선택. 위로 음가를, 좌우로 점 유무를 고르세요." : "Rest picker. Swipe up for duration, left for dotted and right for plain."}
        accessibilityState={{ expanded: showChooser }}
        accessibilityActions={[{ name: "expand", label: props.ko ? "쉼표 선택기 펼치기" : "Expand rest chooser" }]}
        onAccessibilityAction={(event) => {
          if (!hideOrigin && event.nativeEvent.actionName === "expand") setShowChooser(true);
        }}
        onPress={(event) => {
          const native = event.nativeEvent as typeof event.nativeEvent & { pointerType?: string; detail?: number };
          if (hideOrigin || (picker.consumePress() && native.pointerType !== "keyboard" && native.detail !== 0)) return;
          setShowChooser(true);
        }}
        style={styles.originInner}
      >
        <View style={styles.categoryIconFrame}><NotebookGlyphPreview glyph={`rest-${glyph}`} size={22} dotted={dotted} /></View>
        <Text style={styles.categoryLabel}>{props.ko ? "쉼표" : "Rest"}</Text>
      </Pressable>
    </View>
  );

  const overlay = <>
    {picker.overlay}
    {showChooser && !hideOrigin && <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={[styles.accessibleChooser, props.chooserAbove ? { bottom: "100%" } : { top: "100%" },
        { maxHeight: Math.max(44, Math.min(58, props.chooserSpace)) }]}
      contentContainerStyle={styles.accessibleChooserContent}>
      {noteDurations.map((duration, index) => <Pressable
        key={duration}
        testID={`notebook-rest-duration-${duration}`}
        accessibilityRole="button"
        accessibilityLabel={props.ko ? `${durationLabels.ko[index]}쉼표` : `${durationLabels.en[index]} rest`}
        onPress={() => { picker.setAccessibleChoice({ glyph: duration }); setShowChooser(false); choose(duration, dotted); }}
        style={styles.accessibleChoice}>
        <NotebookGlyphPreview glyph={`rest-${duration}`} size={22} dotted={dotted} />
      </Pressable>)}
      {[true, false].map((variant) => <Pressable key={String(variant)}
        testID={`notebook-rest-${variant ? "dotted" : "plain"}`}
        accessibilityRole="button" accessibilityState={{ selected: dotted === variant }}
        accessibilityLabel={props.ko ? (variant ? "점쉼표" : "일반 쉼표") : (variant ? "Dotted rest" : "Plain rest")}
        onPress={() => picker.setAccessibleChoice({ dotted: variant })} style={styles.accessibleChoice}>
        <NotebookGlyphPreview glyph={`rest-${glyph}`} size={22} dotted={variant} />
      </Pressable>)}
    </ScrollView>}
  </>;
  return { origin, overlay, active: picker.active };
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  origin: { flex: 1, minWidth: 46, height: 64, minHeight: 64, borderRadius: 11, borderWidth: 1, borderColor: "#e7dfd2", backgroundColor: "#fffdf9", alignItems: "center", justifyContent: "center" },
  originInner: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", gap: 3 },
  categoryIconFrame: { height: 36, width: 56, alignItems: "center", justifyContent: "center", overflow: "visible" },
  categoryLabel: { color: "#62543e", fontSize: 10, fontWeight: "700", letterSpacing: 0.1, textAlign: "center" },
  accessibleChooser: { position: "absolute", left: 5, right: 5, zIndex: 80, maxHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: "#dfd3c1", backgroundColor: "#fffdf8", elevation: 18 },
  accessibleChooserContent: { minHeight: 56, alignItems: "center", gap: 5, paddingHorizontal: 6 },
  accessibleChoice: { width: 48, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: "#e8e0d4", backgroundColor: "#fffdf9" },
});

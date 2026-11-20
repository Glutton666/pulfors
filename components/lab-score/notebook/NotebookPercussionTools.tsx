import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { defaultSticking, stickingCharacter, stickingLetters, stickingSizes, type NotebookSticking } from "@/lib/notebook-percussion";

function Button({ id, label, children, onPress, selected, disabled, primary }: {
  id: string; label: string; children?: React.ReactNode; onPress: () => void; selected?: boolean; disabled?: boolean; primary?: boolean;
}) {
  return <Pressable testID={`notebook-${id}`} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, selected && styles.selected, primary && styles.primary, disabled && styles.disabled]}>
    {children ?? <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>}
  </Pressable>;
}

export function NotebookFlamTools({ ko, offset, existing, onOffset, onApply, onDelete, onClose }: {
  ko: boolean; offset: number; existing: boolean; onOffset: (value: number) => void; onApply: () => void;
  onDelete: () => void; onClose: () => void;
}) {
  const distance = Math.abs(offset);
  const side = Math.sign(offset);
  return <View testID="notebook-flam-tools" style={styles.panel}>
    <View style={styles.row}>
      <Text style={styles.title}>{ko ? "플램" : "Flam"}</Text>
      <Text style={styles.hint}>{ko ? "좌우로 밀어 위치 조정" : "Drag sideways to position"}</Text>
      <Button id="flam-cancel" label={ko ? "취소" : "Cancel"} onPress={onClose} />
    </View>
    <View style={styles.row}>
      <Button id="flam-left" label={ko ? "왼쪽" : "Left"} selected={side < 0} onPress={() => onOffset(-distance)} />
      <Button id="flam-right" label={ko ? "오른쪽" : "Right"} selected={side > 0} onPress={() => onOffset(distance)} />
      <View style={styles.spacer} />
      <Button id="flam-closer" label={ko ? "가깝게" : "Move closer"} disabled={distance <= 16} onPress={() => onOffset(side * (distance - 4))}>
        <Text style={styles.buttonText}>−</Text>
      </Button>
      <Text testID="notebook-flam-distance" style={styles.value}>{distance}</Text>
      <Button id="flam-farther" label={ko ? "멀게" : "Move farther"} disabled={distance >= 60} onPress={() => onOffset(side * (distance + 4))}>
        <Text style={styles.buttonText}>+</Text>
      </Button>
      {existing && <Button id="flam-remove" label={ko ? "플램 삭제" : "Delete flam"} onPress={onDelete}><Ionicons name="trash-outline" size={16} color="#8c4d3f" /></Button>}
      <Button id="flam-apply" label={ko ? "적용" : "Apply"} onPress={onApply} primary />
    </View>
  </View>;
}

export function NotebookStickingTools({ ko, part, value = defaultSticking, index, count, onStep, onChange, onClose, onUndo, onRedo, canUndo, canRedo }: {
  ko: boolean; part?: "note" | "flam"; value?: NotebookSticking; index: number; count: number;
  onStep: (delta: number) => void; onChange: (next: NotebookSticking, advance: boolean) => void; onClose: () => void;
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
}) {
  const [line, setLine] = useState<0 | 1>(0);
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState("");
  const character = stickingCharacter(text);
  const sizeIndex = stickingSizes.indexOf(value.size as typeof stickingSizes[number]);
  const edit = (letter: string, advance: boolean) => {
    const lines: NotebookSticking["lines"] = [...value.lines];
    lines[line] = letter;
    onChange({ ...value, lines }, advance);
    if (advance) { setCustom(false); setText(""); }
  };
  return <View testID="notebook-sticking-tools" style={styles.panel}>
    <View style={styles.row}>
      <Text style={styles.title}>{ko ? "타악기 연주법" : "Percussion sticking"}</Text>
      <View style={styles.spacer} />
      <Text testID="notebook-sticking-position" accessibilityLiveRegion="polite" style={styles.hint}>
        {part ? `${index + 1}/${count} · ${part === "flam" ? (ko ? "꾸밈음" : "Grace") : (ko ? "본음" : "Note")}` :
          count ? ko ? "입력 끝" : "End" : ko ? "음표를 놓아 주세요" : "Add a note first"}
      </Text>
      <Button id="sticking-close" label={ko ? "닫기" : "Close"} onPress={onClose}>
        <Ionicons name="close" size={17} color="#67553c" />
      </Button>
    </View>
    <View style={styles.row}>
      {([0, 1] as const).map((i) => <Button key={i} id={`sticking-line-${i + 1}`} label={ko ? `${i + 1}번째 줄` : `Line ${i + 1}`} selected={line === i} onPress={() => setLine(i)}>
        <Text style={styles.buttonText}>{i + 1} · {value.lines[i] || "—"}</Text>
      </Button>)}
      <Button id="sticking-clear" label={ko ? "이 줄 지우기" : "Clear this line"} disabled={!part || !value.lines[line]} onPress={() => edit("", false)}>
        <Ionicons name="backspace-outline" size={16} color="#67553c" />
      </Button>
      <View style={styles.spacer} />
      <Button id="sticking-size-down" label={ko ? "글자 작게" : "Decrease size"} disabled={!part || sizeIndex <= 0}
        onPress={() => onChange({ ...value, size: stickingSizes[sizeIndex - 1] }, false)}><Text style={styles.buttonText}>A−</Text></Button>
      <Text testID="notebook-sticking-size" style={styles.value}>{value.size}</Text>
      <Button id="sticking-size-up" label={ko ? "글자 크게" : "Increase size"} disabled={!part || sizeIndex >= stickingSizes.length - 1}
        onPress={() => onChange({ ...value, size: stickingSizes[sizeIndex + 1] }, false)}><Text style={styles.buttonText}>A+</Text></Button>
    </View>
    <View style={styles.letters}>
      {stickingLetters.map((letter) => <Button key={letter} id={`sticking-${letter}`} label={letter} disabled={!part} onPress={() => edit(letter, true)} />)}
      <Button id="sticking-custom" label={ko ? "직접 입력" : "Custom letter"} selected={custom} disabled={!part} onPress={() => setCustom(!custom)}>
        <Ionicons name="text-outline" size={16} color="#67553c" />
      </Button>
    </View>
    {custom && part && <View style={styles.row}>
      <TextInput testID="notebook-sticking-custom-input" accessibilityLabel={ko ? "표기 한 글자" : "One character"} value={text} onChangeText={setText}
        placeholder={ko ? "한 글자" : "One character"} maxLength={16} style={styles.input} returnKeyType="done"
        onSubmitEditing={(event) => { const letter = stickingCharacter(event.nativeEvent.text); if (letter) edit(letter, true); }} />
      <Button id="sticking-custom-apply" label={ko ? "입력" : "Insert"} primary disabled={!character} onPress={() => { if (character) edit(character, true); }} />
    </View>}
    <View style={styles.row}>
      <Button id="sticking-previous" label={ko ? "이전 음표" : "Previous note"} onPress={() => onStep(-1)} disabled={index <= 0}>
        <Ionicons name="chevron-back" size={16} color="#67553c" />
      </Button>
      <Button id="sticking-skip" label={ko ? "건너뛰기" : "Skip"} onPress={() => onStep(1)} disabled={!part} />
      <View style={styles.spacer} />
      <Button id="sticking-undo" label={ko ? "실행 취소" : "Undo"} onPress={onUndo} disabled={!canUndo}><Ionicons name="arrow-undo" size={16} color="#67553c" /></Button>
      <Button id="sticking-redo" label={ko ? "다시 실행" : "Redo"} onPress={onRedo} disabled={!canRedo}><Ionicons name="arrow-redo" size={16} color="#67553c" /></Button>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { width: "100%", padding: 7, gap: 4, backgroundColor: "#fffdf8", borderRadius: 12, borderColor: "#e3dacb", borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  letters: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 3 },
  spacer: { flex: 1 },
  title: { color: "#433521", fontWeight: "700", fontSize: 13, marginRight: 4 },
  hint: { color: "#6a5d4b", fontSize: 11 },
  value: { minWidth: 20, textAlign: "center", color: "#625138", fontSize: 12, fontVariant: ["tabular-nums"] },
  button: { minWidth: 34, minHeight: 34, borderRadius: 8, borderWidth: 1, borderColor: "#e3dacb", alignItems: "center", justifyContent: "center", backgroundColor: "#faf6ee", paddingHorizontal: 6 },
  buttonText: { color: "#67553c", fontWeight: "600", fontSize: 12 },
  selected: { backgroundColor: "#eee2d0", borderColor: "#aa8b60" },
  primary: { backgroundColor: "#785f3d", borderColor: "#785f3d" },
  primaryText: { color: "#fffdf8" },
  disabled: { opacity: .42 },
  input: { flex: 1, minHeight: 34, borderWidth: 1, borderColor: "#e3dacb", borderRadius: 7, paddingHorizontal: 8, color: "#433521", fontSize: 14 },
});

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { buildLabel, isConflicting } from "@/lib/keyboard-bindings";
import { defaultNotebookBindings, notebookBindingProblem, notebookShortcutRows, type NotebookBindings } from "@/lib/notebook-keyboard";

export function NotebookKeyboardDialog({ ko, edit, bindings, loaded, onClose, onSave }: {
  ko: boolean; edit: boolean; bindings: NotebookBindings; loaded: boolean;
  onClose: () => void; onSave: (bindings: NotebookBindings) => Promise<void>;
}) {
  const [action, setAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const restoreFocus = useRef<View | null>(null);
  const save = useCallback(async (next: NotebookBindings) => {
    if (busy.current) return;
    busy.current = true;
    setMessage("");
    try { await onSave(next); setAction(null); }
    catch { setMessage(ko ? "저장하지 못했습니다. 다시 시도해 주세요." : "Could not save shortcuts. Try again."); }
    finally { busy.current = false; }
  }, [ko, onSave]);
  useEffect(() => {
    if (!action) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab" || event.isComposing || event.repeat) return;
      if (/^(Shift|Control|Meta|Alt)(Left|Right)$/.test(event.code)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const base = { code: event.code, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey, alt: event.altKey };
      const binding = { ...base, label: buildLabel(base) };
      const problem = notebookBindingProblem(bindings, action, binding);
      if (problem) {
        setMessage(problem === "reserved"
          ? (ko ? "이 키는 브라우저 또는 목록에서 사용합니다." : "This key is reserved for the browser or menus.")
          : (ko ? "오선노트에서 이미 사용 중인 키입니다." : "This key is already in use in the notebook."));
        return;
      }
      void save({ ...bindings, [action]: binding });
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [action, bindings, ko, save]);
  const close = () => {
    if (action) { setAction(null); setMessage(""); }
    else onClose();
  };
  return <Modal transparent animationType="none" onRequestClose={close} onShow={() => restoreFocus.current?.focus()}>
    <View style={styles.overlay}>
      <View testID="notebook-keyboard-dialog" accessibilityViewIsModal style={styles.card}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>{edit ? (ko ? "오선노트 키 변경" : "Customize notebook shortcuts") : (ko ? "오선노트 단축키" : "Notebook shortcuts")}</Text>
          <Pressable ref={restoreFocus} testID="notebook-keyboard-close" accessibilityRole="button" onPress={close} style={styles.button}><Text>{ko ? (action ? "키 변경 취소" : "닫기") : (action ? "Cancel rebinding" : "Close")}</Text></Pressable>
        </View>
        {edit && <Pressable testID="notebook-keyboard-reset" accessibilityRole="button" disabled={!loaded} onPress={() => void save(defaultNotebookBindings)} style={styles.button}><Text>{ko ? "기본값 복원" : "Restore defaults"}</Text></Pressable>}
        <Text style={styles.hint}>{ko ? "Ctrl은 Mac에서 ⌘로 사용할 수 있습니다. 한자 키가 전달되지 않으면 목록 열기 키를 사용하세요." : "Use ⌘ instead of Ctrl on Mac. If your Hanja key is intercepted, use the listed symbol-menu key."}</Text>
        {message ? <Text testID="notebook-keyboard-message" accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        {action ? <Text testID="notebook-keyboard-listening" accessibilityLiveRegion="polite" style={styles.hint}>{ko ? "새 키를 누르세요. Esc로 취소합니다." : "Press the new key. Escape cancels."}</Text> : null}
        <ScrollView style={styles.list}>
          {notebookShortcutRows.map(({ id, ko: labelKo, en, binding }) => {
            const label = (isConflicting(bindings[id], binding) ? binding.label : buildLabel(bindings[id]))
              + (id === "symbols" ? (ko ? " / 한자" : " / Hanja") : id === "delete" ? " / Backspace" : "");
            return edit
              ? <Pressable key={id} testID={`notebook-rebind-${id}`} accessibilityRole="button" disabled={!loaded}
                  accessibilityState={{ selected: id === action }} style={[styles.row, id === action && styles.selected]}
                  onPress={() => { setMessage(""); setAction(id); }}>
                  <Text style={styles.label}>{ko ? labelKo : en}</Text><Text style={styles.key}>{label}</Text>
                </Pressable>
              : <View key={id} style={styles.row}><Text style={styles.label}>{ko ? labelKo : en}</Text><Text style={styles.key}>{label}</Text></View>;
          })}
          {!edit && <View style={styles.row}><Text style={styles.label}>{ko ? "목록 선택·닫기" : "Select or close a list"}</Text><Text style={styles.key}>↑ ↓ ← → · Enter · Esc</Text></View>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, padding: 16, justifyContent: "center", alignItems: "center", backgroundColor: "#0008" },
  card: { width: "100%", maxWidth: 520, height: "86%", borderRadius: 14, backgroundColor: "#fffdf8", padding: 16 },
  header: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 17, fontWeight: "700", flexShrink: 1, color: "#332a20" },
  button: { minHeight: 40, paddingHorizontal: 10, justifyContent: "center", backgroundColor: "#eee6d9", borderRadius: 8, alignSelf: "flex-start" },
  hint: { paddingVertical: 7, fontSize: 12, color: "#5b5145" },
  error: { paddingVertical: 7, color: "#943b2b" },
  list: { flex: 1, minHeight: 0 },
  row: { minHeight: 42, paddingHorizontal: 6, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#cfc2b0", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "space-between" },
  selected: { backgroundColor: "#f1e6d4" },
  label: { color: "#3e352b", flex: 1 },
  key: { fontSize: 12, color: "#59432e", fontWeight: "700" },
});

import React, { useEffect, useSyncExternalStore } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { cancelWebAlert, getWebAlert, resolveWebAlert, subscribeWebAlert } from "@/lib/alert";

/** In-app dialogs work in embedded browsers too, without window.alert/prompt. */
export function WebAlertHost() {
  const request = useSyncExternalStore(subscribeWebAlert, getWebAlert, () => null);
  const { colors: C } = useTheme();
  useEffect(() => {
    if (Platform.OS !== "web") return;
    // RN Web closes the underlying Modal on keyup. Keep this listener alive
    // after keydown dismisses the alert so one Escape cannot close two layers.
    let awaitingEscapeRelease = false;
    const keydown = (event: KeyboardEvent) => {
      const active = getWebAlert();
      if (!active && !(awaitingEscapeRelease && event.key === "Escape")) return;
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        awaitingEscapeRelease = true;
        if (active) cancelWebAlert(active.id);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (!getWebAlert() && !(awaitingEscapeRelease && event.key === "Escape")) return;
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        awaitingEscapeRelease = false;
      }
    };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
    };
  }, []);
  if (Platform.OS !== "web" || !request) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => cancelWebAlert(request.id)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => cancelWebAlert(request.id)}
          accessibilityLabel="Close dialog" testID="web-alert-backdrop" />
        <View testID="web-alert" accessibilityViewIsModal accessibilityRole="alert"
          style={[styles.card, { backgroundColor: C.background, borderColor: C.border }]}>
          {!!request.title && <Text style={[styles.title, { color: C.text }]}>{request.title}</Text>}
          <ScrollView style={styles.body} contentContainerStyle={styles.content}>
            {!!request.message && <Text style={[styles.message, { color: C.text }]}>{request.message}</Text>}
            {request.buttons.map((button, index) => (
              <Pressable key={`${request.id}-${index}`} accessibilityRole="button"
                testID={`web-alert-action-${index}`}
                onPress={() => resolveWebAlert(request.id, index)}
                style={[styles.button, { borderColor: C.border }]}>
                <Text style={[styles.buttonText, {
                  color: button.style === "destructive" ? C.danger : button.style === "cancel" ? C.text : C.accent,
                }]}>{button.text || "OK"}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.65)" },
  card: { width: "100%", maxWidth: 440, maxHeight: "85%", borderWidth: 1, borderRadius: 16, padding: 20 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 12 },
  body: { flexShrink: 1, minHeight: 0 },
  content: { gap: 10 },
  message: { fontSize: 15, lineHeight: 23, marginBottom: 8 },
  button: { borderWidth: 1, borderRadius: 9, padding: 13, minHeight: 44 },
  buttonText: { fontSize: 15, fontWeight: "500", textAlign: "center" },
});